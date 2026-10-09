// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, it, vi } from 'vitest';
import {
  classifyLottoSummary,
  getLottoQueueAnalytics,
  ingestLottoSummaries,
  listLottoQueueSessions,
  type LottoDailySummary,
} from '../../../src/services/service/lotto-queue';

const summary = (overrides: Partial<LottoDailySummary> = {}): LottoDailySummary => ({
  summaryId: 'summary-1', sessionId: 'session-1', revision: 1,
  supersedesSummaryId: null, contentHash: `sha256:${'a'.repeat(64)}`, isCurrent: true,
  serviceDate: '2026-08-20', serviceDateBasis: 'first_issue', timezone: 'America/Los_Angeles',
  sessionStartedAt: '2026-08-20T18:00:00.000Z', closedAt: '2026-08-20T21:00:00.000Z',
  recordedAt: '2026-08-20T21:00:00.100Z', mode: 'sequential', timingCoverage: 'complete',
  operatingWindow: { day: 'thursday', isOpen: true, openTime: '11:00', closeTime: '14:00' },
  ticketRange: { start: 1, end: 2 }, configuredCount: 2, issuedCount: 2, calledCount: 2,
  unclaimedCount: 0, returnedCount: 0, notCalledCount: 0, unpairedCallCount: 0,
  activitySignals: { allIssuedTicketsCalled: true, switchedRandomToSequential: true, appendedTickets: true },
  batches: [
    { sequence: 1, issuedAt: '2026-08-20T18:00:00.000Z', issuedCount: 1, mechanism: 'batch', mode: 'random' },
    { sequence: 2, issuedAt: '2026-08-20T19:00:00.000Z', issuedCount: 1, mechanism: 'append', mode: 'sequential' },
  ],
  ticketObservations: [
    { sequence: 1, batchSequence: 1, issuedAt: '2026-08-20T18:00:00.000Z', firstCalledAt: '2026-08-20T18:30:00.000Z', outcome: 'called' },
    { sequence: 2, batchSequence: 2, issuedAt: '2026-08-20T19:00:00.000Z', firstCalledAt: '2026-08-20T20:00:00.000Z', outcome: 'called' },
  ],
  ...overrides,
});

describe('LOTTO queue-session classification', () => {
  it('automatically includes a session only when all four strong signals are present', () => {
    expect(classifyLottoSummary(summary()).disposition).toBe('included_service');
    expect(classifyLottoSummary(summary({
      activitySignals: { allIssuedTicketsCalled: true, switchedRandomToSequential: true, appendedTickets: false },
    }))).toMatchObject({ disposition: 'needs_review' });
  });

  it('withholds activity outside the configured one-hour operating-hours margin', () => {
    const result = classifyLottoSummary(summary({
      sessionStartedAt: '2026-08-20T16:30:00.000Z',
      batches: [{ sequence: 1, issuedAt: '2026-08-20T16:30:00.000Z', issuedCount: 2, mechanism: 'full', mode: 'random' }],
      ticketObservations: [],
    }));
    expect(result.disposition).toBe('needs_review');
    expect(result.issues.map((issue) => issue.code)).toContain('activity_outside_operating_window');
  });

  it('accepts SQL TIME operating windows with seconds from LOTTO', async () => {
    const create = vi.fn(async () => ({ id: 1 }));
    const client = {
      lottoQueueSessionRevision: {
        findFirst: async () => null,
        aggregate: async () => ({ _max: { revision: null } }),
        updateMany: async () => ({ count: 0 }),
        create,
      },
    };

    const result = await ingestLottoSummaries([
      summary({
        operatingWindow: {
          day: 'thursday', isOpen: true, openTime: '11:00:00', closeTime: '14:00:00',
        },
      }),
    ], { source: 'lotto_api' }, client as never);

    expect(result).toMatchObject({ received: 1, inserted: 1, unchanged: 0 });
    expect(create).toHaveBeenCalledOnce();
  });

  it('does not carry a staff classification onto a corrected source revision', async () => {
    const source = summary({
      revision: 2,
      summaryId: 'summary-2',
      supersedesSummaryId: 'summary-1',
      contentHash: `sha256:${'b'.repeat(64)}`,
      activitySignals: {
        allIssuedTicketsCalled: true,
        switchedRandomToSequential: false,
        appendedTickets: false,
      },
    });
    const client = {
      lottoQueueSessionRevision: { findMany: async () => [{
        id: 2, ...source, source: 'lotto_api',
        sessionStartedAt: new Date(source.sessionStartedAt!),
        closedAt: new Date(source.closedAt), recordedAt: new Date(source.recordedAt),
        facts: source, initialDisposition: 'needs_review', rulesVersion: 1,
        importId: null, syncRunId: null, createdAt: new Date(), qualityIssues: [],
      }] },
      lottoQueueSessionResolution: { findMany: async () => [{
        id: 1, sessionId: source.sessionId, sourceRevision: 1, revision: 1,
        disposition: 'included_service', reason: 'Reviewed older facts',
        createdBy: 'staff', createdAt: new Date(),
      }] },
    };

    const [session] = await listLottoQueueSessions(client as never);
    expect(session.effectiveDisposition).toBe('needs_review');
    expect(session.latestResolution).toBeNull();
  });

  it('calculates serving intervals and the last call across the whole service day', async () => {
    const source = summary();
    const sessions = [1, 2].map((id) => ({
      id, ...source, summaryId: `summary-${id}`, sessionId: `session-${id}`,
      contentHash: `sha256:${String(id).repeat(64)}`, source: 'lotto_api',
      sessionStartedAt: new Date(source.sessionStartedAt!), closedAt: new Date(source.closedAt),
      recordedAt: new Date(source.recordedAt), operatingWindow: source.operatingWindow,
      facts: { ...source, summaryId: `summary-${id}`, sessionId: `session-${id}` },
      initialDisposition: 'included_service', rulesVersion: 1, importId: null,
      syncRunId: null, createdAt: new Date(), qualityIssues: [],
    }));
    const client = {
      lottoQueueSessionRevision: { findMany: async () => sessions },
      lottoQueueSessionResolution: { findMany: async () => [] },
      lottoQueueTicketObservation: { findMany: async () => [
        { sessionRevisionId: 1, issuedAt: new Date('2026-08-20T18:00:00Z'), firstCalledAt: new Date('2026-08-20T18:30:00Z') },
        { sessionRevisionId: 1, issuedAt: new Date('2026-08-20T18:00:00Z'), firstCalledAt: new Date('2026-08-20T19:00:00Z') },
        // Another closeout on the same service date repeats the final instant.
        { sessionRevisionId: 2, issuedAt: new Date('2026-08-20T18:30:00Z'), firstCalledAt: new Date('2026-08-20T19:00:00Z') },
      ] },
    };

    const analytics = await getLottoQueueAnalytics('2026-08-20', '2026-08-20', client as never);
    expect(analytics.historicalServingIntervalMinutes).toBe(30);
    expect(analytics.typicalLastCallLocalTime).toBe('12:00 PM');
    expect(analytics.includedServiceDayCount).toBe(1);
    expect(analytics.medianInitialBatchSize).toBe(1);
    expect(analytics.averageIssuedPerServiceDay).toBe(4);
    expect(analytics.daily[0]).toMatchObject({
      serviceDate: '2026-08-20',
      issuedCount: 4,
      calledCount: 4,
      initialBatchIssuedCount: 1,
      lastCallLocalMinute: 720,
    });
  });

  it('keeps actual calls distinct from issued-minus-returned and plots call milestones', async () => {
    const sources = [
      summary({
        summaryId: 'summary-volume-1', sessionId: 'session-volume-1',
        contentHash: `sha256:${'c'.repeat(64)}`,
        ticketRange: { start: 1, end: 40 }, configuredCount: 40,
        issuedCount: 40, calledCount: 12, returnedCount: 0, notCalledCount: 28,
        batches: [{ sequence: 1, issuedAt: '2026-08-20T18:00:00.000Z', issuedCount: 10, mechanism: 'batch', mode: 'random' }],
      }),
      summary({
        summaryId: 'summary-volume-2', sessionId: 'session-volume-2',
        contentHash: `sha256:${'d'.repeat(64)}`, serviceDate: '2026-08-21',
        sessionStartedAt: '2026-08-21T18:00:00.000Z', closedAt: '2026-08-21T21:00:00.000Z',
        recordedAt: '2026-08-21T21:00:00.100Z',
        ticketRange: { start: 1, end: 27 }, configuredCount: 27,
        issuedCount: 27, calledCount: 26, returnedCount: 1, notCalledCount: 0,
        batches: [{ sequence: 1, issuedAt: '2026-08-21T18:00:00.000Z', issuedCount: 10, mechanism: 'batch', mode: 'random' }],
      }),
    ];
    const sessions = sources.map((source, index) => ({
      id: index + 1, ...source, source: 'lotto_api',
      sessionStartedAt: new Date(source.sessionStartedAt!), closedAt: new Date(source.closedAt),
      recordedAt: new Date(source.recordedAt), operatingWindow: source.operatingWindow,
      facts: source, initialDisposition: 'included_service', rulesVersion: 1,
      importId: null, syncRunId: null, createdAt: new Date(), qualityIssues: [],
    }));
    const calls = (sessionRevisionId: number, day: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        sessionRevisionId,
        issuedAt: new Date(`${day}T18:00:00.000Z`),
        firstCalledAt: new Date(Date.parse(`${day}T18:00:00.000Z`) + (index + 1) * 60_000),
      }));
    const client = {
      lottoQueueSessionRevision: { findMany: async () => sessions },
      lottoQueueSessionResolution: { findMany: async () => [] },
      lottoQueueTicketObservation: { findMany: async () => [
        ...calls(1, '2026-08-20', 12),
        ...calls(2, '2026-08-21', 26),
      ] },
    };

    const analytics = await getLottoQueueAnalytics('2026-08-20', '2026-08-21', client as never);
    expect(analytics.medianInitialBatchSize).toBe(10);
    expect(analytics.averageIssuedPerServiceDay).toBe(33.5);
    expect(analytics.averageReturnedPerServiceDay).toBe(0.5);
    expect(analytics.daily[0]).toMatchObject({
      issuedCount: 40,
      returnedCount: 0,
      calledCount: 12,
      tenthCallLocalMinute: 670,
      twentyFifthCallLocalMinute: null,
      lastCallLocalMinute: 672,
    });
    expect(analytics.daily[1]).toMatchObject({
      issuedCount: 27,
      returnedCount: 1,
      calledCount: 26,
      twentyFifthCallLocalMinute: 685,
      fiftiethCallLocalMinute: null,
      lastCallLocalMinute: 686,
    });
  });

  it('leaves partial legacy volume unknown instead of converting it to zero', async () => {
    const source = summary({
      serviceDateBasis: 'legacy_activity', sessionStartedAt: null,
      timingCoverage: 'partial_legacy', batches: [],
      issuedCount: 0, calledCount: 0, returnedCount: 1, notCalledCount: 1,
      ticketObservations: [
        { sequence: 1, batchSequence: null, issuedAt: null, firstCalledAt: null, outcome: 'returned_before_call' },
        { sequence: 2, batchSequence: null, issuedAt: null, firstCalledAt: null, outcome: 'not_called' },
      ],
    });
    const client = {
      lottoQueueSessionRevision: { findMany: async () => [{
        id: 1, ...source, source: 'lotto_api', sessionStartedAt: null,
        closedAt: new Date(source.closedAt), recordedAt: new Date(source.recordedAt),
        facts: source, initialDisposition: 'included_service', rulesVersion: 1,
        importId: null, syncRunId: null, createdAt: new Date(), qualityIssues: [],
      }] },
      lottoQueueSessionResolution: { findMany: async () => [] },
      lottoQueueTicketObservation: { findMany: async () => [] },
    };

    const analytics = await getLottoQueueAnalytics('2026-08-20', '2026-08-20', client as never);
    expect(analytics.includedServiceDayCount).toBe(1);
    expect(analytics.volumeServiceDayCount).toBe(0);
    expect(analytics.averageIssuedPerServiceDay).toBeNull();
    expect(analytics.averageReturnedPerServiceDay).toBeNull();
    expect(analytics.daily[0]).toMatchObject({
      issuedCount: null,
      returnedCount: null,
      calledCount: null,
      initialBatchIssuedCount: null,
    });
  });
});
