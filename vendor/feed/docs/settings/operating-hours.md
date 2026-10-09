# Organization Operating Hours

**Status:** Implemented for the Availability & Service Pressure pilot.

## Why FEED needs this setting

Calendar time is not the same as pantry service time. William Temple House is
normally open to clients Tuesday through Thursday from 11:00 a.m. to 2:00
p.m. Availability recorded overnight, on delivery days, or on weekends should
not dilute a service-availability measure.

Operating Hours is organization configuration. Every authenticated FEED user
sees and changes the same schedule. It is not a user preference and must never
be scoped by account.

## LOTTO behavior reviewed

The implementation was adapted from LOTTO's Admin operating-hours workflow:

- seven explicit weekday rows;
- an Open checkbox for each day;
- opening and closing time inputs on open days;
- retained time values while a day is closed;
- one IANA timezone selection;
- a confirmation when the device timezone differs from the organization
  timezone.

LOTTO persists this inside its monolithic raffle-state document. FEED uses a
dedicated append-only revision ledger because historical analytics must retain
the schedule that governed each service date. FEED also hardens the
server-side contract: all seven days are required, times must be exact 24-hour
`HH:mm` values, and an open day's closing time must be later than its opening
time. The corresponding LOTTO validation gap is recorded in LOTTO
`docs/ISSUES.md` Issue 28 for later correction.

## FEED data and API contract

`OperatingHoursRevision` is an organization-wide append-only ledger:

- `effectiveDate` — local calendar date on which the revision begins;
- `timezone` — validated IANA timezone;
- `hours` — strict seven-day JSON schedule;
- `revisionKind` — migration baseline or staff update;
- `recordedAt` — immutable server timestamp.

The migration converts the prior singleton into a baseline effective
`1970-01-01`, so existing operational history keeps the schedule that was
already configured. A new installation defaults to `America/Los_Angeles`,
Tuesday–Thursday, 11:00–14:00. Closed days retain the same time values so staff
can reopen a day without recreating its hours.

Saving a real change appends a revision effective on the pantry's current
local calendar date. Multiple corrections made on the same date are all
retained; the last recorded correction governs that entire date. Submitting an
unchanged schedule does not create an event. The first release intentionally
does not offer future scheduling or retroactive editing, keeping routine use as
simple as the prior singleton workflow while preserving history automatically.

Authenticated endpoints:

- `GET /api/settings/operating-hours`
- `PUT /api/settings/operating-hours`

The backend is the data-integrity boundary. Native time inputs improve the UI
but are not trusted as validation.

## FEED page pattern

Settings appears under **Information** in the sidebar and uses the standard
FEED page shell, breadcrumbs, `SectionHeader`, semantic sections, Shadcn
Checkbox, Input, Select, Separator, AlertDialog, centralized error handling,
and animated Lucide save action. The Operating Hours section is intentionally
narrow enough for comfortable schedule editing and stacks each day cleanly at
phone width.

Settings is intended to grow as organization-level configuration becomes
necessary. New settings should use existing FEED patterns and should not turn
this page into an unrelated collection of user preferences.

Service Metrics belongs to the Service workflow rather than general Settings.
Administrators configure those organization-wide fields at the bottom of the
Service Log page, directly beneath the routine-entry workspace. Staff without
administrator authority do not see the configuration section, and the server
continues to enforce the privileged writes.

## Recorded service-hour assortment

Analytics resolves its date range using the configured pantry timezone. For
each open date, analytics constructs the local opening and closing instants,
converts them to UTC with DST-aware IANA timezone handling, and intersects the
result with the selected range and report `dataAsOf` time.

Each item's recorded state is integrated across the resulting service-window
segments. For example, an item recorded available from 11:00 until 1:00 and
unavailable from 1:00 until 2:00 contributes 120 available item-minutes across
the 180-minute window. Monday, Friday, weekends, pre-baseline time, and future
time contribute nothing under the default schedule.

The daily available-assortment value is:

`available item-minutes / observed service minutes`

The combined range average uses the same weighting across all observed service
minutes. Category values are calculated from their own available item-minutes
and sum to the combined value; FEED does not compare or sum optional quantity
annotations.

The daily timeline exposes service minutes and the underlying item-minute
values in CSV. A fractional result means availability changed during the
service window; it is not a fractional item or a quantity estimate. Current
Available, Unavailable, and Limited Supply counts remain literal snapshot
counts. Availability transitions, unavailable episodes, and restoration
durations retain their actual timestamps even when staff update inventory
outside service hours.

## Historical interpretation

Analytics loads the final revision in force on each local service date. A schedule
change therefore affects today and later dates without reinterpreting earlier
history. The result and summary CSV identify every applied revision, effective
date, timezone, and recorded timestamp so an exported result remains
explainable.

The current UI deliberately models recurring weekly hours, not holiday or
one-off closures. If those exceptions become operationally important, add an
explicit dated-closure model rather than editing the recurring schedule and
silently treating the exception as a permanent revision.
