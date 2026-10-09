// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test } from 'vitest';
import {
  changedSnapshotKeys,
  validateDataImportJobTransition,
  type DataImportJobState,
} from '../../../src/services/data-import';

const stagingState: DataImportJobState = {
  status: 'staging',
  processedRows: 0,
  totalRows: null,
  warningCount: 0,
  unresolvedIssueCount: 0,
};

describe('unified data import job lifecycle', () => {
  test('moves a staged artifact into inspection with bounded provenance', () => {
    expect(validateDataImportJobTransition(stagingState, {
      status: 'inspecting',
      stagedFileKey: '3bd135e4-8c10-4fb5-8f9f-4ff03d81fb37.upload',
      fileHash: 'a'.repeat(64),
      fileSizeBytes: 16_940_175,
      safeMessage: 'Inspecting the Link2Feed visit export.',
    })).toMatchObject({
      status: 'inspecting',
      fileSizeBytes: 16_940_175,
      processedRows: 0,
    });
  });

  test('requires detection metadata before a job can become reviewable', () => {
    const inspecting = { ...stagingState, status: 'inspecting' };
    expect(() => validateDataImportJobTransition(inspecting, {
      status: 'awaiting_review',
    })).toThrow(/detected source contract/i);

    expect(validateDataImportJobTransition(inspecting, {
      status: 'awaiting_review',
      contractId: 'link2feed_visits_v1',
      domain: 'service',
      source: 'link2feed',
      datasetKind: 'visits',
      recognizedFieldCount: 22,
      ignoredFieldCount: 5,
      totalRows: 78_341,
      processedRows: 78_341,
      unresolvedIssueCount: 1,
    })).toMatchObject({ status: 'awaiting_review', totalRows: 78_341 });
  });

  test('rejects backward progress and invalid state jumps', () => {
    const parsing = { ...stagingState, status: 'awaiting_review', processedRows: 50, totalRows: 100 };
    expect(() => validateDataImportJobTransition(parsing, {
      status: 'ready',
      processedRows: 49,
    })).toThrow(/cannot move backwards/i);
    expect(() => validateDataImportJobTransition(stagingState, { status: 'completed' })).toThrow(/cannot move/i);
  });

  test('requires an explicit no-op or imported result at completion', () => {
    const activating = { ...stagingState, status: 'activating', processedRows: 10, totalRows: 10 };
    expect(() => validateDataImportJobTransition(activating, { status: 'completed' })).toThrow(/outcome/i);
    expect(validateDataImportJobTransition(activating, {
      status: 'completed',
      activationOutcome: 'no_op',
    })).toMatchObject({ activationOutcome: 'no_op' });
  });

  test('identifies unchanged snapshots as a no-op without comparing source text', () => {
    const current = new Map([['visit:1', 'hash-a'], ['visit:2', 'hash-b']]);
    expect(changedSnapshotKeys(new Map(current), current)).toEqual([]);
    expect(changedSnapshotKeys(new Map([['visit:1', 'hash-c'], ['visit:3', 'hash-d']]), current)).toEqual([
      'visit:1',
      'visit:3',
    ]);
  });
});
