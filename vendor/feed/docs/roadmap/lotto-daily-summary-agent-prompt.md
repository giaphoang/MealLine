# Prompt: Implement LOTTO Queue Session Summaries for FEED

**Status:** Fulfilled by LOTTO v1.21.0. Retained as the implementation brief and
review checklist for the source repository.

The delivered contract also snapshots the effective operating window and
emits source activity signals for full-call completion,
Random-to-Sequential switching, and appended tickets. LOTTO records these
facts without classifying service versus testing; FEED v1.6.0 owns that review.

Copy the prompt below into an AI coding agent whose workspace is the LOTTO
repository.

---

You are working in `/Users/russbook/Repos/lotto`.

Task 0: Read `AGENTS.md` completely and follow it throughout. This change is
within LOTTO's existing state-manager, Neon JSONB/store, Next.js route, Zod,
Vitest, and documentation patterns. Do not add a dependency or introduce a new
framework. Inspect before editing, preserve unrelated work, and use incremental
patches.

Task 1: Add durable active-session timing facts.

Verify these source facts before editing:

- `RaffleState` lives in `src/lib/state-types.ts`.
- Production persistence is `src/lib/state-manager-db.ts`; local fallback is
  `src/lib/state-manager.ts`.
- `raffle_state` is a singleton and `raffle_snapshots` is undo/redo history.
- `calledAt` stores the latest call timestamp per distinct ticket and is used
  by current client-facing behavior.
- `ticketStatus` contains final mutually exclusive `returned` / `unclaimed`
  values.
- full generation, `generateBatch`, and `appendTickets` add tickets to
  `generatedOrder`.
- `markTicketReturned` can auto-advance and call the next ticket.
- Reset is routed through `src/app/api/state/route.ts` and the Admin control is
  labelled **Reset for New Day**.
- `schema.sql` is the canonical database schema and must remain idempotent.

For this integration, a ticket is issued when a successful state transition
first adds it to `generatedOrder`. Capture one server timestamp for the whole
transition and assign it to every ticket added by full generation, every batch,
and append. Do not infer issuance from the inclusive configured range.

Add stable session metadata in the same first-issuance transition:

- `sessionId`;
- `sessionStartedAt`; and
- `serviceDate`, fixed as the local calendar date of that transition in the
  session's stored IANA timezone.

Preserve those values through every mutation and snapshot and clear them on
Reset.

Retain, at minimum, these active timing facts:

- per ticket: batch sequence, `issuedAt`, and write-once `firstCalledAt`;
- per batch: sequence, `issuedAt`, issuance mechanism (`full`, `batch`, or
  `append`), mode, and issued count.

Keep the current latest-call `calledAt` behavior unchanged. Every call path,
including direct update, next/previous navigation, and return auto-advance,
must set `firstCalledAt` only when it is absent. A recall must not rewrite it.
Use one captured timestamp for all facts written by one state transition so
the state cannot report subtly different times for the same action.

Older payloads must continue to load. Do not fabricate issue or first-call
times for an active pre-migration session. Mark timing coverage as
`partial_legacy`, preserve facts first observed after deployment, and close the
session honestly. Fresh sessions use `complete` coverage.

Task 2: Implement durable, append-only session closeouts on Reset.

If no meaningful session exists—no active range, issued tickets, calls, or
statuses—Reset without writing an empty closeout. Otherwise derive and write an
immutable summary revision before active state is cleared.

In Postgres, summary insertion, reset snapshot, and singleton-state replacement
must be one transaction. If closeout persistence fails, active state stays
intact. Give the local file fallback the same observable guarantee: write the
idempotent closeout durably before clearing state. Snapshot cleanup must never
touch summaries.

Each immutable revision contains:

- `summaryId`;
- stable `sessionId`;
- one-based `revision`;
- `supersedesSummaryId` or `null`;
- deterministic `contentHash` with a `sha256:` prefix;
- derived `isCurrent` when read;
- stable `serviceDate` and `timezone`;
- `sessionStartedAt`, `closedAt`, and `recordedAt`;
- final queue `mode`;
- `timingCoverage`: `complete` or `partial_legacy`;
- `ticketRange.start` and `.end`;
- `configuredCount`: inclusive valid range size;
- `issuedCount`: tickets with an issuance observation, normally
  `generatedOrder.length` for a fresh session;
- `calledCount`: issued tickets with `firstCalledAt`;
- final `unclaimedCount`, `returnedCount`, and `notCalledCount`;
- `unpairedCallCount` for legacy or invalid calls with no issuance fact;
- anonymous batches; and
- anonymous ticket observations.

An anonymous ticket observation is:

```ts
{
  sequence: number;
  batchSequence: number | null;
  issuedAt: string | null;
  firstCalledAt: string | null;
  outcome:
    | 'called'
    | 'unclaimed'
    | 'returned_before_call'
    | 'returned_after_call'
    | 'not_called';
}
```

Do not include the physical ticket number. Give observations deterministic
anonymous sequence values so canonical serialization is stable. Null batch or
issuance values are permitted only for facts retained from a disclosed
`partial_legacy` session; never invent the missing timestamp.

Build `contentHash` from stable session metadata, `serviceDate`, timezone, mode,
range, timing coverage, counts, batches, and observations. Exclude `summaryId`,
`revision`, `supersedesSummaryId`, `isCurrent`, `closedAt`, `recordedAt`, and the
hash itself. Add uniqueness constraints for `(sessionId, revision)` and
`(sessionId, contentHash)`.

The same session and content hash is idempotent. A retry or unchanged
undo/re-reset returns the existing revision. If staff undo, change the restored
session, and reset again, append a new immutable revision superseding the
previous one. Never delete or update the earlier revision.

Task 3: Add the versioned FEED integration endpoint:

```text
GET /api/integrations/feed/v1/daily-summaries
```

Accept optional inclusive `from` / `to` service-date filters, opaque `cursor`,
and `limit` (default 100, maximum 500).

Order incremental delivery by `recordedAt`, then `summaryId`, ascending, and
encode that order in the cursor. Do not order the cursor by service date. A
later revision of an older service date must be delivered after an already
issued cursor. Date filters do not change cursor semantics.

Return:

```json
{
  "contractVersion": 1,
  "summaries": [],
  "nextCursor": null
}
```

Use the exact source meanings above. All timestamps on the wire are ISO-8601
UTC strings. Unknown additive fields are allowed in v1; breaking changes
require a future `/v2/` route.

Require `Authorization: Bearer <token>` using a dedicated deployment secret
such as `FEED_DAILY_SUMMARY_TOKEN`. This is machine-to-machine authentication,
not NextAuth. Fail closed when it is missing, compare credentials safely, never
log the token, and send `Cache-Control: no-store` on success and errors.

Error contract:

- `400` invalid dates/filter order/limit/cursor;
- `401` missing or invalid bearer token;
- `503` integration token or summary store not configured;
- `500` unexpected failure.

Return generic, ASK-aligned JSON errors without exception text, SQL, file
paths, or secrets.

Task 4: Preserve evidence and privacy boundaries.

This contract supports observed duration from issue/queue entry to first call,
plus historical intervals between first calls. Do not conflate those measures.
Do not change or auto-tune LOTTO's existing 2.2-minutes-per-ticket planned live
estimate in this task.

Do not expose names, emails, staff/session identity, IP addresses, browser
identity, or physical ticket-number-to-time/status mappings. Counts, batch
sequence, anonymous observation sequence, and timestamps are permitted.

Task 5: Test and document completely.

Tests must cover:

- both database and local-file paths;
- full generation, initial/subsequent batch generation, and append issuance;
- one timestamp per issuance transition;
- first-call capture through every call path;
- recall preserving first call while latest `calledAt` changes;
- return auto-advance;
- configured range versus issued count in partial batching;
- all final outcomes and count reconciliation;
- active legacy compatibility without fabricated facts;
- blank Reset and transaction/failure atomicity;
- Reset retry idempotency;
- unchanged and changed undo/re-reset behavior;
- summary survival independent of snapshot retention;
- service date around UTC boundaries and daylight-saving changes;
- bearer authentication and fail-closed missing configuration;
- date validation, cursor rejection, and stable pagination;
- late revision of an old service date after an existing cursor;
- absence of physical ticket numbers and other disallowed fields; and
- generic errors that do not leak internals.

Update at least:

- `schema.sql`;
- `.env.example`;
- `docs/DEPLOYMENT.md` and the appropriate implementation/contract document;
- `CHANGELOG.md`; and
- affected staff guides under `docs/user-guides/`, per `AGENTS.md`.

Run targeted tests first, then the full LOTTO test suite, lint, and production
build. Inspect the actual diff, report pre-existing failures separately, and do
not push unless explicitly asked. If implementation discovery conflicts with
this contract, stop before changing its meanings and present concrete evidence
and alternatives.

---
