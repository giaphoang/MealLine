# Release Notes

## Version 1.8.1 — 2026-09-14

**The top navigation banner has its frosted glass back in Chrome.** Content
scrolling behind the breadcrumbs is softly blurred, as it is in Safari and
behind the Analytics date controls. The correction also restores the shared
sidebar and panel blur in Chrome, in both light and dark themes.

## Version 1.8.0 — 2026-09-14

**The refreshed AI model support is now released.** FEED's updated model
catalogue, provider SDKs, thinking controls, language coverage and model-expiry
warnings are included, together with clearer provider errors and more accurate
spending records. This release also moves the server to Node 24.

**Fable can now classify document text.** FEED asks it for classifications in
the form that Fable accepts, and checks that every segment has a usable answer.

**Failed answers still count as spending.** Google batch translations and
document classifications now record the tokens charged for an answer that is
cut short or cannot be read. Claude classification batches also retain the
cost of completed work when another batch fails.

The development release checks include Fable classification, a Spanish document,
an Arabic shopping list, a longer document and a 40-item translation retry.
This version includes the catalogue changes described below.

## Version 1.8.0-beta.2 — 2026-09-12, included in 1.8.0

*The AI model catalogue, brought up to date. FEED's list of models was written
in 2024 and several of them no longer exist.*

**FEED now tells you when a model is running out of time.** The AI
Configuration list shows a saved configuration's expiry beside its status, and
says what to move to. This matters right now: FEED runs GPT-5 Mini, and OpenAI
shuts that model down on **11 December 2026**. Until now the list said
"Active" and nothing more, and the first sign of trouble would have been a
translation failing with a message about the provider rather than about the
model. Choosing a model in the Add or Edit dialog gives you the same warning
before you save.

**New models to choose from, and the withdrawn ones no longer offered.** The
2026 families from all three providers are available — Gemini 3.5 Flash Lite,
3.6 Flash, 3.8 Flash and 3.1 Pro; GPT-5.6 Luna, Terra and Sol, and GPT-6
Astra; Claude Sonnet 5, Opus 5 and Fable 5.1. Older models are no longer in
the list for new configurations, but nothing that already uses one has been
changed or switched off.

**New configurations no longer start out pointed at a model Google refuses.**
The default was Gemini 2.5 Flash Lite, which Google will not serve to new
projects — the failure this whole piece of work was reported for. Every
configuration created since that change began started out broken. The default
is now Gemini 3.5 Flash Lite.

**Two settings that quietly cost money have been corrected.** Thinking Level
started every new configuration at "high" — the most expensive setting — and
any existing configuration that had never had one set would adopt it the next
time you saved. It now starts at the cheapest level each model allows. And a
model that is far more powerful than translating a food label requires is
marked as expensive when you pick it.

**A cost limit that FEED cannot enforce is now refused instead of accepted.**
Spend is measured as tokens multiplied by price, so a configuration with no
prices recorded no spend at all — and a daily or monthly limit set on one
would never have stopped anything, however small. FEED now explains this when
you set the limit, rather than saving a cap that does nothing. Leaving prices
empty is still fine if you do not want cost tracking.

**The dashboard no longer shows numbers it made up.** Rate limits, average
response times and a week of usage history were being filled in with invented
figures whenever the real ones were unavailable — in one case with random
numbers that changed on every refresh. Where FEED does not have a figure it
now says so.

**Smaller fixes.** The Types filter on AI Configuration listed categories and
food items, which belong to Translation Management; it now offers API Key and
System Prompt, and actually filters. Anthropic's recorded spend is calculated
from the token counts Anthropic reports rather than from an estimate. Language
support is recorded per model, so an enabled language a model cannot serve is
flagged where you choose it instead of failing mid-translation. Saving or
activating a model now checks the account can actually use it.

Behind all of this, FEED's model information now lives in one place on the
server instead of two copies that had drifted apart, alongside several older
lists that still named models FEED no longer uses. Bringing them together is
what allowed the errors above to be found.

## Version 1.7.5 — 2026-09-11, deployed 2026-09-14

*Everything in 1.7.5-rc.1, which has been running since September 5th, plus
two fixes.*

**When translation stops, FEED now says why.** If the AI provider refuses the
model FEED is set to use, the message names that model and says an
administrator needs to change it in AI Configuration. Providers do withdraw
models, and some are no longer offered to newer accounts. Until now every kind
of failure — including one where the API key was perfectly good — was reported
as "Invalid API key configuration", which sent people looking for a problem
that was not there. An account that has run out of credit, and a key or model
the provider rejects, now also raise an alert for administrators: once, rather
than once per language.

**Checking the AI connection no longer spends your tokens.** FEED used to
confirm the connection by asking the provider to write something before each
translation job. It now asks about the model directly, which costs nothing.

**The header bar is frosted glass again in light mode.** Page content scrolling
underneath was showing through it rather than being softened behind it.

## Version 1.7.5-rc.1 — 2026-09-05, in production

*Release candidate — everything since 1.6.0, which is what FEED has been
running since August 24th.*

**FEED can now wear another pantry's identity.** An administrator can open
Settings → Appearance and set the organization's name and copy, its logos and
app mark, its colours, the sign-in wording, whether the public inventory feed is
published, and local terminology — food share instead of food pantry, neighbour
instead of client. A configuration can stay a draft, be previewed in your own
browser only, or become the appearance every staff member sees. Returning to
the built-in William Temple House presentation takes one action and does not
delete your drafts.

The identity carries beyond the app: sign-in email, analytics and operational
PDFs, report manifests, the public inventory, and shopping-list PDF details all
use the active organization. Printed output stays on a light paper theme even
when the person generating it is working in dark mode. Terminology changes
wording only, never figures — household, visit, and person served keep their
names because they identify distinct counts.

**Colours are chosen for you, and checked.** FEED derives a full accessible
light and dark palette from a short colour story rather than asking anyone to
pick token by token, and it rotates the existing chart palette toward the brand
instead of inventing chart colours nobody has checked. Inventory statuses keep
the same green, amber, red and grey meanings under every brand. A brand with no
colour in it — a grayscale identity — is supported and proved to the same
contrast standard.

**FEED works on the older iPads again.** Every configured appearance rendered
with missing card, popover and dialog backgrounds on iPadOS 15, and dark-mode
shadows came out violet. Both are fixed.

**Reports print in black and white as well as colour.** Every report archive now
contains two PDFs. The colour one is unchanged; the black-and-white one is built
so the series are told apart by lightness and, past six series, by texture — so
a report run off on a mono printer or photocopied is still readable. Line charts
use dashes rather than greys, and legends match what the chart actually draws.
Stacked bars now print each segment's own value, not just the total.

**Backup is now genuinely the recovery artifact.** A backup would not restore
onto a fresh instance — the one situation a backup exists for — and a real
production-sized file could not even be uploaded, because the web server
rejected it before FEED saw it. Both are fixed and rehearsed against a 152 MB
copy of real production data. On a brand-new instance the first person to sign
in now becomes an administrator, so whoever is recovering can actually reach
Restore.

Restoring is also safer to read: references a backup cannot carry are cleared
rather than aborting the whole restore, the dialog says what will be lost before
you accept, a restore that fails now records that it failed instead of recording
success, and a restored AI model arrives switched off and cannot be switched on
until its key is entered.

**Error messages say what happened.** "Report it at…" is now a link you can tap
rather than a web address to copy off a toast, and it points at the project's
issue tracker while saying plainly that posting there needs a free GitHub
account. A depleted AI provider account no longer reads as "try again in a
minute", a model your key cannot call is named as a configuration problem
instead of an outage, and a gateway error page can no longer be dumped into a
dialog with a Ray ID and your own IP address in it.

**Also in this candidate**, from 1.6.5, which never reached production: filter,
search and dropdown fields are solid rather than transparent across the whole
app; Service Analytics gained daily LOTTO queue-volume and call-milestone
charts; Queue Timing became Queue Statistics; Data Management summarizes SIMC,
Link2Feed and LOTTO alongside procurement; and identical page-load failures
raise one toast instead of several.

**After this update, reload the page once.** A tab left open from the previous
version can mis-draw the Service screen until it is refreshed.

## Version 1.7.5-beta.2 — 2026-08-28, not deployed

*Beta — sharper, safer brand assets and a more complete appearance workflow.*

**Uploaded logos now keep the quality of the source file.** Safe SVG artwork
stays vector instead of being flattened into a small PNG, while scripts,
external references, embedded media, and other active content are removed.
PNG artwork keeps its original dimensions, and Appearance warns when a raster
image is too small for a crisp high-density logo or app mark.

**Branding follows the active light or dark theme everywhere.** Dashboard and
sign-in surfaces now select the matching logo, including when FEED follows the
device theme. The built-in William Temple House appearance also retains its
hand-tuned colors, gradients, shadows, and outlined browser-tab mark.

**Administrators can clean up abandoned brand uploads.** Data Management's
Data tab now includes Brand Asset Storage, which identifies images unused by
every saved appearance and removes eligible orphans while protecting recent
uploads from an open Appearance wizard. Inventory publishing also moved to
Data Management because it is a data-sharing decision rather than a branding
choice.

## Version 1.7.5-beta.1 — 2026-08-27, not deployed

*Beta — organization customization and the completed brand-alignment roadmap.*

**FEED can now adopt another food pantry's identity without a rebuild.** An
administrator can open Settings → Appearance and work through organization
name and copy, logos, app mark, accessible colors, sign-in language, public
inventory availability, and local pantry/client terminology. A configuration
can stay a draft, be previewed only in the current browser session, or become
the shared appearance every staff member sees. Returning to the built-in
William Temple House presentation takes one action and does not delete drafts.

**The system carries the identity beyond the app shell.** Authentication email,
analytics and operational PDFs, report manifests, public inventory, and
shopping-list PDF metadata now use the active organization. Print remains a
light paper theme even when the person generating it uses dark mode.

**Terminology changes presentation, never facts.** An organization may say food
share instead of food pantry, neighbor instead of client, and use its own
department name. Household, visit, and person served remain fixed because those
words identify distinct analytic counts.

**The color engine is now OKLCH-native.** FEED derives a complete accessible
light/dark token set from a small color story and rotates the existing Carbon
chart palette toward the brand rather than inventing unverified chart colors.
Inventory statuses retain the same green, amber, red, and gray meanings under
every brand. The database-backed configuration and normalized image assets are
included in portable backups.

## Version 1.6.5 — 2026-08-26, not deployed

*Everything since 1.6.0, plus a consistency pass over the controls staff touch
most.*

**Filter and search fields are solid now.** Every filter box, search field, and
dropdown used to be transparent, so each one took the colour of whatever sat
behind it — the page background on one screen, a card on another, a dialog on a
third. The same control looked different on every page and had almost no edge
against the background. They now carry their own fill and match the `Columns`
button beside them. This covers Category, Food Item, Language, Translation and
Reports Management, the Service Log, Shopping Lists, Document Translator, AI
Configuration, Settings, Data Management, Help, and the Analytics detail tables.

**LOTTO queue work from 1.6.0 continues.** Service Analytics gained daily
queue-volume and call-milestone charts, Queue Timing became Queue Statistics
with initial-batch and per-day ticket figures, and portable backups now carry
the staff roster and LOTTO synchronization provenance. Data Management
summarizes current SIMC visits, Link2Feed visits, and LOTTO queue sessions
beside procurement coverage.

**Fixes.** Call Milestones tooltips follow the chart's visible line order. A
rolling deployment where the frontend is newer than the backend no longer
crashes the Service lens. LOTTO closeouts backed by Postgres no longer fail the
contract check on their clock format. Identical page-load failures now raise one
toast instead of several.

## Version 1.6.0 — production acceptance pending

**LOTTO queue operations now reach Service Analytics without becoming service
counts.** LOTTO v1.21.0 records immutable daily closeouts with anonymous ticket
issue and first-call times. Staff can synchronize those closeouts, import the
preserved snapshot history through Add Data, and review sessions that do not
meet all four authenticity signals. FEED preserves every source record but
withholds unresolved anomalies from Analytics.

The new Queue Timing card shares one calculation with screen, PDF, and CSV. It
reports median, average, 75th- and 90th-percentile wait, historical call
interval, and the typical local time of the last ticket call. Ticket counts are
never added to visits, households, clients, or people served. Administrators
manage the encrypted connection; synchronization, import, and classification
are staff workflows.

## Version 1.5.0 — 2026-08-20

*Everything since 1.4.0. FEED can now describe who it serves, not only what is
on the shelves — and can be recovered if something goes wrong.*

**Analytics became something you can hand to someone.** Any card on any tab can
be selected and turned into a report — a PDF to read and a spreadsheet of the
figures behind it. Reports can be saved as templates and re-run later against a
new date range, so a monthly funder report is set up once.

**Two new lenses: Service and Clients.** Service describes what happened on a
service day — households served, how service was delivered, household size,
turned away, languages spoken. Clients describes who the people are — age
ranges, ethnicity, gender identity, housing, and a map of the postal codes
households gave. The four tabs are Operations, Procurement, Service and
Clients.

Both draw on records that begin years apart and are never added together. Where
two records can answer the same question, the card says which one produced the
figure and how far back it reaches. Where a question was asked of only some
households, the card says so rather than implying a share of everyone.

**Client visit history can be imported.** Link2Feed exports from 2020 onward and
SIMC exports since the June 2026 changeover, along with the pantry's own service
tracking. Large imports run in the background with a progress panel, so a
multi-year file can be left to finish. FEED reads only what it needs and never
stores names, addresses, phone numbers or email addresses.

**Backup, restore, and reset.** A full backup downloads from Data Management,
and FEED can be restored from one — choosing which parts to bring back, so
restoring last month's inventory need not disturb anything else. The same tab
can reset FEED to a clean slate. Backups deliberately leave out AI provider keys
and sign-in secrets.

**An Admin page, and control over who can sign in.** Administrators can see
everyone with access, invite staff, and revoke access with immediate effect.
Sign-in can be set to an allowlist so only people on the roster can get in.
Admin → History records what administrators changed.

**Plus** searchable in-app help with screenshots throughout, thousands
separators on every figure, charts that end where their data ends, and a long
list of PDF and layout corrections found in evaluation.

## Version 1.5.0-beta.21 — 2026-08-19

*Beta — two import fixes found on the first real use of beta.20.*

- **A file FEED cannot import now tells you why.** It was possible to reach a
  dialog that said "Review the detected records" with nothing in it and no
  explanation — even though FEED knew precisely which record was at fault and
  what to do about it. The reason, the record, and a **Try Another File** button
  now appear where the empty panel was. Nothing about your data is changed by a
  rejected file, and the message says so.
- **A household of one no longer stops an import.** SIMC does not require the
  Head of Household box to be ticked when there is only one person in the
  household, but FEED insisted on it — so a single unticked box refused all
  3,799 visits in the file. A household of one is now understood to be its own
  head. FEED still refuses a file where several people share a household and
  none is marked as head, because in that case it genuinely cannot tell who the
  record belongs to.

## Version 1.5.0-beta.20 — 2026-08-19

*Beta — the Clients tab, a map of where households live, and a consistent
shape for every footnote and chart label. Carries beta.17, beta.18 and
beta.19, none of which were deployed: the pantry goes from beta.16 to this.*

- **Service cards can now be put in a report.** The Service tab's cards could be
  seen but not exported: selecting one produced a file that quietly left it out,
  and a report made only of Service cards failed outright. All eight now export,
  and a report drawn only from Service is named **Service Report** rather than
  **Combined Report**.
- **Turned Away** reports the households the pantry could not serve, the days it
  happened, and the times capacity ran out. A service day with no turned-away
  entry counts as nobody turned away. The count is shown against the number of
  days the Service Log was kept, so the figure carries the denominator it has to
  be read against.
- **Languages Spoken at Home** shows which languages households speak. Labels
  that are the same word written two ways are merged — "Mandarin Chinese"
  counts as "Mandarin" — because the two intake systems wrote one answer
  differently. Answers that are genuinely different names are left alone:
  "Farsi" and "Persian" stay separate, and "Chinese" is not resolved into a
  variety nobody recorded. The chart shows the most common; the exported
  spreadsheet carries every answer exactly as recorded.
- **Demographics Questions Response Rate** shows, for each intake question, how many of
  the households served were asked it and how many answered. The two intake
  systems ask different questions, so a short bar usually means the question is
  newer rather than that households declined it. Read any demographic figure
  against this card first.
- **Households by Season can now be read as visits.** A toggle switches the
  chart between distinct households — one household counted once however often
  it came that month — and every visit. The card renames itself and restates
  what it is counting, because nothing in the numbers themselves says which
  question was asked.
- **Anonymous visits now count as households.** Some visits were recorded
  without a client record, and the household counts had been leaving them out
  entirely — which understated 2023 by nearly 13%, the year most affected. Each
  now counts as one household, because a visit is a household whether or not
  its identity was written down. The one thing that cannot be done is
  recognising two anonymous visits as the same household returning, so those
  rows are counted but not deduplicated, and the cards say so. Visits per
  household is unchanged: it still uses identified records only, since an
  anonymous row carries no information about returning.
- **Age of People Served now combines both intake systems** into one chart,
  with finer bands at the top — 75-89, 90-104 and 105+ instead of a single
  75+. Birth years of 1901 or earlier are placeholders rather than real ages;
  they are shown rather than hidden so the count is visible.
- **How Service Was Delivered plots every service day** at every date range,
  rather than summing into months.
- **Where Households Live is now a map.** Each postal code is a circle over
  the place it covers, sized by how many households gave it — by area, so
  twice the households looks twice as large rather than four times. Hover a
  circle for the code and its count. A ranked list could say which code was
  largest; it could not show where in the city people live. Nothing about an
  address is stored or looked up to draw it: FEED knows only the postal code,
  and the map places the code itself.

  The map opens on the metro area rather than on everything plotted, because a
  few out-of-state codes reach as far as Hawaii and the east coast. They are
  still there, a pan and a zoom away. Generated reports keep the ranked list,
  since a printed page cannot carry a map.
- **Four more Clients cards: Ethnicity, Race or Ethnicity (SIMC), Gender
  Identity, and Housing Type.** All built from data FEED already holds. The two
  ethnicity cards are kept apart because the systems ask different questions
  and count different things — households in one, people in the other.
- **Age of People Served now covers both records.** A Link2Feed / SIMC switch
  chooses which to read, so the card keeps working after the June 2026
  changeover instead of going empty.
- **A SIMC parsing fault is fixed.** Answers whose category name contains a
  comma — "Hispanic, Latino, or Spanish" — were being stored as several
  separate answers. Existing records can be corrected by re-importing the
  export or by running the repair script.
- **Procurement gains OFB Spending Over Time**, showing recorded charges by
  month alongside net cost after fees and grants.
- **Two new cards on Clients: Age of People Served and Where Households Live.**
  Both come from data FEED already holds, so nothing new needs importing. Ages
  are taken as of the end of the range, and the card says plainly that only
  Link2Feed records a birth year. The postal-code card leaves out households
  with no fixed address, whose recorded postal code is the agency's own.
- **Figures over 999 carry commas everywhere.** Chart axes printed `8000`
  where the summary tiles beside them printed `8,000`, so reading a scale meant
  counting zeros to tell forty-five thousand from forty-five hundred. Every
  numeric axis and tooltip across all four tabs now separates thousands.
- **Long descriptions in Service Metrics end in an ellipsis** instead of
  stopping mid-word, and the full text appears on hover.
- **Analytics has a fourth tab, Clients.** Household Size, Languages Spoken at
  Home, and Demographics Questions Response Rate moved there from Service. The
  two tabs answer different questions — who the people are, against what
  happened on a service day — and had only been sharing a tab because they
  arrive in the same import. The date range still applies on Clients.
- **Lines end where their data ends.** A source that stopped partway through
  the range used to drop to zero and run flat to the right edge, which reads as
  "we received nothing" rather than "there was nothing to receive". Inbound
  Weight Over Time and Fresh Food Alliance Donations Over Time now stop at the
  last real value.
- **Seasonal Inbound Weight leaves out the month in progress**, the way the
  Service charts already do, and says so. A half-finished August plotted beside
  six complete Augusts looked like a collapse in supply.
- **Service charts name only the records the range contains.** Thirty days
  after the June changeover the legend still offered Link2Feed households and
  Link2Feed individuals with no lines under them.
- **Chart tooltips list the largest value first.** Hovering a point on a chart
  with several lines listed them in a fixed order rather than by size, so on
  *Other Donations Over Time* a 1,543 lb source appeared above a 6,480 lb one.
  Nine charts across Operations, Procurement, and Service now read top to
  bottom. Stacked charts keep their stacking order, which is what the bar under
  the cursor shows.
- **Restoring a backup says what else it clears.** The confirmation step now
  names the records that refer to what is being replaced and cannot be carried
  across, instead of removing them without mention.
- **Service charts state what they rest on.** Each card carries a note saying
  which record produced its figure and what it leaves out, a line begins where
  its record begins rather than running along zero, and the current month is
  left off monthly charts until it finishes.

- **Charts stay legible on a phone.** Any chart that has to show every label —
  age bands, household size, the seasonal month comparisons — now tilts those
  labels when the screen is narrow, rather than running them together or
  dropping half of them.

- **Procurement charts now show individual deliveries on shorter date ranges.**
  Picking 30 days used to give you one or two points, because the charts always
  summed by month. They now plot the delivery dates themselves for any range up
  to about a quarter, and keep monthly totals beyond that, where seventeen years
  of individual deliveries would be an unreadable smear. Seasonal Inbound Weight
  still compares calendar months, which is what it is for.

- **The Service tab came up blank on the YTD and All ranges.** Fixed. One chart
  was labelling its dates with the wrong calendar grain, which failed in a way
  that took the whole tab down instead of spoiling a single label. The other
  ranges were never affected, which is what made it look intermittent.
- **Gender Identity (SIMC)** joins the Clients tab. SIMC has recorded this for
  every household member since June 2026 and the data was already imported —
  there was simply no card showing it. It sits beside the Link2Feed gender card
  rather than merging with it, because SIMC answers per person and Link2Feed per
  household; adding them would count a large household more heavily than a small
  one.
- **Footnotes under the cards are now bulleted lists** instead of paragraphs, so
  a caveat can be found at a glance rather than read through.
- **The asterisk on Service Summary points at something again.** "Treat this as
  an undercount" needs to say what is undercounted — the mark now sits on the
  *People served* tile it refers to, and reads as a reference mark rather than
  as another bullet.
- **Where Households Live flags the agency's own postal code.** Because SIMC
  requires a postal code, staff enter William Temple House's when a household
  has none to give — so that circle is larger than the neighbourhood really is.
  The map now says so.

## Version 1.5.0-beta.19 — not deployed

Superseded by beta.20, which carries all of its changes.

## Version 1.5.0-beta.18 — not deployed

*Beta — introduces the Service tab on Analytics. Superseded by beta.19.*

- **Analytics gained a third tab, Service**, describing people served rather
  than stock or supply. It draws on two records that begin years apart — formal
  intake from 2020, and the Service Log staff have kept since October 2023 —
  and never adds them together.
- **The sidebar was reorganized.** Settings and Admin moved to **Tools &
  Settings**; Analytics, Reports, Data, and Help are together under
  **Information**.
- **The light and dark control is now a toggle.** It was a three-way picker
  including *System*; pressing it now simply switches to the other mode, and
  FEED still follows your device until you press it.

## Version 1.5.0-beta.17 — not deployed (2026-08-15)

*Beta — repairs the backup restore path.*

- **Restoring a backup now works on any instance.** Restore could stop with
  "Cannot delete this item because it is referenced by other items" and refuse
  to run — a failure that only appeared once an instance had used AI
  translation, and so would most likely have been discovered during an actual
  recovery. Records of past AI usage are now cleared along with the settings
  they refer to; they are rebuilt through normal use and were never part of a
  backup file.
- **Restoring only some sections is unchanged.** Choosing Service or Procurement
  alone behaves exactly as before.

## Version 1.5.0-beta.16 — 2026-08-15

*Beta — the import window now says what it is doing.*

- **Each step of an import is named.** Previously the window could say
  "Validated 79,308 of 79,308 records" with a full progress bar while it was
  actually preparing that data for activation — which takes minutes of its own.
  A four-step marker now shows where you are and what is left.
- **The timer measures the current step**, not the time since you uploaded.
- **A full bar means finished.** While records are still being checked against
  existing data, the bar shows continuing work rather than sitting at 100%.
- **Finishing activation is noticed.** The window could keep offering `Activate
  Data` after activation had already completed.
- **Review decisions remember your last answer.** The choice, label, and reason
  carry over to the next question as a starting point you can edit. Each one
  still needs its own Save — nothing is applied to a record you have not
  confirmed.

## Version 1.5.0-beta.15 — 2026-08-15

*Beta — corrects a defect in beta.13 and beta.14 that blocked Link2Feed review.*

- **Link2Feed imports that raise review questions now reach the review step.**
  In the previous two builds such an import stopped just short of handing back
  to you: the progress counter kept climbing after the work had finished, saving
  a decision was refused as "no longer awaiting review", and reopening the
  import did not help. The reading and validation were complete and correct the
  whole time — only the handoff was missing. Upload the file again and the
  review opens normally.
- **An import that cannot complete now says so** rather than appearing to run
  indefinitely.
- **An interrupted import clears its temporary data right away**, instead of
  leaving it for the daily cleanup.

## Version 1.5.0-beta.14 — 2026-08-14

*Beta — interface fix.*

- **The "an import is already in progress" panel now reads as a panel.** Its
  heading, explanation, and button were laid out side by side instead of
  stacked.

## Version 1.5.0-beta.13 — 2026-08-14

*Beta — large imports now finish, and you can watch them.*

- **Large imports complete.** A multi-year Link2Feed export takes a few minutes
  to validate on the FEED server. Previously the connection was cut before it
  finished, so the import looked like it had failed even when the server had
  done the work. It now runs to completion.
- **You can see what is happening.** The import window shows how many records
  have been validated, out of how many, with a progress bar and elapsed time.
  Nothing on that panel is estimated.
- **You can walk away.** Closing the window no longer stops the import. When you
  come back, FEED offers to reopen it — including an import that is finished
  reading and waiting on your review decisions. Your data is unchanged until you
  choose Activate.
- **Note:** an import cannot be stopped once started. There is no way to halt
  the work partway, so FEED does not offer a button that pretends otherwise. An
  import that is not activated changes nothing.

## Version 1.5.0-beta.12 — 2026-08-14

*Beta — makes real Link2Feed visit exports importable.*

- **Link2Feed visit exports now import directly, with no preparation.** Take the
  file Link2Feed gives you and upload it as-is. Earlier builds only accepted a
  hand-converted form of the file, so a genuine export stopped at its first row.
- **Do not open the file in Excel first.** Saving a Link2Feed export through a
  spreadsheet rewrites its dates into a two-digit-year form — a 2025 visit
  becomes indistinguishable from 1925. FEED now refuses such a file and asks for
  the original export rather than importing dates it would have to guess at.
- **What FEED reads is unchanged.** Recognized columns are imported; every other
  column, including Notes and client names, is ignored and never stored.

## Version 1.5.0-beta.11 — 2026-08-14

*Beta — a small corrective build on top of beta.10.*

- **Large data files no longer stall at upload.** A file between 16 MB and
  64 MB was refused in transit before FEED could examine it, so Add Data showed
  a spinner that never resolved instead of an explanation. Files up to the
  stated 64 MB limit now reach the review step. If a file is genuinely too
  large, you now get a message saying so.
- **Temporary import files are cleaned up on schedule.** Uploads are held
  briefly in restricted storage and are meant to be discarded within 24 hours.
  That cleanup was not running for files left behind by an interrupted import
  — a closed browser tab or a server restart. It now runs automatically.
- **Known, unchanged in this build:** a large import still gives no progress
  detail while it works, so a slow import and a stuck one look alike. That is
  being addressed separately.

## Version 1.5.0-beta.10 — 2026-08-14

*Beta — current evaluation build before the final 1.5.0 tag.*

- **Data now enters FEED through one Add Data window.** Open **Information →
  Data**, select **Add Data**, and choose or drop a CSV. FEED identifies Oregon
  Food Bank, Link2Feed, Service Insights Meal Connect, WTH service Tracking,
  and supported historical procurement files, then opens the right review
  flow. Staff retain OFB access; Service imports require an administrator.
- **The Imports table now shows the complete history.** OFB, Community
  Donations, Link2Feed, SIMC, and WTH Tracking activations appear together with
  their date coverage, record counts, warnings, status, and import time.
  Rollback and restore preserve the audit trail instead of deleting it.
- **FEED now has a shared Service Log.** Choose a service date, record whether
  the pantry was open or closed, enter the configured counts or operational
  markers, and select **Save**. Blank remains different from an explicitly
  recorded zero, and every save retains revision history.
- **Historical Tracking values continue as living Service Log data.** Open a
  historical service date to review or correct an imported value. A staff edit
  becomes the current value without erasing the original workbook provenance.
- **Service dates are easier to navigate.** The selected date includes its
  weekday and full calendar date. Previous and next follow the weekdays enabled
  under Operating Hours, while the calendar can select an exceptional service
  day outside the normal schedule.
- **Administrators configure Service Metrics on the Service Log page.** The
  compact three-step Add/Edit window covers the display name, description,
  icon, classification, value type, unit, position, effective dates, total
  participation, and daily-entry availability. Saved changes appear on the
  open Service Log without a refresh.
- **Service Metric cards adapt to the organization's configuration.** Small
  sections share the page; larger sections expand to full width and place two
  metrics per row. Inputs align along the bottom even when names or descriptions
  wrap. The default shopping method now uses the location-neutral name
  **Pantry Shopping Visits**.
- **The Service archive import foundation is operational.** Reviewed Link2Feed
  and SIMC exports preserve formal visits, household and people totals,
  source-scoped identities, demographic response coverage, and quality
  findings while discarding Notes and non-allowlisted columns.
- **WTH's Tracking workbook has a migration path out of Google Sheets.** Its
  exporter retains directly entered service-method observations and source-cell
  provenance, excludes spreadsheet totals and notes, and keeps operational
  detail separate from formal Link2Feed or SIMC totals.
- **Navigation and iconography are cleaner.** The sidebar calls Data Management
  simply **Data**. Shopping Lists, Service Log, Reports, and Admin use distinct
  animated Lucide icons that match their page headings.
- **Document integrity warnings no longer flood the backend log.** A missing
  stored document is reported when its state changes instead of once on every
  document-list refresh.

## Version 1.5.0-beta.9 — 2026-08-07

*Beta — deployed to production for evaluation before the final 1.5.0 tag.*

- **You can turn any Analytics card into a report.** Set up the Analytics page
  the way you want it — pick a date range, choose a channel, filter a table —
  then click **Generate Report** at the top right. The cards start to wiggle;
  click the ones you want, in the order you want them, and click **Review**.
  You get a single ZIP holding a printable PDF, a spreadsheet per card, and a
  small file recording the dates and filters used.
- **Every card on both tabs can now go in a report.** Eight of them could not
  before — Recurring Availability, Operational Pressure, Grocery Partner Mix,
  Recorded Donated Value, Fresh Food Alliance Pickup History, Fresh Food
  Alliance Donations Over Time, and the two legacy donation cards. They sat
  still while the others wiggled, which is how you would have noticed. Tables
  wiggle now too; they used to stay still and look unselectable.
- **Reports remember themselves.** Tick **Save as report template** before
  generating and the card selection, order, filters, and PDF/CSV choices are
  kept under the report's name. Run it again from **Reports**, choose a new date
  range, and get the same report for the new period. The date range is
  deliberately not saved — you pick it each time, which is what makes a monthly
  report straightforward.
- **Reports Management now has the same bulk controls as other management
  tables.** Select report templates with the row checkboxes, use the heading
  checkbox for the current page, and choose **Delete Selected** from Actions.
  FEED confirms the full selection and deletes it as one operation.
- **Import OFB Data now gives staff the required exporter.** The shorter dialog
  links to Primarius and downloads one package containing the OFB Order CSV
  Exporter Chrome Extension plus illustrated PDF instructions. The guide shows
  how to unzip it, turn on Chrome Developer mode, use Load unpacked, confirm the
  extension is active, export from Order History, and import the resulting CSV
  into FEED.
- **Long product names no longer print across their own bars** in the PDF. Names
  too long for the space are shortened with a "…". The spreadsheet still has
  every name in full.
- **A chart of dollars now says dollars.** "Where Paid Procurement Dollars Went"
  was printing `43,245 lb` where it meant `$43,245`, and the Availability
  Summary was labelling a count of items as pounds. Only the printed PDF was
  affected; the figures on screen and in the spreadsheets were always right.
- **Two cards were laid out badly and are fixed.** *Available Assortment Over
  Time* was taking up half the width with blank space beside it, and *Recurring
  Availability* had its chart squeezed into the left half with one figure
  stranded on the right.
- **Admin → History reads like every other table**, with sorting, a filter,
  column choices, and paging.
- **Fixed several specific PDF chart mismatches found in evaluation.** Seasonal
  Inbound Weight now includes all available years and stops at the chosen date
  boundaries; the paid-product “Other” bar keeps its family stack; and the
  three affected Operations charts print the scales and values that were
  previously available only by hovering on screen.
- **Operations tables keep working through report generation.** Unavailable
  Episodes and Rationing History retain their sort and page in the report, and
  remain sortable immediately after generating or canceling.
- **New reports start with a name that matches their contents.** Procurement
  cards suggest *Procurement Report*, Operations cards suggest *Operations
  Report*, and a mix suggests *Combined Report*. You can type any report name
  you prefer before generating it.

## Version 1.5.0-beta.8 — not deployed

*Rolled into beta.9. No separate release.*

## Version 1.5.0-beta.7 — 2026-08-05

*Beta — deployed to production for evaluation before the final 1.5.0 tag.*

- **You can now restore FEED from a backup file**, under **Data Management →
  Database**. Choose a file and FEED shows you what is in it before anything
  changes. You can restore everything, or just a part — inventory, languages
  and translations, or shopping list templates. FEED builds the new data
  alongside the old and swaps at the end, so a failure part-way leaves your
  current data untouched. The app puts itself into maintenance mode while it
  works and restarts itself when it is done.
- **You can also reset FEED to a clean slate** from the same tab. This wipes
  your pantry's working data and starts fresh. It asks twice, and it is
  administrator-only. Take a backup first — this is the one action that cannot
  be undone.
- **Sign-in emails look like William Temple House**, with the logo and the
  house colours, rather than plain unstyled text.
- **An example Shopping List Builder template** is included, so you have
  something real to start from rather than a blank page.
- Fixed: the refusal you get when trying to remove the second-to-last
  administrator now explains itself instead of saying "An error occurred".
- Fixed: empty analytics cards now name the period they found nothing in.

## Version 1.5.0-beta.6 — 2026-08-01

*Beta — deployed to production for evaluation before the final 1.5.0 tag.*

- **You can now download a backup of FEED's data.** Look under **Data
  Management → Database**. It saves a single file containing your categories and
  food items, every saved translation, your shopping list templates, imported
  procurement history, and your settings. Keep it somewhere private and safe.
- **The backup deliberately leaves some things out** — AI provider keys, sign-in
  codes, the staff list, and uploaded documents. That means the file cannot
  restore FEED by itself, and it does not replace the server backups whoever
  maintains FEED takes for you. It is a copy of your pantry's working data, not
  of the whole system.
- **A summary of what FEED is holding** sits on the same tab: how many
  categories, food items, translations, templates, and imported records there
  are, how large the database is, and when you last took a backup.
- **Data Management is now split into two tabs.** *Analytics* is everything the
  page had before and opens by default. *Database* holds the backup actions and
  appears for administrators only.
- **Dates on this page now read as 07/31/2026** rather than "Jul 31, 2026".
- **Data Rules moved up the page**, above the import buttons, since those rules
  affect the totals shown above them.
- Fixed several buttons and labels across FEED that had lost their outline
  styling in the Tailwind upgrade — the active page number in tables, some
  status badges, and buttons in the Find Missing Translations window.

*Restoring from a backup file is not built yet. The button is there and will
tell you so; that work comes in a later update.*

## Version 1.5.0-beta.5 — 2026-08-01

*Beta — deployed to production for evaluation before the final 1.5.0 tag.*

- **Sign-in links in email now work.** Previously, the security scanner that
  checks incoming mail would open the link before you did, which used it up —
  so the link was already spent by the time you clicked it, and the six-digit
  code was the only way in. The link now opens a page with a **Sign in**
  button, and nothing is used up until you press it. One extra click, and it
  works.
- **Some actions are now limited to administrators.** Undoing or restoring a
  data import, adding data rules, and changing AI settings are administrator
  tasks. Everyone can still see all of it — including which data rules are
  active, since those change the totals on your reports — but the controls only
  appear for administrators.
- **Importing data is unchanged** and remains available to all staff.

## Version 1.5.0-beta.4 — 2026-07-31

*Beta — deployed to production for evaluation before the final 1.5.0 tag.*

- **New Admin page.** Administrators can now see everyone who has access to
  FEED, invite new staff, change who is an administrator, and remove access for
  people who have left. You will find it under Information in the sidebar; it is
  visible only to administrators.
- **You can now choose how strict sign-in is.** By default, anyone with a
  William Temple House email address can sign in, exactly as before. You can
  switch to allowing only the specific people on your list, so that a colleague
  whose email account is compromised cannot reach FEED unless you have added
  them. The message people see when they are turned away is yours to write, and
  so is the contact address shown with it.
- **Removing someone's access now takes effect immediately** and stays in
  effect. Previously there was no way to do this at all.
- **Inviting a new staff member sends them an email** with a link to the sign-in
  page. They enter their address there and receive a code, the same as everyone
  else.
- **The page shows when each person last signed in**, so you can tell who is
  still using FEED before deciding who to remove.
- **An activity history** records every change an administrator makes — who did
  what, to whom, and when.

- **Fixed the light/dark switch animation in Chrome.** The colour change is
  meant to sweep out from the sun/moon button you just pressed. In recent
  versions of Chrome it started from the top of the screen instead. Safari was
  never affected. The sweep is also slower and smoother now.

- **Fixed a confusing sign-in screen.** If someone tried to sign in without
  access, FEED said a code had been sent and asked them to type it in, while
  also telling them they were not allowed in. No code was ever sent. The
  sign-in page now stays put and explains the problem, so there is nothing to
  type and nothing to wait for.

*Everyone who already had access has been made an administrator by this update,
so nobody is locked out. Adjust the list on the Admin page after signing in.
Anyone added from now on starts as staff.*

## Version 1.5.0-beta.3 — 2026-07-31

*Beta — deployed to production for evaluation before the final 1.5.0 tag.*

- Data imports now accept files up to 10 MB, raised from 5 MB. That covers
  several more years of history in a single file.
- The import window now shows that it is working, with a running count of
  seconds elapsed, so a long import no longer looks like a frozen screen. It
  also states plainly that your existing data stays unchanged until the import
  finishes.
- Fixed a deployment problem that could quietly install an older version of
  FEED instead of the intended one.

## Version 1.5.0-beta.2 — 2026-07-29

*Beta — deployed to production for evaluation before the final 1.5.0 tag.*

- Fixed large OFB data imports failing on the pantry server. A multi-year export
  that worked on a developer machine would stall or fail here; imports of the
  full history now complete in seconds.
- Fixed **Undo Import** being slow after a large import.
- Fixed FEED becoming unresponsive for everyone while an import was running.
  Other staff can now keep working during an import.
- Import errors now explain what actually went wrong instead of showing a
  generic "unexpected error".

## Version 1.5.0-beta.1 — 2026-07-27

*Beta — deployed to production for hardware verification before the final 1.5.0 tag.*

- Upgraded the styling toolchain to Tailwind CSS v4. This is a build and
  configuration change with no intended visual difference; every component was
  reviewed in both light and dark themes, and the two stylesheets were compared
  utility by utility to confirm nothing shifted.
- Softened how dialogs open and close. Modals now rise gently into place and
  settle back out, instead of appearing abruptly.
- Fixed dialogs opening from the upper-left corner of the screen rather than the
  centre.
- Fixed the *Translate & Download PDF* and *Translate* dialogs vanishing
  instantly on close while every other dialog closed smoothly.
- Menus, tooltips, dialogs, and notifications now respect the operating
  system's "reduce motion" setting. They fade instead of moving, for staff who
  find on-screen movement uncomfortable.
- Error messages for unexpected failures now point to the project's issue
  tracker instead of naming an individual.

## Version 1.4.0 — 2026-07-25

- Rebuilt Analytics around two distinct live lenses: **Operations** for
  availability and service pressure, and **Procurement** for inbound supply,
  source activity, recorded costs, and seasonal history.
- Added one-step unified Oregon Food Bank imports in Data Management, including
  Warehouse orders, Fresh Food Alliance pickups, donor attribution, coverage,
  rollback/restore, legacy community history, and agency-authored shaping rules.
- Replaced the Analytics custom-date control with a compact calendar featuring
  month/year dropdowns, synced date fields, and a frosted shared surface.
- Planned Service as the third Analytics lens, covering pantry visits,
  households, and people served from Link2Feed and SIMC, with William Temple
  House's supplemental log kept as a separate agency-specific source.
- Reframed the experimental Logistics tab as an optional **Supply** tab with
  only Estimated Quantity and Source. Both may be left Unknown.
- Restored one-action Out of Stock updates. Changing availability no longer
  asks for or changes an estimated quantity.
- Added history for the operational choices staff already make: availability,
  Limited Supply, Clearance, and Food Item or Category limits.
- Replaced the experimental planning reports with focused availability and
  service-pressure reports. Burn rate, projected depletion, price, and
  replenishment claims are no longer shown.
- Added direct spreadsheet exports for every supported report block and a raw
  operational-history export for auditing.
- Added five-minute correction sampling so a quickly corrected edit does not
  become a false operational episode while the complete raw history remains
  available.
- Added Unavailable Items and Limited Supply shortcuts to Dashboard.
- Updated Help with the Supply and operational-report workflows.

## Version 1.3.6 — 2026-07-10

- Added a Logistics tab to Food Items for purchase price, units per purchase, and estimated quantity.
- Added inventory history so FEED can estimate burn rates, days of cover, stockout risk, scarcity, and replenishment needs without inventing earlier data.
- Added the Reports workspace with Inventory Outlook, Unit Prices, Scarcity & Availability, Replenishment Planning, and Data Coverage views.
- Added quick CSV downloads and ordered report packages containing a landscape PDF, one CSV per selected report block, and a manifest.
- Added organization-wide shared report templates with Apply, Generate, Rename, Duplicate, and Delete actions.
- Added an Inventory Reports guide to Help with the complete report-generation workflow and guidance for reading Unknown or incomplete results.
- Matched report-selection motion to the faster ZEV reference style while preserving reduced-motion accessibility.
- Added four inventory-logistics cards to Dashboard and report generation for eleven trusted Dashboard cards.
- Added report filters for item/category text, category, stock status, and price type, plus Top 5/Top 10 ranking options.
- Fixed future time being counted in Scarcity, lifecycle snapshots inflating activity, and out-of-stock items disappearing from replenishment urgency.
- Improved Reports on phones and hardened PDF/Docker cleanup after repeated exports.

## Version 1.2.6 — 2026-05-28

- Pop-up notifications ("toasts") now stay on screen just long enough to read them — about three reads' worth — instead of lingering.
- Fixed a problem where tapping or clicking a notification could leave it stuck on screen indefinitely.
- Notifications now close purely on a timer, or when you click their close (×) button or an action button (like Retry).

## Version 1.2.5 — 2026-05-28

- Moved the Shopping List Builder's "Checkbox in Want column" setting to apply to the whole section table at once.
- Previously the setting was per-row, which was tedious to apply and never actually stuck — saving the template cleared the checkboxes back to blank, and PDFs printed without them.
- Turn it on once per table and every row in that table renders a checkbox in the Want column; the setting now persists across saves, PDF downloads, and reloads.

## Version 1.2.4 — 2026-05-27

- Fixed the public inventory feed so translated category and item names that already exist in the app now appear in the feed.
- Some categories (such as "Canned Goods") were missing their translations in the feed even though Translation Management showed them.
- The feed now reads the same translations the rest of the app uses, falling back to the main translation store when needed.

## Version 1.2.3 — 2026-05-26

- Fixed Shopping List Builder so food item limits show automatically from inventory, without re-entering them in the builder.
- Separated a food item's request limit from its "Limited" low-stock status, so changing one no longer affects the other.
- Made the Global Limit apply to "No Limit" items by default on shopping lists, with an option to turn it off per table.

## Version 1.2.2 — 2026-05-24

- Added technical notes for the public inventory JSON feed.
- Documented the endpoint URL, access model, update behavior, and response shape.
- Documented how LOTTO should use translated category and food item names.

## Version 1.2.1 — 2026-05-24

- Added a public read-only inventory JSON feed for LOTTO.
- Included categories, available food items, limits, status tags, and dietary flags.
- Included enabled-language translations for category and food item names.
- Omitted out-of-stock items from the public feed.

## Version 1.2.0 — 2026-05-24

- Added Help screenshots for each guide section.
- Added matching light and dark screenshots so Help reflects the user's current theme.
- Made Help search results link directly to the matching guide section.
- Added release notes from the sidebar version label.
- Updated Help copy after review for clearer, shorter guidance.

## Version 1.1.3 — 2026-05-23

- Added the in-app Help section.
- Added plain-language guides for daily pantry workflows.
- Added an About modal with project, source, and license information.
- Simplified the login and logout screens.
- Updated auth screen branding and attribution.

## Version 1.1.2 — 2026-05-22

- Added more animated icons across navigation and page actions.
- Improved the alerts bell animation.
- Improved table filter and search field icon motion.
- Fixed breadcrumb items that looked clickable but did not navigate.

## Version 1.1.1 — 2026-05-22

- Added animated icons across main action buttons, page titles, and dialogs.
- Improved sidebar, logout, global limit, and alert icon motion.
- Kept sidebar icon animation tied to hover and tap instead of page load.

## Version 1.1.0 — 2026-05-22

- Added more Shopping List Builder layout and print controls.
- Added export filename settings for shopping list PDFs.
- Added English as an export option in translated shopping lists.
- Improved printed shopping list contrast.
- Fixed several builder editing, translation, and keyboard issues.

## Version 1.0.10 — 2026-05-21

- Fixed Food Items editing when a status filter is active.
- Improved the Find Missing Translations modal layout.
- Improved Shopping List Builder row height handling.
- Standardized more scroll areas.

## Version 1.0.8 — 2026-05-21

- Made Shopping List Builder templates and saved components shared across the organization.
- Removed per-user separation from saved builder content.
- Removed legacy hardcoded credentials from tracked documentation and test files.

## Version 1.0.0 — 2026-05-19

- Published FEED as open-source software under AGPL-3.0-or-later.
- Included inventory management for food categories, items, limits, and stock status.
- Included the Shopping List Builder for printable, multilingual shopping lists.
- Included AI-powered document translation.
- Included multilingual rendering for right-to-left languages and CJK text.
- Included dashboards for translation, cost, and usage information.
- Included passwordless email sign-in.
