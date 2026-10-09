# Inventory Analytics

Analytics keeps four kinds of evidence separate:

- **Operations** turns the inventory updates staff already make into
  availability and service-pressure history. It does not require a separate
  counting workflow.
- **Procurement** summarizes external Oregon Food Bank supply records imported
  through Data Management. It describes inbound supply, not remaining stock or
  client demand.
- **Service** describes what happened on a service day, drawn from formal
  intake records and from the Service Log staff keep themselves. It describes
  who came through the door, not what was on the shelves.
- **Clients** describes the people served — household size, languages, and
  which intake questions they were asked. The date range still applies: these
  cards join client details to visits, so "how many non-English-speaking
  households did we serve in March" is a question this tab answers.

## What Analytics Can Safely Show

FEED remembers effective changes to:

- In Stock and Out of Stock availability.
- Limited Supply and Clearance status.
- Food Item and Category limits, including returning to No Limit.

These are operational observations, not explanations. Out of Stock means an
item was unavailable to clients; it does not prove that its physical count was
zero. Limited Supply indicates staff recorded supply pressure, but FEED does
not guess whether low supply, high demand, or another cause produced it.

## Choose A Date Range

Open **Analytics** under **Information** in the sidebar. Choose **Operations**,
**Procurement**, **Service**, or **Clients** at the top of the page.

Operations starts with the last 90 days. Use **Date Range** to switch to 30
days, 6 months, 12 months, or the year to date.

History begins when operational tracking was introduced. Earlier dates are
untracked and are not displayed as zero availability.

![Analytics workspace with Operations, Procurement, Service, and Clients lens tabs above the All date-range preset](/help-screenshots/analytics-lens-tabs.png)

## Read The Analytics

- **Availability Summary** shows the current available, unavailable, Limited
  Supply, item-limit, and category-limit counts. **Repeat Unavailability** is
  the number of items that moved from Available to Unavailable at least twice
  in the chosen range. The summary also shows median restoration time.
- **Available Assortment Over Time** shows the average number of distinct Food
  Item records available during each scheduled service window. The card keeps
  the combined trend, adds range/latest averages, and shows how each Category
  contributed over time with a separate line. Use the Category selector to
  show all Categories or isolate one. The combined averages remain visible,
  and the CSV follows the selected Category. Category values add up to the
  combined line. It describes recorded breadth, not physical quantity.
- **Recurring Availability** focuses on items that repeatedly cycle out and
  back into availability. It shows recurring-item and episode totals, the
  typical restoration time for that cohort, and the items cycling most often.
  Category Pressure groups the same cohort by Category. An item needs at least
  two observed
  Available → Unavailable transitions; initial, migration, and one-time
  unavailable states remain outside this lens.
- **Operational Pressure** shows Limited Supply, Clearance, explicit Food Item
  rationing, and categories with limits as separate lines. A category limit
  counts as one category policy; FEED never converts it into an assumed number
  of affected Food Items or combines these signals into an invented score.
- **Category Pressure** compares how often each pressure signal was active
  during that Category's recorded service time. A separate panel shows
  recurring items and unavailable entries as event counts. These values are
  intentionally not combined into a single score.
- **Unavailable Episodes** lists recorded unavailable periods and their
  duration.
- **Rationing History** lists changes to Food Item and Category limits.

Rapid edits made within five minutes are treated as one correction session in
the charts and summaries. FEED keeps every original event in the raw history.

Analytics uses the organization schedule in **Tools & Settings → Settings**. Closed
days and hours when the pantry is not serving clients do not affect the
assortment timeline. Status transitions still count when staff record them,
including morning updates before service. Current “Available Now” and
“Unavailable Now” values remain literal current counts outside service hours.

## Read Procurement Analytics

The Procurement tab uses Oregon Food Bank portal exports imported under
**Information → Data**. The portal contains both requested OFB
Warehouse Orders and agency-reported Fresh Food Alliance grocery-partner receipts.

- **Inbound Supply Summary** keeps OFB Warehouse Orders, Fresh Food Alliance
  Receipts, receiving dates, and inbound weight separate.
- **Inbound Weight Over Time** shows inbound pounds immediately after the
  summary, keeping Warehouse and Fresh Food Alliance channels separate.
- **OFB Spending Over Time** shows recorded charges against the same dates. It
  is deliberately separate from weight, because the two do not move together —
  a heavy donated load costs nothing. Net recorded cost adds service fees and
  subtracts grants, so where the two lines meet, neither applied.

  These two, along with **Fresh Food Alliance Donations Over Time** and **Other
  Donations Over Time (Legacy Data)**, follow the date range you pick. Up to
  about three months they plot each delivery date, so you can see the individual
  deliveries. Over a longer range they total by month instead — the full record
  holds 1,710 delivery dates across seventeen years, and drawing every one of
  them produces a smear rather than a trend. The axis says which you are looking
  at: a month reads "Aug 2026", a delivery date reads "Aug 13".

  **Seasonal Inbound Weight is not affected.** It compares the same calendar
  month across different years, so months are what it is made of.
- **Paid Procurement Summary** shows product charges, service fees, grants, and
  the resulting net recorded charge. If an acquisition-class filter splits an
  order, fees, grants, and net cost display as **Not attributable** rather than
  being assigned to an unrelated product row.
- **Where Paid Procurement Dollars Went** ranks exact OFB Warehouse product
  codes by calculated product charges. The chart shows the top 15 products and
  identifies how many remaining codes contribute to the **Other paid products**
  total. Search by product description or OFB product code to replace the
  summary with individually ranked matching products; no matching product is
  folded into **Other**. Broad searches show the top 25 results and report the
  complete match count. Tooltips show dollars, share of all paid charges, and
  product-code count.
  It reports where money was recorded; it does not infer why the organization
  purchased a product or whether donated supply was sufficient.
- **Acquisition Mix** compares Donated, Purch-Don, Government, and Purchased
  inbound pounds.
- **Procurement Channels** keeps OFB Warehouse and Fresh Food Alliance grocery
  partnership supply distinct.
- **Fresh Food Alliance Category Mix** shows broad OFB reporting categories. These
  are not individual products and do not identify the grocery partner.
- **Seasonal Inbound Weight** overlays every calendar year in the selected date
  range by default. The month in progress is left off until it finishes — half
  a month beside eleven whole ones reads as a collapse in supply rather than a
  month that has not happened yet. Use the year selector to show all years, clear the chart, or
  isolate individual years for a focused comparison. Year colors remain stable
  while filtering; the current calendar year starts the color sequence and uses
  a stronger line and glow for quick comparison with prior years.
- **OFB Warehouse Product History** provides sortable factual observations for
  exact supplier products, including receiving-date count, inbound weight,
  median receiving gap, and the last receiving date. FEED does not classify
  products as occasional, recurring, or core supply.
- **Paid OFB Warehouse Products** provides the complete filtered product-level
  charge, paid-weight, receiving-date, and cost-per-paid-pound detail behind
  the paid-spending visualization.
- **Fresh Food Alliance Receipt Categories** provides sortable weight and event
  totals for broad Fresh Food Alliance reporting categories.

Use the year, procurement-channel, and acquisition-class filters independently.
Select **Manage Procurement Data** to import a fresh export or review import
history. FEED shows a refresh warning when the latest receiving date is more
than 30 calendar days old.

## Read Service Analytics

The Service tab draws on two records that describe the same pantry days and
begin years apart. Neither is treated as the authority:

- **Formal intake** — Link2Feed, and SIMC after the changeover — is the
  client-grained record, going back to 2020. It carries household sizes and
  demographics.
- **The Service Log** is WTH's own end-of-day count, kept since October 2023.
  It is the more complete count of what happened, because it covers days and
  households that intake missed.

They are never added together. Where both can answer a question the Service Log
is preferred, because a hand-counted total does not depend on every client
completing intake.

Because the two records start at different times, every Service card states
what its figure rests on. Read the note under a card before quoting its number.

![Service Summary with Service Log and intake-record totals, source labels, and the People served footnote](/help-screenshots/analytics-service-summary.png)

- **Service Summary** gives visits, people served, and households served, then
  breaks households down by how service was delivered. Ancillary counts such as
  camping-gear requests are reported in their own units rather than as
  households.
- **Service Over Time** plots each record separately so you can see the
  changeover rather than a single blended line. A line begins where its record
  begins; it does not run along zero for the years before that record existed.
- **Households by Season** puts each year on the same twelve-month axis. A year
  that ran only part of the calendar stops where its data stops. Use the
  **Households / Visits** toggle to switch what is counted: households counts a
  household once a month however often it came, visits counts every encounter.
  The two answer different questions — "how many families did we reach in
  March" against "how busy was March" — so the card renames itself and restates
  its footnote when you switch. Some visits were recorded without a client
  record; each still counts as a household, but repeat trips by the same
  anonymous household cannot be recognised as repeats, so the household figure
  is slightly high on those.
- **How Service Was Delivered** shows households by method, one point per
  recorded service day at every date range — the Service Log holds one row per
  day the pantry ran, and summing those into months hides the difference
  between a busy Thursday and a Friday backpack session. A method begins
  where that program began — Emergency Bags starts in November 2025, not at the
  left edge of the chart.

![Turned Away card with three summary tiles and the service-day chart](/help-screenshots/analytics-turned-away.png)

Over a range longer than about three months the charts switch from daily to
monthly totals, and the current month is left off until it finishes — a partial
month plotted beside complete ones reads as a collapse that did not happen.

To record a service day, read [Service Log](15-service-log.md).

## Read Client Analytics

The Clients tab describes the people served rather than the service days. It
draws on the same intake records, joined to visits through the client id, so
the date range still applies — these are the households served in the range,
not everyone on file.

- **Household Size** counts visits by the number of people in the household.
  Very large sizes are bulk entries and special events, not families.
- **Turned Away** is the only record of service *not* delivered. A service day
  with no turned-away entry counts as nobody turned away, which is what staff
  confirmed the blank means. The figure is reported against the number of days
  the Service Log was kept, because the count alone invites the wrong
  denominator.
- **Age of People Served** groups people into age bands, taken as of the end of
  the date range — a household served in December 2024 was the age it was then.
  Both intake systems contribute, but unevenly: Link2Feed records one birth
  year per household, for whoever registered, while SIMC records one for every
  household member, so years before the June 2026 changeover under-count
  household members. Birth years of 1901 or earlier are placeholders rather
  than real ages and are shown rather than hidden, so the top band can be read
  as a data-entry signal.

  ![Age of People Served chart with all eight age bands and four source notes](/help-screenshots/analytics-clients-age.png)

- **Where Households Live** plots postal codes on a map, one circle per code,
  sized by how many households gave it. The circle's *area* tracks the count,
  so a code with twice the households looks twice as large rather than four
  times. Hover a circle for the code and its household count. Households
  recorded as having no fixed address are left off the map: SIMC requires a
  postal code, so the agency's own is entered when there is nowhere else to
  give, and plotting those would draw the pantry's own neighborhood as the
  place its clients live. A handful of codes give no map location at all — a
  PO-box-only code, for one — and are noted beneath the map instead.

  ![Where Households Live bubble map with postal-code markers across the Portland metro and source notes below](/help-screenshots/analytics-clients-map.png)

  One code is called out beneath the map as over-represented: the agency's own.
  Households recorded as having no fixed address are already left off, but the
  same code also gets entered for housed households whose code simply is not
  known, and nothing in the record separates those from people who really live
  there. The circle stays on the map and the note says to read it with caution.
  FEED works out which code this is from the data rather than being told, so it
  stays correct if the agency ever moves.

  Read the map as postal codes, not as neighborhoods: a circle marks the whole
  code, not an address, and a postal code is not a catchment area. The map
  opens on the metro area rather than on the full spread of the data, because a
  few out-of-state codes reach as far as Hawaii and the east coast; those are
  still plotted, a pan and a zoom away.

  A generated report draws the same map, printed rather than interactive: the
  circles are in the same places at the same sizes, the busiest five postal
  codes are labelled, and a scale bar gives the distances. Postal codes too far
  out to fit the frame are counted in a line above the map rather than dropped.
  Beneath the map is a key: the ten postal codes with the most households, with
  counts and each one's share of the households that gave a postal code. A map
  shows where well and exact figures badly, so the key carries the numbers the
  circles only imply. It ranks every postal code, including any that have no map
  location, so it agrees with the spreadsheet about what the top ten are.

  The spreadsheet export stays a list of postal codes and household counts —
  that is the data behind the picture, and it is what a spreadsheet is for.
- **Ethnicity** shows how households described themselves at intake, recorded
  in Link2Feed only — SIMC asks a different question with different categories,
  which appears on its own card. A household can give more than one answer, so
  the bars add up to more than the households counted.
- **Race or Ethnicity (SIMC)** is the same question as SIMC asks it, counted in
  people rather than households because SIMC records an answer for each
  household member. The two ethnicity cards are not comparable and should not
  be added together.
- **Gender Identity** shows what households reported to Link2Feed, and **Gender
  Identity (SIMC)** the same question as SIMC asks it. They stay on separate
  cards for the same reason the two ethnicity cards do: SIMC records an answer
  for every household member and Link2Feed one for whoever registered, so a
  combined total would weight a large household more heavily than a small one.
  The wording differs between the systems too — SIMC writes "Trans Male/Trans
  Man" where Link2Feed writes "Transgender man".
- **Housing Type** shows where households said they were living, from
  Link2Feed. It pairs with the no-fixed-address figure on Where Households Live.
- **Languages Spoken at Home** shows which languages households speak. Where
  the two intake systems wrote the same answer differently, the labels are
  merged — "Mandarin Chinese" counts as "Mandarin". Answers that are different
  names are left alone: "Farsi" and "Persian" stay separate, and "Chinese" is
  not assumed to mean one variety or the other. The chart plots the most
  common; the exported CSV carries every answer exactly as recorded.
- **Demographics Questions Response Rate** is the denominator behind every other
  demographic figure: for each question, how many of the households served were
  asked it and how many answered. The two intake systems ask different
  questions, so a short bar usually means the question is newer rather than
  that households refused it. Choosing "prefer not to answer" counts as not
  answered, because declining is not an answer to the question asked. Fields
  the systems fill in or derive themselves are left off — postal code, state,
  county, and the two required SIMC flags — because a value there does not mean
  a household answered anything. Read any demographic share against this card
  first.


## Generate Analytics Reports

Select **Generate Report** to choose up to eight visible cards across the
Operations, Procurement, Service, and Clients tabs. FEED downloads one ZIP containing a printable
PDF, a CSV for each selected card, and a manifest recording the active date
range and filters. Reports can also be saved as shared templates and run again
for another date range.

Read [Generating Reports](14-analytics-reports.md) for card selection, condensed
versus raw CSV data, saved templates, and table behavior.

## Dashboard Shortcuts

Dashboard shows two literal operational counts:

- **Unavailable Items**
- **Limited Supply**

Each card links to Analytics for the full history. FEED does not currently show
burn rate, projected depletion, replenishment cost, or quantity-completeness
cards because ordinary service-catalog updates cannot support those claims
reliably.

## What To Read Next

- To update the information used by analytics, read [Inventory](03-inventory.md).
- To update the pantry schedule used by analytics, read [Operating Hours](11-settings.md).
- To import or reverse external data, read [Data Management](12-data-management.md).
- To record the service days behind Service Analytics, read [Service Log](15-service-log.md).
- To turn current inventory into client-facing lists, read [Shopping Lists](07-shopping-lists.md).
