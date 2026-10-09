// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { PrismaClient } from '@prisma/client';
import { translationTriggerService } from './services/translation-trigger';

const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 30000,  // 30 seconds to acquire a transaction
    // 30s, raised from 20s alongside the 10MB import cap. Measured on the
    // production Pi at ~1.8s per MB of OFB export, so a full 10MB file lands
    // near 18s — 60% of this ceiling. At the old 20s that same file would have
    // sat at 90%, close enough that an aging SD card or a busy service day
    // could push it into a P2028 abort. See
    // docs/data-management/import-throughput-evaluation-plan.md §7.
    timeout: 30000
  }
});

/**
 * Put SQLite in write-ahead logging mode.
 *
 * In the default rollback-journal mode a write transaction blocks *readers*,
 * not just other writers — so one staff member importing a file made the whole
 * app appear frozen to everyone else for the duration. WAL lets readers
 * proceed against the last committed snapshot while a write is in flight,
 * which is the difference between "an import is running" and "FEED is down".
 *
 * `busy_timeout` covers the case WAL does not: two writers still serialize, so
 * a save landing mid-import waits its turn instead of failing immediately with
 * SQLITE_BUSY. Five seconds is far longer than any write here now takes.
 *
 * Both are per-connection pragmas, so they are issued at startup. `journal_mode`
 * is persistent once set on the database file; `busy_timeout` is not, which is
 * why it is set explicitly rather than assumed.
 */
const configureSqlite = async (): Promise<void> => {
  // `$queryRaw`, not `$executeRaw`: a PRAGMA returns a row, and `$executeRaw`
  // rejects that result shape even though the pragma has already taken effect.
  // Using the wrong one still works but logs a spurious error at every boot.
  const pragmas = [
    'PRAGMA journal_mode = WAL;',
    'PRAGMA busy_timeout = 5000;',
    // The documented companion to WAL: durable across application crashes,
    // at risk only in an OS-level crash or power loss — a tradeoff already
    // accepted by running from an SD card.
    'PRAGMA synchronous = NORMAL;',
  ];

  for (const pragma of pragmas) {
    try {
      await prisma.$queryRawUnsafe(pragma);
    } catch (error) {
      // Never fatal. A database that will not take these still works; it is
      // only slower under concurrency, which beats refusing to start.
      console.error(`[db] Could not apply "${pragma}"; continuing`, error);
    }
  }

  try {
    const [mode] = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>('PRAGMA journal_mode;');
    console.log(`[db] SQLite journal_mode=${mode?.journal_mode ?? 'unknown'}`);
  } catch {
    // Reporting is a convenience; failing to read it back changes nothing.
  }
};

void configureSqlite();

// Register translation middleware
prisma.$use(async (params, next) => {
  const result = await next(params);

  const shouldTranslate = (
    params.action === 'create' || 
    params.action === 'update'
  ) && (
    params.model === 'FoodItem' ||
    params.model === 'Category'
  );

  if (shouldTranslate && result) {
    const translatableFields = {
      FoodItem: ['name'],
      Category: ['name']
    };

    const fields = translatableFields[params.model as keyof typeof translatableFields];
    
    fields.forEach(field => {
      if (result[field]) {
        translationTriggerService.queueContentTranslation(
          result.id,
          params.model as 'FoodItem' | 'Category',
          field,
          result[field]
        );
      }
    });
  }

  return result;
});

export default prisma;