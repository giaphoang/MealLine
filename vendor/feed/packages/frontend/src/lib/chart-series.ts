// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Ends a line where its data ends, instead of running it along the axis.
 *
 * Time-series payloads are assembled as a dense grid: every bucket carries a
 * key for every series, defaulted to zero, because Recharts needs an explicit
 * zero for a month a source recorded nothing — otherwise the line bridges the
 * gap and implies activity that did not happen.
 *
 * That default is right *inside* a series' life and wrong outside it. A
 * partner who stopped delivering in May 2023, or a channel that started in
 * June, otherwise draws a long flat zero across every month it did not exist,
 * which reads as "we received nothing" rather than "there was nothing to
 * receive". The two are different claims and only one of them is true.
 *
 * So: leading and trailing zeros become `null`, and Recharts breaks the line
 * there (its default `connectNulls={false}`). Zeros *between* real values are
 * left alone — those are genuine gaps in an active series, and the reason the
 * dense grid exists in the first place.
 */
export function trimSeriesToData<T extends Record<string, unknown>>(
  rows: T[],
  keys: string[]
): T[] {
  if (rows.length === 0) return rows;

  const trimmed = rows.map(row => ({ ...row }));

  for (const key of keys) {
    const hasValue = (index: number) => {
      const value = trimmed[index][key];
      return typeof value === 'number' && value > 0;
    };

    const first = trimmed.findIndex((_, index) => hasValue(index));

    // A series with no data anywhere in range is nulled end to end, so it
    // drops out of the chart rather than drawing a flat zero for the whole
    // period. Callers that also build the legend should drop it there too.
    if (first === -1) {
      for (const row of trimmed) (row as Record<string, unknown>)[key] = null;
      continue;
    }

    let last = trimmed.length - 1;
    while (last > first && !hasValue(last)) last -= 1;

    for (let index = 0; index < trimmed.length; index += 1) {
      if (index < first || index > last) {
        (trimmed[index] as Record<string, unknown>)[key] = null;
      }
    }
  }

  return trimmed;
}
