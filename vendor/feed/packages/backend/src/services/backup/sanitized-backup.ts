// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as crypto from 'crypto';
import { readdirSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../../db';
import {
  ARTIFACT_KIND,
  BACKUP_QUERY_ARGS,
  EXCLUDED_TABLES,
  INCLUDED_TABLES,
  REDACTED_COLUMNS,
  TABLE_CONTRACT_VERSION,
  type IncludedTable,
} from './table-contract';

/**
 * Produces the sanitized logical backup described in
 * docs/data-management/backup-and-restore.md.
 *
 * This is the safe half of the beta.6 work: it reads, it writes nothing, and a
 * defect here cannot destroy data. It also fixes the artifact format that a
 * future restore has to validate against, which is why the manifest carries
 * more than the payload strictly needs.
 */

export interface BackupManifest {
  artifact: typeof ARTIFACT_KIND;
  /** Shape of `data`. Bumped when tables are added, removed, or restructured. */
  tableContractVersion: number;
  /** The FEED build that produced it. Informational — not a compatibility key. */
  feedVersion: string;
  /**
   * The latest applied migration — provenance and diagnostics, NOT the
   * compatibility gate. `tableContractVersion` above is what restore keys on.
   * Most migrations do not touch exported tables (beta.5 and beta.6 added
   * none), so refusing on a migration-name mismatch would reject valid
   * artifacts and teach people to bypass the check.
   * See docs/data-management/beta-6-backup-restore-brief.md, "Version contract".
   */
  schemaVersion: string;
  generatedAt: string;
  generatedBy: string;
  /** Row counts per included table, so a reader can sanity-check before importing. */
  rowCounts: Record<string, number>;
  /** Table → why it was left out. Carried in the artifact so the file is self-describing. */
  excluded: Record<string, string>;
  /** Table → columns stripped from otherwise-exported rows. */
  redacted: Record<string, readonly string[]>;
  /** SHA-256 over the canonical JSON of `data`. */
  checksum: string;
}

export interface SanitizedBackup {
  manifest: BackupManifest;
  data: Record<string, unknown[]>;
}

/**
 * Prisma's delegate names are the model name with a lowercased first character.
 * Derived rather than hand-maintained so the contract list stays the single
 * place a table is named.
 */
const delegateFor = (table: IncludedTable) => {
  const key = table.charAt(0).toLowerCase() + table.slice(1);
  const delegate = (prisma as unknown as Record<string, { findMany: (args?: object) => Promise<unknown[]> }>)[key];

  if (!delegate?.findMany) {
    throw new Error(
      `Backup contract names table "${table}", but no Prisma delegate "${key}" exists. ` +
        'The contract and the schema have diverged.'
    );
  }

  return delegate;
};

/**
 * The migration folder name of the most recently applied migration.
 *
 * Read from `_prisma_migrations` rather than the filesystem, because what
 * matters is what this *database* has applied, not what this build ships.
 */
const readSchemaVersion = async (): Promise<string> => {
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>(
      Prisma.sql`SELECT migration_name FROM _prisma_migrations
                 WHERE finished_at IS NOT NULL
                 ORDER BY finished_at DESC LIMIT 1`
    );
    if (rows[0]?.migration_name) return rows[0].migration_name;
  } catch {
    // A database built by applying migration SQL directly (as the test
    // fixtures do) has no _prisma_migrations table. Fall through.
  }

  // Best effort: the newest migration this build carries.
  try {
    const dir = join(__dirname, '../../../prisma/migrations');
    const names = readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
    return names[names.length - 1] ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

/**
 * Strip redacted columns before anything sees the row.
 *
 * Deletes rather than nulls the field: a `null` where a secret used to be still
 * describes the schema, and a reader that finds no key at all cannot mistake an
 * empty string for one. The restore path treats a missing key the same as a
 * configuration that never had one.
 */
const redact = (table: string, rows: unknown[]): unknown[] => {
  const columns = REDACTED_COLUMNS[table];
  if (!columns?.length && !['NourishPhoneCall','NourishIntake'].includes(table)) return rows;

  return rows.map(row => {
    const copy = { ...(row as Record<string, unknown>) };
    for (const column of columns ?? []) delete copy[column];
    if ((table === 'NourishPhoneCall' && new Date(String(copy.expiresAt)).getTime() <= Date.now())
      || (table === 'NourishIntake' && copy.clientId && new Date(String(copy.createdAt)).getTime() < Date.now()-30*86400000)) copy.transcript=[];
    return copy;
  });
};

/**
 * Stable stringify: key order must not depend on the order Prisma happened to
 * return columns, or the checksum would change between runs over identical
 * data and be worthless as an integrity check.
 */
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
};

export const checksumOf = (data: Record<string, unknown[]>): string =>
  crypto.createHash('sha256').update(JSON.stringify(canonicalize(data))).digest('hex');

export class SanitizedBackupService {
  /**
   * Build the artifact.
   *
   * Read inside a transaction so the export is a consistent snapshot: without
   * it, an import landing mid-export could put procurement lines in the file
   * whose parent order is not, and the artifact would be quietly incoherent.
   */
  static async create(generatedBy: string): Promise<SanitizedBackup> {
    const data: Record<string, unknown[]> = {};

    await prisma.$transaction(async () => {
      for (const table of INCLUDED_TABLES) {
        data[table] = redact(table, await delegateFor(table).findMany(BACKUP_QUERY_ARGS[table]));
      }
    });

    const rowCounts = Object.fromEntries(
      Object.entries(data).map(([table, rows]) => [table, rows.length])
    );

    return {
      manifest: {
        artifact: ARTIFACT_KIND,
        tableContractVersion: TABLE_CONTRACT_VERSION,
        feedVersion: process.env.npm_package_version ?? readPackageVersion(),
        schemaVersion: await readSchemaVersion(),
        generatedAt: new Date().toISOString(),
        generatedBy,
        rowCounts,
        excluded: EXCLUDED_TABLES,
        redacted: REDACTED_COLUMNS,
        checksum: checksumOf(data),
      },
      data,
    };
  }

  /** A stable, sortable filename. Colons are illegal on some filesystems. */
  static filename(generatedAt: string): string {
    const stamp = generatedAt.slice(0, 19).replace(/[:T]/g, '-');
    return `feed-backup-${stamp}.json`;
  }
}

const readPackageVersion = (): string => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../../package.json').version ?? 'unknown';
  } catch {
    return 'unknown';
  }
};
