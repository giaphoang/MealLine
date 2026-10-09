// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Generates `src/services/brand-theme/palettes.ts` from the two palettes FEED
 * already ships, so the brand derivation never carries a second hand-maintained
 * copy of either.
 *
 *   Tailwind v4  ← packages/frontend/node_modules/tailwindcss/theme.css
 *   IBM Carbon   ← packages/frontend/src/lib/colors.ts
 *
 * The duplicated `model-specs.ts` catalogue (see docs/roadmap/v1.6-to-v2.0.md,
 * v1.9.5) is the cautionary precedent: two lists that are identical today and
 * enforced by nothing. Here the generated file is committed for a plain build,
 * and `palette-drift.test.ts` regenerates and compares so a Tailwind upgrade or
 * a Carbon edit fails the suite rather than silently diverging.
 *
 *   npx ts-node --transpile-only scripts/generate-brand-palettes.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FRONTEND = resolve(__dirname, '../../frontend');
const TAILWIND_THEME = resolve(FRONTEND, 'node_modules/tailwindcss/theme.css');
const CARBON_SOURCE = resolve(FRONTEND, 'src/lib/colors.ts');
const OUTPUT = resolve(__dirname, '../src/services/brand-theme/palettes.ts');

/**
 * Tailwind writes achromatic entries as `oklch(55.6% 0 none)` — hue is the CSS
 * keyword `none`, not a number. Reading it as a number drops the whole
 * `neutral` family, which is exactly the family a dead-neutral brand charcoal
 * needs. Chroma is 0 there, so hue is meaningless and 0 is a safe stand-in.
 */
const TAILWIND_ENTRY =
  /--color-([a-z]+)-(\d+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+|none)\)/g;

/**
 * Families whose entries are neutral or near-neutral. Tailwind 4.3 added four
 * lightly tinted neutrals (mauve, olive, mist, taupe) alongside the classic
 * five. Surfaces snap within this pool and brand accents snap outside it; see
 * `snap.ts` for why that split is load-bearing.
 */
const NEUTRAL_FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'mauve', 'olive', 'mist', 'taupe',
] as const;

export const readTailwind = () => {
  const css = readFileSync(TAILWIND_THEME, 'utf8');
  const entries: string[] = [];
  let count = 0;
  for (const match of css.matchAll(TAILWIND_ENTRY)) {
    const [, family, stop, l, c, h] = match;
    const hue = h === 'none' ? 0 : Number(h);
    entries.push(
      `  { family: '${family}', stop: ${stop}, l: ${Number(l) / 100}, c: ${Number(c)}, h: ${hue} },`
    );
    count += 1;
  }
  if (count < 250) {
    throw new Error(`Only ${count} Tailwind entries parsed; expected the full palette.`);
  }
  return entries;
};

export const readCarbon = () => {
  const source = readFileSync(CARBON_SOURCE, 'utf8');
  const block = source.match(
    /export const carbonChartColors[\s\S]*?=\s*\{([\s\S]*?)\n\}\s*as const;/
  );
  if (!block) throw new Error('Unable to locate carbonChartColors in the frontend source.');

  const entries: string[] = [];
  const familyPattern =
    /(\w+):\s*\{\s*primary:\s*\{\s*light:\s*'(#[0-9a-fA-F]{6})',\s*dark:\s*'(#[0-9a-fA-F]{6})'\s*\},\s*secondary:\s*\{\s*light:\s*'(#[0-9a-fA-F]{6})',\s*dark:\s*'(#[0-9a-fA-F]{6})'\s*\}/g;
  for (const match of block[1].matchAll(familyPattern)) {
    const [, family, pl, pd, sl, sd] = match;
    entries.push(
      `  { family: '${family}', primary: { light: '${pl}', dark: '${pd}' }, secondary: { light: '${sl}', dark: '${sd}' } },`
    );
  }
  if (entries.length < 8) {
    throw new Error(`Only ${entries.length} Carbon families parsed; expected ten.`);
  }

  // The frontend already orders these families to hop around the colour wheel
  // so adjacent series stay distinguishable, including under colour-vision
  // deficiency. That property is the reason brand alignment *rotates* this
  // order rather than re-sorting it -- see `charts.ts`.
  const orderBlock = source.match(
    /CARBON_CATEGORICAL_ORDER:\s*readonly CarbonFamily\[\]\s*=\s*\[([\s\S]*?)\];/
  );
  if (!orderBlock) throw new Error('Unable to locate CARBON_CATEGORICAL_ORDER.');
  const order = [...orderBlock[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
  if (order.length !== entries.length) {
    throw new Error(
      `CARBON_CATEGORICAL_ORDER lists ${order.length} families but ${entries.length} are defined.`
    );
  }

  return { entries, order };
};

export const render = (tailwind: string[], carbon: string[], order: string[]) => `// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * GENERATED FILE — do not edit by hand.
 *
 * Regenerate with:
 *   npx ts-node --transpile-only scripts/generate-brand-palettes.ts
 *
 * Sources: packages/frontend/node_modules/tailwindcss/theme.css and
 * packages/frontend/src/lib/colors.ts. \`palette-drift.test.ts\` fails if this
 * file and those sources disagree.
 */

/** One Tailwind palette entry, lightness normalized to 0..1. */
export type TailwindEntry = {
  family: string;
  stop: number;
  l: number;
  c: number;
  h: number;
};

/** Families that read as neutral; surfaces snap within these, accents outside. */
export const NEUTRAL_FAMILIES = [
${NEUTRAL_FAMILIES.map((f) => `  '${f}',`).join('\n')}
] as const;

export type NeutralFamily = (typeof NEUTRAL_FAMILIES)[number];

export const isNeutralFamily = (family: string): family is NeutralFamily =>
  (NEUTRAL_FAMILIES as readonly string[]).includes(family);

export const TAILWIND_PALETTE: readonly TailwindEntry[] = [
${tailwind.join('\n')}
];

/**
 * Tailwind's pure black and white, which it names without a numeric stop
 * (\`--color-black: #000\`) and the family/stop pattern therefore cannot see.
 *
 * They are held apart from \`TAILWIND_PALETTE\` on purpose. As *snap targets*
 * they matter — without them a brand whose surface is pure black resolved to a
 * 950 neutral, which is how William Temple House's true-black dark mode drifted
 * onto slate-950. As *families* they are meaningless: each is a single value
 * rather than a ramp, so nothing can pick a stop from them, and including them
 * in the family lists would corrupt the 153-theme space the contrast proof
 * walks.
 */
export const TAILWIND_EXTREMES: readonly TailwindEntry[] = [
  { family: 'black', stop: 0, l: 0, c: 0, h: 0 },
  { family: 'white', stop: 0, l: 1, c: 0, h: 0 },
];

/** IBM Carbon categorical chart families, as the frontend declares them. */
export type CarbonEntry = {
  family: string;
  primary: { light: string; dark: string };
  secondary: { light: string; dark: string };
};

export const CARBON_PALETTE: readonly CarbonEntry[] = [
${carbon.join('\n')}
];

/**
 * The frontend's deliberate hue-hopping sequence for categorical series. Each
 * family sits far from its neighbours on the colour wheel so adjacent series
 * stay distinguishable, including under colour-vision deficiency. Brand
 * alignment rotates this list; it never re-sorts it.
 */
export const CARBON_CATEGORICAL_ORDER: readonly string[] = [
${order.map((f) => `  '${f}',`).join('\n')}
];
`;

export const OUTPUT_PATH = OUTPUT;

/** Build the file contents without touching disk — used by the drift guard. */
export const renderPalettes = (): string => {
  const tailwind = readTailwind();
  const { entries: carbon, order } = readCarbon();
  return render(tailwind, carbon, order);
};

// Only write when invoked as a script, so importing this module for the drift
// comparison cannot rewrite the very file it is checking.
if (require.main === module) {
  const contents = renderPalettes();
  writeFileSync(OUTPUT, contents, 'utf8');
  console.log(`Wrote ${OUTPUT}`);
}
