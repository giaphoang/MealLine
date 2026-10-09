// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { readFileSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  DATA_IMPORT_STAGING_SWEEP_INTERVAL_MS,
  startDataImportStagingSweeper,
} from '../../../src/services/data-import/staging-sweeper';
import { DATA_IMPORT_STAGING_TTL_MS } from '../../../src/services/data-import/staging';

const silence = { onError: () => {}, onSwept: () => {} };

afterEach(() => {
  vi.useRealTimers();
});

describe('data import staging sweeper', () => {
  test('sweeps immediately so a restart collects what a previous process staged', async () => {
    const sweep = vi.fn().mockResolvedValue({ deleted: 2 });
    const swept: number[] = [];
    const sweeper = startDataImportStagingSweeper({
      sweep,
      onError: () => {},
      onSwept: (deleted) => swept.push(deleted),
    });
    await sweeper.whenIdle();
    sweeper.stop();

    expect(sweep).toHaveBeenCalledTimes(1);
    expect(swept).toEqual([2]);
  });

  test('keeps sweeping on the interval until stopped', async () => {
    vi.useFakeTimers();
    const sweep = vi.fn().mockResolvedValue({ deleted: 0 });
    const sweeper = startDataImportStagingSweeper({ sweep, intervalMs: 1_000, ...silence });
    await sweeper.whenIdle();
    expect(sweep).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(sweep).toHaveBeenCalledTimes(3);

    sweeper.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sweep).toHaveBeenCalledTimes(3);
  });

  test('a failing sweep is contained and the next pass still runs', async () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    const sweep = vi.fn()
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValue({ deleted: 1 });
    const sweeper = startDataImportStagingSweeper({
      sweep,
      intervalMs: 1_000,
      onError: (error) => errors.push(error),
      onSwept: () => {},
    });
    await sweeper.whenIdle();

    // Cleanup problems must never take down the server, and a single bad pass
    // must never disable the schedule that protects retained PII.
    expect(errors).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await sweeper.whenIdle();
    expect(sweep).toHaveBeenCalledTimes(2);
    sweeper.stop();
  });

  test('a slow sweep does not stack behind itself', async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const sweep = vi.fn().mockImplementation(() => new Promise<{ deleted: number }>((resolve) => {
      release = () => resolve({ deleted: 0 });
    }));
    const sweeper = startDataImportStagingSweeper({ sweep, intervalMs: 1_000, ...silence });

    await vi.advanceTimersByTimeAsync(3_000);
    expect(sweep).toHaveBeenCalledTimes(1);

    release?.();
    await sweeper.whenIdle();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sweep).toHaveBeenCalledTimes(2);
    sweeper.stop();
  });

  test('sweeps well inside the documented staging TTL', () => {
    expect(DATA_IMPORT_STAGING_SWEEP_INTERVAL_MS).toBeLessThan(DATA_IMPORT_STAGING_TTL_MS);
  });
});

// ISSUES.md #69: `deleteExpiredDataImportStaging` was correct, exported, and
// called from nowhere — the documented 24-hour expiry silently never ran, so
// staged client PII could persist indefinitely. The defect was a missing
// caller, not broken logic, and no behavioral test of the sweep itself would
// have caught it. This asserts the wiring exists.
describe('staging sweeper is wired into server startup', () => {
  const entrypoint = readFileSync(
    path.resolve(__dirname, '../../../src/index.ts'),
    'utf-8',
  );

  test('the server entrypoint imports and starts the sweeper', () => {
    expect(entrypoint).toMatch(/import\s*\{[^}]*startDataImportStagingSweeper[^}]*\}\s*from/);
    expect(entrypoint).toMatch(/startDataImportStagingSweeper\s*\(/);
  });
});
