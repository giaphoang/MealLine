# Procurement Import Throughput — Evaluation Plan

**Status:** In progress, started 2026-07-29.
**Branch:** `perf/prisma-batching-evaluation`
**Prerequisite reading:** [`ingestion-architecture.md`](./ingestion-architecture.md) —
the measured account of the 1.5.0-beta.1 import failures and the set-based fix
that shipped in beta.2.

This document records the technical choices behind a second round of import
optimization, so the reasoning survives the work. It is a plan, not a report:
results land in `ingestion-architecture.md` as each phase completes.

---

## 1. Where beta.2 left things

Beta.2 replaced per-order queries with set-based writes, measured on the
production Pi:

| | Before | After |
|---|---|---|
| Largest export (944 orders, 17,815 rows) | ~61s, failed | **4.24s, 327 queries** |
| Undo Import, same size | ~2,800 queries | **8 queries** |

Confirmed on real hardware: the Pi runs **~12.9ms per query** against
**~0.23ms** on a developer Mac — a 56× gap. The 20-second interactive
transaction ceiling therefore permits roughly **1,550 queries**.

## 2. The remaining bottleneck is Prisma, not SQLite

Profiling the 944-order import by SQL statement:

```
  303  INSERT INTO ProcurementLine …
   10  INSERT INTO ProcurementOrderRevision …
    4  INSERT INTO ProcurementProduct …
   10  (selects, transaction bookends)
  ---
  327  total
```

**303 of 327 queries are line inserts** — 17,815 lines at ~59 rows per
statement. Everything else is negligible and stays flat.

That 59 is `999 ÷ ~17 bound columns`. Prisma re-chunks `createMany` internally
against a **999** bind-parameter budget, which makes the 1000-row chunking in
`bulk.ts` a no-op for lines.

**SQLite's real limit is far higher.** Probed directly through the same engine
with `$executeRawUnsafe`:

| Rows × columns | Parameters | Result |
|---|---|---|
| 300 × 3 | 900 | OK |
| 1,000 × 3 | 3,000 | OK |
| 5,000 × 3 | 15,000 | OK |
| 10,000 × 3 | 30,000 | OK |
| 10,921 × 3 | **32,763** | OK |

So 999 is Prisma's conservatism, not a database constraint. `SQLITE_MAX_VARIABLE_NUMBER`
is 32,766 on this build.

**Upper bound on the win:** ~1,927 rows per INSERT instead of ~59 →
303 line queries become ~10, total 327 → ~34. About **10× on current data**,
and a century of history goes from ~87s to ~3s.

## 3. Scaling model

Queries scale with **row count**, not calendar span. Correcting an earlier
estimate that reasoned in years:

```
queries ≈ lines/59 + orders/94 + products/225 + ~10
```

Observed volume growth matters, because capacity in *years* depends on density:

| Era | Rows/year |
|---|---|
| 2009–2019 | 1,620 |
| 2020–2025 | 2,936 |
| 2025–2026 | **3,971** |

Against the ~1,550-query budget (~91,000 lines):

- at the blended historical average (~2,230/yr): **~41 years**
- at current peak density (~3,971/yr): **~23 years**

## 4. Suspected latent bug — RESOLVED, not a bug

`index.ts:372` and `fresh-alliance.ts:639` build an `IN` clause with one bind
parameter per order reference:

```ts
sourceOrderReference: { in: parsed.orders.map((o) => o.sourceOrderReference) }
```

This was flagged as a probable failure above 32,766 references. **It is not.**
Measured directly against the engine on 6.12.0:

| `IN` values | Queries issued | Result |
|---|---|---|
| 1,000 | 2 | OK |
| 32,000 | 33 | OK |
| 32,766 | 33 | OK |
| 40,000 | 41 | OK |
| 120,000 | 121 | OK |

**Prisma chunks `IN` lists at ~1,000 values per statement**, the same way it
chunks `createMany`. There is no ceiling to hit and nothing to fix.

Worth recording *why* this was checked rather than assumed: an earlier
prediction in this project — that dialogs would be unusable on a 2015 iPad —
was made confidently from a model and proved wrong on real hardware. The
`IN`-clause concern was written up as an open question rather than a finding for
that reason, and measuring retired it in one command.

Side note: the `chunk()` wrappers around these queries in the beta.2 work are
therefore redundant with Prisma's own chunking. They are harmless (both batch
at ~1,000) and are left in place as explicit intent.

## 5. Two candidate levers

### Lever A — Prisma patch upgrade — MEASURED, does not help

FEED runs **6.12.0**; the 6.x line is at **6.19.3**. Measured on identical data,
with the client regenerated:

| Corpus | 6.12.0 | 6.19.3 |
|---|---|---|
| Real 2009–2019 (17,815 rows) | 327 queries | **327 queries** |
| Synthetic 6y (24,031 rows) | 609 queries | **609 queries** |

**Byte-identical.** The 999-parameter batching is unchanged across seven minor
versions. Lever A does not address this problem.

**And it is not free, contrary to the assumption that drove evaluating it
first.** `$use` was removed *within* the 6.x line, not in v7 as expected:

```
src/db.ts(70,8): error TS2339: Property '$use' does not exist on type 'PrismaClient'
```

`db.ts:70` registers the translation-trigger middleware, so any move to 6.19.3
requires porting it to `$extends` first. The middleware is small and
well-scoped — it queues translations for `FoodItem.name` and `Category.name`
after create/update — so the port is contained, but it is a real breaking
change inside a version range assumed to be safe.

The evaluation was therefore reverted to 6.12.0 rather than bundling an
unrelated breaking change into this work. **The 6.19.3 upgrade remains worth
doing on its own merits** (seven minors of fixes), tracked separately, and now
with a known prerequisite.

### Lever B — Raw batched INSERT for `ProcurementLine`

Only if Lever A does not resolve it. Scoped to the one table holding 303 of 327
queries; `createMany` stays everywhere else, because the others are already
negligible and raw SQL carries costs worth paying exactly once.

**Security: injection is not the risk, provided bind parameters are used.**
The SQL string is assembled only from a literal column list and a
placeholder pattern derived from a row *count*. No CSV value ever enters the
SQL text; values travel as bound parameters. Demonstrated:

| Approach | `sourceDescription` = `Bread'); DROP TABLE victim; --` |
|---|---|
| Parameterized (proposed) | stored as that literal string; table intact |
| String-interpolated (anti-pattern) | driver rejected the statement; table intact |

The `Unsafe` in `$executeRawUnsafe` means "you assemble the query string", not
"parameterization is off". Building the string manually is required only
because the placeholder *count* varies with batch size. Prisma's SQLite driver
additionally refuses multi-statement queries — a second barrier, never to be
relied on as the first.

**The real risks are correctness, not security:**

1. **SQLite type affinity is permissive.** The typed client rejects a string
   where `Int` is expected; raw SQL does not, and SQLite will store `"abc"` in
   an `INTEGER` column rather than erroring. A wrong **column order** corrupts
   silently instead of failing loudly.
2. **Schema drift.** A future migration adding a column keeps `createMany`
   working, but silently omits it from a hand-written column list. A `NOT NULL`
   addition errors; a nullable one writes NULL forever.

Favourable setup: `ProcurementLine` has 23 columns, **no timestamps and no
client-side defaults** — only `id AUTOINCREMENT`. Nothing Prisma fills in that
raw SQL would miss.

**Required mitigations, all four:**

- one shared column array driving both the SQL and the value flattening, so
  order cannot drift between them;
- a guard test asserting that array matches the Prisma model's fields, turning
  schema drift from silent into a build failure;
- a typed round-trip test — write via raw path, read back with the typed
  client, assert every field — since typed reads catch affinity corruption;
- a committed injection test, so the property is enforced rather than
  remembered.

## 6. Phases

| Phase | Work | Status |
|---|---|---|
| **0** | Synthetic dataset generator | **Done** — both corpora parse with zero structural errors |
| **1** | Baseline on 6.12 + century file | **Done** — see §6.1; `IN` chunking resolved (§4) |
| **2** | Evaluate 6.19.3 | **Done** — no change to batching (§5); `$use` breaking change found |
| **3** | **Decision gate** | **Awaiting maintainer** — Lever A is ruled out; Lever B is the only path |
| **4** | Implement | Not started |
| **5** | Re-benchmark and document | Not started |
| **6** | Production artifact | Generator ready; 6-year file is the artifact |

### 6.1 Phase 1 measurements (Prisma 6.12.0, developer Mac)

| Corpus | Rows | Units | Queries | Parse | Transaction | Peak RSS |
|---|---|---|---|---|---|---|
| Real 2009–2019 | 17,815 | 944 | 327 | 270ms | 959ms | 803MB |
| Synthetic 6y | 24,031 | 2,072 | 609 | 732ms | 1.91s | 871MB |
| Synthetic 100y | 398,584 | 34,530 | 9,812 | **101.5s** | **114.0s** | **2,145MB** |

Rollback stayed proportionate throughout: 8, 14, and 114 queries respectively.

**Two findings beyond the query counts.**

*Parse becomes the wall before the database does.* At century scale, parsing is
101 seconds — 47% of total time — on a machine roughly 50× faster per operation
than the Pi. No amount of insert batching addresses that half. It reinforces
that a century in a *single file* is not the design target; a century imported
as a dozen decade-sized files is entirely comfortable.

*Memory is the real cap constraint, confirmed.* A 76MB file peaked at 2,145MB
RSS against a ~712MB process baseline — roughly **19× the file size in
marginal memory**. This is the measured basis for the deferred cap decision in
§7, replacing a guessed number with an observed ratio.

### 6.2 Synthetic corpora

Generated by `scripts/generate-synthetic-ofb-export.ts`, deterministic from a
fixed seed so two Prisma versions are compared on byte-identical input.

| File | Years | Rows | Units | Size | Purpose |
|---|---|---|---|---|---|
| `syn-100y.csv` | 100 | 398,584 | 34,530 | 76MB | Local scaling benchmark |
| `syn-6y.csv` | 6 | 24,031 | 2,072 | 4.6MB | **Production TEST artifact** |

The production artifact is 6 years, not the 8 originally planned: at peak
density 7 years reaches 5.3MB and exceeds the 5MB cap, while 6 years lands at
4.6MB. It is still ~1.35× the largest real export by rows and ~1.9× by size.

Fidelity against the real corpus it models: 11.5 rows per unit (target 11.5),
1:5.4 warehouse-to-pickup ratio, 85/15 confirmed-to-pending pickups, and ~29%
of pickup lines carrying no donor valuation — matching the real proportion that
must never be imputed.

### Synthetic dataset parameters

Modelled on 2025–2026 density, the highest observed:

- 3,971 rows/year, 11.5 rows per unit, ~1:5.4 warehouse-to-pickup ratio
- `synthetic-100y`: ~397,000 rows / ~34,500 units / ~55MB — **local benchmark
  only**, since it exceeds the upload cap by an order of magnitude
- `synthetic-TEST-8y`: ~29,000 rows / ~4.9MB — fits the current cap, ~1.7× the
  largest real export, suitable for a production test

All values fabricated. No real records, donor names, or product codes derived.
Generated files live outside the repository; the generator is committed.

## 7. The upload size cap — RESOLVED: 10MB, with a 30s ceiling

`MAX_IMPORT_BYTES` (`routes/procurement.ts`) and `MAX_FILE_BYTES`
(`ofb-import-dialog.tsx`) capped uploads at 5MB.

That limit was inherited from the document translator, and its rationale does
not transfer: the translator **stores** files, while a procurement import holds
one buffer in memory and discards it. Both constants are already
procurement-specific, so raising them was a localized change.

**The binding constraint turned out not to be memory.** The expectation going
in was that RAM on the Pi would decide the number. It does not, by a wide
margin — the marginal cost measured between the 4.6MB and 76MB runs is ~18MB of
RAM per MB of CSV, so even a 10MB file is only ~180MB. **Transaction time binds
first**, and by an order of magnitude.

Two independent measurements agree on throughput:

| Source | Figure |
|---|---|
| Real 2.4MB export on the Pi | 4.24s → 1.77 s/MB |
| Synthetic 4.6MB, pickup-heavy (worse queries/row) | 609 queries × 12.9ms → 1.70 s/MB |

Planning figure: **~1.8 s/MB**.

| Cap | Estimated Pi time | % of 20s ceiling | % of 30s ceiling |
|---|---|---|---|
| 5MB (previous) | ~9s | 45% | 30% |
| **10MB (adopted)** | ~18s | 90% — too tight | **60%** |
| ~11.7MB | ~20s | 100% — fails | 67% |
| ~16.7MB | ~30s | — | 100% — fails |

**Decision: 10MB cap, transaction timeout raised 20s → 30s.** The pairing is
the point. 10MB against the old 20s ceiling would have sat at 90% utilisation,
close enough that an aging SD card, a busy service day, or a pickup-heavy file
could tip it into a `P2028` abort — the exact failure that started this work.
At 30s the same file uses 60%, which absorbs all three.

10MB is roughly **4× the largest real export** (2.4MB) and covers several years
of history at current density.

**Above ~16MB the cap stops being the right lever.** The transaction ceiling
becomes the thing to raise, after which memory finally binds somewhere past
50MB. Not needed now.

**Caveat on the throughput figure:** every Pi datapoint comes from files ≤2.4MB.
The 1.8 s/MB planning number is `12.9ms × query count`, and query counts scale
cleanly with rows, so it is trustworthy — but no import above 5MB has actually
run on that hardware. The 4.6MB synthetic file is the obvious first production
test.

### Waiting-state UX

Raising the cap makes the waiting longer, so the import dialog now shows a real
progress state rather than a muted button label: a spinning indicator, the file
name, and a **live elapsed-seconds counter**, following the same `Loader2`
pattern as the Shopping List *Translate & Download PDF* modal.

Deliberately **indeterminate, not a percentage.** The server performs the whole
import in one atomic transaction and reports nothing until it returns, so any
bar or percentage would be fabricated. Elapsed time is real, and it is what
distinguishes "still working" from "hung" for someone watching a spinner.

The panel also states that existing data is unchanged until the import
finishes. That is the reassurance that makes waiting tolerable, and it is only
sayable because the import is genuinely atomic — the guarantee §5 of
`ingestion-architecture.md` recommends keeping.

Cancel stays disabled during an import. There is no server-side abort, so a
cancel button that only dropped the HTTP request would let the transaction
commit anyway and tell the user the opposite. Honest disabling beats a
misleading control.

## 8. Explicitly out of scope

- **Prisma 7.** Real gains (3× queries, 90% smaller bundles, Rust-free), but
  `$use` middleware is removed and `db.ts:70` depends on it; driver adapters
  become mandatory, meaning an ARM64 native module in Docker; and v7 is
  ESM-only while this backend is CommonJS. That is a whole-project initiative
  on the scale of the Tailwind v4 migration, not a way to fix line inserts.
- **Streaming parse.** Only becomes the bottleneck around century scale in a
  single file, which the 5MB cap prevents anyway.
- **Resumable/chunked-commit imports.** See `ingestion-architecture.md` §4 —
  the measured fix removed the pressure, and the atomicity guarantee is worth
  keeping until something concrete needs it.
