# Analytics Report Architecture

## Status

Built 2026-08-06/07 for 1.5.0-beta.9. Twenty-three cards, two lenses, generating a
ZIP of PDF + per-card CSV + manifest. Templates save from Analytics and re-run
from Reports Management against a date range chosen at run time.

Extended 2026-08-16 for 1.5.0-beta.19: thirty-one cards across three lenses,
Service being the third.

## What a report is

**An export of what Analytics is already showing.** Not a second analytical
engine.

That sentence is the whole architecture. Every card in a report is a card on the
Analytics page, rendering the same numbers under the same filters. A report
therefore makes no claim the screen does not, which is what makes it safe to
build on: the claims were reviewed once, on the screen, and the report inherits
them.

The previous attempt was the opposite. `routes/reports.ts` had its own 31-card
registry computing its own answers, which is exactly how it drifted into the
price, burn, projected-stockout, replenishment, and quantity-coverage claims
that RITE rejected (ISSUES #46). That code still exists, unmounted. This is
mounted at `/api/analytics-reports` specifically so it cannot inherit any of it.

## The card contract

One accessor, two outputs.

```
card.data(payload, options) ──┬──► card.print(data)   → SVG / HTML
                              └──► cardCsv(data)      → CSV
```

`data()` returns display-ready categories and series: already labelled, already
in display units, already condensed if the range is too long to print. The chart
and the CSV both consume *that*, so their numbers cannot disagree. Only the
drawing differs — which is the point, because a print chart should be designed
for paper rather than imitating a screen.

### Why this exists

The first spike skipped it and re-derived rows inside each renderer. It drifted
on its very first output, in two ways:

- printed the raw enum `PURCH-DON` where the screen shows `Purch-Don`;
- omitted the legacy partner history the screen stacks onto Fresh Alliance,
  **understating that channel by 933,689 lb of 1,513,436 — 62%**.

Neither was visible without comparing outputs side by side. Both looked
completely plausible. That is the failure mode this contract is built against.

### Card shape

| Field | Meaning |
| --- | --- |
| `id` | Stable. Selection, templates, and options are all keyed by it. |
| `lens` | `operations`, `procurement`, or `service` — decides which payload it is handed. |
| `kind` | `chart`, `kpi`, or `table`. Declared, not inferred. |
| `data(payload, options?)` | The single accessor. |
| `print(data)` | Markup for the page. |

## Approach A: server-authored charts

Three approaches were built and compared against the same data before choosing
(see the commit history for the spikes):

| | Size | Rasters | Needs a browser | Deterministic |
| --- | --- | --- | --- | --- |
| **A — server-authored SVG** | 586 KB / 7pp | 0 | no | **yes** |
| B — serialized from the DOM | 145 KB / 4pp | 0 | yes | no |
| C — Chromium prints the page | 5.8 MB / 11pp | **139** | yes | no |

C prints an *application*: 139 raster images of icons, sidebar, and chrome. B
loses legends — Recharts renders them as HTML outside the `<svg>` — and needs
computed styles inlined, 1,053 attributes for one chart.

A won on the property that matters most: **no browser is required to draw a
chart**, so a saved template can regenerate on a schedule, and the same inputs
always produce the same bytes. It also costs the least per card: roughly 4–9
lines of adapter against shared primitives.

The tradeoff, stated plainly: **the PDF does not look pixel-identical to the
screen.** It shows the same numbers in a chart drawn for print. That was an
explicit decision, not an oversight.

### Primitives

Charts are drawn with no CSS at all — colours and type are attributes on the
elements — so output is identical wherever it renders. `analytics-cards.test.ts`
asserts no `var(--` and no `class=` appears in any card's output.

| Primitive | For |
| --- | --- |
| `hBarSvg` | A labelled breakdown; optional per-row stacked segments. |
| `stackedBarSvg` | One timeline split by source. |
| `stackedHBarSvg` | Parts of one whole, per row. |
| `groupedHBarSvg` | **Independent** measures per row; optional scale and end values. |
| `lineChartSvg` | Comparisons; optional fill and collision-aware latest values. |
| `kpiGrid` | Text tiles, as HTML. |
| `tableHtml` | A table, as HTML. |

### Labels and units

Two things the primitives got wrong until beta.9, both invisible in a test that
only asserts an SVG came back.

**The label column is a fixed width and nothing enforced it.** Long product
names were drawn from `x=0` with no truncation, straight through the bars that
begin at the column's right edge. Labels are now measured against real Helvetica
advance widths and cut with an ellipsis. Real metrics, not an average character
width: `MMMMM` and `iiiii` are the same length and nowhere near the same width,
so an average cuts one far too early and lets the other overrun. Arial was drawn
to Helvetica's widths, so one table serves the whole font stack. The CSV carries
every name in full — the abbreviation only ever exists in the picture.

**The unit was hard-coded to `lb`.** "Where Paid Procurement Dollars Went"
printed `43,245 lb` for $43,245 of spend, and Availability Summary printed
`58 lb` for a count of items. `hBarSvg` takes a `BarValueFormat` now
(`POUNDS`, `COUNT`, `DOLLARS`), because only the card knows what it measures.
Both defects survived every existing test and were found by rendering a PDF and
reading it — worth remembering when adding a primitive.

**Stacked versus grouped is a correctness decision, not a style one.** Seasonal
Inbound Weight compares calendar years — stacking would sum unrelated years into
a total nobody asked for, so it draws lines. Category Pressure carries four
independent signals where Beans reads 98% / 0% / 100% / 0%; stacked, that is a
198%-long bar meaning nothing. FFA Category Mix *is* parts of a whole, so it
stacks. What the bars **are** decides the primitive.

**Absence is not zero.** A `Series` may carry a `defined` mask beside its
numeric values. Seasonal comparison uses it to stop the opening and closing
years at the requested boundary months, and Category Pressure uses it when a
percentage could not be computed. Print and CSV helpers preserve the
difference: an in-range numeric zero is drawn and exported as zero; an
out-of-range or unknown point is omitted and its CSV cell is blank.

Static paper must replace the information a screen supplies on hover. The
affected Operations adapters opt into restrained annotations on the existing
primitives: integer ticks and bar-end counts for Recurring Availability, a
fixed 0–100% axis and percent labels for Category Pressure, and only the latest
value of each Operational Pressure line, collision-adjusted. Other cards keep
the existing primitive defaults.

## Filters and card options

Two layers, and both must survive into the report.

**Page filters** — range, channel, acquisition class — are read off the payload
the API returned, so the screen and the report cannot disagree about what was
asked for. A card's title and series set may depend on them: Inbound Weight Over
Time is called "Warehouse Weight by Acquisition Class" under one filter and
shows an entirely different series set under another.

**Card-level controls** — a search box, a donor filter, a year selection, a
table's sort — live in React and are not in the payload. They travel as
`cardOptions`, keyed by card id.

They are **frozen when that visible card is selected**, not read at generate
time. The modal offers no filter controls, so a run must mean what the card
showed when the user chose it. Selection-time capture also matters across
lenses: inactive Radix tab content is unmounted, so a start-time snapshot could
contain a stale value from an earlier visit or no value at all.

Options are published during *render*, not in an effect, so clicking a visible
card cannot race an effect and capture its previous controls. Automatic
seasonal years are stored as `yearMode: 'all-available'` and derived from the
new run-time payload; only `yearMode: 'selected'` persists a concrete subset.

## Readability-driven grain

A bar needs about **1.6 mm** on paper to read as a bar, which allows ~103
categories across the usable 244 mm. Past that, a time series is coarsened
month → quarter → year until it fits, and the card says so:

> Condensed to quarters: 201 months would print at under 1.6mm per bar. Narrow
> the date range to see months.

The threshold is in millimetres, not pixels, because the output is vector — user
units map to a fixed printed width, so millimetres are the units the rule is
about and the only ones checkable against a printed page.

**Condensing happens in `data()`, before both outputs.** Had it run in the
renderer, the chart would show quarters while the CSV still held months, and two
files in one archive would disagree. The CSV offers both grains as a user
choice; `condensed` is the default so an unqualified export never contradicts
the picture beside it.

## Tables

Every control a user set travels: filter, sort, visible columns, page size. The
state lives inside `EnhancedDataTable`, so it publishes it via
`onViewStateChange` — there is no other route to it.

It is **re-derived server-side rather than sent as resolved rows**, because a
saved template regenerates months later with no client to resolve anything.
Applied in the order the table applies it: filter, then sort, then page.

Sorting uses the underlying value, never the formatted text. `"$9"` sorts after
`"$10"` as a string, and every currency column would be silently wrong.

Printed as HTML, not SVG: a table is text in a grid and Chromium already lays
that out with real typography and page breaks. The header repeats on every page
and rows never split across a boundary — the two things that make a long table
usable on paper, and that screenshotting a web table never gives you. A
hundred-row export is a legitimate request and is tested as one.

`SelectableBlock` keeps the same wrapper/content DOM shape before, during and
after selection. Inserting a wrapper only during selection remounted
`EnhancedDataTable` and reset its internal sort/page state. The content node's
`inert` property is assigned both ways, with cleanup, so sortable controls are
interactive immediately after Cancel or a completed report.

## Cross-lens loading

The three lenses come from different services with different range semantics —
Operations resolves its range against the pantry's operating-hours timezone and
applied schedule revisions, which Procurement knows nothing about; Service spans
two intake records and the Service Log, and picks its own bucket grain from the
requested span. The route inspects the selection, loads only the lenses it
needs, and hands each card the payload for its own lens. A card whose lens was
not loaded is reported like a stale id rather than producing a plausible-looking
empty chart.

### Provenance across lenses

The printed header and the manifest need a range and a `dataAsOf`. Procurement
and Operations both carry `range` and `dataAsOf` directly; Service reports
`coverage` instead, so provenance is normalized in one place
(`provenanceOf` in `analytics-report.ts`) rather than read off whichever payload
happened to be present. Before that, the header read
`payloads.procurement ?? payloads.operations`, which is `undefined` for a
Service-only selection — the PDF path threw before rendering anything.

For Service, `dataAsOf` is the latest date any source record actually reaches,
not the end of the range asked for: a report run today must not claim data
through today.

### Screen and report cannot disagree

One accessor feeding screen, PDF, and CSV is worth nothing if the two apply
different rules, so the Service cards inherit the screen's guards rather than
re-deriving them:

- **Absence is not zero.** A series carries `defined: false` where its record
  does not reach, so a line begins where its record begins instead of running
  along the axis for the years before it existed. In CSV that is an empty cell,
  not a `0`.
- **The unfinished month is dropped and named**, in the same words the page
  uses. A partial month plotted beside complete ones reads as a collapse.
- **Bucket grain is chosen by the service**, not condensed again in the card;
  re-condensing would put the report on a different axis than the page.

## What the archive contains

```
01-<card>.csv          numbered in selection order
02-<card>.csv
<title>.pdf
manifest.json          range, filters, cardOptions, grain, per-card notes,
                       generatedAt, dataAsOf, unknown card ids
```

Selection order is report order. The manifest exists because a CSV separated
from its range and filters is exactly the misread the whole contract is built to
prevent.

## Templates

A template stores the **shape** — which cards, in which order, under which
filters and card options — and deliberately **not the date range**.

"Last 90 days" saved in March either freezes a stale window or quietly means
something different in April. The range is chosen when the template is run.
Saved with `source: 'analytics'` so these never collide with the dormant
workspace's templates, which describe cards this route cannot render.

### Running one

Reports Management lists them and runs them. The dialog asks for one thing —
the period — because the template supplies everything else, and it asks with
**the same `AnalyticsRangeControl` the Analytics page uses**. Two pickers with
two notions of "last 90 days" is the obvious way for a template's second run to
stop meaning what its first one did.

The period is not carried between runs: each open resets to the default range.
A stale range inherited from the previous template is precisely the mistake the
"a template has no date range" rule exists to prevent.

`templateData` is JSON written by whatever client saved it, so it is narrowed
once in `template-spec.ts` (`parseTemplateSpec`) and every consumer works from
the result. Absent output flags default to *on*, matching the server's zod
defaults — the two must not disagree about what an old payload meant.

### Managing and deleting templates

Reports Management follows the same selection pattern as the Food Items,
Categories, and Translations tables: row checkboxes, current-page select-all,
the shared selected count and Clear control, and bulk actions in the standard
Actions menu. **Delete Selected** is intentionally the first bulk action; a
bulk run has no honest meaning until the product defines how different ranges,
filters, outputs, and card options should be packaged.

Single-row and bulk deletion converge on the same confirmation. The API accepts
the selected ids as one operation, verifies every id inside a transaction with
`source: 'analytics'`, then deletes the selection as a unit. A missing,
wrong-source, or concurrently removed template aborts the whole operation.
Source scoping matters because Analytics and the dormant report workspace share
the `ReportTemplate` table but do not share a card contract.

### Cards that no longer exist

A card can be removed from the registry after a template names it. That is
resolved **before** generation: the card list is fetched once by Reports
Management, `cardAvailability()` partitions each template's ids against it, and
the result drives three things — an "N unavailable" badge in the table, a
warning in the run dialog, and a disabled Run action when nothing survives.
Only the surviving ids are sent, so the request matches what the dialog said it
would produce.

The server still reports unknown ids in `X-Unknown-Card-Ids` and in the
manifest. That is now a backstop rather than the notification: telling someone
their report is short a card *after* they have downloaded it is not telling them.

`cardAvailability()` distinguishes an **unread** registry (null) from an
**empty** one. They are different facts, and conflating them would tell the user
every card in every template had been deleted because one request failed. An
unread registry reports nothing missing and lets the server decide.

## Drift guards

The two packages share no module, so anything duplicated across them is checked
by reading both sides from source. This is the same technique the audit-action
labels use, for the same reason: every previous drift in this project came from
unchecked duplication.

| Test | Guards |
| --- | --- |
| `analytics-card-parity.test.ts` | Display labels and unit conversion. |
| `table-column-parity.test.ts` | Column **ids** and headers. Ids matter most — sorting travels by id, so a renamed `accessorKey` silently reorders the exported table while everything still renders. |
| `analytics-cards.test.ts` | Chart and CSV read the same rows; no `var()`; empty payloads do not throw. |
| `analytics-card-coverage.test.ts` | **Every card on a lens is exportable, and every registered card still has a home.** Reads the lens components as source and fails on a `<CardTitle>` outside a `SelectableBlock`, on a `cardId` that names nothing in the registry, and on a registered card no longer selected anywhere. |
| `analytics-print.test.ts` | Label fitting and bar units. |

Each guard was verified by breaking it deliberately and watching it fail.

The coverage guard reads source rather than rendering, deliberately: half these
cards appear only under a particular channel filter or when legacy data exists,
so a render-based check would cover whichever subset the fixture happened to
produce. It carries a short `NOT_EXPORTABLE` allowlist — currently one empty
state — which is the escape hatch that keeps it honest rather than the place
unregistered cards go to hide.

It exists because eight cards shipped that a user could see and could not
export, and the only way to notice was to enter selection mode and count what
wiggled.

### Known gap

**Formatters are not covered.** The guards compare ids, headers, and labels —
not behaviour. A real instance: `dateTimeLabel` used a single `toLocaleString`
call, producing `5/7/2026, 9:30 AM` with a comma the screen never shows. The
shared formatter composes date and time with a space. It reached a rendered CSV
before being caught by eye. Closing this means comparing behaviour rather than
source text, which is a different mechanism than the one built here.

## What is not built

- **Editing a template** — a template is replaced by saving from Analytics
  under the same name. Cards and filters cannot be changed from Reports
  Management, only run or deleted.
- **Formatter parity** — the gap above.
- **Operations card options** — no Operations card yet has card-level controls
  that need freezing; the mechanism is there when one does.
