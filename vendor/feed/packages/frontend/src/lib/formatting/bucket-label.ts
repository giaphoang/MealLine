// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { format, parseISO } from 'date-fns';

export type BucketGranularity = 'day' | 'week' | 'month';

/**
 * A tick formatter runs inside Recharts' render, so a throw here unmounts the
 * whole tab rather than spoiling one label.
 *
 * That is not hypothetical: a day key reaching a month formatter built
 * `2026-06-02-01`, and the resulting `RangeError: Invalid time value` blanked
 * the entire Service lens on two of the five date presets. Falling back to the
 * raw bucket turns a mystery into a bug report.
 */
const safeDate = (value: string, build: () => string) => {
  try {
    const label = build();
    return label === 'Invalid Date' ? value : label;
  } catch {
    return value;
  }
};

export const monthLabel = (month: string) =>
  safeDate(month, () => format(parseISO(`${month}-01`), 'MMM yyyy'));

/**
 * `MMM yy` — compact, and **ambiguous once a chart can also plot days**: "Aug
 * 26" reads as the 26th of August beside a day-grained axis, when it means
 * August 2026. Procurement dropped it for exactly that reason when its short
 * ranges became daily. Kept for any axis that is only ever monthly.
 */
export const shortMonthLabel = (month: string) =>
  safeDate(month, () => format(parseISO(`${month}-01`), 'MMM yy'));

/** Day labels carry the year only when the range crosses one. */
export const dayLabelFor = (spansYears: boolean) => (day: string) =>
  safeDate(day, () => format(parseISO(day), spansYears ? 'MMM d, yyyy' : 'MMM d'));

/**
 * The labeller for a series at a given grain.
 *
 * Built per series rather than per page: bucket grain is a card's own
 * decision, and a chart that borrows the page's grain to label its own buckets
 * is the bug described above waiting to happen. Pass the granularity the data
 * actually carries.
 */
export const bucketLabeller = (
  granularity: BucketGranularity,
  spansYears: boolean,
  { shortMonths = false }: { shortMonths?: boolean } = {},
) => {
  if (granularity === 'month') return shortMonths ? shortMonthLabel : monthLabel;
  return dayLabelFor(spansYears);
};
