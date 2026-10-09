// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * The derivable brand token vocabulary, and the role-to-stop map.
 *
 * The map is the load-bearing finding of this design. Asking which single
 * Tailwind neutral family best serves all of FEED's surface tokens produced the
 * *same* stop assignment for every family tried — the stop is a property of the
 * token's role, not of the palette. So a theme is two family choices plus this
 * table, rather than arithmetic on lightness and chroma.
 *
 * Consequences: the configurable space is finite (17 chromatic × 9 neutral =
 * 153 themes), so contrast is proven exhaustively rather than validated per
 * save; and no colour can fall outside sRGB, so there is nothing to gamut-clamp.
 */

/** Every token a brand configuration may produce, per theme scope. */
export const BRAND_TOKENS = [
  /**
   * The brand's background tint. Ranked colours past the accent are labelled
   * "background tints only" in the wizard, and until now nothing consumed
   * them — the shell wash reached for `--primary` and `--accent` instead,
   * which is why a third and fourth colour changed nothing.
   */
  'ambient',
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'border',
  'input',
  'ring',
  // The sidebar carries its own token family. Omitting it leaves the primary
  // navigation in the previous brand's colours while the rest of the app
  // changes — the most visible possible failure, and one a browser check caught
  // that the unit tests could not.
  'sidebar-background',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
] as const;

export type BrandToken = (typeof BRAND_TOKENS)[number];

/** FEED renders light and dark; there is no high-visibility variant as in LOTTO. */
export const THEME_SCOPES = ['light', 'dark'] as const;
export type ThemeScope = (typeof THEME_SCOPES)[number];

/**
 * Which pool a token draws from. Accent-role tokens carry the brand hue;
 * surface-role tokens carry the neutral ramp.
 */
export type TokenRole = 'accent' | 'accentSecondary' | 'ambient' | 'neutral';

type StopRule = {
  role: TokenRole;
  /** Tailwind stop, per scope. `white` and `black` are palette-adjacent extremes. */
  light: number | 'white' | 'black';
  dark: number | 'white' | 'black';
};

/**
 * Role-to-stop assignments.
 *
 * Surface stops were measured against FEED's existing tokens: dark card → 900,
 * popover → 950, muted → 800, border → 500; light card → 50, muted → 100,
 * border → 300. Foreground stops are chosen for contrast against their paired
 * surface rather than by proximity to anything FEED ships, since the current
 * foregrounds are near-absolute white and black.
 */
export const STOP_MAP: Record<BrandToken, StopRule> = {
  background:            { role: 'neutral', light: 'white', dark: 950 },
  foreground:            { role: 'neutral', light: 950, dark: 50 },
  card:                  { role: 'neutral', light: 50, dark: 900 },
  'card-foreground':     { role: 'neutral', light: 950, dark: 50 },
  popover:               { role: 'neutral', light: 50, dark: 950 },
  'popover-foreground':  { role: 'neutral', light: 950, dark: 50 },
  primary:               { role: 'accent', light: 800, dark: 300 },
  'primary-foreground':  { role: 'neutral', light: 'white', dark: 950 },
  // `secondary` is a control surface and `muted` is a background that recedes,
  // so they must not resolve to the same value — at a shared stop they came out
  // byte-identical and `bg-secondary` was indistinguishable from `bg-muted`.
  secondary:             { role: 'neutral', light: 200, dark: 700 },
  'secondary-foreground':{ role: 'neutral', light: 900, dark: 100 },
  muted:                 { role: 'neutral', light: 100, dark: 800 },
  // Muting exists to lower something in the hierarchy, so a quieter value here
  // would be the intent rather than a shortfall — but the palette's granularity
  // does not offer one. Measured across all 153 themes: 600/400 clears the floor
  // at 6.26 and 5.56, and the next step down (600/500) drops dark muted text to
  // 3.03:1. There is no stop between. `text-muted-foreground` carries real body
  // copy in FEED — card descriptions, table detail, footnotes — and WCAG 1.4.3
  // has no exemption for text that is meant to be quiet, so this stays at the
  // passing pair. Genuinely quieter muted text is an Advanced-tier override.
  'muted-foreground':    { role: 'neutral', light: 600, dark: 400 },
  // The hover/selected surface takes the brand's *second* colour, not a darkened
  // primary. A brand with two colours (WTH is blue and gold; Pepsi is red and
  // blue) gets its own pairing; a single-colour brand falls back to the neutral
  // ramp, which is what FEED does by hand today.
  // Decorative only — it tints backgrounds and is never a text surface, so it
  // carries no contrast pair. Mid stops: deep enough to read as colour under a
  // low-percentage mix, light enough not to fight the page in light mode.
  ambient:               { role: 'ambient', light: 200, dark: 700 },
  accent:                { role: 'accentSecondary', light: 100, dark: 800 },
  'accent-foreground':   { role: 'accentSecondary', light: 900, dark: 100 },
  border:                { role: 'neutral', light: 300, dark: 700 },
  input:                 { role: 'neutral', light: 300, dark: 700 },
  // 700, not 600: yellow is the lightest chromatic family, and `yellow-600`
  // lands at 2.94:1 against a white page — a hair under the 3:1 WCAG 1.4.11
  // focus-indicator floor, and the only failure in the whole 153-theme space.
  // Darkening the stop for every family fixes it once rather than special-casing
  // one, which is the point of a single shared map.
  ring:                  { role: 'accent', light: 700, dark: 400 },

  // The sidebar is a distinct surface: lighter than the page in light mode,
  // darker in dark, so it reads as chrome rather than content.
  'sidebar-background':        { role: 'neutral', light: 50, dark: 900 },
  'sidebar-foreground':        { role: 'neutral', light: 900, dark: 100 },
  'sidebar-primary':           { role: 'accent', light: 800, dark: 300 },
  'sidebar-primary-foreground':{ role: 'neutral', light: 'white', dark: 950 },
  'sidebar-accent':            { role: 'accentSecondary', light: 100, dark: 800 },
  'sidebar-accent-foreground': { role: 'accentSecondary', light: 900, dark: 100 },
  'sidebar-border':            { role: 'neutral', light: 300, dark: 700 },
  'sidebar-ring':              { role: 'accent', light: 700, dark: 400 },
};

/**
 * Pairs that render text or a mark on a fill. Every one is contrast-checked
 * across all 153 themes; see `validate.ts`.
 *
 * `border` is deliberately **not** held to the 3:1 UI floor. WCAG 1.4.11 applies
 * that to interactive components and meaningful graphics, and exempts purely
 * decorative container edges — which is what this token is. FEED ships a light
 * border at 1.55:1 against the page today; gating configured themes at 3:1 would
 * demand a heavy dark rule no one wants and would fail the Phase 0 fidelity gate
 * against the app's own current appearance. It keeps a `decorative` floor so a
 * border cannot become invisible.
 */
export const CONTRAST_PAIRS: ReadonlyArray<{
  foreground: BrandToken;
  background: BrandToken;
  /**
   * `text` demands 4.5:1; `ui` demands 3:1 per WCAG 1.4.11 for large text,
   * interactive components and focus indicators; `decorative` only asks that the
   * edge be perceptible at all.
   */
  kind: 'text' | 'ui' | 'decorative';
}> = [
  { foreground: 'foreground', background: 'background', kind: 'text' },
  { foreground: 'card-foreground', background: 'card', kind: 'text' },
  { foreground: 'popover-foreground', background: 'popover', kind: 'text' },
  { foreground: 'primary-foreground', background: 'primary', kind: 'text' },
  { foreground: 'secondary-foreground', background: 'secondary', kind: 'text' },
  { foreground: 'muted-foreground', background: 'muted', kind: 'text' },
  { foreground: 'accent-foreground', background: 'accent', kind: 'text' },
  { foreground: 'border', background: 'background', kind: 'decorative' },
  { foreground: 'border', background: 'card', kind: 'decorative' },
  // The focus indicator is a genuine 1.4.11 case. Note the derived themes clear
  // this comfortably where FEED's shipped dark ring measures only 1.50:1 — an
  // existing shortfall this work happens to correct rather than inherit.
  { foreground: 'ring', background: 'background', kind: 'ui' },
  { foreground: 'sidebar-foreground', background: 'sidebar-background', kind: 'text' },
  {
    foreground: 'sidebar-primary-foreground',
    background: 'sidebar-primary',
    kind: 'text',
  },
  {
    foreground: 'sidebar-accent-foreground',
    background: 'sidebar-accent',
    kind: 'text',
  },
  { foreground: 'sidebar-border', background: 'sidebar-background', kind: 'decorative' },
];

export const CONTRAST_FLOOR = { text: 4.5, ui: 3, decorative: 1.3 } as const;

/**
 * Operational semiotics, absent from the vocabulary above so a saved
 * configuration cannot express an override — structurally stronger than a
 * code-review rule. These mean the same thing at every agency and staff read
 * them at speed on the pantry floor.
 */
export const PROTECTED_TOKEN_PATTERNS: readonly RegExp[] = [
  /^color-(?:inStock|limited|clearance|outOfStock)$/,
  /^chart-(?:success|warning|danger)$/,
  /^destructive(?:-foreground)?$/,
  /^success(?:-foreground)?$/,
];

export const isProtectedToken = (name: string): boolean =>
  PROTECTED_TOKEN_PATTERNS.some((pattern) => pattern.test(name));

/**
 * Counting nouns are protected for the same reason the status colours are.
 * `household`, `visit` and `person served` carry precise definitions that
 * docs/reports/service-analytics-plan.md works to keep straight — which record
 * answers which question, and why two of them are never summed. A configurable
 * rename would quietly dismantle that. Enforced when terminology lands in
 * Phase 4; declared here so the two protected sets sit together.
 */
export const PROTECTED_TERMS = ['household', 'visit', 'person served'] as const;
