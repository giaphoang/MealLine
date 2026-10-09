// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';

/**
 * Absolute http(s) URLs only. A bare host like `github.com/MattGeiger` is
 * deliberately not matched: guessing a scheme for arbitrary text is how a
 * linkifier starts turning sentences into links, and every message FEED
 * writes now carries a full URL (see `lib/support.ts`).
 */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/**
 * Sentence punctuation that ends up glued to a URL when the URL ends a
 * sentence — "…/issues." — and must not travel into the href.
 * A closing bracket is only stripped when the URL has no matching opener,
 * so a legitimate `…/Foo_(bar)` anchor survives.
 */
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

const splitTrailingPunctuation = (url: string): [string, string] => {
  let href = url.replace(TRAILING_PUNCTUATION, '');
  while (/[)\]}]$/.test(href)) {
    const closer = href.slice(-1);
    const opener = closer === ')' ? '(' : closer === ']' ? '[' : '{';
    const balanced = href.split(opener).length === href.split(closer).length;
    if (balanced) break;
    href = href.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
  }
  return [href, url.slice(href.length)];
};

/**
 * Renders a message with any URLs in it as clickable links.
 *
 * Messages reach the toast as plain strings — they are composed by backend
 * routes, by `ErrorHandlerService`, and by call sites, and none of them can
 * hand React an element. Rather than teaching every one of those to build a
 * node, the one place that renders a message does the linkifying. A message
 * containing no URL is returned as the original string, so nothing changes
 * for the overwhelming majority of toasts.
 *
 * The link inherits `currentColor` and is distinguished by weight and an
 * underline. That is deliberate: the toast has three variants, one of them a
 * solid red destructive surface, and any colour chosen here would have to be
 * legible on all of them. Inheriting the description's own colour is legible
 * on all of them by construction.
 */
export const linkifyMessage = (message: string): React.ReactNode => {
  if (typeof message !== 'string' || !message.includes('://')) return message;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  // Fresh lastIndex per call; the regex is module-level and /g is stateful.
  URL_PATTERN.lastIndex = 0;
  for (let match = URL_PATTERN.exec(message); match; match = URL_PATTERN.exec(message)) {
    const [href, trailing] = splitTrailingPunctuation(match[0]);
    if (!href) continue;

    if (match.index > cursor) parts.push(message.slice(cursor, match.index));
    parts.push(React.createElement(
      'a',
      {
        key: `link-${index}`,
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        className: 'font-medium underline underline-offset-2 hover:no-underline',
      },
      href,
    ));
    if (trailing) parts.push(trailing);
    cursor = match.index + match[0].length;
    index += 1;
  }

  if (parts.length === 0) return message;
  if (cursor < message.length) parts.push(message.slice(cursor));
  return React.createElement(React.Fragment, null, ...parts);
};
