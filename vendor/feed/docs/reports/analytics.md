# Inventory Analytics & Reports

> **Prototype history — superseded.** This document describes the July 2026
> planning-analytics prototype and is retained only as implementation history.
> Its burn, price, coverage, stockout-projection, and replenishment claims are
> not part of the current product. See [Operational Analytics, Supply
> Annotations, and Data Export](operational-analytics-design.md).

Phase 2 of the Reports initiative: the shared analytics service, the
`/reports` workspace with a live Inventory Outlook tab, and per-card CSV
export. Builds on the Phase 1 ledger (`docs/reports/logistics.md`).

## Shared analytics service

`packages/backend/src/services/inventory-analytics/`

- `calculations.ts` — pure formulas. Unknown / insufficient-history results
  are first-class `null`s, never zeros. Unlike-item quantities are never
  aggregated; only counts, percentages, days, item-days, and dollars.
  - Burn intervals: consecutive **known** quantity observations where the
    quantity decreases. An Unknown observation breaks adjacency. Positive
    or flat changes are replenishment/correction boundaries (never
    negative burn).
  - Daily burn = total decreases ÷ elapsed days across decrease intervals
    (fixture: 1,000 → 0 over 14 days ≈ 500 units/week).
  - Weekly burn = daily × 7. Days of cover = current quantity ÷ daily burn.
  - Required units = `max(0, ceil(dailyBurn × horizon − currentQuantity))`;
    purchases needed = `ceil(required ÷ unitsPerPurchase)` (whole
    packages); projected paid cost = purchases × purchase price. Donated
    supply costs numeric 0; unknown-cost supply stays null.
- `timezone.ts` — validated IANA timezones via the Intl API (no tz
  dependency). Inclusive local dates → `[local start, day-after-end)` UTC
  with DST-safe midnight resolution. Presets: Last 30/90 Days (default
  90), Last 6/12 Months, YTD, Custom. Planning horizons: 14/30/60/90
  (default 30).
- `index.ts` — `computeInventoryOutlook`: loads quantity-recording ledger
  events (each item's latest pre-range **anchor** event is included),
  computes per-item outlook, KPI counts/medians, days-of-cover bands, and
  the weekly projected-stockout timeline. Live items drive the outlook;
  current quantity comes from the `FoodItem` row.

⚠️ SQLite DateTime convention: the Prisma client stores `DateTime` as
millisecond-epoch INTEGERs. Raw SQL that inserts ledger rows (e.g. the
migration baseline backfill) must write ms epochs — a `CURRENT_TIMESTAMP`
TEXT value sorts/filters incorrectly against client-written rows and
becomes invisible to date-filtered queries.

## Card registry and API

- `services/reports/card-registry.ts` — one stable id per selectable
  block, shared by frontend, templates, PDF, CSV, and validation. Current
  ids: `inventory-outlook-kpi`, `inventory-outlook-cover-bands`,
  `inventory-outlook-stockout-timeline`, `inventory-outlook-item-table`.
  Max selection: 8. Selections are source-bound (`reports` vs
  `dashboard`); never rename an id.
- `services/reports/csv.ts` — UTF-8 BOM, RFC 4180 quoting, CRLF,
  rectangular schemas, raw numerics, ISO timestamps, blanks for Unknown,
  formula-injection protection, headers-only file for empty data.
- `routes/reports.ts` (authenticated, Zod-validated):
  - `POST /api/reports/query` — interactive tab data.
  - `POST /api/reports/cards/:cardId/csv` — quick per-card CSV (RFC 6266
    filename).
  - Phase 3 adds `/export` (ZIP with PDF + CSVs) and `/templates` CRUD.

## Frontend

- `/reports` route; sidebar “Reports” under Inventory (animated
  `FileChartColumn`, hand-authored native + imperative-ref variants —
  registry installs carry the documented `viewBox`/path bugs).
- `components/reports/index.tsx` — range preset + Shadcn Calendar range
  picker + horizon controls; five tabs (four disabled until Phase 3);
  Inventory Outlook tab renders the KPI block, two Recharts charts using
  the centralized `lib/colors.ts` palette (`theme: {light, dark}` config —
  not `--chart-N` vars, which this app does not define), and an
  EnhancedDataTable; each block has a quick “Export CSV”.
- `services/reports/index.ts` + `BaseApiService.requestBinary` — shared
  authenticated binary path (401 redirect, structured ApiError, RFC 6266
  filename parsing, object-URL cleanup).
- Types mirror the backend in `types/reports/index.ts`.

## Tests

`packages/backend/__tests__/features/reports/inventory-analytics.test.ts`:
burn fixtures (incl. both spec formulas), unknown-adjacency, timezone/DST,
preset resolution, CSV rules, registry validation.

## Phase 3 (full workspace) — landed

- **All five tabs live** (`components/reports/*-tab.tsx`), each with a
  KPI block, two charts, and a detail table; per-tab `POST
  /api/reports/query` with a `tab` field; 20 registered cards.
  Tab builders: `outlook.ts`, `unit-prices.ts`, `scarcity.ts`,
  `replenishment.ts`, `coverage.ts` over one shared context (`data.ts`),
  which includes deleted items' history bounded by their `deleted` event.
- **Selection mode** (`components/reports/selection.tsx`): cross-tab
  ordered selection (cap 8, client+server), wiggle for eligible cards
  (static under `prefers-reduced-motion`), ring/check/order badges,
  Enter/Space toggling, nested controls made inert during selection.
  Keyframes live in `index.css` (`report-card-wiggle`) and use the agreed
  ZEV-derived pacing: 820–1,120 ms loops with 60 ms hash-based staggering.
- **Generate dialog** (`generate-report-dialog.tsx`): ordered list with
  Move Up/Down/Remove, 3–48-char title, PDF/CSV toggles (≥1 required),
  optional Save/Update Shared Template, and validated Top 5/Top 10 options
  for ranking cards.
- **Export** (`POST /api/reports/export`): one `dataAsOf` snapshot, every
  selected block computed once, ZIP (JSZip 3.10.1, direct dependency)
  containing a Letter-landscape PDF, numbered per-card CSVs, and
  `manifest.json` (title, timestamps, resolved range, tz, filters, ids,
  calculation/schema versions). Nothing is persisted server-side.
- **PDF** (`services/reports/pdf.ts`): deterministic light print theme,
  Noto fonts inlined as data URLs, server-authored inline SVG charts with
  direct value labels, two-column blocks + full-width tables with
  repeated headers, Chromium-native Page X of Y footer. The generic
  Chromium lifecycle was extracted to `services/pdf/chromium.ts` and the
  Shopping List Builder now uses it. Request interception permits only
  `about:blank` and inline `data:` resources; external network and local-file
  requests are aborted before render.
- **Shared templates**: `ReportTemplate` model (source-bound, unique
  normalized name per source, versioned JSON config), CRUD under
  `/api/reports/templates` with same-name upsert, stale-card-id
  surfacing, and the `/reports/templates` management page (Apply/Edit,
  Generate, Rename, Duplicate, Delete). Apply restores controls and
  selection on `/reports` via router state.
- **Filters**: item/category text, multiple categories, current stock status,
  and price type are validated server-side and persist in templates and the
  export manifest. Custom range end dates cannot be in the future.
- **Observed-time semantics**: all ledger reads stop at the export/query
  `dataAsOf`. Scarcity clips open status segments to that instant. Migration
  baselines and deletion snapshots establish state/lifetime boundaries but do
  not count as recording activity.

## Dashboard rollout — landed

Four shared-analytics cards are live: Projected Stockouts, Quantity Coverage,
Median Days of Cover, and Known 30-Day Replenishment Cost. Dashboard uses the
same ordered selection provider and eight-card cap. The four overview KPIs,
Inventory Status Distribution, Category Distribution, Translation Success,
and the four logistics cards are selectable and have server-authored PDF/CSV
serializers. Dashboard templates are source-bound and apply back to `/`.

Response Times, Multi-Service AI Usage, Cost Analysis, Usage Summary, and
Translation Performance remain normal Dashboard cards but non-selectable
until their separate metric-correction milestone.
