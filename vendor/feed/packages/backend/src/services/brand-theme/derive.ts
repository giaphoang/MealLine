// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Brand inputs → `TokenMap`.
 *
 * The output is structured palette data, never CSS text, because three colour
 * systems consume it: the app's CSS tokens, the PDF/print palette (hardcoded
 * hex today), and the Carbon chart ranking. Serializers live in `serialize.ts`
 * and `charts.ts`; swapping the app serializer from HSL to OKLCH is the whole of
 * the v1.7.5 migration.
 */

import { contrastRatio, oklchToRgb, type Oklch } from './color';
import { proposeColorStory, type ColorStory } from './color-story';
import type { TailwindEntry } from './palettes';
import {
  entryToOklch,
  isMuddy,
  mudEscapeFamily,
  paletteEntry,
  rampFamily,
  snap, harmonisedNeutralFamily, roleFor,
  type SnapCandidate,
} from './snap';
import {
  BRAND_TOKENS,
  STOP_MAP,
  THEME_SCOPES,
  type BrandToken,
  type ThemeScope,
} from './tokens';

/**
 * What an operator supplies. `accentFamily` and `neutralFamily` are normally
 * the snap results, but are accepted directly so the wizard can honour an
 * operator who picks a runner-up.
 */
export type BrandInput = {
  /** The agency's own accent colour, before snapping. */
  accent: Oklch;
  /**
   * A separate accent for dark mode, before snapping.
   *
   * Not a nicety — William Temple House is the proof case. FEED's light primary
   * is WTH blue and its dark primary is WTH gold, because a mid-blue that reads
   * as confident on white goes muddy on near-black. An agency with two identity
   * colours normally wants exactly this. Omitted, dark reuses the light accent's
   * family, which is the right default for a single-colour brand.
   */
  accentDark?: Oklch;
  /** The agency's surface or text colour, before snapping. Optional. */
  neutral?: Oklch;
  /** Overrides the snapped accent family. */
  accentFamily?: string;
  /** Overrides the snapped dark accent family. */
  accentDarkFamily?: string;
  /** Overrides the snapped neutral family. */
  neutralFamily?: string;
  /**
   * The brand's colours in rank order, most important first — normally the
   * output of logo extraction. When present it supersedes `accent`/`neutral`:
   * rank 1 becomes the primary, rank 2 the accent surface, the rest ambience.
   */
  hierarchy?: readonly Oklch[];
};

export type ResolvedFamilies = {
  accentFamily: string;
  /**
   * Family for the hover/selected surface. The brand's second colour where it
   * has one; otherwise the neutral ramp, so a single-colour brand does not get
   * a muddy darkened primary smeared across every hover state.
   */
  accentSecondaryFamily: string;
  /** True when `accentSecondaryFamily` names a neutral ramp. */
  accentSecondaryIsNeutral: boolean;
  /** Set when the secondary family was moved off a muddy warm hue. */
  mudEscapedFrom: string | null;
  /** Family behind `--ambient`; the brand's third colour when it has one. */
  ambientFamily: string;
  /** Dark scope inverts the accent surface: light fill, dark text. */
  accentSecondaryIsMuddyInDark: boolean;
  story: ColorStory | null;
  /** Equals `accentFamily` unless the brand supplies a separate dark accent. */
  accentDarkFamily: string;
  neutralFamily: string;
  accentSnap: SnapCandidate;
  accentDarkSnap: SnapCandidate | null;
  neutralSnap: SnapCandidate | null;
};

/** A complete theme: every token resolved to a concrete colour, per scope. */
export type TokenMap = Record<ThemeScope, Record<BrandToken, Oklch>>;

export type DerivedTheme = ResolvedFamilies & { tokens: TokenMap };

/** Palette-adjacent extremes the stop map may name. */
const EXTREMES: Record<'white' | 'black', Oklch> = {
  white: { l: 1, c: 0, h: 0 },
  black: { l: 0, c: 0, h: 0 },
};

/**
 * A neutral is not always supplied — many agencies have one brand colour and no
 * stated surface. Falling back to the accent's own hue at very low chroma picks
 * the neutral family that leans toward the brand, which is what a designer would
 * do by hand (FEED's blue surfaces sit on `slate`, not `zinc`).
 */
const neutralTargetFor = (input: BrandInput, story: ColorStory | null): Oklch => {
  if (input.neutral) return input.neutral;

  /*
   * The ranked surface anchors, which is what the wizard promises they are.
   *
   * `proposeColorStory` assigns the first dark neutral in the hierarchy to
   * `surfaceDark` and the first light one to `surfaceLight`, labelled in the
   * wizard as the dark- and light-mode surfaces. Nothing read them: the neutral
   * family came from an explicit `neutral` colour or a synthetic grey at the
   * accent's hue, so ranking a charcoal and an off-white changed nothing at
   * all.
   *
   * Both anchors sit on one ramp at different depths, so it is their hue that
   * selects the family. Whichever carries more chroma is the better evidence of
   * that hue — a near-black at chroma 0.002 says almost nothing, an off-white
   * at 0.03 says a good deal — so the stronger one leads and lightness is
   * normalised out, since the ramp supplies its own.
   */
  const anchors = [story?.surfaceDark, story?.surfaceLight].filter(
    (color): color is Oklch => Boolean(color)
  );
  const strongest = anchors.reduce<Oklch | null>(
    (best, color) => (best === null || color.c > best.c ? color : best),
    null
  );
  if (strongest && strongest.c > 0) return { l: 0.5, c: strongest.c, h: strongest.h };

  return { l: 0.5, c: 0.02, h: input.accent.h };
};

export const resolveFamilies = (input: BrandInput): ResolvedFamilies => {
  const story = input.hierarchy ? proposeColorStory(input.hierarchy) : null;
  const accentSource = story?.primary ?? input.accent;
  // Pool chosen by the colour, not the slot: a grayscale brand keeps its grey.
  const accentSnap = snap(accentSource, roleFor(accentSource, 'chromatic'));
  const accentDarkSnap = input.accentDark
    ? snap(input.accentDark, roleFor(input.accentDark, 'chromatic'))
    : null;
  const neutralTarget = neutralTargetFor(input, story);
  const neutralSnap = snap(neutralTarget, 'neutral');

  const accentFamily = input.accentFamily ?? accentSnap.entry.family;
  /*
   * Every rank the wizard labels as background, in order of how directly it
   * says "background tint": the ambient ranks first, then the surface anchors.
   *
   * The primary is the last resort, not the default. If an operator has named
   * colours for the background, the background should be made of those — the
   * main colour driving the wash is what happens when they have named none.
   */
  const ambientSource =
    story?.ambient?.[0] ?? story?.surfaceDark ?? story?.surfaceLight ?? null;
  const ambientFamily = ambientSource
    ? rampFamily(snap(ambientSource, roleFor(ambientSource, 'chromatic')).entry.family)
    : accentFamily;
  // A brand that supplied plain greys gets a grey that agrees with its own
  // hue, rather than the one ramp at chroma zero. An explicit choice, and a
  // brand with no hue at all, are both left alone.
  const neutralFamily =
    input.neutralFamily ??
    harmonisedNeutralFamily(rampFamily(neutralSnap.entry.family), accentSource);

  // The accent surface prefers the brand's second colour. Without one it falls
  // back to the neutral ramp rather than to a darkened primary — which is what
  // produced `amber-800`, a brown, across every dark-mode hover state.
  const secondary = story?.accent
    ? snap(story.accent, roleFor(story.accent, 'chromatic'))
    : null;
  let accentSecondaryFamily = secondary ? rampFamily(secondary.entry.family) : neutralFamily;
  let accentSecondaryIsNeutral = secondary === null;
  let mudEscapedFrom: string | null = null;
  let accentSecondaryIsMuddyInDark = false;

  if (secondary && isMuddy(paletteEntry(accentSecondaryFamily, 800))) {
    /*
     * A muddy family keeps its colour; the surface inverts instead.
     *
     * The dark accent surface was pinned to stop 800, and amber-800 is brown.
     * Two earlier attempts both accepted that pin and looked for another
     * family to satisfy it: rotate 60 degrees off the hue (which handed a
     * sky-and-amber brand a lime interface) or borrow the primary's family.
     * Both discard the colour the brand actually chose.
     *
     * The pin is the wrong part. Only amber's *dark* stops are muddy —
     * amber-300 is a clean gold, which is what the brand picked. So in dark
     * mode the surface takes a light stop and the foreground flips to dark,
     * exactly as light mode already does in reverse. Contrast improves rather
     * than degrades: sky-950 on amber-300 measures 9.60:1 against the 6.36:1
     * that amber-100 on amber-800 was managing.
     *
     * `mudEscapeFamily` is left in place for nothing to call yet — the
     * inversion covers every muddy family in the palette — but the muddiness
     * test it depends on is still the thing that triggers this.
     */
    accentSecondaryIsMuddyInDark = true;
    accentSecondaryIsNeutral = false;
  }

  return {
    accentFamily,
    accentDarkFamily:
      input.accentDarkFamily ?? accentDarkSnap?.entry.family ?? accentFamily,
    accentSecondaryFamily,
    accentSecondaryIsNeutral,
    mudEscapedFrom,
    ambientFamily,
    accentSecondaryIsMuddyInDark,
    story,
    neutralFamily,
    accentSnap,
    accentDarkSnap,
    neutralSnap: input.neutral ? neutralSnap : null,
  };
};

/** The light stop an inverted dark accent surface uses. */
const INVERTED_ACCENT_SURFACE_STOP = 300;

/**
 * The darkest brand stop that stays readable on `surface`.
 *
 * Walks the candidate families deepest-first and takes the first that clears
 * the WCAG 4.5:1 text floor, so the pair is chosen by measurement rather than
 * asserted by a stop map. Families are tried in preference order — the brand's
 * main colour before the accent's own — which is what produces chroma contrast
 * rather than one hue at two depths. Pure black is the backstop; on a stop-300
 * surface it always clears, so this cannot fail to return something readable.
 */
const readableOn = (surface: TailwindEntry, families: readonly string[]): TailwindEntry => {
  const background = oklchToRgb(entryToOklch(surface));
  for (const family of families) {
    for (const stop of [950, 900, 800]) {
      const candidate = paletteEntry(family, stop);
      if (contrastRatio(oklchToRgb(entryToOklch(candidate)), background) >= 4.5) return candidate;
    }
  }
  return paletteEntry('neutral', 950);
};

const colorFor = (
  token: BrandToken,
  scope: ThemeScope,
  families: ResolvedFamilies
): Oklch => {
  const rule = STOP_MAP[token];
  const stop = rule[scope];
  if (stop === 'white' || stop === 'black') return EXTREMES[stop];

  const accentFamily =
    scope === 'dark' ? families.accentDarkFamily : families.accentFamily;

  const family =
    rule.role === 'accent'
      ? accentFamily
      : rule.role === 'accentSecondary'
        ? families.accentSecondaryFamily
        : rule.role === 'ambient'
          ? families.ambientFamily
          : families.neutralFamily;

  /*
   * The inverted accent surface, for a family with no usable dark stop.
   *
   * `accent` takes a light stop and `accent-foreground` takes a dark one —
   * the light-mode relationship, applied in dark. The foreground is chosen by
   * measured contrast rather than by a fixed stop, preferring the brand's main
   * family so the pair carries chroma contrast (sky on gold) instead of
   * restating the same hue at two depths.
   */
  if (rule.role === 'accentSecondary' && scope === 'dark' && families.accentSecondaryIsMuddyInDark) {
    const surface = paletteEntry(family, INVERTED_ACCENT_SURFACE_STOP);
    if (!token.endsWith('-foreground')) return entryToOklch(surface);
    return entryToOklch(readableOn(surface, [families.accentFamily, family]));
  }

  return entryToOklch(paletteEntry(family, stop));
};

export const deriveTheme = (input: BrandInput): DerivedTheme => {
  const families = resolveFamilies(input);

  const tokens = Object.fromEntries(
    THEME_SCOPES.map((scope) => [
      scope,
      Object.fromEntries(
        BRAND_TOKENS.map((token) => [token, colorFor(token, scope, families)])
      ) as Record<BrandToken, Oklch>,
    ])
  ) as TokenMap;

  return { ...families, tokens };
};

/**
 * Derive straight from two family names, skipping the snap. Used by the
 * exhaustive contrast proof, which walks all 153 combinations rather than
 * starting from a colour.
 */
export const deriveFromFamilies = (
  accentFamily: string,
  neutralFamily: string
): TokenMap => {
  const families: ResolvedFamilies = {
    accentFamily,
    accentDarkFamily: accentFamily,
    // The exhaustive proof walks single-colour brands, which is the stricter
    // case: the accent surface falls back to the neutral ramp.
    accentSecondaryFamily: neutralFamily,
    accentSecondaryIsNeutral: true,
    mudEscapedFrom: null,
    // Single-colour brand: the wash tints with the accent, as it did before.
    ambientFamily: accentFamily,
    accentSecondaryIsMuddyInDark: false,
    story: null,
    neutralFamily,
    accentSnap: { entry: paletteEntry(accentFamily, 500), distance: 0 },
    accentDarkSnap: null,
    neutralSnap: null,
  };

  return Object.fromEntries(
    THEME_SCOPES.map((scope) => [
      scope,
      Object.fromEntries(
        BRAND_TOKENS.map((token) => [token, colorFor(token, scope, families)])
      ) as Record<BrandToken, Oklch>,
    ])
  ) as TokenMap;
};
