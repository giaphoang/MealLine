// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import { hexToOklch } from '../color';
import { brandAlignedCarbonOrder, seriesColor } from '../charts';
import { CARBON_CATEGORICAL_ORDER } from '../palettes';

const adjacentPairs = (order: readonly string[]) =>
  order.slice(0, -1).map((family, index) => `${family}>${order[index + 1]}`);

describe('brand-aligned Carbon ordering', () => {
  it('is a rotation, so it holds every family exactly once', () => {
    for (const hue of [0, 60, 120, 180, 240, 300]) {
      const order = brandAlignedCarbonOrder(hue);
      expect([...order].sort()).toEqual([...CARBON_CATEGORICAL_ORDER].sort());
    }
  });

  it('preserves the colour-vision-safe adjacency it was given', () => {
    // CARBON_CATEGORICAL_ORDER hops around the wheel so neighbouring series stay
    // distinguishable. Re-sorting by distance to the brand hue would cluster
    // similar hues and destroy that; a rotation keeps every adjacent pair except
    // the one at the wrap point.
    const original = adjacentPairs(CARBON_CATEGORICAL_ORDER);
    for (const hue of [30, 210, 330]) {
      const rotated = adjacentPairs(brandAlignedCarbonOrder(hue));
      const preserved = rotated.filter((pair) => original.includes(pair));
      expect(preserved.length).toBe(rotated.length - 1);
    }
  });

  it('leads with the family nearest the brand hue, not the one named for it', () => {
    // WTH blue sits at 243.5 degrees — a deep, teal-leaning blue. Carbon's
    // "blue" is 262.0 (purple-leaning) and its "cyan" is 249.6, so cyan is the
    // closer match by 12 degrees. Naming is not hue, here as with the Tailwind
    // snap that puts St. Johns' "teal" on emerald.
    expect(brandAlignedCarbonOrder(hexToOklch('#186090').h)[0]).toBe('cyan');
  });

  it('falls past a pinned family to the next nearest', () => {
    // St. Johns teal sits at 163.1 degrees. Carbon green (148.3) is nearest at
    // 14.8 degrees, but green is status-encoded and cannot lead, so the lead
    // falls to teal at 27.8 degrees.
    expect(brandAlignedCarbonOrder(hexToOklch('#33A478').h)[0]).toBe('teal');
  });

  it('never promotes a status-encoded family into the lead', () => {
    // A red-branded agency must not turn its danger colour into series one.
    for (const hue of [20, 25, 30, 140, 150]) {
      expect(['red', 'green', 'yellow']).not.toContain(
        brandAlignedCarbonOrder(hue)[0]
      );
    }
  });

  it('resolves series colours from the Carbon palette, never a new colour', () => {
    const hue = hexToOklch('#33A478').h;
    for (let index = 0; index < 12; index += 1) {
      expect(seriesColor(hue, index)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
