# Fresh Alliance Pending Pickups

**Date:** 2026-07-21
**Status:** Investigation complete; FEED schema executed; extension work deferred
**Purpose:** Record what a live, read-only investigation of the Primarius Agency
Pickups portal established about the "Pending" review queue, why it explains
the Fresh Alliance reporting lag documented in
[fresh-alliance-coverage-verification.md](fresh-alliance-coverage-verification.md),
and what that means for FEED and for the OFB Data Fetch Plugin extension.

This record exists so that a future session — potentially a different model,
starting cold, in the extension's own repository — does not have to re-derive
any of this from scratch. Cite it rather than re-investigating, unless the
Primarius portal's behavior has since changed.

## Why this investigation happened

The coverage-verification record noted that the full-history Fresh Alliance
export stopped at 2026-06-30 despite being pulled on 2026-07-20, and flagged
the cause as unconfirmed. The agency confirmed the pickups happened; the
question was why they were invisible to both OFB exports. A live, read-only
session against `ofb.primarius.app` (production, authenticated by the agency,
explicitly treated as read-only for the duration) answered it directly.

## What was found

Agency Pickups has two tabs: **Pending** and **Completed**. Both are backed by
sibling AJAX endpoints:

- `GET /PWW/AgencyPickup/GetIndexDataAgencyPickup_Pending`
- `GET /PWW/AgencyPickup/GetIndexDataAgencyPickup_Completed`

At the time of investigation, Pending held **13 records**, spanning
2026-07-02 through 2026-07-21 (the day of investigation) — precisely the gap
in the export. Completed held **826 records**, matching the full-history
export exactly.

### Pending and Completed are the same records, not two record sets

The `Id` (Primarius's internal record id) and `ReferenceCode` (the
`NNNNNNNAGPCKUP` reference FEED already treats as the stable event identity)
form **one continuous, non-overlapping numeric sequence** across both tabs:

| | `Id` | `ReferenceCode` | `ExpectedDate` |
| --- | --- | --- | --- |
| Most recent Completed | 461910 | 1171829AGPCKUP | 2026-06-30 |
| Oldest Pending | 462179 | 1172093AGPCKUP | 2026-07-02 |
| Newest Pending | 464109 | 1173998AGPCKUP | 2026-07-21 |

No gap, no separate id pool. Directly confirmed exclusivity by filtering the
Completed endpoint for the newest Pending reference (`1173998AGPCKUP`):
zero results. A record lives in exactly one tab at a time; moving from
Pending to Completed flips a flag on the existing row, it does not create a
new one.

**This resolves the duplication question that motivated the investigation.**
FEED's Fresh Alliance revision model already keys on `ReferenceCode`
(`sourcePickupReference`). Importing a pickup while Pending, then again once
it graduates to Completed, produces a **new revision of the same event** —
exactly the mechanism already built for correcting any Fresh Alliance import.
No new deduplication logic is required.

### The confirmation gate and its fields

Every Pending row carries `SystemReceived: false`, `ConfirmedDate: null`,
`SystemReceivedDate: null`. Every Completed row carries `SystemReceived: true`
and both dates populated. This is a **per-pickup** flag, not per line — if the
pickup is pending, none of its lines have been reviewed yet.

`SystemReceived` is not a new discovery in isolation: the OFB Data Fetch
Plugin's existing `normalizeCompletedPickups` function already reads and
gates on this exact field (`if (row?.SystemReceived === false ...) throw`).
The extension has always known about this flag — it just uses it to exclude
Pending, by design, not by oversight.

### Detail line semantics: Requested vs. Received

Fetched detail lines for a live Pending pickup (Trader Joe's, submitted the
day of investigation) and compared against a just-completed one:

| | Pending | Completed |
| --- | --- | --- |
| `RequestedWeight` / `RequestedQuantity` | populated (staff-entered, e.g. 25, 50, 28...) | populated |
| `ReceivedWeight` / `ReceivedQuantity` | **0** | equal to Requested |
| `ReceivedDate` | `null` | populated |

Two things worth being precise about, because an earlier pass over this
finding conflated them:

- **`RequestedWeight` is always meaningful, at any status, including as a
  legitimate `0`.** The agency confirmed this directly: some pickups only
  yield certain categories (e.g. a Fred Meyer pickup might be dairy and
  frozen only), and the other categories are correctly `0` because nothing of
  that category was collected. `0` here is a fact about the pickup, not an
  artifact of pending status.
- **`ReceivedWeight` is `0` on every line of every Pending pickup, always,
  because the pickup has not been reviewed at all** — this is a per-pickup
  gate (`SystemReceived`), not a per-line judgment. It has nothing to do with
  whether a category was actually collected.

**Decision: do not blank or reshape either field.** An earlier draft of this
finding proposed representing a pending `ReceivedWeight` as blank rather than
the literal `0` Primarius reports, reasoning that `0` "reads as nothing was
picked up." That reasoning doesn't survive contact with the rest of the
schema: FEED already has a working pattern for exactly this ambiguity —
`hasDonorValuation` sits next to a real (possibly `0`) rate rather than
nulling the rate out. The same pattern applies here: report Primarius's
actual value, and add an explicit status field (`isConfirmed`) that tells the
reader what the value means. Reshaping the number would be FEED asserting an
interpretation instead of reporting what the source said — the same category
of mistake the project already guards against everywhere else (see AGENTS.md
"never infer, never manufacture").

Historically, across the full 3,933-row Completed corpus, `ReceivedWeight`
equals `RequestedWeight` on every single row — OFB's confirmation step
appears to ratify the agency-submitted numbers rather than independently
re-verify them. That makes a Pending pickup's requested weight a reliable
preview of its eventual confirmed value, empirically, 100% of the time so
far — but it is a pattern, not a guarantee, and the schema must not treat it
as one.

### Why Warehouse orders do not get the same treatment

Order History has an analogous "Active" / "Complete" split. Checked it
directly: at the time of investigation, Active held one order,
`Status: DataEntry`, with grid columns `Released / Picked / Confirmed`.

This is a materially different situation from Fresh Alliance Pending:

- A Fresh Alliance Pending pickup represents something that **already
  happened** — the agency physically collected and weighed real donated
  goods before OFB ever sees the record. OFB's review is a downstream
  paperwork step on an observation the agency already made in full.
- A Warehouse Active order represents an **intention** — possibly not even
  submitted yet (`DataEntry` reads as draft/cart state) — that then goes
  through OFB's own multi-stage fulfillment pipeline (Released, Picked,
  Confirmed), where the agency is the requester and OFB is the fulfilling
  party. Quantities can and do legitimately change between request and
  fulfillment: an item may be unavailable in the requested quantity,
  substituted, or reduced. There is no physical act by agency staff backing
  an Active order the way there is for a Fresh Alliance pickup.

Importing Warehouse Active/Pending data would mean importing a request, not
an observation — exactly the category error FEED's operational-analytics
principles already prohibit ("never infer... record only what was actually
observed"). Fresh Alliance Pending does not have this problem, because the
agency's own report already is the observation.

**Decision: OFB Warehouse orders remain Completed-only, permanently and
without reconsideration absent new evidence.** Fresh Alliance pickups should
include both Pending and Completed. This is not a temporary compromise — it
follows from a real difference in who is the authoritative observer for each
channel.

## What this means for FEED

See [procurement-unification-plan.md](procurement-unification-plan.md) D13
for the settled decision record, and Phase 6 for status. Summary:

- New field `isConfirmed` on `ProcurementOrderRevision` (Fresh Alliance
  revisions only; always `null` for OFB Warehouse, where the concept does not
  apply). Sourced directly from Primarius's own `SystemReceived` flag —
  reported, not inferred.
- The **existing** 19-column Agency Pickups contract only ever carries
  Completed data (the extension's own validation already guarantees this), so
  every pickup parsed through today's contract is confirmed by construction.
  The schema change executed now sets `isConfirmed: true` unconditionally at
  parse time and persists it — additive, backward compatible, changes no
  currently observed behavior.
- No change to the revision, rollback, restore, or supersede machinery.
  Those already treat any changed snapshot — including a pending-to-confirmed
  transition — as a new revision of the same event, which is exactly correct
  here without having been designed for this case specifically.
- No change to Analytics query or output in this pass. Once the extension
  can actually produce unconfirmed rows, Analytics needs a deliberate
  decision — noted but not made — on how pending weight is treated in
  headline totals versus surfaced separately. That decision belongs to the
  agency, not to whichever session happens to be doing the schema work.

## What this means for the OFB Data Fetch Plugin extension

Full technical specification for a future implementation session lives in the
extension'''s own repository, not this one — a future session should start
there directly rather than through FEED:
`OFB Data Fetch Plugin/docs/unified-export-design.md`
(local path on this machine at time of writing:
`/Users/russbook/Documents/OFB Data Fetch Plugin/docs/unified-export-design.md`).
That document is self-contained and does not assume access to this repository.

The short version: the unified v2 export pulls Completed Orders (Warehouse,
unchanged), Agency Pickups Completed (Fresh Alliance, unchanged), and Agency
Pickups **Pending** (Fresh Alliance, new) into one file, with a new explicit
`Confirmed` column carrying `SystemReceived` through so FEED's parser can
read status as a stated fact rather than an inferred one. Warehouse gets no
equivalent change.
