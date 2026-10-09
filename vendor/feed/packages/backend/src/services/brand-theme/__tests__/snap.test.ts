// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import { hexToOklch, hslToOklch, hueDifference } from '../color';
import { chooseFamily, snap, snapCandidates } from '../snap';

/** The two identities this work is measured against. */
const WTH_BLUE = '#186090';
const WTH_GOLD = '#FFE066';
const ST_JOHNS_TEAL = '#33A478';
const ST_JOHNS_CHARCOAL = '#2D2D2D';

describe('snapping brand colours to Tailwind', () => {
  it('lands within three degrees of hue on real brand colours', () => {
    for (const hex of [WTH_BLUE, WTH_GOLD, ST_JOHNS_TEAL]) {
      const target = hexToOklch(hex);
      const { entry } = snap(target, 'chromatic');
      expect(
        Math.abs(hueDifference(target.h, entry.h)),
        `${hex} snapped to ${entry.family}-${entry.stop}`
      ).toBeLessThan(3);
    }
  });

  it('places the two known identities on their expected families', () => {
    expect(snap(hexToOklch(WTH_BLUE), 'chromatic').entry).toMatchObject({
      family: 'sky',
      stop: 800,
    });
    expect(snap(hexToOklch(WTH_GOLD), 'chromatic').entry).toMatchObject({
      family: 'amber',
      stop: 200,
    });
    expect(snap(hexToOklch(ST_JOHNS_TEAL), 'chromatic').entry).toMatchObject({
      family: 'emerald',
      stop: 600,
    });
  });

  it('offers the runner-up, because the maths ignores a colour\'s name', () => {
    // St. Johns Food Share call their colour teal; it snaps to emerald. The
    // wizard shows alternates so an operator can say which one is their brand.
    const candidates = snapCandidates(hexToOklch(ST_JOHNS_TEAL), 'chromatic', 3);
    expect(candidates[0].entry.family).toBe('emerald');
    expect(candidates.map((candidate) => candidate.entry.family)).toContain('teal');
  });

  it('gives a dead-neutral charcoal a family with no tint of its own', () => {
    // This charcoal has chroma 0.000. By unweighted distance the nearest neutral
    // is olive-800 (chroma 0.016) — a warm green cast across every surface in
    // the app. Splitting the pools does not prevent that on its own; weighting
    // the chromatic axes does.
    const { entry } = snap(hexToOklch(ST_JOHNS_CHARCOAL), 'neutral');
    expect(entry.c).toBe(0);
    expect(entry.family).toBe('neutral');
  });

  it('still keeps a genuine tint when the source has one', () => {
    // The guard above must not flatten every neutral to grey: FEED's own
    // surfaces are deliberately blue-leaning and have to stay that way.
    const { entry } = snap(hslToOklch({ h: 222, s: 50, l: 10 }), 'neutral');
    expect(entry.c).toBeGreaterThan(0);
  });

  it('never returns a neutral family for an accent, or the reverse', () => {
    expect(snap(hexToOklch(ST_JOHNS_TEAL), 'chromatic').entry.family).not.toBe('olive');
    const neutral = snap(hexToOklch('#808080'), 'neutral').entry;
    expect(['slate', 'gray', 'zinc', 'neutral', 'stone', 'mauve', 'olive', 'mist', 'taupe'])
      .toContain(neutral.family);
  });
});

describe('the palette extremes', () => {
  it('snaps a pure black or white surface exactly, not to a 950 or 50 neutral', () => {
    // Tailwind names these without a numeric stop, so the generator's
    // family/stop pattern could not see them. While they were missing, William
    // Temple House's true-black dark background resolved to slate-950.
    expect(snap({ l: 0, c: 0, h: 0 }, 'neutral')).toMatchObject({
      entry: { family: 'black' },
      distance: 0,
    });
    expect(snap({ l: 1, c: 0, h: 0 }, 'neutral')).toMatchObject({
      entry: { family: 'white' },
      distance: 0,
    });
  });

  it('never offers an extreme as a family, because it has no ramp', () => {
    // `chooseFamily` picks a family and the stop map then indexes stops out of
    // it. A single-value family would have no stop to resolve.
    for (const role of ['neutral', 'chromatic'] as const) {
      const chosen = chooseFamily([{ l: 0.02, c: 0, h: 0 }], role).family;
      expect(['black', 'white']).not.toContain(chosen);
    }
  });
});

describe('choosing one family for a whole role', () => {
  it('picks slate for FEED\'s blue-leaning surfaces', () => {
    // The surface tokens index.css ships today, converted rather than
    // transcribed — a hand-typed OKLCH approximation is close enough to look
    // right and wrong enough to pick a different family.
    const surfaces = (
      [
        [222, 50, 10], // dark card
        [222, 50, 5],  // dark popover
        [222, 25, 15], // dark muted
        [222, 30, 50], // dark border
        [211, 50, 99], // light card
        [173, 30, 95], // light muted
        [211, 30, 82], // light border
      ] as const
    ).map(([h, s, l]) => hslToOklch({ h, s, l }));
    expect(chooseFamily(surfaces, 'neutral').family).toBe('slate');
  });

  it('scores by mean distance, so one close member cannot carry a bad family', () => {
    const choice = chooseFamily([{ l: 0.5, c: 0.02, h: 240 }], 'neutral');
    expect(choice.averageDistance).toBeGreaterThanOrEqual(0);
    expect(choice.averageDistance).toBeLessThan(0.1);
  });
});
