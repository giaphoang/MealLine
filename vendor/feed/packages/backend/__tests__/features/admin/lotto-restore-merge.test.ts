// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, it } from 'vitest';

import { mergeMonotonicLottoHistory } from '../../../src/services/restore/monotonic-lotto-history';
import { prepareRestoredUsers } from '../../../src/services/restore/restore-service';

const run = (id: number, status = 'completed') => ({
  id,
  mode: 'manual',
  status,
  cursorBefore: null,
  cursorAfter: `cursor-${id}`,
  receivedCount: 1,
  insertedCount: 1,
  unchangedCount: 0,
  reviewCount: 0,
  errorCode: null,
  errorMessage: null,
  startedBy: 'staff',
  startedAt: `2026-08-${String(id).padStart(2, '0')}T18:00:00.000Z`,
  completedAt: `2026-08-${String(id).padStart(2, '0')}T18:01:00.000Z`,
});

const session = (id: number, revision: number, syncRunId: number) => ({
  id,
  summaryId: `summary-${id}`,
  sessionId: 'session-one',
  revision,
  supersedesSummaryId: revision === 1 ? null : 'summary-1',
  contentHash: `sha256:${String(id).repeat(64)}`,
  isCurrent: true,
  source: 'lotto_api',
  serviceDate: `2026-08-${String(20 + revision).padStart(2, '0')}`,
  timezone: 'America/Los_Angeles',
  closedAt: `2026-08-${String(20 + revision).padStart(2, '0')}T21:00:00.000Z`,
  recordedAt: `2026-08-${String(20 + revision).padStart(2, '0')}T21:00:01.000Z`,
  syncRunId,
  importId: null,
});

describe('monotonic LOTTO restore history', () => {
  it('retains newer live sessions and their synchronization provenance', () => {
    const merged = mergeMonotonicLottoHistory(
      {
        ServiceImport: [],
        LottoQueueSyncRun: [run(1)],
        LottoQueueSessionRevision: [session(1, 1, 1)],
        LottoQueueTicketObservation: [],
        LottoQueueQualityIssue: [],
        LottoQueueSessionResolution: [],
      },
      {
        ServiceImport: [],
        LottoQueueSyncRun: [run(1), run(2)],
        LottoQueueSessionRevision: [session(1, 1, 1), session(2, 2, 2)],
        LottoQueueTicketObservation: [],
        LottoQueueQualityIssue: [],
        LottoQueueSessionResolution: [],
      },
    );

    expect(merged.LottoQueueSyncRun.map(row => row.id)).toEqual([1, 2]);
    expect(merged.LottoQueueSessionRevision).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 1, isCurrent: false }),
      expect.objectContaining({ id: 2, isCurrent: true }),
    ]));
  });

  it('retains the ServiceImport parent of newer CSV history', () => {
    const importedSession = { ...session(3, 1, 1), source: 'lotto_snapshot_history', importId: 44, syncRunId: null };
    const imported = {
      id: 44,
      source: 'lotto',
      datasetKind: 'queue_sessions',
      fileHash: 'sha256:history',
      importedAt: '2026-08-22T20:00:00.000Z',
    };
    const merged = mergeMonotonicLottoHistory(
      { ServiceImport: [], LottoQueueSessionRevision: [] },
      { ServiceImport: [imported], LottoQueueSessionRevision: [importedSession] },
    );

    expect(merged.ServiceImport).toEqual([imported]);
    expect(merged.LottoQueueSessionRevision).toEqual([
      expect.objectContaining({ id: 3, importId: 44, isCurrent: true }),
    ]);
  });

  it('stops before restore when an immutable identity has different content', () => {
    expect(() => mergeMonotonicLottoHistory(
      { ServiceImport: [], LottoQueueSessionRevision: [session(1, 1, 1)] },
      {
        ServiceImport: [],
        LottoQueueSessionRevision: [{ ...session(1, 1, 1), calledCount: 99 }],
      },
    )).toThrow(/different content/i);
  });

  it('keeps the later live state of a synchronization run', () => {
    const merged = mergeMonotonicLottoHistory(
      { ServiceImport: [], LottoQueueSyncRun: [{ ...run(1, 'running'), completedAt: null }] },
      { ServiceImport: [], LottoQueueSyncRun: [run(1, 'completed')] },
    );

    expect(merged.LottoQueueSyncRun).toEqual([
      expect.objectContaining({ id: 1, status: 'completed' }),
    ]);
  });
});

describe('authority-neutral staff roster restore', () => {
  it('forces artifact accounts to Staff while preserving only the acting administrator', () => {
    const restored = prepareRestoredUsers(
      [
        { id: 'backup-admin', email: 'admin@example.org', role: 'ADMINISTRATOR', accessState: 'REVOKED' },
        { id: 'backup-staff', email: 'staff@example.org', role: 'ADMINISTRATOR', accessState: 'ALLOWED' },
      ],
      [{ id: 'live-admin', email: 'ADMIN@example.org', role: 'ADMINISTRATOR', accessState: 'ALLOWED' }],
      'admin@example.org',
    );

    expect(restored).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'live-admin', email: 'admin@example.org', role: 'ADMINISTRATOR', accessState: 'ALLOWED' }),
      expect.objectContaining({ id: 'backup-staff', email: 'staff@example.org', role: 'STAFF' }),
    ]));
  });

  it('carries the acting administrator into a roster that predates their account', () => {
    const restored = prepareRestoredUsers(
      [{ id: 'backup-staff', email: 'staff@example.org' }],
      [{ id: 'live-admin', email: 'admin@example.org', role: 'ADMINISTRATOR', accessState: 'ALLOWED' }],
      'admin@example.org',
    );

    expect(restored).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'live-admin', email: 'admin@example.org', role: 'ADMINISTRATOR' }),
    ]));
  });
});
