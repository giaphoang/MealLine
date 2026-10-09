// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, it } from 'vitest';
import { legendSvg, lineChartSvg, seriesLineStyle, stackedBarSvg } from '../analytics-print';
import { PRINT_GREYSCALE_STROKES } from '../../brand-theme/charts';
import { contrastRatioHex } from '../../brand-theme/color';
import {
  DEFAULT_REPORT_PRINT_THEME,
  greyscalePrintTheme,
  withReportPrintTheme,
} from '../print-theme';

/**
 * Twelve series on seven greys.
 *
 * `procurement-legacy-donations-over-time` really does carry twelve, and the
 * ramp wrapped, so series 8 through 12 printed as pixel-identical copies of
 * series 1 through 5. There is no eighth grey to add — the steps are already
 * about as close as a mono printer resolves — so the range is extended with
 * texture instead.
 */
const series = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    name: `series ${i}`,
    values: [1, 2, 3],
  }));

const COLOUR = DEFAULT_REPORT_PRINT_THEME;
const BW = greyscalePrintTheme(COLOUR);

const fillsOf = (svg: string) => [...svg.matchAll(/fill="([^"]+)"/g)].map(m => m[1]);

describe('series texture', () => {
  it('spends every solid grey before reaching for a pattern', () => {
    const svg = withReportPrintTheme(BW, () => stackedBarSvg(['a', 'b', 'c'], series(6)));
    expect(svg).not.toContain('<pattern');
    expect(fillsOf(svg).filter(f => f.startsWith('url('))).toEqual([]);
  });

  it('gives a twelve-series chart twelve distinguishable fills', () => {
    const svg = withReportPrintTheme(BW, () => stackedBarSvg(['a'], series(12)));
    const barFills = fillsOf(svg).filter(f => f !== 'none');
    // One bar per series in a single-category chart, plus the pattern tiles.
    const distinct = new Set(barFills);
    expect(distinct.size).toBeGreaterThanOrEqual(12);
    // Six solid greys, then six more of the same greys carrying a texture.
    expect(barFills.filter(f => f.startsWith('url(')).length).toBe(6);
  });

  it('defines every pattern it references, in the same SVG', () => {
    const svg = withReportPrintTheme(BW, () => stackedBarSvg(['a'], series(12)));
    for (const ref of fillsOf(svg).filter(f => f.startsWith('url('))) {
      const id = ref.slice(5, -1);
      expect(svg, `undefined pattern ${id}`).toContain(`<pattern id="${id}"`);
    }
  });

  it('textures the legend the same way it textures the bars', () => {
    // A swatch that does not match its bars is worse than no legend: it
    // asserts a correspondence that is not there.
    const names = series(12).map(s => s.name);
    const chart = withReportPrintTheme(BW, () => stackedBarSvg(['a'], series(12)));
    const legend = withReportPrintTheme(BW, () => legendSvg(names));
    const refs = (svg: string) =>
      fillsOf(svg).filter(f => f.startsWith('url('));
    expect(refs(legend)).toEqual(refs(chart));
    for (const ref of refs(legend)) {
      expect(legend).toContain(`<pattern id="${ref.slice(5, -1)}"`);
    }
  });

  it('leaves the colour rendering flat', () => {
    // Texture is the compensation for grey having fewer usable steps than hue.
    // Applying it to the colour PDF would be noise bought with nothing.
    const svg = withReportPrintTheme(COLOUR, () => stackedBarSvg(['a'], series(12)));
    expect(svg).not.toContain('<pattern');
    expect(fillsOf(svg).filter(f => f.startsWith('url('))).toEqual([]);
  });
});

describe('series lines', () => {
  /**
   * A line is not a small bar. Six fill greys separate cleanly as slabs and do
   * not as two-unit strokes crossing each other over a gridded plot, which is
   * why every line card printed poorly even after the fill ramp was fixed.
   */
  it('uses a shorter ramp than the fills, because a stroke carries less', () => {
    expect(PRINT_GREYSCALE_STROKES.length).toBeLessThan(BW.palette.length);
    // Presentation order, like the fills: the widest pair first, so a
    // two-series line chart gets the ends. So compare every pair, not
    // neighbours in the array.
    const levels = PRINT_GREYSCALE_STROKES
      .map(hex => contrastRatioHex(hex, '#ffffff'))
      .sort((a, b) => b - a);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i - 1] / levels[i], `stroke levels ${i - 1}->${i}`).toBeGreaterThan(2);
    }
    for (const hex of PRINT_GREYSCALE_STROKES) {
      expect(contrastRatioHex(hex, '#ffffff'), hex).toBeGreaterThanOrEqual(3);
    }
  });

  it('dashes from the fourth series, not the seventh', () => {
    // Three levels against four dash styles is twelve distinguishable lines,
    // which covers the longest line card in the report. Reaching for the dash
    // only after the greys run out would be six unreadable lines first.
    const seen = withReportPrintTheme(BW, () =>
      Array.from({ length: 12 }, (_, i) => seriesLineStyle(i))
    );
    const keys = seen.map(style => `${style.stroke}|${style.dash}`);
    expect(new Set(keys).size).toBe(12);
    expect(seen.slice(0, 3).every(style => style.dash === '')).toBe(true);
    expect(seen[3].dash).not.toBe('');
  });

  it('leaves the colour rendering undashed', () => {
    const styles = withReportPrintTheme(COLOUR, () =>
      Array.from({ length: 12 }, (_, i) => seriesLineStyle(i))
    );
    expect(styles.every(style => style.dash === '')).toBe(true);
  });

  it('draws a legend for lines out of lines, not out of fills', () => {
    // A filled swatch beside a dashed line names the right series with the
    // wrong appearance, which is worse than leaving the legend off.
    const names = ['a', 'b', 'c', 'd', 'e'];
    const legend = withReportPrintTheme(BW, () => legendSvg(names, 900, 'line'));
    expect(legend).not.toContain('<rect');
    expect(legend).toContain('stroke-dasharray');
    const chart = withReportPrintTheme(BW, () =>
      lineChartSvg(['x', 'y'], names.map(n => ({ name: n, values: [1, 2] })))
    );
    const dashes = (svg: string) =>
      [...svg.matchAll(/stroke-dasharray="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(dashes(legend))).toEqual(new Set(dashes(chart)));
  });
});
