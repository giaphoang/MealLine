# Service Analytics — Proposed Cards

**Status:** Proposal, 2026-08-15. No code written.
**Prepared from:** the restored production Service data on the development
database — 82,613 current encounters, 11,039 client profiles, 1,126 operational
observations.
**Builds on:** [`service-analytics-plan.md`](./service-analytics-plan.md), whose
seven Service sections this proposal fills in. It does not restate that plan's
decisions; it proposes what to draw inside them.

---

## 1. What is actually in the data

| | Coverage | Volume |
|---|---|---|
| Link2Feed encounters | 2020-10-19 → 2026-05-28 | 79,308 |
| SIMC encounters | 2026-06-02 → 2026-08-06 | 3,305 |
| Client profiles | both sources | 11,039 |
| Demographic responses | 21 dimensions | 158,875 |
| Operational observations | 2023-10-17 → 2026-08-13 | 1,126 across 7 metrics |
| Days where formal and operational records overlap | 2023-10 → 2026-08 | **314** |

Service runs on Tuesday, Wednesday and Thursday (103, 93 and 86 visits per day
on average). Monday and Friday are marginal; one Saturday visit exists in six
years.

---

## 2. The stories the data is holding

Ranked by how strongly the data supports them and how much they would change a
decision.

### 2.1 Two independent records agree — and that licenses everything else

Across **314 shared service days over three years**, formal intake counts and
the hand-kept operational spreadsheet agree remarkably closely:

| Year | Shared days | Formal visits | Operational services | Operational as % of formal | Mean absolute daily difference |
|---|---|---|---|---|---|
| 2023 | 28 | 3,071 | 3,052 | 99.4% | 1.1 |
| 2024 | 70 | 8,042 | 8,245 | 102.5% | 5.7 |
| 2025 | 130 | 15,496 | 15,561 | 100.4% | 3.4 |
| 2026 | 86 | 10,807 | 11,115 | 102.9% | 4.3 |

A clinical intake database and a Google Sheet, kept by different people for
different reasons, land within a few visits of each other on a typical
100-visit day. (This independently reproduces the plan's own SIMC/Tracking
finding of 1.79% and 4.31 mean absolute difference over 26 days — at 12× the
sample.)

**Why it matters more than it looks.** It is the evidence that the operational
method breakdown genuinely explains the formal totals. Without it, "how service
was delivered" is an anecdote from a spreadsheet. With it, that breakdown can
be trusted. I would build this card first, because it is what earns the right
to show the others.

It also protects against a real hazard: the plan is emphatic that these two
layers are never added. A card that *compares* them makes the distinction
visible and teaches it, where a card that omits the comparison leaves someone
free to add them mentally.

### 2.2 Far more households, far less often each

| Year | Households served | Visits | Visits per household | New households |
|---|---|---|---|---|
| 2020 (partial) | 587 | 1,789 | 3.05 | 587 |
| 2021 | 1,262 | 10,072 | **7.98** | 857 |
| 2022 | 1,822 | 11,076 | 6.08 | 1,114 |
| 2023 | 2,960 | 14,921 | 5.04 | 1,972 |
| 2024 | 3,610 | 16,314 | 4.52 | 2,171 |
| 2025 | 3,846 | 17,223 | 4.48 | 2,119 |
| 2026 (7 months) | 3,535 | 11,218 | 3.17 | **2,219** |

Households served grew **555%**. Visits per household fell by **60%**. Total
visits grew 71% — the smallest of the three movements, and the one a single
headline number would report.

2026 has already taken in more first-time households in seven months than any
complete previous year.

**This is the card I would most want a director to see**, and the one that most
needs discipline. The data shows the divergence; it cannot say why. Broader
reach, a visit-frequency policy, and a flood of one-time visitors all produce
this shape. §2.3 shows the third is at least partly true, but the card must
present the two series and stop.

### 2.3 Half of all households come exactly once

| Lifetime visits | Households | Share of households | Visits | Share of visits | Mean span |
|---|---|---|---|---|---|
| 1 | 5,448 | 49.4% | 5,448 | 6.6% | — |
| 2–3 | 2,303 | 20.9% | 5,407 | 6.5% | 181 days |
| 4–10 | 1,819 | 16.5% | 11,077 | 13.4% | 396 days |
| 11–25 | 775 | 7.0% | 12,622 | 15.3% | 775 days |
| 26–50 | 380 | 3.4% | 13,610 | 16.5% | 1,063 days |
| **51+** | **314** | **2.8%** | **29,930** | **36.2%** | 1,544 days |

314 households — 2.8% — account for **more than a third of every visit in six
years**. At the other end, nearly half of all households appear once and never
return.

Two populations are being served by one pantry: a small, deeply dependent core
and a very large transient edge. Almost any average across them describes
neither.

### 2.4 The system cutover was clean

Link2Feed's final month: **1,591 visits**. SIMC's first month: **1,592**.

Six years of history and two months of a new system meet with a one-visit
difference. It is a small fact that carries a lot of assurance, and it belongs
on the time-series card as an annotated seam rather than a separate card.

### 2.5 The pantry mostly serves people living alone

59% of household visits report a single person; 84% report one or two. The
distribution has a thin tail to 12.

This has direct operational meaning for shopping lists and portioning, and it
is the least ambiguous finding in the dataset.

### 2.6 Unmet demand is recorded, rare, and fragile

234 households turned away across 38 recorded days; capacity-reached times on
six days; 822 emergency bags since November 2025.

These are the only records of service *not* delivered, which makes them
disproportionately important — and disproportionately easy to misread. Turned-away
counts appear on 38 of 320 observed days. Whether the other 282 days mean "zero
turned away" or "not recorded" is a question the data cannot answer and staff
can. See §5.

### 2.7 Who is served, where they come from, and in what language

- **Geography:** 30% of households with a recorded postal code are in 97209 —
  the pantry's own neighborhood. Then a steep drop (97205, 97201, 97210) and a
  long tail reaching outer east Portland (97233, 97266, 97236), eight or more
  miles away.
- **Age:** peak 30–44 (3,156) and 45–59 (2,894), with 1,957 aged 60–74 and 530
  aged 75+. About 4% of birth years are estimated rather than reported.
- **Language:** English 4,989, then Mandarin Chinese 192, Spanish 168, Russian
  60, Cantonese 57 — but see §5 on normalization.

### 2.8 The demographic questions change at the cutover

Only some dimensions are collected by both systems. `ethnicity`,
`gender_identity`, `housing_type`, `primary_income_source` and
`self_identifies_as` exist for Link2Feed's 9,596 profiles only. `employment`,
`food_insecurity`, `military_status`, `snap_participation`, `no_fixed_address`
and `housing_stability` exist for SIMC's 1,443 only — and most are barely
answered so far (`employment`: 1 provided out of 1,443).

**Any demographic card that spans the full six years can only use the
dimensions both systems ask.** Everything else is a Link2Feed-era card that
will stop accruing, or a SIMC-era card that has two months of data. This is a
structural constraint on section 6, not a data-quality problem.

### 2.9 A coverage anomaly worth explaining

Identity-unavailable encounters run 2–7% in most years — and **12.7% in 2023**
(1,898 of 14,921). Something changed in intake practice that year. Worth a
staff explanation before any card computes a household-level rate over it.

---

## 3. Proposed cards

Mapped to the plan's seven sections. **Bold = recommended for the first
release.**

### Section 1 — Formal service summary

**`service-summary`** · stat tiles
Households, visits, people reported, and coverage window, split by source and
never totalled across them. Excludes the 13 special-event aggregates from
household counts (they are people tallies with no household identity — see §5)
and states that exclusion on the card.

### Section 2 — Service over time

**`service-over-time`** · line, monthly
Visits and distinct households by month, with an annotated seam at the
Link2Feed → SIMC cutover. Two sources, one timeline, drawn as a continuous
series with a labeled boundary — never summed into a single blended figure.

**`service-reach-and-frequency`** · bars + line, yearly
Households served as bars; visits per household as a line on a second axis.
§2.2. The card names both series plainly and offers no explanation for the
divergence.

`service-return-concentration` · horizontal bars
The §2.3 table as a chart: households by lifetime visit band against share of
visits. Defer to a second release only because it needs a caption staff help
write.

### Section 3 — Operational method mix

**`service-method-mix`** · stacked area, monthly
Shopping visits, long lists, premade bags, emergency bags. Operational records
only — no formal counts on this card, so nothing invites addition. The emergency
bag series begins November 2025 and the card says so rather than drawing zeros
backwards.

### Section 4 — Capacity and unmet demand

`service-unmet-demand` · marks on a timeline, not a bar chart
Turned-away counts, capacity-reached times, and emergency-bag days as discrete
events. **Blocked on §5's recorded-versus-zero question** — the chart type
depends entirely on the answer.

### Section 5 — Ancillary needs

*No card recommended.* 21 camping-gear requests across 13 days over two years
does not support a chart. A stat line on the summary card is honest; a chart
would give sparse data unearned visual weight.

### Section 6 — Demographics and needs

**`service-household-size`** · bar
§2.5. Highest confidence, most directly actionable, least interpretation.

`service-age-distribution` · bar
Age bands with the estimated-birth-year share stated, and the 1,443 profiles
without a birth year shown as an explicit unknown band rather than dropped.

`service-geography` · ranked bars
Postal codes, with a named "beyond the core" grouping rather than a long tail
of ones. Not a map: a map implies catchment precision that postal centroids do
not carry.

`service-languages` · ranked bars
Blocked on the normalization question in §5.

`service-response-coverage` · grouped bars
For each dimension, the share provided versus not provided. Unglamorous and
quietly the most important card in the section: it is what stops someone
reading "82% of clients are X" from a question only 60% answered.

### Section 7 — Reconciliation and coverage

**`service-record-agreement`** · dual line + difference band
§2.1. Formal against operational on shared days, with the mean absolute daily
difference stated. The trust card.

`service-identity-coverage` · line
Identity-unavailable share by year — §2.9, the 2023 anomaly.

---

## 4. Recommended first release

Five cards. Together they answer *how many, growing how, delivered how, can I
trust it, and who* — and every one is defensible from the data without a
judgment call I cannot make.

1. **`service-record-agreement`** — build first; it licenses the rest
2. **`service-over-time`** — the spine, with the cutover seam
3. **`service-reach-and-frequency`** — the finding most likely to change a decision
4. **`service-method-mix`** — what the operational layer uniquely explains
5. **`service-household-size`** — immediately useful, zero interpretation risk

Deliberately held back: everything blocked on §5, plus the demographic cards
that need the §2.8 constraint settled first. I would rather ship five cards
nobody has to caveat in conversation than eleven where four need explaining.

Per the plan, each card registers in the Analytics report contract in the same
release, with screen, PDF and CSV sharing one accessor.

---

## 5. Questions only you and the staff can answer

> **Answered, August 2026.** Staff settled the three questions that were
> holding cards back, and all three cards are now built:
>
> - **A blank turned-away entry means nobody was turned away**, not "not
>   recorded". `service-unmet-demand` therefore plots a real series rather than
>   scattered marks, and reports the days it happened against the days the
>   Service Log was kept — 29 of 321 — so the figure carries its denominator.
> - **Languages are normalized only where two labels are the same word.**
>   Revised August 16 2026, after the first build refused to merge anything.
>   "Mandarin Chinese" folds into "Mandarin" and "Cantonese Chinese" into
>   "Cantonese", because those are the two intake systems labelling one answer
>   differently — a redundant qualifier, not a different name. Answers that are
>   different names stay separate: "Farsi" and "Persian" are a household's own
>   choice of name, "Chinese" could be either variety, and "American Sign
>   Language" names which sign language. `service-languages` plots the fifteen
>   most common of the 48 merged labels and exports all 50 unmerged, so the
>   display limit and the merge are both reversible from the data file.
> - **The 2023 identity gap is paper recording under pressure**, not households
>   declining to answer. `service-response-coverage` states, for every
>   question, how many of the households served were asked it and how many
>   answered — which is what stops a demographic share being read against the
>   wrong denominator.
>
> Still held back: age and geography, which need the §2.8 cutover constraint
> settled before a single distribution can be drawn across both systems.

These are not blockers on starting — they are blockers on specific cards, and
each changes what a card is allowed to say.

1. **Turned-away: are the 282 days without a record zeros, or silence?** If
   zeros, `service-unmet-demand` can be a time series. If silence, it can only
   be discrete event marks. The plan's own rule — explicit zero is never
   treated as missing — makes this decisive rather than cosmetic.

2. **Languages: normalize or show raw?** The source contains "Mandarin Chinese"
   (192) and "Mandarin" (56); "Cantonese Chinese" (57) and "Cantonese" (6);
   "Chinese" (13); "Persian" (4), "Farsi" (3) and "Dari" (3). Merging is a
   judgment about what the source meant, which FEED's principles say it should
   not make unilaterally. Showing raw values produces a chart that misstates
   Mandarin. My inclination is a curated alias map, authored by staff and
   visible in the card — but it is your call, and Persian/Farsi/Dari in
   particular is a question about people, not strings.

3. **Did a visit-frequency policy change between 2021 and now?** It would
   explain much of §2.2, and the caption is materially different if so.

4. **What happened to intake in 2023?** Identity-unavailable jumped to 12.7%.

5. **Emergency bags from November 2025 — new program, or newly recorded?** The
   method-mix card draws these differently depending on the answer.

6. **The 13 special-event aggregates** (24 to 264 people; the 264 is
   2025-11-24). Confirmed as people tallies, not households — I propose
   excluding them from every household metric and surfacing them only as
   annotated events on the time series. Worth confirming that is the reading
   you want.

---

## 6. What I would not build

- **A single "total people served" headline.** Reported people can be summed
  within a source, but the 4,506 identity-unavailable encounters have no
  household and the special-event rows are counted differently. One number here
  would be wrong in a way nobody could see.
- **Anything joining Service to Procurement or Inventory.** The plan forbids
  inferring that supply caused service, and the moment two lenses share an axis
  someone will read causation off it.
- **A demographic trend line across the cutover** for any dimension only one
  system collects — it would show a real distribution ending in a cliff that is
  an artifact of a software change.
- **A map.** Postal codes are not catchment.
- **Per-client drill-down of any kind.** Nothing in FEED's design points that
  way, and Analytics is the wrong surface to introduce it.
