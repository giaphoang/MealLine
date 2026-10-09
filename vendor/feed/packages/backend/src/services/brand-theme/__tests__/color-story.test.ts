// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import { contrastRatio, oklchToRgb } from '../color';
import { hexToOklch, oklchToHex } from '../color';
import { classifyColor, proposeColorStory } from '../color-story';
import { deriveTheme } from '../derive';
import { isMuddy, mudEscapeFamily, paletteEntry } from '../snap';

/** William Temple House's logo reads blue → teal → gold, left to right. */
const WTH_HIERARCHY = ['#186090', '#2AA198', '#FFE066'].map(hexToOklch);
/** IBM-style: one chromatic and nothing else. */
// One colour and nothing else. Under fixed slots a brand says "I have only a
// main colour" by filling only the main slot — putting a charcoal in slot 2
// means it *is* the accent, because slot 2 is the accent.
const MONOCHROME = ['#186090'].map(hexToOklch);

describe('ranking a brand into roles', () => {
  it('separates chromatics from light and dark neutrals', () => {
    expect(classifyColor(hexToOklch('#186090'))).toBe('chromatic');
    expect(classifyColor(hexToOklch('#2D2D2D'))).toBe('dark-neutral');
    expect(classifyColor(hexToOklch('#F7F7F7'))).toBe('light-neutral');
  });

  it('assigns primary and accent by rank, the rest as ambience', () => {
    const story = proposeColorStory(WTH_HIERARCHY);
    expect(oklchToHex(story.primary!)).toBe('#186090');
    expect(story.accent).not.toBeNull();
    expect(story.ambient.length).toBe(1);
    expect(story.isMonochrome).toBe(false);
  });

  it('recognises a single-colour brand', () => {
    const story = proposeColorStory(MONOCHROME);
    expect(story.isMonochrome).toBe(true);
    expect(story.accent).toBeNull();
  });

  it('gives a colour the job of the slot it is in, not of what it looks like', () => {
    // The whole point of fixed slots. A charcoal in the accent slot is the
    // accent; it does not get promoted to a surface anchor for being dark.
    // Reordering the same two colours swaps their jobs, which the Up/Down
    // arrows only appeared to do.
    const [blue, charcoal] = ['#186090', '#2D2D2D'].map(hexToOklch);
    const story = proposeColorStory([blue, charcoal]);
    expect(story.assignments.map((entry) => entry.role)).toEqual(['primary', 'accent']);
    expect(story.accent).toEqual(charcoal);
    expect(story.surfaceDark).toBeNull();

    const swapped = proposeColorStory([charcoal, blue]);
    expect(swapped.primary).toEqual(charcoal);
    expect(swapped.accent).toEqual(blue);
  });

  it('warns when a signalling colour lands in a stock-status hue band', () => {
    // A pantry branded in in-stock green: allowed, but staff read that hue as
    // a stock status, so a signalling role earns a note.
    const story = proposeColorStory([hexToOklch('#1A9E4B')]);
    expect(story.warnings.length).toBeGreaterThan(0);
    expect(story.warnings[0]).toContain('In-stock green');
  });

  it('does not warn for the same hue used only as ambience', () => {
    const story = proposeColorStory(
      ['#186090', '#2AA198', '#1A9E4B'].map(hexToOklch)
    );
    const ambient = story.assignments.find((a) => a.role === 'ambient');
    expect(ambient?.warning).toBeNull();
  });
});

describe('the mud guard', () => {
  it('recognises the brown zone', () => {
    // amber-800 keeps 73% of its chroma, so this is not a saturation test —
    // it sits at hue 46 and lightness 47%, and dark orange is brown.
    expect(isMuddy(paletteEntry('amber', 800))).toBe(true);
    expect(isMuddy(paletteEntry('orange', 800))).toBe(true);
    expect(isMuddy(paletteEntry('sky', 800))).toBe(false);
    expect(isMuddy(paletteEntry('emerald', 800))).toBe(false);
  });

  it('escapes toward green rather than toward the clearance band', () => {
    const escaped = mudEscapeFamily('amber');
    expect(escaped).not.toBe('amber');
    expect(isMuddy(paletteEntry(escaped, 800))).toBe(false);
    // Rotating the other way lands on clearance red; a hover surface reading as
    // a danger tint is worse than one reading as deep olive.
    expect(['red', 'rose', 'orange']).not.toContain(escaped);
  });
});

describe('the accent surface', () => {
  it('takes the brand\'s second colour when there is one', () => {
    const derived = deriveTheme({ accent: WTH_HIERARCHY[0], hierarchy: WTH_HIERARCHY });
    expect(derived.accentSecondaryIsNeutral).toBe(false);
    expect(derived.accentSecondaryFamily).not.toBe(derived.neutralFamily);
  });

  it('falls back to the neutral ramp for a single-colour brand', () => {
    // Rather than darkening the primary, which is what produced amber-800 —
    // a brown — across every dark-mode hover state.
    const derived = deriveTheme({ accent: MONOCHROME[0], hierarchy: MONOCHROME });
    expect(derived.accentSecondaryIsNeutral).toBe(true);
    expect(derived.accentSecondaryFamily).toBe(derived.neutralFamily);
  });

  it('never leaves a muddy dark accent surface, and keeps the brand its colour', () => {
    // A warm-branded agency with two warm colours is the case that produced the
    // original defect. The invariant is about the surface that ships, not the
    // family: a muddy family is no longer swapped out, its dark surface is
    // inverted to a light stop instead, so the agency keeps the colour it chose.
    const derived = deriveTheme({
      accent: hexToOklch('#FFE066'),
      hierarchy: ['#FFE066', '#E8A33D'].map(hexToOklch),
    });
    const surface = derived.tokens.dark.accent;
    expect(isMuddy({ family: derived.accentSecondaryFamily, stop: 0, ...surface })).toBe(false);
    // And the pair remains readable, measured rather than assumed.
    expect(
      contrastRatio(
        oklchToRgb(derived.tokens.dark['accent-foreground']),
        oklchToRgb(surface)
      )
    ).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * The ranked colours past the accent are labelled in the wizard as background
 * tints and surface anchors. They were computed, displayed, and then read by
 * nothing — the wash tinted from `--primary`/`--accent` and the neutral family
 * came from a synthetic grey at the accent's hue, so ranking a third colour or
 * a pair of anchors changed no output at all.
 */
describe('the ranks past the accent', () => {
  const at = (name: string) => {
    const [family, stop] = [name.replace(/-\d+$/, ''), Number(name.match(/\d+$/)![0])];
    const entry = paletteEntry(family, stop);
    return { l: entry.l, c: entry.c, h: entry.h };
  };
  const derive = (names: string[]) =>
    deriveTheme({ accent: at(names[0]), hierarchy: names.map(at) });

  it('lets rank 3 drive the background tint', () => {
    const withoutAmbient = derive(['sky-700', 'amber-300']);
    const withBlue = derive(['sky-700', 'amber-300', 'blue-700']);
    const withRose = derive(['sky-700', 'amber-300', 'rose-500']);

    expect(withBlue.ambientFamily).toBe('blue');
    expect(withRose.ambientFamily).toBe('rose');
    // Naming a third colour has to change the tint, not just be recorded.
    expect(withBlue.tokens.dark.ambient).not.toEqual(withoutAmbient.tokens.dark.ambient);
    expect(withRose.tokens.dark.ambient).not.toEqual(withBlue.tokens.dark.ambient);
  });

  it('falls back to the accent when no third colour is given', () => {
    const two = derive(['sky-700', 'amber-300']);
    expect(two.ambientFamily).toBe(two.accentFamily);
  });

  it('lets the surface anchors choose the neutral ramp', () => {
    const cool = derive(['sky-700', 'amber-300', 'rose-500']);
    const warm = derive(['sky-700', 'amber-300', 'rose-500', 'stone-900', 'stone-100']);
    expect(warm.neutralFamily).not.toBe(cool.neutralFamily);
    // And the surfaces that ramp produces actually move with it.
    expect(warm.tokens.dark.background).not.toEqual(cool.tokens.dark.background);
  });
});

describe('regressions found in wizard testing', () => {
  const at = (name: string) => {
    const [family, stop] = [name.replace(/-\d+$/, ''), Number(name.match(/\d+$/)![0])];
    const entry = paletteEntry(family, stop);
    return { l: entry.l, c: entry.c, h: entry.h };
  };

  it('keeps a neutral accent on its own ramp', () => {
    // slate-700 carries chroma 0.044, above the old 0.03 threshold, so it was
    // treated as chromatic and snapped through a pool with no neutrals in it —
    // choosing slate produced cyan.
    for (const name of ['slate-700', 'zinc-600', 'stone-500'] as const) {
      const derived = deriveTheme({
        accent: at('lime-600'),
        hierarchy: [at('lime-600'), at(name)],
      });
      expect(derived.accentSecondaryFamily).toBe(name.replace(/-\d+$/, ''));
    }
  });

  it('survives a pure black or white in the hierarchy', () => {
    // Extremes are single values with no ramp. Ranking one made `--ambient`
    // resolve to `black-200`, which threw and blanked the whole colour story.
    for (const extreme of [{ l: 0, c: 0, h: 0 }, { l: 1, c: 0, h: 0 }]) {
      expect(() =>
        deriveTheme({
          accent: at('lime-600'),
          hierarchy: [at('lime-600'), at('neutral-700'), extreme],
        })
      ).not.toThrow();
    }
  });

  it('lets background-labelled ranks outrank the main colour for the wash', () => {
    const primaryOnly = deriveTheme({ accent: at('lime-600'), hierarchy: [at('lime-600')] });
    const withAnchor = deriveTheme({
      accent: at('lime-600'),
      hierarchy: [at('lime-600'), at('amber-300'), at('slate-900')],
    });
    // With nothing named for the background, the main colour tints it.
    expect(primaryOnly.ambientFamily).toBe(primaryOnly.accentFamily);
    // Name one, and it takes over rather than being recorded and ignored.
    expect(withAnchor.ambientFamily).toBe('slate');
  });
});
