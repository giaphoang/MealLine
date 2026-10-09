# Settings

Settings holds the pantry's recurring service schedule, which applies to
everyone using FEED, and your own Appearance choice, which does not.

## Open Operating Hours

Open **Tools & Settings → Settings** in the sidebar. The Operating Hours section shows
all seven days and the pantry timezone.

![Settings page with Operating Hours and Appearance controls](/help-screenshots/settings-overview.png)

## Update The Weekly Schedule

1. Check each day when the pantry is open to clients.
2. Set the opening and closing time for every open day.
3. Choose the timezone where pantry service takes place.
4. Select **Save Operating Hours**.

![Recurring Operating Hours schedule with open days, opening times, and closing times](/help-screenshots/settings-operating-hours.png)

The change takes effect on the pantry's current local date. FEED remembers
earlier schedules automatically, so a later change does not rewrite past
analytics. If you correct the schedule more than once on the same day, the final
version applies to that whole day.

Closing a day does not erase its saved times. If you reopen it later, the
previous opening and closing times return.

If your device is in a different timezone, FEED asks you to confirm before
saving. Choose the pantry's timezone, not the location of a staff member who
may be working remotely.

## Choose How FEED Looks

The **Appearance** section offers *Light*, *Dark*, and *Follow this device*.
Unlike Operating Hours, this one is yours alone: it is saved in your browser
rather than shared, so each staff member can read FEED the way that suits them.

The button in the top bar is the shortcut — one press switches between light and
dark. Setting it back to whatever your computer already uses returns FEED to
following your computer.

## Customize The Organization

Administrators also see **Organization customization** on the Appearance tab.
This setting is shared by everyone, unlike your personal Light/Dark/System
choice.

Select **Set up appearance** or **New appearance**. The guided workflow has
seven steps:

1. choose the William Temple House or St. Johns Food Share example, or start
   from scratch, and give the saved configuration a short name;
2. enter the organization and app identity; optionally enable the organization's
   own singular/plural words for pantry and client plus its service department;
3. upload separate light- and dark-surface logos and one square app mark;
4. choose the color story and review the accessible Tailwind family match and
   its closest alternatives in light and dark;
5. write the sign-in heading, staff guidance, and email placeholder;
6. choose whether the public inventory page is available; and
7. review the result.

The square app mark must be square or nearly square. FEED normalizes uploaded
PNG, JPEG, WebP, and SVG files into inert PNG records and makes the 64, 192, and
512 pixel icon sizes automatically. Files must be 4 MB or smaller.

At Review, choose **Save draft** to keep the configuration without changing the
live app. Choose **Preview in this browser** to walk through the real app with
the draft until the browser session ends or you select **Stop previewing**.
Choose **Save & activate** when it is ready for everyone.

An inactive draft can be edited, activated, or deleted. To return to the
compiled William Temple House identity, select **Use built-in appearance**.
That keeps every saved draft available.

Organization terminology changes display copy only. It never renames database
fields or changes calculations. **Household**, **visit**, and **person served**
always retain the definitions used by Analytics. Inventory status colors also
keep the same operational meaning under every organization appearance.

## How Analytics Uses The Schedule

Availability analytics compares inventory states only during the hours when the
pantry is serving clients. Under a Tuesday–Thursday schedule, Monday, Friday,
and weekends do not lower the historical availability result.

An item available for two hours of a three-hour service day contributes two
available hours. Current **Available Now**, **Unavailable Now**, and **Limited
Supply** counts remain current inventory facts regardless of the schedule.

Operating Hours is a recurring weekly schedule. It does not yet record holiday
closures or other one-day exceptions.

## What To Read Next

- To record a pantry day or configure its fields, read [Service Log](15-service-log.md).
- To understand availability history, read [Inventory Analytics](04-inventory-reports.md).
- To update Food Item status and limits, read [Inventory](03-inventory.md).
