// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import fg from 'fast-glob';

/**
 * Chart series must never be wrapped in a React Fragment.
 *
 * Recharts collects its series by scanning the chart's children. It does not
 * descend into a Fragment, so `<>...</>` around a `<Line>` makes that series
 * invisible: the chart renders axes, gridlines, and an empty plot, with no
 * error anywhere. An array is fine — React.Children.toArray flattens it.
 *
 * "Inbound Weight Over Time" shipped like this. It rendered correctly under
 * React 18 and went blank at the React 19 upgrade (recharts 2.15.1) while the
 * API kept returning data, so it looked like a data problem rather than a
 * markup one. Both branches of that chart drew zero series while its
 * neighbours on the same page were fine.
 *
 * The failure is silent by construction, which is exactly why it is checked
 * here rather than left to review.
 */

const root = join(__dirname, '..', 'components');

const SERIES = ['Line', 'Bar', 'Area', 'Pie', 'Scatter', 'RadialBar'];

/**
 * A series element as the *direct* first child of a Fragment, with or without a
 * `{cond && ...}` wrapper — the two shapes the real bug took.
 *
 * Deliberately narrow. A first attempt scanned everything up to the closing
 * `</>`, which flagged a fragment wrapping `<Card>`s that happened to contain a
 * legitimately nested `<Bar>` several elements deeper. Nesting is fine; only a
 * series handed straight to a chart inside a Fragment is not.
 */
const seriesInFragment = () =>
  new RegExp(`<>\\s*(?:\\{[^{}]*?&&\\s*)?<(${SERIES.join('|')})\\b`, 's');

/** Strips comments so prose about the pattern is not read as the pattern. */
const code = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('recharts children', () => {
  it('no chart series is wrapped in a Fragment', () => {
    const pattern = seriesInFragment();

    const offenders = fg
      .sync(['**/*.tsx'], { cwd: root, absolute: true })
      .filter(file => pattern.test(code(file)))
      .map(file => file.slice(root.length + 1));

    expect(
      offenders,
      `These files wrap chart series in a React Fragment. Recharts cannot see ` +
        `them and the chart will render empty with no error. Build the series as ` +
        `an array and map it instead:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('the pattern is detectable — guards this guard', () => {
    // A regex that matched nothing would make the assertion above vacuous.
    const pattern = seriesInFragment();

    expect(pattern.test('<>\n  <Line dataKey="x" />\n</>')).toBe(true);
    expect(pattern.test('<>\n  {flag && <Bar dataKey="x" />}\n</>')).toBe(true);
    // The shape that is safe.
    expect(pattern.test('{keys.map(k => <Line key={k} dataKey={k} />)}')).toBe(false);
  });
});
