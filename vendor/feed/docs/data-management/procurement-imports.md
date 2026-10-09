# Procurement Imports

## Purpose

FEED imports external procurement observations as a dataset separate from the
Food Item service catalog and its operational event history. The first source
is the standardized Oregon Food Bank (OFB) CSV exporter.

The staff workflow is intentionally short:

1. Install the **OFB Order CSV Exporter Chrome Extension** from the download in
   **Information → Data Management → Add Data** if it is not already
   active.
2. Open Primarius **Order History**, choose the date range, and use **Export
   unified CSV**.
3. Return to **Add Data** and drop or select the CSV. FEED identifies the OFB
   contract automatically.
4. Review the import result and any calm data-quality warnings.
5. Leave. The uploaded file is no longer retained.

No mapping, row-by-row confirmation, or correction queue is required.

Data Management has no separate OFB or Legacy import buttons. The single Add
Data modal also recognizes WTH's curated historical community-donation ledger,
while preserving that ledger's dedicated importer and monthly grain behind the
shared UX.

## Required Chrome extension

The unified import is not a native Primarius download. It requires OFB Order
CSV Exporter version 2.0.0 or later, which reads Warehouse Completed orders and
Fresh Alliance Pending and Completed pickups for one inclusive date range and
reconciles them before producing one CSV.

FEED serves the approved versioned package at
`/downloads/OFB-Order-CSV-Exporter-v2.0.0.zip`. The archive contains:

- `OFB-Order-CSV-Exporter-v2.0.0/` - the extension folder whose root contains
  `manifest.json`;
- `OFB-Order-CSV-Exporter-Installation-Instructions.pdf` - the staff guide with
  installation screenshot, verification, export, import, and troubleshooting
  steps.

Installation follows Google's documented unpacked-extension workflow: unzip
the package, open `chrome://extensions`, enable **Developer mode**, select
**Load unpacked**, and choose the extension folder. Chrome loads the extension
from that folder, so staff should keep it in place. Reload an already-open
Primarius Order History page after installation. Google's reference is
[Hello World extension: Load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

The package includes the extension's README, privacy notice, support document,
changelog, assets, and AGPL license. The extension runs only on matching
Primarius Order History and View Order pages, uses the existing signed-in
browser session, and does not transmit Primarius data to another service.

## Data boundary

The upload is held in memory for the request, parsed, normalized, written in one
database transaction, and discarded. FEED stores neither the original filename
nor the CSV bytes. Real exports are excluded from Git; regression coverage uses
synthetic fixtures.

Normalized procurement data must never:

- change a Food Item's availability, status, limit, or estimated quantity;
- claim procurement caused a later operational transition;
- convert inbound weight into Food Item counts;
- treat shopping-list generation as consumption or demand;
- merge procurement channels merely because they arrived through one portal.

## Accepted OFB contract

**As of 2026-07-22 (D14 in
[procurement-unification-plan.md](procurement-unification-plan.md)), the
importer accepts one format: the unified export** — one sparse 26-column CSV,
produced by one Order History action in the OFB Order CSV Exporter (v2.0.0+),
covering Warehouse Completed orders plus Fresh Alliance Pending and Completed
pickups for one date range. `Schema Version`, `Record Type`, and `Confirmed`
columns identify each row's shape and review status explicitly; FEED rejects
a schema version it does not understand rather than guessing. Full column
list and design rationale: `procurement-unification-plan.md` (D13, D14) and
the extension's own `docs/unified-export-design.md`.

The two single-channel exports the unified format replaced — a 12-column
Completed Orders CSV and a 19-column Agency Pickups CSV — are **no longer
accepted as standalone uploads.** Nothing in this feature had reached
production when they were retired, so there was no historical data in either
old shape to preserve compatibility for. Uploading either raw file now
produces a clear "does not match the standardized OFB export" error rather
than being silently accepted.

Internally, the unified import still normalizes each half of the file through
the same validation the two original formats used — the parsing engine
wasn't rewritten, only the standalone entry points were removed — so
everything below in this section remains accurate for what actually gets
validated, whichever channel a row belongs to. Structural failures block the
import: malformed CSV, missing or reordered headers, invalid dates, product
identifiers outside the observed four-to-six digit contract, missing or
unsafe order references, acquisition classes that conflict with OFB's
product-number families, or unsafe numeric values. OFB order references are
preserved as bounded strings because real references may contain an
alphabetic suffix. Source-quality anomalies import with warnings when FEED
can preserve both the source observation and a deterministic reconciliation.

Examples include:

- `Price Total` differing from `Qty × Unit Price`;
- a Period label disagreeing with the delivery date;
- a supplier description marking its product code as `DON'T USE` or
  `DO NOT USE`. FEED retains the historical weight and flags the deprecated
  catalog metadata;
- a source order appearing on more than one receiving date in the same export.

Multiple source orders on one receiving date are normal and do not produce a
warning. A source order on multiple dates in one export is a structural
conflict because FEED cannot choose which snapshot is authoritative without
inventing a rule.

For price disagreements, FEED preserves the source-reported total and a
canonical calculated total. Analytics use the calculated total. This is
reconciliation, not an assertion that FEED knows why the source differs.

## Procurement channels

The **source system** is the OFB portal. The portal aggregates two procurement
channels that must remain distinguishable:

- **OFB Warehouse** covers source references that do not end in `AGPCKUP`.
- **Fresh Food Alliance** covers source references ending in `AGPCKUP`. These
  receipts are Donated supply reported through participating grocery partners.

Both channels contribute to combined inbound-weight totals when the user
selects All Channels. They remain filterable because their sourcing patterns,
event meanings, and cadence are materially different. This channel
classification is deterministic source metadata; it is not semantic mapping
to FEED Food Items.

The source-reference suffix is the event classifier. Product-code prefixes are
supplier catalog families, not event provenance. Historic numeric OFB orders
contain `4xxxx` and `FA`-described products, frequently with OFB service fees;
those lines remain part of their OFB Warehouse Order. FEED preserves the raw
code and description without reclassifying the event.

### Event kinds

FEED records one immutable event kind per source reference:

- `ofb_warehouse_order` — the reference does not end in `AGPCKUP`;
- `fresh_alliance_receipt` — the reference ends in `AGPCKUP`.

There is no Mixed Legacy Event kind. The prototype's earlier 400-event count
was an artifact of classifying lines from their product-code prefix. The
complete direct-export corpus disproved that interpretation.

## Revision and rollback model

The source `Order #` reference is the stable event boundary established by the
direct exporter corpus. Each normalized event snapshot receives a
deterministic hash; source row order is excluded from that hash.

- An identical active snapshot is a no-op.
- A changed snapshot for the same source reference appends a new revision.
- A revised snapshot may correct its receiving date without manufacturing a
  second order identity.
- Only the newest revision belonging to an active import contributes to
  Analytics.
- Rolling back an import preserves its data and audit history, then restores
  the preceding active revision for each affected source event.
- Restoring an import makes its revisions eligible again; the newest active
  revision still wins.

Import warning details—including delivery date and source row references—are
retained as normalized provenance. This does not retain the source file.

Imports and normalized observations are organization-wide. User identity is
retained only as optional audit attribution, never as a visibility filter.

## Staleness

Procurement data is flagged as potentially stale when the newest active
delivery date is more than 30 calendar days before today in FEED's configured
organization timezone. Both Analytics and Data Management surface the flag.

Staleness is a refresh prompt. It is not an accusation of incomplete work, and
it must not be presented as a data-quality score.

## Analytics vocabulary

The Procurement lens safely reports:

- total OFB inbound weight;
- source-event count and distinct receiving-date count as separate metrics;
- OFB Warehouse Order and Fresh Food Alliance Receipt counts;
- median event weight, interquartile range, and median source lines only inside
  a selected channel, never as one blended comparison of unlike event types;
- OFB acquisition mix by inbound weight;
- OFB Warehouse and Fresh Food Alliance channel mix by inbound weight;
- calculated gross product charges, service fees, grants, and net recorded
  charges;
- paid product charges ranked within exact OFB Warehouse product codes, with
  paid weight, receiving-date count, and mix-sensitive cost per paid pound;
- monthly inbound weight by acquisition class;
- year-over-year seasonal weight with shared date-range, channel, and
  acquisition filters;
- searchable OFB Warehouse product history with receiving-date count, inbound
  weight, median receiving gap, and first/last receiving dates;
- Fresh Food Alliance pounds and receipt counts by broad OFB reporting category.

Warehouse supplier products are identified by OFB product code. Within an
`AGPCKUP` receipt, `4xxxx` codes are broad Fresh Food Alliance reporting
categories, not products. Historic numeric Warehouse Orders may also contain
`4xxxx` catalog products; their raw codes remain Warehouse product observations.
Descriptions remain source observations and may change. Price trends must stay
within one Warehouse supplier product code. Product history does not establish
that a Food Item was available to clients.

Paid-product analytics answer where recorded procurement dollars went within
the selected range. They do not claim that a product was purchased because
donations were insufficient. Category-level paid-dependency claims remain
deferred until FEED has a separately reviewed, trustworthy classification or
mapping contract.

The Analytics date control is shared with Operations: 7 days, 30 days, 90 days
(default), year to date, all active procurement history, or an inclusive custom
date range. Channel and acquisition class remain independent Procurement
filters. All Procurement cards use the same resolved range. Exact-product
history is Warehouse-only. Fresh Food Alliance uses category mix and
category-detail views. Staleness remains based on the latest
active delivery in the complete corpus rather than the selected range.

Seasonal Inbound Weight compares selectable calendar-year series only when the
resolved range spans more than one calendar year. Every year in the resolved
range is selected by default. Users can select all years, clear the selection,
or choose individual years for a focused comparison. A single-year range shows
the monthly trend inside that range and disables the year overlay control; it
never quietly reaches outside the shared date filter.

Completed source lines with zero quantity or zero weight remain in provenance
and the Import Quality count, but are not evidence that supply was received.
They do not contribute to Warehouse product history or Fresh Alliance category
receipt observations.

OFB places event-level service fees and grants on individual source rows.
Whole-event and year-only totals may include those adjustments. When a channel
or acquisition-class filter divides an event, FEED reports the filtered gross
product charges but marks fees, grants, and net cost as **Not attributable**.
It never assigns an event-level adjustment to the product row on which the
exporter happened to place it.

## Authoritative corpus validation

The direct exporter corpus was validated on July 15, 2026. The approved union
uses six broad exports covering November 9, 2009 through July 13, 2026. Narrower
overlapping exports are accepted as no-ops. The file named
`OFB_Completed_Orders_2026-06-01_to_2026-06-02.csv` was explicitly excluded
because it is a synthetic conflict fixture rather than source history.

The production-shaped import produced:

- 38,348 normalized source rows;
- 2,147 source events across 1,635 receiving dates: 1,321 OFB Warehouse Orders
  and 826 Fresh Food Alliance Receipts;
- 1,623 stored supplier product codes;
  observations;
- 3,722,217.97 pounds of inbound supply;
- $355,840.09 calculated gross product charges;
- $316.11 in service fees and $25,709.79 in grants;
- $330,446.41 in net recorded charges.

The overlapping May–July 2026 export skipped all 69 source events as exact
duplicates. Rollback restored the preceding active event revisions, restore
reinstated the latest snapshot, and an intentionally modified order appended
revision 2 without altering the source identity. These checks were repeated on
a production-shaped database copy after applying every migration.

This validation does not authorize semantic mapping, category synthesis, or
AI-assisted links to FEED Food Items. Exact supplier-product price history and
direct analytics export remain later, separately reviewed increments.

## Grocery partner identity

**Superseded July 2026.** This section previously stated that OFB exports do not
identify the grocery partner behind a Fresh Food Alliance receipt, and routed
partner-level analytics to a future agency-authored XLSX pipeline. The first
claim is no longer true.

The **Completed Orders** export does not identify the partner. The **Agency
Pickups** export — added in OFB Order CSV Exporter v1.2.0 — reports donor code
and donor name directly, from the same authoritative source system. Partner
identity is now *received*, not unavailable.

What has not changed: **FEED must never infer** Amazon, Fred Meyer, Trader
Joe's, or another partner from dates, reference numbers, category mixes, or
operational history. FEED records the donor OFB reports and nothing more. The
prohibition on manufacturing partner identity stands in full.

The observed donor roster is open and changes over time — partners start and
stop participating. FEED derives it from imported data. There is no fixed enum
and no seeded partner list, and a partner's absence from a date range is not
evidence that it stopped donating.

See [procurement-unification-plan.md](procurement-unification-plan.md) for the
ingestion phases and
[fresh-alliance-coverage-verification.md](fresh-alliance-coverage-verification.md)
for the corpus evidence.

## Future agency-authored historical ingestion

William Temple House holds pre-FEED history in assorted XLSX and XLS files —
`In-Kind Donations FY20xx`, `Social Services Tracking FY20xx`. These are **not**
older OFB procurement data and must not be coerced into the procurement schema.
They record direct community donations and client services: a different domain
with different meaning.

The OFB corpus already reaches 2009 for Warehouse Orders and 2023-06-01 for
Fresh Alliance receipts, which is the complete OFB picture. Ingesting the XLSX
history is additive breadth, not backfill, and requires its own versioned
pipeline with its own source contract, validation, revision, and rollback rules.
Those observations may later aggregate with OFB procurement by weight, date, and
defensible category while retaining independent provenance.
