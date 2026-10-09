// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Where a user should report a failure they cannot resolve themselves.
 *
 * A tracked issue reaches whoever is maintaining FEED, which naming one
 * developer in the copy does not. Override with SUPPORT_ISSUES_URL if the
 * project moves.
 */
export const SUPPORT_ISSUES_URL =
  process.env.SUPPORT_ISSUES_URL || 'https://github.com/MattGeiger/williamtemple-feed/issues';

/**
 * The one sentence every "this is not something you can fix" message ends
 * with.
 *
 * It is written once, here, for two reasons. The URL must be a full
 * `https://` address rather than the bare `github.com/MattGeiger` that these
 * messages used to carry, because the toast renderer turns a real URL into a
 * clickable link and cannot do anything with a bare host — and because that
 * bare form pointed at a personal profile rather than the project's issue
 * tracker.
 *
 * The account note is here rather than left implicit because the destination
 * is not a contact form: a reader who follows the link without a GitHub
 * account can read the issues and cannot open one, and finding that out after
 * arriving is worse than being told before leaving.
 */
export const SUPPORT_CONTACT_SENTENCE =
  `If it keeps happening, report it at ${SUPPORT_ISSUES_URL} `
  + '(a free GitHub account is needed to post).';
