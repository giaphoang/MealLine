// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * The Phase 0 gate: can the pipeline reproduce the theme FEED already ships?
 *
 * If it cannot recreate William Temple House from brand inputs, it is not ready
 * for anyone else's identity. This is deliberately a *perceptual* comparison
 * rather than an exact one — snapping trades precision for a provable space, so
 * demanding equality would assert the opposite of the design. What it holds is
 * that every token stays perceptually close and, more importantly, that nothing
 * crosses a contrast floor the current theme clears.
 *
 * This same comparison is re-run across the v1.7.5 OKLCH boundary; identical
 * brand inputs must produce identical output before and after (plan, Phase 5).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { hexToOklch, hslToOklch, parseHslTriplet, perceptualDistance, type Oklch } from '../color';
import { TAILWIND_EXTREMES, TAILWIND_PALETTE } from '../palettes';
import { deriveTheme } from '../derive';
import { BRAND_TOKENS, type BrandToken, type ThemeScope } from '../tokens';

const INDEX_CSS = resolve(__dirname, '../../../../../frontend/src/index.css');

/** William Temple House's two identity colours, from the logo and email brand. */
const WTH_BLUE = '#186090';
const WTH_TEAL = '#2AA198';
const WTH_GOLD = '#FFE066';
const WTH_SURFACE = { h: 222, s: 50, l: 10 };

/**
 * Read the shipped light and dark values for a token. `index.css` declares the
 * light block first and the dark block second, and some tokens alias others via
 * `var(--...)`, which this deliberately skips.
 */
const shippedTokens = (): Record<ThemeScope, Partial<Record<BrandToken, string>>> => {
  const css = readFileSync(INDEX_CSS, 'utf8');
  const result: Record<ThemeScope, Partial<Record<BrandToken, string>>> = {
    light: {},
    dark: {},
  };

  // Parsed line by line rather than by one regex per token: the declarations are
  // one per line, and a hand-escaped pattern built inside a template string is
  // exactly the sort of thing that silently matches nothing and leaves the
  // comparison below asserting over an empty set.
  const seen = new Map<string, string[]>();
  for (const line of css.split('\n')) {
    const match = line.match(/^\s*--([a-z-]+):\s*([^;]+);/);
    if (!match) continue;
    const [, name, value] = match;
    const values = seen.get(name) ?? [];
    values.push(value.trim());
    seen.set(name, values);
  }

  for (const token of BRAND_TOKENS) {
    const values = seen.get(token);
    if (!values) continue;
    // index.css declares the light block before the dark one.
    if (values[0]) result.light[token] = values[0];
    if (values[1]) result.dark[token] = values[1];
  }

  return result;
};

/**
 * Resolve a `var(--color-family-stop)` reference to the colour it names.
 *
 * `index.css` now expresses the built-in appearance as palette references
 * rather than literals. Without this the gate parsed nothing, compared nothing,
 * and passed — the same tautology it fell into once before, when the threshold
 * was tightened while the file held the derivation's own output. The staleness
 * check is what caught it both times.
 */
const PALETTE_BY_NAME = new Map(
  [...TAILWIND_PALETTE, ...TAILWIND_EXTREMES].map((entry) => [
    entry.stop === 0 ? entry.family : `${entry.family}-${entry.stop}`,
    { l: entry.l, c: entry.c, h: entry.h } as Oklch,
  ]),
);

const parsePaletteReference = (value: string): Oklch | null => {
  const match = value.trim().match(/^var\(--color-([A-Za-z0-9-]+)\)$/);
  return match ? PALETTE_BY_NAME.get(match[1]) ?? null : null;
};

const parseOklchLiteral = (value: string): Oklch | null => {
  const match = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.-]+)\s*\)$/);
  return match ? { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) } : null;
};

/**
 * Tokens where the derived approximation deliberately differs from the
 * hand-tuned identity FEED ships.
 *
 * Kept as an explicit list with reasons rather than by widening the threshold:
 * a looser bound would hide real drift everywhere to excuse a handful of known
 * cases. The test also asserts each of these *still* diverges, so an entry
 * cannot quietly outlive the difference it describes.
 *
 * Since the compiled default now ships the hand-tuned values verbatim, these
 * are the gaps a *configured* agency would see rather than defects in what
 * William Temple House runs — this gate measures how well derivation
 * approximates a hand-tuned identity, which is what a new agency gets.
 */
const ACCEPTED_DIVERGENCES: Record<string, string> = {
  'light --input':
    'FEED authors --input at mid lightness in both themes and the Input ' +
    'primitive does not consume it (it hardcodes border-slate-200). The derived ' +
    'value is what the token is supposed to carry.',
  // The next four are FEED's untuned placeholders. All carry the identical
  // value `222 10.9% 18%`, which measures 1.50:1 against the dark page — below
  // the WCAG 1.4.11 floor for a focus indicator. Sharing one value across four
  // unrelated roles is the signature of copied defaults rather than chosen
  // colours. The derived values clear their floors, so these divergences are
  // corrections rather than drift.
  'dark --ring':
    'FEED ships a dark focus ring at 1.50:1 against the page. The derived ring ' +
    'clears the 3:1 WCAG 1.4.11 floor.',
  'dark --sidebar-primary':
    'Same untuned placeholder as --ring.',
  'dark --sidebar-primary-foreground':
    'Follows --sidebar-primary: white on FEED\'s dark placeholder, near-black on ' +
    'the derived light accent. Each is correct for its own fill.',
  'dark --sidebar-ring':
    'Same untuned placeholder as --ring.',
  'dark --primary-foreground':
    'FEED hand-picks WTH blue as the text on the gold primary. The derived value ' +
    'is near-black: higher contrast, less characterful. Restoring the exact ' +
    'pairing is an Advanced-tier override.',
};

describe('Phase 0 fidelity gate — reproducing William Temple House', () => {
  const derived = deriveTheme({
    accent: hexToOklch(WTH_BLUE),
    accentDark: hexToOklch(WTH_GOLD),
    neutral: hslToOklch(WTH_SURFACE),
    hierarchy: [WTH_BLUE, WTH_TEAL, WTH_GOLD].map(hexToOklch),
  });

  it('reads the shipped theme out of index.css', () => {
    const shipped = shippedTokens();
    expect(Object.keys(shipped.light).length).toBeGreaterThan(10);
    expect(Object.keys(shipped.dark).length).toBeGreaterThan(10);
  });

  it('resolves William Temple House onto sky and a blue-leaning neutral', () => {
    expect(derived.accentFamily).toBe('sky');
    // Dark mode carries the gold half of the identity, not a lighter blue.
    expect(derived.accentDarkFamily).toBe('amber');
    expect(derived.neutralFamily).toBe('slate');
  });

  it('lands close to the hand-tuned identity on every comparable token', () => {
    const shipped = shippedTokens();
    const drifted: string[] = [];
    let compared = 0;
    const stillDiverging = new Set<string>();

    for (const scope of ['light', 'dark'] as const) {
      for (const token of BRAND_TOKENS) {
        const raw = shipped[scope][token];
        if (!raw) continue;
        const triplet = parseHslTriplet(raw);
        const authored = parsePaletteReference(raw)
          ?? parseOklchLiteral(raw)
          ?? (triplet ? hslToOklch(triplet) : null);
        // `var(--primary)` style aliases are not comparable values.
        if (!authored) continue;

        compared += 1;
        const distance = perceptualDistance(
          authored,
          derived.tokens[scope][token]
        );
        // 0.20 in OKLab is a generous but meaningful bound: same colour family
        // and broadly the same lightness, which is what "still reads as FEED"
        // requires. Anything larger is a different colour, not a snap.
        //
        // This threshold was briefly 0.002 while `index.css` itself held the
        // derived output, which made the comparison a tautology — derivation
        // measured against derivation, unable to fail by construction. It only
        // means something while the file holds the hand-tuned values.
        const key = `${scope} --${token}`;
        const diverges = distance > 0.2;
        if (diverges && !(key in ACCEPTED_DIVERGENCES)) {
          drifted.push(`${key}: ${raw} drifted ${distance.toFixed(4)}`);
        }
        if (diverges) stillDiverging.add(key);
      }
    }

    expect(drifted, `\n${drifted.join('\n')}`).toEqual([]);

    // Every accepted divergence must still be one, so the list cannot rot into
    // excuses for differences that no longer exist.
    const stale = Object.keys(ACCEPTED_DIVERGENCES).filter((key) => !stillDiverging.has(key));
    expect(stale, `no longer diverging: ${stale.join(', ')}`).toEqual([]);

    // A green run here means nothing unless tokens were actually compared.
    expect(compared).toBeGreaterThanOrEqual(20);

  });
});
