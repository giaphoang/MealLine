// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Readability-driven grain selection for time-series cards.
 *
 * A long range must stay exportable without the user thinking about it, so the
 * grain is derived from a physical constraint rather than a hard-coded rule: a
 * bar needs about 1.6mm on paper to read as a bar. Below that, the chart is a
 * grey smear that implies precision it cannot show.
 *
 * The threshold is stated in millimetres, not pixels, because the output is
 * vector — the SVG's user units map to a fixed printed width, so millimetres
 * are the units the rule is actually about and the only ones you can check
 * against a printed page.
 *
 * Condensing happens *here*, before both the chart and the CSV, not inside the
 * renderer. If the renderer condensed, the chart would show quarters while the
 * CSV still held months and the two files in one ZIP would disagree.
 */

/** Narrowest bar that still reads as a bar on paper. */
export const MIN_BAR_MM = 1.6;

/** Usable chart width: landscape Letter, 0.5in margins, minus card padding. */
export const CHART_WIDTH_MM = 244;

/** `stackedBarSvg` draws each bar at this fraction of its slot. */
const BAR_FRACTION = 0.68;

/** Categories that still clear MIN_BAR_MM across CHART_WIDTH_MM. */
export const maxReadableCategories = (
  widthMm = CHART_WIDTH_MM,
  minBarMm = MIN_BAR_MM
): number => Math.floor((widthMm * BAR_FRACTION) / minBarMm);

export type Grain = 'day' | 'month' | 'quarter' | 'year';

/** Coarsening ladder. Each step must strictly reduce the category count. */
const LADDER: Grain[] = ['day', 'month', 'quarter', 'year'];

export interface Series {
  name: string;
  values: number[];
  /**
   * Whether each numeric slot represents a point the chart may draw.
   *
   * A zero is data; `false` is outside coverage. Seasonal comparisons need
   * both meanings on the same twelve-month axis. Most series cover every slot
   * and omit this field.
   */
  defined?: boolean[];
  /**
   * Formatted values, when the numbers alone do not carry their meaning.
   *
   * A KPI card mixes pounds, counts, and days in one list, so a single numeric
   * column would be ambiguous. Chart cards leave this unset. Condensing ignores
   * it — the cards that need it never condense.
   */
  text?: string[];
}

export interface Condensed {
  categories: string[];
  series: Series[];
  grain: Grain;
  /** True when the requested grain was too fine to print. */
  condensed: boolean;
  /** User-facing explanation, or null when nothing was changed. */
  note: string | null;
}

const GRAIN_PLURAL: Record<Grain, string> = {
  day: 'days',
  month: 'months',
  quarter: 'quarters',
  year: 'years',
};

/**
 * `2009-11` → `2009 Q4`, `2009`. Input is a `YYYY-MM` month key or, since
 * Procurement's short ranges plot deliveries, a `YYYY-MM-DD` day key — the
 * split takes the first two parts either way, so a day condenses correctly.
 */
const keyFor = (bucket: string, grain: Grain): string => {
  const [year, mm] = bucket.split('-');
  if (grain === 'year') return year;
  if (grain === 'quarter') return `${year} Q${Math.floor((Number(mm) - 1) / 3) + 1}`;
  if (grain === 'month') return `${year}-${mm}`;
  return bucket;
};

/** Sums each series into the coarser buckets, preserving first-seen order. */
const bucket = (categories: string[], series: Series[], grain: Grain) => {
  const order: string[] = [];
  const index = new Map<string, number>();
  for (const category of categories) {
    const key = keyFor(category, grain);
    if (!index.has(key)) {
      index.set(key, order.length);
      order.push(key);
    }
  }
  const bucketed = series.map(s => {
    const values = new Array(order.length).fill(0);
    const defined = s.defined ? new Array(order.length).fill(false) : undefined;
    categories.forEach((category, i) => {
      const target = index.get(keyFor(category, grain))!;
      if (s.defined?.[i] === false) return;
      values[target] += s.values[i] ?? 0;
      if (defined) defined[target] = true;
    });
    return { name: s.name, values, ...(defined ? { defined } : {}) };
  });
  return { categories: order, series: bucketed };
};

/**
 * Coarsens until the bars are wide enough to read, and says so when it does.
 *
 * Returns the finest grain that fits. If even the coarsest is too dense — an
 * implausible range, but possible — it returns the coarsest and still reports
 * `condensed`, because silently drawing an unreadable chart is the failure this
 * exists to prevent.
 */
export function condenseTimeSeries(
  categories: string[],
  series: Series[],
  options: { grain?: Grain; widthMm?: number; minBarMm?: number } = {}
): Condensed {
  const startGrain = options.grain ?? 'month';
  const limit = maxReadableCategories(options.widthMm, options.minBarMm);
  const start = LADDER.indexOf(startGrain);

  if (categories.length <= limit) {
    return { categories, series, grain: startGrain, condensed: false, note: null };
  }

  for (let i = start + 1; i < LADDER.length; i++) {
    const grain = LADDER[i];
    const next = bucket(categories, series, grain);
    if (next.categories.length <= limit) {
      return {
        ...next,
        grain,
        condensed: true,
        note:
          `Condensed to ${GRAIN_PLURAL[grain]}: ${categories.length} ${GRAIN_PLURAL[startGrain]} ` +
          `would print at under ${MIN_BAR_MM}mm per bar. Narrow the date range to see ` +
          `${GRAIN_PLURAL[startGrain]}.`,
      };
    }
  }

  const coarsest = bucket(categories, series, LADDER[LADDER.length - 1]);
  return {
    ...coarsest,
    grain: LADDER[LADDER.length - 1],
    condensed: true,
    note:
      `Condensed to ${GRAIN_PLURAL[LADDER[LADDER.length - 1]]}, and still dense at ` +
      `${coarsest.categories.length} bars. Narrow the date range for a readable chart.`,
  };
}
