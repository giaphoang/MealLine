// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Frontend mirror of `packages/backend/src/lib/support.ts`.
 *
 * The two packages cannot share a module, so the URL and the sentence are
 * duplicated the same way `icon-svgs.ts` and the typography engine are. Keep
 * them byte-identical: a user who sees one wording from a server error and
 * another from a client-side one has no way to know they mean the same thing.
 *
 * The backend reads `SUPPORT_ISSUES_URL` from the process environment; the
 * browser cannot, so this reads Vite's build-time `VITE_SUPPORT_ISSUES_URL`.
 * Set both, or neither, if the project moves.
 */
export const SUPPORT_ISSUES_URL =
  import.meta.env.VITE_SUPPORT_ISSUES_URL
  || 'https://github.com/MattGeiger/williamtemple-feed/issues';

/** See the backend module for why the account note travels with the URL. */
export const SUPPORT_CONTACT_SENTENCE =
  `If it keeps happening, report it at ${SUPPORT_ISSUES_URL} `
  + '(a free GitHub account is needed to post).';
