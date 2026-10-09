// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Brand-aligning the chart palette without touching its accessibility.
 *
 * FEED's categorical series come from IBM Carbon: ten families, every grade
 * already verified at 4.5:1 against the card surface. Generating colours
 * alongside that would undermine it, so brand alignment only changes *which*
 * accessible colour appears first.
 *
 * **Rotate, do not re-sort.** `CARBON_CATEGORICAL_ORDER` in the frontend is a
 * deliberate hue-hopping sequence — each family sits far from its neighbours on
 * the colour wheel so adjacent series stay distinguishable, including under
 * colour-vision deficiency. Re-sorting by distance to the brand hue clusters
 * similar hues together and destroys exactly that property. Rotating the list
 * so the brand-nearest family leads preserves every adjacent pair except the one
 * at the wrap point, so the guarantee survives by construction rather than by a
 * separately-enforced separation floor.
 */

import { hexToOklch, hueDifference, oklchToHex } from './color';
import { CARBON_CATEGORICAL_ORDER, CARBON_PALETTE } from './palettes';

/**
 * Families whose colour carries meaning rather than identity. Where red means
 * danger and green means success, meaning outranks ordering — these keep their
 * semantic role and are never promoted into the categorical lead by a brand that
 * happens to sit near them.
 */
export const STATUS_PINNED_FAMILIES = ['red', 'green', 'yellow'] as const;

const familyHue = (family: string): number => {
  const entry = CARBON_PALETTE.find((candidate) => candidate.family === family);
  if (!entry) throw new Error(`Unknown Carbon family "${family}".`);
  return hexToOklch(entry.primary.light).h;
};

/**
 * The categorical order, rotated so the family nearest `brandHue` leads.
 *
 * Status-pinned families are excluded from *leading* but keep their position in
 * the sequence, so a red-branded agency does not turn its danger colour into the
 * first categorical series.
 */
export const brandAlignedCarbonOrder = (brandHue: number): string[] => {
  const order = [...CARBON_CATEGORICAL_ORDER];

  const leadCandidates = order
    .map((family, index) => ({ family, index }))
    .filter(
      ({ family }) => !(STATUS_PINNED_FAMILIES as readonly string[]).includes(family)
    );

  if (leadCandidates.length === 0) return order;

  const lead = leadCandidates.reduce((best, candidate) => {
    const bestDelta = Math.abs(hueDifference(brandHue, familyHue(best.family)));
    const delta = Math.abs(hueDifference(brandHue, familyHue(candidate.family)));
    return delta < bestDelta ? candidate : best;
  });

  return [...order.slice(lead.index), ...order.slice(0, lead.index)];
};

/** Resolve a brand-aligned series colour by index, wrapping past the tenth. */
export const seriesColor = (
  brandHue: number,
  index: number,
  scheme: 'light' | 'dark' = 'light',
  grade: 'primary' | 'secondary' = 'primary'
): string => {
  const order = brandAlignedCarbonOrder(brandHue);
  const family = order[index % order.length];
  const entry = CARBON_PALETTE.find((candidate) => candidate.family === family);
  if (!entry) throw new Error(`Unknown Carbon family "${family}".`);
  return entry[grade][scheme];
};

/**
 * The series ramp for a black-and-white report.
 *
 * Carbon's categorical grades sit at roughly equal luminance so that no series
 * dominates another, which is right on screen and is what makes the palette
 * colour-vision safe. On paper it means the series are separated by hue alone:
 * measured on a real export, all four rendered series mapped to greyscale
 * 111/255 — a spread of zero — so a mono printer or a photocopy turns every bar
 * the same grey and the legend becomes the only way to read the chart.
 *
 * Lightness is the only channel left once hue is gone, so this varies it. The
 * usual objection — that lightness reads as rank, implying a hierarchy the
 * series do not have — is why the colour palette must NOT do this, and why it
 * is fine here: the reader of a greyscale rendering knows hue has been removed.
 *
 * Spaced evenly in perceptual lightness between L 0.20 and L 0.66. Every step
 * clears 3:1 against white (WCAG 1.4.11 for meaningful graphics), the lightest
 * at 3.11:1, and adjacent steps differ by 1.23–1.39x in contrast, which is a
 * visible difference in grey.
 */
/**
 * The ladder itself: seven greys spaced evenly in perceptual lightness between
 * L 0.20 and L 0.66. The lightest clears 3:1 against white, which WCAG 1.4.11
 * asks of a meaningful non-text graphic.
 */
/**
 * Six steps, not seven.
 *
 * The ends are fixed by two hard limits: the light end cannot pass L 0.66,
 * where a fill drops under the 3:1 that WCAG 1.4.11 asks of a meaningful
 * graphic, and the dark end bottoms out against the ink. Seven steps fit
 * between them arithmetically at 1.23x apart, but that is around what a mono
 * printer resolves and below what a reader reliably separates on a photocopy.
 * Six is the honest count; the range past it is bought with texture instead.
 */
const GREYSCALE_LADDER = Array.from({ length: 6 }, (_, index) =>
  oklchToHex({ l: 0.2 + (0.66 - 0.2) * (index / 5), c: 0, h: 0 })
);

/**
 * Presentation order: ends first, then the middle, then the gaps.
 *
 * Charts take `palette[seriesIndex]`, so the order decides what a two-series
 * chart gets — and shipping the ladder in ascending order gave it the two
 * darkest neighbours. A stacked bar of "answered" against "not answered" came
 * out as two near-identical blacks, separated by a contrast ratio of 1.23.
 *
 * Bisecting instead means the first two series are the ends of the ladder and
 * every later one lands in the largest remaining gap, so separation degrades
 * gracefully as series are added rather than starting at its worst:
 *
 *   2 series  5.82x   3 series  2.15x   4 series  1.48x   5+  1.30x
 *
 * Most report charts carry two or three series, which is where the difference
 * between 5.82 and 1.23 decides whether the chart can be read at all.
 */
const BISECTED = [0, 5, 3, 2, 4, 1];

export const PRINT_GREYSCALE_SERIES: readonly string[] = BISECTED.map(
  index => GREYSCALE_LADDER[index]
);

/**
 * A separate, much shorter ramp for lines.
 *
 * A filled bar is a slab of grey a centimetre across; a series line is a stroke
 * two units wide. The same two greys that are comfortably distinct as areas are
 * not distinct at all as thin strokes crossing each other over a gridded plot,
 * which is why every line card in the export read poorly even after the fill
 * ramp was fixed — the fix was for a different mark.
 *
 * Three levels is about what a stroke carries. The rest of the separation comes
 * from dashing, which is the channel lines actually have and areas do not.
 */
export const PRINT_GREYSCALE_STROKES: readonly string[] = [0, 5, 3].map(
  index => GREYSCALE_LADDER[index]
);
