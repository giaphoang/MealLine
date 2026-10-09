# LOTTO → FEED Queue Session Contract

**Status:** Implemented in LOTTO v1.21.0 and consumed by FEED v1.6.0.

**Reviewed:** 2026-08-22 against LOTTO v1.21.0 in
`/Users/russbook/Repos/lotto`.

## Purpose

LOTTO manages the live ticket queue. FEED needs durable, privacy-minimized
facts for historical Service analytics without reading LOTTO's Neon database
or depending on LOTTO while a report is generated.

LOTTO owns two responsibilities for FEED v1.6.0:

1. capture when each ticket enters the queue and when it is first called, then
   close the active raffle session into durable append-only history when staff
   choose **Reset for New Day**; and
2. expose those immutable closeout revisions through a versioned, read-only,
   machine-authenticated API that FEED can ingest incrementally.

This is a source contract, not a shared database model. LOTTO may change its
internal schema without changing the API as long as the v1 meanings remain
stable.

## Evidence boundary

### What LOTTO records today

The live `RaffleState` has:

- an inclusive configured ticket range (`startNumber` → `endNumber`);
- tickets actually placed into the queue (`generatedOrder`);
- final `returned` / `unclaimed` flags in `ticketStatus`; and
- one latest call timestamp per distinct ticket in `calledAt`.

The configured range and generated order are not interchangeable. LOTTO's
current Admin UI calls the inclusive range **Tickets Issued**, but a partial
batch may configure more numbers than have entered `generatedOrder`. The v1
integration contract therefore uses separate `configuredCount` and
`issuedCount` meanings.

Current state can support counts and an approximate call pace. It cannot
support defensible ticket wait because it does not retain issuance time and a
recall overwrites the earlier `calledAt` value.

### What the MVP adds

For this contract, **issuance** means the successful state transition that
first adds a ticket to `generatedOrder`. Capture one server timestamp for the
whole transition and assign it to every ticket added by:

- a full initial generation;
- an initial or subsequent `generateBatch`; or
- `appendTickets`.

This is a valid client-wait start only if that transition matches the staff
workflow in which the physical tickets are issued. Production acceptance must
observe that workflow. If staff routinely hand tickets out materially before
they sort the batch in LOTTO, FEED must label the duration **queue-entry to
call** or LOTTO must add a separate issuance action. It must not silently call
the later timestamp the moment the client received the ticket.

Also retain `firstCalledAt` separately from the existing latest-call
`calledAt`. The first value is write-once within the active state: recalling a
ticket may update the current client-facing call timestamp but must not change
the wait observation.

The resulting observation is:

```text
observed ticket wait = firstCalledAt - issuedAt
```

Historical serving interval remains a different measure: sort first-call
timestamps within a service day and calculate the gaps between adjacent calls.
Neither value replaces LOTTO's planned live estimate.

## Active-session model

Create a stable `sessionId`, `sessionStartedAt`, and `serviceDate` in the same
successful transition that first issues tickets. `serviceDate` is the local
calendar date at that instant in the session's stored IANA `timezone`. Preserve
all three values through every state mutation and snapshot; default/reset state
has none of them.

For every issued ticket retain, at minimum:

- batch sequence;
- issuance timestamp;
- first-call timestamp, when observed; and
- enough final status to derive the closeout outcome.

Each batch also retains its sequence, issuance timestamp, issuance mechanism
(`full`, `batch`, or `append`), mode, and ticket count. Sequence values start at
one and increase within a session.

Older persisted state must continue to load. Do not fabricate issuance or
first-call timestamps for a pre-MVP active session. Mark its timing coverage as
partial, preserve the facts observed after deployment, and document the
limitation in its closeout. Deploying between service days is the preferred
production migration.

## Closeout model

### When a closeout is written

`Reset for New Day` is the v1 closeout boundary. If current state contains no
active range, issued tickets, calls, or final ticket statuses, reset without
writing an empty summary.

For a meaningful session, write the closeout before clearing state. In
Postgres, the closeout insert, reset snapshot, and singleton-state replacement
must be one transaction. The local file fallback must provide the same
observable guarantee: it must never clear active state unless the closeout has
already been durably written. A closeout committed before a failed local-state
write is acceptable because retry idempotency prevents duplication and the
active session remains recoverable.

Snapshot cleanup must never delete session closeouts.

### Immutable revisions and idempotency

A closeout row is immutable. Store:

- `summaryId`: unique id for this immutable revision;
- `sessionId`: stable id shared by all revisions of one raffle session;
- `revision`: one-based, increasing within the session;
- `supersedesSummaryId`: previous revision id, or `null`;
- `contentHash`: deterministic hash of the contract's source facts; and
- `recordedAt`: UTC instant this immutable revision was committed.

Calculate `contentHash` from a canonical serialization of the stable session
metadata, range, batches, counts, timing coverage, and anonymized ticket
observations. Exclude closeout/revision metadata (`summaryId`, `revision`,
`supersedesSummaryId`, `isCurrent`, `closedAt`, `recordedAt`, and the hash
itself), or an unchanged re-close could never be idempotent. `serviceDate` is a
stable session fact and is included. Enforce uniqueness for both
`(sessionId, revision)` and `(sessionId, contentHash)`.

The same `sessionId` + `contentHash` is idempotent. A reset retry, or an undo
followed by an unchanged re-reset, returns the existing closeout instead of
appending a duplicate. If staff undo the reset, change the restored session,
and reset again, append a revision that supersedes the earlier one. Never
update or delete an older revision.

The API returns every immutable revision so FEED can retain the source record
and select the greatest revision for each `sessionId`. It may include a derived
`isCurrent` flag for convenience, but that flag is not maintained by mutating
old rows.

## Contract v1

### Endpoint

```text
GET /api/integrations/feed/v1/daily-summaries
```

Query parameters:

- `from`: optional inclusive `YYYY-MM-DD` service date filter;
- `to`: optional inclusive `YYYY-MM-DD` service date filter;
- `cursor`: optional opaque cursor returned by the previous page; and
- `limit`: optional page size, default 100, maximum 500.

Incremental delivery order is `recordedAt`, then `summaryId`, ascending. The
cursor encodes that order. This is deliberately not service-date order: an undo
and corrected re-close can append a new revision for an older service date, and
a service-date cursor could skip it forever. `from` and `to` filter session
facts; they do not change cursor semantics.

### Authentication

Require `Authorization: Bearer <token>` on every request. This is a dedicated
machine-to-machine integration token, not a NextAuth browser session and not a
database credential. An administrator generates it from LOTTO's History card;
LOTTO stores one SHA-256 hash in a singleton Neon row and displays plaintext
once. Generating another token atomically replaces the hash and immediately
invalidates the prior value. Missing configuration fails closed. Compare hashes
without a timing-sensitive plain-string branch and never log the token, hash,
or authorization header.

FEED stores its copy in an organization-wide integration configuration and
encrypts it with FEED's existing encryption machinery. Do not store it in a
per-user record or invent another key-management system.

### Success envelope

```json
{
  "contractVersion": 1,
  "summaries": [
    {
      "summaryId": "summary_...",
      "sessionId": "session_...",
      "revision": 1,
      "supersedesSummaryId": null,
      "contentHash": "sha256:...",
      "isCurrent": true,
      "serviceDate": "2026-08-20",
      "timezone": "America/Los_Angeles",
      "sessionStartedAt": "2026-08-20T18:00:00.000Z",
      "closedAt": "2026-08-20T21:10:00.000Z",
      "recordedAt": "2026-08-20T21:10:00.125Z",
      "mode": "random",
      "timingCoverage": "complete",
      "serviceDateBasis": "first_issue",
      "operatingWindow": {
        "day": "thursday",
        "isOpen": true,
        "openTime": "11:00:00",
        "closeTime": "14:00:00"
      },
      "ticketRange": {
        "start": 640,
        "end": 643
      },
      "configuredCount": 4,
      "issuedCount": 3,
      "calledCount": 2,
      "unclaimedCount": 1,
      "returnedCount": 1,
      "notCalledCount": 0,
      "unpairedCallCount": 0,
      "activitySignals": {
        "allIssuedTicketsCalled": false,
        "switchedRandomToSequential": false,
        "appendedTickets": false
      },
      "batches": [
        {
          "sequence": 1,
          "issuedAt": "2026-08-20T18:00:00.000Z",
          "issuedCount": 2,
          "mechanism": "batch",
          "mode": "random"
        },
        {
          "sequence": 2,
          "issuedAt": "2026-08-20T18:30:00.000Z",
          "issuedCount": 1,
          "mechanism": "batch",
          "mode": "random"
        }
      ],
      "ticketObservations": [
        {
          "sequence": 1,
          "batchSequence": 1,
          "issuedAt": "2026-08-20T18:00:00.000Z",
          "firstCalledAt": "2026-08-20T18:42:15.000Z",
          "outcome": "called"
        },
        {
          "sequence": 2,
          "batchSequence": 1,
          "issuedAt": "2026-08-20T18:00:00.000Z",
          "firstCalledAt": "2026-08-20T18:47:30.000Z",
          "outcome": "unclaimed"
        },
        {
          "sequence": 3,
          "batchSequence": 2,
          "issuedAt": "2026-08-20T18:30:00.000Z",
          "firstCalledAt": null,
          "outcome": "returned_before_call"
        }
      ]
    }
  ],
  "nextCursor": "opaque-cursor",
  "hasMore": false
}
```

`openTime` and `closeTime` are local wall-clock values. Contract v1 accepts
both `HH:mm` and SQL `TIME` serialization as `HH:mm:ss`; they are semantically
equivalent and FEED ignores seconds when applying the one-hour margin.

### Field meanings

- `serviceDate` is fixed when the session first issues tickets, in the stored
  timezone. A late Reset cannot move the service into the following day.
- `serviceDateBasis` is `first_issue` for complete forward capture,
  `legacy_activity` for reconstructed state, or `closeout` only when no earlier
  activity instant can be recovered.
- `sessionStartedAt` is that first successful issuance transition.
- `closedAt` is the Reset closeout instant; it is not the last-call time.
- `recordedAt` is the append instant used for incremental delivery.
- `timingCoverage` is `complete` or `partial_legacy`. FEED excludes unknown
  issue/call pairs from wait statistics and discloses partial coverage.
- `configuredCount` is the size of the inclusive configured range.
- `issuedCount` is the number of distinct tickets first added to
  `generatedOrder`; it equals `ticketObservations` with a non-null `issuedAt`.
- `calledCount` is the number of issued tickets with a retained
  `firstCalledAt`. `unpairedCallCount` separately reports legacy or invalid
  calls for which no issuance observation exists.
- `unclaimedCount` and `returnedCount` count final mutually exclusive LOTTO
  statuses. `notCalledCount` counts issued tickets with no first call and no
  returned status at closeout.
- `batches` describe issuance transitions, not later calls.
- `operatingWindow` snapshots the configured service window effective when the
  session begins. FEED, not LOTTO, uses it for classification.
- `activitySignals` reports source facts needed by FEED's authenticity rule.
  LOTTO does not classify a reset as service or testing.
- `ticketObservations` omit physical ticket numbers. `sequence` is a
  deterministic anonymous closeout sequence. `batchSequence` and `issuedAt`
  may be null only for a disclosed partial legacy observation; otherwise the
  batch sequence refers to the matching batch.
- `outcome` is one of `called`, `unclaimed`, `returned_before_call`,
  `returned_after_call`, or `not_called`.
- All timestamps are ISO-8601 UTC strings. Counts and sequence values are
  non-negative integers.

Every non-empty page returns an opaque `nextCursor`, including the final page;
`hasMore` states whether another page is already available. An empty page may
return `nextCursor: null`, and FEED retains its previously committed cursor.

The count fields must reconcile with the observations. Unknown additive fields
may appear in v1 and consumers must ignore them. A meaning change, removal, or
incompatible type requires a future `/v2/` endpoint.

### Error behavior

- `400` for invalid dates, filter order, limits, or cursors;
- `401` for a missing or invalid bearer token;
- `503` when the integration token or summary store is not configured; and
- `500` for an unexpected server failure.

Return calm JSON errors without internal paths, SQL, stack traces, secrets, or
raw exception text. Send `Cache-Control: no-store` on success and error
responses.

## Privacy boundary

The response contains counts, session metadata, batch metadata, and anonymous
timing observations. It must not contain names, email addresses, browser or
staff-session ids, staff identities, IP addresses, or a physical
ticket-number-to-time/status mapping. FEED does not need the physical number to
calculate any MVP statistic.

## Acceptance criteria in LOTTO

- Full generation, every batch generation, and append assign one issuance
  timestamp to each newly issued ticket without rewriting earlier timestamps.
- Every call path, including auto-advance after a return, preserves the first
  call while existing latest-call behavior continues to work.
- Configured count and issued count remain distinct during partial batching.
- Active legacy state loads without fabricated timing facts and closes with
  disclosed partial coverage.
- The canonical `schema.sql` and deployment documentation include the
  append-only store and singleton integration-token hash.
- The authenticated Admin History card generates and displays a token once;
  generating another immediately invalidates the previous token.
- Database and local-file state managers provide equivalent closeout
  semantics.
- Reset writes a meaningful closeout before clearing state; blank reset writes
  none.
- Retried reset and unchanged undo/re-reset do not duplicate a revision;
  changed re-reset appends a superseding immutable revision.
- Snapshot cleanup cannot remove summaries.
- Service dates are correct across UTC boundaries and daylight-saving changes.
- Pagination by append order delivers a late revision of an old service date
  after an already-issued cursor.
- The endpoint rejects unauthenticated requests, validates filters/cursors,
  reconciles counts, and never exposes physical ticket numbers.
- Tests cover database and file paths, legacy compatibility, issuance and
  first-call capture, recall behavior, return auto-advance, closeout
  calculations, revision/idempotency, authentication, privacy, pagination, and
  failure atomicity.
- LOTTO updates `CHANGELOG.md`, `.env.example`, deployment documentation, the
  implementation contract, and affected staff Help guides.

## FEED follow-on

FEED's importer, local revision model, calculation rules, Analytics card, and
staged rollout are specified in
[`lotto-queue-timing-mvp.md`](lotto-queue-timing-mvp.md).
