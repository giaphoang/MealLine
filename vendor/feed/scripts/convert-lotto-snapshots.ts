// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

/**
 * Convert Neon's raffle_snapshots CSV export into FEED's privacy-minimized
 * LOTTO queue-history contract.
 *
 * Usage (from packages/backend):
 *   npx ts-node ../../scripts/convert-lotto-snapshots.ts input.csv output.csv
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const requireFromBackend = createRequire(`${process.cwd()}/package.json`);
const { parse } = requireFromBackend('csv-parse/sync') as {
  parse: (input: Buffer, options: Record<string, unknown>) => unknown;
};

type SnapshotState = {
  startNumber: number; endNumber: number; mode: 'random' | 'sequential';
  generatedOrder: number[]; calledAt?: Record<string, number>;
  ticketStatus?: Record<string, 'returned' | 'unclaimed'>;
  timezone?: string; operatingHours?: Record<string, { isOpen: boolean; openTime: string; closeTime: string }>;
};
type Snapshot = { id: string; payload: SnapshotState; createdAt: number };
type Ticket = { sequence: number; batchSequence: number; issuedAt: number; firstCalledAt: number | null };
type Batch = { sequence: number; issuedAt: number; issuedCount: number; mechanism: 'full' | 'batch' | 'append'; mode: 'random' | 'sequential' };
type Session = {
  seedId: string; startedAt: number | null; serviceDate: string;
  serviceDateBasis: 'first_issue' | 'legacy_activity'; timezone: string;
  operatingWindow: { day: string; isOpen: boolean; openTime: string; closeTime: string } | null;
  timingCoverage: 'complete' | 'partial_legacy'; initialMode: 'random' | 'sequential';
  switched: boolean; appended: boolean; tickets: Map<number, Ticket>; batches: Batch[];
  last: Snapshot; lastNonEmpty: Snapshot;
};

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error('Provide the raffle_snapshots input CSV and output CSV paths.');
}

const rows = parse(fs.readFileSync(inputPath), { columns: true, bom: true, skip_empty_lines: true }) as Array<Record<string, string>>;
const snapshots: Snapshot[] = rows.map((row, index) => {
  try {
    return { id: row.id, payload: JSON.parse(row.payload) as SnapshotState, createdAt: Date.parse(row.created_at) };
  } catch {
    throw new Error(`Snapshot CSV row ${index + 2} could not be parsed.`);
  }
}).sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));

const meaningful = (state: SnapshotState) => state.startNumber !== 0 || state.endNumber !== 0
  || state.generatedOrder.length > 0 || Object.keys(state.calledAt ?? {}).length > 0;
const localDate = (at: number, timezone: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
  }).formatToParts(new Date(at)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, day: String(parts.weekday).toLowerCase() };
};
const stableHash = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

const completed: unknown[] = [];
let active: Session | null = null;

const begin = (snapshot: Snapshot, priorWasObservedEmpty: boolean): Session => {
  const timezone = snapshot.payload.timezone ?? 'America/Los_Angeles';
  const local = localDate(snapshot.createdAt, timezone);
  const hours = snapshot.payload.operatingHours?.[local.day] ?? null;
  return {
    seedId: snapshot.id, startedAt: priorWasObservedEmpty ? snapshot.createdAt : null,
    serviceDate: local.date,
    serviceDateBasis: priorWasObservedEmpty ? 'first_issue' : 'legacy_activity',
    timezone,
    operatingWindow: hours ? { day: local.day, ...hours } : null,
    timingCoverage: priorWasObservedEmpty ? 'complete' : 'partial_legacy',
    initialMode: snapshot.payload.mode, switched: false, appended: false,
    tickets: new Map(), batches: [], last: snapshot, lastNonEmpty: snapshot,
  };
};

const observe = (session: Session, snapshot: Snapshot) => {
  const previous = session.last.payload;
  if (previous.mode === 'random' && snapshot.payload.mode === 'sequential') session.switched = true;
  const priorTickets = new Set(previous.generatedOrder);
  const additions = snapshot.payload.generatedOrder.filter((ticket) => !priorTickets.has(ticket));
  if (additions.length > 0) {
    const previousRangeComplete = previous.startNumber > 0
      && previous.generatedOrder.length === previous.endNumber - previous.startNumber + 1;
    const mechanism = session.batches.length === 0
      ? (additions.length === snapshot.payload.endNumber - snapshot.payload.startNumber + 1 ? 'full' : 'batch')
      : (previousRangeComplete && additions.every((ticket) => ticket > previous.endNumber) ? 'append' : 'batch');
    const sequence = session.batches.length + 1;
    session.batches.push({ sequence, issuedAt: snapshot.createdAt, issuedCount: additions.length, mechanism, mode: snapshot.payload.mode });
    if (mechanism === 'append') session.appended = true;
    for (const ticket of additions) {
      if (!session.tickets.has(ticket)) session.tickets.set(ticket, { sequence: session.tickets.size + 1, batchSequence: sequence, issuedAt: snapshot.createdAt, firstCalledAt: null });
    }
  }
  for (const [ticketText, calledAt] of Object.entries(snapshot.payload.calledAt ?? {})) {
    const ticket = Number(ticketText);
    const timing = session.tickets.get(ticket);
    if (timing && timing.firstCalledAt === null) timing.firstCalledAt = calledAt;
  }
  session.last = snapshot;
  if (meaningful(snapshot.payload)) session.lastNonEmpty = snapshot;
};

const close = (session: Session, closedAt: number) => {
  const state = session.lastNonEmpty.payload;
  const ticketObservations = [...session.tickets.entries()]
    .sort((left, right) => left[1].sequence - right[1].sequence)
    .map(([ticketNumber, ticket]) => {
      const status = state.ticketStatus?.[String(ticketNumber)];
      const outcome = status === 'returned'
        ? (ticket.firstCalledAt === null ? 'returned_before_call' : 'returned_after_call')
        : status === 'unclaimed' ? 'unclaimed'
          : ticket.firstCalledAt === null ? 'not_called' : 'called';
      return { sequence: ticket.sequence, batchSequence: ticket.batchSequence,
        issuedAt: new Date(ticket.issuedAt).toISOString(),
        firstCalledAt: ticket.firstCalledAt === null ? null : new Date(ticket.firstCalledAt).toISOString(), outcome };
    });
  const calledCount = ticketObservations.filter((ticket) => ticket.firstCalledAt !== null).length;
  const facts = {
    serviceDate: session.serviceDate, serviceDateBasis: session.serviceDateBasis, timezone: session.timezone,
    sessionStartedAt: session.startedAt === null ? null : new Date(session.startedAt).toISOString(), mode: state.mode,
    timingCoverage: session.timingCoverage, operatingWindow: session.operatingWindow,
    ticketRange: { start: state.startNumber, end: state.endNumber },
    configuredCount: state.startNumber > 0 && state.endNumber >= state.startNumber ? state.endNumber - state.startNumber + 1 : 0,
    issuedCount: ticketObservations.length, calledCount,
    unclaimedCount: ticketObservations.filter((ticket) => ticket.outcome === 'unclaimed').length,
    returnedCount: ticketObservations.filter((ticket) => ticket.outcome.startsWith('returned_')).length,
    notCalledCount: ticketObservations.filter((ticket) => ticket.outcome === 'not_called').length,
    unpairedCallCount: 0,
    activitySignals: { allIssuedTicketsCalled: ticketObservations.length > 0 && calledCount === ticketObservations.length,
      switchedRandomToSequential: session.switched, appendedTickets: session.appended },
    batches: session.batches.map((batch) => ({ ...batch, issuedAt: new Date(batch.issuedAt).toISOString() })),
    ticketObservations,
  };
  const contentHash = stableHash(facts);
  const sessionId = `historical_${createHash('sha256').update(session.seedId).digest('hex').slice(0, 24)}`;
  completed.push({ summaryId: `historical_${contentHash.slice(7, 31)}`, sessionId, revision: 1,
    supersedesSummaryId: null, contentHash, isCurrent: true, ...facts,
    closedAt: new Date(closedAt).toISOString(), recordedAt: new Date(closedAt).toISOString() });
};

let observedEmpty = false;
for (const snapshot of snapshots) {
  if (!meaningful(snapshot.payload)) {
    if (active) { close(active, snapshot.createdAt); active = null; }
    observedEmpty = true;
    continue;
  }
  if (!active) {
    active = begin(snapshot, observedEmpty);
    const emptySeed: Snapshot = { ...snapshot, payload: { ...snapshot.payload, generatedOrder: [], calledAt: {} } };
    active.last = emptySeed;
  } else if (!snapshot.payload.generatedOrder.slice(0, active.last.payload.generatedOrder.length)
    .every((ticket, index) => ticket === active!.last.payload.generatedOrder[index])) {
    close(active, snapshot.createdAt);
    active = begin(snapshot, false);
    const emptySeed: Snapshot = { ...snapshot, payload: { ...snapshot.payload, generatedOrder: [], calledAt: {} } };
    active.last = emptySeed;
  }
  observe(active, snapshot);
  observedEmpty = false;
}
if (active) close(active, active.last.createdAt);

const output = ['FEED Schema Version,Summary JSON', ...completed.map((summary) => `1,${csvCell(JSON.stringify(summary))}`)].join('\r\n') + '\r\n';
fs.writeFileSync(outputPath, output, 'utf-8');
console.log(`Converted ${snapshots.length} snapshots into ${completed.length} privacy-minimized LOTTO sessions.`);

