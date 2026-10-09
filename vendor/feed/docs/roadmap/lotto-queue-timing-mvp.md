# LOTTO Queue Timing MVP in FEED

**Status:** Implemented in FEED v1.6.0 and LOTTO v1.21.0. Production activation
and unattended scheduling remain rollout work.

**Depends on:**
[`lotto-daily-summary-contract.md`](lotto-daily-summary-contract.md). The active
operator and data-quality contract is also summarized in
[`../data-management/lotto-queue-data.md`](../data-management/lotto-queue-data.md).

## Outcome

FEED will ingest immutable, privacy-minimized LOTTO session closeouts and add a
**Queue Timing** card to Service Analytics. The first production release will
answer:

- What was the typical observed ticket wait?
- How variable were waits, including the 75th and 90th percentiles?
- How quickly were tickets called once service began?
- When was the last ticket usually called?
- How many tickets and service days support those answers?

This is a third Service evidence family. It is not formal intake and is not the
Service Log:

| Evidence | Grain | Answers |
| --- | --- | --- |
| Link2Feed / SIMC | Encounter, household, person | Visits, people, demographics |
| Service Log | Daily operational observation | Delivery method, capacity, unmet demand |
| LOTTO | Queue session and anonymous ticket timing | Wait, call pace, ticket outcomes, queue closeout |

LOTTO counts are never added to household or people totals. A physical ticket
is not proof of one household, one person, or completed pantry service.

## Source assumption that gates the label

The MVP records issuance when a ticket first enters LOTTO's `generatedOrder`.
Before production calls the resulting duration **ticket wait**, staff must
confirm that full generation, batch generation, and append occur when the
corresponding physical tickets are issued.

If tickets are routinely handed out materially earlier, the data remains
useful but FEED must label the metric **queue-entry to call** until LOTTO gains a
separate issuance action. The calculation does not change; only the claim does.

## Architecture decision

Three approaches were considered.

### 1. FEED reconstructs LOTTO snapshots

This offers a possible one-time best-effort backfill, but it is not a forward
architecture. Snapshots expire, recalls overwrite `calledAt`, and undo/restore
creates branches that need interpretation. It cannot become the authoritative
record.

### 2. LOTTO writes a complete append-only event ledger

This is the strongest long-term design and would support recall frequency,
event replay, abandonment, and detailed state-transition analysis. It adds
event semantics, more schema, reconciliation, and local-file parity beyond what
the first FEED card needs.

### 3. LOTTO accumulates active-session timing facts and writes an immutable
closeout

This captures issuance, first call, batch, and final outcome in the existing
state-manager flow, then preserves the needed evidence at Reset. It fits
LOTTO's current atomic-state architecture and keeps the first release small.

**Decision:** use approach 3 for the MVP. Do not block durable forward capture
on a general event platform. Revisit approach 2 only when a concrete analytical
or operational question requires event-level history.

## Delivery sequence

### Slice 1 — LOTTO forward capture

Implement and deploy the source contract first. This starts the durable record
even while FEED work remains pending.

The deployment should occur between service days when no active queue exists.
For at least the first several service days, verify:

- batch timestamps match the staff issuance workflow;
- first calls survive recalls;
- returned-before-call and returned-after-call outcomes reconcile with the
  session;
- Reset writes a closeout and only then clears the queue; and
- undo/re-close behavior produces an idempotent result or a new revision as
  appropriate.

### Slice 2 — FEED connection and manual synchronization

Add one organization-wide LOTTO integration configuration containing:

- base endpoint URL;
- encrypted bearer token and salt, using FEED's existing encryption service;
- enabled/disabled state;
- opaque source cursor;
- last successful synchronization time;
- last source `recordedAt` ingested; and
- the latest safe, staff-facing failure summary.

This is shared organization state. It must not carry an owner/user id or be
filtered by the logged-in staff member.

The MVP uses a staff-level **Sync now** action with visible last-sync status.
Administrators alone configure the endpoint and encrypted token. It does not
query LOTTO live from Analytics and it does not make LOTTO
push during Reset. A failed FEED request can therefore never prevent LOTTO from
closing the service day.

LOTTO generates the one active token from its authenticated History card and
stores only a one-way hash. Generating a replacement invalidates the previous
token immediately. FEED preserves its cursor when the URL is unchanged; token
replacement is authorization maintenance, not a new source.

Manual synchronization is intentional for the first production release:
FEED's durable imports are staff-observed workflows, while its current
background helpers are not a persistent scheduler. Once production revisions,
credentials, and failure recovery are proven, unattended daily pull can call
the same service without changing the source contract.

### Slice 3 — Local immutable ingestion

Persist LOTTO data locally before Analytics reads it. A suitable conceptual
model is:

- `LottoIntegrationConfiguration`: singleton shared connection and cursor;
- `LottoSyncRun`: one attempted pull with start/end/outcome/counts;
- `LottoSessionRevision`: immutable source revision and provenance; and
- `LottoTicketObservation`: anonymous child observations for that revision.

Exact Prisma names may change during implementation, but these invariants do
not:

- `(source, summaryId)` is unique;
- `(source, sessionId, revision)` is unique;
- old revisions remain stored;
- Analytics selects the greatest revision for each session;
- staff classifications apply only to the exact source revision reviewed, so a
  corrected late revision is evaluated independently;
- one transaction inserts a complete page and advances the cursor;
- a failed page does not advance the cursor;
- retrying a page is a no-op for records already present;
- session and observation counts reconcile before activation; and
- source payloads, bearer tokens, and physical ticket numbers never enter
  application logs or error details.

The pull follows LOTTO's append-order cursor (`recordedAt`, `summaryId`). Service
date is a filter and analytical dimension, not the incremental ordering key. A
corrected revision for an older service date must still arrive after the
current cursor.

Forward synchronization is not an uploaded file, so it does not masquerade as
an Add Data parser or create a `ServiceImport` with a fake file hash. The
one-time historical snapshot converter does emit a canonical LOTTO queue CSV;
that artifact enters through Add Data and receives normal file provenance.

### Slice 4 — Service Analytics payload

Extend the existing `getServiceAnalytics` result with a separate
`queueTiming` branch. Do not fold LOTTO into formal intake `coverage.sources`
or `summary.households`.

A conceptual payload is:

```ts
queueTiming: {
  coverage: {
    firstDate: string | null;
    lastDate: string | null;
    serviceDays: number;
    sessions: number;
    issuedTickets: number;
    observedWaits: number;
    uncalledTickets: number;
    returnedBeforeCallTickets: number;
    partialSessions: number;
    label: 'ticket_wait' | 'queue_entry_to_call';
  };
  summary: {
    medianWaitSeconds: number | null;
    averageWaitSeconds: number | null;
    p75WaitSeconds: number | null;
    p90WaitSeconds: number | null;
    medianServingIntervalSeconds: number | null;
    typicalLastCallLocalMinute: number | null;
    medianInitialBatchSize: number | null;
    averageIssuedPerServiceDay: number | null;
    averageReturnedPerServiceDay: number | null;
  };
  daily: Array<{
    serviceDate: string;
    issuedCount: number | null;
    returnedCount: number | null;
    calledCount: number | null;
    initialBatchIssuedCount: number | null;
    observedWaits: number;
    medianWaitSeconds: number | null;
    p90WaitSeconds: number | null;
    lastCallAt: string | null;
    lastCallLocalMinute: number | null;
    tenthCallLocalMinute: number | null;
    twentyFifthCallLocalMinute: number | null;
    fiftiethCallLocalMinute: number | null;
  }>;
}
```

The final type may carry additional provenance needed by the existing report
contract, but the meanings above are fixed.

Service range provenance must include the new family. **All Time** starts at
the earliest date reached by intake, Service Log, or LOTTO, and Service
`dataAsOf` is the latest date actually reached by any selected Service evidence.
Adding LOTTO must not make a requested end date look like a recorded-through
date.

## Calculation contract

### Eligible ticket waits

For each current session revision:

```text
waitSeconds = (firstCalledAt - issuedAt) / 1000
```

Include observations with both timestamps and a non-negative duration:

- `called`;
- `unclaimed`; and
- `returned_after_call`.

Exclude, without converting to zero:

- `returned_before_call`;
- `not_called`;
- partial legacy observations missing either timestamp; and
- invalid negative durations, which must be disclosed as source-quality
  warnings rather than clamped.

`uncalledTickets` includes both `returned_before_call` and `not_called` issued
observations. `returnedBeforeCallTickets` keeps that important subset visible;
neither is a duration or a zero-minute wait.

The summary median, average, p75, and p90 pool eligible ticket observations
across the selected date range. That answers the experience of a typical
called ticket. Daily medians remain available in `daily` so one large service
day does not masquerade as the typical day.

The median is the plain-language **typical wait**. The average is retained for
comparison but is more affected by unusually long waits. P75 and p90 are
historical thresholds—75% or 90% of eligible observations were at or below the
value. They are not a promise, a forecast, or by themselves proof that a day
was busy.

Use one documented quantile definition everywhere. FEED's existing
procurement calculation uses sorted values with linear interpolation at
`(n - 1) × percentile`; extract or reuse that definition rather than adding a
second percentile convention.

### Historical serving interval

Within each service date, sort distinct `firstCalledAt` values and calculate
the non-negative gaps between adjacent calls. Pool those gaps for the selected
range and report their median. Recalls do not create another interval because
they do not change `firstCalledAt`.

This is throughput, not wait. It must remain separately labelled.

### Last ticket called

For each service date, the last-call instant is the greatest
`firstCalledAt` among current session revisions on that date. If more than one
session was closed for one service date, collapse them to that daily maximum.
`closedAt` is Reset time and must never substitute for last call.

Convert each daily instant to local minutes after midnight in that session's
stored timezone. **Typical last call** is the median of those daily local clock
values. Display the denominator as service days, for example:

```text
Typical last ticket called: 1:47 PM · 14 service days
```

The wording is “last ticket called,” not “highest ticket number.” Random mode
makes the latter meaningless.

### Wait by batch

Batch sequence is captured in the MVP source so the data is not lost. The first
FEED card does not need a batch comparison control. Retain the dimension in the
local model and add the visualization after the end-to-end path is stable.

## Classification before Analytics

FEED stores every source session, including likely tests and incomplete
resets. Rules version 1 automatically includes a session only when all four
strong signals are present: all activity is within the configured operating
window plus or minus one hour, every issued ticket was called, the mode changed
from Random to Sequential, and tickets were appended. Complete timing coverage
and no unpaired legacy calls are also required.

Missing a signal does not prove testing. FEED marks the session **Needs review**
and withholds it from Analytics. Staff can append a reasoned Include or Exclude
classification; the source closeout remains immutable. LOTTO never interrupts
Reset to ask the question.

## Queue Statistics and daily charts

Add a selectable **Queue Statistics** card and two daily chart cards to the
Service lens. They render only when reviewed LOTTO coverage reaches the
selected range. Keep the original `service-queue-timing` identifier for the KPI
card so saved report selections survive the visible-title change.

The Queue Statistics card contains:

- median initial-batch size as the typical initial issuance;
- average tickets issued per included pantry day;
- average tickets returned per included pantry day;
- median wait as the plain-language headline;
- average, p75, and p90 wait;
- median serving interval, visibly separate from wait;
- typical last ticket called;
- observed-ticket and service-day denominators.

**Queue Volume by Pantry Day** plots issued, returned, called, and initial-batch
ticket counts. Called means a ticket has an observed `firstCalledAt`; it is
never calculated as issued minus returned. A ticket can be returned after a
call, and an issued non-returned ticket can remain uncalled. If multiple
reviewed sessions share a service date, totals are summed but only the earliest
session's first batch is that day's initial issuance. A day containing
`partial_legacy` coverage has unknown total volume, so these four points are
gaps and the day is excluded from the volume averages rather than converted to
zero.

**Call Milestones by Pantry Day** plots the stored local clock minute of the
10th, 25th, 50th, and last observed first call. A day that did not reach a
milestone has a missing point, not a zero. These are clock times answering when
the queue reached each point; elapsed throughput remains a separate possible
analysis.

The footer discloses:

- whether the start is confirmed ticket issuance or the queue-entry proxy;
- that tickets never called are excluded from duration statistics, with their
  count;
- partial legacy-session coverage, when present; and
- that recalls use the first call.

All three cards must follow the Analytics report contract: shared card
accessors provide display-ready results to PDF and CSV from the same backend
payload rendered on screen. Do not recalculate source metrics in React or
inside the print renderer.

## MVP acceptance criteria in FEED

- An administrator can configure the LOTTO endpoint and bearer token without
  editing environment files; any staff member can synchronize and review.
- The bearer token is encrypted at rest and never returned after save.
- A failed page does not advance the cursor beyond the last fully committed
  page; records from earlier complete pages remain safely ingested.
- Repeating an identical pull creates no duplicate sessions or observations.
- A later revision of an older service date is ingested and becomes current;
  the superseded revision remains auditable.
- LOTTO remains a separate queue evidence family and does not change formal
  households, people, visits, or Service Log totals.
- Wait eligibility and every denominator follow this document.
- The Service screen, report PDF, and per-card CSV use the same card accessor.
- Coverage distinguishes no record, an explicit zero count, a ticket not
  called, and a partial legacy observation.
- Tests cover cursor atomicity, retry idempotency, late revisions, contract
  validation, privacy, timezone boundaries, quantiles, outcomes, multiple
  sessions on one date, payload/card parity, and ASK-aligned failures.
- Data-management, Service Analytics, user-guide, schema, backup/restore, and
  changelog documentation are updated with the implementation.

## Production rollout

1. Deploy LOTTO v1.21.0 capture and closeout first, between service days.
2. Observe several real sessions and verify the issuance assumption and
   closeout reconciliation.
3. Deploy FEED v1.6.0 configuration, staff **Sync now**, review queue, shared
   analytics payload, and Queue Timing card; inspect revisions and repeat
   syncs before relying on the card.
4. Import and classify the preserved canonical history through Add Data.
5. Add unattended daily synchronization only after manual recovery and late
   revision behavior have been exercised in production.

Each slice is independently useful and reviewable. FEED work cannot delay the
moment LOTTO begins preserving history.

## After the MVP

- Wait by initial versus later batch.
- Wait and last-call distributions by weekday or configured service window.
- Daily distribution and outlier inspection.
- Completion/censoring rates and source-quality administration.
- Scheduled synchronization and staleness alerts.
- A clearly labelled, best-effort snapshot backfill for pre-MVP days.
- A full LOTTO event ledger if recall or event-transition analysis warrants it.

LOTTO's current 2.2-minutes-per-ticket estimate remains a separate planned
capacity assumption. A later LOTTO setting may derive it from:

```text
planned minutes per ticket = configured service-window minutes / intake capacity
```

That value should be shared by every live LOTTO estimate and snapshotted with
the session policy in effect. It must not be silently replaced or automatically
tuned from observed FEED analytics.
