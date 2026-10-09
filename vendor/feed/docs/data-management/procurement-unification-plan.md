# Procurement Unification Plan

**Started:** 2026-07-20
**Status:** Phases 1–7 complete (extension v2.0.0 + FEED unified parser +
legacy retirement, 2026-07-22). Analytics pending-weight decision settled (D15,
2026-07-22). Phase 8 — data-shaping flags + legacy community integration — designed
2026-07-23 (D16–D22); implementation underway — 2a (rule foundation + Data
Management UI), 2b (Analytics honors flags), 2c (legacy community
integration), and the analytics-polish + Fresh Alliance legacy-weave pass landed
2026-07-23/24. D23 (2026-08-10) moves the eventual UI entry point into the
global classifier-driven Add Data workflow without changing any procurement
source semantics.
**Owner doc:** this file is the North Star for procurement data ingestion. Update
it as each phase lands. Do not rely on session memory for any decision recorded
here.

## North Star

FEED reports Oregon Food Bank supply — warehouse and Fresh Food Alliance —
**correctly, completely, and with donor attribution**, using data staff can get
into the system without careful manual assembly.

Correctness first, then attribution, then convenience. In that order, always.

## Why this work exists

FEED's procurement foundation shipped against one export format. OFB's portal
actually exposes the same Fresh Alliance donation events through **two**
exports with **different identifiers**:

- **Completed Orders** — the established 12-column ledger. Fresh Alliance
  events appear as `Order #` values ending `AGPCKUP`, with all money columns
  `$0.00`.
- **Agency Pickups** — a 19-column export added in extension v1.2.0. The same
  events, keyed by `Pickup Reference`, **with donor identity**.

Importing both today would double-count Fresh Alliance weight. FEED also cannot
parse the second format at all. That is the defect blocking a production-ready
MVP; automation of any kind would only deliver wrong numbers faster.

Full evidence: [fresh-alliance-coverage-verification.md](fresh-alliance-coverage-verification.md).

## Settled decisions

Each is load-bearing. Revisit only with a new explicit decision recorded here.

### D1 — Supersede rather than join
The `AGPCKUP` subset of Completed Orders is verified to carry no information the
Agency Pickups export lacks (3,933 rows, 2023–2026, all money columns `$0.00`).
Where a Fresh Alliance import covers a date window, `AGPCKUP`-derived
observations in that window are marked superseded — not deleted.

Superseding is window-bounded even though this agency's corpus needs no
bounding, so a partial Fresh Alliance import can never suppress an uncovered
period.

### D2 — No derived cross-reference between identifier spaces
No rank-based, offset-based, or content-fingerprint join between `Pickup
Reference` and `Order #`. The source system does not publish the mapping;
deriving one manufactures identity. Empirically refuted as well — 304 rank
inversions across 824 events.

### D3 — Fresh Alliance imports use their own `source`
Persisted under `source = 'ofb_pickup'`, separate from `source = 'ofb'`. This
gives an independent revision lineage and independent rollback, and removes any
possibility of reference collision between the two identifier spaces.

### D4 — Donor identity is received, never inferred
FEED records the donor OFB reports. FEED never infers a partner from dates,
reference numbers, category mixes, or operational history. The prohibition in
`AGENTS.md` stands; what changed is that OFB now *reports* donor identity, so
the claim that it cannot is obsolete.

### D5 — The donor dimension is open
Derived from observed data. No fixed enum, no seeded partner list. Partners
start and stop; absence from a range is not evidence of withdrawal.

### D6 — In-kind value is partial and must say so
29% of Fresh Alliance poundage carries no recorded donor valuation. Persist the
per-row rate; never multiply weight by a single rate. Every value figure states
its coverage.

### D7 — Temperature is parsed and discarded
Validated when present so malformed exports still fail, but not persisted. The
agency keeps separate, more detailed food-safety temperature logs; these
readings are not operationally actionable in FEED.

### D8 — `12:00 AM` pickup time means unknown
A missing-time default, not an observed midnight collection. Surface as a
data-quality warning; never render as an observed hour.

### D9 — Legacy XLSX history is a separate domain, not a backfill
> **Revised 2026-07-23 by [D16](#d16). Read D9 for its still-valid caution, D16
> for the current shape.** The prohibition D9 actually protects — never fabricate
> line-item detail these files do not contain — stands. Its *conclusion* (a wholly
> separate domain, indefinitely post-MVP) is superseded: the community-food subset
> now enters procurement under its own source at explicitly-tagged monthly grain.

`In-Kind Donations FY20xx` and `Social Services Tracking FY20xx` are
agency-authored records of direct community donations and client services — not
OFB supply. The OFB corpus already reaches 2009 for warehouse orders and 2023
for Fresh Alliance, which is the complete OFB picture.

These files get their own source contract, validation, revision, and rollback
rules when the time comes. They are **not** to be coerced into the procurement
schema. Post-MVP; valuable, but separate.

### D10 — CSV import stays, permanently
Whatever transport is added later, file import remains a documented, supported
path. When a network path fails during a distribution day, staff need a route
that does not depend on it.

### D11 — Transport is not on the MVP path
Server-side credentialed fetch and extension-to-FEED push are both viable and
both deferred. See "Transport, deferred" below. The MVP blocker is correctness,
not convenience.

### D12 — Coverage is descriptive, never a score
Channels report on different lags. Confirmed 2026-07-20: Fresh Alliance pickups
happen and are entered into Primarius later, because the agency is short-staffed
and data entry competes with direct service.

Coverage UI states what FEED can currently see and what would extend that view.
It never implies lateness, fault, or a target — no "overdue", no "incomplete",
no progress bars toward a coverage goal, no red. A gap measures available
data-entry time, not performance. The food arrived and was distributed whether
or not anyone had time to type it in.

### D13 — Fresh Alliance includes Pending; OFB Warehouse stays Completed-only
A live, read-only investigation of the Primarius portal on 2026-07-21
(recorded in full in
[fresh-alliance-pending-pickups.md](fresh-alliance-pending-pickups.md))
established that the coverage gap D12 describes is a real OFB review queue,
not a data-entry backlog alone: Agency Pickups has a Pending tab, and Pending
and Completed are **the same underlying records** — confirmed by a continuous,
non-overlapping `Id`/`ReferenceCode` sequence across both, and directly by
searching Completed for a known Pending reference (zero results). Moving from
Pending to Completed flips a flag on the existing row; it does not create a
new one.

This resolves the duplication concern that motivated the investigation:
FEED's existing revision model, keyed on `ReferenceCode`, already treats a
later re-import of the same reference as a new revision of the same event,
whether or not its confirmation status changed. No new deduplication logic
is required.

The two OFB channels are not treated the same way, and this is a permanent
distinction, not a temporary compromise:

- **Fresh Alliance Pending is included.** The agency is the authoritative
  observer — staff already collected and weighed the donation before OFB
  ever reviews the record. OFB's confirmation is a downstream paperwork step
  on an observation the agency already made in full. Historically, confirmed
  weight has equaled requested weight on all 3,933 corpus rows.
- **OFB Warehouse stays Completed-only.** Checked Order History directly:
  its equivalent "Active" tab held an order in `DataEntry` status, moving
  through a `Released / Picked / Confirmed` pipeline controlled by OFB, not
  the agency. An Active order is a request, not an observation — quantities
  legitimately change during fulfillment (an item may be unavailable, or
  substituted). Importing it would violate the same "never infer, never
  treat a request as a fact" principle that governs the rest of this
  project. This does not change without new evidence that OFB's fulfillment
  process works differently than observed here.

**A value must never be reshaped to resolve an ambiguity a status flag
already resolves.** An earlier draft of this decision proposed representing
a Pending pickup's `Received Weight` as blank rather than the `0` Primarius
actually reports, on the reasoning that `0` "reads as nothing was picked
up." That doesn't survive contact with the schema's own existing pattern:
`hasDonorValuation` already sits next to a real, possibly-`0` rate rather
than nulling it out. The fix here is the same — report the real value, add
`isConfirmed` to say what it means. Requested weight, including a genuine
`0` for a category that was not collected in a given pickup, was never in
question and is untouched by any of this.

### D14 — Legacy single-channel import retired; unified is the only accepted format
Decided 2026-07-22, once the unified export was verified working end-to-end
against a full-history real upload. Nothing in this feature — Data
Management, Analytics, any of it — had reached production yet, so backward
compatibility with the two formats the unified export replaced was pure
technical debt, not a real constraint. `detect.ts`'s three-way format
detection, the OFB Warehouse parser's schema v1–3 hash-compatibility shim
(`legacyOrderSnapshotHash`), and the Fresh Alliance parser's pre-`isConfirmed`
hash-compatibility shim (`legacyPickupSnapshotHash`, added and already dead
one day after it was written) were all removed in the same pass. `parseOfbCsv`
and `parseFreshAllianceCsv` themselves are unaffected and undiminished — they
remain the active parsing engine `unified.ts` delegates to for each half of a
unified file; only the *standalone* upload path for a raw 12- or 19-column
file, and the compatibility code for pre-this-feature schema shapes, are gone.

This does not reopen D10 (CSV import stays permanently) — the *unified* CSV
contract remains the supported import path forever. It retires only the two
single-channel contracts the unified export was built to replace.

A companion fix landed in the same pass: `ProcurementImport.unifiedFileHash`,
set from the hash of the original unified file on both `ProcurementImport`
rows one unified upload produces (Warehouse and Fresh Alliance are
permanently separate source namespaces per D3, so one upload is always two
rows). Motivated by a real, reported point of confusion: Import History
labeled the two resulting rows "OFB Completed Orders" / "OFB Agency
Pickups" — accurate per channel, but with nothing showing they came from one
upload action, so seeing both looked like an inconsistency rather than the
expected shape. The Import History table and the import detail dialog now
name the paired row ("Paired with OFB Agency Pickups" / "From the same export
as: OFB Completed Orders") whenever a sibling sharing the hash exists.

### D15 — Pending Fresh Alliance weight counts equally; disclosed, not walled off
Decided 2026-07-22, resolving the "Deferred, not yet decided" item Phase 6
left open. Three options were weighed — include-and-flag, exclude-and-
surface-separately, show both — and the agency chose include-and-flag,
against my own initial recommendation (exclude-and-surface-separately). The
reasoning that changed it:

**What OFB's `Confirmed` flag actually means, operationally.** It is not a
data-quality gate on the agency's report — it is OFB's own internal audit
sign-off, done by a person reviewing a spreadsheet. The agency is the party
that physically collected and weighed the donation; OFB's review exists to
catch anomalies worth asking about (a sudden implausible quantity, say), not
to independently verify routine reports. Given that, treating "pending" as
"less true than confirmed" misrepresents what the checkbox is for. D13
already established the agency is the authoritative observer for this
channel; this decision follows that reasoning through consistently rather
than quietly reintroducing a confirmed/unconfirmed hierarchy through the
Analytics door that D13 rejected through the import door.

**Rolling pending weight is the normal state, not an anomaly to route
around.** OFB's review lag is structural — there is always some window of
recently-submitted, not-yet-reviewed pickups — so "wait until confirmed" is
not a temporary inconvenience Analytics can design past; it is permanent
weather. Excluding it would mean recent activity is *always* somewhat
undercounted in headline totals, every single day, by design.

**Decision:** pending weight is counted in every total exactly like confirmed
weight — no `isConfirmed` filtering anywhere in `getProcurementAnalytics`.
A small, factual note states how much and over what date range, so the
system is transparent about the distinction existing without treating it as
a data-quality caveat. Wording is deliberately plain rather than alarmed:
"Includes {weight} of Fresh Food Alliance donations from {date} to {date}
still awaiting OFB's confirmation sign-off." Placed on the two cards where
Fresh Alliance weight is the headline figure — Inbound Supply Summary and
Fresh Food Alliance Receipt Categories — not scattered across every chart
that touches the number, since the note states the same fact regardless of
where it appears and repeating it further would be noise, not transparency.

This does not weaken the case for D13's own caution: `isConfirmed` is still
recorded as a stated fact, not discarded, and remains available if the
agency's judgment about OFB's review process ever changes, or if the pending
share grows enough that Option C (show both) becomes worth its added
complexity. Today it is under 1% of total Fresh Alliance weight; revisit if
that changes materially.

The decisions below (D16–D22) were settled 2026-07-23 and are documented in full
in [data-shaping-and-legacy-integration.md](data-shaping-and-legacy-integration.md).
They cover two linked capabilities: import-time **data-shaping flags/rules**, and
the **legacy community-donation** integration.

<a id="d16"></a>
### D16 — Legacy community history is a procurement subset (revises D9)
The community *food*-donation slice of the legacy workbooks enters procurement
under its own `source = 'legacy_community'` (the D3 separate-source pattern), not
as a wholly separate domain. Scope is community food only — OFB-supply rows (they
duplicate authoritative data), hygiene/supply, client-service counts, volunteer
hours, and derived averages are all dropped. A hard cutoff at **2023-06-01** (the
first Fresh Alliance delivery) means legacy and OFB abut with no overlap and no
double-count. D9's caution against fabricating line-item detail is preserved; its
"separate domain" conclusion is superseded.

### D17 — Monthly granularity is a first-class, tagged property
Legacy events carry weight · source · month and nothing finer — no delivery day,
no product code, no line items. They are tagged `estimated` (aggregate grain), and
that tag governs inclusion: **present** in weight/time/source views (their own
series on Inbound Weight Over Time; counted-with-disclaimer in Inbound Supply
Summary), **absent** from product-category and line-level views. Absence over
zero-fill — showing nothing is honest where inventing categories would lie. Extends
the D15 disclose-don't-hide principle to resolution.

### D18 — The canonical map is authored data, retained as a private artifact
Legacy source identity is reconciled by a human-curated map
(`source_as_written → source_canonical`, plus `disposition`), authored with the
agency director's institutional knowledge — 37 label variants to 25 donors. The
verbatim label is always preserved beside the canonical one; nothing is overwritten.
The map is retained and reviewed as private operational data outside the FEED
repository, **never committed and never inferred by code** (consistent with D4).
Validated against the live OFB record over the Jun–Sep 2023 overlap: >50% of monthly
cells matched to the pound, lending confidence to the uncheckable pre-2023 gap.

### D19 — Data-shaping flags are non-destructive overlays
Events are immutable facts; classification is a reversible overlay, and each view
declares which flags it honors. Two families: **exclusions** (`pass_through`,
`other_exclusion`) change a metric's total; **annotations** (`at_risk`,
`estimated`, `program_bound`) change meaning/confidence, not the math. The
exclusion set is deliberately minimal: `non_food` is already a product category
(flagging it would encode the same fact twice), and a `one_off` donation can still
be food the pantry distributed, so neither belongs. `other_exclusion` is the
open-ended escape hatch and cannot be saved without a note explaining it.
Donor rules match on donor code, donor name, or both — either hitting suffices. Every
exclusion is disclosed where it acts (D15 generalized). Default is inclusive;
agencies opt into exclusions. Flags never mutate or delete events.

### D20 — Flags and import rules live in Data Management, not Analytics
Authoring is an import-time and post-import concern. Two entry points: the rules list (standing rules,
with donor fields autocompleted from donors FEED has actually seen) and the
per-import Actions menu (reshape retroactively, beyond rollback). Scoped to donor /
category / date-range·program / single event. Rules are evaluated at **read time**
against every enabled rule and are never bound to an import, so one saved rule
governs past, present, and future data until the agency changes it — no
re-application step exists. FEED never proposes a rule: suggesting a donor "looks
like" it needs excluding would be FEED forming an opinion about the agency's
operation. They are contextual and
relational — an agency's operational truth — **never general system logic**.
Analytics only reads the result. (Prior art: the ZEV project's rules-at-ingestion
with saved rule sets.)

### D21 — Procurement ≠ supply is a first-class distinction, resolved by configuration
"Received" (every real event) and "retained inventory" (what the pantry actually
distributes) are different questions answered from the same immutable events via the
`pass_through` flag. New Seasons - Slabtown is the canonical case: WTH couriers it to
another agency rather than distributing it.

**It is resolved at the configuration level only** — no code special-case, no shipped
exclusion, no interim fix. This build has not reached production, so there is nothing
to hot-fix; the expectation is that on release the agency imports its data and applies
the `pass_through` rule through D20's interface. The distinction applies identically to
live OFB Fresh Alliance data and to legacy `legacy_community` data, because the flag
attaches to donor identity, not to a source.

### D22 — The legacy import is a permanent single-agency sidecar
The legacy contract remains a permanent WTH-only source adapter. It teaches the
system nothing general and, under future white-label support, is hidden — it
applies only to WTH. FEED's analytics foundation stays the OFB Primarius
exports; this is an annex, not a second foundation.

The original D22 UI decision used a dedicated **Import Legacy** action separate
from OFB. That button remains operational during the Phase 0 transition, but its
placement is superseded by D23; the source namespace, schema, and agency-only
scope are unchanged.

### D23 — External data enters through one classifier-driven Add Data workflow

Decided 2026-08-10 after comparing the existing FEED import flows with the ZEV
Data Library's tested source-detection pattern. Data Management will converge on
one **Add Data** action. FEED identifies the artifact's structural contract and
routes it to OFB, legacy procurement, Link2Feed, SIMC, WTH Tracking, or another
registered adapter. Users do not choose or force a parser.

This unifies orchestration, not data semantics: D22's legacy source remains a
WTH-only sidecar and OFB remains the standard procurement foundation. The
current separate buttons are removed only after their Add Data branches prove
functional, error, warning, rollback, authorization, accessibility, and corpus
parity. Full transition contract:
[unified-add-data.md](unified-add-data.md).

## Phases

Each phase is independently shippable. Check items off in place.

### Phase 1 — Verify historical coverage ✅ complete (2026-07-20)
- [x] Full-history Fresh Alliance export obtained (3,933 rows, 826 events, from 2023-06-01)
- [x] Year-by-year parity against the `AGPCKUP` subset — exact, zero delta
- [x] Confirmed no `AGPCKUP` event lacks a Fresh counterpart, and vice versa
- [x] Confirmed all money columns `$0.00` across the full corpus
- [x] Findings recorded in [fresh-alliance-coverage-verification.md](fresh-alliance-coverage-verification.md)

**Gate result: passed.** Superseding is lossless over the full 826-event history.

### Phase 2 — Fresh Alliance parser ✅ complete (2026-07-20)
Pure normalization, no schema change, no persistence. Reviewable in isolation
and validated against the real 3,933-row corpus.

- [x] `parseFreshAllianceCsv` against the exact 19-column contract
      — `packages/backend/src/services/procurement/fresh-alliance.ts`
- [x] Donor code/name, pickup ID/reference/line ID, pickup time, submitted timestamp
- [x] Received qty/weight, Fresh Alliance category, donor value per pound
- [x] Temperature validated then discarded (D7)
- [x] Unknown-time warning for `12:00 AM` (D8)
- [x] Missing-valuation warning where rate is `0.00`, weight retained (D6)
- [x] Event grouping by `Pickup Reference` with deterministic snapshot hash
      (row-order independent; changes when donor changes)
- [x] Structural failures reject; reconcilable anomalies warn
- [x] 14 tests including a corpus test over the full real export
      — `packages/backend/__tests__/features/procurement/fresh-alliance-import.test.ts`

Also landed: parsing primitives extracted to
`packages/backend/src/services/procurement/parsing.ts` and shared by both
parsers, so the date, numeric, reference, and product-family contracts cannot
drift between them. `index.ts` re-exports `ProcurementImportError`,
`ACQUISITION_CLASSES`, and `AcquisitionClass` so its public API is unchanged.

**Channel classification is file-level here.** Every event in the Agency Pickups
export is a Fresh Alliance receipt because of the export it came from; reference
suffixes and product-code prefixes are not consulted. This is stricter and more
honest than the suffix inference the 12-column path must use.

The corpus test is gated on `FEED_PRIVATE_DATA_DIR` plus `existsSync` because the
real export is private agency data stored outside the repository. It runs locally
for authorized developers holding the file and skips in CI.

### Phase 3 — Persistence and supersede ✅ complete (2026-07-20)
- [x] Schema: donor and pickup fields on revision; received/valuation/FA-category on line
- [x] Schema: `supersededByImportId` on `ProcurementOrderRevision`, reversible
- [x] `importFreshAllianceCsv` under `source = 'ofb_pickup'` (D3) with its own
      revision lineage; products stay under `ofb` so one code means one catalog entry
- [x] Window-bounded supersede of `source = 'ofb'` + `fresh_alliance_receipt` (D1)
- [x] Rollback clears exactly what an import claimed; restore reclaims its window
- [x] Analytics and data status read both sources and exclude superseded revisions
- [x] `POST /api/procurement/imports/fresh-alliance`
- [x] Migration verified: full chain applied to a private external copy of
      `backup_20260709_103507.db`, all columns and indexes present,
      168 food items and 9 categories preserved
- [x] 21 Fresh Alliance tests (30 procurement total); full suite 352/352

**Two correctness details worth remembering:**

*Supersede claims are per-import and unclaimed-only.* `applySupersede` matches
`supersededByImportId: null`, so the first covering import keeps the claim,
overlapping imports stay deterministic, and each import releases exactly what it
took. Restore recomputes the claim from the import's recorded window rather than
remembering a row list.

*Re-importing Completed Orders re-triggers supersede.* Fresh AGPCKUP revisions
land unclaimed, so `importOfbCsv` reasserts every active Fresh Alliance import's
window after writing. Without this, re-importing an orders export after a Fresh
Alliance import would silently restore double counting. Covered by
"re-importing Completed Orders cannot reintroduce double counting".

*Excluding and including are one change.* Analytics previously hard-coded
`source: 'ofb'`. Superseding without also reading `ofb_pickup` would have
dropped ~570,000 lb from reports, so `corpusWhere` gained both the source list
and the superseded filter together.

### Phase 4 — Coverage visibility ✅ complete (2026-07-20)
- [x] `getProcurementDataStatus` returns a per-channel window — event count,
      earliest and latest receiving date — excluding superseded and inactive rows
- [x] Coverage strip in Data Management showing both windows side by side
      — `packages/frontend/src/components/data-management/coverage-strip.tsx`
- [x] Descriptive framing only, enforced by test (D12): no "overdue", "behind",
      "incomplete", "missing data", or "failed to" anywhere on the page
- [x] Staleness follows the newest observation FEED holds, so a lagging channel
      never makes the corpus read as stale
- [x] Stale prompt reworded from a judgement to an offer
- [x] Resilient to a status payload without `coverage` — an older cached
      response should not take the page down
- [x] 4 backend coverage tests, 1 frontend coverage test

**Validated end to end against the real corpus (2026-07-20), not mocks:**

| Check | Result |
| --- | --- |
| Fresh Alliance weight before import (from `AGPCKUP`) | 826 events, 569,969 lb |
| Fresh Alliance weight after import (donor-attributed) | 826 events, 569,969 lb |
| Double counting | none — identical to the pound |
| `AGPCKUP` events superseded | 826, marked not deleted |
| Warehouse totals | unchanged, 1,321 events / 3,152,249 lb |
| Rollback | supersede marks cleared, prior observations returned in full |
| Restore | window reclaimed, 826 marks reapplied |
| Donor roster | matches the verification record exactly, all seven partners |
| Valuation coverage | 1,108 lines / 164,298 lb unvalued (D6) |
| Unknown pickup times | 62 (D8) |

**Two defects found during that walkthrough and fixed:**

*Import History showed the raw `ofb_pickup` string.* `sourceLabel` only knew
`ofb`. Both sources now read as "OFB Completed Orders" and "OFB Agency Pickups"
— same portal, different export.

*A full-history import returned 1,170 individual notes in a 350 KB response*,
which the details dialog would have rendered as 1,170 rows. Repeated per-row
observations are now summarized once per kind with a count, retaining every
affected row number. The same import now returns two notes in 5.4 KB — a 65×
smaller payload — and anything genuinely actionable is no longer buried.

**Import became one action instead of two.** Rather than adding a second button
and asking staff to declare which OFB export they were holding — a choice they
could get wrong, on two files that look alike, mid-task — FEED reads the header
row and routes the file itself (`services/procurement/detect.ts`). Detection is
exact-match only and never guesses at a near-miss; an unrecognized file names
both accepted exports. `POST /imports/ofb` and `POST /imports/fresh-alliance`
were replaced by a single `POST /imports`.

The import confirmation now states what was recognized and, for Agency Pickups,
says plainly how many Completed Orders receipts it replaced so weight is counted
once — the one part of this design staff would otherwise have to reason about.

### Phase 5 — Donor analytics ✅ complete (2026-07-20)
- [x] Grocery Partner Mix — received pounds by partner (Carbon palette)
- [x] Per-partner pickup cadence — visit count, share, and average load
- [x] Per-partner category breakdown carried in the payload
- [x] Donor contribution over time via `donorMonthlyWeight`
- [x] Recorded Donated Value stated with its coverage percentage (D6)
- [x] Observations only — a test asserts the section contains no "best",
      "worst", "underperform", "declin", "should", or "top partner"
- [x] Degrades to an empty state rather than crashing without donor data
- [x] 3 frontend tests; 190/190 frontend, 357/357 backend

The value card leads with coverage rather than footnoting it: the recorded
total is a partial sum, and unvalued pounds are shown beside it so the figure
can never be read as the value of all donated supply.

Partner cadence turned out to be the most operationally useful output. Over the
last 90 days Restaurant Depot made 18 pickups averaging 157 lb while Amazon made
19 averaging 993 lb — near-identical visit counts for six times the load, which
is a routing and staffing fact rather than a judgement about either partner.

**Partner Contribution Over Time and the partner filter landed 2026-07-20**,
retiring the dormant `donorMonthlyWeight` field rather than leaving it unused.
Partner selection filters client-side over data already fetched, so it never
interacts with the channel and acquisition filters, whose whole-event semantics
would make a combined result hard to reason about. Months without a delivery are
zero-filled so a line never bridges a gap and implies a delivery that did not
happen.

**Phases 1–5 constitute the production-ready MVP.**

### Phase 6 — Fresh Alliance confirmation status ✅ complete (2026-07-21 FEED groundwork; 2026-07-22 extension + unified parser)
Full findings in
[fresh-alliance-pending-pickups.md](fresh-alliance-pending-pickups.md); decision
recorded as D13. Extension design doc:
`OFB Data Fetch Plugin/docs/unified-export-design.md`.

- [x] Investigated Primarius Pending/Completed live, read-only, production —
      confirmed same-record identity, confirmed the Warehouse/Fresh-Alliance
      asymmetry with direct evidence, resolved the duplication question
- [x] FEED schema: `isConfirmed` on `ProcurementOrderRevision` — nullable,
      Fresh Alliance only
- [x] Extension v2.0.0 shipped: one Order History action, one sparse
      26-column CSV (`Schema Version`, `Record Type`, `Confirmed` plus the
      union of both legacy contracts) covering Warehouse Completed orders
      and Fresh Alliance Pending + Completed pickups for one date range.
      `AGPCKUP` rows excluded from `warehouse_order`. Pending sampled before
      Completed, so a pickup transitioning mid-export cannot be omitted or
      double-counted. Refuse-partial extended across all three source
      fetches. Verified: `npm test`, browser-level synthetic export with
      reconciliation and race simulation, release build inspection.
- [x] FEED unified parser (`packages/backend/src/services/procurement/unified.ts`):
      splits rows by `Record Type`, reconstructs synthetic buffers matching
      the two existing 12- and 19-column contracts exactly, and delegates to
      the already-tested `parseOfbCsv`/`parseFreshAllianceCsv` rather than
      re-implementing row validation a third time. Row numbers in every
      thrown error and returned warning are translated back to their
      position in the original unified file. `fresh-alliance.ts` gained one
      backward-compatible parameter (`confirmedByReference`) so a pending
      row's `Confirmed: No` becomes `isConfirmed: false` on the persisted
      revision; the legacy 19-column entry point is unaffected. Wired into
      the existing generic detect-and-import flow (`detect.ts`,
      `OfbImportDialog`) — no new UI, the same "drop any recognized OFB
      export" action now recognizes a third format.
- [x] **Real bug found and fixed during verification, not just discovered.**
      Every Fresh Alliance pickup imported before 2026-07-21 has a stored
      snapshot hash computed without `isConfirmed` (it didn't exist on the
      hashed identity yet). Running the unified parser against a copy of the
      real database surfaced this directly: all 29 already-current pickups
      in the sample's date range came back "changed" instead of "duplicate,"
      even though every persisted field was byte-identical — confirmed by
      reconstructing the same 8-line pickup through the *unchanged* legacy
      path and finding it also failed to match the stored hash. Root cause
      isolated to one commit (`a2ddecd`, 2026-07-21) via `git log -p`, not
      guessed. Fixed the same way the OFB Warehouse parser already fixed its
      own v1–v3-to-v4 hash transition: `legacySnapshotHash` computed without
      `isConfirmed`, accepted as equivalent on import. Re-verified against a
      fresh copy of the real database: the same 29 pickups now correctly
      skip as duplicates, only the 14 genuinely new pending pickups import,
      and the previously-affected revision stays at revision 1. Regression
      test added. Without this fix, every future re-import of any
      previously-held Fresh Alliance date range would have silently
      accumulated a spurious new revision per pickup, forever — not a
      correctness bug (weight and `isCurrent` tracking stayed right
      throughout), but real, unbounded, needless database growth and
      misleading "changed" counts in Import History.
- [ ] **Known, minor, undecided.** `ProcurementLine.sourceRowNumber` on a
      unified-imported line reflects the reconstructed sub-CSV's row
      position, not the original unified file's. Every warning and thrown
      error is correctly translated back to the original file (tested); this
      one persisted, rarely-inspected audit column is not. Low value against
      the complexity of a generic fix across two differently-shaped nested
      structures (`orders[].lines[]` vs `pickups[].lines[]`) — left as a
      disclosed gap rather than fixed speculatively.
- [x] **Decided 2026-07-22.** How Analytics treats pending weight — recorded
      as D15: include-and-flag, chosen over this document's own initial
      recommendation of exclude-and-surface-separately. Full reasoning and
      implementation in D15 above.

**Verification performed for this phase**, beyond the automated suites: real
`OFB Order CSV Exporter v2.0.0` sample (535 rows, 8 warehouse orders, 43
Fresh Alliance pickups — 29 confirmed, 14 pending) parsed and persisted
against a copy of the production-shaped database, not just synthetic
fixtures. Weight totals, confirmed/pending counts, zero AGPCKUP-in-warehouse,
zero confirmed/pending reference overlap, and correct duplicate-detection on
re-import all confirmed directly against real data.

### Phase 7 — Retire legacy single-channel import ✅ complete (2026-07-22)
Full rationale recorded as D14.

- [x] Dev database's procurement tables cleared (`ProcurementImport`,
      `ProcurementOrderRevision`, `ProcurementProduct`, `ProcurementLine`) and
      re-populated from a fresh full-history unified upload — three files
      covering 2009–2026, 1,322 active Warehouse events and 840 active Fresh
      Alliance events, matching the coverage strip exactly. Backed up to
      scratchpad first; reversible, not exercised.
- [x] `detect.ts` deleted. The route calls `importUnifiedOfbCsv` directly;
      the unified parser's own header validation is now the only format
      check. `OfbExportKind`/`DetectedImportResult` unions removed from both
      backend and frontend — the API returns a bare `UnifiedImportResult`.
- [x] `legacyOrderSnapshotHash` (OFB Warehouse, schema v1–3) and
      `legacyPickupSnapshotHash` (Fresh Alliance, pre-`isConfirmed`) removed,
      along with their fields and the tests that exercised them. Both were
      provably unreachable: no data in either old shape exists anywhere,
      dev or production.
  - Found while removing the first one: a **second**, near-identical legacy
    hash mechanism already existed for Fresh Alliance (`legacyPickupSnapshotHash`,
    landed 2026-07-21 to fix the isConfirmed hash-transition bug Phase 6
    describes) that hadn't surfaced in the plan until this pass touched it.
    Same category of debt, same justification, removed the same way.
- [x] `ProcurementImport.unifiedFileHash` added — nullable, set on both rows
      a unified upload produces, from the hash of the *original* unified
      file (not either reconstructed sub-buffer, which differ from each
      other). Threaded through `importOfbCsv`/`importFreshAllianceCsv` via a
      new shared `ImportOptions` type rather than overloading the existing
      parse-level options object.
- [x] Import History table and the import detail dialog name the paired row
      when a sibling sharing `unifiedFileHash` exists — resolves the
      reported confusion of seeing two differently-labeled rows from one
      upload action with nothing showing they were related.
- [x] Tests: legacy-hash tests removed (not adapted — the behavior they
      covered no longer exists); new coverage for the correlation field
      (backend: both `procurementImport.create` calls receive the same
      hash; frontend: the table names the correct sibling, and an
      unpaired/legacy-predating row shows nothing).

**Verification:** real project typecheck (`tsconfig.app.json`) confirmed the
only new frontend errors were the expected test-file breakage from the
removed exports, now fixed; the `ColumnDef<unknown>` generic-widening class of
error is unchanged pre-existing debt, confirmed by diffing against a
`git stash` of this pass's changes. 52/52 backend procurement tests, 376/376
backend total, frontend procurement-area tests green.

### Phase 8 — Data-shaping flags + legacy community integration ✅ complete (2026-07-25)
Design intent recorded in
[data-shaping-and-legacy-integration.md](data-shaping-and-legacy-integration.md)
and D16–D22. Stage 1 (documentation) and Stage 2 (implementation) complete.
The dedicated import buttons described below remain operational during D23's
incremental Add Data transition.
- [x] 2a — Flag/rule foundation: `ProcurementDataRule` model + migration, pure
      matching/resolution service, CRUD + REST API, Data Management rules UI with a
      per-import "Shape Data" action, donor autocomplete from observed donors
      (35 backend + 5 frontend tests)
- [x] 2b — Analytics honors flags: rules resolved at read time per line, a
      `dataShaping` block reporting excluded/retained weight and a per-flag
      breakdown, and a disclosure note on Inbound Supply Summary naming what was
      set aside. Annotations measured but never subtracted. Verified live against
      the real corpus (New Seasons: 9,213 lb over 119 events separated from
      supply; cross-checked by direct SQL)
- [x] 2c — `legacy_community` source + third `community_donation` channel;
      curated-ledger parser/importer with stable per-month references (a
      corrected weight becomes a revision, not a new event); admin "Import
      Legacy" action separate from the OFB drop-zone; legacy counted in
      weight/time/source views and explicitly excluded from every product and
      category view; own line/color/legend on Inbound Weight Over Time. Curated
      artifacts live outside the repository under the authorized private-data root
      (real organizational data, local only; never commit). Verified live: 596 rows → 550
      months, 1,033,334 lb, Oct 2016 – May 2023, clean seam at 2023-06
- [x] 2d — Tests for flag honoring + disclosure; cutoff and overlap validation
      as regressions; 108/108 procurement tests pass with the authorized private
      corpus, 54/54 frontend Data Management + Procurement Analytics tests pass,
      and the full 23-migration chain applies to a fresh SQLite database

### Phase 9+ — Further polish, post-MVP

## Transport, deferred

Explored in depth on 2026-07-20 and deliberately deferred behind correctness
(D11). Recorded so the reasoning is not relitigated from scratch.

**Established:** OFB does not grant agencies API access — a walled garden.
Primarius exposes Orders and Agency Pickups as unrelated entities; neither
carries the other's identifier, so the join genuinely does not exist upstream.

**Option A — Extension pushes to FEED.** Extension already holds a legitimate
authenticated session. Costs a host permission and a FEED-issued token. No
credential custody, no autonomous login, no backend scraping. Cheaper than
previously assessed: the extension is distributed unpacked in Chrome Developer
Mode, so no Web Store review gates it.

**Option B — Server-side fetch.** FEED stores Primarius credentials using the
existing AES-256-GCM infrastructure and drives Puppeteer, which is already in
the backend for PDF rendering. Closest to the desired UX.

Conditions agreed before Option B is built:
- **Read-only tenant** from OFB rather than an individual's login. Highest-
  leverage risk reduction available; worth requesting regardless of transport.
- **No scheduler.** User-initiated, one click only.
- **Rate and range constraints** so FEED cannot burden OFB's servers.
- Extract the extension's normalization logic into a package shared by the
  extension and the backend. `export-core.js` and `fresh-alliance-core.js` are
  already isomorphic (UMD, `module.exports`/`require`). Product-code edge cases
  took extension releases v1.1.1–v1.1.3 to get right; a second implementation
  would drift, and the failure mode is silently wrong normalization. This is a
  prerequisite for Option B, not a nice-to-have.
- The PDF Chromium path is a sealed offline renderer — request interception with
  an allowlist that aborts everything else. An authenticated session must be a
  separate, separately-configured browser context, not an extension of it.

**Note on scope:** FEED's revision-hash model already makes incremental append
mostly free — an identical snapshot is a no-op. Incremental fetching is
politeness toward OFB's servers, not a correctness requirement.

## Analytics UI polish landed after the MVP

Unrelated to Phase 6 above (naming coincidence only — this predates the
confirmation-status work). Two of the analytics-page requests from review
landed as polish, ahead of the extension work:

- **Seasonal channel breakdown.** `seasonalChannelWeight` (added earlier as a
  computed-but-unwired field — see the Phase 5 note above) now backs a channel
  `Select` on the Seasonal Inbound Weight card. Same "one source of truth" rule
  as the donor filter: the card's own control is offered only when the
  page-level channel filter is "All Channels"; when the page filter narrows,
  the card follows it and the card-level control disappears rather than risking
  disagreement with a filter visible elsewhere on the page. Pinned by two
  frontend tests.
- **Paid-product family colors and Other breakdown.** Bars in Where Paid
  Procurement Dollars Went are colored by product family (parsed from the OFB
  description prefix, e.g. "Meals, Beef Stew" → Meals) instead of one flat
  color, and the aggregate "Other paid products" row's tooltip breaks itself
  down by family — grouping is the only way the tail is legible; individually
  the 144 remaining codes average 0.19% of paid spend each. Rendered with one
  `Bar` + a `Cell` per row rather than a series-per-family stack, because a
  14-series stacked `Bar` set produced empty rectangle groups with no painted
  geometry in this Recharts version — that failure mode is worth knowing before
  reaching for a per-series stack again on a chart with this many categories.
- **Sticky top filters.** The tab switcher (Operations/Procurement) and date
  range control are `position: sticky` beneath the app header on the Analytics
  page, so they stay reachable across a long scroll of Procurement cards.
  `position: sticky`, not a `ScrollArea`-wrapped card region — AGENTS.md
  requires `ScrollArea` to have a definite height, which on a page this long
  would mean a nested scroll region that traps wheel events and behaves badly
  on mobile; sticky keeps native page scroll. Verified in the browser at
  desktop and mobile width, light and dark theme, and with the Custom Range
  popover open while scrolled (no z-index conflict).

**"Other paid products" became a real stacked bar — landed 2026-07-21.** The
Cell-based single-color workaround from the prior pass was a deliberate,
disclosed compromise: the family breakdown existed only in the tooltip, not
as a visible segmented bar, because a 14-series `stackId` stack rendered zero
geometry. Investigated further rather than left as the final answer: this
is a documented Recharts limitation (recharts/recharts#3883, "Stacked Bar
Chart disappears when stackId is added for complex datasets"), reproduced
here even after eliminating undefined per-series values, not something
specific to this data or a bug in the aggregation.

Fix: stop using Recharts' native per-series stacking entirely. `Bar` now
takes a custom `shape` (`PaidProductBarShape`) that draws each row's
`segments` as adjacent `<rect>`s sized directly from the real dollar values,
clipped to a shared rounded rect so the bar's outer corners stay rounded
while interior segment boundaries stay square — the same visual result a
native stack would give, without touching the mechanism that doesn't render.
`buildPaidProductChartSeries` was reshaped to match: every row (ordinary or
aggregate) now carries a unified `segments: Array<{family, spendDollars}>`
instead of the previous sparse per-family-key record plus a separate
`familyBreakdown` field, which removes the `familyKeyOf` helper the Cell
approach needed.

Verified this time by measuring actual rendered geometry in the browser, not
just checking the code compiles: 47 painted rects across 16 rows (15 ordinary
+ 1 aggregate, each contributing one clip-path rect, plus 30 colored segment
rects — 15 ordinary rows × 1 segment, 15 segments on the aggregate row
alone), and the aggregate row's measured segment widths converted back to
percentages (30.9%, 11.9%, 11.2%, …) match the known family shares to within
pixel-rounding error. Confirmed in both light and dark theme.

**Fresh Food Alliance Receipt Categories gained donor identity, sortable
headers, and a donor filter — landed 2026-07-20.** The table's stale
description ("Partner identity is unavailable in this source and is never
inferred") predated the Agency Pickups import and was never corrected when it
started shipping donor identity — the same mistake `procurement-imports.md`
had, caught the same way: a user re-reading the actual page.

Backend: a new `freshAllianceDonorCategories` aggregation splits the existing
category-only observations by donor, computed in the same per-line loop as
`freshAllianceCategories` (donor code and name are already available there
from the donor-summary work) and kept as a separate field rather than
replacing the category-only one — the Fresh Food Alliance Category Mix chart
is legitimately still a donor-agnostic view, and reconciling two derived maps
against the same source lines is safer than reshaping one map's meaning
mid-stream. A receipt with no donor on file is bucketed under an explicit
`donorCode: null` / `"Not Reported"` row rather than guessed or silently
dropped — the per-donor total must always reconcile to the category-only
total, and a backend test asserts exactly that. In the current corpus this
bucket is empty, because the Fresh Alliance import supersedes every AGPCKUP
event it covers, but a partially superseded window is a real possibility this
must not misrepresent.

Frontend: the donor filter follows the same multi-select pattern already
established for seasonal years and the donor-trend chart (`DropdownMenu` +
`DropdownMenuCheckboxItem`, select-all/clear-all, defaults to every donor
present). Column sorting was extended to match the level other procurement
tables provide on their equivalent columns — Donor, Category, Receipt Events,
and Receiving Dates all gained sort arrows; Source Code and Last Received stay
plain, consistent with every sibling table's identical columns.

**Fixed family colors, plus a legend, landed 2026-07-20.** Bar colors were
previously assigned by rank (`carbonCategoricalTheme(index)` over
`paidProductSeries.families`, sorted by spend in the current view) — a color
meant whichever family happened to be Nth by spend in *that* render, so the
same color could mean "Meat" on one date range and "Rice" on another. A fixed
`FAMILY_COLOR_ASSIGNMENTS` table now keys color by family label instead: 9
Carbon hues (hue-hopped for adjacent contrast) at `primary` grade cover the
9 most distinct known families, the remaining 5 repeat those hues at
`secondary` grade, and `Unclassified` is pinned to `warmGray` — reserved,
never assigned to a real family, so a muted color visually marks "not a real
category." A description prefix outside the profiled 14 still gets a
deterministic hash-based color rather than colliding with an existing family
or the reserved gray.

A companion legend renders beneath the chart, one swatch per family present
in the current view, resolved directly via `useTheme()` + a hex lookup rather
than the CSS custom properties `ChartContainer` injects — Recharts constrains
`ChartContainer`'s only child to the chart itself, so there's no way to mount
a legend as a descendant of the `[data-chart=id]` scope those variables are
declared on. Same pattern already used in `dashboard/category-chart.tsx` for
the identical reason.

A real frontend typecheck regression was found and fixed during this pass —
see the AGENTS.md "Lessons From Recent Work" entry on `tsc --noEmit` silently
checking nothing when invoked without `--project tsconfig.app.json`. The
concrete bugs it had been hiding: an incomplete `emptyAnalytics` test fixture
missing `coverage`/`donors`/`donorMonthlyWeight`/`donorValue`/
`seasonalChannelWeight`, a duplicate import, and a real runtime-adjacent bug
where `selectedChannel`'s inferred type widened to plain `string`, which would
have made a `Record<ProcurementChannel, string>` lookup silently return
`undefined` for the seasonal card's channel label. Confirmed via an isolated
`git worktree` checkout of the session-start commit that this session's
frontend work introduced zero net new distinct TypeScript errors once those
were fixed; the ~10 errors remaining in touched files are the pre-existing
`ColumnDef`/icon debt category documented in `docs/TSC-DEBT.md`.

## Tracking progress empirically

Claims about this feature should be checkable, not remembered:

- **Coverage parity** — the year-by-year table in the verification record.
  Re-run if the export contract changes.
- **Supersede correctness** — total Fresh Alliance weight must be unchanged
  after a Fresh Alliance import supersedes the `AGPCKUP` population. 569,969 lb
  through 2026-07-14 is the reference figure.
- **No double counting** — combined inbound weight must not increase when the
  same period is imported through both formats.
- **Donor totals** — the roster table in the verification record is the expected
  output of Phase 5's donor mix once the full corpus is loaded.

## Related documents

- [procurement-imports.md](procurement-imports.md) — the import contract
- [data-shaping-and-legacy-integration.md](data-shaping-and-legacy-integration.md) — Phase 8 design intent (flags/rules + legacy community integration; D16–D23)
- [unified-add-data.md](unified-add-data.md) — D23 global import orchestration and transition contract
- [fresh-alliance-coverage-verification.md](fresh-alliance-coverage-verification.md) — Phase 1 evidence
- [fresh-alliance-pending-pickups.md](fresh-alliance-pending-pickups.md) — Phase 6 evidence: the live Primarius investigation, D13's basis
- `docs/reports/operational-analytics-design.md` — analytics source of truth
- `AGENTS.md` § Operational Analytics Direction — standing constraints
