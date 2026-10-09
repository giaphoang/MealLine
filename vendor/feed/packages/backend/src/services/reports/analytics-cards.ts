// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import {
  COUNT,
  DOLLARS,
  PERCENT,
  hBarSvg,
  kpiGrid,
  legendSvg,
  lineChartSvg,
  stackedBarSvg,
  stackedHBarSvg,
  groupedHBarSvg,
  bubbleMapSvg,
  rankedKeySvg,
  type MapPoint,
  tableHtml,
} from './analytics-print';
import { condenseTimeSeries, type Grain, type Series } from './condense';

/**
 * The grain a procurement payload's over-time buckets carry.
 *
 * Short ranges plot deliveries by day, so a card that assumed months would
 * label a CSV column "month" over a column of dates — the export and the data
 * disagreeing about what a row is.
 */
const grainOf = (analytics: any): Grain =>
  (analytics?.bucketGranularity === 'day' ? 'day' : 'month');

/**
 * The card contract: one accessor, two outputs.
 *
 * Every card declares a single `data()` that turns the analytics payload into
 * display-ready categories and series — already labelled, already in display
 * units, already condensed if the range is too long to print. The chart and the
 * CSV both consume *that*, so their numbers cannot disagree. Only the drawing
 * differs, which is the point: the print chart is designed for paper rather
 * than imitating the screen.
 *
 * The first spike skipped this and re-derived rows inside each renderer. It
 * drifted on its first output — raw `PURCH-DON` where the screen shows
 * `Purch-Don`, and Fresh Alliance missing the legacy history the screen stacks
 * onto it, understating that channel by 62%. Neither was visible without
 * comparing outputs side by side. Hence one accessor.
 *
 * **Filters are part of the data.** A card's title and series set can depend on
 * the active filter, so `data()` reads the filter off the payload the API
 * returned rather than taking it separately. The screen and the report are then
 * looking at the same source of truth and cannot disagree about what was asked
 * for.
 */

/**
 * Display vocabulary, canonical.
 *
 * The frontend holds its own copies in `analytics/index.tsx` because the two
 * packages share no module. `src/test/analytics-card-parity.test.ts` in the
 * frontend reads these from source and fails if they diverge — the same
 * technique the audit-action labels use.
 */
export const ACQUISITION_LABELS: Record<string, string> = {
  DONATED: 'Donated',
  'PURCH-DON': 'Purch-Don',
  GOVERNMENT: 'Government',
  PURCHASED: 'Purchased',
};

export const CHANNEL_LABELS: Record<string, string> = {
  ofb_warehouse: 'OFB Warehouse',
  fresh_alliance: 'Fresh Food Alliance',
  community_donation: 'Donations (Legacy Data)',
};

/** Hundredths of a pound to pounds. The screen's `toPounds`. */
export const toPounds = (hundredths: number): number => hundredths / 100;

/** Categories plus their series, at one grain. */
export interface CardGrain {
  categories: string[];
  series: Series[];
  /** CSV heading for the category column. */
  categoryColumn: string;
}

export interface CardData extends CardGrain {
  /** Resolved at render time — some titles depend on the active filter. */
  title: string;
  /** Set when the grain was coarsened for readability. Printed on the card. */
  note: string | null;
  grain?: Grain;
  /**
   * The series before any condensing, when the two differ.
   *
   * The chart always draws the condensed form — that is the whole point of the
   * readability threshold. But the CSV is a data file, not a picture, and the
   * threshold does not apply to it, so the export offers both: `condensed` to
   * match the chart, `raw` for the underlying grain. Absent when nothing was
   * condensed, in which case the two are the same file.
   */
  raw?: CardGrain;
  /**
   * Coordinates for a card that prints as a map.
   *
   * Kept off `CardGrain` on purpose. `cardCsv` serialises
   * `categoryColumn`/`categories`/`series` and nothing else, so putting the
   * points here means the export keeps carrying postal codes and counts — the
   * raw data a reader can act on — while the printed page gets the picture.
   * Coordinates are a rendering detail derived from the postal code, not data
   * FEED holds about anyone, and they do not belong in a file a user takes
   * away.
   */
  map?: MapPoint[];
  /**
   * Headline figures printed above the chart, for a card that shows both.
   *
   * Recurring Availability is the case: four summary tiles over a per-item
   * chart. They are not rows of the card's dataset — they summarise it — so
   * folding them into `categories` would put "Repeat Episodes" in the same
   * column as "Spaghetti" and make the CSV nonsense. They print on the card
   * and are recorded in the manifest; the CSV carries the card's rows.
   *
   * A card whose tiles *are* its data (Recorded Donated Value) uses metric
   * rows instead, so its CSV has the figures.
   */
  tiles?: { label: string; value: string }[];
  /** Optional per-row pieces for a horizontal bar whose total remains one CSV row. */
  rowSegments?: Array<Array<{ name: string; value: number }>>;
  /** Stable legend/color order shared by every segmented row in the card. */
  segmentNames?: string[];
}

/** Which grain a CSV should carry. */
export type CsvGrain = 'condensed' | 'raw';

export interface AnalyticsCard {
  id: string;
  /** Fallback name for menus; `data().title` is what gets printed. */
  defaultTitle: string;
  lens: 'operations' | 'procurement' | 'service' | 'clients';
  /**
   * `chart` prints an SVG; `kpi` prints HTML tiles; `table` prints an HTML
   * table with a repeating header and rows that do not split across pages.
   *
   * Declared rather than inferred, because the two differ in ways callers care
   * about: a KPI card never condenses, and it legitimately renders tiles for an
   * empty range where a chart renders nothing.
   */
  kind: 'chart' | 'kpi' | 'table';
  /**
   * @param options this card's own controls, frozen when selection began.
   *   Cards whose state is fully described by the page filters ignore it.
   */
  data(analytics: unknown, options?: unknown): CardData;
  print(data: CardData): string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Single-series breakdown drawn as labelled horizontal bars. */
const breakdownPrint = (data: CardData): string =>
  hBarSvg(
    data.categories.map((label, i) => ({ label, value: data.series[0]?.values[i] ?? 0 }))
  );

export const ACQUISITION_MIX: AnalyticsCard = {
  id: 'procurement-acquisition-mix',
  kind: 'chart',
  defaultTitle: 'Acquisition Mix',
  lens: 'procurement',
  data: (analytics: any) => {
    const rows = (analytics?.acquisitionMix ?? [])
      .map((row: any) => ({
        // Labelled, not raw. The screen shows "Purch-Don", so the report does.
        label: ACQUISITION_LABELS[row.acquisitionClass] ?? row.acquisitionClass,
        value: toPounds(row.weightHundredths),
      }))
      .sort((a: any, b: any) => b.value - a.value);
    return {
      title: 'Acquisition Mix',
      categories: rows.map((r: any) => r.label),
      series: [{ name: 'inbound_weight_lb', values: rows.map((r: any) => r.value) }],
      categoryColumn: 'acquisition_class',
      note: null,
    };
  },
  print: breakdownPrint,
};

export const PROCUREMENT_CHANNELS: AnalyticsCard = {
  id: 'procurement-channels',
  kind: 'chart',
  defaultTitle: 'Procurement Channels',
  lens: 'procurement',
  data: (analytics: any) => {
    // Fresh Alliance carries its matched partners' pre-Primarius history
    // stacked on, so the bar reflects the whole relationship rather than only
    // the years OFB recorded (D16). The screen does this; omitting it here
    // understated the channel by the entire legacy total.
    const legacy = analytics?.summary?.freshAllianceLegacyWeightHundredths ?? 0;
    const rows = (analytics?.channelMix ?? [])
      .map((row: any) => ({
        label: CHANNEL_LABELS[row.channel] ?? row.channel,
        value: toPounds(
          row.channel === 'fresh_alliance' ? row.weightHundredths + legacy : row.weightHundredths
        ),
      }))
      .sort((a: any, b: any) => b.value - a.value);
    return {
      title: 'Procurement Channels',
      categories: rows.map((r: any) => r.label),
      series: [{ name: 'inbound_weight_lb', values: rows.map((r: any) => r.value) }],
      categoryColumn: 'channel',
      note: null,
    };
  },
  print: breakdownPrint,
};

/**
 * Inbound weight over time.
 *
 * Title *and* series set depend on the channel filter, exactly as on screen:
 *
 * - `ofb_warehouse` → "Warehouse Weight by Acquisition Class", four classes;
 * - `fresh_alliance` → "Fresh Food Alliance Weight Over Time", that one series;
 * - no filter → "Inbound Weight Over Time", one series per channel.
 *
 * The community series appears only when that history is actually loaded — it
 * is a single-agency sidecar (D22), so an always-present empty line would imply
 * every other agency has a source it will never have.
 */
export const INBOUND_WEIGHT_OVER_TIME: AnalyticsCard = {
  id: 'procurement-inbound-weight-over-time',
  kind: 'chart',
  defaultTitle: 'Inbound Weight Over Time',
  lens: 'procurement',
  data: (analytics: any) => {
    const monthly = analytics?.monthlyWeight ?? [];
    const channel: string | null = analytics?.filters?.channel ?? null;
    const hasCommunity = monthly.some((r: any) => (r.communityDonationWeightHundredths ?? 0) > 0);

    let title: string;
    let defs: [string, string][];
    if (channel === 'ofb_warehouse') {
      title = 'Warehouse Weight by Acquisition Class';
      defs = [
        [ACQUISITION_LABELS.DONATED, 'donatedWeightHundredths'],
        [ACQUISITION_LABELS['PURCH-DON'], 'purchDonWeightHundredths'],
        [ACQUISITION_LABELS.GOVERNMENT, 'governmentWeightHundredths'],
        [ACQUISITION_LABELS.PURCHASED, 'purchasedWeightHundredths'],
      ];
    } else if (channel === 'fresh_alliance') {
      title = 'Fresh Food Alliance Weight Over Time';
      defs = [[CHANNEL_LABELS.fresh_alliance, 'freshAllianceWeightHundredths']];
    } else {
      title = 'Inbound Weight Over Time';
      defs = [
        [CHANNEL_LABELS.ofb_warehouse, 'ofbWarehouseWeightHundredths'],
        [CHANNEL_LABELS.fresh_alliance, 'freshAllianceWeightHundredths'],
        ...(hasCommunity
          ? ([[CHANNEL_LABELS.community_donation, 'communityDonationWeightHundredths']] as [
              string,
              string,
            ][])
          : []),
      ];
    }

    const categories = monthly.map((r: any) => r.bucket);
    // Trimmed before condensing, so the grain step carries the coverage through
    // and a channel that ended mid-range stops at its last delivery. Series are
    // never dropped: the acquisition classes are a fixed taxonomy, and a report
    // whose rows change between ranges cannot be compared with another.
    const series = defs.map(([name, key]) => trimToData({
      name,
      values: monthly.map((r: any) => toPounds(r[key] ?? 0)),
    }));

    // Grain is chosen here, before either output, so the chart and the CSV
    // always describe the same buckets.
    const condensed = condenseTimeSeries(categories, series, { grain: grainOf(analytics) });

    return {
      title,
      categories: condensed.categories,
      series: condensed.series,
      categoryColumn: condensed.grain === 'month' ? 'month' : condensed.grain,
      note: condensed.note,
      grain: condensed.grain,
      raw: condensed.condensed
        ? { categories, series, categoryColumn: grainOf(analytics) }
        : undefined,
    };
  },
  print: data => stackedBarSvg(data.categories, data.series) + legendSvg(data.series.map(s => s.name)),
};


/** `pounds()` on the screen: two decimals, or "Unknown" for a null. */
const poundsLabel = (hundredths: number | null): string =>
  hundredths === null
    ? 'Unknown'
    : `${toPounds(hundredths).toLocaleString('en-US', { maximumFractionDigits: 2 })} lb`;

const countLabel = (n: number): string => n.toLocaleString('en-US');

/**
 * Inbound Supply Summary.
 *
 * The hardest parity case so far: the channel filter changes tile *labels* and
 * which tiles exist at all, across four conditions the screen derives
 * (`allChannels`, `includesWarehouse`, `includesFreshAlliance`, and the
 * fresh-alliance wording). Reproducing that faithfully is what "what you see is
 * what you get" costs on a card like this — ~45 lines rather than the ~7 a
 * chart card takes.
 *
 * Values are formatted here and carried as `text`, because the tiles mix
 * pounds, counts, and days; a single numeric column would be ambiguous in the
 * CSV. The numeric column is kept alongside for anything that can be summed.
 */
export const INBOUND_SUPPLY_SUMMARY: AnalyticsCard = {
  id: 'procurement-inbound-supply-summary',
  kind: 'kpi',
  defaultTitle: 'Inbound Supply Summary',
  lens: 'procurement',
  data: (analytics: any) => {
    const summary = analytics?.summary ?? {};
    const channel: string | null = analytics?.filters?.channel ?? null;
    const allChannels = channel === null;
    const isFreshAlliance = channel === 'fresh_alliance';
    const includesWarehouse = channel !== 'fresh_alliance';
    const includesFreshAlliance = channel !== 'ofb_warehouse';

    const tiles: { label: string; value: number | null; text: string }[] = [];
    const add = (label: string, value: number | null, text: string) =>
      tiles.push({ label, value, text });

    add(
      isFreshAlliance ? 'Partner Donation Weight' : 'Total Inbound Weight',
      summary.totalWeightHundredths ?? null,
      poundsLabel(summary.totalWeightHundredths ?? null)
    );
    if (allChannels) {
      add('Source Events', summary.sourceEventCount ?? 0, countLabel(summary.sourceEventCount ?? 0));
      add('OFB Warehouse Orders', summary.warehouseOrderCount ?? 0, countLabel(summary.warehouseOrderCount ?? 0));
      add('Fresh Food Alliance Receipts', summary.freshAllianceReceiptCount ?? 0, countLabel(summary.freshAllianceReceiptCount ?? 0));
    } else {
      add(
        isFreshAlliance ? 'Fresh Food Alliance Receipts' : 'OFB Warehouse Orders',
        summary.sourceEventCount ?? 0,
        countLabel(summary.sourceEventCount ?? 0)
      );
    }
    add('Receiving Dates', summary.receivingDateCount ?? 0, countLabel(summary.receivingDateCount ?? 0));

    if (!allChannels) {
      add(
        isFreshAlliance ? 'Typical Fresh Food Alliance Event' : 'Typical OFB Warehouse Event',
        summary.medianEventWeightHundredths ?? null,
        poundsLabel(summary.medianEventWeightHundredths ?? null)
      );
      const lower = summary.lowerQuartileEventWeightHundredths ?? null;
      const upper = summary.upperQuartileEventWeightHundredths ?? null;
      add(
        isFreshAlliance ? 'Middle 50% of Fresh Events' : 'Middle 50% of Warehouse Events',
        null,
        lower === null || upper === null ? 'Unknown' : `${poundsLabel(lower)}–${poundsLabel(upper)}`
      );
      add(
        isFreshAlliance ? 'Typical Category Lines' : 'Typical Order Lines',
        summary.medianLinesPerEvent ?? null,
        summary.medianLinesPerEvent?.toLocaleString('en-US', { maximumFractionDigits: 1 }) ?? 'Unknown'
      );
    }
    if (includesWarehouse) {
      add('Warehouse Products', summary.warehouseProductCodes ?? 0, countLabel(summary.warehouseProductCodes ?? 0));
    }
    if (includesFreshAlliance) {
      add('Fresh Food Alliance Categories', summary.freshAllianceCategoryCodes ?? 0, countLabel(summary.freshAllianceCategoryCodes ?? 0));
    }
    add(
      'Median Receiving Gap',
      summary.medianReceivingGapDays ?? null,
      summary.medianReceivingGapDays === null || summary.medianReceivingGapDays === undefined
        ? 'Insufficient history'
        : `${summary.medianReceivingGapDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} days`
    );

    return {
      title: 'Inbound Supply Summary',
      categories: tiles.map(t => t.label),
      series: [{
        name: 'value',
        values: tiles.map(t => t.value ?? 0),
        text: tiles.map(t => t.text),
      }],
      categoryColumn: 'metric',
      note: null,
    };
  },
  print: data =>
    kpiGrid(
      data.categories.map((label, i) => ({
        label,
        value: data.series[0]?.text?.[i] ?? String(data.series[0]?.values[i] ?? ''),
      }))
    ),
};


/** `dollars()` on the screen. Locale pinned — see the note below. */
const dollarsLabel = (cents: number): string =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * `dollars()` on the donor cards: whole dollars, no cents.
 *
 * Deliberately not `dollarsLabel`. The donor value is a sum of per-pound rates
 * across thousands of receipts, and the screen rounds it because the cents are
 * an artefact of the arithmetic rather than a figure anyone reported. Printing
 * `$12,345.00` beside a screen showing `$12,345` is exactly the drift the card
 * contract exists to prevent — it was caught here by a test, not by eye.
 */
const wholeDollarsLabel = (cents: number): string =>
  `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/** `attributableDollars()`: null means the figure cannot be attributed. */
const attributableDollarsLabel = (cents: number | null): string =>
  cents === null || cents === undefined ? 'Not attributable' : dollarsLabel(cents);

/**
 * Paid Procurement Summary.
 *
 * Absent entirely when the channel filter is Fresh Alliance, matching the
 * screen: those are donation receipts, so product charges do not apply. An
 * empty cost card there would imply the charges were zero rather than absent.
 *
 * Three of the four figures are nullable on purpose. Service fees, grants, and
 * net cost sit on the order, not the product line, so under an acquisition-class
 * filter they cannot be attributed to one class — the screen says "Not
 * attributable" rather than showing a number that would be a guess, and so does
 * the report.
 *
 * The screen formats these with `toLocaleString(undefined, ...)`, so its
 * currency grouping follows the viewer's locale. This pins en-US: a report is a
 * document that gets filed and re-read, and the same export should not differ
 * by who generated it. That leaves a small screen/report difference on
 * non-en-US browsers, which is the screen's drift to fix, not the report's to
 * copy.
 */
export const PAID_PROCUREMENT_SUMMARY: AnalyticsCard = {
  id: 'procurement-paid-summary',
  kind: 'kpi',
  defaultTitle: 'Paid Procurement Summary',
  lens: 'procurement',
  data: (analytics: any) => {
    const summary = analytics?.summary ?? {};
    const isFreshAlliance = analytics?.filters?.channel === 'fresh_alliance';

    const tiles: { label: string; value: number | null; text: string }[] = isFreshAlliance
      ? []
      : [
          {
            label: 'Gross Product Charges',
            value: summary.calculatedGrossProductChargesCents ?? 0,
            text: dollarsLabel(summary.calculatedGrossProductChargesCents ?? 0),
          },
          {
            label: 'Service Fees',
            value: summary.serviceFeesCents ?? null,
            text: attributableDollarsLabel(summary.serviceFeesCents ?? null),
          },
          {
            label: 'Grants Applied',
            value: summary.grantsAppliedCents ?? null,
            text: attributableDollarsLabel(summary.grantsAppliedCents ?? null),
          },
          {
            label: 'Net Recorded Charge',
            value: summary.netRecordedCostCents ?? null,
            text: attributableDollarsLabel(summary.netRecordedCostCents ?? null),
          },
        ];

    return {
      title: 'Paid Procurement Summary',
      categories: tiles.map(t => t.label),
      series: [
        { name: 'value_cents', values: tiles.map(t => t.value ?? 0), text: tiles.map(t => t.text) },
      ],
      categoryColumn: 'metric',
      note: isFreshAlliance
        ? 'Not applicable to Fresh Food Alliance, which records donations rather than purchases.'
        : null,
    };
  },
  print: data =>
    kpiGrid(
      data.categories.map((label, i) => ({
        label,
        value: data.series[0]?.text?.[i] ?? String(data.series[0]?.values[i] ?? ''),
      }))
    ),
};


/**
 * Where Paid Procurement Dollars Went.
 *
 * The first card whose own control reaches the report. Its search box is not a
 * page filter, so without `options` an export would show the unfiltered top 15
 * while the screen showed three matching rows — a report that looks right and
 * is not what was asked for.
 *
 * Mirrors the screen exactly: with a query, the matching products up to the
 * search limit; without one, the top 15 by spend plus a grouped tail. The tail
 * is grouped because individually those products are hairlines — the largest is
 * about 1% of paid spend — so stacking them would be unreadable.
 */
const PAID_PRODUCT_SEARCH_LIMIT = 25;
const PAID_PRODUCT_TOP_N = 15;
const UNCLASSIFIED_PRODUCT_FAMILY = 'Unclassified';

/** Mirrors the screen's display-only family grouping for paid product names. */
const paidProductFamily = (description: string): string => {
  const match = /^([^,]{2,40}),/.exec(description.trim());
  if (!match) return UNCLASSIFIED_PRODUCT_FAMILY;
  const family = match[1].trim();
  return family.length > 0 ? family : UNCLASSIFIED_PRODUCT_FAMILY;
};

export const PAID_PRODUCT_SPEND: AnalyticsCard = {
  id: 'procurement-paid-product-spend',
  kind: 'chart',
  defaultTitle: 'Where Paid Procurement Dollars Went',
  lens: 'procurement',
  data: (analytics: any, options?: any) => {
    const products = analytics?.paidProducts ?? [];
    const query = String(options?.search ?? '').trim().toLocaleLowerCase();

    let rows: { label: string; value: number; segments: { name: string; value: number }[] }[];
    let note: string | null = null;

    if (query.length > 0) {
      const matches = products.filter(
        (p: any) =>
          p.description.toLocaleLowerCase().includes(query) ||
          p.productCode.toLocaleLowerCase().includes(query)
      );
      rows = matches
        .slice(0, PAID_PRODUCT_SEARCH_LIMIT)
        .map((p: any) => ({
          label: p.description,
          value: p.totalSpendCents / 100,
          segments: [{ name: paidProductFamily(p.description), value: p.totalSpendCents / 100 }],
        }));
      // Stated on the card: a filtered report that does not say it is filtered
      // is the misread this whole contract exists to prevent.
      note =
        `Filtered to "${options.search}" — ${matches.length} matching product` +
        `${matches.length === 1 ? '' : 's'}` +
        (matches.length > PAID_PRODUCT_SEARCH_LIMIT
          ? `, showing the first ${PAID_PRODUCT_SEARCH_LIMIT}.`
          : '.');
    } else {
      rows = products
        .slice(0, PAID_PRODUCT_TOP_N)
        .map((p: any) => ({
          label: p.description,
          value: p.totalSpendCents / 100,
          segments: [{ name: paidProductFamily(p.description), value: p.totalSpendCents / 100 }],
        }));
      const tail = products.slice(PAID_PRODUCT_TOP_N);
      const tailCents = tail.reduce((sum: number, p: any) => sum + p.totalSpendCents, 0);
      if (tailCents > 0) {
        const familyCents = new Map<string, number>();
        for (const product of tail) {
          const family = paidProductFamily(product.description);
          familyCents.set(family, (familyCents.get(family) ?? 0) + product.totalSpendCents);
        }
        rows.push({
          label: `Other paid products (${tail.length} ${tail.length === 1 ? 'code' : 'codes'})`,
          value: tailCents / 100,
          segments: [...familyCents.entries()]
            .map(([name, cents]) => ({ name, value: cents / 100 }))
            .sort((left, right) => right.value - left.value),
        });
      }
    }

    const segmentTotals = new Map<string, number>();
    for (const row of rows) {
      for (const segment of row.segments) {
        segmentTotals.set(segment.name, (segmentTotals.get(segment.name) ?? 0) + segment.value);
      }
    }
    const segmentNames = [...segmentTotals.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([name]) => name);

    return {
      title: 'Where Paid Procurement Dollars Went',
      categories: rows.map(r => r.label),
      series: [{ name: 'spend_usd', values: rows.map(r => r.value) }],
      categoryColumn: 'product',
      note,
      rowSegments: rows.map(row => row.segments),
      segmentNames,
    };
  },
  // Dollars, not the default pounds. This card printed "43,245 lb" for
  // $43,245 of spend until the unit became the caller's business.
  print: data =>
    hBarSvg(
      data.categories.map((label, i) => ({
        label,
        value: data.series[0]?.values[i] ?? 0,
        segments: data.rowSegments?.[i],
      })),
      900,
      30,
      DOLLARS,
      data.segmentNames
    ) + legendSvg(data.segmentNames ?? []),
};


const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Seasonal Inbound Weight — twelve months across, one series per compared year.
 *
 * Not a time series: the x-axis is the calendar month, so it never condenses.
 * Twelve categories are always printable.
 *
 * Two card-level controls travel in `options`:
 *
 * - `channel` — the card offers its own breakdown *only* when the page filter
 *   is All Channels; otherwise the payload is already scoped and a second
 *   control could contradict the filter visible at the top of the page
 *   (procurement-unification-plan.md: one source of truth). The client sends
 *   the effective value, so that resolution is not duplicated here.
 * - `yearMode` / `years` — an explicit subset is persisted; the automatic
 *   default is re-derived from the run-time payload so a saved template's new
 *   date range is not narrowed by the range from which it was saved.
 */
export const SEASONAL_INBOUND_WEIGHT: AnalyticsCard = {
  id: 'procurement-seasonal-inbound-weight',
  kind: 'chart',
  defaultTitle: 'Seasonal Inbound Weight',
  lens: 'procurement',
  data: (analytics: any, options?: any) => {
    const channel: string = options?.channel ?? 'all';
    const years: string[] = options?.yearMode === 'selected'
      ? (Array.isArray(options?.years) ? options.years : [])
      : (analytics?.availableYears ?? []);

    // Same source split the screen uses: the all-channel series is
    // pre-aggregated, the per-channel one is not and must be summed.
    const points =
      channel === 'all'
        ? (analytics?.seasonalWeight ?? []).map((p: any) => ({ ...p, channel: 'all' }))
        : (analytics?.seasonalChannelWeight ?? []).filter((p: any) => p.channel === channel);

    const now = new Date();
    const inProgress = { year: String(now.getFullYear()), monthNumber: now.getMonth() + 1 };
    const droppedInProgress = years.includes(inProgress.year)
      && points.some((p: any) =>
        String(p.year) === inProgress.year && p.month === inProgress.monthNumber);

    const startMonth = String(analytics?.range?.startDate ?? '').slice(0, 7);
    const endMonth = String(analytics?.range?.endDate ?? '').slice(0, 7);
    const hasResolvedCoverage = /^\d{4}-\d{2}$/.test(startMonth) && /^\d{4}-\d{2}$/.test(endMonth);

    const series = years.map(year => {
      const values = new Array(12).fill(0);
      for (const point of points) {
        if (String(point.year) !== String(year)) continue;
        values[point.month - 1] += toPounds(point.weightHundredths);
      }
      const defined = MONTH_LABELS.map((_, index) => {
        // The month in progress is dropped for the same reason the screen
        // drops it: half a month beside eleven whole ones reads as a collapse
        // in supply rather than a month that has not finished.
        if (year === inProgress.year && index + 1 === inProgress.monthNumber) return false;
        if (!hasResolvedCoverage) return true;
        const month = `${year}-${String(index + 1).padStart(2, '0')}`;
        return month >= startMonth && month <= endMonth;
      });
      return { name: year, values, defined };
    });

    return {
      title: 'Seasonal Inbound Weight',
      categories: MONTH_LABELS,
      series,
      categoryColumn: 'month',
      note: (() => {
        if (years.length === 0) {
          return 'No calendar years were selected for comparison, so this card is empty.';
        }
        const parts = [
          channel === 'all' ? null : `${CHANNEL_LABELS[channel] ?? channel} only.`,
          droppedInProgress
            ? `${MONTH_LABELS[inProgress.monthNumber - 1]} ${inProgress.year} is still in progress and is not plotted.`
            : null,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(' ') : null;
      })(),
    };
  },
  // Lines, not stacked bars: stacking years would sum unrelated periods into a
  // total the screen never shows and nobody asked for.
  print: data =>
    lineChartSvg(data.categories, data.series) + legendSvg(data.series.map(s => s.name), 900, 'line'),
};


/** `formatDuration()` on the screen. */
const durationLabel = (hours: number | null): string => {
  if (hours === null || hours === undefined) return 'Unknown';
  return hours < 24 ? `${hours.toFixed(1)} hr` : `${(hours / 24).toFixed(1)} days`;
};

/**
 * Availability Summary — the first Operations card.
 *
 * Composite on screen: three current-state counts as a horizontal bar chart,
 * beside four figures about the range. Printed the same way, in one card,
 * because splitting them would invent two cards the screen does not have.
 *
 * The caveat travels with it. "Limited Supply is included in Available Now"
 * appears on screen, and without it the three bars look like a partition of the
 * catalogue and do not add up.
 */
export const AVAILABILITY_SUMMARY: AnalyticsCard = {
  id: 'operations-availability-summary',
  kind: 'kpi',
  defaultTitle: 'Availability Summary',
  lens: 'operations',
  data: (analytics: any) => {
    const summary = analytics?.summary ?? {};
    const counts = [
      { label: 'Available Now', value: summary.availableNow ?? 0 },
      { label: 'Unavailable Now', value: summary.unavailableNow ?? 0 },
      { label: 'Limited Supply', value: summary.limitedSupplyNow ?? 0 },
    ];
    const figures = [
      { label: 'Repeat Unavailability', value: summary.repeatUnavailableItems ?? 0, text: String(summary.repeatUnavailableItems ?? 0) },
      { label: 'Item Limits', value: summary.itemRationedNow ?? 0, text: String(summary.itemRationedNow ?? 0) },
      { label: 'Category Limits', value: summary.categoryRationedNow ?? 0, text: String(summary.categoryRationedNow ?? 0) },
      {
        label: 'Median Restoration',
        value: summary.medianRestorationHours ?? 0,
        text: durationLabel(summary.medianRestorationHours ?? null),
      },
    ];

    const all = [
      ...counts.map(c => ({ ...c, text: String(c.value) })),
      ...figures,
    ];

    return {
      title: 'Availability Summary',
      categories: all.map(r => r.label),
      series: [{ name: 'value', values: all.map(r => r.value), text: all.map(r => r.text) }],
      categoryColumn: 'metric',
      note: 'Current recorded state; Limited Supply is included in Available Now.',
    };
  },
  // Bars for the three counts, tiles for the four range figures — the same
  // split the screen makes.
  print: data => {
    const bars = data.categories.slice(0, 3).map((label, i) => ({
      label,
      value: data.series[0]?.values[i] ?? 0,
    }));
    const tiles = data.categories.slice(3).map((label, i) => ({
      label,
      value: data.series[0]?.text?.[i + 3] ?? '',
    }));
    return hBarSvg(bars, 900, 34, COUNT) + kpiGrid(tiles);
  },
};


/**
 * Fresh Food Alliance Category Mix — categories broken down by donor.
 *
 * Donor identity comes from the OFB Agency Pickups export and is never inferred
 * beyond what it reports.
 *
 * The donor filter is a card-level control shared with the table beneath it, so
 * narrowing there narrows this chart. It travels in `options.donorCodes`; a
 * report generated with three donors selected must not quietly show all of
 * them. Absent, every donor is included — matching the screen's default.
 *
 * Legend order is by total weight across all categories, the same convention
 * the paid-product family legend uses, so the biggest contributor is first
 * wherever a legend appears.
 */
export const FRESH_ALLIANCE_CATEGORY_MIX: AnalyticsCard = {
  id: 'procurement-fresh-alliance-category-mix',
  kind: 'chart',
  defaultTitle: 'Fresh Food Alliance Category Mix',
  lens: 'procurement',
  data: (analytics: any, options?: any) => {
    const NOT_REPORTED = 'NOT_REPORTED';
    const selected: string[] | null = Array.isArray(options?.donorCodes)
      ? options.donorCodes
      : null;

    const rows = (analytics?.freshAllianceDonorCategories ?? []).filter((row: any) =>
      selected === null ? true : selected.includes(row.donorCode ?? NOT_REPORTED)
    );

    // Category → donor → pounds. The "(Fresh Alliance)" suffix is stripped
    // because every row here is Fresh Alliance; repeating it in each label
    // costs width that the donor segments need.
    const byCategory = new Map<string, Map<string, number>>();
    const donorTotals = new Map<string, number>();
    for (const row of rows) {
      const category = row.description.replace(/\s*\(Fresh Alliance\)\s*$/i, '');
      const segments = byCategory.get(category) ?? new Map<string, number>();
      const pounds = toPounds(row.totalWeightHundredths);
      segments.set(row.donorName, (segments.get(row.donorName) ?? 0) + pounds);
      byCategory.set(category, segments);
      donorTotals.set(row.donorName, (donorTotals.get(row.donorName) ?? 0) + pounds);
    }

    const categories = [...byCategory.entries()]
      .map(([category, segments]) => ({
        category,
        total: [...segments.values()].reduce((sum, v) => sum + v, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .map(entry => entry.category);

    const donors = [...donorTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([donor]) => donor);

    const series = donors.map(donor => ({
      name: donor,
      values: categories.map(category => byCategory.get(category)?.get(donor) ?? 0),
    }));

    return {
      title: 'Fresh Food Alliance Category Mix',
      categories,
      series,
      categoryColumn: 'category',
      note:
        selected !== null && donors.length > 0
          ? `Narrowed to ${donors.length} donor${donors.length === 1 ? '' : 's'}.`
          : null,
    };
  },
  print: data =>
    stackedHBarSvg(data.categories, data.series) + legendSvg(data.series.map(s => s.name)),
};


/** Percent, or a dash where the signal could not be computed. */
const percentLabel = (value: number | null): string =>
  value === null || value === undefined ? '—' : `${value.toFixed(1)}%`;

/**
 * Category Pressure — four independent signals per category.
 *
 * Grouped bars, never stacked. The card's own description on screen calls these
 * "independent service-pressure signals"; adding them together would produce a
 * combined bar length that means nothing. This is the same judgement the
 * seasonal card required in reverse: what the bars *are* decides the primitive,
 * not what looks tidier.
 *
 * A null percent means the signal could not be computed for that category, not
 * zero pressure. It prints as an em dash in the CSV and as no bar in the chart,
 * which is what the screen does.
 */
export const CATEGORY_PRESSURE: AnalyticsCard = {
  id: 'operations-category-pressure',
  kind: 'chart',
  defaultTitle: 'Category Pressure',
  lens: 'operations',
  data: (analytics: any) => {
    const rows = analytics?.categoryPressure ?? [];
    const defs: [string, string][] = [
      ['Limited Supply', 'limitedSupplyServicePercent'],
      ['Clearance', 'clearanceServicePercent'],
      ['Item Limits', 'itemRationedServicePercent'],
      ['Category Limits', 'categoryRationedServicePercent'],
    ];

    return {
      title: 'Category Pressure',
      categories: rows.map((r: any) => r.categoryName),
      series: defs.map(([name, key]) => ({
        name,
        values: rows.map((r: any) => r[key] ?? 0),
        text: rows.map((r: any) => percentLabel(r[key] ?? null)),
        defined: rows.map((r: any) => r[key] !== null && r[key] !== undefined),
      })),
      categoryColumn: 'category',
      note:
        rows.length === 0
          ? 'No category pressure was recorded in this range.'
          : 'Independent signals — the four are not parts of one total.',
    };
  },
  print: data =>
    groupedHBarSvg(data.categories, data.series, 900, 13, {
      max: 100,
      showAxis: true,
      formatValue: PERCENT,
    }) + legendSvg(data.series.map(s => s.name)),
};


/**
 * A table column, mirrored from the frontend's ColumnDef.
 *
 * The frontend owns how a column looks; this owns how it prints. They are
 * duplicated because the packages share no module — the same situation as the
 * label maps, and covered the same way, by a parity test that reads both from
 * source.
 */
interface TableColumn<T> {
  /** Must match the frontend's `accessorKey`, since sorting travels by id. */
  id: string;
  header: string;
  align?: 'left' | 'right';
  /** Display text. Formatting lives here so the CSV and the PDF cannot differ. */
  text: (row: T) => string;
  /** Sort key. Sorting on formatted text would order "$9" after "$10". */
  sortValue: (row: T) => number | string;
  /** Included in the free-text filter, matching the screen's filter column. */
  searchable?: boolean;
}

/**
 * Applies the table controls a user configured on screen.
 *
 * Re-derived server-side rather than sent as resolved rows, because a saved
 * template regenerates months later with no client to resolve anything. The
 * order is the order TanStack applies it: filter, then sort, then page.
 */
function applyTableOptions<T>(
  rows: T[],
  columns: TableColumn<T>[],
  options: any
): { rows: T[]; columns: TableColumn<T>[]; total: number; note: string | null } {
  const search = String(options?.search ?? '').trim().toLocaleLowerCase();
  const sort = options?.sort as { id?: string; desc?: boolean } | undefined;
  const visible: string[] | null = Array.isArray(options?.visibleColumns)
    ? options.visibleColumns
    : null;
  const pageSize = Number(options?.pageSize) > 0 ? Number(options.pageSize) : null;
  const pageIndex = Number(options?.pageIndex) > 0 ? Number(options.pageIndex) : 0;

  let working = rows;
  if (search.length > 0) {
    const searchable = columns.filter(c => c.searchable);
    working = working.filter(row =>
      searchable.some(c => c.text(row).toLocaleLowerCase().includes(search))
    );
  }

  if (sort?.id) {
    const column = columns.find(c => c.id === sort.id);
    if (column) {
      working = [...working].sort((a, b) => {
        const left = column.sortValue(a);
        const right = column.sortValue(b);
        const compared =
          typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left).localeCompare(String(right));
        return sort.desc ? -compared : compared;
      });
    }
  }

  const total = working.length;
  const notes: string[] = [];
  if (search.length > 0) notes.push(`filtered to "${options.search}"`);
  if (pageSize !== null) {
    const start = pageIndex * pageSize;
    working = working.slice(start, start + pageSize);
    if (total > working.length) {
      notes.push(
        `showing rows ${start + 1}–${start + working.length} of ${total.toLocaleString('en-US')}`
      );
    }
  }

  const shown = visible ? columns.filter(c => visible.includes(c.id)) : columns;

  return {
    rows: working,
    columns: shown.length > 0 ? shown : columns,
    total,
    note: notes.length > 0 ? `Table ${notes.join(', ')}.` : null,
  };
}

/** Builds a CardData from a table's resolved view. */
function tableCardData<T>(
  title: string,
  rows: T[],
  columns: TableColumn<T>[],
  options: any
): CardData {
  const view = applyTableOptions(rows, columns, options);
  return {
    title,
    // The first column is the row label; the rest are the series.
    categories: view.rows.map(row => view.columns[0].text(row)),
    series: view.columns.slice(1).map(column => ({
      name: column.header,
      values: view.rows.map(row => {
        const value = column.sortValue(row);
        return typeof value === 'number' ? value : 0;
      }),
      text: view.rows.map(row => column.text(row)),
    })),
    categoryColumn: view.columns[0].header,
    note: view.note,
  };
}

const warehouseColumns: TableColumn<any>[] = [
  { id: 'description', header: 'Product', text: r => r.description, sortValue: r => r.description, searchable: true },
  { id: 'productCode', header: 'Code', text: r => r.productCode, sortValue: r => r.productCode, searchable: true },
  {
    id: 'acquisitionClass',
    header: 'Acquisition',
    text: r => ACQUISITION_LABELS[r.acquisitionClass] ?? r.acquisitionClass,
    sortValue: r => r.acquisitionClass,
  },
  { id: 'receiptDateCount', header: 'Receipt Dates', align: 'right', text: r => String(r.receiptDateCount), sortValue: r => r.receiptDateCount },
  {
    id: 'totalWeightHundredths',
    header: 'Total Weight',
    align: 'right',
    text: r => poundsLabel(r.totalWeightHundredths),
    sortValue: r => r.totalWeightHundredths,
  },
  {
    id: 'totalSpendCents',
    header: 'Total Charges',
    align: 'right',
    // The screen shows an em dash for an unpaid product rather than $0.00,
    // which would read as "we paid nothing" instead of "this was donated".
    text: r => (r.totalSpendCents > 0 ? dollarsLabel(r.totalSpendCents) : '—'),
    sortValue: r => r.totalSpendCents,
  },
  {
    id: 'costPerPaidPoundCents',
    header: 'Cost / Paid lb',
    align: 'right',
    text: r => (r.costPerPaidPoundCents ? dollarsLabel(r.costPerPaidPoundCents) : '—'),
    sortValue: r => r.costPerPaidPoundCents ?? 0,
  },
  { id: 'lastReceivedDate', header: 'Last Received', text: r => r.lastReceivedDate ?? '—', sortValue: r => r.lastReceivedDate ?? '' },
];

/**
 * OFB Warehouse Product History — the first table card.
 *
 * Every control the user configured travels: the filter, the sort, which
 * columns are visible, and how many rows a page shows. A hundred-row export is
 * a legitimate thing to ask for, and printing it properly saves the trip
 * through Excel.
 */
export const WAREHOUSE_PRODUCT_HISTORY: AnalyticsCard = {
  id: 'procurement-warehouse-product-history',
  kind: 'table',
  defaultTitle: 'OFB Warehouse Product History',
  lens: 'procurement',
  data: (analytics: any, options?: any) =>
    tableCardData(
      'OFB Warehouse Product History',
      analytics?.warehouseProducts ?? [],
      warehouseColumns,
      options
    ),
  print: data => {
    const headers = [data.categoryColumn, ...data.series.map(s => s.name)];
    const rows = data.categories.map((category, i) => [
      category,
      ...data.series.map(s => s.text?.[i] ?? String(s.values[i] ?? '')),
    ]);
    const aligns = headers.map((_, i) =>
      i === 0 ? ('left' as const) : ('right' as const)
    );
    return tableHtml(headers, rows, aligns);
  },
};


/**
 * `formatDate` from the frontend's shared formatter: m/d/yyyy, no leading zeros.
 *
 * Pinned to en-US for the same reason the currency is — a filed document must
 * not read differently depending on who generated it. The screen's formatter is
 * already locale-pinned (docs/layout/table-standard.md), so this matches it
 * rather than diverging.
 */
const tableDateLabel = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

const freshAllianceColumns: TableColumn<any>[] = [
  { id: 'donorName', header: 'Donor', text: r => r.donorName, sortValue: r => r.donorName, searchable: true },
  { id: 'description', header: 'Category', text: r => r.description, sortValue: r => r.description, searchable: true },
  { id: 'productCode', header: 'Source Code', text: r => r.productCode ?? '—', sortValue: r => r.productCode ?? '' },
  { id: 'receiptEventCount', header: 'Receipt Events', align: 'right', text: r => String(r.receiptEventCount), sortValue: r => r.receiptEventCount },
  { id: 'receivingDateCount', header: 'Receiving Dates', align: 'right', text: r => String(r.receivingDateCount), sortValue: r => r.receivingDateCount },
  {
    id: 'totalWeightHundredths',
    header: 'Total Weight',
    align: 'right',
    text: r => poundsLabel(r.totalWeightHundredths),
    sortValue: r => r.totalWeightHundredths,
  },
  { id: 'lastReceivedDate', header: 'Last Pickup', text: r => tableDateLabel(r.lastReceivedDate), sortValue: r => r.lastReceivedDate ?? '' },
];

/**
 * Fresh Food Alliance Receipt Categories.
 *
 * Two layers of user configuration, and both must survive. The donor filter is
 * a card-level control shared with the chart above it, and it narrows the rows
 * *before* the table's own filter and sort see them — the same order the screen
 * applies, since the table is handed already-filtered rows.
 */
export const FRESH_ALLIANCE_RECEIPT_CATEGORIES: AnalyticsCard = {
  id: 'procurement-fresh-alliance-receipt-categories',
  kind: 'table',
  defaultTitle: 'Fresh Food Alliance Receipt Categories',
  lens: 'procurement',
  data: (analytics: any, options?: any) => {
    const NOT_REPORTED = 'NOT_REPORTED';
    const donorCodes: string[] | null = Array.isArray(options?.donorCodes)
      ? options.donorCodes
      : null;

    const rows = (analytics?.freshAllianceDonorCategories ?? []).filter((row: any) =>
      donorCodes === null ? true : donorCodes.includes(row.donorCode ?? NOT_REPORTED)
    );

    const data = tableCardData(
      'Fresh Food Alliance Receipt Categories',
      rows,
      freshAllianceColumns,
      options
    );

    // The donor filter is stated separately from the table's own filter,
    // because they are different controls and a reader cannot tell which
    // narrowed the rows otherwise.
    const donorNote =
      donorCodes !== null
        ? `Donors narrowed to ${donorCodes.length}.`
        : null;

    return {
      ...data,
      note: [donorNote, data.note].filter(Boolean).join(' ') || null,
    };
  },
  print: WAREHOUSE_PRODUCT_HISTORY.print,
};


/**
 * Available Assortment Over Time.
 *
 * The combined assortment as an area, each category as a line inside it — the
 * hierarchy the screen draws, and the reason the area matters: the total is the
 * envelope, not another category.
 *
 * The card's category selector travels in `options.categoryId`. Choosing one
 * category on screen drops the others *and* the combined area, because with a
 * single category the two would be the same line drawn twice.
 *
 * Dates on the axis are `MMM d`, which the table standard exempts from the
 * m/d/yyyy rule: an axis is a scale, not a record.
 */
export const AVAILABLE_ASSORTMENT_OVER_TIME: AnalyticsCard = {
  id: 'operations-available-assortment',
  kind: 'chart',
  defaultTitle: 'Available Assortment Over Time',
  lens: 'operations',
  data: (analytics: any, options?: any) => {
    const timeline = analytics?.timeline ?? [];
    const allSeries = analytics?.assortmentCategorySeries ?? [];
    const categoryId =
      options?.categoryId === undefined || options?.categoryId === null || options?.categoryId === 'all'
        ? null
        : Number(options.categoryId);

    const chosen =
      categoryId === null
        ? allSeries
        : allSeries.filter((s: any) => s.categoryId === categoryId);

    const axis = timeline.map((point: any) => {
      const date = new Date(`${point.date}T00:00:00Z`);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    });

    const series = [
      // Combined first so the area renders behind the category lines. Dropped
      // when one category is selected: it would duplicate that category's line.
      ...(categoryId === null
        ? [{ name: 'Combined', values: timeline.map((p: any) => p.available ?? 0) }]
        : []),
      ...chosen.map((s: any) => ({
        name: s.categoryName,
        values: timeline.map((p: any) => p.availableByCategory?.[String(s.categoryId)] ?? 0),
      })),
    ];

    return {
      title: 'Available Assortment Over Time',
      categories: axis,
      series,
      categoryColumn: 'date',
      note:
        categoryId === null
          ? null
          : `Narrowed to ${chosen[0]?.categoryName ?? 'one category'}.`,
    };
  },
  print: data =>
    lineChartSvg(data.categories, data.series, 900, 300, true) +
    legendSvg(data.series.map(s => s.name), 900, 'line'),
};


/**
 * `formatDateTime` from the frontend's shared formatter: `7/11/2026 3:04 PM`.
 *
 * Composed from two formatters joined by a space, exactly as
 * `lib/formatting/date.ts` does. A single `toLocaleString` call is the obvious
 * shortcut and produces `7/11/2026, 3:04 PM` — with a comma the screen never
 * shows. That is the drift this whole contract exists to catch, and it got as
 * far as a rendered CSV before being noticed.
 */
const dateTimeLabel = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const day = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
};

const RESOLUTION_LABELS: Record<string, string> = {
  restored: 'Restored',
  deleted: 'Item deleted',
  open_at_range_end: 'Ongoing',
};

const episodeColumns: TableColumn<any>[] = [
  { id: 'itemName', header: 'Name', text: r => r.itemName, sortValue: r => r.itemName, searchable: true },
  { id: 'categoryName', header: 'Category', text: r => r.categoryName ?? '—', sortValue: r => r.categoryName ?? '', searchable: true },
  { id: 'startedAt', header: 'Unavailable Since', text: r => dateTimeLabel(r.startedAt), sortValue: r => r.startedAt ?? '' },
  {
    id: 'endedAt',
    header: 'Available Again',
    // "Ongoing", not a blank: the episode has not ended, which is different
    // from an unknown end. Sorted as the most recent end, matching the
    // screen's sortingFn, so ongoing episodes group together at one end.
    text: r => (r.endedAt ? dateTimeLabel(r.endedAt) : 'Ongoing'),
    sortValue: r => r.endedAt ?? '\uFFFF',
  },
  { id: 'durationHours', header: 'Duration', align: 'right', text: r => durationLabel(r.durationHours), sortValue: r => r.durationHours ?? 0 },
  { id: 'resolution', header: 'Resolution', text: r => RESOLUTION_LABELS[r.resolution] ?? r.resolution, sortValue: r => r.resolution },
];

const limitColumns: TableColumn<any>[] = [
  { id: 'entityName', header: 'Name', text: r => r.entityName, sortValue: r => r.entityName, searchable: true },
  { id: 'entityType', header: 'Type', text: r => (r.entityType === 'food_item' ? 'Food Item' : 'Category'), sortValue: r => r.entityType },
  { id: 'categoryName', header: 'Category', text: r => r.categoryName ?? '—', sortValue: r => r.categoryName ?? '', searchable: true },
  {
    id: 'limit',
    header: 'Limit',
    align: 'right',
    // "No Limit" is a real policy, not a missing value. Printing the sentinel
    // number instead would read as a limit of that size.
    text: r => (r.isNoLimit ? 'No Limit' : String(r.limit)),
    sortValue: r => (r.isNoLimit ? Number.MAX_SAFE_INTEGER : (r.limit ?? 0)),
  },
  {
    id: 'limitType',
    header: 'Applies To',
    text: r => (r.isNoLimit ? '—' : r.limitType === 'person' ? 'Per Person' : 'Per Household'),
    sortValue: r => r.limitType ?? '',
  },
  { id: 'recordedAt', header: 'Changed', text: r => dateTimeLabel(r.recordedAt), sortValue: r => r.recordedAt ?? '' },
];

export const UNAVAILABLE_EPISODES: AnalyticsCard = {
  id: 'operations-unavailable-episodes',
  kind: 'table',
  defaultTitle: 'Unavailable Episodes',
  lens: 'operations',
  data: (analytics: any, options?: any) =>
    tableCardData('Unavailable Episodes', analytics?.episodes ?? [], episodeColumns, options),
  print: WAREHOUSE_PRODUCT_HISTORY.print,
};

export const RATIONING_HISTORY: AnalyticsCard = {
  id: 'operations-rationing-history',
  kind: 'table',
  defaultTitle: 'Rationing History',
  lens: 'operations',
  data: (analytics: any, options?: any) =>
    tableCardData('Rationing History', analytics?.limitChanges ?? [], limitColumns, options),
  print: WAREHOUSE_PRODUCT_HISTORY.print,
};

/**
 * Recurring Availability.
 *
 * Four summary tiles over a per-item chart, the way the screen draws it. The
 * chart is grouped rather than stacked: unavailable entries and restorations
 * are independent counts of the same item, and stacking them would produce a
 * combined bar that means nothing — an item can be restored fewer times than
 * it went unavailable, which is the interesting case, and stacking hides it.
 *
 * The screen takes the top eight; so does this, or the report would show a
 * cohort the user never saw.
 */
export const RECURRING_AVAILABILITY: AnalyticsCard = {
  id: 'operations-recurring-availability',
  kind: 'chart',
  defaultTitle: 'Recurring Availability',
  lens: 'operations',
  data: (analytics: any) => {
    const summary = analytics?.summary ?? {};
    const items = (analytics?.recurringAvailability ?? []).slice(0, 8);

    return {
      title: 'Recurring Availability',
      categories: items.map((item: any) => item.itemName),
      series: [
        { name: 'Unavailable Entries', values: items.map((i: any) => i.unavailableEntries ?? 0) },
        { name: 'Restorations', values: items.map((i: any) => i.restorations ?? 0) },
      ],
      categoryColumn: 'item',
      tiles: [
        { label: 'Recurring Items', value: countLabel(summary.repeatUnavailableItems ?? 0) },
        { label: 'Repeat Episodes', value: countLabel(summary.recurringUnavailableEntries ?? 0) },
        { label: 'Currently Unavailable', value: countLabel(summary.recurringOngoingEpisodes ?? 0) },
        {
          label: 'Recurring Median Restoration',
          value: durationLabel(summary.recurringMedianRestorationHours ?? null),
        },
      ],
      note:
        items.length === 0
          ? 'No items completed enough availability cycles to enter the recurring cohort in this date range.'
          : null,
    };
  },
  print: data =>
    kpiGrid(data.tiles ?? []) +
    groupedHBarSvg(data.categories, data.series, 900, 13, {
      showAxis: true,
      formatValue: COUNT,
    }) +
    legendSvg(data.series.map(s => s.name)),
};


/**
 * Operational Pressure.
 *
 * One line per limit configuration present in the range, alongside Limited
 * Supply, Clearance, and a count of categories carrying a limit. Category rules
 * are never expanded into implied Food Item counts — a category limit applies
 * to a category, and multiplying it out would invent item-level rationing the
 * pantry never recorded.
 */
export const OPERATIONAL_PRESSURE: AnalyticsCard = {
  id: 'operations-operational-pressure',
  kind: 'chart',
  defaultTitle: 'Operational Pressure',
  lens: 'operations',
  data: (analytics: any) => {
    const timeline = analytics?.timeline ?? [];
    const limitSeries = analytics?.rationedLimitSeries ?? [];

    const categories = timeline.map((point: any) => {
      const date = new Date(`${point.date}T00:00:00Z`);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    });

    const series: Series[] = [
      { name: 'Limited Supply', values: timeline.map((p: any) => p.limitedSupply ?? 0) },
      { name: 'Clearance', values: timeline.map((p: any) => p.clearance ?? 0) },
      { name: 'Categories with Limits', values: timeline.map((p: any) => p.categoryRationed ?? 0) },
      ...limitSeries.map((limit: any) => ({
        name: `${limit.limit} Per ${limit.limitType === 'person' ? 'Person' : 'Household'}`,
        values: timeline.map((p: any) => p.rationedByLimit?.[limit.key] ?? 0),
      })),
    ];

    const condensed = condenseTimeSeries(categories, series);

    return {
      title: 'Operational Pressure',
      categories: condensed.categories,
      series: condensed.series,
      categoryColumn: condensed.grain === 'month' ? 'date' : condensed.grain,
      note: condensed.note,
      grain: condensed.grain,
      raw: condensed.condensed ? { categories, series, categoryColumn: 'date' } : undefined,
    };
  },
  print: data =>
    lineChartSvg(data.categories, data.series, 900, 300, false, {
      endLabels: true,
      formatValue: COUNT,
    }) +
    legendSvg(data.series.map(s => s.name), 900, 'line'),
};


/**
 * Grocery Partner Mix.
 *
 * Partner identity is received from the OFB Agency Pickups export, never
 * inferred. Legacy donations are excluded here exactly as they are on screen:
 * they predate the partner reporting this card is built from, so folding them
 * in would attribute pre-2023 weight to a partner record that did not yet
 * describe it.
 */
export const GROCERY_PARTNER_MIX: AnalyticsCard = {
  id: 'procurement-grocery-partner-mix',
  kind: 'chart',
  defaultTitle: 'Grocery Partner Mix',
  lens: 'procurement',
  data: (analytics: any) => {
    const donors = analytics?.donors ?? [];
    return {
      title: 'Grocery Partner Mix',
      categories: donors.map((d: any) => d.donorName),
      series: [
        { name: 'Received Pounds', values: donors.map((d: any) => toPounds(d.weightHundredths ?? 0)) },
      ],
      categoryColumn: 'partner',
      note: 'Does not include legacy donations data.',
    };
  },
  print: breakdownPrint,
};


/**
 * Recorded Donated Value.
 *
 * Tiles are this card's whole dataset, so they are metric rows and the CSV
 * carries them. The split between valued and unvalued pounds is the point of
 * the card, not a footnote: OFB leaves the rate blank on a large share of
 * historical rows, so the recorded value is a partial sum, and a reader who
 * sees only the dollar figure will read it as the value of all donated supply.
 */
export const RECORDED_DONATED_VALUE: AnalyticsCard = {
  id: 'procurement-donated-value',
  kind: 'kpi',
  defaultTitle: 'Recorded Donated Value',
  lens: 'procurement',
  data: (analytics: any) => {
    const value = analytics?.donorValue ?? {};
    const rows = [
      {
        label: 'Recorded value',
        value: (value.recordedValueCents ?? 0) / 100,
        text: wholeDollarsLabel(value.recordedValueCents ?? 0),
      },
      {
        label: 'Pounds with a recorded rate',
        value: toPounds(value.valuedWeightHundredths ?? 0),
        text: poundsLabel(value.valuedWeightHundredths ?? 0),
      },
      {
        label: 'Pounds without a recorded rate',
        value: toPounds(value.unvaluedWeightHundredths ?? 0),
        text: poundsLabel(value.unvaluedWeightHundredths ?? 0),
      },
    ];

    return {
      title: 'Recorded Donated Value',
      categories: rows.map(r => r.label),
      series: [{ name: 'value', values: rows.map(r => r.value), text: rows.map(r => r.text) }],
      categoryColumn: 'metric',
      note:
        'FEED reports the value Oregon Food Bank reported and does not estimate a rate for other donations.',
    };
  },
  print: data =>
    kpiGrid(
      data.categories.map((label, i) => ({ label, value: data.series[0]?.text?.[i] ?? '' }))
    ),
};


const pickupHistoryColumns: TableColumn<any>[] = [
  { id: 'donorName', header: 'Partner', text: r => r.donorName, sortValue: r => r.donorName, searchable: true },
  { id: 'pickupCount', header: 'Pickups', align: 'right', text: r => countLabel(r.pickupCount ?? 0), sortValue: r => r.pickupCount ?? 0 },
  {
    id: 'weightHundredths',
    header: 'Received',
    align: 'right',
    text: r => poundsLabel(r.weightHundredths ?? 0),
    sortValue: r => r.weightHundredths ?? 0,
  },
  {
    id: 'share',
    header: 'Share',
    align: 'right',
    // The denominator is every partner in the range, so the share must be
    // computed against that total rather than the rows the table is showing —
    // otherwise filtering to one partner would report it as 100%.
    text: r => (r.__totalWeightHundredths ? `${Math.round(100 * (r.weightHundredths ?? 0) / r.__totalWeightHundredths)}%` : '—'),
    sortValue: r => (r.__totalWeightHundredths ? (r.weightHundredths ?? 0) / r.__totalWeightHundredths : 0),
  },
  {
    id: 'averageWeightPerPickupHundredths',
    header: 'Average load',
    align: 'right',
    text: r => poundsLabel(r.averageWeightPerPickupHundredths ?? 0),
    sortValue: r => r.averageWeightPerPickupHundredths ?? 0,
  },
  {
    id: 'categories',
    header: 'Categories',
    align: 'right',
    text: r => countLabel(r.categories?.length ?? 0),
    sortValue: r => r.categories?.length ?? 0,
  },
  {
    id: 'observedRange',
    header: 'Observed range',
    text: r => `${tableDateLabel(r.firstReceivedDate)} – ${tableDateLabel(r.lastReceivedDate)}`,
    sortValue: r => r.firstReceivedDate ?? '',
  },
];

/**
 * Fresh Food Alliance Pickup History.
 *
 * The screen renders this with a plain `<Table>` rather than
 * `EnhancedDataTable`, so it has no filter, sort, or paging state to preserve —
 * every partner in the range, in payload order. See ISSUES.md #61: bringing it
 * onto the table standard is its own change, and when it happens this card
 * gains the same view-state handling the other two table cards already have.
 */
export const FRESH_ALLIANCE_PICKUP_HISTORY: AnalyticsCard = {
  id: 'procurement-fresh-alliance-pickup-history',
  kind: 'table',
  defaultTitle: 'Fresh Food Alliance Pickup History',
  lens: 'procurement',
  data: (analytics: any, options?: any) => {
    const donors = analytics?.donors ?? [];
    const total = donors.reduce((sum: number, d: any) => sum + (d.weightHundredths ?? 0), 0);
    const rows = donors.map((d: any) => ({ ...d, __totalWeightHundredths: total }));

    return {
      ...tableCardData('Fresh Food Alliance Pickup History', rows, pickupHistoryColumns, options),
      note: 'Fresh Food Alliance Pickups only. Does not include legacy data.',
    };
  },
  print: WAREHOUSE_PRODUCT_HISTORY.print,
};


/**
 * Fresh Food Alliance Donations Over Time.
 *
 * Two card-level controls travel, and both change what the numbers mean. The
 * partner picker is `options.donorCodes`; `options.showLegacy` extends each
 * partner's line back before June 2023 with pre-Primarius records. Legacy ends
 * May 2023 and Fresh Alliance begins June 2023, so the two abut with no overlap
 * and no month is double-counted — which is the only reason they can share a
 * line at all.
 */
export const FRESH_ALLIANCE_DONATIONS_OVER_TIME: AnalyticsCard = {
  id: 'procurement-fresh-alliance-donations-over-time',
  kind: 'chart',
  defaultTitle: 'Fresh Food Alliance Donations Over Time',
  lens: 'procurement',
  data: (analytics: any, options?: any) => {
    const allDonors = analytics?.donors ?? [];
    const selected: string[] | null = Array.isArray(options?.donorCodes)
      ? options.donorCodes
      : null;
    const showLegacy = options?.showLegacy === true;

    const donors = selected === null
      ? allDonors
      : allDonors.filter((d: any) => selected.includes(d.donorCode));

    const rows = [
      ...(showLegacy ? (analytics?.freshAllianceLegacyMonthlyWeight ?? []) : []),
      ...(analytics?.donorMonthlyWeight ?? []),
    ];
    const codes = new Set(donors.map((d: any) => d.donorCode));
    const months = [...new Set(rows.map((r: any) => r.bucket))].sort() as string[];

    const series: Series[] = donors
      .map((donor: any) => trimToData({
        name: donor.donorName,
        // Zero-filled rather than sparse: a gap would let the line bridge a
        // month the partner did not deliver in, drawing a delivery that never
        // happened. `trimToData` then ends the line at the last real delivery,
        // so a partner who stopped does not trail along zero to the right edge.
        values: months.map(month =>
          toPounds(
            rows
              .filter((r: any) => r.bucket === month && r.donorCode === donor.donorCode)
              .reduce((sum: number, r: any) => sum + (r.weightHundredths ?? 0), 0)
          )
        ),
      }));

    const condensed = condenseTimeSeries(months, series);
    const notes = [
      selected !== null ? `Partners narrowed to ${donors.length}.` : null,
      showLegacy ? 'Extended before June 2023 with legacy records.' : null,
      condensed.note,
    ].filter(Boolean);

    return {
      title: 'Fresh Food Alliance Donations Over Time',
      categories: condensed.categories,
      series: condensed.series,
      categoryColumn: condensed.grain === 'month' ? 'month' : condensed.grain,
      note: notes.join(' ') || null,
      grain: condensed.grain,
      raw: condensed.condensed
        ? { categories: months, series, categoryColumn: 'month' }
        : undefined,
    };
  },
  print: data =>
    lineChartSvg(data.categories, data.series, 900, 300) +
    legendSvg(data.series.map(s => s.name), 900, 'line'),
};


/**
 * How many community sources get their own name before the tail is folded into
 * one bucket. Mirrors `COMMUNITY_NAMED_LIMIT` in the screen's
 * `community-analytics.tsx`; the parity test reads both.
 */
const COMMUNITY_NAMED_LIMIT = 12;
const OTHER_SOURCES_LABEL = 'Other Community sources';

/**
 * Donation History From Legacy Data.
 *
 * Legacy data only — internal organization records, discontinued June
 * 2023. The provenance is on the card because a legacy pound and a current
 * pound are not the same observation, and a report that gets forwarded loses
 * the tab heading that said so on screen.
 */
export const LEGACY_DONATION_HISTORY: AnalyticsCard = {
  id: 'procurement-legacy-donation-history',
  kind: 'chart',
  defaultTitle: 'Donation History From Legacy Data',
  lens: 'procurement',
  data: (analytics: any) => {
    const sources = analytics?.communitySources ?? [];
    const named = sources.slice(0, COMMUNITY_NAMED_LIMIT);
    const folded = sources.slice(COMMUNITY_NAMED_LIMIT);

    const categories = named.map((s: any) => s.sourceName);
    const values = named.map((s: any) => toPounds(s.weightHundredths ?? 0));
    if (folded.length > 0) {
      categories.push(OTHER_SOURCES_LABEL);
      values.push(
        toPounds(folded.reduce((sum: number, s: any) => sum + (s.weightHundredths ?? 0), 0))
      );
    }

    return {
      title: 'Donation History From Legacy Data',
      categories,
      series: [{ name: 'Received Pounds', values }],
      categoryColumn: 'source',
      note:
        'Legacy data only, based on internal organization records. Record discontinued June 2023.' +
        (folded.length > 0 ? ` ${folded.length} smaller sources folded into "${OTHER_SOURCES_LABEL}".` : ''),
    };
  },
  print: breakdownPrint,
};


/**
 * Other Donations Over Time (Legacy Data).
 *
 * Scoped to non-Fresh-Alliance sources, as on screen. A partner's pre-2023
 * timeline belongs to the Fresh Alliance card, and drawing it here as well
 * would put the same pounds on the page twice under two different names.
 */
export const LEGACY_DONATIONS_OVER_TIME: AnalyticsCard = {
  id: 'procurement-legacy-donations-over-time',
  kind: 'chart',
  defaultTitle: 'Other Donations Over Time (Legacy Data)',
  lens: 'procurement',
  data: (analytics: any, options?: any) => {
    const allSources = (analytics?.communitySources ?? []).filter(
      (s: any) => !s.isFreshAlliancePartner
    );
    const partnerNames = new Set(
      (analytics?.communitySources ?? [])
        .filter((s: any) => s.isFreshAlliancePartner)
        .map((s: any) => s.sourceName)
    );
    const monthly = (analytics?.communityMonthlyWeight ?? []).filter(
      (entry: any) => !partnerNames.has(entry.sourceName)
    );

    const named = allSources.slice(0, COMMUNITY_NAMED_LIMIT);
    const foldedNames = new Set(
      allSources.slice(COMMUNITY_NAMED_LIMIT).map((s: any) => s.sourceName)
    );

    const selected: string[] | null = Array.isArray(options?.sourceNames)
      ? options.sourceNames
      : null;
    const isVisible = (name: string) => selected === null || selected.includes(name);

    const months = [...new Set(monthly.map((r: any) => r.bucket))].sort() as string[];
    const weightFor = (month: string, match: (name: string) => boolean) =>
      toPounds(
        monthly
          .filter((r: any) => r.bucket === month && match(r.sourceName))
          .reduce((sum: number, r: any) => sum + (r.weightHundredths ?? 0), 0)
      );

    const series: Series[] = named
      .filter((s: any) => isVisible(s.sourceName))
      .map((source: any) => ({
        name: source.sourceName,
        values: months.map(month => weightFor(month, name => name === source.sourceName)),
      }));

    if (foldedNames.size > 0 && isVisible(OTHER_SOURCES_LABEL)) {
      series.push({
        name: OTHER_SOURCES_LABEL,
        values: months.map(month => weightFor(month, name => foldedNames.has(name))),
      });
    }

    const condensed = condenseTimeSeries(months, series);
    const notes = [
      'Monthly received pounds by sources other than Fresh Alliance partners.',
      selected !== null ? `Sources narrowed to ${series.length}.` : null,
      condensed.note,
    ].filter(Boolean);

    return {
      title: 'Other Donations Over Time (Legacy Data)',
      categories: condensed.categories,
      series: condensed.series,
      categoryColumn: condensed.grain === 'month' ? 'month' : condensed.grain,
      note: notes.join(' ') || null,
      grain: condensed.grain,
      raw: condensed.condensed
        ? { categories: months, series, categoryColumn: 'month' }
        : undefined,
    };
  },
  print: data =>
    lineChartSvg(data.categories, data.series, 900, 300) +
    legendSvg(data.series.map(s => s.name), 900, 'line'),
};


/** Registry. A card is exportable exactly when it appears here. */
/**
 * Ends a series where its data ends, instead of running it along the axis.
 *
 * The mirror of `trimSeriesToData` on the screen, and required by the same
 * contract: a partner who stopped delivering, or a channel that started
 * mid-range, must terminate at its last real value rather than drawing a flat
 * zero across months it did not exist. Zeros *between* real values stay — those
 * are genuine gaps in an active series, and the reason the values are
 * zero-filled to begin with.
 */
const trimToData = (series: Series): Series => {
  const first = series.values.findIndex(value => value > 0);
  if (first === -1) {
    return { ...series, defined: series.values.map(() => false) };
  }
  let last = series.values.length - 1;
  while (last > first && !(series.values[last] > 0)) last -= 1;
  return {
    ...series,
    defined: series.values.map((_, index) => index >= first && index <= last),
  };
};

export const PROCUREMENT_SPEND_OVER_TIME: AnalyticsCard = {
  id: 'procurement-spend-over-time',
  kind: 'chart',
  defaultTitle: 'OFB Spending Over Time',
  lens: 'procurement',
  data: (analytics: any) => {
    const rows = analytics?.monthlySpend ?? [];
    const categories = rows.map((row: any) => row.bucket);
    // Dollars, not cents: the CSV is read by people, and a column of 776800
    // invites a reader to mistake the scale by two orders of magnitude.
    const series = [
      trimToData({
        name: 'Product charges',
        values: rows.map((row: any) => (row.productChargesCents ?? 0) / 100),
      }),
      trimToData({
        name: 'Net recorded cost',
        values: rows.map((row: any) => (row.netRecordedCostCents ?? 0) / 100),
      }),
    ];

    const condensed = condenseTimeSeries(categories, series, { grain: grainOf(analytics) });
    return {
      title: 'OFB Spending Over Time',
      categories: condensed.categories,
      series: condensed.series,
      categoryColumn: condensed.grain === 'month' ? 'month' : condensed.grain,
      grain: condensed.grain,
      note: [
        'Recorded charges by delivery month, in dollars. Net recorded cost adds ' +
        'service fees and subtracts grants; where the two series match, neither ' +
        'applied. Fees and grants sit on a whole order, so a filter that divides ' +
        'one leaves them out rather than assigning them to a month arbitrarily.',
        condensed.note,
      ].filter(Boolean).join(' '),
      raw: condensed.condensed ? { categories, series, categoryColumn: 'month' } : undefined,
    };
  },
  print: data => lineChartSvg(data.categories, data.series, 900, 280, false, { formatValue: DOLLARS })
    + legendSvg(data.series.map(s => s.name), 900, 'line'),
};

/* ---------------------------------------------------------------- service */
/*
 * Two lenses share this section and one payload.
 *
 * `service` answers what happened on a service day; `clients` answers who the
 * people are. They read the same Service analytics today because the client
 * datasets have not been imported yet — when they are, `clients` gets its own
 * payload and these cards keep their ids. Splitting the lens now is what makes
 * that swap invisible to saved templates.
 */

/**
 * Service cards read two records that begin years apart: intake (Link2Feed,
 * then SIMC) and the Service Log, which WTH started keeping in October 2023.
 * Every card here inherits one rule from the screen — an absent value is
 * outside coverage, not a zero — so a line begins where its program did
 * instead of running along the axis for the years before it existed.
 *
 * The bucket grain is chosen by the service, not condensed here: it already
 * returns days or months based on the requested span, and re-condensing would
 * put the report on a different axis than the page.
 */

/** `false` where the record does not cover the slot, so lines terminate. */
const definedFrom = (values: Array<number | null | undefined>): boolean[] =>
  values.map(value => value !== null && value !== undefined);

const numbersFrom = (values: Array<number | null | undefined>): number[] =>
  values.map(value => value ?? 0);

/** A series is worth drawing only where the record actually reaches. */
const covered = (series: Series): boolean => series.defined!.some(Boolean);

/**
 * Drops a trailing month that has not finished yet.
 *
 * The newest month holds only the service days that have happened, so plotting
 * it beside complete months reads as a collapse. The screen drops it and says
 * so; a report that kept it would show a cliff the page does not, and the
 * whole point of one accessor is that the two cannot disagree. Daily buckets
 * need no guard — a service day is either recorded or absent, never half
 * counted.
 */
const dropPartialMonth = <T extends Record<string, unknown>>(
  rows: T[],
  key: string,
  granularity: string
): { rows: T[]; excluded: string | null } => {
  if (granularity !== 'month') return { rows, excluded: null };
  const currentMonth = new Date().toISOString().slice(0, 7);
  const last = rows[rows.length - 1];
  if (!last || String(last[key]) !== currentMonth) return { rows, excluded: null };
  return { rows: rows.slice(0, -1), excluded: currentMonth };
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `2026-08` → `August 2026`, matching the screen's caption. */
const monthLabel = (bucket: string): string => {
  const [year, month] = bucket.split('-');
  return `${MONTH_NAMES[Number(month) - 1] ?? bucket} ${year}`;
};

export const SERVICE_SUMMARY: AnalyticsCard = {
  id: 'service-summary',
  kind: 'kpi',
  defaultTitle: 'Service Summary',
  lens: 'service',
  data: (analytics: any) => {
    const summary = analytics?.summary ?? {};
    const coverage = analytics?.coverage ?? {};

    const headline = [
      { label: 'Visits', value: summary.visits ?? 0 },
      { label: 'People Served', value: summary.peopleServed ?? 0 },
      { label: 'Households Served', value: summary.households ?? 0 },
    ].map(row => ({ ...row, text: COUNT(row.value) }));
    // Methods carry households; ancillary metrics each carry their own unit,
    // so their text is formatted per row rather than as a bare count.
    const methods = (summary.methods ?? []).map((method: any) => ({
      label: method.displayName,
      value: method.households ?? 0,
      text: COUNT(method.households ?? 0),
    }));
    const others = (summary.otherServices ?? []).map((service: any) => ({
      label: service.displayName,
      value: service.total ?? 0,
      text: `${COUNT(service.total ?? 0)} ${service.unit}`.trim(),
    }));

    const rows = [...headline, ...methods, ...others];

    // The footnotes the screen prints, for the same reason: a households figure
    // drawn from the Service Log can cover less than the range asked for.
    const notes: string[] = [];
    if (summary.householdsSource === 'service_log' && coverage.serviceLogFirstDate) {
      notes.push(
        `Households come from the Service Log, which covers ${coverage.serviceLogFirstDate} onward.`
      );
    } else if (summary.householdsSource === 'intake') {
      notes.push('Households come from intake records, which can hold duplicate profiles.');
    }
    if ((summary.identityUnavailableVisits ?? 0) > 0) {
      notes.push(
        `${COUNT(summary.identityUnavailableVisits)} visits were recorded anonymously; each counts as a household but they cannot be deduplicated.`
      );
    }
    if ((summary.bulkEntryVisits ?? 0) > 0) {
      notes.push(
        `Includes ${COUNT(summary.bulkEntryPeople ?? 0)} people from bulk entries, which are not households.`
      );
    }

    return {
      title: 'Service Summary',
      categories: rows.map(row => row.label),
      series: [
        { name: 'value', values: rows.map(row => row.value), text: rows.map(row => row.text) },
      ],
      categoryColumn: 'metric',
      note: notes.length > 0 ? notes.join(' ') : null,
      // Headline totals and the ancillary metrics are tiles; the methods are
      // bars. Ancillary metrics each carry their own unit — 21 camping gear
      // requests is not a smaller quantity than 21,006 households — so putting
      // them on the households axis would draw them as invisible slivers of a
      // scale they do not share. They stay in `categories` as well, so the CSV
      // still carries every figure on the card.
      tiles: [...headline, ...others].map(row => ({ label: row.label, value: row.text })),
    };
  },
  // Tiles for the figures, bars for the method breakdown beneath them — the
  // same split the screen makes between its key and its donut.
  print: data => {
    const values = data.series[0]?.values ?? [];
    const tiled = new Set((data.tiles ?? []).map(tile => tile.label));
    const bars = data.categories
      .map((label, i) => ({ label, value: values[i] ?? 0 }))
      .filter(row => !tiled.has(row.label));
    return kpiGrid(data.tiles ?? []) + (bars.length > 0 ? hBarSvg(bars, 900, 30, COUNT) : '');
  },
};

export const SERVICE_OVER_TIME: AnalyticsCard = {
  id: 'service-over-time',
  kind: 'chart',
  defaultTitle: 'Service Over Time',
  lens: 'service',
  data: (analytics: any) => {
    const granularity = analytics?.coverage?.granularity ?? 'day';
    const { rows, excluded } = dropPartialMonth(
      analytics?.overTime ?? [],
      'month',
      granularity
    );
    const categories = rows.map((row: any) => row.month);

    const defs: [string, string][] = [
      ['Link2Feed Households', 'link2feedHouseholds'],
      ['Link2Feed Individuals', 'link2feedIndividuals'],
      ['SIMC Households', 'simcHouseholds'],
      ['SIMC Individuals', 'simcIndividuals'],
      ['Service Log Households', 'serviceLogHouseholds'],
    ];

    // A record with no reach into this range would draw an empty legend entry.
    const series = defs
      .map(([name, key]) => {
        const raw = rows.map((row: any) => row[key]);
        return { name, values: numbersFrom(raw), defined: definedFrom(raw) };
      })
      .filter(covered);

    return {
      title: 'Service Over Time',
      categories,
      series,
      categoryColumn: granularity === 'month' ? 'month' : 'date',
      grain: granularity === 'month' ? 'month' : undefined,
      note:
        (granularity === 'month'
          ? 'Monthly totals. A line begins where its record does.'
          : 'Daily totals. A line begins where its record does.') +
        (excluded ? ` ${monthLabel(excluded)} is still in progress and is not plotted.` : ''),
    };
  },
  print: data =>
    lineChartSvg(data.categories, data.series, 900, 280, false, { formatValue: COUNT }) +
    legendSvg(data.series.map(s => s.name), 900, 'line'),
};

export const SERVICE_QUEUE_TIMING: AnalyticsCard = {
  id: 'service-queue-timing',
  kind: 'kpi',
  defaultTitle: 'Queue Statistics',
  lens: 'service',
  data: (analytics: any) => {
    const queue = analytics?.queueTiming ?? {};
    const oneDecimalCount = (value: number | null | undefined) => value == null
      ? '—'
      : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
    const rows = [
      { label: 'Typical initial issuance', value: queue.medianInitialBatchSize ?? 0, text: oneDecimalCount(queue.medianInitialBatchSize) },
      { label: 'Average tickets issued', value: queue.averageIssuedPerServiceDay ?? 0, text: oneDecimalCount(queue.averageIssuedPerServiceDay) },
      { label: 'Average tickets returned', value: queue.averageReturnedPerServiceDay ?? 0, text: oneDecimalCount(queue.averageReturnedPerServiceDay) },
      { label: 'Median ticket wait', value: queue.medianWaitMinutes ?? 0, text: queue.medianWaitMinutes == null ? '—' : `${queue.medianWaitMinutes} min` },
      { label: 'Average ticket wait', value: queue.averageWaitMinutes ?? 0, text: queue.averageWaitMinutes == null ? '—' : `${queue.averageWaitMinutes} min` },
      { label: '75th percentile wait', value: queue.p75WaitMinutes ?? 0, text: queue.p75WaitMinutes == null ? '—' : `${queue.p75WaitMinutes} min` },
      { label: '90th percentile wait', value: queue.p90WaitMinutes ?? 0, text: queue.p90WaitMinutes == null ? '—' : `${queue.p90WaitMinutes} min` },
      { label: 'Typical serving interval', value: queue.historicalServingIntervalMinutes ?? 0, text: queue.historicalServingIntervalMinutes == null ? '—' : `${queue.historicalServingIntervalMinutes} min` },
      { label: 'Typical last call', value: 0, text: queue.typicalLastCallLocalTime ?? '—' },
      { label: 'Included sessions', value: queue.includedSessionCount ?? 0, text: COUNT(queue.includedSessionCount ?? 0) },
      { label: 'Included pantry days', value: queue.includedServiceDayCount ?? 0, text: COUNT(queue.includedServiceDayCount ?? 0) },
      { label: 'Complete volume days', value: queue.volumeServiceDayCount ?? 0, text: COUNT(queue.volumeServiceDayCount ?? 0) },
      { label: 'Tickets observed', value: queue.observedTicketCount ?? 0, text: COUNT(queue.observedTicketCount ?? 0) },
    ];
    return {
      title: 'Queue Statistics',
      categories: rows.map((row) => row.label),
      series: [{ name: 'value', values: rows.map((row) => row.value), text: rows.map((row) => row.text) }],
      categoryColumn: 'metric',
      tiles: rows.map((row) => ({ label: row.label, value: row.text })),
      note: `${COUNT(queue.pendingReviewCount ?? 0)} synchronized session(s) awaiting review are withheld. Queue tickets are operational timing observations, not visits, households, or people served.`,
    };
  },
  print: data => kpiGrid(data.tiles ?? []),
};

const queueDailySeries = (
  rows: any[],
  definitions: Array<[name: string, key: string]>,
  formatText?: (value: number) => string,
): Series[] => definitions.map(([name, key]) => {
  const raw = rows.map((row) => row[key]);
  return {
    name,
    values: numbersFrom(raw),
    defined: definedFrom(raw),
    ...(formatText ? { text: raw.map((value) => value == null ? '' : formatText(Number(value))) } : {}),
  };
});

const localClockLabel = (value: number) => {
  const minutes = Math.round(value);
  const hours24 = Math.floor(minutes / 60) % 24;
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes % 60).padStart(2, '0')} ${hours24 < 12 ? 'AM' : 'PM'}`;
};

const localClockDomain = (series: Series[]): [number, number] => {
  const values = series.flatMap((entry) => entry.values.filter(
    (_, index) => entry.defined?.[index] !== false,
  ));
  if (values.length === 0) return [0, 1440];
  let minimum = Math.max(0, Math.floor(Math.min(...values) / 60) * 60);
  let maximum = Math.min(1440, Math.ceil(Math.max(...values) / 60) * 60);
  if (minimum === maximum) {
    minimum = Math.max(0, minimum - 60);
    maximum = Math.min(1440, maximum + 60);
  }
  return [minimum, maximum];
};

export const SERVICE_QUEUE_VOLUME: AnalyticsCard = {
  id: 'service-queue-volume',
  kind: 'chart',
  defaultTitle: 'Queue Volume by Pantry Day',
  lens: 'service',
  data: (analytics: any) => {
    const rows = analytics?.queueTiming?.daily ?? [];
    const hasPartialVolume = rows.some((row: any) => row.issuedCount == null);
    const series = queueDailySeries(rows, [
      ['Tickets issued', 'issuedCount'],
      ['Tickets returned', 'returnedCount'],
      ['Tickets called', 'calledCount'],
      ['Initial issuance', 'initialBatchIssuedCount'],
    ]);
    return {
      title: 'Queue Volume by Pantry Day',
      categories: rows.map((row: any) => row.serviceDate),
      series,
      categoryColumn: 'service_date',
      grain: 'day',
      note: 'Tickets called counts observed first calls; it is not tickets issued minus tickets returned. Initial issuance is the first recorded ticket batch for each pantry day.'
        + (hasPartialVolume ? ' Partial legacy days are gaps because their total volume is unknown.' : ''),
    };
  },
  print: data =>
    lineChartSvg(data.categories, data.series, 900, 280, false, { formatValue: COUNT })
    + legendSvg(data.series.map((series) => series.name), 900, 'line'),
};

export const SERVICE_QUEUE_CALL_MILESTONES: AnalyticsCard = {
  id: 'service-queue-call-milestones',
  kind: 'chart',
  defaultTitle: 'Call Milestones by Pantry Day',
  lens: 'service',
  data: (analytics: any) => {
    const rows = analytics?.queueTiming?.daily ?? [];
    const series = queueDailySeries(rows, [
      ['10th ticket called', 'tenthCallLocalMinute'],
      ['25th ticket called', 'twentyFifthCallLocalMinute'],
      ['50th ticket called', 'fiftiethCallLocalMinute'],
      ['Last ticket called', 'lastCallLocalMinute'],
    ], localClockLabel);
    return {
      title: 'Call Milestones by Pantry Day',
      categories: rows.map((row: any) => row.serviceDate),
      series,
      categoryColumn: 'service_date',
      grain: 'day',
      note: 'Times use the timezone stored by LOTTO. A blank milestone means that pantry day did not reach that many observed first calls.',
    };
  },
  print: data =>
    lineChartSvg(data.categories, data.series, 900, 280, false, {
      domain: localClockDomain(data.series),
      formatAxisValue: localClockLabel,
    }) + legendSvg(data.series.map((series) => series.name), 900, 'line'),
};

export const SERVICE_SEASONAL_HOUSEHOLDS: AnalyticsCard = {
  id: 'service-seasonal-households',
  kind: 'chart',
  defaultTitle: 'Households by Season',
  lens: 'service',
  data: (analytics: any, options?: any) => {
    // Both controls are read from the frozen options, so the exported card is
    // the card that was on screen when it was picked — not every year at
    // whichever measure happens to be the default.
    const measure: 'households' | 'visits' = options?.measure === 'visits' ? 'visits' : 'households';
    const available: string[] = analytics?.seasonal?.years ?? [];
    const years: string[] = options?.yearMode === 'selected'
      ? (Array.isArray(options?.years) ? options.years : [])
      : available;

    const months = analytics?.seasonal?.[measure] ?? [];
    const categories = months.map((row: any) => String(row.month));

    // Twelve slots, every year on the same axis. A year that ran only part of
    // the calendar is defined for the months it ran and absent for the rest —
    // the distinction a partial year depends on.
    const series = years
      .filter(year => available.includes(year))
      .map(year => {
        const raw = months.map((row: any) => row[year] as number | undefined);
        return { name: year, values: numbersFrom(raw), defined: definedFrom(raw) };
      });

    return {
      title: measure === 'visits' ? 'Visits by Season' : 'Households by Season',
      categories,
      series,
      categoryColumn: 'month',
      note: measure === 'visits'
        ? 'Every visit each month, one line per year, so repeated visits by the same ' +
          'household are counted each time. A partial year stops where its data does.'
        : 'Distinct households each month, one line per year, so repeated visits by ' +
          'the same household are only counted once. Anonymous visits are counted ' +
          'but not deduplicated. A partial year stops where its data does.',
    };
  },
  print: data =>
    lineChartSvg(data.categories, data.series, 900, 280, false, { formatValue: COUNT }) +
    legendSvg(data.series.map(s => s.name), 900, 'line'),
};

export const SERVICE_METHOD_MIX: AnalyticsCard = {
  id: 'service-method-mix',
  kind: 'chart',
  defaultTitle: 'How Service Was Delivered',
  lens: 'service',
  data: (analytics: any) => {
    const methods = analytics?.methodSeries?.methods ?? [];
    const granularity = analytics?.methodSeries?.granularity ?? 'day';
    const { rows: buckets, excluded } = dropPartialMonth(
      analytics?.methodSeries?.buckets ?? [],
      'bucket',
      granularity
    );
    const categories = buckets.map((row: any) => String(row.bucket));

    // Within a method's life a missing bucket is a real zero — staff record
    // every method each service day. Before it existed there is nothing to
    // report, which is what the absent key means.
    const series = methods
      .map((method: any) => {
        const raw = buckets.map((row: any) => row[method.metricKey] as number | undefined);
        return { name: method.displayName, values: numbersFrom(raw), defined: definedFrom(raw) };
      })
      .filter(covered);

    return {
      title: 'How Service Was Delivered',
      categories,
      series,
      categoryColumn: granularity === 'month' ? 'month' : 'date',
      grain: granularity === 'month' ? 'month' : undefined,
      note:
        'Households by delivery method. A method begins where the program did.' +
        (excluded ? ` ${monthLabel(excluded)} is still in progress and is not plotted.` : ''),
    };
  },
  print: data =>
    lineChartSvg(data.categories, data.series, 900, 280, false, { formatValue: COUNT }) +
    legendSvg(data.series.map(s => s.name), 900, 'line'),
};

export const SERVICE_HOUSEHOLD_SIZE: AnalyticsCard = {
  id: 'clients-household-size',
  kind: 'chart',
  defaultTitle: 'Household Size',
  lens: 'clients',
  data: (analytics: any) => {
    const rows = analytics?.householdSize ?? [];
    return {
      title: 'Household Size',
      categories: rows.map((row: any) => (row.people === 1 ? '1 person' : `${row.people} people`)),
      series: [{ name: 'Visits', values: rows.map((row: any) => row.visits ?? 0) }],
      categoryColumn: 'household size',
      note: 'Visits by the number of people in the household. Large sizes are bulk entries and special events, not families.',
    };
  },
  print: data =>
    hBarSvg(
      data.categories.map((label, i) => ({ label, value: data.series[0]?.values[i] ?? 0 })),
      900,
      26,
      COUNT
    ),
};

export const SERVICE_UNMET_DEMAND: AnalyticsCard = {
  id: 'service-unmet-demand',
  kind: 'chart',
  defaultTitle: 'Turned Away',
  lens: 'service',
  data: (analytics: any) => {
    const unmet = analytics?.unmetDemand ?? {};
    const granularity = unmet.granularity ?? 'day';
    // Nulls are buckets the Service Log does not cover. A bar cannot say "no
    // record" — a zero-height bar reads as a confirmed zero — so they are
    // dropped rather than drawn.
    const recorded = (unmet.buckets ?? []).filter((row: any) => row.turnedAway !== null);
    const { rows, excluded } = dropPartialMonth(recorded, 'bucket', granularity);

    return {
      title: 'Turned Away',
      categories: rows.map((row: any) => String(row.bucket)),
      series: [{ name: 'Households turned away', values: rows.map((row: any) => row.turnedAway ?? 0) }],
      categoryColumn: granularity === 'month' ? 'month' : 'date',
      grain: granularity === 'month' ? 'month' : undefined,
      tiles: [
        { label: 'Households turned away', value: COUNT(unmet.householdsTurnedAway ?? 0) },
        {
          label: 'Days it happened',
          value: `${COUNT(unmet.daysWithTurnAway ?? 0)} of ${COUNT(unmet.daysRecorded ?? 0)}`,
        },
        { label: 'Times capacity was reached', value: COUNT(unmet.capacityReachedDays ?? 0) },
      ],
      note:
        'Blank entries are treated as a zero count.' +
        (excluded ? ` ${monthLabel(excluded)} is still in progress and is not plotted.` : ''),
    };
  },
  print: data => kpiGrid(data.tiles ?? []) + stackedBarSvg(data.categories, data.series),
};

/** How many answers the chart shows before the tail stops being legible. */
const LANGUAGES_PLOTTED = 15;

export const SERVICE_LANGUAGES: AnalyticsCard = {
  id: 'clients-languages',
  kind: 'chart',
  defaultTitle: 'Languages Spoken at Home',
  lens: 'clients',
  data: (analytics: any) => {
    const languages = analytics?.languages ?? {};
    const all = languages.values ?? [];
    // Falls back to the merged list when an older payload has no raw values.
    const recorded = languages.rawValues ?? all;
    const plotted = all.slice(0, LANGUAGES_PLOTTED);
    const overflow = Math.max(0, all.length - plotted.length);
    const asked = languages.householdsAsked ?? 0;
    const percent = asked > 0
      ? Math.round(((languages.householdsAnswered ?? 0) / asked) * 100)
      : 0;

    const toGrain = (values: any[]) => ({
      categories: values.map((row: any) => row.language),
      series: [{ name: 'Households', values: values.map((row: any) => row.households ?? 0) }],
      categoryColumn: 'language',
    });

    return {
      title: 'Languages Spoken at Home',
      ...toGrain(plotted),
      note:
        `About ${percent}% of households answered this question` +
        (overflow > 0
          ? `, across ${COUNT(all.length)} answers; the ${COUNT(overflow)} rarest are in the CSV`
          : '') +
        '. “Mandarin Chinese” counts as “Mandarin”; the CSV keeps every answer as recorded.',
      // The chart merges redundant labels and shows the most common; the CSV is
      // the data file and carries every answer, unmerged.
      raw: toGrain(recorded),
    };
  },
  print: data => hBarSvg(
    data.categories.map((label, i) => ({ label, value: data.series[0]?.values[i] ?? 0 })),
    900,
    26,
    COUNT
  ),
};

export const SERVICE_RESPONSE_COVERAGE: AnalyticsCard = {
  id: 'clients-response-coverage',
  kind: 'chart',
  defaultTitle: 'Demographics Questions Response Rate',
  lens: 'clients',
  data: (analytics: any) => {
    const rows = analytics?.responseCoverage ?? [];
    return {
      title: 'Demographics Questions Response Rate',
      categories: rows.map((row: any) => row.displayName ?? row.dimension),
      series: [
        { name: 'Answered', values: rows.map((row: any) => row.provided ?? 0) },
        { name: 'Not answered', values: rows.map((row: any) => row.notProvided ?? 0) },
      ],
      categoryColumn: 'question',
      note:
        'Questions asked during intake. Includes intake data from both Link2Feed and ' +
        'SIMC. Not all households have been asked the same questions. Declining to ' +
        'answer counts as not answered. Read any demographic share against this card first.',
    };
  },
  print: data =>
    // Households, not pounds — the helper's default unit belongs to the
    // procurement card it was first written for.
    stackedHBarSvg(data.categories, data.series, 900, 26, COUNT) +
    legendSvg(data.series.map(s => s.name)),
};

export const CLIENTS_AGE_BANDS: AnalyticsCard = {
  id: 'clients-age-bands',
  kind: 'chart',
  defaultTitle: 'Age of People Served',
  lens: 'clients',
  data: (analytics: any) => {
    const ages = analytics?.ageBands ?? {};
    const bands = ages.bands ?? [];

    const notes: string[] = [];
    if (!ages.available) {
      notes.push('No ages recorded in this range.');
    } else {
      notes.push(
        'Link2Feed records one birth year per household and SIMC one for every ' +
        'member, so years before the June 2026 changeover under-count household ' +
        'members.'
      );
      if ((ages.withoutBirthYear ?? 0) > 0) {
        notes.push(`${COUNT(ages.withoutBirthYear)} have no birth year on file and are not counted.`);
      }
      if ((ages.estimatedBirthYears ?? 0) > 0) {
        notes.push(`${COUNT(ages.estimatedBirthYears)} were estimated at intake rather than reported.`);
      }
      if ((ages.implausibleBirthYears ?? 0) > 0) {
        notes.push(
          `${COUNT(ages.implausibleBirthYears)} carry a birth year of 1901 or earlier, ` +
          'which is a placeholder rather than a real age — they are shown rather than hidden.'
        );
      }
    }

    return {
      title: 'Age of People Served',
      categories: bands.map((b: any) => b.label),
      series: [{ name: 'People', values: bands.map((b: any) => b.count ?? 0) }],
      categoryColumn: 'age band',
      note: notes.join(' '),
    };
  },
  print: data => hBarSvg(
    data.categories.map((label, i) => ({ label, value: data.series[0]?.values[i] ?? 0 })),
    900, 30, COUNT
  ),
};

/**
 * Ethnicity, gender identity and housing type differ only in which answers
 * they hold, so one factory builds all of them rather than four near-copies.
 */
const breakdownCard = (
  id: string,
  defaultTitle: string,
  pick: (analytics: any) => any,
  extra = '',
): AnalyticsCard => ({
  id,
  kind: 'chart',
  defaultTitle,
  lens: 'clients',
  data: (analytics: any) => {
    const breakdown = pick(analytics) ?? {};
    const values = breakdown.values ?? [];
    const unit = breakdown.unit === 'people' ? 'people' : 'households';
    const asked = breakdown.asked ?? 0;
    const percent = asked > 0 ? Math.round(((breakdown.answered ?? 0) / asked) * 100) : 0;

    const notes = [
      `About ${percent}% of ${unit} answered this question ` +
      `(${COUNT(breakdown.answered ?? 0)} of ${COUNT(asked)}).`,
    ];
    if (breakdown.multiValue) {
      notes.push(
        `A ${unit === 'people' ? 'person' : 'household'} can give more than one answer, ` +
        'so the bars sum above that.'
      );
    }
    if (extra) notes.push(extra);

    return {
      title: defaultTitle,
      categories: values.map((row: any) => row.label),
      series: [{ name: unit === 'people' ? 'People' : 'Households', values: values.map((row: any) => row.count ?? 0) }],
      categoryColumn: 'answer',
      note: notes.join(' '),
    };
  },
  print: data => hBarSvg(
    data.categories.map((label, i) => ({ label, value: data.series[0]?.values[i] ?? 0 })),
    900, 26, COUNT
  ),
});

export const CLIENTS_ETHNICITY = breakdownCard(
  'clients-ethnicity', 'Ethnicity', (a) => a?.demographics?.ethnicity,
  'Recorded in Link2Feed only; SIMC asks a different question with different categories.',
);
export const CLIENTS_RACE_SIMC = breakdownCard(
  'clients-race-simc', 'Race or Ethnicity (SIMC)', (a) => a?.demographics?.simcRaceOrEthnicity,
  'Counted in people rather than households, and not comparable with the Link2Feed ethnicity card.',
);
export const CLIENTS_GENDER_IDENTITY = breakdownCard(
  'clients-gender-identity', 'Gender Identity', (a) => a?.demographics?.genderIdentity,
  'Recorded in Link2Feed only; SIMC records this per person on its own card.',
);
/**
 * Separate from the card above rather than summed with it. SIMC records a
 * gender for every household member and Link2Feed for whoever registered, so
 * one total would weight a SIMC household by its size and a Link2Feed
 * household by one.
 */
export const CLIENTS_GENDER_SIMC = breakdownCard(
  'clients-gender-identity-simc', 'Gender Identity (SIMC)',
  (a) => a?.demographics?.simcGenderIdentity,
  'Counted in people rather than households, and not comparable with the Link2Feed gender card.',
);
export const CLIENTS_HOUSING_TYPE = breakdownCard(
  'clients-housing-type', 'Housing Type', (a) => a?.demographics?.housingType,
  'Pairs with the no-fixed-address figure on Where Households Live.',
);

/** Named rows a reader can act on; the tail is summed, never dropped. */
const POSTAL_CODES_PLOTTED = 12;

export const CLIENTS_GEOGRAPHY: AnalyticsCard = {
  id: 'clients-geography',
  kind: 'chart',
  defaultTitle: 'Where Households Live',
  lens: 'clients',
  data: (analytics: any) => {
    const geography = analytics?.geography ?? {};
    const all = geography.postalCodes ?? [];
    const top = all.slice(0, POSTAL_CODES_PLOTTED);
    const tail = all.slice(POSTAL_CODES_PLOTTED);
    const tailTotal = tail.reduce((sum: number, row: any) => sum + (row.clients ?? 0), 0);
    const rows = tailTotal > 0
      ? [...top, { postalCode: `${tail.length} more postal codes`, clients: tailTotal }]
      : top;

    const notes = [
      // Was "this is not a map" — written when the export was a bar list, and
      // left standing above an actual map, contradicting the picture beneath it.
      'A postal code is not a catchment area — a circle marks the code, not an ' +
      'address.',
    ];
    if (geography.noFixedAddressAsked && (geography.noFixedAddress ?? 0) > 0) {
      notes.push(
        `${COUNT(geography.noFixedAddress)} households have no fixed address and are ` +
        'counted separately, not by postal code: SIMC requires one, so the agency\u2019s ' +
        'own is recorded instead.'
      );
    }
    if ((geography.clientsWithoutPostalCode ?? 0) > 0) {
      notes.push(`${COUNT(geography.clientsWithoutPostalCode)} did not give a postal code.`);
    }

    const toGrain = (values: any[]) => ({
      categories: values.map((row: any) => row.postalCode),
      series: [{ name: 'Households', values: values.map((row: any) => row.clients ?? 0) }],
      categoryColumn: 'postal code',
    });

    return {
      title: 'Where Households Live',
      ...toGrain(rows),
      note: notes.join(' '),
      // The chart folds the tail; the CSV keeps every postal code.
      raw: toGrain(all),
      // Every placed postal code, not the folded top slice: the printed map has
      // room for all of them, and the tail is where the reach of the pantry
      // actually shows.
      map: all
        .filter((row: any) => row.latitude !== null && row.longitude !== null)
        .map((row: any): MapPoint => ({
          label: row.postalCode,
          latitude: row.latitude,
          longitude: row.longitude,
          value: row.clients ?? 0,
        })),
    };
  },
  // A map, where the screen shows a map. The ranked bar list this replaced
  // could say which postal code was largest; it could not show where in the
  // city people live, which is the question the card exists to answer.
  print: data => {
    if (!data.map || data.map.length === 0) {
      return hBarSvg(
        data.categories.map((label, i) => ({ label, value: data.series[0]?.values[i] ?? 0 })),
        900, 26, COUNT
      );
    }
    // Ranked from every postal code, not from the placed ones: a code with no
    // map location is still a real place households named, and dropping it
    // would make the key disagree with the CSV about what the top ten are. The
    // footnote already says some codes cannot be drawn.
    const source = data.raw ?? data;
    const ranked = source.categories
      .map((label, i) => ({ label, value: source.series[0]?.values[i] ?? 0 }))
      .filter(row => row.value > 0)
      .sort((left, right) => right.value - left.value);
    const total = ranked.reduce((sum, row) => sum + row.value, 0);
    return bubbleMapSvg(data.map)
      + rankedKeySvg(
        ranked.slice(0, 10),
        total,
        'households that gave a postal code',
        'Top 10 postal codes',
      );
  },
};

export const ANALYTICS_CARDS: AnalyticsCard[] = [
  INBOUND_SUPPLY_SUMMARY,
  PAID_PROCUREMENT_SUMMARY,
  ACQUISITION_MIX,
  PROCUREMENT_CHANNELS,
  INBOUND_WEIGHT_OVER_TIME,
  PAID_PRODUCT_SPEND,
  SEASONAL_INBOUND_WEIGHT,
  FRESH_ALLIANCE_CATEGORY_MIX,
  AVAILABILITY_SUMMARY,
  CATEGORY_PRESSURE,
  AVAILABLE_ASSORTMENT_OVER_TIME,
  WAREHOUSE_PRODUCT_HISTORY,
  FRESH_ALLIANCE_RECEIPT_CATEGORIES,
  UNAVAILABLE_EPISODES,
  RATIONING_HISTORY,
  RECURRING_AVAILABILITY,
  OPERATIONAL_PRESSURE,
  GROCERY_PARTNER_MIX,
  RECORDED_DONATED_VALUE,
  FRESH_ALLIANCE_PICKUP_HISTORY,
  FRESH_ALLIANCE_DONATIONS_OVER_TIME,
  LEGACY_DONATION_HISTORY,
  LEGACY_DONATIONS_OVER_TIME,
  PROCUREMENT_SPEND_OVER_TIME,
  SERVICE_SUMMARY,
  SERVICE_QUEUE_TIMING,
  SERVICE_QUEUE_VOLUME,
  SERVICE_QUEUE_CALL_MILESTONES,
  SERVICE_OVER_TIME,
  SERVICE_SEASONAL_HOUSEHOLDS,
  SERVICE_METHOD_MIX,
  SERVICE_HOUSEHOLD_SIZE,
  SERVICE_UNMET_DEMAND,
  SERVICE_LANGUAGES,
  SERVICE_RESPONSE_COVERAGE,
  CLIENTS_AGE_BANDS,
  CLIENTS_GEOGRAPHY,
  CLIENTS_ETHNICITY,
  CLIENTS_RACE_SIMC,
  CLIENTS_GENDER_IDENTITY,
  CLIENTS_GENDER_SIMC,
  CLIENTS_HOUSING_TYPE,
];

export const getAnalyticsCard = (id: string): AnalyticsCard | undefined =>
  ANALYTICS_CARDS.find(card => card.id === id);

/**
 * CSV from exactly the data the chart drew, or from the grain beneath it.
 *
 * Generic — no per-card serializer, so a new card gets its CSV for free and
 * cannot disagree with its chart.
 */
export function cardCsv(data: CardData, grain: CsvGrain = 'condensed'): string {
  // `raw` is only present when condensing actually changed something; falling
  // back to the condensed view keeps "raw" meaningful for every card.
  const source: CardGrain = grain === 'raw' && data.raw ? data.raw : data;
  const escape = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const header = [source.categoryColumn, ...source.series.map(s => s.name)].map(escape).join(',');
  const lines = [header];
  source.categories.forEach((category, i) => {
    lines.push(
      [
        escape(category),
        ...source.series.map(s => {
          if (s.defined?.[i] === false) return '';
          return s.text ? escape(s.text[i] ?? '') : (s.values[i] ?? 0);
        }),
      ].join(',')
    );
  });
  return lines.join('\r\n') + '\r\n';
}
