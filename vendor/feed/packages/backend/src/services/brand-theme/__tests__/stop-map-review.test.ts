// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import { REVIEW_RESOLUTIONS, STOP_MAP_REVIEW_LIST } from '../review-list';
import { BRAND_TOKENS, STOP_MAP, THEME_SCOPES } from '../tokens';

describe('the Phase 0 review list', () => {
  it('names only tokens that exist and scopes that exist', () => {
    for (const flag of STOP_MAP_REVIEW_LIST) {
      expect(BRAND_TOKENS, `unknown token ${flag.token}`).toContain(flag.token);
      expect(STOP_MAP[flag.token], `${flag.token} has no stop rule`).toBeDefined();
      for (const scope of flag.scopes) {
        expect(THEME_SCOPES).toContain(scope);
      }
    }
  });

  it('accounts for every pair raised in review', () => {
    // Eighteen tokens were named, three of them for both scopes, so twenty-one
    // token/scope pairs in total. Two were resolved the same day.
    const open = STOP_MAP_REVIEW_LIST.reduce(
      (total, flag) => total + flag.scopes.length,
      0
    );
    expect(STOP_MAP_REVIEW_LIST.length + Object.keys(REVIEW_RESOLUTIONS).length).toBe(18);
    expect(open + Object.keys(REVIEW_RESOLUTIONS).length).toBe(21);
  });

  it('does not list a token whose flag has been resolved', () => {
    // `accent` stays on the list for its light scope; only the dark scope was
    // resolved, so this guards the pair rather than the token name.
    const flagged = new Set(
      STOP_MAP_REVIEW_LIST.flatMap((flag) =>
        flag.scopes.map((scope) => `${scope} ${flag.token}`)
      )
    );
    for (const key of Object.keys(REVIEW_RESOLUTIONS)) {
      expect(flagged, `${key} is resolved but still flagged`).not.toContain(key);
    }
  });
});
