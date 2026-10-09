# Unified Add Data Experience

**Status:** Operational. Data Management exposes one **Add Data** action. The
modal detects and routes unified OFB, WTH historical procurement, Link2Feed
visits, SIMC visits, canonical WTH Tracking files, and canonical LOTTO queue
history without asking the user
to choose a parser. The former OFB and Legacy toolbar buttons have been
removed. Procurement imports retain their established endpoints; Service
imports retain staged review and atomic activation.

Native FEED Service Log entry is intentionally outside Add Data: it records new
organization-authored operational facts rather than importing an external
artifact. The historical WTH Tracking workbook enters through Add Data after
conversion by its completed canonical long-form exporter.

## Decision

Data Management will have one primary **Add Data** action for external data.
FEED inspects the selected artifact, identifies its source contract, and routes
the user into the correct review and ingestion branch.

Users do not choose Link2Feed, SIMC, OFB, or Tracking before selecting a file,
and they cannot force an unknown file through a parser. Source choice creates
avoidable confusion when files have unambiguous structural signatures.

Data Management summarizes FEED's current active holdings: OFB Warehouse and
Fresh Food Alliance events, SIMC and Link2Feed visits, and LOTTO queue sessions.
Service counts come from current active fact revisions, not a sum of
import-history rows, because overlapping imports may append later revisions of
the same source record. LOTTO's banner count includes current sessions still
awaiting classification; the separate LOTTO card states which sessions are
withheld from Analytics.

The history table, its Add Data control, and Data Rules share one **Imported
Data** card. LOTTO synchronization and review remain in the separate **LOTTO
Queue Data** card because that workflow pulls immutable source closeouts rather
than accepting a routine staff-selected export.

The global entry point covers procurement and service data. Database backup
restore remains a system-maintenance workflow under the Database tab; it is not
ordinary Add Data ingestion.

## Why start globally

Building a Service-only modal would establish a second orchestration model and
later require merging it with procurement. Phase 0 therefore establishes the
global shell first while keeping each domain's normalization, persistence, and
analytics independent.

Shared concerns belong in the shell:

- file selection;
- header/container inspection;
- source-contract detection;
- recognized/ignored-field disclosure;
- coverage and quality preview;
- progress and cancellation;
- result summary;
- accessibility, responsive behavior, and ASK-aligned failures.

Domain concerns stay in adapters:

- exact validation;
- normalization and privacy transformation;
- revision/snapshot identity;
- reconciliation rules;
- persistence and atomic activation;
- rollback and restore;
- domain-specific warnings and Analytics effects.

## Modal pattern and implementation choice

The production modal combines two established FEED patterns:

- the Document Translator's focused drop zone, retained file state, and
  success-only progression;
- AI Configuration's short title/description, centered hero iconography, and
  progressive disclosure.

The shell therefore presents one decision at a time. It uses one short heading,
one sentence of supporting copy, a hero upload area, a compact detected-source
confirmation, and source-specific review only when the next action needs it.
It does not show step counts, progress percentages without measured progress,
contract IDs, domain labels, field-mapping prose, or a source picker. Technical
transformations remain in this document and in adapter tests rather than
leaking into routine staff UI. Ignored-column counts remain visible because
they directly explain privacy behavior.

Three approaches were considered:

1. Detect the file and reopen the former OFB or Legacy dialog. This minimized
   code movement but broke the promise of one continuous modal.
2. Migrate every importer into the Service job lifecycle. This would make the
   backend uniform but would replace mature procurement behavior for cosmetic
   consistency.
3. Use one modal shell that delegates to existing source services. This is the
   implemented approach: the UX is unified while each domain keeps its proven
   validation, persistence, warning, no-op, and lifecycle semantics.

| Detected file | Dispatch | Authority | User-visible flow |
| --- | --- | --- | --- |
| OFB unified v2 | Existing procurement importer | Staff or administrator | Confirm → import → result/warnings |
| WTH historical community donations | Existing legacy sidecar importer | Staff or administrator | Confirm → import → result |
| Link2Feed visits | Service ingestion jobs | Administrator | Confirm → validate/reconcile → activate |
| SIMC service visits | Service ingestion jobs | Administrator | Confirm → validate/reconcile → activate |
| Canonical WTH Tracking | Service ingestion jobs | Administrator | Confirm → validate/reconcile → activate |
| Canonical LOTTO queue history | Direct immutable queue-history ingest | Staff or administrator | Confirm → import → review anomalous sessions |
| Retired single-channel OFB files | No importer | Staff or administrator | Recognize → request unified export |
| Pending/unknown contracts | No importer | Staff or administrator | Explain the required artifact; never force a parser |

## Persistence boundary

Unified UX does not require one generic fact table. Procurement keeps its
mature `ProcurementImport` and order-revision domain. Service uses separate,
strongly typed import, source-client, encounter-revision, and source-resolution
tables, plus immutable client-profile revisions and canonical response rows.
The classifier chooses the domain adapter; it does not erase the semantic
boundary between domains.

This avoids migrating stable procurement history merely to make the modal look
unified and avoids a generic JSON/EAV store that would weaken Service validation
and Analytics queries. Service tables are organization-wide and form their own
sanitized-backup/restore unit. LOTTO history is the deliberate Service-domain
exception to administrator-only formal intake imports: it contains anonymous
operational timing facts, and staff review changes only Analytics inclusion,
never client or household facts.

The Data Management history is a read-side projection across those durable
boundaries, not a third fact store. `GET /api/data-import/history` reads active
and rolled-back `ProcurementImport` and `ServiceImport` provenance, gives every
row a domain-qualified identity, and returns a shared summary for the standard
table. Procurement retains order details and exact warnings. Service reports
visit, profile, or operational-observation revision counts plus grouped safe
quality findings. Pending `DataImportJob` and pending `ServiceImport` rows never
appear: staging is temporary workflow state, not import history.

## UX flow

### 1. Add Data

One file is selected or dropped. File extension and filename can decide which
container reader to use, but they are not source evidence.

The browser reads only CSV headers before the user reviews the detected source.
Service branches then stream CSV artifacts to restricted staging, calculate a
hash without holding the file in memory, inspect the minimum bytes needed to
classify it, and delete staging bytes on completion, failure, cancellation, or
expiry. OFB and WTH historical procurement delegate to their existing atomic
request-scoped importers; UX unification does not change their storage model.

### 2. Detect and inspect

The classifier returns one of:

- `detected` — one contract matched;
- `unknown` — no contract matched;
- `ambiguous` — equally valid contracts matched.

Only `detected` can continue. Unknown and ambiguous files receive a specific
message explaining which export to obtain; the UI does not offer a source
picker as an escape hatch.

The confirmation names the source, dataset, file, size, and ignored-column
count when relevant. Coverage, reconciliation, and quality details appear only
after a source adapter has actually inspected the data rows.

### 3. Resolve issues

Routine facts do not require confirmation. For example, extra columns in a
Link2Feed export are silently irrelevant to parsing and shown only as an
informational ignored-column count.

A decision is required only when it changes meaning or inclusion, such as an
unresolved aggregate/special-event record. Resolutions are versioned overlays,
not parser exceptions or destructive source edits.

### 4. Ingest

Production ingestion is job-based. The shared lifecycle and staging boundary
are implemented. The Link2Feed visits adapter now exercises the complete path;
each later source adapter must use the same sequence:

1. restricted temporary staging;
2. streaming parse and allowlist projection;
3. batch normalized staging writes;
4. source and cross-source reconciliation;
5. validation of accepted/rejected/unresolved totals;
6. non-visible normalized materialization followed by short atomic activation;
7. temporary-byte deletion.

Failed staging never contributes to Analytics. Progress reports real phases and
record counts; it does not invent a percentage.

The reviewed Link2Feed archive is 16,940,175 bytes, which is larger than the
existing in-memory procurement ceiling. Unified staging therefore uses a 64 MB
limit, writes under `STORAGE_PATH/data-import-staging` with a `0700` directory
and `0600` server-generated files, retains no original filename, and expires
staging after 24 hours. A staged key cannot escape that directory. The source
artifact is hashed and classified both when staged and immediately before
activation.

`DataImportJob`, its review rows, and its staged source bytes are transient and
excluded from sanitized backups. The Link2Feed adapter materializes normalized
revisions under a `pending` Service import before activation; pending imports
and their clients/facts are filtered from sanitized backups and Database counts.
The activation transaction only flips the prepared import and current
projections into visibility. This keeps partial or failed work invisible to
Analytics without extending FEED's 30-second transaction ceiling.

### 5. Results

The completion state distinguishes:

- imported observations;
- revised observations;
- unchanged/no-op observations;
- excluded observations;
- unresolved observations;
- warnings;
- coverage/gaps;
- rollback availability.

## Classifier registry

Each adapter declares a versioned source contract:

- stable contract ID;
- source and dataset labels;
- domain;
- supported container types;
- required signature fields;
- optional/allowed fields;
- forbidden fields where needed to distinguish sibling datasets;
- exact-header mode for strict existing contracts;
- transform/discard plan;
- adapter readiness (`operational`, `prototype`, `pending-sample`);
- source-specific next step.

Detection uses normalized header names, handles quoted CSV correctly, and does
not inspect arbitrary field values merely to guess a source. An agency-produced
canonical exporter should include an explicit schema marker whenever FEED
controls the artifact format.

The Phase 0 frontend registry is:

`packages/frontend/src/components/data-management/add-data/source-contracts.ts`

It recognizes synthetic versions of:

- OFB unified v2;
- legacy OFB completed orders;
- legacy OFB agency pickups;
- WTH historical procurement ledger;
- Link2Feed visits v1;
- SIMC service visits v1;
- provisional Link2Feed clients v1;
- WTH long-form service Tracking v1.

The representative SIMC artifact establishes `simc_service_visits_v1`: raw
rows represent household members within a Visit ID and are grouped into one
formal household visit plus linked person profiles. It follows the same
extra-column privacy rule as Link2Feed and discards Additional Notes. The
backend registry lives at
`packages/backend/src/services/data-import/source-contracts.ts`, with a
read-only `POST /api/data-import/inspect-header` contract. That endpoint accepts
only the first CSV record, returns counts rather than unrecognized header names,
and never receives data-row values. The modal uses a local mirror for responsive
preflight. The persistent Link2Feed branch always re-detects the actual staged
artifact and verifies its hash and contract again before activation.

## Link2Feed extra-column policy

Link2Feed differs from the strict OFB contracts:

- Required signature fields identify the dataset.
- The reviewed sanitized schema is the allowlist.
- Additional headers do not block detection or validation.
- Additional values are never projected into normalized rows.
- Additional values are never logged, returned in errors, or persisted.
- The UI reports only the ignored-column count by default.

This allows an agency to upload an original export containing name, contact, or
address fields without FEED retaining them.

## Agency-specific inputs

A global entry point does not turn agency-specific data into universal logic.
The WTH historical procurement ledger and service Tracking export remain
separate, identified source contracts that can be disabled in a generic
deployment.

The classifier is universal; adapter availability is deployment configuration.
WTH-specific vocabulary and resolutions stay in WTH configuration/data, not in
generic source parsers.

## Tracking workbook boundary

FEED will not maintain a production parser for the evolving Google Sheet
layout. A WTH-owned exporter converts the reviewed workbook into the versioned
long-form CSV contract before Add Data ingestion.

This keeps the user experience unified without making spreadsheet coordinates
the permanent application API. After the migration and FEED-native Service Log
cutover, the exporter and Tracking adapter become historical compatibility
tools rather than recurring operational dependencies.

Activation does not create a permanent read-only Tracking silo. Each imported
metric/date observation seeds the same organization-wide fact later maintained
through the native Service Log. Staff can open a historical date, edit or clear
the imported value, and save a new FEED revision; the workbook sheet/cell stays
attached to the superseded import revision for audit. A database-enforced
current projection prevents imported and native values from being counted at
the same time, and import rollback/restore cannot replace a later native
correction.

The exporter is run from `packages/backend`:

```bash
npm run export:wth-tracking -- /path/to/Tracking.xlsx /path/to/wth-tracking.csv
```

It emits only directly entered, approved metric cells. Blank cells and formula-
generated future zeroes remain absent; directly entered zeroes remain
observations; workbook Total and Notes columns never enter the CSV. The export
retains worksheet/cell provenance so review and later corrections can identify
the operational artifact precisely. Invalid metric cells block export with
their exact worksheet and cell rather than being guessed or silently
discarded.

“Week of the Month” identifies a Tuesday–Thursday service block, not the nth
Tuesday, Wednesday, or Thursday. The exporter anchors the first block to the
one that intersects the beginning of the worksheet month, then advances in
seven-day increments. This handles months such as November 2023, where week 1
begins on Tuesday, October 31 and week 5 begins on Tuesday, November 28. Cached
Calendar Dates values are presentation formulas and are not date authority.

Approved source labels such as `Visits`, `Shopping Visits`, and
location-qualified shopping-visit labels map to the same stable metric key. The
CSV retains the exact source label and workbook cell as provenance, but FEED
does not require that historical wording to equal the editable display alias
effective in Service Metrics. Type, unit, semantic role, active state, and
effective coverage remain enforced. Parser errors are reported by CSV row;
errors raised by staging, configuration, or persistence retain their workflow
meaning instead of being relabeled as malformed CSV.

The corrected 34-sheet source workbook was successfully exported and parsed in
local verification: 1,114 observations across 318 service dates from October
17, 2023 through August 6, 2026. No duplicate date/metric identities or adapter
contract warnings remained. Migration `20260811200000_add_wth_tracking_ingestion`
was also applied successfully before this verification. Staff subsequently
repeated the documented command and reproduced the same export summary, so the
workbook-to-CSV handoff is accepted for historical import review.

The production-shaped localhost review and activation then completed with all
1,114 observations new and no warning or unresolved issue. Reconciliation used
303 complete dates overlapping active Link2Feed/SIMC data: regular methods were
59 households higher overall, with a 4.27 mean absolute daily difference. Four
incomplete dates were excluded, and blank cells were never converted to zero.
All 1,114 historical observation revisions are active.

Formal reconciliation includes only dates with all three regular-method fields
recorded. A partially entered day remains operational evidence, but it is
reported as incomplete and excluded from the count comparison; FEED never
turns its blank method cells into zeroes.

## Authorization

Authentication gates all Add Data access. The canonical data remains one shared
organization-wide dataset; `uploadedBy` is audit attribution, never data scope.
All authenticated staff can open the modal and retain the established ability
to import procurement data.

Adapter branches may require different authority:

- existing procurement imports retain their current staff authorization;
- rollback, restore, and data-shaping remain administrator-only;
- Link2Feed, SIMC, and WTH Tracking imports remain administrator-only. A staff
  member can identify such a file locally, but the modal stops before upload
  and explains the required authority;
- routine native Service Log entry is a staff operation, not an Add Data
  import.

The server enforces every boundary. Hiding a branch in the UI is not security.

## Production status

Add Data is launched from the Data Management table toolbar. It:

- reads no more than 256 KiB from the selected CSV;
- parses the header locally;
- detects a registered contract;
- shows a compact source, dataset, file, size, and ignored-column confirmation;
- routes unified OFB and WTH historical procurement files through their
  established import services;
- recognizes older single-channel OFB files but requires the supported unified
  export rather than routing them into an incompatible parser;
- keeps pending adapters disabled with an actionable explanation;
- streams Link2Feed and SIMC visits plus canonical WTH Tracking observations
  through source-specific coverage and reconciliation review, then activation
  or no-op completion;
- presents households, visits, people, coverage, and quality findings in plain
  operational language rather than exposing canonical record architecture;
- exposes no separate OFB or Legacy toolbar action;
- lists Procurement and Service activations in one durable import history while
  keeping their facts and domain-specific details/lifecycle behavior separate.

## Transition to production

1. [x] Validate the global modal with synthetic and private local artifacts.
2. [x] Backend header detection, staged job state, private streaming storage,
   hashes, expiry, and pre-activation revalidation are complete.
3. [x] Route detected OFB unified files to the existing importer; preserve
   outcome, warning, no-op, refresh, and undo behavior.
4. [x] Route the WTH legacy procurement contract through its established
   single-agency sidecar importer.
5. [x] Enable Link2Feed inspection, resolution, pending materialization,
   activation, and no-op handling after its canonical schema lands.
6. [x] Enable WTH Tracking export, review, reconciliation, activation, revision,
   and no-op handling after the native metric domain lands. The corrected full
   workbook passes exporter and adapter validation, and all 1,114 historical
   observations are active. Parallel-entry cutover verification remains
   pending.
7. [x] Remove the separate OFB/Legacy buttons after automated routing and
   toolbar tests passed. Staff localhost acceptance remains the final UX check.
8. [x] Add SIMC household-visit/person-profile ingestion without changing the
   modal shell or asking users to select a parser.
9. [x] Replace the procurement-only Imports table read path with the unified
   durable history projection. Link2Feed, SIMC, WTH Tracking, OFB, and Community
   Donations now appear together without using transient job rows as history.

## Validation requirements

- Source selection is never required before file selection.
- Unknown/ambiguous files cannot proceed.
- CSV quoting, BOM, CRLF, and column normalization are handled.
- Extra Link2Feed columns are ignored and never exposed as retained data.
- Extra SIMC columns are ignored; Additional Notes and full DOB never cross
  the normalized staging boundary.
- SIMC raw member rows never inflate formal visit counts, and incomplete member
  rows never reduce source-reported people totals.
- Strict OFB and legacy contracts retain their existing exact validation.
- Operational branches produce the same results as their former buttons before
  those buttons are removed.
- Large imports stream and report real progress.
- Failed or abandoned staging leaves no active facts or retained source file.
- Staff and administrator branches match backend authorization.
- Light/dark, mobile/desktop, keyboard, focus return, and screen-reader behavior
  are verified.
- Synthetic fixtures contain no real private data.

## Current validation evidence

On August 11, 2026:

- 28 focused frontend tests passed across source detection, the unified modal,
  procurement routing, Service routing, permissions, and the Data Management
  toolbar;
- 15 focused backend tests passed across source detection, history projection,
  staff/admin route authority, and Service lifecycle selection;
- the production frontend build completed successfully;
- an authenticated localhost browser smoke confirmed the single toolbar action,
  minimal unclipped upload state, removal of the former OFB/Legacy buttons,
  clean dialog teardown, and focus return to `Add Data`;
- an authenticated history smoke displayed active Link2Feed, SIMC, and WTH
  Tracking rows alongside Procurement, opened SIMC provenance/quality details,
  and closed the dropdown-to-dialog transition with no stuck popover or pointer
  lock;
- direct localhost staff evaluation remains the acceptance gate for visual
  density, copy, drag/drop behavior, and the complete real-file flows.
