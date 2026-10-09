# Generating Reports

Any card you can see on the Analytics page can be exported. You choose the cards
you want, and FEED gives you one file containing a printable PDF and the raw
numbers as spreadsheets.

Reports show exactly what was on your screen. If you filtered to one donor or
sorted a table by weight, the report does the same. Nothing is recalculated
behind the scenes.

## Making a report

1. Go to **Analytics** and set things up the way you want them — pick your date
   range, choose a channel, filter a table, sort a column. Whatever you can see
   is what you will get.
2. Click **Generate Report**, at the top right beneath the Operations,
   Procurement, Service, and Clients tabs.
3. The cards start to wiggle. Click the ones you want. Each gets a number
   showing where it will appear in the report.
4. Click **Review**.
5. FEED suggests **Procurement Report**, **Operations Report**, **Service
   Report**, **Clients Report**, or **Combined Report** from the cards you
   chose. Keep that name or
   type your own, drag the cards into the order you want, choose what to
   include, and click **Generate**.

![Analytics selection mode with three cards chosen and numbered in report order](/help-screenshots/analytics-report-selection.png)

![Generate report review dialog listing the selected cards, title, and output choices](/help-screenshots/analytics-report-review.png)

Your report downloads as a ZIP file. Open it and you will find:

- a **PDF** with your charts and tables, ready to print or email;
- one **CSV** per card, numbered in the same order, that opens in Excel;
- a small `manifest.json` recording the date range and filters used.

You can pick up to **eight cards** in one report. Every card on all four tabs
can be picked — charts, the summary tiles, and the tables. If something on the
page does not wiggle, that is a fault worth reporting, not a card that was left
out on purpose.

### Set up each card before selecting it

The date range and page filters are locked when you click **Generate Report**.
A card's own controls — such as a seasonal year choice, donor selection, search,
or table sort and page — are locked when you click that card. This lets you move
between Operations, Procurement, Service, and Clients and still capture each
card exactly as it is shown when you choose it.

If you realise you wanted a different date range, click **Cancel**, change it,
and start again.

## Mixing the tabs

Your selection carries across all four tabs. Pick a card on Operations, switch
to Procurement, pick two more, add one from Service and one from Clients, and
they all end up in one report.

One card behaves differently in a report: **Where Households Live** prints as a
ranked list of postal codes rather than the map you see on screen, because a
printed page cannot carry a map. The numbers are the same either way.

## Choosing what goes in the file

**PDF with charts** — the printable document.

**CSV data** — one spreadsheet per card. When you include CSVs you can choose:

- **Condensed** matches the chart exactly. Pick this if the numbers should
  agree with the picture.
- **Raw** gives the underlying detail. On a long date range the chart may group
  months into quarters to stay readable; Raw gives you the individual months
  anyway.

For most reports, Condensed is what you want, and it is the default.

## Long date ranges

If you ask for several years, a monthly chart would end up with bars too thin to
see. FEED groups them into quarters or years automatically and prints a note on
the card saying so, along with how to get the detail back:

> Condensed to quarters: 201 months would print at under 1.6mm per bar. Narrow
> the date range to see months.

Nothing is lost. The totals are the same, just in bigger buckets — and if you
need the months, choose **Raw** for the CSV or narrow the date range.

## Tables

Tables come out the way you left them: same filter, same sort, same columns,
same number of rows per page.

That means you can set a table up to answer one question — say, sort by Total
Charges and hide the columns you do not need — and the report shows precisely
that. Rows never get split across a page break, and the column headings repeat
at the top of every page, so a long table is still readable on paper.

**Exporting a hundred rows is fine.** If that is the table you need, printing it
properly here saves tidying it up in Excel afterwards.

## Saving a report to use again

**Save as report template** is ticked by default. It remembers your card
selection, their order, your filters, and your PDF and CSV choices, filed under
the report's name.

It does **not** remember the date range. That is on purpose: a template saved as
"last 90 days" in March would either be stuck in March or quietly mean something
different every month. Instead you choose the range each time you run it, which
makes a monthly report straightforward — same cards, same layout, new dates.

If you only need a one-off, untick the box before generating.

## Running a saved report again

Go to **Reports**. Every saved template is listed with the cards it contains,
what it produces, and the filters it was saved with.

1. Click the **⋯** button at the end of the row and choose **Run report**.
2. Pick the date range — the same 7d / 30d / 90d / YTD / All buttons and custom
   range picker you use on Analytics.
3. Click **Generate**.

You get the same report, for the new dates. Nothing else needs setting up: the
cards, their order, the filters and your PDF and CSV choices all come from the
template.

To change what a report contains, set it up on Analytics again and save it under
the same name — that replaces the template.

To remove one template, use **Delete template** in its row menu. To remove
several, tick their checkboxes, open **Actions**, and choose **Delete Selected**.
The checkbox in the heading selects the templates on the current page. FEED
shows the selected count and asks for confirmation before deleting anything.
Templates are shared with everyone using FEED; reports already downloaded are
not affected.

### "1 unavailable" beside the card count

FEED's cards change occasionally, and a template can name one that no longer
exists. When that happens you will see it in the Cards column before you open
anything, and again in the run dialog, which marks the card **Unavailable**.

The report still runs, with the cards that remain. Save a fresh template from
Analytics when you get the chance. If *none* of a template's cards still exist,
**Run report** is greyed out — save a new template and delete the old one.

## Reading a report

Every page carries the date range, the filters, and when the data was read. If a
card was narrowed in some way, it says so on the card itself — for example
*"Donors narrowed to 1"* or *"Table filtered to 'produce'"*.

This matters when a report gets forwarded. A number without its date range and
filters is easy to misread, so FEED keeps them attached.

## Things worth knowing

**Charts look different from the screen.** They are drawn for paper — plainer
colours and sized for a printed page. Values that the screen reveals on hover
are printed as axes or restrained labels where needed. The numbers are
identical; only the styling differs.

**A dash means "does not apply", not zero.** A donated product shows `—` for
charges rather than `$0.00`, because zero would suggest you paid nothing for
something that was never purchased.

**Some numbers cannot be broken down.** Service fees and grants sit on a whole
order, not on individual products, so filtering by acquisition class shows *Not
attributable* rather than a guess.

**Service cards say what their figures rest on.** WTH's two records begin years
apart — formal intake goes back to 2020, the Service Log to October 2023 — so a
Service card carries a note saying which record produced its number and what it
leaves out. A line on a Service chart begins where its record begins rather than
running along zero for the years before it existed, and the current month is
left off monthly charts until it finishes.

## If something goes wrong

**"Generate" is greyed out** — check you have picked at least one card, given
the report a name of at least three characters, and ticked PDF or CSV.

**The report takes a few seconds** — building the PDF takes a moment,
especially with several cards or a long table. The button shows *Generating…*
while it works.

**A card is empty** — this usually means nothing was recorded in that date
range. The card will say so rather than showing a blank chart.
