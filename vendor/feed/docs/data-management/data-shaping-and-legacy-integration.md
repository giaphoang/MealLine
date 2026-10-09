# Data Shaping & Legacy Integration

**Started:** 2026-07-23
**Status:** Stages 1–2 complete — rule foundation, Data Management UI, Analytics
disclosure, legacy community integration, regression verification, and CHANGELOG
landed 2026-07-23–25.
**Owner doc:** design source of truth for two linked capabilities — (1) import-time
**data-shaping flags/rules**, and (2) the **legacy community-donation** integration.
Decisions here are recorded formally as D16–D23 in
[procurement-unification-plan.md](procurement-unification-plan.md); this file is the
fuller narrative and the "why."

---

## Why this exists

Two problems surfaced together on 2026-07-23, and they turn out to be one design:

1. **Procurement ≠ supply.** WTH records New Seasons - Slabtown pickups, but it
   does not distribute them — it couriers them to another agency. The weight is a
   real event, yet it is *not* this pantry's inventory. New Seasons appears in the
   OFB Fresh Alliance data, so any total that treats "received" as "supply"
   overstates what the pantry actually distributed.

   This is resolved **at the configuration level only** (D21) — no code special-case
   and no interim fix. This build has not reached production, so there is nothing to
   hot-fix; on release the agency imports its data and applies the `pass_through`
   rule itself. FEED ships no opinionated exclusions, because only the agency knows
   which of its pickups are courier runs.

2. **A seven-year donation history exists, in the wrong shape.** Eight
   agency-authored workbooks (`In-Kind Donations FY2016-17` …
   `Social Services Tracking FY2023-2024`) hold monthly community food-donation
   totals reaching back to Oct 2016 — nearly seven years before the OFB Fresh
   Alliance record begins (2023-06-01). They are monthly cross-tabs, not
   transaction logs: weight × source × month, no delivery day, no product code, no
   line items. The historic-ledger analysis and source records are private
   operational data held outside the repository.

The first problem needs a way to say "this event happened but does not count as
supply." The second needs a way to admit lower-resolution data honestly. **Both are
the same mechanism: a non-destructive classification layer over immutable events.**

---

## The mental model: events vs. overlays

FEED separates two layers, and keeping them separate is the whole design:

- **The event** — when, from whom, how much, from which source record. This is what
  the OFB extension delivers and what the legacy ledger delivers (at monthly grain).
  It is a fact. **It is never mutated, excluded, or deleted.**
- **The interpretation** — what the event *means* for a specific question: Is it
  retained inventory? Is it food? Is it reliable? Is it precise? This is a
  **configurable, non-destructive overlay.**

Analytics then works by having each view **declare which interpretations it honors.**
"Retained inventory weight" honors the pass-through exclusion; "total donations
received" ignores it. Same events, two honest answers, zero data mutation. This is
the [D15](procurement-unification-plan.md) principle — *count the fact, disclose the
caveat* — generalized from one case into a system.

The payoff of this framing: **the disposition column we authored for the legacy data
IS this overlay.** New Seasons is tagged `pass_through` whether the row came from a
2019 spreadsheet or last week's OFB export. Building the flag system and integrating
the legacy data are not two projects — they are one.

---

## The flag taxonomy

Two families. The distinction — whether a flag changes the math or only the meaning —
is load-bearing.

### Exclusions (change a metric's total)

| Flag | Meaning | Effect | Grounding example |
|---|---|---|---|
| `pass_through` | received, then relayed to another agency | drop from inventory/procurement; keep as a donation event; optionally surface as "pounds relayed for partners" | New Seasons - Slabtown |
| `other_exclusion` | weight that should not count toward supply for a reason the vocabulary does not name | drop from supply totals; **requires a note** saying what and why | unforeseen; deliberately open-ended |

The exclusion set is deliberately just these two. `non_food` was rejected because
non-food is already a product category — re-encoding it as an exclusion flag
would express the same fact twice, in two places that can disagree. `one_off` was
rejected because a one-time donation can still be food that the pantry really
distributed, so removing it from totals would understate real supply. Anything
genuinely needing exclusion beyond a courier run goes through `other_exclusion`,
which cannot be saved without an explanation — an unexplained exclusion is exactly
the silent exclusion this design forbids.

### Annotations (change meaning/confidence, not the math)

| Flag | Meaning | Effect | Grounding example |
|---|---|---|---|
| `at_risk` | supply resting on a fragile arrangement | informational; powers "X% of supply is unstable" | Amazon-via-Lift-Up (dock-height-truck rule, July 2026); temporary Safeway slots |
| `estimated` | monthly grain / merged months / low precision | disclosed; optionally excluded from precision-sensitive calcs | the entire legacy ledger; `Dec*/Jan*` merged months |
| `program_bound` | tied to a time-limited external program | segmented out of "ongoing supply" | CFAP (COVID farm-to-family boxes) |

The annotation family is what serves leadership. `at_risk` lets the agency put a
number on dependence and fragility — *this fraction of our food rests on relationships
that could vanish* — which is a risk-legible total, not just another sum. (Context:
Amazon is ~66% of retained inventory across both the seven-year historic record and
the live data, and as of July 2026 its entire flow depends on a fragile shared-pickup
arrangement.)

### Attachment scopes

A flag attaches at the narrowest scope that is true:

- **Donor-level standing rule** — e.g. New Seasons → always `pass_through`. Saved
  once, auto-applied to every future import of that donor. A donor rule may match
  on OFB's donor code, the donor name, or both — either one hitting is enough, so a
  rule survives OFB renaming a donor while still reaching legacy rows that carry no
  code.
- **Category-level** — a whole product code, e.g. marking one category `estimated`.
- **Date-range / program** — e.g. the CFAP window.
- **Single-event manual override** — the one-off exception a rule would not catch.

---

## Where it lives: Data Management, not Analytics

Flags and rules are **import-time and post-import concerns**, so they belong on the
Data Management page, not inside Analytics. Analytics only *reads* the resulting
classification; it never authors it. Prior art: the ZEV project handled data hygiene
as configurable rules set at ingestion, with reusable saved rule sets — that model
worked and informs this one.

Two entry points:

1. **The rules list itself.** Authoring a rule is a standing act: once saved, it
   persists quietly until the agency changes or removes it. Donor fields autocomplete
   from donors FEED has actually seen, so a rule keys on the identifier the source
   reported rather than one typed from memory.

2. **The per-import Actions menu.** An import becomes something a user can *reshape
   retroactively*, not only roll back. The same flag options are available after the
   fact, seeded with that import's source and date window, so a classification learned
   later can be applied to data already in.

Rules are evaluated at **read time** against every enabled rule, and nothing binds a
rule to a particular import. A New Seasons rule saved today therefore governs next
month's import, last year's import, and the legacy history alike — with no
re-application step, because there is nothing to re-apply.

**Deliberately not built: a post-import prompt offering rules.** An earlier draft of
this doc described the import flow "inspecting" an upload and offering relevant
handling. That is redundant where a rule already exists (it is already in force) and
improper where one does not — FEED suggesting that a donor "looks like" it needs
excluding would be FEED forming an opinion about the agency's operation, which this
design forbids. Rules are authored by the agency, on its own initiative. Crucially, the placement makes the nature of these rules explicit: they
are **contextual and relational — an agency's operational truth — never general
system logic.** FEED ships no opinionated exclusions; only the agency knows New
Seasons is a courier run.

---

## Legacy community integration

Taking the decision (D16, revising D9): the legacy data is a **subset within
procurement**, not a separate domain.

- **Its own source namespace, `legacy_community`** (the [D3](procurement-unification-plan.md)
  permanently-separate-source pattern). It combines on shared views but never
  masquerades as OFB.
- **Scope: community *food* donations only.** The workbooks mix six domains; we keep
  only community food donations. Dropped: OFB-supply rows (already authoritative in
  FEED — would double-count), hygiene/supply, client-service counts, volunteer hours,
  and derived averages.
- **Clean seam at the cutoff.** Legacy stops May 2023; OFB Fresh Alliance starts
  2023-06-01. They abut with no overlap and no double-count. On a time chart this
  reads as one continuous seven-plus-year story with an honest source-change seam at
  the boundary.
- **Granularity is tagged, not hidden** (`estimated`, monthly grain — D17). Each
  monthly figure is one aggregate event with weight/source/month and *nothing more*.
  The tag governs where the data appears:
  - **Shown** — "Inbound Weight Over Time" (its own line, color, legend entry);
    "Inbound Supply Summary" (counted, with a granularity disclaimer).
  - **Absent** — "Category Mix" and any product- or line-level view, because we have
    no categories and **absence is honest where zero-fill would lie.**

### The two private curated artifacts

The legacy import ingests two human-curated files, not raw spreadsheets:

1. **The canonical ledger** — `year · month · source_canonical · weight_pounds`
   (+ `disposition`, `source_as_written`, provenance). 596 gap-era observations,
   ~1.03M lb, Oct 2016 – May 2023.
2. **The canonical map** — `source_as_written → source_canonical, in_ofb,
   disposition, notes`. 37 written label variants reconciled to 25 canonical donors,
   authored with the director's institutional knowledge (D18).

Both are **authored operational data, privately retained and reviewed — never
committed to the FEED codebase and never inferred by code** (consistent with
[D4](procurement-unification-plan.md): identity is received/curated, never
system-inferred). Authorized local verification reads them from the external
`FEED_PRIVATE_DATA_DIR`; the application receives them through the admin import
sidecar. The mapping was validated against the live OFB record over the Jun–Sep
2023 overlap window: more than half the monthly cells matched canonical OFB to the
pound, which is why the pre-2023 gap data — which cannot be checked directly —
inherits meaningful confidence.

### A permanent single-agency sidecar

The legacy path remains a WTH-only adapter that ingests the two curated
artifacts, teaches the system nothing general, and — under future white-label
support — is **hidden, because it applies only to WTH.** FEED's analytics
foundation remains the OFB Primarius exports; this is an annex, not a second
foundation (D22).

Its original dedicated **Import Legacy** button is transitional. D23 moves the
eventual entry point into the global classifier-driven **Add Data** workflow
without changing the legacy source's identity, scope, or calculations. The
dedicated button stays operational until the new branch reaches parity.

---

## Worked example: New Seasons, end to end

1. Director's knowledge: New Seasons - Slabtown is couriered onward, never
   distributed by WTH.
2. A donor-level `pass_through` rule is saved once in Data Management.
3. It auto-applies to **both** the legacy `legacy_community` rows and the live
   `ofb_pickup` rows — same donor identity, same flag.
4. "Total donations received" counts it (it is a real event). "Retained inventory"
   excludes it (WTH did not supply it). The excluded figure is disclosed where it
   acts.
5. Supply-side views stop overstating what the pantry distributed — as a configured
   operational truth the agency authored, not a code special-case FEED shipped.

---

## Non-goals & guardrails

- **No fabricated resolution.** The legacy import never invents delivery days,
  product codes, or line items it does not have. Monthly-grain stays monthly-grain.
- **No silent exclusion.** Every excluded total names what it excluded and how much
  (D15 generalized). Silent exclusion is as dishonest as silent inflation.
- **No general legacy-format ingestion.** FEED does not learn to parse bespoke
  spreadsheets. It ingests two curated artifacts, once.
- **Flags never mutate events.** Overlays only. Every classification is reversible.
- **The canonical map is authored, not inferred, and remains private.** No code
  guesses that "Amazon - OUR2" is NW Industrial; a human recorded it outside the
  repository.

---

## Open questions (for Stage 2)

- **Data model shape** — how flags/rules are persisted (per-event tags vs. rule
  records evaluated at read time vs. materialized at import). Deferred to
  implementation; the contract above constrains it but does not fix a schema.
- **Per-view rendering** — exactly how each Analytics view surfaces an active
  exclusion's disclosure, and whether `at_risk` earns a dedicated risk view or rides
  existing cards.
- **Director confirmations** — Amazon has only ever been NW Industrial (treated as
  settled; loop-closing only). No open mapping blocks the design.

---

## Staged plan

**Stage 1 — Documentation (this doc + D16–D23).** Record what we will build and why.
Complete.

**Stage 2 — Implementation**, complete in independently shippable phases:

- **2a — Flag/rule foundation.** Persistence model for events + non-destructive
  flags; the Data Management rules UI (two entry points); saved standing rules.
- **2b — Analytics honors flags.** Views declare honored flags; exclusions disclosed
  where they act; `procurement ≠ supply` made real for the **live** data (the New
  Seasons correction ships here — value independent of any legacy work).
- **2c — Legacy artifacts + import.** Keep the canonical ledger and map in private
  operational storage outside the repository; build the `legacy_community` source
  and its import adapter; wire the estimated-grain inclusion/absence rules and the
  time-chart seam. The original dedicated button remains as transitional UI under
  D23.
- **2d — Verification.** Tests for flag honoring and disclosure; the overlap
  validation as a regression check; live confirmation against the real corpus.

---

## Community-history presentation (Model A)

Landed 2026-07-23. The legacy stream is presented on its **own** cards, split by
source system rather than by partner identity (Model A): OFB partner cards stay
strictly OFB (2023+, per-pickup), and all pre-Primarius history — including the
five grocery partners' early years — lives on dedicated community cards at
monthly grain. A partner's full timeline is tied together only by the org-level
Inbound Weight Over Time chart's three source lines.

- **Community Donation History** (bar) and **Community Contribution Over Time**
  (line) show received weight by canonical source. One partition, used by both:
  the top 12 by weight are named; the rest fold into **"Other Community
  sources"** (named distinctly from the verbatim `Other Donors` source). The
  bucket is never opaque — its constituents are itemized in the bar's tooltip
  and, per month, in the line's tooltip, and every folded source stays
  individually selectable in the source filter.
- These cards count donations as an **activity**: received weight, honoring no
  exclusion flags. New Seasons' relayed pounds appear here even though the
  `pass_through` rule removes them from retained supply elsewhere. A note on both
  cards states this, so the two totals are not read as a contradiction (D21).
- **Partner Pickup History stays OFB-only** — pickup cadence and per-visit load
  exist only at the OFB per-pickup grain, so its window begins where OFB's record
  does, and the card says so. The per-product "Median Gap" column was removed as
  unintuitive and not actionable.
- Community cards render only under the "All Channels" view; the page channel
  filter (OFB Warehouse / Fresh Food Alliance) scopes them out by design, since
  `community_donation` is its own channel.

## Fresh Alliance legacy integration (2026-07-24)

The five legacy sources that are also live Fresh Alliance partners (Amazon,
Trader Joe's, Fred Meyer, New Seasons, Safeway - Portland SW Jefferson) have their
pre-Primarius history woven into the Fresh Alliance views rather than left only on
the community cards. A legacy source is classified a partner when its curated
canonical name matches a live `ofb_pickup` donor — no schema change, self-
maintaining. (Safeway was director-resolved to Portland SW Jefferson so its name
matches; the ledger was regenerated and re-imported.)

- **Procurement Channels:** the Fresh Alliance bar is a stack — Primarius (2023+)
  plus the matched partners' legacy history — so it reflects the whole
  relationship. The "Donations (Legacy Data)" bar shows only non-partner legacy,
  so nothing is double-counted (partner legacy = 933,689 lb moves to the FFA bar;
  99,646 lb of non-partner legacy remains).
- **Fresh Food Alliance Donations Over Time:** a "Show Legacy Data" toggle extends
  each partner's line back before June 2023 with monthly legacy data. Legacy ends
  May 2023 and Primarius starts June 2023, so the lines abut with no overlap.
- **Community Contribution Over Time:** scopes to non-partner sources (the partners
  are shown richer on the Fresh Alliance card; drawing them here too would double
  the line). The **mix** card stays the full roster — every source that ever
  donated, partner or not.
- Backend contract: `summary.freshAllianceLegacyWeightHundredths` (stack total),
  `communitySources[].isFreshAlliancePartner` (community-card scoping), and
  `freshAllianceLegacyMonthlyWeight` keyed by live donor code (the toggle).

## Related documents

- [procurement-unification-plan.md](procurement-unification-plan.md) — decision log
  (D16–D23 record the binding choices here; D9 revised)
- [procurement-imports.md](procurement-imports.md) — the import contract this extends
- [fresh-alliance-coverage-verification.md](fresh-alliance-coverage-verification.md)
  — the overlap/parity evidence the mapping validation builds on
