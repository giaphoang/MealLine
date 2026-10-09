// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Tokens flagged during the Phase 0 stop-map review, 2026-08-27.
 *
 * These are not failures. Every one clears its contrast floor and the derived
 * William Temple House theme was accepted as close enough to proceed. They are
 * the places where the derived value moved further from the hand-tuned original
 * than expected, and are worth a second look once the wizard exists and the
 * result can be judged in the browser rather than as a swatch pair.
 *
 * Kept in code rather than a document so it travels with the stop map it refers
 * to. `stop-map-review.test.ts` asserts every entry still names a real token.
 */

import type { BrandToken, ThemeScope } from './tokens';

export type ReviewFlag = {
  token: BrandToken;
  scopes: readonly ThemeScope[];
};

/**
 * Eighteen tokens were named in review — three for both scopes, so twenty-one
 * token/scope pairs. Two were resolved the same day by the accent-rank change
 * and moved to `REVIEW_RESOLUTIONS`; the rest remain open.
 */
export const STOP_MAP_REVIEW_LIST: readonly ReviewFlag[] = [
  { token: 'foreground', scopes: ['light'] },
  { token: 'card-foreground', scopes: ['light'] },
  { token: 'popover-foreground', scopes: ['light'] },
  { token: 'primary-foreground', scopes: ['dark'] },
  { token: 'secondary-foreground', scopes: ['light'] },
  { token: 'muted-foreground', scopes: ['light', 'dark'] },
  { token: 'accent-foreground', scopes: ['light'] },
  { token: 'border', scopes: ['dark'] },
  { token: 'input', scopes: ['light', 'dark'] },
  { token: 'ring', scopes: ['dark'] },
  { token: 'sidebar-foreground', scopes: ['light', 'dark'] },
  { token: 'sidebar-primary', scopes: ['dark'] },
  { token: 'sidebar-primary-foreground', scopes: ['dark'] },
  { token: 'sidebar-accent-foreground', scopes: ['light'] },
  { token: 'sidebar-border', scopes: ['dark'] },
  { token: 'sidebar-ring', scopes: ['dark'] },
];

/**
 * Resolved since the list was written, and why. Kept rather than deleted so the
 * next review can see which flags a change actually answered.
 */
export const REVIEW_RESOLUTIONS: Record<string, string> = {
  'dark accent':
    'Resolved 2026-08-27. The accent surface now takes the brand\'s second ' +
    'ranked colour, or the neutral ramp for a single-colour brand, instead of ' +
    'a darkened primary. That removed the amber-800 brown and brought the ' +
    'derived value back in line with what FEED ships.',
  'dark sidebar-accent': 'Resolved with `dark accent`, same cause.',
};
