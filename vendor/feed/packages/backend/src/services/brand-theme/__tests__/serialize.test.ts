// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import { hexToOklch, parseHslTriplet } from '../color';
import { deriveTheme } from '../derive';
import {
  serializeHslTriplets,
  serializeOklch,
  serializePrintHex,
} from '../serialize';
import { BRAND_TOKENS } from '../tokens';

const theme = deriveTheme({
  accent: hexToOklch('#186090'),
  accentDark: hexToOklch('#FFE066'),
}).tokens;

describe('the legacy HSL stylesheet serializer', () => {
  const css = serializeHslTriplets(theme);

  it('emits parseable bare triplets for backward compatibility', () => {
    const match = css.match(/--background:\s*([^;]+);/);
    expect(match).not.toBeNull();
    expect(parseHslTriplet(match![1])).not.toBeNull();
  });

  it('covers every token in both scopes', () => {
    for (const token of BRAND_TOKENS) {
      expect(css, `missing --${token}`).toContain(`--${token}:`);
    }
    expect(css).toContain(':root, .light');
    expect(css).toContain('.dark');
  });

  it('carries the un-stamped dark case, guarded against an explicit light choice', () => {
    // The three-state model: no stamp on the root element is the default, where
    // only prefers-color-scheme separates light from dark.
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root:not(.light)');
  });

  it('never emits a protected operational token', () => {
    for (const name of ['--color-inStock', '--destructive', '--chart-danger']) {
      expect(css).not.toContain(`${name}:`);
    }
  });
});

describe('the v1.7.5 serializer', () => {
  it('emits oklch() from the same token map, unchanged', () => {
    const css = serializeOklch(theme);
    expect(css).toMatch(/--background:\s*oklch\([\d.]+% [\d.]+ [\d.-]+\);/);
    // Same structure, same tokens — only the literal differs.
    for (const token of BRAND_TOKENS) {
      expect(css).toContain(`--${token}:`);
    }
  });

  // Safari 15.4 (iPad mini 4, iPadOS 15 branch) parses percentage lightness and
  // rejects the bare-number form, dropping every token to rgba(0, 0, 0, 0).
  // Runtime brand CSS is injected straight into <head> and reaches no build
  // step, so the emitted literal is the only place this can be got right.
  it('never emits a bare-number lightness, which Safari 15.4 discards', () => {
    const css = serializeOklch(theme);
    const bareNumberLightness = /oklch\(\s*[\d.]+\s+/g;
    expect(css.match(bareNumberLightness)).toBeNull();
    expect(css).toContain('oklch(');
  });

  it('keeps percentage lightness numerically equal to the token map', () => {
    const css = serializeOklch(theme);
    // This loop asserted nothing until now. `TokenMap` is
    // `Record<ThemeScope, Record<BrandToken, Oklch>>` -- two levels -- so
    // `Object.entries(theme)` yielded ['light', {...}] and ['dark', {...}],
    // binding `token` to the *scope* names. The regex then looked for
    // `--light:` and `--dark:`, which the serializer never emits, so the
    // `continue` below fired on both iterations and the expect never ran. The
    // stale `value as { l: number }` cast was what hid it: the entry value was
    // a whole token map, not an Oklch.
    //
    // `exec` finds the first match, which is the `:root, .light` block, so the
    // light scope is the one being checked.
    for (const token of BRAND_TOKENS) {
      const value = theme.light[token];
      const hit = new RegExp(`--${token}:\\s*oklch\\(([\\d.]+)%`).exec(css);
      if (!hit) continue;
      // 44.8% is the same colour as 0.448 — the conversion must be exact to
      // the emitted precision, not merely close.
      expect(Number(hit[1]) / 100).toBeCloseTo(
        Number(value.l.toFixed(4)),
        3
      );
    }
  });
});

describe('the print serializer', () => {
  const print = serializePrintHex(theme);

  it('emits six-digit hex for every token', () => {
    for (const token of BRAND_TOKENS) {
      expect(print[token], `--${token}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('always renders the light scope, because a report represents paper', () => {
    // AGENTS.md: anything representing printed output must render independently
    // of the app theme, so a dark-mode session cannot darken a funder PDF.
    const darkAccent = deriveTheme({
      accent: hexToOklch('#186090'),
      accentDark: hexToOklch('#FFE066'),
    });
    expect(serializePrintHex(darkAccent.tokens).background).toBe('#ffffff');
  });
});
