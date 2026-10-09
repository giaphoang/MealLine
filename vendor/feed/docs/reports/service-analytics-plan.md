# Service Analytics and Operational Tracking Plan

**Status:** Phase 0, the shared Phase 1 foundation, the Phase 2 Link2Feed visit
adapter, the native-entry and Tracking-adapter slices of Phase 3, and the Phase
5 SIMC service adapter and FEED v1.6.0 LOTTO Queue Statistics integration are
complete. The administrator-only formal Service Add Data
workflow streams, reviews, reconciles, and atomically activates Link2Feed and
SIMC visits plus the canonical WTH Tracking export. FEED also provides shared,
effective-dated Service metric administration and daily committed entry.
The Tracking migration schema has been applied locally, the known source-cell
error has been corrected, and the complete 34-sheet workbook now produces a
contract-valid 1,114-observation migration artifact. Reviewing and activating
that artifact is now complete: all 1,114 historical revisions are active.
The Link2Feed client export was reviewed on 2026-08-17 and **not** adopted: the
visits import already carries every demographic dimension it holds, for 9,596
clients against the export's 4,324, and at higher per-dimension coverage. Only
`Client Ethnicity-Parent Types` and `Household ID` are unique to it, and
Household ID confirms the existing household counts rather than correcting
them. The reasoning is recorded on the `link2feed_clients_v1` contract in
`source-contracts.ts`.

Service Analytics is now built and shipped in 1.5.0-beta.19: the lens carries
eight cards, all of them exportable through the Analytics report contract.
LOTTO Queue Statistics shipped in v1.6.0 as a separate queue-operations
evidence family. It includes wait and serving-time KPIs, initial issuance and
daily ticket averages, daily queue-volume lines, and 10th/25th/50th/final-call
clock-time lines. Its source contract and FEED MVP are documented under
`docs/roadmap`.
Completing the parallel cutover, the Link2Feed client-export adapter, and the
Chrome-extension artifact contract remain pending, as do the age and geography
cards — those are still blocked on the cutover question in the card proposal's
§2.8, because the two intake systems ask different demographic questions and one
distribution cannot honestly be drawn across the seam.

## Purpose

Service is the third lens in FEED Analytics, positioned to the right of
**Operations** and **Procurement**:

1. **Operations** describes recorded inventory availability, change, and
   pressure.
2. **Procurement** describes inbound supply and acquisition activity.
3. **Service** describes pantry service delivered to households and
   individuals, the population represented in formal intake data, and the
   operational methods William Temple House used to provide that service.

These remain separate evidence domains. FEED must not claim that a procurement
event or inventory transition caused a specific service encounter.

Service evidence is separated by what each record can prove:

- **Formal intake systems** establish authoritative household/individual
  service facts and demographics.
- **Agency operational tracking** explains how service was delivered, when
  capacity was reached, and which locally meaningful needs were observed.
- **LOTTO queue operations** describe anonymous ticket timing, batch issuance,
  first calls, and closeout outcomes after FEED classification.

No family replaces another, and overlapping counts are never added.

## Confirmed decisions

1. Link2Feed is the authoritative historical intake source for its coverage.
2. SIMC is the authoritative current intake source. WTH used Link2Feed through
   late May 2026 and moved to SIMC in the first week of June 2026.
3. The WTH Tracking sheet is accurate agency-authored operational evidence,
   but it is not the primary household/individual source.
4. Historical Tracking observations will be migrated once, then WTH will stop
   using the Google Sheet for routine entry.
5. FEED will provide native configurable service metrics and a routine daily
   Service Log.
6. Tracking and FEED-native operational metrics complement Link2Feed/SIMC; they
   do not fill or replace missing formal totals.
7. Link2Feed Notes are too inconsistently recorded to classify service method.
   They are discarded during ingestion. Tracking/FEED-native data supplies
   service-method detail.
8. The sanitized Link2Feed visit headers form a public ingestion allowlist.
   Original exports may contain extra personal columns; extra columns are
   ignored and do not prevent detection.
9. Demographic analytics distinguish only **provided** versus **not provided**
   participation. Blank, declined, prefer-not-to-answer, and don't-know source
   values all mean that no usable answer was supplied; FEED does not infer why.
10. The Link2Feed record dated November 24, 2025 with a reported size of 264 is
    a WTH Thanksgiving special-event people tally. It counts toward reported
    individuals served but not household-size distributions or ordinary
    household counts.
11. Data Management's end-state UX is one global **Add Data** action. FEED
    detects the source and dataset, then opens the appropriate branch. Users do
    not select or force a parser.
12. Link2Feed and SIMC Notes are discarded. Neither source reliably establishes
    WTH service method; Tracking and the FEED Service Log provide that detail.
13. SIMC raw rows are household-member observations within a visit. FEED counts
    one formal household encounter per `Visit ID`, uses `Household Size` for
    reported people, and retains identified Neighbor profiles separately.
14. LOTTO tickets are queue evidence, not household, person, visit, or completed
    service evidence. Queue counts never alter formal or Service Log totals.

## Source authority and product role

| Source | Coverage/status | Grain | Product role | Authority |
|---|---|---|---|---|
| Link2Feed visits | Reviewed sanitized sample ends 2026-05-13; WTH production coverage continued through late May 2026 | Visit/source observation rows, with anonymous or aggregate exceptions | Historical service, reported people, and visit-linked demographics | Formal historical authority |
| Link2Feed clients | Sanitized sample pending | Client profile | Enrich Link2Feed demographics through source-scoped Client ID | Formal historical profile authority |
| SIMC | Representative sanitized sample verifies 2026-06-02–2026-08-06; WTH went live in the first week of June 2026 | Household visit with repeated person/member rows | Current formal household/people facts and household/person demographics | Formal current authority |
| WTH Tracking | Verified 2023-10-17–2026-08-11 direct observations; July 2024 workbook gap | Daily metric observations | Historical service method, capacity, unmet demand, and ancillary requests | WTH operational detail |
| FEED Service Log | Operational; formal WTH cutover pending | Daily metric observations | Replaces Tracking for ongoing operational detail after parallel verification | WTH operational detail |
| LOTTO | v1.6.0; durable LOTTO v1.21.0 closeouts | Queue session and anonymous ticket observations | Wait/queue-entry duration, serving interval, last-call time, and ticket outcomes | LOTTO queue-operational authority only |

The long-range authoritative seam is Link2Feed → SIMC across late May/early
June 2026. The shorter range of a sanitized review artifact is not evidence of
a production coverage gap. Import review always reports the dates actually
present in that artifact, while Analytics derives the organization seam from
activated production imports and configured source policy. The operational
seam is Tracking → FEED Service Log. These seams must not be mistaken for the
same transition.

## Architecture: separate evidence families and grains

The current Service domain has two implemented fact families. LOTTO adds a
third, separate queue-operational family in v1.6.0.

### Formal service facts

Used for Link2Feed and SIMC evidence:

- visit or encounter observations when the export supports them;
- formal source aggregates when it reports only totals;
- source-scoped client identity and profile revisions;
- reported people/household measures;
- approved demographic attributes and response participation;
- import, revision, source coverage, and quality provenance.

### Operational metric observations

Used for Tracking and FEED-native entry:

- metric definition and definition revision;
- service date;
- typed value (count, boolean, or time-of-day);
- unit and semantic role;
- blank versus explicit zero;
- import provenance or manual-entry attribution;
- committed-state and revision history retained internally for provenance.

An operational service-method sum may be reconciled with a formal household
total. It never supersedes that total and is never added to it.

### Queue session and ticket timing observations (implemented v1.6.0)

Used for LOTTO evidence:

- immutable queue-session revisions;
- anonymous per-ticket issuance/queue-entry and first-call timestamps;
- batch sequence and issuance mechanism;
- called, unclaimed, returned-before-call, returned-after-call, and not-called
  closeout outcomes;
- configured versus actually issued ticket counts; and
- source coverage, synchronization, revision, and quality provenance.

The calculation, privacy, ingestion, and screen/PDF/CSV card contract is in
[`../roadmap/lotto-queue-timing-mvp.md`](../roadmap/lotto-queue-timing-mvp.md).

## Link2Feed visit contract (`link2feed_visits_v1`)

### Detection rules

Detection is independent of filename, column order for allowlisted data, and
the presence of extra columns. The initial required header fingerprint is:

- `Visit Date`
- `Client ID`
- `Household Size`
- `Recorded At`

The required fingerprint identifies the dataset. Full validation then checks
types, date encoding, stable keys, and allowed optional fields. Missing optional
fields reduce available analytics; extra fields are irrelevant.

The browser preflight mirror defines this contract in
`packages/frontend/src/components/data-management/add-data/source-contracts.ts`.
The backend registry re-detects the streamed artifact and is the source of
truth for persistent ingestion.

### Public allowlist and transformations

| Link2Feed field(s) | Canonical treatment |
|---|---|
| `Visit Date` | Decode the reviewed Excel serial date into organization-local `serviceDate`. |
| `Recorded At` | Decode the serial timestamp; use with service date and Client ID when present to form a deterministic source observation identity. |
| `Client ID` | Retain as a Link2Feed-scoped identifier. It is not PII in this contract, is not exposed as an Analytics dimension, and is never matched to SIMC identity. Blank remains identity unavailable; FEED does not assert why. |
| `Client First Visit- Personal Tab`, `Client First Visit-Date` | Normalize reviewed new/returning-client evidence without inventing a first visit where the source is blank or contradictory. |
| `Client Date of Birth`, `Client Estimated Date of Birth` | Derive `birthYear` and whether it was estimated, then discard the full birth date. |
| `Client Gender Identity-Labels`, `Client Gender Identity-Parent Types`, `Client Ethnicity-Labels`, `Client Disability`, `Client Self-Identifies As` | Normalize approved demographic dimensions and multi-select values. Store participation as `provided` or `not_provided`. |
| `City`, `County`, `State`, `Zip Code` | Retain approved geographic dimensions. Analytics must disclose response coverage and prevent sparse groups from identifying clients. Street addresses remain outside the allowlist. |
| `Housing Type` | Normalize as an approved client/household profile dimension with response participation. |
| `Household Size` | Normalize as `reportedPeopleCount`, not an unconditional household-size truth. Ordinary identified household encounters may contribute to household-size distributions; resolved special/aggregate records do not. |
| `Household Languages`, `Household Primary Income Source`, `Dietary Considerations`, `Social Assistance` | Normalize multi-select need/profile dimensions with response participation. |
| `Notes` | Discard. Do not classify pantry shopping, long list, or short list from this field. |

No other header is eligible. Names, email, phone, street address, government
identifiers, case-management fields, or any other extra columns are ignored.
Their presence is informational in review, not an error. Their values must not
enter normalized objects, logs, error details, or persistent storage.

### Ongoing Link2Feed agencies

WTH will import its final historical snapshot once. Other agencies may still
use Link2Feed operationally and import repeated exports. Therefore this is not
a one-time migration parser. It must support:

- deterministic snapshot/observation keys;
- identical re-import as a no-op;
- changed source observations as revisions;
- overlap/restate detection;
- rollback and restore;
- source-specific coverage and staleness;
- streaming/staged ingestion for files larger than the current procurement
  request limit.

## Link2Feed client contract (`link2feed_clients_v1`)

The canonical destination is defined, but exact source detection remains
provisional until a sanitized client export is reviewed.

The client allowlist mirrors the profile fields above:

- Client ID;
- first-visit evidence;
- birth year derivation inputs;
- gender/self-identification, ethnicity, and disability;
- city/county/state/ZIP;
- housing and household size;
- languages, income source, dietary considerations, and assistance.

It deliberately excludes visit date, recorded-at, Notes, and any extra personal
columns. Presence of `Visit Date`/`Recorded At` identifies the visit contract
instead.

Client imports are order-independent. They may arrive before or after visit
history and enrich the Link2Feed-scoped profile through Client ID without
requiring visit re-import. A client export never creates service encounters.

## SIMC contract

A representative 71-column sanitized service export verifies
`simc_service_visits_v1`. Detection is independent of filename and permits
extra columns, but requires this distinctive fingerprint:

- `Household ID`, `Anonymous`, and `Household Size`;
- `Neighbor ID`;
- `Event ID`, `Visit ID`, `Visit Date`, and `Visit Recorded On`;
- `Primary Service(s)`.

The reviewed artifact contains 4,727 raw rows but only 3,305 Visit IDs. Its
grain is one household-member row within a visit, not one service visit. The
adapter therefore groups rows by Visit ID and applies these rules:

- one valid Visit ID creates one formal household encounter;
- Household ID is retained only in the SIMC source namespace and never matched
  to a Link2Feed Client ID;
- one valid identified encounter contributes one reported household;
- Household Size supplies reported people; linked Neighbor-row count is a
  separate completeness check and never replaces it;
- adult, child, senior, and unknown-age composition must sum to Household Size;
- Event ID and Visit Recorded On remain safe source provenance;
- first/returning status remains `unknown` because the export does not prove it;
- Additional Notes is discarded and never classifies service method;
- absent Visit IDs in a later date-range export do not delete active facts.

### SIMC household/person model

SIMC proves two source-scoped subject levels:

1. Household ID identifies the household/case receiving one formal encounter.
   Household-level profile evidence includes geography, no-fixed-address,
   living situation, languages, SNAP, approved assistance/program fields, and
   other allowlisted needs questions.
2. Neighbor ID identifies a person represented in one or more household
   encounters. Person profiles retain birth year derived from DOB, gender
   identity, and combined race/ethnicity. Full DOB is discarded before
   normalized staging or persistence.

An encounter-to-person observation retains membership and the Head of
Household marker. It does not imply that every reported person has a member
row: the reviewed sample has 4,760 reported people but 4,727 member rows, with
21 visits carrying a net 33-person completeness gap. Analytics must disclose
that member-level demographic coverage instead of reducing people served.

### SIMC allowlist and transformations

| SIMC field(s) | Canonical treatment |
|---|---|
| `Visit ID`, `Visit Date`, `Visit Recorded On`, `Event ID` | Stable source encounter identity, local service date, source-recorded time, and event provenance. |
| `Household ID`, `Anonymous` | SIMC-scoped household identity when identified; anonymous visits retain no household/person identity. |
| `Household Size`, adults/children/seniors/unknown-age counts | Reported people plus validated household composition. |
| `Neighbor ID`, `Head of Household` | SIMC-scoped person identity and encounter membership role. |
| `Neighbor Date of Birth`, `Neighbor Age` | Derive birth year from DOB and discard DOB; age is validation-only. |
| `Neighbor Gender Identity`, `Neighbor Race or Ethnicity` | Person-level responses with `provided`/`not_provided` participation. Race/ethnicity remains a combined SIMC dimension rather than being forced into Link2Feed ethnicity. |
| Household city/county/FIPS/state/ZIP and `No Fixed Address` | Normalize approved household geography; sparse Analytics groups require privacy controls. |
| Living situation, languages, SNAP, dietary, disability, employment, food insecurity, military, government programs, approved assistance | Household profile responses. Language parsing separates the translation-needed modifier. |
| `Primary Service(s)`, agency/program identifiers | Validate the service export and retain only provenance needed by the contract. They do not establish WTH service method. |
| `Additional Notes` | Discard without classification or staging. |

Alt ID, exact income, signature fields, agency/program street addresses,
network/profile settings, redundant administrative status fields, and every
unrecognized column are ignored. Original unsanitized exports may include
additional PII columns; their presence does not prevent detection and their
values must never enter normalized objects, logs, errors, or persistence.

### SIMC review and revision behavior

Import review reports raw rows separately from formal visits, identified
households and people, reported people, actual row-derived coverage, member-row
completeness, repeat same-day household visits, demographic participation, and
new/revised/unchanged revisions. Distinct Visit IDs remain distinct unless the
source supplies explicit cancellation/replacement evidence. The reviewed sample
contains 13 household/date pairs with two Visit IDs; that is a visible quality
summary, not grounds for automatic deletion.

SIMC exports may cover arbitrary date ranges. Visit, household-profile, and
person-profile keys therefore support overlapping incremental imports, no-op
reimport, and append-only revisions. Absence from a later artifact is never a
deletion signal.

The separately developed Chrome extension should emit a versioned,
FEED-recognizable artifact when possible. It still passes through review,
staging, validation, and activation rather than bypassing ingestion controls.

## SIMC multi-value parsing

Settled August 2026. SIMC joins multiple answers to one question with a comma,
and four of its category names contain a comma of their own:

| Field | Label |
| --- | --- |
| `Neighbor Race or Ethnicity` | `Hispanic, Latino, or Spanish` |
| `Household Living Situation` | `I have a place to live today, but I am worried about losing it in the future` |
| `Household Military Status` | `No, never on active duty except for initial/basic training` |
| `Household Military Status` | `No, never served in the U.S. Armed Forces` |

A naive split stored the first as three answers — "Hispanic", "Latino", "or
Spanish" — each counted separately, so a race breakdown built on it would have
reported "or Spanish" as a race. Changing the delimiter cannot fix this:
`Asian, Chinese` genuinely is two answers. The adapter therefore holds known
comma-bearing labels aside before splitting, and the list has to grow when SIMC
adds a category containing one. Values arriving as obvious sentence fragments
are the symptom.

**Link2Feed is unaffected.** It uses ` / ` inside a label (`Black / African
American`) and `,` between labels, so the two never collide.

**Fixing the adapter does not fix rows already written.** Either re-import the
same export — which supersedes them, and picks up anything newer at the same
time — or run `scripts/repair-simc-comma-labels.ts`, which rejoins the affected
arrays. The repair is an exact inverse rather than a guess: the fragments sit
adjacent and in order, because that is how the split produced them. The
development copy was repaired this way (75 responses of 92,413); production
needs the same treatment or a re-import after deploy.

## Record kinds and source-data resolutions

Not every formal-source row proves one ordinary household visit. The canonical
model must distinguish at least:

- `identified_household_encounter`
- `identity_unavailable_encounter`
- `special_event_people_aggregate`
- `formal_source_aggregate`

The importer does not guess a record kind from a large number alone. It may
raise a quality flag, but changing meaning requires an explicit, versioned
source-data resolution.

### How each kind is counted

Settled August 2026, after the household counts were found to be silently
dropping anonymous visits. The rule is one sentence: **an anonymous visit is a
household; what is missing is the identity, not the household.**

| Record kind | `clientId` | Counts as a visit | Counts as a household |
| --- | --- | --- | --- |
| `identified_household_encounter` | set | yes | yes, deduplicated by `clientId` |
| `identity_unavailable_encounter` | **null** | yes | yes, **one per visit, not deduplicated** |
| `special_event_people_aggregate` | null | no | **never** — a crowd is not a household |

The trap this replaced: `COUNT(DISTINCT "clientId")` skips nulls, so anonymous
visits vanished from every household figure without any code saying so. In the
production corpus that is 4,506 of 82,600 visits, and it is not spread evenly —
12.7% of 2023 against 2.2% of 2025, because 2023 was recorded on paper under
pressure. Year-over-year growth was therefore partly measuring recording
quality.

Counting them costs deduplication: two anonymous visits by the same family
count twice, because nothing in the record can say they were the same family.
That over-count is bounded by the anonymous share and is far smaller than the
error it replaced. Cards state it rather than implying the figure is exact.

Any expression that adds anonymous visits must test
`recordKind = 'identity_unavailable_encounter'` rather than
`clientId IS NULL`. Bulk crowd rows also carry a null `clientId`, and a
264-person Thanksgiving row becoming "a household" would corrupt every
household-grained measure.

**The one deliberate exception is visits per household** (`reachAndFrequency`),
which stays identified-only. It asks how often a household returns, and an
anonymous row carries no repeat information at all — including those rows adds
one visit and one household apiece, dragging the average toward 1 and reporting
a recording artefact as behaviour.

### WTH Thanksgiving 2025 resolution

The Link2Feed observation with:

- service date `2025-11-24`;
- recorded the following day;
- blank Client ID;
- reported people value `264`;

is known operationally to represent a WTH outdoor Thanksgiving market clicker
count. Its reviewed resolution is:

- record kind: `special_event_people_aggregate`;
- reported individuals served: `264`;
- household-size value: unavailable;
- ordinary household-encounter contribution: unavailable;
- event label: WTH Thanksgiving outdoor market;
- include in formal reported-people totals;
- exclude from typical-household size, household-size percentiles, and
  identified-client demographics.

This is not hard-coded inside the Link2Feed parser. It is a WTH-authored
resolution attached to the deterministic source observation key. The same
general mechanism lets another agency resolve a special event or source quirk
without changing the reusable Link2Feed contract.

Resolutions are non-destructive overlays. The source value, rule version,
author/reason, and effective state remain auditable; removing the resolution
restores the unresolved source interpretation.

## Demographic participation and denominators

### Canonical response status

For each demographic question, FEED asks one analytical question: was a usable
answer provided?

- `provided` — at least one substantive answer value exists.
- `not_provided` — blank, declined, prefer not to answer, don't know, or any
  equivalent non-answer value.

FEED does not retain or report a speculative reason for non-participation. If a
multi-select response contains a substantive answer plus a non-answer label,
the substantive answer governs and the response is `provided`.

A response row exists only when that question/dimension was present in the
source contract. If an export omits the entire question column, coverage is
**unavailable** rather than `not_provided`; FEED must not describe clients as
declining a question the source did not prove was asked.

### Required disclosures

Every demographic result shows:

1. the distribution among clients who provided an answer;
2. the percentage/count that did not provide an answer;
3. the identified-client coverage represented;
4. the identity-unavailable population excluded from client-level analysis;
5. whether the metric counts unique clients or service encounters.

Preferred plain-language pattern:

> Of clients who provided a response, 42% selected X. The total is likely
> undercounted; 38% did not provide an answer.

### Denominators

- **Client profile distribution:** unique identified clients served in the
  selected range who provided an answer to that question.
- **Participation rate:** unique identified clients served in the range who
  provided an answer ÷ all unique identified clients served in the range who
  were eligible for that question.
- **Encounter distribution:** service encounters carrying an answered
  dimension; must be labeled as encounters because repeat visitors receive
  more weight.
- **Reported people:** sum of reviewed source-reported people measures,
  including resolved special-event aggregates; not distinct individuals.
- **Age group:** derived from birth year under an explicitly documented
  age-at-service or age-as-of-range rule. Full DOB is unavailable by design.

Multi-select dimensions may sum above 100%. Missing/unavailable is never zero.

## WTH operational metric contract

### Confirmed historical meanings

| Tracking label | Meaning | Semantic role | Counts toward operational households served? |
|---|---|---|---|
| Visits / Pantry Shopping Visits | Household shops in the pantry for itself and/or others | Served household by method | Yes |
| Lists / Long Lists | Long shopping list, equivalent in quantity/variety to pantry shopping | Served household by method | Yes |
| Premade Bags | Ready-to-eat/basic bag plus a short-list choice of three additional items | Served household by method | Yes |
| Emergency Bags | Small staple-food bag after regular capacity or during the final 30 minutes | Served household by method | Yes, but outside regular-service capacity |
| Turned Away | Household could not receive service after capacity was reached | Unmet demand | No |
| Camping Gear Requests | Request associated with increased need among unhoused clients | Ancillary service/request | No |
| Time Capacity Was Reached | Time-of-day operational marker | Capacity marker | No |

The regular daily capacity plan currently documented by WTH is:

- pantry shopping: 75 households;
- premade bags: 45 households;
- long lists: 25 households;
- regular-service total: 145 households.

Emergency bags provide service beyond regular capacity or during the closing
window. They do not retroactively increase the regular-service capacity plan.

### Tracking import rules

- Import directly entered metric cells, not workbook Total formulas.
- Treat each imported observation as the initial revision of the same living
  `(service date, metric)` fact used by the native Service Log. `wth_tracking`
  remains provenance, not a separate read-only data tier.
- Permit staff to revise or clear migrated observations in the normal Service
  Log. A native revision supersedes the imported seed without double-counting;
  the original workbook value and cell provenance remain in history.
- Enforce at most one current observation revision for each metric/date across
  all operational sources. Import rollback, restore, or reactivation must never
  displace a later FEED-native correction.
- Recompute operational totals from versioned metric roles.
- Preserve blank as not recorded and explicit zero as zero.
- Compare Tracking with formal household totals only when every regular-method
  field is recorded for that date; report incomplete dates instead of treating
  missing methods as zero.
- Preserve source sheet/cell and metric-vocabulary version.
- Correct known workbook errors at source before the final migration export
  where practical.
- Do not build a permanent arbitrary-workbook parser.

The migration artifact is a WTH-authored long-form CSV:

`FEED Schema Version · Service Date · Metric Key · Metric Label · Value · Value
Type · Unit · Semantic Role · Source Sheet · Source Cell`

## Native FEED Service Log

The native replacement deliberately separates infrequent configuration from
routine data entry.

### Metric configuration

Administrators configure:

- stable metric identity;
- user-facing alias;
- description;
- icon selected from FEED's shared Category/Service icon library;
- value type (`count`, `boolean`, `time_of_day`);
- unit (`households`, `people`, `requests`, `items`, or marker);
- semantic role;
- whether it contributes to an operational total;
- effective start/end dates;
- ordinal position (`1st`, `2nd`, `3rd`, and so on) and active/retired state;
- optional capacity target;
- revision history.

This should follow Inventory's established management pattern: standard table,
Add/Edit dialogs, structured tabs where useful, centralized validation/messages,
and organization-wide shared data. Authentication identity provides audit
attribution, never ownership or filtering.

Definitions with observations are retired, not deleted. A rename preserves the
stable metric when meaning is unchanged; a semantic change creates a successor
definition.

The implemented UX separates routine entry from infrequent configuration:

- **Service Log** is available to every authenticated staff member for routine
  daily entry.
- **Service Metrics** is an administrator-only section at the bottom of
  **Service → Service Log**, beneath the routine-entry cards. It follows the
  Inventory management pattern with the standard data table and Add/Edit dialog
  without introducing a second page or sidebar destination. Metric creation and
  revision use a compact three-step flow: name/description/icon; definition,
  position, and effective dates; then operational-total and daily-entry
  participation. Navigation follows the AI Configuration Back/Next pattern,
  while the first step uses the same searchable, categorized icon grid as the
  Category form. Each step fits the dialog surface without a whole-dialog
  scroll region.
- Successful metric configuration changes refresh the current Service Log
  definitions immediately and merge them with in-progress daily values; staff
  do not reload the page or lose unsaved entry when an administrator changes
  the shared order.
- Each metric's icon is revisioned with its effective-dated definition and is
  shown beside that metric in both administration and daily-entry cards.
- The additive `20260813140000_add_service_metric_icons` migration was applied
  successfully in local testing before the multi-step configuration flow was
  validated against the migrated WTH metric definitions.

William Temple House defaults are installed through an explicit, idempotent
administrator action. They are not a database migration or a universal seed:
another agency can configure its own vocabulary without inheriting WTH labels.
The action creates only missing stable metric keys and never overwrites an
existing organization revision.

### Routine daily entry

Staff see only the configured active fields in stable order. They enter counts,
markers, and times without confronting configuration terminology. The workflow
must provide:

- service date and open/closed status;
- a default **Today** selection resolved in the pantry timezone;
- a prominent weekday-first label (`Thursday, July 9th, 2026`) so historical
  entry never requires staff to infer the day of week from a numeric date;
- previous/next navigation over weekdays enabled in the current Operating Hours
  schedule, plus the established Shadcn calendar picker for historical or
  special-event dates outside that recurring schedule;
- the shared 7d/30d/90d/YTD/All/Custom date-range control for the visualization
  cards introduced in Phase 4, kept independent from the one-day entry date;
- blank versus explicit zero;
- one **Save** action that commits the day without asking staff to manage a
  draft/finalized lifecycle;
- historical Tracking values prepopulated in the same editable controls as
  FEED-native values;
- an append-only correction chain in which an edited value or intentional clear
  supersedes—but does not erase—the migrated workbook revision;
- computed operational total from eligible metric roles;
- capacity progress against the effective plan;
- revision/audit attribution;
- no per-user private log.

The daily-entry sections use a responsive two-column section grid. A section
with one or two configured metrics occupies one half of the page at desktop
width; a section with three or more metrics spans the full page. Metric cards
inside every section render two per row, with a third metric beginning the next
row rather than shrinking all three into a dense three-column layout.

This slice is implemented. Every save appends day and observation revisions;
the current projection remains organization-wide. A blank field remains not
recorded, while an entered zero remains an explicit observation. Closing a day
clears its current observations but preserves their revision history. The
regular 145-household capacity display sums only target-linked shopping, long
list, and premade-bag methods; emergency bags remain served households without
inflating the regular-capacity plan.

## Source overlap and reconciliation

Link2Feed and Tracking overlap strongly, but they are parallel human-authored
records. They are not additive and neither is perfectly error-free.

The reconciliation model is now:

1. Link2Feed supplies the historical formal household/people series.
2. SIMC supplies the current formal series after the reviewed cutover.
3. Tracking/FEED-native observations supply service-method and operational
   detail.
4. The operational served-method sum is compared with, not substituted for,
   the formal household total.
5. Differences are visible by day/period and carry source provenance.
6. Missing formal data stays unavailable even when an operational method sum
   exists.
7. Explicit zero is never treated as missing.

The reviewed SIMC/Tracking comparison covered 26 shared service dates from
June 2 through August 6, 2026. SIMC contained 3,305 Visit IDs. Tracking recorded
3,247 regular-method households and 200 Emergency Bags, for 3,447 operational
services. SIMC was 58 (1.79%) above the regular-method sum, with a mean absolute
daily difference of 4.31; it was 142 below the total after Emergency Bags. This
supports SIMC as formal authority and Tracking as method/emergency detail. It
does not prove that every difference is an Emergency Bag, so FEED does not
manufacture a row-level method classification.

## Unified Add Data experience

Data Management's single entry point is **Add Data**. The classifier
recognizes procurement and service sources, then routes to a source-specific
review/ingestion branch. Full design is in
`docs/data-management/unified-add-data.md`.

The former OFB and Legacy buttons have been removed after achieving functional
and test parity. The Imports table now reads one cross-domain provenance
projection, so Link2Feed, SIMC, WTH Tracking, OFB, and Community Donations are
visible together without merging their underlying fact models.

## Analytics experience

The Analytics order remains:

1. Operations
2. Procurement
3. Service

Initial Service sections should be:

1. **Formal service summary** — authoritative households and reported people.
2. **Service over time** — Link2Feed/SIMC series with source seam and coverage.
3. **Operational method mix** — WTH Tracking/FEED-native household methods.
4. **Capacity and unmet demand** — capacity plan, reach time, turned away, and
   emergency-bag response.
5. **Ancillary needs** — e.g. camping-gear requests, without mixing them into
   food-service totals.
6. **Demographics and needs** — respondent distribution, participation gap,
   geography, languages, dietary considerations, housing, income/assistance,
   and approved identity dimensions.
7. **Reconciliation and coverage** — formal versus operational difference,
   gaps, overlaps, import state, and quality resolutions.

Every visible card must register in the existing Analytics report contract in
the same release. Screen, print/PDF, and CSV use the same data accessor and
definitions. Export manifests include source/import IDs, coverage, metric and
resolution versions, denominator definitions, exclusions, and unavailable
states.

## Tracking → FEED cutover

1. Correct the known workbook source errors and freeze metric definitions for
   migration.
2. Configure the equivalent FEED metric definitions, aliases, roles, units,
   targets, and effective dates.
3. Generate the versioned long-form Tracking export through the WTH exporter.
4. Run a read-only detection/reconciliation preview and compare daily/monthly
   values with the source workbook.
5. Activate the historical import only after discrepancies are resolved or
   explicitly documented.
6. Run two normal pantry service days in parallel: enter the same operational
   observations in FEED and the Sheet, then reconcile.
7. Choose the next service date as the formal cutover once both days match and
   staff confirm the daily-entry UX.
8. Make the Google Sheet read-only and retain it as a historical audit artifact.
9. Enter all later operational metrics only through FEED.

Any later correction to migrated history is an explicit revision/resolution in
FEED; the retired Sheet is not revived as a second live source.

The completed full-workbook exporter check produced 1,114 direct observations
across 318 service dates from October 17, 2023 through August 6, 2026. The
artifact contains 37,469 regular-method households, 806 Emergency Bags, 234
turned-away households, 21 camping-gear requests, and six capacity-reached
times. These are source-domain summaries for import review, not a replacement
for formal Link2Feed/SIMC totals. The exporter derives dates from each
Tuesday–Thursday service-week block: a month beginning Wednesday or Thursday
may start its first row in the prior month, while a month beginning
Friday–Monday starts with the following Tuesday. It does not interpret “Week of
the Month” as the nth occurrence of each weekday, and it does not trust cached
Calendar Dates formula values.

Staff acceptance repeated the documented exporter command against the corrected
workbook and reproduced the same 34-worksheet, 1,114-observation artifact. The
exporter portion of the Tracking migration is therefore accepted.

The first Add Data acceptance attempt exposed a boundary error rather than a
bad export row: a location-qualified shopping-visit source label began in
November 2024, while FEED's configured display alias remained `Visits` for that
period. Source labels are retained as provenance without controlling
canonical validity; effective type, unit, semantic role, active state, and date
coverage still gate the observation. The complete artifact validates against
the actual configured metric revisions after this correction.

The subsequent Add Data review and activation also completed successfully.
All 1,114 observations were new and activated with no unresolved issues or
warnings. The review found 303 dates with complete regular-method observations
and active Link2Feed/SIMC formal data. Across those dates, Tracking's regular
methods were 59 households higher overall, with a mean absolute daily
difference of 4.27. Four dates with incomplete regular-method entry were
excluded rather than treating blanks as zero. This reconciliation remains a
comparison only; operational observations were not added to formal totals.

## Implementation phases

### Phase 0 — Contract and workflow prototype (complete)

- [x] Verify WTH Link2Feed visit and Tracking structures.
- [x] Correct the formal-source versus operational-detail authority model.
- [x] Define the Link2Feed visit allowlist and transformations.
- [x] Define the provisional Link2Feed client destination/allowlist.
- [x] Define demographic participation and denominators.
- [x] Define record kinds and the WTH special-event resolution.
- [x] Define the Tracking → FEED cutover.
- [x] Add a global, read-only Add Data modal and synthetic source fixtures.
- [x] Complete local UX review and incorporate findings.

### Phase 1 — Canonical Service foundation (complete)

- [x] Add formal Service import provenance, source-scoped client identity,
  immutable encounter revisions, and append-only source resolutions.
- [x] Add record-kind validation, deterministic encounter hashing, and a
  configurable non-destructive outlier-review policy.
- [x] Include the Service fact family in sanitized backup/restore as an
  independent foreign-key-closed unit.
- [x] Add client-profile revisions and demographic response persistence,
  including the distinction between an absent source question and a client
  non-answer.
- [x] Add operational metric definition revisions, typed observation revisions,
  effective capacity targets, daily workflow state, and audit attribution.
- [x] Add effective-dated capacity-plan revisions that keep overall formal
  household capacity separate from operational-method targets.
- [x] Add structured quality findings, a restricted safe-detail vocabulary,
  append-only operator decisions, and links to source-meaning resolutions.
- [x] Add the backend classifier registry and read-only header-inspection API;
  source adapters remain pending.
- [x] Add transient staged/streaming jobs, SHA-256 and snapshot no-op detection,
  staged-artifact revalidation, atomic activation, expiry/cancellation cleanup,
  and Service rollback/restore projection logic. Adapters supply normalized
  pending facts in later phases.
- [x] Add a unified durable import-history projection across Procurement and
  Service while excluding transient and pending ingestion state.

### Phase 2 — Link2Feed historical/ongoing adapter (visit slice complete)

- [x] Implement streaming visit ingestion against synthetic and authorized
  private corpora.
- [x] Add demographic, anonymous-coverage, first/returning, and special-event
  validation without retaining Notes or full DOB.
- [x] Add Data Management reconciliation, warnings, required source-resolution
  decisions, cancellation, activation, and no-op outcomes.
- [x] Persist visit-grain encounters plus one latest source-scoped client
  profile per identified client in each artifact, avoiding repeated profile
  rows for every historical visit.
- [x] Keep normalized pending revisions invisible until a short atomic
  activation and exclude pending state from sanitized backup/database counts.
- [ ] Enable client-profile enrichment after a sanitized client export verifies
  the provisional contract.

### Phase 3 — Native Service Log and Tracking migration

- [x] Implement metric configuration with Inventory-derived UX patterns.
- [x] Add shared icon selection and responsive 1–2 versus 3+ metric section
  layouts to Service configuration and daily entry.
- [x] Implement routine daily entry with blank/zero, open/closed, one committed
  Save action, and append-only revision semantics.
- [x] Add an explicit idempotent WTH-default setup action and effective-dated
  metric aliases/capacity plan.
- [x] Build the WTH long-form exporter and migration adapter.
- [x] Apply the Tracking ingestion migration locally and validate the corrected
  full workbook through both exporter and adapter (1,114 observations; no
  duplicate date/metric identities or contract warnings).
- [x] Reconcile and activate all 1,114 historical Tracking observations; the
  accepted review covered 303 formal-overlap dates, reported a +59 regular-
  method difference and 4.27 mean absolute daily difference, and excluded four
  incomplete dates without converting blanks to zero.
- [ ] Run the two-day parallel-entry check, choose the cutover date, and retire
  the Sheet.

### Phase 4 — Service Analytics and export

- Add the Service lens, source seam/coverage, formal totals, operational detail,
  demographics, reconciliation, and report/export parity.

### Phase 5 — SIMC (service export adapter complete)

- [x] Review a representative sanitized service export and establish visit,
  household, person, demographic, response, and revision semantics.
- [x] Reconcile formal SIMC visits with Tracking regular-method and emergency
  observations for the shared sample range.
- [x] Extend the canonical domain with source-scoped people, person-profile
  revisions, encounter membership, composition, event provenance, and safe
  source-recorded time.
- [x] Add `simc_service_visits_v1` to the shared classifier and Add Data adapter
  dispatch without adding a source-choice UI.
- [x] Implement staged review, demographic coverage, member completeness,
  repeat same-day visit warnings, no-op/revision behavior, and atomic activation.
- [x] Verify the complete localhost workflow with the supplied sanitized export:
  3,305 visits, 1,443 households, 2,166 identified people, 4,760 people
  represented, 36 ignored columns, and 21 retained structured warnings were
  reviewed and activated successfully.
- [ ] Integrate versioned Chrome-extension output through the same contract.

### Phase 6 — Advanced client/service analysis

- Distinct identified clients, repeat-service cohorts, demographic change,
  household-size distributions excluding non-household aggregates, and other
  metrics with approved definitions and privacy controls.

## Validation requirements

- Unknown/ambiguous files never reach an importer.
- Extra Link2Feed columns never block detection and never persist values.
- Notes never determine service method.
- Full DOB never persists; derived birth year is reproducible.
- Non-answer variants collapse consistently to `not_provided`.
- The 264 special-event tally contributes to reported people but not typical
  household size or identified-client demographics.
- WTH operational observations never add to formal totals.
- Tracking Total formulas never become canonical observations.
- Blank and explicit zero remain distinct through import, entry, Analytics, and
  export.
- Re-import/revision/rollback/restore never double-count.
- All source seams, gaps, denominators, and unavailable states remain visible.
- Private corpus verification stays outside the repository; automated fixtures
  remain synthetic.

## Remaining source questions

1. What exact headers and snapshot semantics appear in a sanitized Link2Feed
   client export?
2. What exact production import dates should define the configured Link2Feed →
   SIMC Analytics seam after WTH activates its complete exports?
3. Which demographic dimensions and geographic suppression threshold ship in
   the first release?
4. Which formal Link2Feed rows besides the known Thanksgiving record represent
   anonymous aggregates rather than ordinary encounters?
5. Which native operational metrics should be seeded for a generic agency
   versus enabled only in the WTH deployment?
