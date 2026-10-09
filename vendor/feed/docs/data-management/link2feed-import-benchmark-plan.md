# Link2Feed Visit Import — Benchmark Plan (Mac vs. Pi)

**Status:** Proposed, 2026-08-14. Not started.
**Trigger:** 1.5.0-beta.10 stalled in production importing a 24 MB Link2Feed
visits export (2017 – mid-2026).
**Prerequisite reading:**
[`ingestion-architecture.md`](./ingestion-architecture.md),
[`import-throughput-evaluation-plan.md`](./import-throughput-evaluation-plan.md)
(the OFB/procurement precedent — this plan deliberately reuses its method),
[`unified-add-data.md`](./unified-add-data.md).

This is a plan, not a report. Results land in `ingestion-architecture.md` as
each phase completes, matching the procurement precedent.

---

## 1. Findings from reading the code, before any measurement

Five, recorded first because **none of them is a throughput problem and
benchmarking would not have found any of them.** Two (§1.1, §1.2) each
independently explain a stalled 24 MB import. One (§1.3) is a data-retention
defect that should be fixed before the next real import regardless of anything
else in this plan. Fixing these may make the performance question smaller than
it currently looks, so they are resolved in Phase 2 — *before* the Phase 3
benchmark — so that the benchmark measures the pipeline rather than a proxy
failure.

### 1.1 nginx rejects the file at 16 MB

`docker/nginx.conf:63` sets `client_max_body_size 16m;` on `location /api/`,
with a comment scoped to the OFB path ("allow an OFB export through … the route
enforces the real 5MB cap"). Unified Add Data was later built with a **64 MB**
staging ceiling (`MAX_STAGED_DATA_IMPORT_BYTES`,
`services/data-import/staging.ts:17`), sized explicitly against WTH's real
Link2Feed export as it stood at design time — 16,940,175 bytes
(`unified-add-data.md:176`). That file is a description in the design record,
not an artifact in this repo; the largest committed Add Data fixture is 716
bytes, and a real export is client PII that should never be committed.

**The two numbers were never reconciled.** A 24 MB upload is refused by nginx
with a 413 before a byte reaches the backend. nginx closes the connection while
the browser is still sending, which is exactly what a "stall" looks like from
the dialog — no error the client can render, no server message, a spinner that
never resolves.

Worth stating precisely, because it dates the defect: nginx's limit is 16 MiB =
16,777,216 bytes, so **the very export that justified the 64 MB staging ceiling
already exceeded the transport cap by ~163 KB at the moment that ceiling was
chosen.** The 64 MB figure was never reachable in production. Nothing in
between 16 MiB and 64 MB has ever been importable through Cloudflare + nginx,
whatever the application layer believed.

### 1.2 The whole import runs inside one synchronous HTTP request

`POST /api/data-import/jobs` (`routes/data-import.ts:291`) `await`s
`prepare(job.id)` before responding. For Link2Feed that single request performs
staging, full CSV parse and validation, all staging-row writes, the profile
dedup pass, reconciliation, and pending materialization.

- nginx allows 300s (`proxy_read_timeout`), raised deliberately after an earlier
  60s truncation.
- **Cloudflare's edge does not.** Production is served through Cloudflare Tunnel
  (`docs/deployment/raspberry-pi-cloudflare-tunnel.md`), and the Cloudflare
  proxy returns **524 at ~100 seconds** regardless of origin configuration.
  100s is the real production ceiling, and it is not written down anywhere in
  the repo.

So the effective budget on the Pi is ~100 seconds of *total* prepare time, not
the 300s nginx suggests. Phase 3 measures against 100s, not 300s.

### 1.3 Staged PII is never swept — the 24-hour expiry does not run

**This is the one finding here that is a data-protection defect rather than a
performance or UX defect, and it should be fixed before the next real import.**

A Link2Feed export is client-level PII. Uploads stream to a private staging file
under `STORAGE_PATH/data-import-staging` (`0700` directory, `0600` files, no
original filename retained) — the handling is careful, and
`unified-add-data.md:176` states staging "expires after 24 hours."

The expiry is half-built. `createDataImportJob` stamps every job with
`expiresAt = now + DATA_IMPORT_STAGING_TTL_MS` (`jobs.ts:176`), and
`deleteExpiredDataImportStaging()` (`workflow.ts:161`) correctly finds expired
jobs, deletes their staged bytes, and cleans up any pending import.

**Nothing calls it.** A repository-wide search returns exactly one occurrence:
its own definition. No boot hook, no interval, no scheduled task, not even a
test.

The normal paths do delete the staged file — success, failure, and cancel all
call `staging.delete`. The exposure is everything that escapes those paths: a
browser closed mid-import, a container restart, an unhandled error outside the
existing `catch` blocks. In any of those cases a complete Link2Feed export —
every client ID, birth year, and demographic response — remains on the Pi's SD
card **indefinitely**, in a directory documented as self-clearing within a day.

The gap is narrow but the retained data is the most sensitive FEED handles, and
the fix is small: call `deleteExpiredDataImportStaging` on backend start and on
an interval. The function already exists and already does the right thing; it
was simply never wired up.

Two things make this worth treating as its own item rather than a footnote.
First, **the documentation asserts a guarantee the code does not deliver**,
which is the kind of gap that survives review precisely because the doc reads
as evidence. Second, larger files raise the stakes: a 24 MB import is a bigger
retained artifact and a longer window in which a user gives up and closes the
tab.

### 1.4 Cancel cannot actually cancel

There is no server-side abort. Cancel is currently disabled while an import
runs, which is the honest behaviour and matches the reasoning already recorded
for the OFB dialog (`import-throughput-evaluation-plan.md` §7).

This is noted because it constrains the Phase 7 progress UI rather than because
it is broken today. Once an import is a background task the user can watch, a
Cancel button becomes the obvious next thing to add — and a cancel that only
drops the browser's connection would let the import commit anyway while telling
the user the opposite. Real cancellation means a cooperative abort check inside
the parse loop and a staged-row cleanup path. That is real work, and it should
be scoped deliberately or deliberately declined, not assumed to come free with
polling.

### 1.5 Why §1.2 is also the answer to "importing has no progress indicator"

The backend **already emits progress.** `prepareLink2FeedVisitImport` passes an
`onProgress` callback that calls `recordDataImportJobProgress` every 5,000 rows
(`adapters/link2feed-visits.ts:529`), writing `processedRows` and a safe message
onto `DataImportJob` and its event log. A polling endpoint already exists and
already returns those fields: `GET /api/data-import/jobs/:jobId`
(`routes/data-import.ts:299`, `safeJobReview` selects `processedRows`,
`totalRows`, `events`).

**Nothing consumes it.** `DataImportApiService` (frontend
`services/data-import/index.ts`) has `upload`, `decide`, `activate`, `cancel` —
and no `getJob`. The dialog renders one static `Loader2` with the fixed string
"Preparing the review…" (`add-data-dialog.tsx:790`).

The progress data is stranded because the client is *blocked on the same request
that is producing it*. A real indicator is therefore not a UI task — it requires
making `POST /jobs` return `202` immediately after staging and moving `prepare`
to a background task the client polls. That is the same change that removes the
100s Cloudflare ceiling. **One fix, three problems.**

This matters for the benchmark's purpose: if the architecture moves to
async-plus-polling, "does it finish inside 100s" stops being a pass/fail gate
and the benchmark's job becomes *setting an honest expectation* ("about four
minutes on the Pi") and *finding the stages worth optimizing*. The measurements
below are worth taking either way; only the interpretation of the numbers
changes.

---

## 2. What is actually being measured

The Link2Feed pipeline is **not** shaped like the OFB procurement pipeline, so
the procurement findings do not transfer. Eight stages, each with a different
resource profile:

| # | Stage | Code | Bound by |
|---|---|---|---|
| 1 | Stream to staging file + SHA-256 + header sniff | `staging.ts` `stageCsv` | Sequential disk write, CPU (hash) |
| 2 | CSV parse, validation, per-row snapshot hashing | `adapters/link2feed-visits.ts` | **Single-core CPU** |
| 3 | Staging-row inserts, `createMany` in 500-row batches | `link2feed-import.ts:756` | DB write, Prisma bind-param chunking |
| 4 | Profile dedup — one `UPDATE` with a window function | `link2feed-import.ts:800` | Single large SQL statement |
| 5 | Reconciliation — paged 1,000, two `IN` queries per page | `reconcileStagedLink2FeedVisits` | DB read, index quality |
| 6 | Preset auto-resolution | `applyWthResolutionPresets` | Negligible (fixed preset count) |
| 7 | Pending materialization — 6 `INSERT … SELECT` statements | `materializeLink2FeedPendingImport` | **Correlated subqueries — see §2.1** |
| 8 | Activation transaction | `activateLink2FeedVisitImport` | 30s Prisma ceiling (`db.ts:20`) |

Stages 1–7 are the blocking `POST /jobs`. Stage 8 is a separate request.

### 2.1 The stage most likely to be superlinear

Stage 7's encounter insert (`link2feed-import.ts:474`) and profile insert
(`:524`) each carry a **correlated scalar subquery evaluated per staged row**:

```sql
COALESCE((SELECT MAX(prior."revision") FROM "ServiceEncounterRevision" prior
          WHERE prior."source" = ? AND prior."sourceRecordKey" = staged."sourceRecordKey"), 0) + 1
```

plus a `NOT EXISTS` against `ServiceEncounterRevision` joined to `ServiceImport`.
On a first import the target tables are empty and these are free. **On a
re-import — the normal operating case for a rolling historical export — they run
against a table holding every prior revision.**

**Checked, and largely reassuring.** Whether this stays linear depends on index
coverage, and the schema has it:

| Query | Covering index |
|---|---|
| `MAX(revision)` by `(source, sourceRecordKey)` | `@@unique([source, sourceRecordKey, revision])` |
| `NOT EXISTS` current-encounter probe | `@@index([source, sourceRecordKey, isCurrent])` |
| Same two, profile side | `@@unique([source, sourceProfileKey, revision])`, `@@index([source, sourceProfileKey, isCurrent])` |

Each correlated subquery is an index seek, so stage 7 should stay roughly
linear in staged rows as history accumulates. **This was written up as the prime
suspect on shape alone and the schema demotes it** — recorded here rather than
quietly deleted, because "the obvious suspect was checked and cleared" is the
useful thing for the next reader to know.

Two caveats keep it on the list rather than off it. The per-row constant is
still a B-tree descent that grows with total history, against SD-card random
reads. And the `NOT EXISTS` joins `ServiceImport` for a status filter, which the
index does not cover. So: measure it, include a **re-import scenario** rather
than only a cold-database run, but do not pre-optimize it.

This asymmetry between first import and re-import is also why "run it once on
each machine and divide" would be the wrong method.

---

## 3. Constraints that shape the method

Three non-negotiables, each of which rules out an otherwise obvious approach.

**Privacy: the real file cannot be benchmarked on the Mac.** A Link2Feed visits
export is client-level PII — client IDs, birth years, demographic responses.
AGENTS.md is explicit that production data should not be moved onto the dev box
beyond inventory tables. A **synthetic corpus generator is therefore a
requirement of the plan, not a convenience.** This mirrors
`scripts/generate-synthetic-ofb-export.ts`, and the same determinism argument
applies: a fixed seed means both machines run byte-identical input.

The real export is available for testing. These rules govern it for the whole
of this work:

- **The real file never enters the working tree** — not even in a gitignored
  path. Gitignore is one `git add -f`, one editor plugin, or one misconfigured
  tool away from failing, and §1.3 is a live demonstration that a documented
  protection is not the same as an enforced one. Keep it outside the repository
  directory entirely.
- **No benchmark corpus is ever committed.** The generator is committed; its
  output is not. Same rule the procurement work used — "generated files live
  outside the repository; the generator is committed."
- **Only aggregate statistics cross from real to synthetic** (Phase 0): row
  count, distinct client count, visits-per-client distribution shape, date span,
  column count. Counts and distributions, never values. No real client ID,
  birth year, or response text is transcribed into the generator, a fixture, a
  commit message, or this document.
- **The Phase 0 stats pass runs on a machine already permitted to hold the
  file** and emits only the summary table.
- **Benchmark runs target a scratch database**, never `production.db`, and
  scratch databases are deleted afterward — they would otherwise hold
  normalized copies of whatever was imported.

**Pi access is relayed, not interactive.** Per standing project practice, the
Mac never reaches the Pi directly; the user runs commands over screen-share.
Every Pi-side step must therefore be **one self-contained command that writes a
JSON artifact the user can hand back.** A plan requiring an interactive
profiling session on the Pi is not executable here. This single constraint is
the strongest argument for the approach recommended in §5.

**The storage is not comparable, and that is the point.** A 4 TB NVMe SSD
against a 32 GB microSD card is the widest gap in the whole comparison — likely
wider than the CPU gap. SQLite in WAL mode with `busy_timeout` (`db.ts:47`)
turns fsync latency into wall-clock time directly. **Measure fsync rate
separately** (§4, Phase 1) so a storage-bound result is not misread as a
CPU-bound one. A card nearing end of life would show up here and nowhere else.

---

## 4. Instrumentation — what every run records

One harness, one JSON schema, both machines:

| Metric | How | Why it earns its place |
|---|---|---|
| Wall ms per stage (§2, all 8) | `performance.now()` around each | The headline; locates the cost |
| Prisma query count + statement histogram | `$on('query')` event logging | The procurement precedent found `303/327` this way |
| Peak RSS | `process.memoryUsage().rss` sampled | Pi has 8 GB total, Mac 128 GB — the one place the Pi can hard-fail |
| Rows/sec, stage 2 | derived | Isolates single-core CPU |
| fsync/sec | separate microbench | Separates storage from CPU |
| Row count, byte count, file hash | from the artifact | Makes runs comparable |
| Node version, arch, container/native | `process.*` | Guards against comparing unlike runtimes |

**Report the median of 3 runs, not a single run**, and state the spread.
Thermal throttling on the Pi and page cache on both machines make a single run
untrustworthy; the procurement doc's single-run figures were fine for a 50×
gap but will not resolve the 2× questions this plan expects to face.

---

## 5. Three candidate approaches

### Approach A — Black-box end-to-end HTTP timing

Upload through the real dialog on each machine; time the request; read the
`DataImportJobEvent` log afterward for a coarse stage split.

**Pros.** Measures what the user experiences, through the real nginx and
Cloudflare path — the only method that would have caught §1.1 and §1.2 by
accident. Zero new code. Runs on the Pi with no deployment.

**Cons.** Cannot attribute time to a stage, which is the actual question.
Confounds network, TLS, and Cloudflare with import work. **And on the Pi today
it cannot complete at all** — it dies at the 16 MB nginx cap or the ~100s edge
timeout, so it produces a failure, not a measurement.

### Approach B — In-process harness calling `prepare`/`activate` directly

A committed script (`packages/backend/scripts/benchmark-link2feed-import.ts`)
that stages a local file, calls `prepareLink2FeedVisitImport` and
`activateLink2FeedVisitImport` against a scratch database with the timers and
query logging of §4, and writes one JSON artifact.

**Pros.** Attributes every millisecond to a stage — including stage 7, the one
suspected of nonlinearity. Bypasses nginx and Cloudflare entirely, so the Pi
can be measured **today**, before the §1 fixes land. Runs as one command
producing one file, which is exactly what the relay constraint (§3) requires.
Directly comparable across machines. This is what the procurement evaluation
did, and its numbers held up against real hardware.

**Cons.** Skips the transport layer, so it cannot confirm the §1 fixes — that
needs an A-style run afterward. Requires a scratch database on the Pi (small,
but real care not to touch `production.db`).

### Approach C — Primitive microbenchmarks plus a cost model

Measure Pi-vs-Mac ratios for single-core CPU, SQLite insert throughput, and
fsync; multiply by the row counts and query counts already known from the code.

**Pros.** Cheapest. Produces a reusable ratio for future features. The
procurement work's ~12.9 ms/query Pi constant came from this style of reasoning
and proved durable.

**Cons.** **A model, not a measurement.** The procurement doc records two
occasions where confident modelling was wrong and one command settled it — the
iPad-dialog prediction, and the `IN`-clause ceiling that was never real. Stage 7
is precisely the kind of stage a model gets wrong, because its cost depends on
query-planner behaviour against an index, not on any primitive rate. Using C
alone here would repeat a mistake this project has already documented.

---

## 6. Recommendation

**Approach B as the core, with a short Approach A confirmation run after the §1
fixes land. Approach C only as a cross-check on B's numbers, never as a
substitute.**

The reasoning, in priority order:

1. **The relay constraint decides it.** B is the only approach that reduces the
   Pi side to a single command yielding a single file. A is a live interactive
   session against a production host, which is both awkward over screen-share
   and unwise. This is the practical argument, and it is sufficient on its own.

2. **The question is "which stage", not "how long".** "The Pi is 12× slower"
   changes no decision. "Stage 7 is 4% of Mac time and 60% of Pi time" names the
   thing to fix. Only B attributes cost.

3. **B works before the blockers are fixed.** A cannot produce a number on the
   Pi today; B can. Given that §1.1 and §1.2 are the likely cause of the actual
   production stall, sequencing a method that requires them fixed first would
   invert the dependency.

4. **The precedent is B, and it was validated.** The procurement evaluation used
   this exact shape and its Pi predictions matched real hardware. Reusing a
   method with a track record in this repo beats inventing one.

**But A is not optional afterward.** B deliberately bypasses the two layers that
appear to be causing the production failure. A single post-fix A run through the
real Cloudflare path is what converts "the pipeline takes N seconds" into "the
import works." Skipping it would be measuring the half of the system that was
never broken.

**Explicitly rejected: benchmarking before fixing §1.1.** It is tempting to
measure first and fix second, on the grounds that measurement is
information-gathering. It is the wrong order here. The 16 MB cap is a two-line
change with a known-correct value, it is a plain configuration defect rather
than a design question, and leaving it in place risks a benchmark cycle spent
explaining numbers produced by a proxy rejection.

**One caution on the recommendation.** B's stage timings are only as good as
the synthetic corpus's fidelity to the real export — particularly the
distribution of repeat clients, which drives the stage-4 dedup pass and the
stage-7 revision subqueries. If the generator produces uniformly-distributed
client IDs where the real data has a heavy-tailed repeat-visitor distribution,
stage 7 will be measured far too optimistically. Fidelity checks against the
real file's *aggregate statistics only* (§7, Phase 0) are the mitigation, and
they must happen on a machine already permitted to hold the real file.

---

## 7. Phases

| Phase | Work | Gate |
|---|---|---|
| **0** | ~~Verify index coverage (§2.1)~~ **done — covered; stage 7 demoted.** ~~Characterize the real export~~ **done 2026-08-14 — see §7.1.** | Complete |
| **1** | Build `scripts/generate-synthetic-link2feed-export.ts` (seeded, fabricated) and the fsync/CPU microbench. Corpora at ~1 MB, ~6 MB, ~17 MB, **~25 MB (production size)**, and ~40 MB (headroom, under the 64 MB cap). **The generator must emit the NATIVE export shape — ISO dates, `YYYY-MM-DD HH:MM:SS` for Recorded At, and the exporter's trailing delimiter** (ISSUES.md #70). The existing fixtures encode dates as spreadsheet serials, which no real export uses; generating that shape would benchmark a format that never occurs and would have hidden #70 indefinitely. | Every corpus parses with zero structural errors; fidelity within tolerance of §7.1 |
| **2** | **Fix the three defects.** §1.1: nginx `client_max_body_size` → at least 64m, matching `MAX_STAGED_DATA_IMPORT_BYTES`, with each constant's comment naming the other so they cannot drift again. §1.3: call `deleteExpiredDataImportStaging` at backend start and on an interval, with a test that fails if the wiring is removed. §1.2: document the Cloudflare ~100s ceiling in `raspberry-pi-cloudflare-tunnel.md`. | Deployed; 24 MB upload reaches the backend; an expired staged file is observed being deleted |
| **3** | Build `scripts/benchmark-link2feed-import.ts` (§4). Run all corpora on the Mac. Establish the stage profile and find the superlinear stages. | Mac baseline JSON committed |
| **4** | Run the same script on the Pi against a scratch DB, relayed as one command. **Both cold-database and re-import scenarios** (§2.1). | Pi JSON returned; per-stage Mac:Pi ratios computed |
| **5** | Decide from the data: does the 24 MB case fit a 100s synchronous budget on the Pi, or is async-plus-polling required? Optimize whichever stage the ratios name. | Written decision, in `ingestion-architecture.md` |
| **6** | Approach A confirmation: one real 24 MB upload through Cloudflare on the Pi. | End-to-end success, timed |
| **7** | Progress indicator (§1.5), scoped by the Phase 5 decision. Decide explicitly whether real cancellation (§1.4) is in or out. | — |

**Phases 2 and 3 are independent and can run in parallel.** Phase 4 depends on
3; Phase 6 depends on 2 and 5.

---

### 7.1 Phase 0 measurements — the real export (2026-08-14, developer Mac)

WTH's production export, characterized in place on a permitted machine.
Aggregates only; no client value left the host.

| | |
|---|---|
| Size | 25,124,653 bytes |
| Rows | 79,308 |
| Columns | 30 named + 1 unnamed trailing filler |
| Date range | 2020-10-19 .. 2026-05-28 |
| Encoding | UTF-8 with BOM, LF endings |
| Dates | ISO `YYYY-MM-DD`; Recorded At `YYYY-MM-DD HH:MM:SS` |
| Identified / identity-unavailable | 74,789 / 4,519 |
| Review issues | 312, of which 0 blocking |

**Parse-only timing, Mac:** 3.27 s — 24,246 rows/s, **0.137 s/MB**, peak RSS
438 MB. Filler detection added 7 ms.

Three things this changes.

**Parse is not the wall it was at OFB century scale.** The procurement work
found parsing to be 47% of total time on a 76 MB synthetic file. Here a
production-sized file parses in about three seconds on the Mac. The remaining
question is the database stages, which this run does not touch — its `onRows`
and `onIssues` sinks only count.

**This is not yet the Step 3 number.** Parse is one of eight stages (§2). Do
not quote 3.27 s as the import time.

**The filename says 2017; the data starts 2020-10-19.** Worth confirming on the
Link2Feed side before treating this as complete history. It also means row
counts here should not be extrapolated to "nine years of history" — they cover
about five and a half.

## 8. What the result should be able to say

The benchmark is finished when these are answerable with a measured number, not
an estimate:

1. Seconds per MB of Link2Feed CSV, on each machine, cold-database.
2. The same, re-importing over an already-active dataset.
3. Which stage dominates on the Pi, and whether any stage is superlinear in row
   count.
4. Whether the Pi:Mac ratio is a constant (CPU/storage speed) or grows with
   input size (an algorithmic problem that will get worse every year the
   archive grows).
5. Peak RSS on the Pi for a 24 MB file, against 8 GB total with the full Docker
   stack resident. The procurement work measured **~19× file size in marginal
   RSS**; if Link2Feed behaves similarly, 24 MB implies ~456 MB — comfortable,
   but it is a different pipeline and the ratio must be re-measured, not
   assumed.
6. The largest export size that completes inside the ~100s Cloudflare ceiling
   on the Pi — i.e. the honest value for `MAX_STAGED_DATA_IMPORT_BYTES` if the
   import stays synchronous, or the confirmation that it must not.

## 9. Out of scope

- **Optimizing the parser before Phase 4 names it.** Stage 2 is the intuitive
  suspect and may well not be the answer; the procurement evaluation found the
  cost somewhere other than where it was first assumed.
- **Prisma major-version work.** Unchanged from
  `import-throughput-evaluation-plan.md` §8.
- **Chunked or resumable imports.** The atomicity guarantee is worth keeping
  until something measured requires breaking it.
- **Benchmarking SIMC and WTH Tracking adapters.** Same harness will fit them
  later; scoping this to Link2Feed keeps Phase 4's Pi time short.
