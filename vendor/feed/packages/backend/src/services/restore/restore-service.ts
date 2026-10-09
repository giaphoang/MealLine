// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { PrismaClient } from '@prisma/client';
import { existsSync, mkdirSync, rmSync, renameSync } from 'fs';
import { dirname, join, resolve } from 'path';

import prisma from '../../db';
import { MaintenanceMode } from './maintenance-mode';
import { RESTORE_CLEARED_TABLES, RESTORE_NULLED_REFERENCES } from '../backup/table-contract';
import { dependencyOrder } from './dependency-order';
import {
  mergeMonotonicLottoHistory,
  MONOTONIC_LOTTO_TABLES,
} from './monotonic-lotto-history';
import { closeSelection, tablesFor, type UnitId } from './restore-units';
import { ACCESS_STATES, ROLES, normalizeEmail } from '../auth/authorization';
import { DEVELOPER_EMAIL } from '../auth/development-login';
import { assertBasketInventoryIdentity } from '../nourish/restore-validation';

/**
 * Restore by **building a new database and swapping it in**, never by mutating
 * the live one.
 *
 * A single interactive transaction cannot do this: the largest procurement
 * import already lands near 18s against the 30s ceiling in `db.ts`, and a full
 * restore is an order of magnitude larger. Raising the ceiling would mean
 * holding a multi-minute write lock and, if it failed at minute four, having
 * blocked the pantry for nothing.
 *
 * ## How the new file is built
 *
 * The design called for `migrate deploy` against an empty file. This uses
 * `VACUUM INTO` to take a consistent copy of the live database instead, which
 * reaches the same place with fewer moving parts:
 *
 * - the schema is necessarily current, because it *is* the live schema — no
 *   dependency on the Prisma CLI being present and no second migration run;
 * - everything a partial restore is not replacing is already there, correct,
 *   and consistent, rather than needing a carry-across pass per table;
 * - `VACUUM INTO` is WAL-safe by construction: it writes a clean database with
 *   no sidecar journals, so there is no window where the copy disagrees with
 *   the source.
 *
 * Only the selected units are then cleared and repopulated from the artifact.
 *
 * ## Why the live file is safe
 *
 * Nothing touches `production.db` until a single `rename(2)`, which is atomic
 * on the same filesystem — and the scratch file is deliberately placed beside
 * it on the same bind mount so that guarantee holds. Rollback is renaming the
 * pre-swap snapshot back.
 */

/**
 * Exit code used to hand the process back to its supervisor for a restart.
 *
 * 75 is EX_TEMPFAIL — "temporary failure, the user is invited to retry" — which
 * is as close as the sysexits list gets to "going away on purpose, expecting to
 * come back". Docker restarts on any code, so this is for the logs, not for the
 * supervisor.
 *
 * **It does not make `npm run dev` recover.** `ts-node-dev --respawn` means
 * "keep watching for changes after the script exits", not "restart when it
 * exits" — it waits for a file to change. Measured, after a false start: the
 * dev backend stayed down following a reset at exit 0, appeared to be fixed by
 * a non-zero code, and then stayed down again at 75 when no file had been
 * edited. The earlier recovery was the file edit tripping the watcher, not the
 * exit code.
 */
export const RESTART_EXIT_CODE = 75;

/** Deleting children before parents; inserting parents before children. */
/**
 * Children before parents. The reverse of the write order, which is derived
 * from the foreign-key graph rather than from the contract's listing order —
 * see `dependency-order.ts` for why that distinction cost a restore.
 */
const deletionOrder = (tables: string[]): string[] => [...dependencyOrder(tables)].reverse();

export interface RestorePlan {
  units: UnitId[];
  tables: string[];
}

export interface RestoreOutcome {
  restoredTables: string[];
  rowsWritten: Record<string, number>;
  snapshotPath: string;
  /** Set when the caller should exit the process to complete the swap. */
  swapped: boolean;
}

/**
 * Resolve the live database file from DATABASE_URL.
 *
 * The URL is `file:` plus a path that Prisma resolves relative to
 * `prisma/schema.prisma`, not to the process cwd — getting this wrong would put
 * the scratch file on a different filesystem and silently cost us `rename`'s
 * atomicity, so it is derived once, here.
 */
export const resolveDatabasePath = (): string => {
  const url = process.env.DATABASE_URL ?? '';
  const raw = url.replace(/^file:/, '');
  if (!raw) throw new Error('DATABASE_URL is not set; cannot locate the database file.');
  if (raw.startsWith('/')) return raw;
  return resolve(join(__dirname, '../../../prisma'), raw);
};

const clientFor = (path: string): PrismaClient =>
  new PrismaClient({ datasources: { db: { url: `file:${path}` } } });

const delegateFor = (client: PrismaClient, table: string) => {
  const key = table.charAt(0).toLowerCase() + table.slice(1);
  return (client as unknown as Record<string, {
    deleteMany: (args?: unknown) => Promise<unknown>;
    createMany: (args: unknown) => Promise<unknown>;
    count: () => Promise<number>;
    findMany: (args?: unknown) => Promise<Record<string, unknown>[]>;
  }>)[key];
};

export const prepareRestoredUsers = (
  backupRows: unknown[],
  liveRows: Record<string, unknown>[],
  actor: string
): Record<string, unknown>[] => {
  const actorEmail = actor.includes('@') ? normalizeEmail(actor) : null;
  const byEmail = new Map<string, Record<string, unknown>>();

  for (const value of backupRows) {
    const row = value as Record<string, unknown>;
    const email = typeof row.email === 'string' ? normalizeEmail(row.email) : '';
    if (!email || byEmail.has(email)) {
      throw new Error('Staff roster restore conflict: the backup contains a missing or duplicate email address.');
    }
    byEmail.set(email, { ...row, email, role: ROLES.STAFF });
  }

  if (actorEmail) {
    const liveActor = liveRows.find(row =>
      typeof row.email === 'string' && normalizeEmail(row.email) === actorEmail
    );
    const restoredActor = byEmail.get(actorEmail);
    if (restoredActor || liveActor) {
      byEmail.set(actorEmail, {
        ...(restoredActor ?? liveActor),
        ...(liveActor?.id ? { id: liveActor.id } : {}),
        email: actorEmail,
        // A developer initiating restore keeps scoped session authority, never
        // a persistent administrator role that could weaken production guards.
        role: actorEmail === DEVELOPER_EMAIL ? ROLES.STAFF : ROLES.ADMINISTRATOR,
        accessState: ACCESS_STATES.ALLOWED,
      });
    }
  }

  return [...byEmail.values()];
};

export class RestoreService {
  /**
   * Build the replacement database and swap it in.
   *
   * Returns only if the swap did **not** happen; on success the caller exits so
   * that `restart: unless-stopped` brings the app back against the new file.
   */
  static async run(options: {
    data: Record<string, unknown[]>;
    units: UnitId[];
    /** Label for the audit trail and the maintenance-mode message. */
    actor: string;
    reason: string;
    /** Injected in tests so the suite never calls process.exit. */
    exit?: (code: number) => void;
  }): Promise<RestoreOutcome> {
    const { data } = options;
    // Close the selection here rather than trusting the caller. The route
    // already does it, which is exactly why nothing noticed that the service
    // did not: given an unclosed set it silently restores a child without its
    // parent and aborts on a foreign key, or worse, succeeds with a gap.
    // Closing an already-closed selection is a no-op, so this costs nothing
    // and removes a way to hold the API wrong.
    const { units } = closeSelection(options.units);
    // Older artifact readers deliberately leave tables that did not exist in
    // that contract absent. Preserve those destination tables instead of
    // treating absence as an empty section and deleting newer organization
    // data. A current artifact always includes every table, including explicit
    // empty arrays, so current-format restores retain replace-not-merge
    // semantics.
    const tables = tablesFor(units).filter(table => table in data);
    const rowsWritten: Record<string, number> = {};

    const { snapshotPath } = await buildAndSwap(
      async scratch => {
        const restoreData: Record<string, unknown[]> = { ...data };
        // Receipts contain private command results and semantic references to
        // household state. VACUUM INTO carries them across even though they
        // are excluded from artifacts. They must not answer against old state
        // after any MealLine unit is replaced.
        if (tablesFor(['nourish']).some(table => tables.includes(table))) {
          await scratch.nourishAgentReceipt.deleteMany({});
        }
        if (tables.includes('NourishClient')) {
          const verificationEpoch = new Date().toISOString();
          restoreData.NourishClient = (restoreData.NourishClient ?? []).map(value => ({
            ...(value as Record<string, unknown>), phoneVerifiedAt: null, updatedAt: verificationEpoch,
          }));
        }

        // MealLine stores basket lines as JSON snapshots, not FK rows. A partial
        // restore may replace either inventory or baskets, but must never make
        // a pending basket deduct another food's stock merely because IDs match.
        if (tables.includes('FoodItem') || tables.includes('NourishBasket')) {
          const liveFoods = await delegateFor(scratch, 'FoodItem').findMany();
          const replacingBaskets = tables.includes('NourishBasket');
          const baskets = replacingBaskets
            ? restoreData.NourishBasket
            : await delegateFor(scratch, 'NourishBasket').findMany();
          assertBasketInventoryIdentity(
            baskets ?? [],
            replacingBaskets ? (restoreData.FoodItem ?? []) : liveFoods,
            tables.includes('FoodItem') ? (restoreData.FoodItem ?? []) : liveFoods
          );
        }

        // LOTTO retains only a rolling source window; FEED is the historical
        // record. Preserve the union of the artifact and every immutable LOTTO
        // fact already in the destination before replacing the Service unit.
        // The live connection and cursor are excluded from `tables`, so the
        // scratch copy carries them across untouched.
        if (units.includes('service')) {
          const liveLottoData: Record<string, unknown[]> = {
            ServiceImport: await delegateFor(scratch, 'ServiceImport').findMany(),
          };
          for (const table of MONOTONIC_LOTTO_TABLES) {
            liveLottoData[table] = await delegateFor(scratch, table).findMany();
          }
          Object.assign(
            restoreData,
            mergeMonotonicLottoHistory(restoreData, liveLottoData)
          );
        }

        // The artifact never carries role. Every restored account starts as
        // Staff; only the already-authenticated administrator running this
        // in-app restore keeps Administrator and their current database id, so
        // the JWT that initiated the operation remains valid after restart.
        if (units.includes('staffRoster')) {
          const liveUsers = await delegateFor(scratch, 'User').findMany();
          restoreData.User = prepareRestoredUsers(
            restoreData.User ?? [],
            liveUsers,
            options.actor
          );
        }

        // Replace, never merge — within the selected units only, except for
        // the explicit monotonic LOTTO-history union above.
        //
        // Merging would have to reconcile two autoincrement id-spaces:
        // FoodItemTranslation and the inventory events reference FoodItem and
        // Category by id, so a name-based merge must rewrite every incoming
        // foreign key. Getting that wrong binds a translation to the wrong food
        // item — invisible on screen, and it survives physical reconciliation
        // because staff verify stock, not foreign keys.
        // Clear excluded tables that point INTO what is about to be replaced,
        // before deleting their parents. The scratch database is a copy of the
        // live one, so these rows survive the copy still referencing rows this
        // restore deletes — and with foreign keys enforced, that aborts the
        // whole restore. See RESTORE_CLEARED_TABLES for why each one is safe to
        // clear rather than preserve.
        const replaced = new Set(tables);
        for (const [table, rule] of Object.entries(RESTORE_CLEARED_TABLES)) {
          if (rule.references.some(parent => replaced.has(parent))) {
            await delegateFor(scratch, table).deleteMany({});
          }
        }

        for (const table of deletionOrder(tables)) {
          await delegateFor(scratch, table).deleteMany({});
        }

        // Blank references the artifact cannot resolve. A foreign key whose
        // parent is excluded from every backup has no unit to come from, so
        // on a fresh instance the parent row simply is not there and the
        // insert below would abort the restore -- the failure that makes
        // disaster recovery, the one thing a backup is for, the one thing it
        // could not do. See RESTORE_NULLED_REFERENCES.
        //
        // Only ids the destination genuinely lacks are blanked, not the
        // column wholesale: restoring onto the instance the backup came from
        // keeps every link that still resolves, which is the difference
        // between undoing a mistake and quietly losing 112 associations.
        for (const [table, rule] of Object.entries(RESTORE_NULLED_REFERENCES)) {
          if (!tables.includes(table)) continue;
          const rows = restoreData[table] as Record<string, unknown>[] | undefined;
          if (!rows?.length) continue;

          const parentIds = new Set(
            (await delegateFor(scratch, rule.parent).findMany()).map(row => row.id)
          );
          restoreData[table] = rows.map(row => {
            const unresolved = rule.columns.filter(
              column => row[column] != null && !parentIds.has(row[column])
            );
            // Leave the row object alone unless it actually changes, so the
            // caller's parsed artifact is never mutated underneath it.
            return unresolved.length
              ? { ...row, ...Object.fromEntries(unresolved.map(column => [column, null])) }
              : row;
          });
        }

        // A restored AI model configuration has no API key -- the artifact
        // carries the administrator's settings and never the secret -- so it
        // must not arrive switched on. The route guard refuses to activate a
        // keyless configuration; this makes the data at rest agree with that
        // rule instead of relying on nobody having written the row directly.
        // Prompts are unaffected: they hold no credential, so their active
        // state is meaningful and is restored as backed up.
        const aiConfigurations = restoreData.AIConfiguration as
          | Record<string, unknown>[]
          | undefined;
        if (tables.includes('AIConfiguration') && aiConfigurations?.length) {
          restoreData.AIConfiguration = aiConfigurations.map(row =>
            row.type === 'apikey' && !row.encryptedApiKey
              ? { ...row, isActive: false }
              : row
          );
        }

        for (const table of dependencyOrder(tables)) {
          const rows = restoreData[table] ?? [];
          if (rows.length) {
            // createMany rather than a create per row: this is a bulk load into
            // a file nobody is reading yet.
            await delegateFor(scratch, table).createMany({ data: rows });
          }
          rowsWritten[table] = rows.length;
        }

        // Verify the new file says what the artifact said before trusting it.
        for (const table of tables) {
          const actual = await delegateFor(scratch, table).count();
          if (actual !== rowsWritten[table]) {
            throw new Error(
              `Restore verification failed: ${table} holds ${actual} rows, expected ${rowsWritten[table]}. ` +
                'The live database has not been touched.'
            );
          }
        }
      },
      options
    );

    return { restoredTables: tables, rowsWritten, snapshotPath, swapped: true };
  }
}

/**
 * The dangerous sequence, in one place.
 *
 * Restore and clean slate differ only in how they populate the scratch
 * database; everything around that — the consistent copy, foreign-key
 * verification, the pre-swap snapshot, maintenance mode, the WAL checkpoint,
 * the rename, and the exit — is identical and must not be reimplemented twice.
 * Sharing it means the parts that can destroy data are exercised by both
 * features and only have to be proven once.
 *
 * `mutate` receives a client bound to the scratch file. It may take as long as
 * it needs: nothing is live, so there is no transaction clock and no lock on
 * the pantry.
 */
export const buildAndSwap = async (
  mutate: (scratch: PrismaClient) => Promise<void>,
  options: {
    actor: string;
    reason: string;
    exit?: (code: number) => void;
  }
): Promise<{ snapshotPath: string }> => {
  const { actor, reason } = options;
  const livePath = resolveDatabasePath();
  const dir = dirname(livePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const scratchPath = join(dir, `rebuild-${stamp}.db`);
  const snapshotPath = join(dir, `pre-change-${stamp}.db`);

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  {
    // 1. Consistent copy of the live database. Nothing is live in it, so from
    //    here until the swap there is no clock and no lock on the pantry.
    await prisma.$executeRawUnsafe(`VACUUM INTO '${scratchPath.replace(/'/g, "''")}'`);

    const scratch = clientFor(scratchPath);

    try {
      // 2. Whatever this operation actually does — import an artifact, or wipe
      //    and seed. Nothing here is live yet.
      await mutate(scratch);

      // 3. Referential integrity, checked before the file is trusted. This
      //    catches a partial selection that left rows pointing at rows that
      //    were never written.
      await scratch.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
      const violations = await scratch.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check;');
      if (Array.isArray(violations) && violations.length) {
        throw new Error(
          `Restore verification failed: the rebuilt database has ${violations.length} broken ` +
            'reference(s). The live database has not been touched.'
        );
      }
    } catch (error) {
      await scratch.$disconnect().catch(() => undefined);
      rmSync(scratchPath, { force: true });
      throw error;
    }

    await scratch.$disconnect();

    // 4. Snapshot the live database before replacing it. This is the rollback,
    //    and it matters most for clean slate, where there is no artifact to
    //    recover from if someone chose it by mistake.
    await prisma.$executeRawUnsafe(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);

    // 5. Stop writes, then let go of the file.
    MaintenanceMode.enter(reason, actor);

    try {
      // `$queryRawUnsafe`, not `$executeRawUnsafe`: wal_checkpoint returns a
      // row, and Prisma rejects that result shape from the execute path with
      // "Execute returned results, which is not allowed in SQLite" — the same
      // trap as the PRAGMAs in db.ts and database-summary.ts.
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
      await prisma.$disconnect();

      // Stale sidecars would leave SQLite reading a journal that disagrees with
      // the database it is now paired with. This step is not optional.
      rmSync(`${livePath}-wal`, { force: true });
      rmSync(`${livePath}-shm`, { force: true });

      // 6. One syscall. Before it, the live database is untouched; after it,
      //    the swap is complete.
      renameSync(scratchPath, livePath);
    } catch (error) {
      // Anything failing between entering maintenance and the rename leaves the
      // live database untouched, so the instance is still usable — it must not
      // be left refusing writes, and the half-built file must not be left
      // behind to be mistaken for a snapshot.
      MaintenanceMode.exit();
      rmSync(scratchPath, { force: true });
      throw error;
    }

    const exit = options.exit ?? ((code: number) => process.exit(code));

    // 7. Exit so the supervisor restarts the process against the new file.
    //    `restart: unless-stopped` is already set on every service, so this
    //    needs no Docker socket, no privileged access, and no host agent.
    //
    //    In development this leaves the backend down: `ts-node-dev --respawn`
    //    waits for a file change rather than restarting on exit, whatever the
    //    code. Restart `npm run dev`, or touch a source file, after a restore
    //    or reset. Production is unaffected — see RESTART_EXIT_CODE.
    setTimeout(() => exit(RESTART_EXIT_CODE), 250);

    return { snapshotPath };
  }
};
