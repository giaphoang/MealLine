// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Drift guard for the generated palette.
 *
 * `palettes.ts` is a committed copy of data that lives in two other places: the
 * Tailwind package and the frontend's Carbon declarations. The duplicated
 * `model-specs.ts` catalogue is the cautionary precedent — two lists identical
 * today and enforced by nothing, so updating one silently offers a model the
 * other cannot price. This regenerates and compares, so a Tailwind upgrade or a
 * Carbon edit fails the suite instead of quietly diverging.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CARBON_PALETTE, CARBON_CATEGORICAL_ORDER, TAILWIND_PALETTE } from '../palettes';

import { renderPalettes } from '../../../../scripts/generate-brand-palettes';

const PACKAGE_ROOT = resolve(__dirname, '../../../..');
const GENERATED = resolve(PACKAGE_ROOT, 'src/services/brand-theme/palettes.ts');

describe('the generated palette', () => {
  it('matches what the generator produces from the live sources', () => {
    // Rendered in-process rather than by spawning the script: the comparison is
    // the same, it costs milliseconds instead of most of a second, and it cannot
    // rewrite the file it is checking.
    expect(
      renderPalettes(),
      'palettes.ts is stale — run: npx ts-node --transpile-only scripts/generate-brand-palettes.ts'
    ).toBe(readFileSync(GENERATED, 'utf8'));
  });

  it('carries the full Tailwind palette, achromatic entries included', () => {
    // Tailwind writes achromatic hue as the keyword `none`. Parsing it as a
    // number silently drops the entire `neutral` family — which is the family a
    // dead-neutral brand charcoal needs.
    expect(TAILWIND_PALETTE.length).toBeGreaterThanOrEqual(280);
    expect(TAILWIND_PALETTE.some((entry) => entry.family === 'neutral')).toBe(true);
    expect(
      TAILWIND_PALETTE.filter((entry) => entry.family === 'neutral').length
    ).toBe(11);
  });

  it('carries every Carbon family and its categorical order', () => {
    expect(CARBON_PALETTE).toHaveLength(10);
    expect(CARBON_CATEGORICAL_ORDER).toHaveLength(10);
    expect([...CARBON_CATEGORICAL_ORDER].sort()).toEqual(
      CARBON_PALETTE.map((entry) => entry.family).sort()
    );
  });
});
