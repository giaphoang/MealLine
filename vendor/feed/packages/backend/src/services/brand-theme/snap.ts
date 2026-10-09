// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Snapping a brand colour onto the Tailwind v4 palette.
 *
 * FEED does not reproduce an agency's colour exactly and derive from it. It
 * snaps to the nearest palette entry, because brand alignment is reconstructing
 * a colour *story* rather than matching a hex value, and because a finite
 * palette makes the whole configurable space provable rather than merely
 * validated (see `validate.ts`). Measured against four real brand colours, hue
 * lands within three degrees. Rationale and measurements:
 * docs/roadmap/v1.7-white-label-plan.md.
 *
 * Two constraints the measurements exposed:
 *
 *  1. **Snapping is role-aware, and neutral snapping weights chroma.** Tailwind
 *     4.3 ships nine neutral families, four of them lightly tinted. St. Johns
 *     Food Share's dead-neutral charcoal (chroma 0.000) lands on `olive-800` —
 *     a warm green cast across every surface — and splitting the pools is *not*
 *     enough to prevent it, because `olive-800` is genuinely the nearest neutral
 *     by unweighted distance. Amplifying the chromatic axes is what fixes it:
 *     at the shipped weight a source with no tint resolves to a family with no
 *     tint, while FEED's genuinely blue surfaces still resolve to `slate`.
 *
 *  2. **The family is chosen once, the stop per token.** Snapping each token
 *     independently scatters a theme across families — card in `slate`, muted in
 *     `mauve`, popover in `zinc` — which destroys the internal coherence of the
 *     ramp that is the entire reason to use Tailwind. `chooseFamily` picks one
 *     family for a whole role by best aggregate fit.
 */

import { hueDifference, perceptualDistance, type Oklch } from './color';
import {
  TAILWIND_EXTREMES,
  TAILWIND_PALETTE,
  isNeutralFamily,
  type TailwindEntry,
} from './palettes';

export type SnapRole = 'chromatic' | 'neutral';

/**
 * How much the chromatic axes count when snapping a neutral.
 *
 * Swept against the two cases that matter: St. Johns' achromatic charcoal, which
 * must not acquire a tint, and FEED's blue-leaning surfaces, which must keep
 * theirs. Unweighted puts the charcoal on `olive-800` (chroma 0.016); 2 reaches
 * `zinc-800` (0.006); 3 reaches `neutral-800` (0.000), and FEED still resolves
 * to `slate` at every value tried. 3 is the first weight where "no tint in"
 * reliably means "no tint out".
 */
export const CHROMA_WEIGHT = 3;

const weightFor = (role: SnapRole) => (role === 'neutral' ? CHROMA_WEIGHT : 1);

export type SnapCandidate = {
  entry: TailwindEntry;
  distance: number;
};

/**
 * Snap targets for a role. Pure black and white join the neutral pool: they are
 * achromatic, and without them a brand surface at either extreme resolved to a
 * 950 or 50 neutral instead of the exact value Tailwind already provides. They
 * stay out of the *family* lists — a single value is not a ramp, and
 * `chooseFamily` needs one it can pick stops from.
 */
const poolFor = (role: SnapRole): readonly TailwindEntry[] =>
  role === 'neutral'
    ? [
        ...TAILWIND_PALETTE.filter((entry) => isNeutralFamily(entry.family)),
        ...TAILWIND_EXTREMES,
      ]
    : TAILWIND_PALETTE.filter((entry) => !isNeutralFamily(entry.family));

/**
 * Nearest palette entries to `target`, closest first.
 *
 * The wizard shows the top few rather than silently applying the winner: the
 * maths does not respect a colour's name, and St. Johns Food Share's teal snaps
 * to `emerald-600` with `teal-600` as runner-up. An operator should get to say
 * which of those is their brand.
 */
export const snapCandidates = (
  target: Oklch,
  role: SnapRole,
  limit = 3
): SnapCandidate[] =>
  poolFor(role)
    .map((entry) => ({
      entry,
      distance: perceptualDistance(
        target,
        { l: entry.l, c: entry.c, h: entry.h },
        weightFor(role)
      ),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

/**
 * Nearest palette entries across the WHOLE palette, neutrals included.
 *
 * The role pools are deliberately exclusive: an accent has to carry chroma and
 * a neutral has to lack it, so `chooseFamily` must not be offered the other
 * kind. A brand's colour story is a different question. It is the ranked list
 * of an organisation's actual colours, and those routinely include neutrals —
 * St. Johns Food Share's own three are a green, a near-black and an off-white.
 * Snapping that list through the chromatic pool silently replaced every
 * neutral someone chose with a saturated colour, so the wizard could not
 * represent the brand it was being pointed at.
 *
 * Chroma stays weighted here. Across a mixed pool that is what keeps a grey on
 * a grey rather than matching it to a vivid colour of similar lightness, and it
 * keeps a saturated colour off the neutral ramps. An exact palette entry
 * matches itself at distance zero whatever the weighting, which is the common
 * case now that the picker only emits palette entries.
 */
/**
 * Whether a colour is an actual colour, or a grey wearing a hue value.
 *
 * Below this chroma the hue is noise — every OKLCH neutral still carries some
 * hue, but at 0.008 nobody perceives it as a colour. Tailwind's neutral ramps
 * top out at 0.046 and its chromatic ramps start at 0.013, so the two overlap
 * only among near-white tints; 0.03 separates every real brand colour we have
 * seen from every neutral. William Temple House's blue is 0.120 and its gold
 * 0.160; St. Johns' green is 0.121 against a near-black at 0.000 and an
 * off-white at 0.008.
 */
export const ACHROMATIC_CHROMA = 0.03;

export const isAchromatic = (color: Oklch): boolean => color.c < ACHROMATIC_CHROMA;

/**
 * The pool a brand colour should be matched against.
 *
 * Roles used to fix this: an accent searched chromatic ramps and a neutral
 * searched neutral ones. That is right for a brand with a colour in it and
 * wrong for a brand without one — a grayscale identity had its primary
 * replaced by whatever saturated family happened to sit nearest, which is not
 * a near miss but a different brand. Letting the colour's own chroma decide
 * keeps every coloured brand exactly where it was and lets a grey one stay
 * grey. All 81 neutral-accent themes pass the same contrast proof as the 153
 * chromatic ones.
 */
export const roleFor = (color: Oklch, role: SnapRole): SnapRole => {
  if (role === 'neutral') return 'neutral';
  /*
   * Classified by what the colour actually matches, not by a chroma cutoff.
   *
   * A flat threshold put the boundary in the wrong place: `slate-700` carries
   * chroma 0.044, over the 0.03 line, so it was treated as chromatic and
   * snapped through a pool with no neutrals in it — an operator who chose
   * slate got cyan. Tailwind's tinted greys reach 0.046, well past where a
   * threshold can separate them from faint chromatics.
   *
   * Asking which palette entry is nearest across the whole palette answers the
   * question directly: if the closest thing to this colour is a grey, it is a
   * grey.
   */
  const [nearest] = paletteCandidates(color, 1);
  return nearest && isNeutralFamily(nearest.entry.family) ? 'neutral' : 'chromatic';
};

/**
 * The neutral ramp that harmonises with a brand hue.
 *
 * Tailwind's `neutral` is the one ramp at chroma exactly 0, so a brand whose
 * supplied greys are truly achromatic snaps to it — faithfully, and the result
 * is a theme where every surface, border and muted label is dead grey while
 * only three tokens carry the brand. It reads as desaturated because it is:
 * surfaces are most of the pixels.
 *
 * The tinted ramps solve this. `slate` sits at hue 260 with chroma 0.041 and
 * `gray` at 257 — imperceptible as colour in isolation, but across every
 * surface they give the whole interface a cast that agrees with the brand.
 * That is what the hand-tuned William Temple House theme does, and why it
 * feels coloured where a derived one felt flat.
 *
 * So an achromatic result is treated as "grey, unspecified" rather than
 * "grey, and definitely this one": if the brand has a hue, the nearest tinted
 * ramp to that hue is used instead. A brand with no hue at all keeps `neutral`,
 * because there is nothing to harmonise with and a grayscale identity should
 * stay grayscale.
 */
/**
 * Only `neutral` is replaced, and it may be replaced by any tinted ramp.
 *
 * A first attempt gated on chroma >= 0.02, which left just slate, gray and
 * mauve as candidates — so an orange brand was handed mauve, a purple grey,
 * as its "nearest hue", and a brand whose greys were genuinely stone-coloured
 * had that overridden. Both were the pool being wrong, not the idea.
 *
 * Trigger on the one ramp that is exactly achromatic, and choose from every
 * other neutral family. Their hues span the wheel — stone and taupe warm,
 * olive green, mist cyan, slate and gray blue, mauve magenta — so every brand
 * hue has a grey that agrees with it.
 */
const ACHROMATIC_RAMP_CHROMA = 0.003;

export const harmonisedNeutralFamily = (
  chosen: string,
  brandHue: Oklch
): string => {
  const chosenEntry = TAILWIND_PALETTE.find(
    (entry) => entry.family === chosen && entry.stop === 800
  );
  // No hue to harmonise with. A grayscale identity is pushed to the one
  // genuinely achromatic ramp rather than left wherever the neutral snap
  // landed — for plain greys that was `olive`, so "grayscale" came out faintly
  // green. Grayscale should mean grey.
  if (isAchromatic(brandHue)) return 'neutral';
  // A ramp that already carries a tint is a real choice; leave it.
  if (!chosenEntry || chosenEntry.c > ACHROMATIC_RAMP_CHROMA) return chosen;

  const tinted = TAILWIND_PALETTE.filter(
    (entry) =>
      entry.stop === 800 &&
      isNeutralFamily(entry.family) &&
      entry.c > ACHROMATIC_RAMP_CHROMA
  );
  if (tinted.length === 0) return chosen;

  // `hueDifference` is SIGNED, in (-180, 180]. Comparing it raw picks the most
  // negative angle rather than the nearest hue, which put a blue brand on
  // taupe. Distance is the absolute value.
  const distance = (entry: { h: number }) => Math.abs(hueDifference(entry.h, brandHue.h));
  return tinted.reduce((best, entry) => (distance(entry) < distance(best) ? entry : best)).family;
};

/**
 * A family that actually has stops, for callers that index into a ramp.
 *
 * `poolFor('neutral')` includes pure black and white on purpose — a brand
 * surface at either extreme should resolve to the exact value Tailwind
 * provides rather than to a 950 or 50. But they are single values with no
 * ramp, so any caller that then asks for `family-200` gets nothing: ranking a
 * pure black as a third colour made `--ambient` resolve to `black-200` and
 * threw, which surfaced as the whole colour story blanking out.
 *
 * They are achromatic, so `neutral` is the ramp that means the same thing.
 */
export const rampFamily = (family: string): string =>
  TAILWIND_PALETTE.some((entry) => entry.family === family) ? family : 'neutral';

export const paletteCandidates = (
  target: Oklch,
  limit = 3
): SnapCandidate[] =>
  TAILWIND_PALETTE
    .map((entry) => ({
      entry,
      distance: perceptualDistance(
        target,
        { l: entry.l, c: entry.c, h: entry.h },
        CHROMA_WEIGHT
      ),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

/** The single nearest palette entry to `target` within its role's pool. */
export const snap = (target: Oklch, role: SnapRole): SnapCandidate => {
  const [best] = snapCandidates(target, role, 1);
  if (!best) throw new Error(`No Tailwind entries available for the ${role} pool.`);
  return best;
};

export type FamilyChoice = {
  family: string;
  /** Mean perceptual distance across every target this family had to serve. */
  averageDistance: number;
};

/**
 * Choose one family to serve a whole role.
 *
 * Scored by mean distance across every colour the role must express, so the
 * winner is the ramp that fits the set rather than the ramp that happens to nail
 * one member of it. With FEED's seven surface tokens this selects `slate`,
 * which is the blue-tinted neutral and matches surfaces authored at hue 211–222.
 */
export const chooseFamily = (
  targets: readonly Oklch[],
  role: SnapRole
): FamilyChoice => {
  if (targets.length === 0) {
    throw new Error('chooseFamily requires at least one target colour.');
  }

  // Ramp families only: the extremes have a single value and no stops to choose.
  const rampPool = TAILWIND_PALETTE.filter((entry) =>
    role === 'neutral' ? isNeutralFamily(entry.family) : !isNeutralFamily(entry.family)
  );
  const families = [...new Set(rampPool.map((entry) => entry.family))];
  const scored = families
    .map((family) => {
      const ramp = TAILWIND_PALETTE.filter((entry) => entry.family === family);
      const total = targets.reduce((sum, target) => {
        const nearest = ramp.reduce(
          (best, entry) =>
            Math.min(
              best,
              perceptualDistance(
                target,
                { l: entry.l, c: entry.c, h: entry.h },
                weightFor(role)
              )
            ),
          Number.POSITIVE_INFINITY
        );
        return sum + nearest;
      }, 0);
      return { family, averageDistance: total / targets.length };
    })
    .sort((a, b) => a.averageDistance - b.averageDistance);

  return scored[0];
};

/** The entry at a given family and stop. Throws if the pairing does not exist. */
export const paletteEntry = (family: string, stop: number): TailwindEntry => {
  const entry = TAILWIND_PALETTE.find(
    (candidate) => candidate.family === family && candidate.stop === stop
  );
  if (!entry) throw new Error(`No Tailwind entry for ${family}-${stop}.`);
  return entry;
};

export const entryToOklch = (entry: TailwindEntry): Oklch => ({
  l: entry.l,
  c: entry.c,
  h: entry.h,
});

/**
 * Hue and lightness window where a chromatic family reads as brown.
 *
 * Not a chroma problem — `amber` keeps 73% of its chroma from stop 500 to 800.
 * It is that `amber-800` sits at hue 46 and lightness 47%, and dark orange *is*
 * brown. No nudge inside the warm band escapes it, which is why the escape is a
 * different family rather than a different stop.
 */
const MUD_HUE_RANGE = [30, 105] as const;
const MUD_LIGHTNESS_CEILING = 0.55;

export const isMuddy = (entry: TailwindEntry): boolean =>
  entry.c >= 0.05 &&
  entry.l < MUD_LIGHTNESS_CEILING &&
  entry.h >= MUD_HUE_RANGE[0] &&
  entry.h <= MUD_HUE_RANGE[1];

/**
 * A substitute family for a warm brand whose dark surface would go muddy.
 *
 * Rotating toward green rather than toward red: red at this depth lands on the
 * clearance band, and a hover surface that reads as a danger tint is worse than
 * one that reads as deep olive. The operator can override by promoting a
 * different colour to the accent rank, which is the better fix when the brand
 * actually has a second colour.
 */
export const mudEscapeFamily = (family: string): string => {
  const anchor = TAILWIND_PALETTE.find(
    (entry) => entry.family === family && entry.stop === 500
  );
  if (!anchor) return family;

  const targetHue = (anchor.h + 60) % 360;
  const candidates = [
    ...new Set(
      TAILWIND_PALETTE.filter((entry) => !isNeutralFamily(entry.family)).map(
        (entry) => entry.family
      )
    ),
  ]
    .map((candidate) => {
      const at500 = TAILWIND_PALETTE.find(
        (entry) => entry.family === candidate && entry.stop === 500
      )!;
      const at800 = TAILWIND_PALETTE.find(
        (entry) => entry.family === candidate && entry.stop === 800
      )!;
      return {
        family: candidate,
        distance: Math.abs(hueDifference(targetHue, at500.h)),
        muddy: isMuddy(at800),
      };
    })
    .filter((candidate) => !candidate.muddy)
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.family ?? family;
};
