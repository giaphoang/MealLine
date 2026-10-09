// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import {
  COUNT,
  DOLLARS,
  groupedHBarSvg,
  hBarSvg,
  lineChartSvg,
  PERCENT,
  stackedHBarSvg,
  textWidth,
  truncateToWidth,
} from '../analytics-print';

/**
 * Label fitting in the printed charts.
 *
 * A label column is a fixed width and the bars start at its right edge, so a
 * label that overruns prints straight through the bar beside it. That reached a
 * user as "Meat, Chicken Drumsticks (12/3.4 lb trays)" lying across its own
 * bar, which is why these measure real widths rather than counting characters.
 */

describe('textWidth', () => {
  it('measures capitals as wider than narrow lowercase of the same length', () => {
    // The whole reason for a metrics table. An average-width estimate scores
    // these identically and mis-truncates both.
    expect(textWidth('MMMMM', 12)).toBeGreaterThan(textWidth('iiiii', 12) * 3);
  });

  it('scales with font size', () => {
    expect(textWidth('Peaches', 24)).toBeCloseTo(textWidth('Peaches', 12) * 2, 5);
  });

  it('treats an unknown glyph as an average advance rather than zero', () => {
    // A zero-width fallback would let a label of accented text overrun
    // silently, which is the failure this file exists to prevent.
    expect(textWidth('é', 12)).toBeGreaterThan(0);
  });
});

describe('truncateToWidth', () => {
  it('leaves a label that fits completely untouched', () => {
    expect(truncateToWidth('Peaches', 210, 12)).toBe('Peaches');
  });

  it('cuts an over-long label and marks it with an ellipsis', () => {
    const long = 'Meat, Chicken Drumsticks (12/3.4 lb trays)';
    const cut = truncateToWidth(long, 210, 12);

    expect(cut).not.toBe(long);
    expect(cut.endsWith('…')).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
  });

  it('produces a result that actually fits, ellipsis included', () => {
    // The ellipsis is part of the budget. Counting only the kept characters is
    // the obvious mistake and puts the mark itself over the bar.
    for (const label of [
      'Meat, Chicken Drumsticks (12/3.4 lb trays)',
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
      'Non-Food, Paper Bags with handles, 300/case',
    ]) {
      expect(textWidth(truncateToWidth(label, 210, 12), 12)).toBeLessThanOrEqual(210);
    }
  });

  it('does not leave a dangling space before the ellipsis', () => {
    const cut = truncateToWidth('Dairy, Whole Milk, Shelf Stable, 12/32 oz.', 120, 12);
    expect(cut).not.toMatch(/ …$/);
  });

  it('degrades to the ellipsis alone rather than overflowing a tiny column', () => {
    expect(truncateToWidth('Peaches', 4, 12)).toBe('…');
    expect(truncateToWidth('Peaches', 0, 12)).toBe('');
  });
});

describe('label columns in the primitives', () => {
  const long = 'Meat, Chicken Drumsticks (12/3.4 lb trays) and then some more text';

  it('hBarSvg truncates rather than drawing under the bars', () => {
    const svg = hBarSvg([{ label: long, value: 10 }]);
    expect(svg).toContain('…');
    expect(svg).not.toContain(long);
  });

  it('stackedHBarSvg truncates its category labels', () => {
    const svg = stackedHBarSvg([long], [{ name: 'a', values: [5] }]);
    expect(svg).toContain('…');
    expect(svg).not.toContain(long);
  });

  it('groupedHBarSvg truncates its category labels', () => {
    const svg = groupedHBarSvg([long], [{ name: 'a', values: [5] }]);
    expect(svg).toContain('…');
    expect(svg).not.toContain(long);
  });

  it('leaves short labels alone in every primitive', () => {
    expect(hBarSvg([{ label: 'Peaches', value: 1 }])).toContain('>Peaches<');
    expect(stackedHBarSvg(['Peaches'], [{ name: 'a', values: [1] }])).toContain('>Peaches<');
    expect(groupedHBarSvg(['Peaches'], [{ name: 'a', values: [1] }])).toContain('>Peaches<');
  });
});

describe('bar value units', () => {
  it('defaults to pounds, which is what most breakdowns measure', () => {
    expect(hBarSvg([{ label: 'Produce', value: 1234 }])).toContain('1,234 lb');
  });

  it('writes dollars as currency when the card measures money', () => {
    // "Where Paid Procurement Dollars Went" printed "43,245 lb" for $43,245
    // until the unit stopped being hard-coded in the primitive.
    const svg = hBarSvg([{ label: 'Oil', value: 43244.92 }], 900, 30, DOLLARS);

    expect(svg).toContain('$43,244.92');
    expect(svg).not.toContain('lb');
  });

  it('writes a bare number when the card counts things', () => {
    // Availability Summary counts items; "58 lb" of items is nonsense.
    const svg = hBarSvg([{ label: 'Available Now', value: 58 }], 900, 30, COUNT);

    expect(svg).toContain('>58<');
    expect(svg).not.toContain('lb');
  });
});

describe('print chart scales and values', () => {
  it('labels grouped count bars and gives them an integer scale', () => {
    const svg = groupedHBarSvg(
      ['Rice'],
      [{ name: 'Unavailable Entries', values: [5] }],
      900,
      13,
      { showAxis: true, formatValue: COUNT }
    );

    expect(svg).toContain('data-axis-tick="true"');
    expect(svg).toContain('data-bar-value="Unavailable Entries"');
    expect(svg).toContain('>5<');
  });

  it('uses a fixed percent range and omits undefined category-pressure bars', () => {
    const svg = groupedHBarSvg(
      ['Beans'],
      [{ name: 'Category Limits', values: [0], defined: [false] }],
      900,
      13,
      { showAxis: true, max: 100, formatValue: PERCENT }
    );

    expect(svg).toContain('>100%<');
    expect(svg).not.toContain('data-bar-value="Category Limits"');
  });

  it('prints collision-aware endpoint values on operational lines', () => {
    const svg = lineChartSvg(
      ['Jul 1', 'Jul 2'],
      [
        { name: 'Limited Supply', values: [2, 5] },
        { name: 'Clearance', values: [3, 5] },
      ],
      900,
      300,
      false,
      { endLabels: true, formatValue: COUNT }
    );

    expect(svg.match(/data-end-label=/g)).toHaveLength(2);
    expect(svg).toContain('data-end-label="Limited Supply"');
    expect(svg).toContain('>5<');
  });
});
