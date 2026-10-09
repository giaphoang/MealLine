// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { deleteExpiredDataImportStaging } from './workflow';

// Staged import bytes are the most sensitive artifact FEED holds — a Link2Feed
// visits export carries client identifiers, birth years, and demographic
// responses. `DataImportJob.expiresAt` and `deleteExpiredDataImportStaging`
// have always implemented the documented 24-hour expiry correctly, but nothing
// ever called the sweep, so a staged file that escaped the success/failure/
// cancel paths (a closed tab, a container restart, an error outside the
// existing catch blocks) stayed on disk indefinitely. See ISSUES.md #69.
//
// The sweep is one indexed query plus per-job cleanup, so it is cheap enough to
// run well below the TTL. Hourly gives every expired artifact a bounded life
// and gives a restarted container many chances to catch anything a previous
// process left behind.
export const DATA_IMPORT_STAGING_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export interface DataImportStagingSweeper {
  stop: () => void;
  /** Resolves once the in-flight sweep settles. Exposed for tests. */
  whenIdle: () => Promise<void>;
}

export interface DataImportStagingSweeperOptions {
  intervalMs?: number;
  sweep?: () => Promise<{ deleted: number }>;
  onError?: (error: unknown) => void;
  onSwept?: (deleted: number) => void;
}

const defaultOnError = (error: unknown): void => {
  console.error('Data import staging sweep failed', error);
};

const defaultOnSwept = (deleted: number): void => {
  if (deleted > 0) {
    console.log(`Data import staging sweep deleted ${deleted} expired artifact(s)`);
  }
};

/**
 * Starts the recurring expiry sweep and runs one pass immediately, so a restart
 * cleans up whatever the previous process left staged rather than waiting a
 * full interval.
 *
 * Failures are reported and swallowed: `deleteExpiredDataImportStaging` already
 * leaves a staging key in place when an individual job cannot be cleaned so a
 * later pass retries it, and a cleanup problem must never take down the server.
 */
export function startDataImportStagingSweeper(
  options: DataImportStagingSweeperOptions = {},
): DataImportStagingSweeper {
  const {
    intervalMs = DATA_IMPORT_STAGING_SWEEP_INTERVAL_MS,
    sweep = () => deleteExpiredDataImportStaging(),
    onError = defaultOnError,
    onSwept = defaultOnSwept,
  } = options;

  let running: Promise<void> | null = null;
  let stopped = false;

  const runOnce = (): Promise<void> => {
    // A slow sweep must not stack behind itself. Skipping a tick is correct:
    // expired artifacts stay expired and the next pass collects them.
    if (running || stopped) return running ?? Promise.resolve();
    running = (async () => {
      try {
        const { deleted } = await sweep();
        onSwept(deleted);
      } catch (error) {
        onError(error);
      } finally {
        running = null;
      }
    })();
    return running;
  };

  const timer = setInterval(runOnce, intervalMs);
  // Cleanup is background work and must never be the reason the process stays
  // alive during shutdown.
  timer.unref?.();

  const initial = runOnce();

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
    whenIdle: async () => {
      await initial;
      while (running) await running;
    },
  };
}
