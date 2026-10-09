// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import type { PrismaClient } from '@prisma/client';

import { INCLUDED_TABLES } from '../backup/table-contract';
import { buildAndSwap } from '../restore/restore-service';
import { SeedService, type SeedSummary } from './seed-service';

/**
 * Return the instance to a seeded starting state.
 *
 * **This is not a restore, and the difference is not cosmetic.** Restore
 * *recovers* data someone wants back; reset *discards* data on purpose. Same
 * machinery, opposite intent — `buildAndSwap` is shared so the dangerous parts
 * are proven once, but every message around it has to read differently.
 *
 * The pre-swap snapshot matters more here than it does for restore: a restore
 * has an artifact to go back to if it was the wrong call, and a reset has
 * nothing except that snapshot.
 */

/**
 * What gets cleared: exactly the tables a backup covers.
 *
 * Using the same contract keeps one definition of "organization operating
 * data". Everything outside it is deliberately preserved:
 *
 * - **encryption keys**, or the instance could not read its own secrets;
 * - **the audit log**, because it is a security record — a reset must not be a
 *   way to erase the history of privileged actions, and the reset itself is
 *   recorded in it;
 * - **the sign-in policy**, because sign-in mode is authority, and resetting
 *   inventory is not a decision to change who may sign in;
 * - **documents and generated files**, whose rows point at files on disk that
 *   this operation does not delete.
 *
 * The roster is the one deliberate choice, below.
 */
/**
 * Derived data that has to go with it.
 *
 * These are *excluded* from backups — telemetry and generated output, rebuilt
 * from operation rather than restored — but three of them hold foreign keys
 * pointing into tables a reset clears:
 *
 * - `UsageRecord` → `AIConfiguration` and `Translation`
 * - `ShoppingListInstance` → `ShoppingListTemplate`
 *
 * Leaving them is not an option: SQLite enforces foreign keys here (the pragma
 * reads 1), so the wipe fails outright. Keeping them would also be wrong on the
 * merits — they are measurements of, and output from, data that no longer
 * exists. `ApiUsageLog` and `Alert` carry no such key but are the same kind of
 * thing, and a clean slate that kept yesterday's alerts about deleted items
 * would not be clean.
 *
 * `Document` and `TranslatedDocument` are deliberately **not** here. They are
 * uploads, independent of inventory, and destroying someone's files is not part
 * of resetting a pantry's data.
 *
 * **Known consequence:** deleting `ShoppingListInstance` cascades to
 * `ShoppingListPDF`, whose rows point at generated files under the storage
 * path. Those files are not deleted and become orphans on disk. They are
 * harmless and bounded, but a storage-reconciliation pass is the right place to
 * collect them rather than doing file deletion inside a database swap.
 */
const DERIVED_TABLES = [
  'UsageRecord',
  'ShoppingListInstance',
  'ApiUsageLog',
  'Alert',
] as const;

const CLEARED_TABLES = [...INCLUDED_TABLES, ...DERIVED_TABLES];

export interface CleanSlateOptions {
  /** Include the illustrative layer — example categories, items, template. */
  withExamples: boolean;
  /**
   * Clear the roster as well.
   *
   * Default false. Preserving it means an administrator resetting their own
   * instance does not lock themselves and their colleagues out of it.
   *
   * Clearing it arms the fresh-instance bootstrap ONLY on an instance that
   * also has no encryption key, which a clean slate does not remove (see
   * EXCLUDED_TABLES). On an instance that has been set up, clearing the roster
   * leaves nobody able to grant authority through the app, and the operator
   * CLI is the way back: `node dist/cli/admin.js grant --email=... --confirm`.
   * That narrowing is deliberate — see verification-service.findOrCreateUser.
   * Clearing the roster is coherent and sometimes exactly right —
   * handing a fresh instance to another agency — but it must be **chosen, not
   * discovered**, which is why it defaults off and the UI states what it does.
   */
  clearRoster: boolean;
  actor: string;
  /** Injected in tests so the suite never calls process.exit. */
  exit?: (code: number) => void;
}

export interface CleanSlateOutcome {
  seeded: SeedSummary;
  clearedTables: string[];
  rosterCleared: boolean;
  snapshotPath: string;
  swapped: boolean;
}

/** Children before parents, so foreign keys never block a delete. */
const deletionOrder = (tables: readonly string[]): string[] => [...tables].reverse();

const delegateFor = (client: PrismaClient, table: string) => {
  const key = table.charAt(0).toLowerCase() + table.slice(1);
  return (client as unknown as Record<string, { deleteMany: (args?: unknown) => Promise<unknown> }>)[
    key
  ];
};

export class CleanSlateService {
  static async run(options: CleanSlateOptions): Promise<CleanSlateOutcome> {
    const { withExamples, clearRoster, actor } = options;
    let seeded: SeedSummary | null = null;

    const { snapshotPath } = await buildAndSwap(
      async scratch => {
        // Clearing nearly every table means no single ordering satisfies every
        // foreign key — SQLite enforces them here, and chasing a valid
        // topological order by hand is both fragile and pointless when the
        // whole graph is going away. Suspend enforcement for the wipe instead.
        //
        // This is safe *because* `buildAndSwap` turns foreign keys back on and
        // runs `foreign_key_check` before the file is trusted: correctness is
        // asserted on the finished database rather than on the order it was
        // built in. Nothing is live in this file yet either way.
        await scratch.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');

        for (const table of deletionOrder(CLEARED_TABLES)) {
          await delegateFor(scratch, table).deleteMany({});
        }

        if (clearRoster) {
          // Deliberately after the operating data, and deliberately not part of
          // CLEARED_TABLES: the roster is authority, not inventory.
          await scratch.user.deleteMany({});
        }

        seeded = await SeedService.apply(scratch, { withExamples });
      },
      {
        actor,
        // Reads back in the maintenance message, so staff see "resetting",
        // never "restoring".
        reason: 'Resetting FEED to a clean slate',
        exit: options.exit,
      }
    );

    if (!seeded) throw new Error('Clean slate finished without seeding.');

    return {
      seeded,
      clearedTables: [...CLEARED_TABLES],
      rosterCleared: clearRoster,
      snapshotPath,
      swapped: true,
    };
  }
}
