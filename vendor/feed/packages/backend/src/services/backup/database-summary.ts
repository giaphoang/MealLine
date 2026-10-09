// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import prisma from '../../db';
import { AUDIT_ACTIONS } from '../auth/authorization';
import { BACKUP_QUERY_ARGS, INCLUDED_TABLES } from './table-contract';

/**
 * What the database currently holds.
 *
 * Counted over `INCLUDED_TABLES` — the same contract the backup exports — so
 * the figures on the Database tab describe exactly what a backup would contain.
 * A summary drawn from a different list would eventually disagree with the
 * artifact and be worse than no summary at all.
 */

export interface DatabaseSummary {
  /** Row count per included table. Grouped and labelled by the client. */
  rowCounts: Record<string, number>;
  totalRecords: number;
  /** SQLite file size in bytes, or null if the pragmas are unavailable. */
  sizeBytes: number | null;
  lastBackupAt: string | null;
  lastBackupBy: string | null;
}

const delegateFor = (table: string) => {
  const key = table.charAt(0).toLowerCase() + table.slice(1);
  return (prisma as unknown as Record<string, { count: (args?: object) => Promise<number> }>)[key];
};

/**
 * File size from SQLite's own page accounting rather than `fs.stat`, because
 * the path in DATABASE_URL is relative to the Prisma schema and resolving it
 * from application code would duplicate that rule. WAL means the reported size
 * can lag the checkpointed file slightly; it is an indication of scale, not an
 * audit figure.
 */
const toNumber = (value: unknown): number | null => {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return null;
};

const readSizeBytes = async (): Promise<number | null> => {
  try {
    // `$queryRawUnsafe`, matching db.ts: a PRAGMA cannot be sent as a
    // parameterised prepared statement, so the tagged-template form returns
    // nothing. There is no injection surface — these are two fixed literals.
    const [pages, size] = await Promise.all([
      prisma.$queryRawUnsafe<{ page_count: unknown }[]>('PRAGMA page_count;'),
      prisma.$queryRawUnsafe<{ page_size: unknown }[]>('PRAGMA page_size;'),
    ]);

    // Prisma returns SQLite integers from raw queries as BigInt, so a
    // `typeof === 'number'` guard silently rejects perfectly good values and
    // the size renders as unavailable. Both fit in a Number comfortably — a
    // page count large enough to lose precision would be a petabyte database.
    const pageCount = toNumber(pages[0]?.page_count);
    const pageSize = toNumber(size[0]?.page_size);

    if (pageCount !== null && pageSize !== null) {
      return pageCount * pageSize;
    }
  } catch {
    // Not fatal: the rest of the summary is still worth showing.
  }
  return null;
};

export class DatabaseSummaryService {
  static async get(): Promise<DatabaseSummary> {
    const counts = await Promise.all(
      INCLUDED_TABLES.map(async table => {
        const delegate = delegateFor(table);
        return [table, delegate ? await delegate.count(BACKUP_QUERY_ARGS[table]) : 0] as const;
      })
    );

    const rowCounts = Object.fromEntries(counts);
    const totalRecords = counts.reduce((sum, [, count]) => sum + count, 0);

    const lastBackup = await prisma.adminAuditLog.findFirst({
      where: { action: AUDIT_ACTIONS.BACKUP_DOWNLOADED },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, actorLabel: true },
    });

    return {
      rowCounts,
      totalRecords,
      sizeBytes: await readSizeBytes(),
      lastBackupAt: lastBackup?.createdAt.toISOString() ?? null,
      lastBackupBy: lastBackup?.actorLabel ?? null,
    };
  }
}
