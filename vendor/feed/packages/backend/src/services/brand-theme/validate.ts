// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Contrast validation over the configurable space.
 *
 * Because a theme is two family choices plus a fixed stop map, the space is
 * finite — 17 chromatic × 9 neutral = 153 themes. That is the complete set, not
 * a sample, so every theme an operator can produce is verifiable at build time.
 *
 * This is a stronger guarantee than validating each configuration as it is
 * saved: a brand nobody has tried is a brand nobody has verified. Where a
 * combination fails, the fix is to adjust the stop map or exclude the pairing in
 * the wizard with a stated reason — a decision made once, by us, with the whole
 * space visible, rather than by an operator facing an error at save time.
 */

import { contrastRatio, oklchToRgb } from './color';
import { deriveFromFamilies, type TokenMap } from './derive';
import { CARBON_PALETTE, NEUTRAL_FAMILIES, TAILWIND_PALETTE, isNeutralFamily } from './palettes';
import { hexToRgb } from './color';
import {
  CONTRAST_FLOOR,
  CONTRAST_PAIRS,
  THEME_SCOPES,
  type ThemeScope,
} from './tokens';

export type ContrastFinding = {
  scope: ThemeScope;
  foreground: string;
  background: string;
  kind: 'text' | 'ui' | 'decorative';
  ratio: number;
  floor: number;
};

/** Every failing token pair in one theme. Empty means the theme passes. */
export const contrastFindings = (theme: TokenMap): ContrastFinding[] => {
  const findings: ContrastFinding[] = [];

  for (const scope of THEME_SCOPES) {
    for (const pair of CONTRAST_PAIRS) {
      const ratio = contrastRatio(
        oklchToRgb(theme[scope][pair.foreground]),
        oklchToRgb(theme[scope][pair.background])
      );
      const floor = CONTRAST_FLOOR[pair.kind];
      if (ratio < floor) {
        findings.push({
          scope,
          foreground: pair.foreground,
          background: pair.background,
          kind: pair.kind,
          ratio,
          floor,
        });
      }
    }
  }

  return findings;
};

/**
 * Carbon series against a theme's card surface.
 *
 * This replaces the guarantee `packages/frontend/src/test/chart-colors.test.ts`
 * currently makes. That test reads `--card` out of `index.css` and asserts 4.5:1
 * against it — correct today, but it would keep passing against the compiled
 * default once surfaces became configurable, while a real agency's saved surface
 * pushed series below the floor. Same assertion, given a domain instead of a
 * value.
 */
export const chartContrastFindings = (theme: TokenMap): ContrastFinding[] => {
  const findings: ContrastFinding[] = [];

  for (const scope of THEME_SCOPES) {
    const card = oklchToRgb(theme[scope].card);
    for (const entry of CARBON_PALETTE) {
      for (const grade of ['primary', 'secondary'] as const) {
        const ratio = contrastRatio(hexToRgb(entry[grade][scope]), card);
        if (ratio < CONTRAST_FLOOR.text) {
          findings.push({
            scope,
            foreground: `carbon.${entry.family}.${grade}`,
            background: 'card',
            kind: 'text',
            ratio,
            floor: CONTRAST_FLOOR.text,
          });
        }
      }
    }
  }

  return findings;
};

export const CHROMATIC_FAMILIES: readonly string[] = [
  ...new Set(
    TAILWIND_PALETTE.filter((entry) => !isNeutralFamily(entry.family)).map(
      (entry) => entry.family
    )
  ),
];

export type ThemeCombination = {
  accentFamily: string;
  neutralFamily: string;
};

/**
 * Every theme an operator can reach: 234.
 *
 * The accent may now be a neutral family, because a brand may genuinely have
 * no colour in it — see `roleFor`. That adds the 81 grayscale combinations to
 * the original 153, and they are proved here on exactly the same terms rather
 * than assumed safe.
 */
export const allThemeCombinations = (): ThemeCombination[] =>
  [...CHROMATIC_FAMILIES, ...NEUTRAL_FAMILIES].flatMap((accentFamily) =>
    NEUTRAL_FAMILIES.map((neutralFamily) => ({ accentFamily, neutralFamily }))
  );

export type CombinationReport = ThemeCombination & {
  findings: ContrastFinding[];
  chartFindings: ContrastFinding[];
};

/** Walk the whole space. Used by the exhaustive proof test. */
export const auditAllCombinations = (): CombinationReport[] =>
  allThemeCombinations().map(({ accentFamily, neutralFamily }) => {
    const theme = deriveFromFamilies(accentFamily, neutralFamily);
    return {
      accentFamily,
      neutralFamily,
      findings: contrastFindings(theme),
      chartFindings: chartContrastFindings(theme),
    };
  });
