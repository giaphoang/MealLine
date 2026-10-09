# Service Log

Service Log records the operational details of each pantry service day. The
log is shared: everyone using FEED sees the same current entry and revision
history.

## Choose A Service Day

Open **Service → Service Log**. FEED starts on **Today** in the pantry's
configured timezone.

Use the left and right arrows to move between the weekdays enabled under
Operating Hours. For example, a Tuesday-through-Thursday schedule moves from
Thursday back to Wednesday, or forward to the following Tuesday when needed.

The selected date includes its weekday and full calendar date. Select it to
open the calendar. The calendar can choose a different past date even when it
falls outside the recurring schedule, such as a special food-distribution
event.

![Service Log with the service-date control and configured daily metric cards](/help-screenshots/service-log-day.png)

## Record The Day

1. Choose whether the pantry was **Open** or **Closed**.
2. Enter the available service, capacity, demand, and other operational fields.
3. Select **Save**.

A blank field means the value was not recorded. Entering `0` means staff
explicitly recorded that none occurred. Marking the pantry closed clears the
current values for that day while preserving the revision history.

Values imported from the historical WTH Tracking workbook are ordinary,
editable Service Log values after activation. Correcting or clearing one adds a
new FEED revision while preserving the original workbook source information.

## Choose A Visualization Range

The **Date Range** buttons reserve the range for Service visualization cards,
which are not yet part of this beta. Choose **7d**, **30d**, **90d**, **YTD**,
**All**, or **Custom range**. This control does not change the Service Date or
the daily entry being edited.

## Configure Service Metrics

Administrators can manage **Service Metrics** beneath the daily Service Log.
These definitions determine which fields staff see when recording a day.

Select **Add Metric** to configure another field, or use a row's **Actions**
menu to edit an existing definition. Staff can use configured metrics but
cannot change the organization-wide definitions.

![Add Service Metric dialog with display fields and the searchable icon selection grid](/help-screenshots/service-log-metric-dialog.png)

The three steps cover:

1. Display name, description, and icon.
2. Classification, value type, unit, position, and effective dates.
3. Whether the metric contributes to the operational household total and is
   available for daily entry.

Choose the metric's **Position** as `1st`, `2nd`, `3rd`, and so on. Moving a
metric updates the shared Service Log order automatically; staff never need to
manage numerical sort values. Saved metric changes appear immediately on the
open Service Log without a page refresh, while unsaved daily-entry values remain
in place.

The Service cards adapt to the configured metrics. A section with one or two
metrics shares a row with another section; a larger section expands to the full
page and places two metric cards per row. Input controls remain aligned along
the bottom when names or descriptions wrap.

## What To Read Next

- To change the recurring pantry schedule, read [Settings](11-settings.md).
- To import formal service history or operational tracking, read [Data Management](12-data-management.md).
