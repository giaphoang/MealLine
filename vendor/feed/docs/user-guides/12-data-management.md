# Data Management

Data Management is FEED's shared entry point for external records, import
history, portable backups, and recovery tools. Imported records keep their own
source identity instead of becoming Food Items or native Service Log entries.

Open **Information → Data** in the sidebar. The page title remains **Data
Management**.

![Data Management overview with source coverage, data rules, and import history](/help-screenshots/data-management-overview.png)

## Add Data

Select **Add Data**, then drop a CSV into the window or choose one from your
device. FEED identifies the file from its structure; you do not choose or force
a source type.

![Add Data dialog with the CSV drop area before a file is selected](/help-screenshots/add-data-drop.png)

The operational flows recognize:

- unified Oregon Food Bank completed-order exports;
- supported WTH historical procurement ledgers;
- Link2Feed visit exports;
- Service Insights Meal Connect service exports; and
- the canonical CSV produced from WTH's historical Tracking workbook; and
- FEED-formatted LOTTO queue history.

FEED shows the detected source and dataset before continuing. Extra columns
outside an approved Service allowlist are ignored rather than retained. An
unknown or unsupported file stops with guidance instead of guessing.

Staff can import supported procurement files. Link2Feed, SIMC, and WTH Tracking
contain Service and demographic evidence, so those imports require an
administrator. LOTTO queue history is anonymous operational evidence and is a
staff-level import.

## Synchronize And Review LOTTO Queue Data

The **LOTTO Queue Data** card keeps queue operations separate from formal
service counts. An administrator first opens LOTTO's **History** card, selects
**Setup** under **Sync With FEED**, generates a token, and copies the displayed
LOTTO URL and token into FEED's **Configure** dialog. After that, any staff
member can select **Sync now**. Generating another token in LOTTO immediately
invalidates the previous one, so copy the replacement into FEED before
synchronizing.

FEED preserves every synchronized session. A session is included automatically
only when it occurred within one hour of operating hours, all issued tickets
were called, the queue changed from Random to Sequential, and tickets were
appended. Other sessions appear as **Needs review** and are withheld from
Service Analytics. Open **Actions → Classify** to include authentic service or
exclude testing, duplicate, or other activity, and record the reason.

To recover pre-integration history, choose **Add Data** and select the
FEED-formatted LOTTO queue-history CSV. Identical re-imports are safe and create
no duplicate facts. Queue tickets never change visit, household, client, or
people-served totals.

### Review and activate Service data

Service files use an additional review before their facts become active:

1. Select **Validate and Review**.
2. Review the service-date range, encounter or metric counts, ignored columns,
   source coverage, and any structured quality findings.
3. Resolve any interpretation FEED explicitly asks about.
4. Select **Activate Data** when the review says it is ready.

Activation is atomic: reviewed records become available together, or existing
data remains unchanged. Link2Feed and SIMC provide formal visits, households,
people, and demographic response coverage. WTH Tracking provides operational
service-method detail. FEED keeps those roles separate and never adds parallel
household totals together.

Tracking observations become editable Service Log values after activation.
Later staff corrections append FEED revisions without erasing the original
workbook provenance.

## Import Oregon Food Bank Data

The OFB Order CSV Exporter Chrome Extension is required because Primarius does
not provide FEED's unified CSV directly.

### Preparation

Open **Information → Data → Add Data**, then select **Download the exporter**
under the CSV drop area. Extract the ZIP to a folder you can keep, such as
Documents. The package includes the unpacked extension and an illustrated PDF
guide.

In a new Chrome tab, enter `chrome://extensions` in the address bar.

### Install the extension

1. Turn on **Developer mode** in the upper-right corner. The **Load unpacked**
   button appears.
2. Select **Load unpacked**, open the extracted package, and choose the
   `OFB-Order-CSV-Exporter-v2.0.0` folder containing `manifest.json`.
3. Find **OFB Order CSV Exporter 2.0.0** and make sure its switch is on.

Keep the extracted extension folder in place. Moving or deleting it can
disable the extension.

### Export and import OFB data

1. Open **Order History** in Primarius and reload the page if the extension was
   just installed.
2. Choose the Start date and End date, then select **Export unified CSV**.
3. Keep Primarius open until the exporter reports success and downloads the
   CSV.
4. Return to **Information → Data → Add Data** and choose or drop the CSV.
5. Confirm that FEED detected an OFB unified export, then select **Continue**.
6. Select **Import Data** and review the result and any quality warnings.

FEED stores normalized procurement observations and discards the uploaded CSV.
An overlapping export is safe: unchanged orders are skipped, while corrected
source orders become a new revision.

Warnings do not create a correction queue. A warning means FEED found a source
value it could preserve and reconcile safely. A structural error stops the
import and tells you to export the range again.

## Review Import History

The Imports table combines every durable Procurement and Service activation.
It shows:

- source and dataset;
- covered data dates;
- meaningful imported-record counts;
- quality-warning counts;
- active or rolled-back status; and
- when the import completed.

Open a row's **Actions** menu and choose **View Details** for domain-specific
counts and provenance. Temporary uploads, cancelled reviews, and Service data
that was prepared but never activated do not appear in this history.

## Roll Back Or Restore An Import

Administrators can use **Rollback** when an active import should stop
contributing its revisions. Rollback preserves the audit trail and recomputes
the newest remaining active facts.

Use **Restore Import** to make a rolled-back import eligible again. A later
native Service Log correction remains authoritative and is not displaced by
rolling an older Tracking import backward or forward.

The table supports individual actions and bulk rollback or restore. Procurement
rows also offer **Shape Data**, because procurement rules can change how an
import contributes to Analytics without changing its source records.

## Keep Procurement Current

FEED flags procurement data when the latest active receiving date is more than
30 calendar days old. Import a current completed-orders export before relying
on recent trends. The reminder is a freshness prompt, not a score or criticism
of staff work.

## The Data And Database Tabs

**Data** opens by default and contains procurement coverage, freshness, data
rules, Add Data, publishing controls, and the unified import history. **Database** appears for
administrators and contains the portable backup, restore, reset, and database
summary tools.

### Clean up unused brand images

Administrators can use **Data → Brand Asset Storage → Run Storage Check** to
find Appearance images that no saved configuration references. The check does
not change anything. If unused assets are found, **Clean Up Assets** opens a
confirmation before permanently removing them from the database.

An upload made within the last hour is reported but protected from cleanup.
This keeps an image safe while another administrator still has the Appearance
wizard open. Active and draft appearances are checked together; an image used
by either is never offered for cleanup. The cleanup is recorded in Admin →
History.

## Download A Backup

Select **Database → Download Backup** to save a sanitized JSON copy of approved
organization data. The current format includes Inventory, translations,
shopping-list templates, Procurement, Service imports, Service Log history,
LOTTO queue facts, classifications, and synchronization-run history, Operating
Hours, the staff roster, and non-secret configuration. Restored roster accounts
return as Staff; the administrator performing the restore keeps Administrator.
LOTTO URLs, connection credentials, cursor state, and encryption keys are not
included.

The portable file excludes uploaded documents, sign-in tokens, security audit
history, encryption material, and AI provider keys. It is not a replacement for
the server's disaster-recovery snapshot. Keep it private because it still
contains organization data.

## Restore A Backup

Select **Restore Backup** and choose a JSON file created by FEED. FEED validates
the file and shows the available restore units before anything changes. You can
restore the complete artifact or a compatible subset such as Inventory,
translations, Shopping Lists, Procurement, Service, or configuration.
The staff roster is a separate selectable unit.

The confirmation step names what will be replaced and, where it applies, what
else will be cleared. Some records point at the records being replaced — a
translation's usage history, for example — and cannot be carried across, because
the identifiers they refer to are reassigned from the backup file. FEED lists
those by name rather than removing them quietly. They rebuild through normal use
and were never part of a backup file.

After confirmation, FEED builds and validates the replacement alongside the
current database, enters maintenance mode only for the final swap, and restarts.
A failed preparation leaves the current data untouched. Restored AI settings do
not include provider keys; those secrets must be entered again.

LOTTO history is never rolled backward by a Service restore. FEED keeps the
union of sessions in the backup and newer sessions already stored locally,
because LOTTO may no longer retain an older service day. The current LOTTO
connection and synchronization position remain in place.

## Reset To A Clean Slate

**Reset to Clean Slate** deletes the pantry's working data and starts from a
fresh seeded state. It is administrator-only, asks for explicit confirmation,
and cannot be undone from inside FEED. Download a backup first.

## What To Read Next

- To understand procurement visualizations, read [Inventory Analytics](04-inventory-reports.md#read-procurement-analytics).
- To record or correct operational service details, read [Service Log](15-service-log.md).
- To manage Food Items and availability, read [Inventory](03-inventory.md).
