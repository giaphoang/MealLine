// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// ISSUES.md #72. The dialog reported "Validated 79,308 of 79,308 records…" with
// a full progress bar while post-review materialization was still running,
// because both that work and the initial parse are status `preparing` with the
// same row counts. The user could not tell finished from hung and asked whether
// it was safe to close. These pin the phase derivation that fixes it.

import { describe, expect, test } from 'vitest';
import {
  formatElapsed,
  importPhase,
} from '@/components/data-management/add-data/import-progress-panel';
import type { DataImportJobReview } from '@/services/data-import';

const job = (over: Partial<DataImportJobReview>): DataImportJobReview => ({
  id: 'clz1234567890123456789012',
  contractId: 'link2feed_visits_v1',
  domain: 'service',
  source: 'link2feed',
  datasetKind: 'visits',
  status: 'preparing',
  fileSizeBytes: 25_124_653,
  recognizedFieldCount: 23,
  ignoredFieldCount: 7,
  totalRows: null,
  processedRows: 0,
  warningCount: 0,
  unresolvedIssueCount: 0,
  reviewSummary: null,
  activationOutcome: null,
  activationSummary: null,
  errorCode: null,
  errorMessage: null,
  reviewIssues: [],
  ...over,
});

const summary = { rowCount: 79_308 } as unknown as DataImportJobReview['reviewSummary'];

describe('import phase', () => {
  test('parsing and post-review preparation are told apart, though both are `preparing`', () => {
    const parsing = importPhase(job({ processedRows: 45_000 }));
    const materializing = importPhase(job({
      processedRows: 79_308,
      totalRows: 79_308,
      reviewSummary: summary,
      unresolvedIssueCount: 0,
    }));

    expect(parsing.stage).toBe('validate');
    expect(parsing.message).toContain('Validated 45,000');

    // The exact defect: this used to report the parse message and a full bar.
    expect(materializing.stage).toBe('prepare');
    expect(materializing.message).toContain('Preparing the reviewed data');
    expect(materializing.message).not.toContain('Validated');
    expect(materializing.determinate).toBe(false);
  });

  test('a full bar is never shown while work continues', () => {
    // Reading every row is not the end of validation — reconciliation follows,
    // ~20s of a ~168s import on the Pi.
    const allRead = importPhase(job({ processedRows: 79_308, totalRows: 79_308 }));

    expect(allRead.stage).toBe('validate');
    expect(allRead.working).toBe(true);
    expect(allRead.determinate).toBe(false);
    expect(allRead.message).toContain('Checking them against existing data');
  });

  test('counted progress stays determinate while rows remain', () => {
    const counting = importPhase(job({ processedRows: 45_000, totalRows: 79_308 }));
    expect(counting.determinate).toBe(true);
    expect(counting.message).toBe('Validated 45,000 of 79,308 records…');
  });

  test('an unknown total reads as indeterminate rather than inventing a percentage', () => {
    // The backend does not know the row count until the parse ends, so this is
    // the state for most of a real import.
    const unknown = importPhase(job({ processedRows: 20_000, totalRows: null }));
    expect(unknown.determinate).toBe(false);
    expect(unknown.message).toBe('Validated 20,000 records…');
  });

  test('waiting on the user is not reported as working', () => {
    const waiting = importPhase(job({
      status: 'awaiting_review',
      processedRows: 79_308,
      totalRows: 79_308,
      unresolvedIssueCount: 13,
      reviewSummary: summary,
    }));
    expect(waiting.stage).toBe('review');
    expect(waiting.working).toBe(false);
  });

  test('activation and completion land on the final stage', () => {
    expect(importPhase(job({ status: 'activating' }))).toMatchObject({
      stage: 'activate',
      working: true,
    });
    expect(importPhase(job({ status: 'completed', activationOutcome: 'imported' }))).toMatchObject({
      stage: 'activate',
      working: false,
    });
    expect(importPhase(job({ status: 'ready', reviewSummary: summary }))).toMatchObject({
      stage: 'activate',
      working: false,
    });
  });
});

describe('elapsed formatting', () => {
  test('reads as minutes once an import passes a minute', () => {
    expect(formatElapsed(9)).toBe('9s');
    expect(formatElapsed(59)).toBe('59s');
    expect(formatElapsed(60)).toBe('1m 00s');
    expect(formatElapsed(222)).toBe('3m 42s');
  });
});

/**
 * ISSUES.md #75. `importPhase` handled five of the seven statuses and fell
 * through to "Reading the data file…" for the rest, so a failed import showed a
 * spinner for work that had already stopped. This asserts every status in the
 * union reaches a deliberate branch — a status added later cannot quietly
 * inherit the default again.
 */
describe('every job status maps to a deliberate phase', () => {
  const STATUSES = [
    'preparing', 'awaiting_review', 'ready', 'activating',
    'completed', 'failed', 'cancelled',
  ] as const;

  test.each(STATUSES)('%s does not fall through to the reading default', (status) => {
    const phase = importPhase(job({ status }));
    if (status === 'preparing') {
      // The only status for which "Reading the data file…" is the truth.
      expect(phase.message).toBe('Reading the data file…');
      return;
    }
    expect(phase.message).not.toBe('Reading the data file…');
  });

  test('a failed job carries the server reason and stops working', () => {
    const phase = importPhase(job({
      status: 'failed',
      errorMessage: 'Visit 26685486 must identify exactly one Head of Household.',
    }));

    expect(phase.failed).toBe(true);
    expect(phase.working).toBe(false);
    expect(phase.message).toContain('26685486');
  });

  test('a failed job with no message still says something useful', () => {
    const phase = importPhase(job({ status: 'failed', errorMessage: null }));
    expect(phase.failed).toBe(true);
    expect(phase.message).toMatch(/no data was changed/i);
  });

  test('a cancelled job is not reported as failure of the file', () => {
    const phase = importPhase(job({ status: 'cancelled' }));
    expect(phase.working).toBe(false);
    expect(phase.message).toMatch(/cancelled/i);
  });
});
