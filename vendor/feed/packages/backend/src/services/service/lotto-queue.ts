// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { createHash } from 'crypto';
import prisma from '../../db';
import { decryptApiKey, encryptApiKey } from '../encryption';

export const LOTTO_RULES_VERSION = 1;
export const LOTTO_DISPOSITIONS = [
  'needs_review',
  'included_service',
  'excluded_test',
  'excluded_duplicate',
  'excluded_other',
] as const;

const isoDateTime = z.string().datetime({ offset: true });
// LOTTO's Postgres-backed settings can serialize SQL TIME values with seconds,
// while file-backed/local settings retain HH:mm. Both represent the same
// wall-clock contract and must remain readable within v1.
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const operatingWindowSchema = z.object({
  day: z.enum(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']),
  isOpen: z.boolean(), openTime: clockTime, closeTime: clockTime,
}).strict().nullable();
const ticketObservationSchema = z.object({
  sequence: z.number().int().positive(),
  batchSequence: z.number().int().positive().nullable(),
  issuedAt: isoDateTime.nullable(),
  firstCalledAt: isoDateTime.nullable(),
  outcome: z.enum(['called', 'unclaimed', 'returned_before_call', 'returned_after_call', 'not_called']),
}).strict();
const summarySchema = z.object({
  summaryId: z.string().min(1), sessionId: z.string().min(1), revision: z.number().int().positive(),
  supersedesSummaryId: z.string().nullable(), contentHash: z.string().startsWith('sha256:'),
  isCurrent: z.boolean(), serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceDateBasis: z.enum(['first_issue', 'legacy_activity', 'closeout']),
  timezone: z.string().min(1), sessionStartedAt: isoDateTime.nullable(),
  closedAt: isoDateTime, recordedAt: isoDateTime, mode: z.enum(['random', 'sequential']),
  timingCoverage: z.enum(['complete', 'partial_legacy']), operatingWindow: operatingWindowSchema,
  ticketRange: z.object({ start: z.number().int(), end: z.number().int() }).strict(),
  configuredCount: z.number().int().nonnegative(), issuedCount: z.number().int().nonnegative(),
  calledCount: z.number().int().nonnegative(), unclaimedCount: z.number().int().nonnegative(),
  returnedCount: z.number().int().nonnegative(), notCalledCount: z.number().int().nonnegative(),
  unpairedCallCount: z.number().int().nonnegative(),
  activitySignals: z.object({
    allIssuedTicketsCalled: z.boolean(),
    switchedRandomToSequential: z.boolean(),
    appendedTickets: z.boolean(),
  }).strict(),
  batches: z.array(z.object({
    sequence: z.number().int().positive(), issuedAt: isoDateTime,
    issuedCount: z.number().int().positive(), mechanism: z.enum(['full', 'batch', 'append']),
    mode: z.enum(['random', 'sequential']),
  }).strict()),
  ticketObservations: z.array(ticketObservationSchema),
}).strict();

const envelopeSchema = z.object({
  contractVersion: z.literal(1), summaries: z.array(summarySchema),
  nextCursor: z.string().nullable(), hasMore: z.boolean().optional(),
}).strict();

export type LottoDailySummary = z.infer<typeof summarySchema>;

export class LottoQueueError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode = 400) {
    super(message);
  }
}

const localParts = (instant: string, timezone: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long',
  }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: parts.weekday,
  };
};

const dateDistance = (left: string, right: string) =>
  Math.round((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000);
const clockMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

export const classifyLottoSummary = (summary: LottoDailySummary) => {
  const activityInstants = [
    summary.sessionStartedAt,
    ...summary.batches.map((batch) => batch.issuedAt),
    ...summary.ticketObservations.flatMap((ticket) => [ticket.issuedAt, ticket.firstCalledAt]),
  ].filter((value): value is string => value !== null);
  const window = summary.operatingWindow;
  const withinOperatingWindow = Boolean(window?.isOpen) && activityInstants.length > 0
    && activityInstants.every((instant) => {
      const local = localParts(instant, summary.timezone);
      const relativeMinutes = dateDistance(local.date, summary.serviceDate) * 1440 + local.minutes;
      return relativeMinutes >= clockMinutes(window!.openTime) - 60
        && relativeMinutes <= clockMinutes(window!.closeTime) + 60;
    });
  const signals = {
    withinOperatingWindow,
    allIssuedTicketsCalled: summary.activitySignals.allIssuedTicketsCalled,
    switchedRandomToSequential: summary.activitySignals.switchedRandomToSequential,
    appendedTickets: summary.activitySignals.appendedTickets,
  };
  const issues = [
    ...(!signals.withinOperatingWindow ? [{ code: 'activity_outside_operating_window', severity: 'warning' }] : []),
    ...(!signals.allIssuedTicketsCalled ? [{ code: 'issued_tickets_not_fully_called', severity: 'warning' }] : []),
    ...(!signals.switchedRandomToSequential ? [{ code: 'no_random_to_sequential_transition', severity: 'info' }] : []),
    ...(!signals.appendedTickets ? [{ code: 'no_appended_ticket_batch', severity: 'info' }] : []),
    ...(summary.timingCoverage !== 'complete' ? [{ code: 'partial_timing_coverage', severity: 'warning' }] : []),
    ...(summary.unpairedCallCount > 0 ? [{ code: 'unpaired_call_observations', severity: 'warning' }] : []),
  ];
  const authentic = Object.values(signals).every(Boolean) && summary.timingCoverage === 'complete'
    && summary.unpairedCallCount === 0;
  return { signals, issues, disposition: authentic ? 'included_service' : 'needs_review' } as const;
};

type IngestOptions = { source: 'lotto_api' | 'lotto_snapshot_history'; syncRunId?: number; importId?: number };

export async function ingestLottoSummaries(
  summariesInput: unknown[],
  options: IngestOptions,
  client: PrismaClient | Prisma.TransactionClient = prisma,
) {
  let inserted = 0;
  let unchanged = 0;
  let review = 0;
  for (const input of summariesInput) {
    const summary = summarySchema.parse(input);
    const duplicate = await client.lottoQueueSessionRevision.findFirst({
      where: { OR: [{ summaryId: summary.summaryId }, { sessionId: summary.sessionId, contentHash: summary.contentHash }] },
      select: { id: true },
    });
    if (duplicate) { unchanged += 1; continue; }
    const greatest = await client.lottoQueueSessionRevision.aggregate({
      where: { sessionId: summary.sessionId }, _max: { revision: true },
    });
    const isCurrent = summary.revision > (greatest._max.revision ?? 0);
    if (isCurrent) {
      await client.lottoQueueSessionRevision.updateMany({
        where: { sessionId: summary.sessionId, isCurrent: true }, data: { isCurrent: false },
      });
    }
    const classification = classifyLottoSummary(summary);
    if (classification.disposition === 'needs_review') review += 1;
    await client.lottoQueueSessionRevision.create({ data: {
      summaryId: summary.summaryId, sessionId: summary.sessionId, revision: summary.revision,
      supersedesSummaryId: summary.supersedesSummaryId, contentHash: summary.contentHash, isCurrent,
      source: options.source, serviceDate: summary.serviceDate, timezone: summary.timezone,
      sessionStartedAt: summary.sessionStartedAt ? new Date(summary.sessionStartedAt) : null,
      closedAt: new Date(summary.closedAt), recordedAt: new Date(summary.recordedAt),
      mode: summary.mode, timingCoverage: summary.timingCoverage,
      operatingWindow: summary.operatingWindow ?? Prisma.JsonNull,
      configuredCount: summary.configuredCount, issuedCount: summary.issuedCount,
      calledCount: summary.calledCount, unclaimedCount: summary.unclaimedCount,
      returnedCount: summary.returnedCount, notCalledCount: summary.notCalledCount,
      unpairedCallCount: summary.unpairedCallCount,
      allIssuedTicketsCalled: summary.activitySignals.allIssuedTicketsCalled,
      switchedRandomToSequential: summary.activitySignals.switchedRandomToSequential,
      appendedTickets: summary.activitySignals.appendedTickets,
      initialDisposition: classification.disposition, rulesVersion: LOTTO_RULES_VERSION,
      facts: summary as unknown as Prisma.InputJsonValue,
      importId: options.importId, syncRunId: options.syncRunId,
      ticketObservations: { create: summary.ticketObservations.map((ticket) => ({
        sequence: ticket.sequence, batchSequence: ticket.batchSequence,
        issuedAt: ticket.issuedAt ? new Date(ticket.issuedAt) : null,
        firstCalledAt: ticket.firstCalledAt ? new Date(ticket.firstCalledAt) : null,
        outcome: ticket.outcome,
      })) },
      qualityIssues: { create: classification.issues.map((issue) => ({
        code: issue.code, severity: issue.severity,
        safeDetails: classification.signals as Prisma.InputJsonValue,
      })) },
    } });
    inserted += 1;
  }
  return { received: summariesInput.length, inserted, unchanged, review };
}

export async function importLottoQueueHistoryCsv(bytes: Buffer, actor: string | null) {
  const fileHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const prior = await prisma.serviceImport.findFirst({
    where: { source: 'lotto', datasetKind: 'queue_sessions', fileHash, status: 'active' },
    select: { id: true },
  });
  if (prior) return { outcome: 'no_op' as const, importId: prior.id, received: 0, inserted: 0, unchanged: 0, review: 0 };
  let rows: Array<Record<string, string>>;
  try {
    rows = parse(bytes, { columns: true, bom: true, skip_empty_lines: true, relax_column_count: false });
  } catch {
    throw new LottoQueueError('FEED could not read this LOTTO history CSV.', 'INVALID_LOTTO_HISTORY_CSV');
  }
  if (rows.length === 0 || rows.some((row) => row['FEED Schema Version'] !== '1' || !row['Summary JSON'])) {
    throw new LottoQueueError('This file is not a LOTTO queue-history v1 export.', 'INVALID_LOTTO_HISTORY_CONTRACT');
  }
  let summaries: unknown[];
  try { summaries = rows.map((row) => JSON.parse(row['Summary JSON'])); }
  catch { throw new LottoQueueError('A LOTTO session row contains invalid JSON.', 'INVALID_LOTTO_HISTORY_ROW'); }
  return prisma.$transaction(async (tx) => {
    const dates = summaries.map((value) => summarySchema.parse(value).serviceDate).sort();
    const imported = await tx.serviceImport.create({ data: {
      source: 'lotto', datasetKind: 'queue_sessions', fileHash, schemaVersion: 1,
      status: 'active', rowCount: rows.length, warningCount: 0,
      warnings: [], rangeStart: dates[0] ?? null, rangeEnd: dates.at(-1) ?? null,
      importedBy: actor,
    } });
    const result = await ingestLottoSummaries(summaries, { source: 'lotto_snapshot_history', importId: imported.id }, tx);
    await tx.serviceImport.update({ where: { id: imported.id }, data: {
      warningCount: result.review,
      warnings: result.review > 0 ? [{ code: 'lotto_sessions_pending_review', count: result.review }] : [],
    } });
    return { outcome: 'imported' as const, importId: imported.id, ...result };
  });
}

export async function saveLottoIntegrationConfig(baseUrl: string, token: string, actor: string | null) {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  let parsed: URL;
  try { parsed = new URL(normalized); } catch { throw new LottoQueueError('Enter a valid LOTTO URL.', 'INVALID_LOTTO_URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new LottoQueueError('LOTTO must use an HTTP or HTTPS URL.', 'INVALID_LOTTO_URL');
  }
  const encrypted = await encryptApiKey(token.trim());
  const existing = await prisma.lottoQueueIntegrationConfig.findUnique({
    where: { id: 'singleton' },
  });
  const sourceChanged = Boolean(existing && existing.baseUrl !== normalized);
  const config = await prisma.lottoQueueIntegrationConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', baseUrl: normalized, encryptedToken: encrypted.encrypted, salt: encrypted.salt, updatedBy: actor },
    update: {
      baseUrl: normalized,
      encryptedToken: encrypted.encrypted,
      salt: encrypted.salt,
      // Replacing the credential for the same LOTTO deployment changes only
      // authorization. Its synchronization position and history remain valid.
      // A different source has a different cursor namespace and must replay its
      // available window from the beginning.
      ...(sourceChanged ? { cursor: null, lastSyncedAt: null } : {}),
      updatedBy: actor,
    },
    select: { baseUrl: true, cursor: true, lastSyncedAt: true, updatedAt: true },
  });
  return { ...config, sourceChanged };
}

export async function getLottoIntegrationStatus() {
  const config = await prisma.lottoQueueIntegrationConfig.findUnique({
    where: { id: 'singleton' }, select: { baseUrl: true, cursor: true, lastSyncedAt: true, updatedAt: true },
  });
  const pendingReviewCount = (await listLottoQueueSessions())
    .filter((session) => session.effectiveDisposition === 'needs_review').length;
  return { configured: Boolean(config), config, pendingReviewCount };
}

export async function syncLottoQueue(actor: string | null) {
  const config = await prisma.lottoQueueIntegrationConfig.findUnique({ where: { id: 'singleton' } });
  if (!config) throw new LottoQueueError('Configure the LOTTO connection before synchronizing.', 'LOTTO_NOT_CONFIGURED', 409);
  const run = await prisma.lottoQueueSyncRun.create({ data: { mode: 'manual', status: 'running', cursorBefore: config.cursor, startedBy: actor } });
  try {
    const token = await decryptApiKey(config.encryptedToken, config.salt);
    let cursor = config.cursor;
    let totals = { received: 0, inserted: 0, unchanged: 0, review: 0 };
    for (let pageNumber = 0; pageNumber < 1000; pageNumber += 1) {
      const endpoint = new URL('/api/integrations/feed/v1/daily-summaries', `${config.baseUrl}/`);
      endpoint.searchParams.set('limit', '500');
      if (cursor) endpoint.searchParams.set('cursor', cursor);
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      if (response.status === 401 || response.status === 403) {
        throw new LottoQueueError(
          'LOTTO rejected the saved connection. Ask a LOTTO administrator to generate a new synchronization token, then update the connection.',
          'LOTTO_TOKEN_REJECTED',
          409,
        );
      }
      // 503, not 502: Cloudflare replaces an origin 502 with its own HTML
      // error page, which would destroy this message before staff saw it.
      // See ISSUES.md #80.
      if (!response.ok) throw new LottoQueueError(`LOTTO returned HTTP ${response.status}.`, 'LOTTO_SYNC_SOURCE_ERROR', 503);
      const parsedEnvelope = envelopeSchema.safeParse(await response.json());
      if (!parsedEnvelope.success) {
        throw new LottoQueueError(
          'LOTTO returned an incompatible queue-summary contract. Confirm that LOTTO is v1.21.0 or later, then try again.',
          'LOTTO_SYNC_CONTRACT_ERROR',
          503,
        );
      }
      const envelope = parsedEnvelope.data;
      const page = await prisma.$transaction(async (tx) => {
        const result = await ingestLottoSummaries(envelope.summaries, { source: 'lotto_api', syncRunId: run.id }, tx);
        if (envelope.nextCursor) await tx.lottoQueueIntegrationConfig.update({ where: { id: 'singleton' }, data: { cursor: envelope.nextCursor } });
        return result;
      });
      totals = { received: totals.received + page.received, inserted: totals.inserted + page.inserted, unchanged: totals.unchanged + page.unchanged, review: totals.review + page.review };
      if (!envelope.nextCursor || envelope.nextCursor === cursor || envelope.summaries.length === 0) break;
      cursor = envelope.nextCursor;
      if (envelope.hasMore === false) break;
    }
    const completedAt = new Date();
    await prisma.$transaction([
      prisma.lottoQueueIntegrationConfig.update({ where: { id: 'singleton' }, data: { lastSyncedAt: completedAt } }),
      prisma.lottoQueueSyncRun.update({ where: { id: run.id }, data: { status: 'completed', cursorAfter: cursor, receivedCount: totals.received, insertedCount: totals.inserted, unchangedCount: totals.unchanged, reviewCount: totals.review, completedAt } }),
    ]);
    return { runId: run.id, ...totals, completedAt };
  } catch (error) {
    await prisma.lottoQueueSyncRun.update({ where: { id: run.id }, data: { status: 'failed', errorCode: error instanceof LottoQueueError ? error.code : 'LOTTO_SYNC_FAILED', errorMessage: error instanceof Error ? error.message : 'LOTTO synchronization failed.', completedAt: new Date() } });
    throw error;
  }
}

export async function listLottoQueueSessions(client: PrismaClient | Prisma.TransactionClient = prisma) {
  const sessions = await client.lottoQueueSessionRevision.findMany({
    where: {
      isCurrent: true,
      OR: [{ importId: null }, { import: { status: 'active' } }],
    }, orderBy: [{ serviceDate: 'desc' }, { recordedAt: 'desc' }],
    include: { qualityIssues: true },
  });
  const resolutions = await client.lottoQueueSessionResolution.findMany({
    orderBy: [{ sessionId: 'asc' }, { sourceRevision: 'asc' }, { revision: 'desc' }],
  });
  const latest = new Map<string, typeof resolutions[number]>();
  for (const resolution of resolutions) {
    const key = `${resolution.sessionId}:${resolution.sourceRevision}`;
    if (!latest.has(key)) latest.set(key, resolution);
  }
  return sessions.map((session) => {
    const resolution = latest.get(`${session.sessionId}:${session.revision}`) ?? null;
    return {
      ...session,
      withinOperatingWindow: classifyLottoSummary(summarySchema.parse(session.facts)).signals.withinOperatingWindow,
      effectiveDisposition: resolution?.disposition ?? session.initialDisposition,
      latestResolution: resolution,
    };
  });
}

export async function resolveLottoQueueSession(sessionId: string, disposition: typeof LOTTO_DISPOSITIONS[number], reason: string, actor: string | null) {
  const session = await prisma.lottoQueueSessionRevision.findFirst({
    where: { sessionId, isCurrent: true },
    select: { revision: true },
  });
  if (!session) throw new LottoQueueError('That LOTTO session was not found.', 'LOTTO_SESSION_NOT_FOUND', 404);
  const latest = await prisma.lottoQueueSessionResolution.aggregate({ where: { sessionId }, _max: { revision: true } });
  return prisma.lottoQueueSessionResolution.create({ data: {
    sessionId,
    sourceRevision: session.revision,
    revision: (latest._max.revision ?? 0) + 1,
    disposition,
    reason: reason.trim(),
    createdBy: actor,
  } });
}

const percentile = (values: number[], share: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * share;
  const lower = Math.floor(index); const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};
const roundMinutes = (milliseconds: number | null) => milliseconds === null ? null : Math.round(milliseconds / 6000) / 10;
const roundOne = (value: number | null) => value === null ? null : Math.round(value * 10) / 10;

export async function getLottoQueueAnalytics(
  startDate: string,
  endDate: string,
  client: PrismaClient | Prisma.TransactionClient = prisma,
) {
  const sessions = await listLottoQueueSessions(client);
  const selected = sessions.filter((session) => session.serviceDate >= startDate && session.serviceDate <= endDate);
  const included = selected.filter((session) => session.effectiveDisposition === 'included_service');
  const revisionIds = included.map((session) => session.id);
  const observations = revisionIds.length === 0 ? [] : await client.lottoQueueTicketObservation.findMany({ where: { sessionRevisionId: { in: revisionIds } }, orderBy: [{ sessionRevisionId: 'asc' }, { firstCalledAt: 'asc' }] });
  const waits = observations.filter((item) => item.issuedAt && item.firstCalledAt).map((item) => item.firstCalledAt!.getTime() - item.issuedAt!.getTime()).filter((value) => value >= 0);
  const sessionByRevisionId = new Map(included.map((session) => [session.id, session]));
  type DailyQueueAccumulator = {
    serviceDate: string;
    issuedCount: number;
    returnedCount: number;
    calledCount: number;
    initialBatchIssuedCount: number | null;
    initialBatchAt: number | null;
    volumeCoverageComplete: boolean;
    calls: Array<{ at: number; timezone: string }>;
  };
  const dailyByServiceDate = new Map<string, DailyQueueAccumulator>();
  for (const session of included) {
    const day = dailyByServiceDate.get(session.serviceDate) ?? {
      serviceDate: session.serviceDate,
      issuedCount: 0,
      returnedCount: 0,
      calledCount: 0,
      initialBatchIssuedCount: null,
      initialBatchAt: null,
      volumeCoverageComplete: true,
      calls: [],
    };
    day.issuedCount += session.issuedCount;
    day.returnedCount += session.returnedCount;
    day.calledCount += session.calledCount;
    if (session.timingCoverage !== 'complete') day.volumeCoverageComplete = false;

    // A service date should normally have one session. If an operational reset
    // split it into more than one, only the day's earliest first batch is the
    // initial drawing; summing every session's first batch would overstate it.
    const facts = summarySchema.parse(session.facts);
    const firstBatch = facts.batches.find((batch) => batch.sequence === 1);
    const firstBatchAt = firstBatch ? Date.parse(firstBatch.issuedAt) : null;
    if (firstBatch && firstBatchAt !== null
      && (day.initialBatchAt === null || firstBatchAt < day.initialBatchAt)) {
      day.initialBatchAt = firstBatchAt;
      day.initialBatchIssuedCount = firstBatch.issuedCount;
    }
    dailyByServiceDate.set(session.serviceDate, day);
  }

  for (const observation of observations) {
    if (!observation.firstCalledAt) continue;
    const session = sessionByRevisionId.get(observation.sessionRevisionId);
    if (!session) continue;
    const day = dailyByServiceDate.get(session.serviceDate);
    if (!day) continue;
    day.calls.push({ at: observation.firstCalledAt.getTime(), timezone: session.timezone });
  }
  const intervals: number[] = [];
  for (const day of dailyByServiceDate.values()) {
    // Identical timestamps can arise when closeouts overlap. They remain
    // separate ticket calls for milestones but not zero-length serving gaps.
    const calls = [...new Set(day.calls.map((call) => call.at))].sort((a, b) => a - b);
    for (let index = 1; index < calls.length; index += 1) intervals.push(calls[index] - calls[index - 1]);
  }
  const lastCalls = [...dailyByServiceDate.values()].flatMap((day) => {
    const last = [...day.calls].sort((left, right) => left.at - right.at).at(-1);
    return last === undefined ? [] : [localParts(new Date(last.at).toISOString(), last.timezone).minutes];
  });
  const medianLast = percentile(lastCalls, 0.5);
  const formatClock = (minutes: number | null) => {
    if (minutes === null) return null;
    const roundedMinutes = Math.round(minutes);
    const hours24 = Math.floor(roundedMinutes / 60) % 24;
    const hours12 = hours24 % 12 || 12;
    return `${hours12}:${String(roundedMinutes % 60).padStart(2, '0')} ${hours24 < 12 ? 'AM' : 'PM'}`;
  };
  const daily = [...dailyByServiceDate.values()]
    .sort((left, right) => left.serviceDate.localeCompare(right.serviceDate))
    .map((day) => {
      const calls = [...day.calls].sort((left, right) => left.at - right.at);
      const localMinuteAt = (index: number) => {
        const call = calls[index];
        return call ? localParts(new Date(call.at).toISOString(), call.timezone).minutes : null;
      };
      return {
        serviceDate: day.serviceDate,
        issuedCount: day.volumeCoverageComplete ? day.issuedCount : null,
        returnedCount: day.volumeCoverageComplete ? day.returnedCount : null,
        calledCount: day.volumeCoverageComplete ? day.calledCount : null,
        initialBatchIssuedCount: day.volumeCoverageComplete ? day.initialBatchIssuedCount : null,
        tenthCallLocalMinute: localMinuteAt(9),
        twentyFifthCallLocalMinute: localMinuteAt(24),
        fiftiethCallLocalMinute: localMinuteAt(49),
        lastCallLocalMinute: localMinuteAt(calls.length - 1),
      };
    });
  const initialBatchCounts = daily.flatMap((day) =>
    day.initialBatchIssuedCount === null ? [] : [day.initialBatchIssuedCount]);
  const serviceDayCount = daily.length;
  const volumeDays = daily.filter((day) => day.issuedCount !== null
    && day.returnedCount !== null && day.calledCount !== null);
  const volumeServiceDayCount = volumeDays.length;
  return {
    includedSessionCount: included.length,
    includedServiceDayCount: serviceDayCount,
    volumeServiceDayCount,
    pendingReviewCount: selected.filter((session) => session.effectiveDisposition === 'needs_review').length,
    excludedSessionCount: selected.filter((session) => session.effectiveDisposition.startsWith('excluded_')).length,
    observedTicketCount: waits.length,
    medianWaitMinutes: roundMinutes(percentile(waits, 0.5)),
    averageWaitMinutes: roundMinutes(waits.length ? waits.reduce((sum, value) => sum + value, 0) / waits.length : null),
    p75WaitMinutes: roundMinutes(percentile(waits, 0.75)),
    p90WaitMinutes: roundMinutes(percentile(waits, 0.9)),
    historicalServingIntervalMinutes: roundMinutes(percentile(intervals, 0.5)),
    typicalLastCallLocalTime: formatClock(medianLast),
    medianInitialBatchSize: roundOne(percentile(initialBatchCounts, 0.5)),
    averageIssuedPerServiceDay: roundOne(volumeServiceDayCount
      ? volumeDays.reduce((sum, day) => sum + day.issuedCount!, 0) / volumeServiceDayCount
      : null),
    averageReturnedPerServiceDay: roundOne(volumeServiceDayCount
      ? volumeDays.reduce((sum, day) => sum + day.returnedCount!, 0) / volumeServiceDayCount
      : null),
    daily,
  };
}
