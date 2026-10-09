// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, it } from 'vitest';
import { deriveTheme } from '../derive';
import { serializeOklch } from '../serialize';
import { paletteEntry } from '../snap';

/**
 * The background may only be made of background colours.
 *
 * This has now leaked twice. First the base gradient closed on `--accent`,
 * which put a dark olive band across the page for a sky-and-amber brand.
 * That was fixed, and the same brand's accent came straight back through the
 * radial layers — `--feed-shell-haze` was still mixing `--accent` and
 * `--feed-shell-glow-secondary` was mixing `--accent-foreground`.
 *
 * Fixing the instance twice did not stop the class, because "which tokens may
 * the shell reference" was never written down anywhere a test could read. It
 * is written down here: the shell composes from the ambient tint, the page
 * background, the card surface and the foreground. Anything carrying the
 * accent is a signalling colour and does not belong in a backdrop — an accent
 * surface is not even reliably dark, since a muddy family inverts it to a
 * bright stop.
 *
 * This asserts on the emitted stylesheet rather than on the source, so it
 * holds however the declarations are written.
 */
const SHELL_MAY_REFERENCE = new Set(['--ambient', '--background', '--card', '--foreground']);

const shellDeclarations = (css: string) =>
  css
    .split('\n')
    .map((line) => line.trim())
    // The page backdrop only. `--feed-card-gradient-primary` is a card sheen
    // that is named for the primary and tints toward it on purpose; it sits on
    // a card, not behind the whole interface, and is a different question.
    .filter((line) => line.startsWith('--feed-shell-'));

describe('the shell backdrop', () => {
  const at = (name: string) => {
    const [family, stop] = [name.replace(/-\d+$/, ''), Number(name.match(/\d+$/)![0])];
    const entry = paletteEntry(family, stop);
    return { l: entry.l, c: entry.c, h: entry.h };
  };

  // The reported case: a blue brand with a gold accent, where any accent leak
  // shows up immediately as olive.
  const css = serializeOklch(
    deriveTheme({
      accent: at('sky-700'),
      hierarchy: [at('sky-700'), at('amber-300'), at('sky-800'), at('sky-200')],
    }).tokens
  );

  it('emits shell declarations at all, so the check cannot pass vacuously', () => {
    expect(shellDeclarations(css).length).toBeGreaterThan(10);
  });

  it('never references an accent-derived token', () => {
    const offenders: string[] = [];
    for (const declaration of shellDeclarations(css)) {
      for (const [, token] of declaration.matchAll(/var\((--[a-z-]+)\)/g)) {
        if (!SHELL_MAY_REFERENCE.has(token)) offenders.push(`${declaration}  [${token}]`);
      }
    }
    expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([]);
  });
});
