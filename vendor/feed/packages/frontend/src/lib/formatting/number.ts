// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Figures over 999 always carry thousands separators.
 *
 * Not decoration. `45000` and `4500` differ by one glyph in the middle of a
 * run of zeros, and a reader comparing two axis labels has to count digits to
 * tell forty-five thousand from forty-five hundred. `45,000` and `4,500` differ
 * at a glance. The cost of getting it wrong is a decision made against a figure
 * an order of magnitude off.
 *
 * The locale is pinned rather than left to the browser. A visitor whose device
 * is set to de-DE would otherwise read `1.000` for one thousand on the axis and
 * `1,000` in a summary tile rendered elsewhere, which is worse than either
 * convention applied consistently.
 */
const DEFAULT_LOCALE = 'en-US';

/**
 * A count, weight, or other figure as it appears to a reader.
 *
 * Fractions are kept to one place: procurement weights arrive as hundredths of
 * a pound and land on values like 23,930.5, where rounding to whole pounds
 * would make two adjacent months look identical.
 */
export const formatNumber = (value: number): string =>
  Number.isFinite(value)
    ? value.toLocaleString(DEFAULT_LOCALE, { maximumFractionDigits: 1 })
    : '';

/**
 * The same, for a Recharts `tickFormatter`.
 *
 * Axis ticks arrive as `number | string` depending on the axis type, and a
 * category tick must pass through untouched — running a month name through a
 * number formatter yields an empty label and an axis of blanks.
 */
export const formatAxisNumber = (value: unknown): string => {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return formatNumber(Number(value));
  }
  return String(value ?? '');
};

/**
 * Money on a chart axis: whole dollars with separators, no cents.
 *
 * Cents on an axis label add three characters and no information — the tick
 * exists to place a magnitude, and $7,768.00 places it no better than $7,768.
 */
export const formatAxisMoney = (value: unknown): string => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return String(value ?? '');
  return amount.toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });
};
