// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Measures where time actually goes during a unified OFB import.
 *
 * Motivation: a five-year import that succeeds on a developer Mac fails on
 * the production Raspberry Pi. The two machines run identical code against
 * identical data, so the difference is per-query latency, not logic — but
 * that was a hypothesis, and this script exists to replace it with numbers.
 *
 * It separates the two phases that get conflated when you only watch a
 * spinner:
 *   - parse:  CPU-bound, synchronous, no database involved
 *   - import: the transaction, dominated by round-trips to SQLite
 *
 * and counts every query the import issues, because query *count* is the
 * property that turns a fast disk into a slow one. Latency is hardware;
 * count is our code. Only one of those is worth fixing.
 *
 * Runs against a scratch database, never a real one. Reads real exports
 * from the private-data directory by absolute path — that data is
 * deliberately kept outside this repository and must never be copied in.
 *
 * Usage:
 *   FEED_PRIVATE_DATA_DIR=/path/to/private-data/docs/reports/RealData \
 *     npx ts-node scripts/benchmark-procurement-import.ts
 *
 *   # or a specific file
 *   npx ts-node scripts/benchmark-procurement-import.ts --file=/abs/path.csv
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { parseUnifiedOfbCsv, importUnifiedOfbCsv } from '../src/services/procurement/unified';
import { rollbackProcurementImports } from '../src/services/procurement';

interface PhaseTiming {
  label: string;
  ms: number;
  queries: number;
}

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

/** Default corpus, largest first — the largest file is the one that fails in production. */
const DEFAULT_SAMPLES = [
  'UnifiedData/OFB_Export_2009-01-01_to_2019-12-31.csv',
  'UnifiedData/OFB_Export_2020-01-01_to_2025-01-01.csv',
  'UnifiedData/OFB_Export_2025-01-01_to_2026-07-22.csv',
  'UnifiedData/OFB_Export_2026-06-01_to_2026-07-22.csv',
];

const resolveSamples = (): string[] => {
  const explicit = arg('file');
  if (explicit) return [explicit];

  const root = process.env.FEED_PRIVATE_DATA_DIR;
  if (!root) {
    console.error(
      'Set FEED_PRIVATE_DATA_DIR to the private-data RealData directory, or pass --file=/abs/path.csv'
    );
    process.exit(1);
  }
  return DEFAULT_SAMPLES.map((rel) => path.resolve(root, rel)).filter(existsSync);
};

/**
 * A scratch SQLite database with the real schema applied. Uses `migrate
 * deploy` rather than `db push` so the benchmark exercises the same schema
 * production runs, including indexes — index coverage is exactly what
 * decides whether a lookup inside the import loop is cheap or linear.
 */
const createScratchDatabase = (): { url: string; dir: string } => {
  const dir = mkdtempSync(path.join(tmpdir(), 'feed-import-bench-'));
  const url = `file:${path.join(dir, 'bench.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  return { url, dir };
};

const fmt = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`;

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(0)}MB`;

/**
 * Samples resident set size on an interval.
 *
 * The upload cap is bounded by RAM on the Pi, not disk: the file is buffered
 * whole and parsed into objects several times its size. Recording peak RSS is
 * what lets the new cap be a measured number rather than a guess.
 */
const trackPeakRss = (): { peak: () => number; stop: () => void } => {
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peak) peak = rss;
  }, 50);
  timer.unref();
  return { peak: () => peak, stop: () => clearInterval(timer) };
};

const run = async (): Promise<void> => {
  const samples = resolveSamples();
  if (samples.length === 0) {
    console.error('No sample files found.');
    process.exit(1);
  }

  console.log('\nFEED procurement import benchmark');
  console.log('='.repeat(78));

  for (const file of samples) {
    const buffer = readFileSync(file);
    const { url, dir } = createScratchDatabase();

    // `query` events give an exact count of round-trips to the engine —
    // the number this whole exercise is about.
    const prisma = new PrismaClient({
      datasources: { db: { url } },
      log: [{ emit: 'event', level: 'query' }],
      // Deliberately generous: the production client caps interactive
      // transactions at 20s, which is the ceiling under investigation. A
      // benchmark that inherited it would abort mid-measurement and tell us
      // nothing about how long the work actually takes.
      transactionOptions: { maxWait: 120_000, timeout: 600_000 },
    });

    let queries = 0;
    (prisma as unknown as { $on: (e: string, cb: () => void) => void })
      .$on('query', () => { queries += 1; });

    const phases: PhaseTiming[] = [];
    const rss = trackPeakRss();
    const rssBaseline = process.memoryUsage().rss;

    const parseStart = performance.now();
    const parsed = parseUnifiedOfbCsv(buffer);
    const parseMs = performance.now() - parseStart;
    phases.push({ label: 'parse (CPU, no DB)', ms: parseMs, queries: 0 });

    const before = queries;
    const importStart = performance.now();
    const result = await importUnifiedOfbCsv(buffer, 'benchmark@local', prisma);
    const importMs = performance.now() - importStart;
    phases.push({ label: 'import (transaction)', ms: importMs, queries: queries - before });

    // "Undo Import" runs over every order the import touched, so it is the
    // same shape of work and was the same shape of bug.
    const importIds = [result.warehouse?.importId, result.freshAlliance?.importId]
      .filter((id): id is number => typeof id === 'number');
    if (importIds.length > 0) {
      const rollbackBefore = queries;
      const rollbackStart = performance.now();
      await rollbackProcurementImports(importIds, 'benchmark@local', prisma);
      phases.push({
        label: 'rollback (undo)',
        ms: performance.now() - rollbackStart,
        queries: queries - rollbackBefore,
      });
    }

    const warehouseOrders = parsed.warehouse?.orders.length ?? 0;
    const pickups = parsed.freshAlliance?.pickups.length ?? 0;
    const units = warehouseOrders + pickups;

    console.log(`\n${path.basename(file)}`);
    console.log('-'.repeat(78));
    console.log(
      `  rows ${parsed.rowCount}   warehouse orders ${warehouseOrders}   ` +
      `pickups ${pickups}   outcome ${result.outcome}`
    );
    const totalMs = phases.reduce((sum, phase) => sum + phase.ms, 0);
    for (const phase of phases) {
      const share = ((phase.ms / totalMs) * 100).toFixed(0);
      console.log(
        `  ${phase.label.padEnd(22)} ${fmt(phase.ms).padStart(8)}  ` +
        `${String(share).padStart(3)}%   queries ${phase.queries}`
      );
    }

    const total = totalMs;
    const importQueries = phases[1].queries;
    const perUnit = units > 0 ? (importQueries / units).toFixed(1) : 'n/a';
    console.log(`  ${'total'.padEnd(22)} ${fmt(total).padStart(8)}`);
    console.log(`  queries per order/pickup: ${perUnit}`);

    rss.stop();
    console.log(
      `  peak RSS ${mb(rss.peak())} (baseline ${mb(rssBaseline)}, ` +
      `file ${mb(buffer.byteLength)}, ratio ${(rss.peak() / buffer.byteLength).toFixed(1)}x file)`
    );

    // The production ceiling is what turns "slow" into "failed". Report the
    // margin explicitly so a regression is obvious without re-deriving it.
    const PRODUCTION_TXN_TIMEOUT_MS = 20_000;
    const verdict = importMs > PRODUCTION_TXN_TIMEOUT_MS
      ? `EXCEEDS the 20s production transaction ceiling on THIS machine`
      : `within the 20s ceiling here — margin ${fmt(PRODUCTION_TXN_TIMEOUT_MS - importMs)}`;
    console.log(`  ${verdict}`);

    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(
    'Query count is hardware-independent. Multiply it by the target device\'s\n' +
    'per-query latency to predict that device\'s import time.\n'
  );
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
