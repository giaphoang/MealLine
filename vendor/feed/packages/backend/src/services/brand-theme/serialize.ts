// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * `TokenMap` → the formats FEED's three colour systems consume.
 *
 * `serializeOklch` is the active app serializer. `serializeHslTriplets` remains
 * available as a compatibility boundary for older artifacts and for measuring
 * the perceptual fidelity of the OKLCH migration.
 */

import { oklchToHex, oklchToHsl } from './color';
import type { TokenMap } from './derive';
import { BRAND_TOKENS, THEME_SCOPES, type BrandToken, type ThemeScope } from './tokens';
import { isProtectedToken } from './tokens';

const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** `222 50% 5%` — the legacy bare-triplet shape. */
export const hslTriplet = (color: Parameters<typeof oklchToHsl>[0]): string => {
  const { h, s, l } = oklchToHsl(color);
  return `${round(h, 1)} ${round(s, 1)}% ${round(l, 1)}%`;
};

/**
 * `oklch(14.5% 0.021 263)` — the active v1.7.5 shape.
 *
 * Lightness is emitted as a PERCENTAGE, and this is load bearing. Safari 15.4
 * — the engine on the iPad mini 4, which is on the iPadOS 15 security branch —
 * parses `oklch(44.8% 0.119 151.3)` and rejects `oklch(0.448 0.119 151.3)`.
 * Same colour, same channel values, only the notation differs; the bare-number
 * lightness form landed later. Measured on-device:
 *
 *   CSS.supports('color', 'oklch(44.8% 0.119 151.3)')  ->  true
 *   CSS.supports('color', 'oklch(0.448 0.119 151.3)')  ->  false
 *
 * An unsupported value is dropped at computed-value time, so with the number
 * form every runtime brand token fell back to `rgba(0, 0, 0, 0)`: cards,
 * popovers and modal surfaces lost their fill and `--border` collapsed to
 * `currentColor`. The compiled default was never affected, because Tailwind
 * authors percentages and `index.css` passes through the build. Runtime brand
 * CSS is injected straight into <head> via /api/brand/theme.css and reaches no
 * build step, so it has to be legacy-safe at emit time.
 *
 * Percentage lightness is equally valid in the current spec (44.8% === 0.448),
 * so one form serves every engine and no `@supports` layer is needed. Do not
 * "simplify" this back to a bare number.
 */
export const oklchLiteral = ({ l, c, h }: { l: number; c: number; h: number }): string =>
  `oklch(${round(l * 100, 2)}% ${round(c, 4)} ${round(h, 1)})`;

type Formatter = (color: { l: number; c: number; h: number }) => string;

const declarationsFor = (
  tokens: Record<BrandToken, { l: number; c: number; h: number }>,
  format: Formatter,
  indent: string
): string =>
  BRAND_TOKENS.map((token) => {
    // Belt and braces: the vocabulary cannot name a protected token, but the
    // generator asserts it rather than trusting that it never will.
    if (isProtectedToken(token)) {
      throw new Error(`Refusing to emit protected token "${token}".`);
    }
    return `${indent}--${token}: ${format(tokens[token])};`;
  }).join('\n');


/**
 * Atmosphere, shadow and card-gradient tokens for a *configured* brand.
 *
 * `index.css` holds William Temple House's hand-tuned values for these — the
 * gold haze in the light backdrop, the navy lift and blue shadow glow in dark —
 * because they are as much a part of that identity as the semantic colours are,
 * and a derived approximation reads as a different app. They are literals there,
 * so they do not follow another agency's brand on their own.
 *
 * This block supplies the following versions, emitted only when an appearance
 * is active. Each is a fixed expression over the semantic tokens rather than
 * per-brand arithmetic, so it needs no input from the derivation: the runtime
 * stylesheet overrides `--primary` and friends above, and these compose off
 * whatever those became.
 */
const CONFIGURED_ATMOSPHERE = {
  light: `  --feed-shell-base-start: var(--background);
  --feed-shell-base-mid: color-mix(in oklab, var(--ambient) 22%, var(--background));
  --feed-shell-base-end: color-mix(in oklab, var(--ambient) 10%, var(--background));
  --feed-shell-glow-primary: color-mix(in oklab, var(--ambient) 9%, transparent);
  --feed-shell-glow-secondary: color-mix(in oklab, var(--ambient) 6%, transparent);
  --feed-shell-haze: color-mix(in oklab, var(--ambient) 4%, transparent);
  --feed-shell-veil: color-mix(in oklab, var(--background) 42%, transparent);
  --feed-shell-panel-end: color-mix(in oklab, var(--card) 76%, transparent);
  --feed-shell-card-end: color-mix(in oklab, var(--card) 84%, transparent);
  --feed-shell-surface-shadow: 0 24px 60px -44px color-mix(in oklab, var(--foreground) 34%, transparent);
  --shadow-color: hsl(0 0% 0%);
  --shadow-2xs: 1px 3.5px 7px 0.5px hsl(0 0% 0% / 0.10);
  --shadow-xs: 1px 3.5px 7px 0.5px hsl(0 0% 0% / 0.10);
  --shadow-sm: 1px 3.5px 7px 0.5px hsl(0 0% 0% / 0.20), 1px 1px 2px -0.5px hsl(0 0% 0% / 0.20);
  --shadow: 1px 3.5px 7px 0.5px hsl(0 0% 0% / 0.20), 1px 1px 2px -0.5px hsl(0 0% 0% / 0.20);
  --shadow-md: 1px 3.5px 7px 0.5px hsl(0 0% 0% / 0.20), 1px 2px 4px -0.5px hsl(0 0% 0% / 0.20);
  --shadow-lg: 1px 3.5px 7px 0.5px hsl(0 0% 0% / 0.20), 1px 4px 6px -0.5px hsl(0 0% 0% / 0.20);
  --shadow-xl: 1px 3.5px 7px 0.5px hsl(0 0% 0% / 0.20), 1px 8px 10px -0.5px hsl(0 0% 0% / 0.20);
  --shadow-2xl: 1px 3.5px 7px 0.5px hsl(0 0% 0% / 0.50);
  --feed-card-gradient: linear-gradient(180deg, var(--card) 0%, color-mix(in oklab, var(--card) 94%, transparent) 100%);
  --feed-card-gradient-primary: linear-gradient(180deg, color-mix(in oklab, var(--primary) 4%, transparent) 0%, var(--card) 100%);`,
  dark: `  --feed-shell-base-start: var(--background);
  /*
   * The dominant stop carries the brand, not a neutral.
   *
   * This mixed \`--secondary\` at 30%, and \`--secondary\` in dark is a stop off
   * the *neutral* ramp — chroma 0.013 to 0.034 whatever the brand. So the
   * dominant half of the wash was brand-independent grey and the faint 9% tail
   * was the only colour in it: the gradient read as one saturated hue meeting
   * one neutral, and changing the brand's colours did nothing to it.
   *
   * The wash is monochromatic on \`--ambient\` — the brand's third ranked
   * colour, which the wizard labels "background tints only" — and does not
   * blend in a second hue.
   *
   * Closing on \`--accent\` was tried and is wrong for two reasons. Two brand
   * hues blended across one gradient average toward grey wherever they are
   * near-complementary — a sky-and-amber brand produced a dark olive band
   * across the middle of the page, because that is what blue and gold do. And
   * it coupled the background to a token whose lightness is not fixed: an
   * inverted accent surface is a bright stop, so the "faint tint" became a
   * fifth of a vivid gold.
   *
   * A background wash wants one low-chroma hue with depth. The second colour
   * earns its place on top of that, as buttons and active states, where it is
   * adjacent to the first rather than mixed into it.
   *
   * Mixed in oklab rather than oklch on purpose: the far operand here is
   * \`--background\`, a near-neutral whose hue is essentially arbitrary, and
   * interpolating toward it in a polar space drags the brand hue toward that
   * arbitrary value.
   */
  --feed-shell-base-mid: color-mix(in oklab, var(--ambient) 12%, var(--background));
  --feed-shell-base-end: color-mix(in oklab, var(--ambient) 22%, var(--background));
  --feed-shell-glow-primary: color-mix(in oklab, var(--ambient) 12%, transparent);
  --feed-shell-glow-secondary: color-mix(in oklab, var(--ambient) 8%, transparent);
  --feed-shell-haze: color-mix(in oklab, var(--ambient) 5%, transparent);
  --feed-shell-veil: color-mix(in oklab, var(--background) 26%, transparent);
  --feed-shell-panel-end: color-mix(in oklab, var(--card) 70%, transparent);
  --feed-shell-card-end: color-mix(in oklab, var(--card) 78%, transparent);
  --feed-shell-surface-shadow: 0 28px 72px -52px color-mix(in oklab, var(--background) 86%, transparent);
  --shadow-color: var(--primary);
  --shadow-2xs: 1px 3.5px 10.5px 0.5px color-mix(in oklab, var(--primary) 20%, transparent);
  --shadow-xs: 1px 3.5px 10.5px 0.5px color-mix(in oklab, var(--primary) 22%, transparent);
  --shadow-sm: 1px 3.5px 10.5px 0.5px color-mix(in oklab, var(--primary) 35%, transparent), 1px 1px 2px -0.5px color-mix(in oklab, var(--primary) 40%, transparent);
  --shadow: 1px 3.5px 10.5px 0.5px color-mix(in oklab, var(--primary) 40%, transparent), 1px 1px 2px -0.5px color-mix(in oklab, var(--primary) 45%, transparent);
  --shadow-md: 1px 3.5px 14px   0.5px color-mix(in oklab, var(--primary) 45%, transparent), 1px 2px 4px -0.5px color-mix(in oklab, var(--primary) 50%, transparent);
  --shadow-lg: 1px 3.5px 20px   1px   color-mix(in oklab, var(--primary) 55%, transparent), 1px 4px 6px -0.5px color-mix(in oklab, var(--primary) 55%, transparent);
  --shadow-xl: 1px 3.5px 28px   2px   color-mix(in oklab, var(--primary) 60%, transparent), 1px 8px 10px -0.5px color-mix(in oklab, var(--primary) 55%, transparent);
  --shadow-2xl: 1px 3.5px 40px   3px   color-mix(in oklab, var(--primary) 75%, transparent);
  --feed-card-gradient: linear-gradient(135deg, var(--card) 0%, color-mix(in oklch, var(--secondary) 28%, var(--card)) 100%);
  --feed-card-gradient-primary: linear-gradient(135deg, var(--card) 0%, color-mix(in oklch, var(--primary) 14%, var(--card)) 100%);`,
};

const SCOPE_SELECTOR: Record<ThemeScope, string> = {
  // Mirrors the three-state model in docs/frontend-services/theme-control.md:
  // no stamp on the root element is the default, where only
  // `prefers-color-scheme` separates light from dark.
  light: ':root, .light',
  dark: '.dark',
};

const buildCss = (theme: TokenMap, format: Formatter): string => {
  const blocks = THEME_SCOPES.map(
    (scope) =>
      `${SCOPE_SELECTOR[scope]} {\n${declarationsFor(theme[scope], format, '  ')}\n` +
      `${CONFIGURED_ATMOSPHERE[scope]}\n}`
  );

  // The un-stamped dark case: `prefers-color-scheme: dark` with no `.light`
  // override present. Guarded so an explicit light choice still wins.
  blocks.push(
    `@media (prefers-color-scheme: dark) {\n  :root:not(.light) {\n${declarationsFor(
      theme.dark,
      format,
      '    '
    )}\n${CONFIGURED_ATMOSPHERE.dark.replace(/^  /gm, '    ')}\n  }\n}`
  );

  return `${blocks.join('\n\n')}\n`;
};

/** Legacy HSL stylesheet retained for compatibility and fidelity tests. */
export const serializeHslTriplets = (theme: TokenMap): string =>
  buildCss(theme, hslTriplet);

/** Active v1.7.5 app stylesheet. */
export const serializeOklch = (theme: TokenMap): string => buildCss(theme, oklchLiteral);

/**
 * Print and PDF. `analytics-print.ts` and `pdf.ts` build SVG and inline CSS with
 * hex literals, so they take a flat map rather than a stylesheet. Print always
 * renders the light scope — a report represents paper, and must not follow the
 * app theme (AGENTS.md, UI Standards).
 */
export const serializePrintHex = (theme: TokenMap): Record<BrandToken, string> =>
  Object.fromEntries(
    BRAND_TOKENS.map((token) => [token, oklchToHex(theme.light[token])])
  ) as Record<BrandToken, string>;
