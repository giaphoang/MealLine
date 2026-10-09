# Procurement Ingestion Architecture

**Status:** Proposal. Nothing here is implemented. Written after the 1.5.0-beta.1
import failures on the production Raspberry Pi, and grounded in the measurements
in "What we actually measured" below rather than in reasoning about what
*ought* to be slow.

**Decision needed from the maintainer** before any of this is built: the
atomicity question in §4. Everything else follows from it.

---

## 1. What went wrong, precisely

A five-year OFB export failed to import on the production Pi. The same file
imported cleanly on a developer Mac. Same commit, same images, same data.

Three ceilings turned "slow" into "failed", and it matters which one fired:

| Ceiling | Where | Value |
|---|---|---|
| Interactive transaction timeout | `src/db.ts` | 20s |
| nginx `proxy_read_timeout` | `docker/nginx.conf` | 60s (was default) |
| Cloudflare tunnel request timeout | infrastructure | ~100s |

The 20s ceiling fires first. When it does, Prisma aborts with `P2028` and rolls
the transaction back — so no partial data, but also no import.

The generic "An unexpected error occurred" the user saw was **not** a defect in
the error map. When nginx times out it returns its own HTML error page;
`ErrorHandlerService.isUserPresentableMessage` correctly refuses to show HTML to
a user and falls back to the generic string. The backend never got a chance to
write an ASK-compliant message, because the failure happened above it. Any fix
that only edits copy will not touch this.

## 2. What we actually measured

Benchmarked against the real exports with
`scripts/benchmark-procurement-import.ts` (reads from `FEED_PRIVATE_DATA_DIR`;
real data lives in a directory outside this repository and stays there).

The import was issuing **four sequential queries per order** plus **one upsert
per distinct product**. On the largest export — 944 orders, 900 products,
17,814 rows — that is 4,707 round-trips inside a single transaction.

| Export | Before | After | Factor |
|---|---|---|---|
| 2009–2019 (944 orders) | 4,707 | 327 | 14.4× |
| 2020–2025 (701 units) | 3,984 | 304 | 13.1× |
| 2025–2026 (517 units) | 2,687 | 149 | 18.0× |
| Rollback of 944 orders | ~2,800 | 8 | ~350× |

Parsing was never the problem: 175ms for the largest file, 14% of total time.
An earlier diagnosis that blamed a blocking parse was wrong, and is recorded
here so it is not re-derived.

**The portable number is query count, not elapsed time.** Latency is a property
of the disk; count is a property of our code. This Mac runs ~0.23ms per query,
so 4,707 queries took 1.09s and fit inside 20s with room to spare. The Pi only
had to be **4.3× slower per query** to fail. SD card against NVMe is routinely
10–50×, which makes the production failure expected rather than mysterious.

After the fix, the Pi would need to be ~60ms per query — roughly 260× slower
than this Mac — before the same ceiling is threatened.

## 3. What has already changed

Landed on `perf/procurement-import-throughput`:

- **Set-based writes** in both import paths and in rollback/restore. `groupBy`
  for prior revisions, one `updateMany` to clear `isCurrent`, `createMany` for
  revisions and lines, bulk product resolution. Atomicity unchanged.
- **WAL mode** (`src/db.ts`). In the previous rollback-journal mode a write
  transaction blocked *readers*, so one import made the app appear frozen to
  everyone. WAL lets reads proceed against the last commit. Plus
  `busy_timeout = 5000` so a concurrent write waits rather than failing with
  `SQLITE_BUSY`.
- **nginx `/api/` timeouts** raised to 300s, so the backend's own ceiling is the
  meaningful limit and failures produce an application message rather than an
  HTML 504.
- **Import timing logs**, success and failure, including the Prisma error code —
  so one production run distinguishes "this host is too slow" from a data
  problem.

This is expected to be sufficient for FEED's current scale. It does **not** make
ingestion scale in the general sense, which is what the rest of this document is
about.

## 4. The atomicity decision

Everything below depends on this, and it is a data-integrity judgment about the
pantry's records rather than a technical preference.

**Today:** one transaction, all-or-nothing. A failure leaves the database
exactly as it was. The guarantee is strong and easy to reason about. The cost is
that the unit of work is the whole file, so the file size a host can ingest is
bounded by that host's speed against a fixed timeout.

**Proposed (maintainer's stated preference):** an import is "complete" only when
every row has landed, but partial progress is durable. A failure flags the
import **incomplete** and tells the user which portion landed; retrying imports
only what is missing.

That design is sound, and the schema already supports it: `sourceOrderReference`
plus the revision/supersede model gives row-level identity, so "already
imported" is answerable per order rather than only per file.

Two things it must handle that the current design does not:

1. **The file-hash short-circuit conflicts with partial imports.** Today a
   matching `fileHash` short-circuits to `outcome: 'duplicate'` — "This OFB
   export is already current." If an incomplete import records its hash, the
   retry is rejected as a duplicate and the missing rows can never land. Hash
   recording must become conditional on completion, or move to row level.

2. **Partial data is more dangerous than no data, unless disclosed.** A failed
   all-or-nothing import leaves obviously nothing. A partial import leaves
   Analytics quietly wrong. This is the strongest argument for the current
   design, and the mitigation is disclosure rather than avoidance: the import
   must carry an explicit `incomplete` state, and every surface that aggregates
   procurement data must show it. The Data Management coverage strip and import
   status badges are the natural place; that machinery already exists.

**Recommendation:** do not adopt this yet. The measured fix removed the pressure
that motivated it, and shipping a weaker integrity guarantee to a live pantry to
solve a problem that no longer reproduces is a poor trade. Revisit when there is
a concrete case the current design cannot serve — a materially larger dataset, a
second agency, or an import that legitimately exceeds a minute of work.

## 5. Progress and cancellation (independent of §4)

These are worth doing regardless of the atomicity decision, because they are UX
defects rather than architectural ones.

**Today:** the modal disables Cancel during import (`disabled={isImporting}`)
and blocks dismissal (`onOpenChange` gated on `!isImporting`). There is no
`AbortController`, so a hung request traps the user with a muted "Importing…"
and no sense of whether it is working or dead.

**Proposed:**

- Report progress over the **existing** SSE channel. `/api/alerts/stream` is
  already configured for long-lived connections (`proxy_read_timeout 1h`) and
  `alertEventEmitter` already exists. No new infrastructure, no queue service,
  nothing extra to run on the Pi.
- Emit coarse phase transitions — parsed, writing, complete — plus a row count.
  Precise percentages are not worth per-row event overhead.
- Wire Cancel to an `AbortController` and abort the transaction server-side.
- Show elapsed time once past a few seconds. "This is taking longer than usual"
  is more honest than a spinner that cannot distinguish slow from broken.

**Model to follow:** `services/translation-trigger.ts` is an existing in-process
async queue in this codebase. Prefer extending that pattern over introducing
BullMQ or Redis — a single-node pantry appliance should not gain a broker.

## 6. If ingestion must scale further

Only relevant if §4 is revisited. In rough order of value:

1. **Stream the parse.** Currently the whole file is buffered and parsed
   synchronously. Fine at 2.4MB; not fine at 100MB. `csv-parse` supports
   streaming, which caps memory regardless of file size.
2. **Chunked, resumable commits.** Requires §4. Each batch commits durably, so a
   slow host takes longer instead of failing, and a retry resumes.
3. **Move ingestion off the request path entirely.** Upload returns a job id
   immediately; the client watches progress over SSE. Removes every
   proxy-timeout consideration permanently — no request stays open.
4. **Worker thread for parsing.** Only if profiling shows parse time actually
   blocking the event loop. It did not here (175ms), so this is speculative and
   listed last deliberately.

## 7. Open questions

- What is the Pi's real per-query latency? Predicted 5–15ms; unmeasured. The
  timing logs in §3 answer this on the next production import.
- Does WAL change anything measurable on the Pi's SD card under concurrent
  read/write? Expected to help substantially; unverified on that hardware.
- Is 5MB still the right upload cap (`MAX_IMPORT_BYTES`)? The largest real
  export is 2.4MB, so there is headroom, but a full agency history could exceed
  it and the limit was presumably chosen when imports were far more expensive.
