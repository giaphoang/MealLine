// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, it } from 'vitest';
import { contrastRatioHex } from '../../brand-theme/color';
import { PRINT_GREYSCALE_SERIES } from '../../brand-theme/charts';
import { greyscalePrintTheme, type ReportPrintTheme } from '../print-theme';

/**
 * A report is a document that gets printed, often on whatever is in the office.
 *
 * Carbon's categorical grades are isoluminant so that no series dominates
 * another, which is right on screen and is what makes them colour-vision safe.
 * On paper it means the series are separated by hue alone: measured on a real
 * export, all four mapped to greyscale 111/255, a spread of zero, so a mono
 * printer turned every bar the same grey.
 */
const isGrey = (hex: string) => {
  const [r, g, b] = hex.replace('#', '').match(/../g)!.map(h => parseInt(h, 16));
  return Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1;
};

const COLOUR_THEME: ReportPrintTheme = {
  palette: ['#007d79', '#ba4e00', '#8a3ffc', '#198038', '#1192e8', '#a56eff', '#005d5d'],
  ink: '#0c0c09',
  muted: '#5b5b4b',
  grid: '#d8d8d0',
  background: '#ffffff',
  primary: '#3c6300',
  primarySoft: '#ecfccb',
  note: { ink: '#8A5A00', background: '#FFF8E1', border: '#FFE9A8' },
};

describe('the black-and-white rendering', () => {
  const bw = greyscalePrintTheme(COLOUR_THEME);

  it('leaves no colour anywhere in the document', () => {
    const offenders = [
      ...bw.palette,
      bw.ink,
      bw.muted,
      bw.grid,
      bw.background,
      bw.primary,
      bw.primarySoft,
      bw.note.ink,
      bw.note.background,
      bw.note.border,
    ].filter(hex => !isGrey(hex));
    expect(offenders, `not grey: ${offenders.join(', ')}`).toEqual([]);
  });

  it('keeps every contrast ratio the colour version had', () => {
    // Luminance-preserving conversion is why the greyscale rendering needs no
    // separate contrast proof: a heading that cleared 7:1 in colour still does.
    for (const key of ['ink', 'muted', 'primary'] as const) {
      const before = contrastRatioHex(COLOUR_THEME[key], '#ffffff');
      const after = contrastRatioHex(bw[key], '#ffffff');
      expect(Math.abs(before - after), `${key}: ${before} -> ${after}`).toBeLessThan(0.1);
    }
  });

  it('separates the series by lightness, which converting could never do', () => {
    // The whole point. Converting the Carbon grades by luminance maps them all
    // to one value, so the ramp replaces them rather than transforming them.
    const converted = new Set(bw.palette);
    expect(converted.size).toBe(bw.palette.length);
    // The ramp itself, at the ramp's length — not the colour palette's. Keeping
    // the colour length wrapped the last entry onto a duplicate of the first,
    // and left it solid, because texture starts where the palette array ends.
    expect(bw.palette).toEqual([...PRINT_GREYSCALE_SERIES]);
  });

  it('keeps every series readable against paper', () => {
    // WCAG 1.4.11: meaningful non-text graphics need 3:1.
    for (const hex of PRINT_GREYSCALE_SERIES) {
      expect(contrastRatioHex(hex, '#ffffff'), hex).toBeGreaterThanOrEqual(3);
    }
  });

  it('spends the ladder widest-first, so small charts get the biggest gaps', () => {
    // Charts take palette[0], palette[1], ... in order, so the ORDER of the ramp
    // is what a two-series chart actually gets. Handing out the ladder in
    // sequence gave such a chart the two darkest neighbouring steps: 1.23x
    // apart, indistinguishable in print. Bisecting the ladder spends the
    // extremes first and subdivides from there, so separation degrades
    // gracefully as series are added instead of starting at its worst.
    const worstGapAmong = (count: number) => {
      const used = PRINT_GREYSCALE_SERIES.slice(0, count)
        .map(hex => contrastRatioHex(hex, '#ffffff'))
        .sort((a, b) => b - a);
      return Math.min(...used.slice(1).map((ratio, i) => used[i] / ratio));
    };
    expect(worstGapAmong(2)).toBeGreaterThan(5);
    expect(worstGapAmong(3)).toBeGreaterThan(2.1);
    for (let count = 4; count <= PRINT_GREYSCALE_SERIES.length; count += 1) {
      expect(worstGapAmong(count), `${count} series`).toBeGreaterThan(1.2);
    }
  });
});
