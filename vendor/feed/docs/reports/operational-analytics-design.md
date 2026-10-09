# Operational Analytics, Supply Annotations, and Data Export

**Status:** Milestones 1–4 implemented as a RITE-tested vertical slice. Visual
PDF/ZIP packages and shared report templates remain dormant pending a validated
operational-report consumer.

This document is the source of truth for FEED's post-prototype analytics
direction. It supersedes the product semantics in `docs/reports/logistics.md`
and `docs/reports/analytics.md` wherever they conflict. Those files document
the July 2026 logistics/reporting prototype and remain useful implementation
history until the reframe is complete.

## Product principle

FEED should extract insight from work staff already perform. It must not turn
analytics into a parallel inventory-counting job.

Operational decisions and imported source records are the primary evidence:

1. **Service-catalog decisions** — available, unavailable, Limited Supply,
   Clearance, and request limits.
2. **External source records** — future OFB orders, donation weights, and other
   structurally imported datasets.
3. **Optional measurements** — a staff-entered estimated quantity when keeping
   that approximation is useful for a particular item.

FEED may ask for data during a workflow only when it is necessary to complete
the user's immediate task. Optional enrichment must not obstruct that task.
When evidence is incomplete, FEED reduces the specificity of its conclusion
instead of transferring the analytical burden to staff.

## Observable meanings

Analytics describes recorded operational states without assigning an unobserved
cause:

| Recorded state | Safe analytical meaning |
|---|---|
| In Stock | Available to clients |
| Out of Stock | Unavailable to clients |
| Limited Supply | Staff perceived operational supply pressure |
| Clearance | Staff prioritized accelerated distribution |
| Item/category limit | Recorded rationing policy |
| No Limit | No explicit item/category rationing policy |

"No Limit" does not prove demand was met. Out of Stock does not prove the
physical quantity reached zero. Clearance does not prove waste or imminent
expiration. Shopping-list generation does not prove client demand,
distribution, or consumption.

The org-wide Global Limit is a printable-list safety fallback. It is not an
item/category rationing decision and is excluded from service-pressure
analytics.

## Food Item Supply tab

The fourth Add/Edit Food Item tab is **Supply**, not Logistics. Both fields are
optional:

- `estimatedQuantity Int?` — blank is Unknown; otherwise a nonnegative whole
  number. The unit is intentionally unspecified.
- `supplySource String?` — `null` is Unknown; accepted values are `donated`,
  `purchased`, and `mixed_other` (displayed as Mixed/Other).

New and migrated items default both fields to Unknown. Existing prototype
quantity, price, and package values are development-only test data and are not
preserved.

There is no price, unit/package divisor, derived unit cost, unit-of-measure
question, completion warning, or coupling between Supply fields and stock
status. Marking an item Out of Stock is a one-action availability transition
and never changes quantity.

Estimated quantity may be displayed for that item and included in raw history.
FEED does not sum unlike quantities, compare quantity magnitudes between
items, convert them to weight, infer consumption, calculate burn rate or days
of cover, or project depletion.

## Append-only operational history

Atomic history remains the foundation. Effective changes write the current row
and its event in one transaction. No-op saves create no event. Lifecycle
baselines identify the start of tracked history; no earlier state is invented.

### Food Item events

Each snapshot retains identity plus:

- availability (`isInStock`);
- Limited Supply and Clearance flags;
- item limit, limit type, and whether the item limit is operationally active;
- optional estimated quantity and supply source;
- event kind, dimension flags, and server timestamp.

Limit changes become first-class observations. Supply annotation changes are
retained but do not alter availability.

### Category events

Category creation, effective updates, and deletion write append-only snapshots
of category identity, limit, limit type, icon, and lifecycle state. This is
required because a category limit is independent of its Food Items and appears
as a section-level shopping-list rule.

Food Item limits, Category limits, and the Global Limit remain separate. The
persisted `100` No Limit sentinel must be interpreted consistently, but the raw
value is retained for compatibility.

## Correction-window sampling

Atomic history and analytical sampling solve different problems. The ledger
preserves what happened; analytics should not treat a rapid correction as a
real operational episode.

The initial correction window is **five minutes** and is applied at query time,
never during writes:

1. Partition events by entity and tracked analytical dimension.
2. Baseline, creation, and deletion events are hard boundaries and are never
   discarded.
3. Consecutive effective updates within five minutes form one correction
   session.
4. The session contributes its final state at the final event timestamp.
5. If that final state equals the state before the session, the session
   contributes no analytical transition.
6. Events separated by more than five minutes remain distinct observations.

This rule prevents an accidental Out of Stock → In Stock reversal performed a
minute later from becoming a stockout episode. It does not mutate the ledger or
hide evidence from raw export.

Every report/export using sampled observations records the correction-window
duration and calculation version. Raw operational-history CSV exports contain
all atomic events and identify which events contributed to sampled analysis.
The window is a centralized versioned constant and must be tuned from real use,
not duplicated in individual reports.

## Shared analytics date filters

Operations, Procurement, and the planned Service lens use one date-range
control and retain the selected range when staff switch between those
analytical lenses. The quick presets are 7 days, 30 days, 90 days (default),
year to date, and all tracked history. Custom ranges contain inclusive local
start and end dates; time-of-day inputs are deliberately excluded because
procurement and planned service summaries are date-granular and operational
events are already intersected with effective-dated service hours.

Preset dates resolve on the server in the organization timezone:

- 7/30/90 days include today and the preceding 6/29/89 local dates;
- year to date begins January 1;
- All begins with the earliest tracked ledger observation for Operations and
  the earliest active delivery for Procurement;
- Custom rejects invalid, reversed, incomplete, or future-ending ranges.

The active tab and filters are reproducible URL state: `tab`, `range`, `from`,
`to`, `channel`, and `acquisition`. `tab=service` is reserved for the planned
third lens. Procurement channel and acquisition class remain Procurement-only
controls. The Available Assortment Category selector remains card-local and
does not alter other cards or the shared URL range. Every visible card and CSV
must use the same resolved range.

## Planned Service lens

Service will sit to the right of Procurement and report pantry service delivered
to households and individuals. It remains a separate evidence domain: FEED must
not infer that an inbound shipment or inventory transition caused a service
encounter, nor convert visit counts into inventory consumption.

The documentation-only source and architecture plan is in
[Service Analytics Plan](service-analytics-plan.md). Link2Feed and SIMC form the
standard white-label source foundation. William Temple House's supplemental
Google Sheet is an agency-specific sidecar and must not define general product
behavior.

## Evidence hierarchy

Analytics follows the same Actionable, Specific, and Kind standard as FEED's
message system, without turning observations into prescriptive scores. Each tab
progresses from current state, to change over time, to recurrence and duration,
then to contributing records and exports. Staff retain responsibility for
deciding which foods or sources are most important.

FEED does not add an `isStaple` or essential-item classification in this
milestone. Operations reports literal Food Item and Category observations;
Procurement reports source events, weight, channel, acquisition class, exact
supplier products, and recorded cost. Policy classifications should be added
only when a specific decision cannot be supported by the existing evidence.

Procurement therefore begins with inbound summary and monthly change, followed
by paid activity and source/acquisition composition. Seasonal comparisons and
exact-product history tables appear later as supporting explanation.
Paid-product rankings remain exact-code observations and never claim that a
purchase occurred because donated supply was insufficient.

## Initial analytics vertical slice

The first supported analytics domain is **Availability & Service Pressure**.
It uses only operational history and exposes underlying observations rather
than an arbitrary composite score.

Initial blocks:

1. Availability summary — a hybrid Shadcn visualization of current Available,
   Unavailable, and Limited Supply counts beside repeat-unavailability,
   item/category limit counts, and median restoration time.
2. Available assortment over time — service-minute-weighted average count of
   distinct Food Item records available during configured pantry service
   windows, shown as a combined total and as separate Category trend lines. A
   card-local selector can isolate one Category without changing the combined
   range/latest KPIs or filtering unrelated analytics. Category values sum to
   the same combined total; they are not quantities or demand.
3. Recurring availability — a repeat-cycling cohort of items with at least two
   observed Available → Unavailable transitions in the selected range. The
   card shows cohort totals and item-level entry/restoration counts.
   Restoration duration and every matching item remain available in CSV.
4. Operational pressure over time — Limited Supply, Clearance, explicit Food
   Item rationing configurations, and a separate service-hour-weighted count
   of categories with limits. Category rules are never expanded into implied
   Food Item counts.
5. Category pressure — two adjacent, explicitly separate comparisons. Recorded
   Service Pressure shows the percentage of each Category's own observed
   service minutes during which Limited Supply, Clearance, an item limit, or
   the Category limit was active. Recurring Unavailability remains event
   counts for qualifying repeat-cycling items. There is no composite score.
6. Unavailable episodes — item/category, start, end, duration, and restoration
   status.
7. Rationing history — item and category limit changes, including No Limit.

Valid measures include counts, durations, transition frequency, and episode
medians. Deleted entities stop contributing at deletion.

Historical availability and pressure charts intersect recorded state intervals
with the effective-dated organization Operating Hours revision governing each
local date. Closed days and time outside the daily service window do not
contribute. A partial-day transition is weighted by its minutes within service
hours; it is not flattened to one end-of-day state. See
`docs/settings/operating-hours.md` for schedule, timezone, validation, and
revision semantics.

Seasonal views may be displayed descriptively, but FEED must not label a
pattern seasonal until sufficient recurring history exists (normally more than
one annual cycle).

### Assortment and recurring availability decision

The pilot's catalog-wide availability percentage is mathematically valid but
can be operationally ambiguous. A pantry with healthy rotating variety can add
many one-time items, distribute them, and never restock those exact catalog
entries. Those unavailable entries expand the denominator and can make the
percentage trend downward even when clients continue to receive broad choice.
The metric therefore must not be presented as proof of supply pressure, demand
not being met, or declining service quality.

For that reason, **Tracked Availability** and **Availability Over Time** were
retired from the visible pilot and their CSV endpoints. A label change could
not repair the denominator.

The implemented vertical slice separates two observable lenses:

1. **Recorded available assortment** — average count of distinct Food Item
   records available during each service window. Previously depleted catalog
   entries do not reduce the count, so the measure describes recorded breadth
   rather than a percentage of an ever-growing catalog. It remains sensitive
   to catalog naming granularity and must not be called physical quantity.
   The selected-range average is weighted by observed service minutes, and the
   latest-service-window value is kept distinct from the literal current
   Available Now count. Category trends use immutable Category ids, display the
   latest recorded Category name, and zero-fill tracked Categories so temporary
   unavailability does not make a series disappear. Selecting one Category
   isolates that trend and limits the card CSV to the same Category; the
   combined KPI values remain deliberately unchanged.
2. **Recurring availability cycles** — item-level observed unavailable entries,
   restorations, ongoing episodes, and restoration durations. Only an observed
   Available → Unavailable transition counts; migration baselines and items
   initially created unavailable do not. An item enters this lens after its
   second transition in the selected range. The intervening Available state is
   an observed restoration, so one-time rotating items remain outside this
   cohort. Recurrence is evidence of cycling, not proof of demand; Limited
   Supply and limit decisions remain separate corroborating signals in
   Operational Pressure.

The summary's **Repeat Unavailability** value is the number of items meeting
that recurrence definition. The Recurring Availability card also shows repeat
episode count, episodes still open at range end, and median restoration time
for the recurring cohort. It ranks up to eight items for legibility. The
adjacent Category Pressure block assigns each qualifying item and all of its
qualifying episodes to that item's latest recorded Category at `dataAsOf`;
this keeps a recategorized item from appearing in multiple Category bars. The
Recurring Availability CSV contains every matching item and its Category
rollup, while the Category Pressure CSV contains the rows used by both of its
comparisons. The old catalog-wide percentage is no longer exported by the
active operational-report endpoints.

### Category pressure denominator

Category pressure is normalized by the service minutes during which that
Category was recorded as existing, not by Food Item count and not by the whole
organization's calendar range. Each signal is binary within a time segment:
if one or more items in the Category are Limited, that segment contributes to
Limited Supply active time once. The same rule applies independently to
Clearance and item rationing; an explicit Category limit is its own signal.

This supports comparison between differently sized Categories without
claiming that four Limited items are four times as severe as one. It also
avoids penalizing a Category created partway through the selected range.
Percentages are Unknown when no service time was observed. Recurring item and
episode counts appear beside these percentages but never share their scale or
enter a combined score.

## Export contract

The first validated report blocks expose:

- direct CSV for one block;
- server-side canonical calculations shared with the interactive view;
- raw event export where explicitly offered.

Ordered card selection and ZIP packages containing landscape PDF
visualizations, per-card CSV files, and a manifest remain the intended visual
export direction. They are intentionally dormant at this milestone rather
than being re-enabled against the abandoned logistics calculations.

CSV/PDF output must distinguish raw atomic history from sampled analytical
observations. Unknown values remain blank/Unknown rather than zero. Exported
metadata includes the resolved date range, timezone, data-as-of timestamp,
calculation/schema version, and correction-window policy.

## Analytics and Reports information architecture

The live operational exploration surface is **Analytics** at `/analytics`,
under **Inventory** in the sidebar. Analytics is where staff inspect current
and historical availability, service pressure, and rationing observations.

**Reports** at `/reports` is a separate management destination under
**Information**. Its long-term purpose is to organize reusable report
templates that reproduce chosen analytics and exports consistently. During
this milestone it is intentionally a nonfunctional standard-layout
placeholder: page title, description, filterable table shell, column controls,
and pagination only. It does not mount the prototype template manager, report
selection provider, generation dialogs, or export pipeline.

This boundary is semantic, not merely a rename: Analytics is where evidence is
explored; Reports are reproducible artifacts users will define from validated
analytics later.

## Prototype rollback and dormant infrastructure

The July 2026 prototype's report-selection UI, template-management behavior,
logistics Dashboard cards, and price/burn/replenishment content remain removed.
The new `/reports` placeholder must not be mistaken for reactivation of that
prototype. Domain endpoints and card registrations that make abandoned claims
are disabled rather than merely hidden.

The following generic infrastructure is intentionally retained dormant:

- report card registry and source binding;
- cross-card selection provider;
- shared report templates;
- authenticated binary downloads;
- CSV, ZIP, manifest, PDF, and server-authored SVG rendering;
- Chromium lifecycle/network isolation;
- date-range and IANA-timezone helpers.

Dormant code is technical debt, not a permanent entitlement. Audit it at every
analytics milestone and release boundary. Each retained module must either
gain a validated consumer, remain clearly isolated with passing focused tests,
or be pruned. Do not extend dormant domain-specific calculations merely to
avoid deleting prototype work.

## External data roadmap

OFB and donation ingestion are later, source-specific vertical slices. Obtain
representative raw source files before fixing schemas. Initial ingestion must
be computation rather than data entry: upload, validate, normalize, report the
result, and finish without a mapping/configuration queue.

OFB v1 preserves structural columns and provenance, relies primarily on
weight, cost, source classification, and order cadence, and does not perform
semantic package parsing or map supplier records into Food Item quantities.
Strict extraction of an unambiguous leading supplier code is identity parsing,
not package interpretation.

AI-assisted cross-source mapping, donation-source synthesis, and cross-system
SIMC/Link2Feed identity matching are v2. The current SIMC importer follows a
reviewed allowlist, discards names, contact fields, Notes, and full birth dates,
and retains only the privacy-minimized Service facts and profiles defined in
the Service Analytics plan. FEED must never send imported client data to an
external LLM.

## Delivery sequence

1. Prototype rollback and Supply reframe.
2. Food Item and Category operational-history foundation.
3. Availability & Service Pressure vertical slice.
4. Selective Analytics/Dashboard reintroduction with raw and structured CSV
   exports. **Implemented.**
5. Reconnect ordered PDF/ZIP visual exports to validated operational blocks.
6. OFB source ingestion after representative raw-data review.
7. Donation-weight ingestion after receiving a sample workbook.
8. V2 AI-assisted mapping and privacy-bounded service-demand enrichment.
