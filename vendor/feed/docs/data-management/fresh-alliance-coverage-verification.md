# Fresh Alliance Coverage Verification

**Date:** 2026-07-20
**Status:** Complete — gate passed
**Purpose:** Establish whether Fresh Food Alliance observations currently
derived from `AGPCKUP` rows in the Completed Orders export can be superseded by
the dedicated Agency Pickups export without losing information.

This record is the evidence base for the supersede rule described in
[procurement-unification-plan.md](procurement-unification-plan.md). It should be
cited rather than re-derived. Re-run the checks only if the OFB export contract
changes.

## Corpora compared

| Role | File |
| --- | --- |
| Fresh Alliance (donor-attributed) | Private operational export under `FEED_PRIVATE_DATA_DIR/FreshFoodData/` |
| Completed Orders (canonical, non-overlapping) | `OFB_Completed_Orders_2009-01-01_to_2011-12-31.csv`, `2011-01-01_to_2021-12-31`, `2021-01-01_to_2023-12-31`, `2024-01-01_to_2024-12-31`, `2025-01-01_to_2025-12-31`, `2026-01-01_to_2026-07-14` |

The partial `2026-05-01`, `2026-06-01`, and single-order exports were excluded
so no source event is counted twice.

Both exports were produced by the OFB Order CSV Exporter extension: Completed
Orders by the Order History workflow, Agency Pickups by the v1.2.0 Fresh
Alliance workflow.

The source exports are sensitive operational records and are stored outside the
repository. Authorized developers may point local verification at them with
`FEED_PRIVATE_DATA_DIR`; they must never be committed to FEED.

## Result: complete parity

| Year | Fresh rows | `AGPCKUP` rows | Fresh lb | `AGPCKUP` lb | Δ lb |
| --- | --- | --- | --- | --- | --- |
| 2023 | 710 | 710 | 104,664 | 104,664 | 0 |
| 2024 | 1,206 | 1,206 | 203,404 | 203,404 | 0 |
| 2025 | 1,275 | 1,275 | 177,147 | 177,147 | 0 |
| 2026 (through 7/14) | 742 | 742 | 84,754 | 84,754 | 0 |
| **Total** | **3,933** | **3,933** | **569,969** | **569,969** | **0** |

- 826 source events on both sides.
- Zero `AGPCKUP` events without a Fresh Alliance counterpart.
- Zero Fresh Alliance events absent from the Completed Orders export.
- Fresh Alliance history begins 2023-06-01. No `AGPCKUP` reference appears
  anywhere in the 2009–2021 exports.

**The Agency Pickups export covers the entire `AGPCKUP` population.** For this
agency's corpus a single full-history Fresh Alliance import supersedes every
`AGPCKUP`-derived observation, with no uncovered period to reconcile.

## Why superseding loses nothing

Across all 3,933 `AGPCKUP` rows spanning 2023–2026:

- `Unit Price`, `Price Total`, `Service Fee`, and `Grants Applied` are `$0.00`
  on **every row**. Those four columns are the reason the Completed Orders
  format exists; for donated Fresh Alliance supply they are structurally empty.
- `Category` is `DONATED` on every row.

Across all 3,933 Fresh Alliance rows, `Received Qty`/`Received Weight` equal
the requested values on every row.

The Agency Pickups export therefore contains every fact the `AGPCKUP` rows
contain, plus donor identity, pickup time, pickup and line IDs, submission
timestamp, Fresh Alliance category, and donor value per pound. It **strictly
dominates** the `AGPCKUP` subset of Completed Orders.

## Findings that corrected earlier analysis

An initial pass over the 2026-only export produced three conclusions that the
full corpus overturned. They are recorded here so they are not re-adopted.

### 1. The two identifier spaces are not monotonic

The exports use disjoint identifier spaces for the same events — Completed
Orders uses `Order #` (e.g. `790541AGPCKUP`), Agency Pickups uses
`Pickup Reference` (e.g. `1155954AGPCKUP`). There is no arithmetic relationship
(131 distinct offsets across 170 events in the 2026 sample).

On the 2026 sample alone the two spaces appeared perfectly rank-ordered — zero
inversions across 170 events — which suggested a rank-based join might be
viable. **On the full corpus there are 304 rank inversions across 824 matched
events.** A rank-based join would have silently misattributed donors on roughly
a third of pairings.

Observed ranges (no numeric overlap, but this is a data accident and must not
be relied on):

- Pickup references: 879508–1171829
- Order references: 683723–809852

**Decision: no rank-derived or offset-derived join between the two identifier
spaces, ever.** This was already rejected on principle — deriving a
cross-reference the source system does not publish is manufactured identity —
and is now also refuted by evidence.

### 2. Content fingerprints are not unique

824 of 826 events match uniquely on `(date, {product, weight})`. Two do not:

```
2023-06-02  New Seasons - Slabtown
  879508AGPCKUP  pickup 365469   9:00 AM
  879527AGPCKUP  pickup 365488  12:00 AM
  both: 40000/29.00, 40020/14.00, 41000/26.00, 41010/28.00, 41020/23.00
```

These are genuinely distinct pickups with identical contents, not duplicates.

**Decision: content-fingerprint matching is not a supported join mechanism.**
The supersede rule operates on date windows and never pairs individual events,
so this ambiguity does not affect it.

The `12:00 AM` value is almost certainly a missing-time default rather than a
real midnight pickup — the agency confirms no midnight collection occurred.
Treat `12:00 AM` as unknown time and surface a data-quality warning; never
present it as an observed pickup hour.

### 3. Donor value per pound varies and is incomplete

Not the constant `1.45` the 2026 sample suggested.

| Year | Observed values |
| --- | --- |
| 2023 | `0.00`, `1.44` |
| 2024 | `0.00`, `1.44`, `1.63` |
| 2025 | `1.45`, `1.63` |
| 2026 | `1.45` |

**1,108 of 3,933 rows carry `$0.00` — 164,298 lb, 29% of all Fresh Alliance
poundage — all in 2023 and 2024.** These are rows with no recorded valuation,
not rows worth nothing.

**Decision: persist the per-row rate. Never compute in-kind value as weight ×
a single rate.** Any value figure must state its coverage, e.g. "value recorded
for 71% of poundage."

## Temperature: deliberately not persisted

118 rows (2023 and 2025) carry temperature readings. The agency maintains
separate, far more detailed temperature logs as a food-safety compliance
record. Those readings are not operationally actionable inside FEED.

**Decision: parse and discard `Temperature`.** It is validated as numeric when
present so a malformed export still fails loudly, but no column is persisted.
Revisit only if a compliance-reporting requirement appears.

## Channels report on different lags

The full-history Fresh Alliance export was requested through 2026-07-20 but
contains **no rows after 2026-06-30**. This is not an export defect — the
Completed Orders export agrees, carrying zero `AGPCKUP` rows in July while
continuing to report Warehouse orders through 2026-07-13.

June 2026 alone contained 29 Fresh Alliance events, so a two-week gap is a sharp
departure from cadence.

**Confirmed with the agency (2026-07-20): the July pickups happened.** The gap is
a recording lag — pickup data had not yet been entered into Primarius, because
the agency is short-staffed and the entry competes with direct service work.
Both exports filter on completed status, so unentered pickups are invisible to
FEED until someone has time to record them.

**Decision: Fresh Alliance and Warehouse coverage windows are reported
separately and must never be assumed equal.** The coverage strip shows a window
per channel. The 30-day staleness rule must not flag Fresh Alliance stale on the
strength of an entry backlog.

**Decision: a coverage gap is never presented as a score, a warning, or a
performance signal.** The gap measures how much data-entry time staff have had,
not how well they are doing their jobs. It states what FEED can currently see
and, where useful, what would extend that view. It never uses language implying
lateness, incompleteness as fault, or a target to hit. Food arrived and was
distributed regardless of whether anyone had time to type it in.

## Donor roster (received pounds)

| Donor | 2023 | 2024 | 2025 | 2026 | Total |
| --- | --- | --- | --- | --- | --- |
| Amazon – NW Industrial (Prime Now) | 72,576 | 137,376 | 115,850 | 56,721 | 382,523 |
| Trader Joe's – Northwest | 18,557 | 35,912 | 33,595 | 16,462 | 104,526 |
| Fred Meyer – Stadium | 9,060 | 24,724 | 17,194 | 2,938 | 53,916 |
| Restaurant Depot | — | — | 8,046 | 6,937 | 14,983 |
| New Seasons – Slabtown | 2,507 | 2,433 | 2,462 | 1,696 | 9,098 |
| Safeway – Portland (SW Jefferson) | 1,964 | 938 | — | — | 2,902 |
| Safeway – Lake Oswego (A Ave) | — | 2,021 | — | — | 2,021 |

The roster is **not stable**: partners start and stop. Safeway participation
was a temporary arrangement covering another agency's pickups; Restaurant Depot
began in 2025.

**Decision: the donor dimension is open, derived from observed data. No fixed
enum, no seeded partner list, no assumption that a partner absent from a range
has stopped donating.**

Amazon is 67% of all Fresh Alliance poundage and holds that share across all
four years. Donor concentration is a legitimate observation to surface; the
cause of any partner's decline is not, and must not be inferred.

## Reproducing

The comparison is pure data analysis over checked-in corpora — no application
state involved. Group the Fresh export by `Pickup Reference` and the
`AGPCKUP` subset of Completed Orders by `Order #`, then compare row counts,
event counts, and summed weight per year. Parity is exact; any drift means the
export contract changed and this record must be re-verified before the
supersede rule is trusted.
