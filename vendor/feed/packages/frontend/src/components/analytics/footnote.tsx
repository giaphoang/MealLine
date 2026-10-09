// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';

/**
 * Every Analytics footnote is a bulleted list.
 *
 * There is deliberately no paragraph variant. These notes are always a series
 * of separate facts — a denominator, which system asked the question, what a
 * placeholder means — and as prose the reader had to parse the whole block to
 * find the one that applied to them. A single-item list is still a list, so
 * one short caveat costs nothing and the format stays uniform across all four
 * lenses.
 */

/**
 * One caveat. Flat — there is no nested variant.
 *
 * Nesting was tried for the placeholder birth years under the estimated-age
 * note and read worse than the thing it was meant to clarify: an indented
 * second level in small muted text looks like a rendering fault rather than a
 * qualification, and the reader has to work out the relationship before
 * reading the fact. Every point here is worth the same weight, so they all get
 * the same bullet.
 */
export type FootnoteEntry = React.ReactNode;

/**
 * Footnote caveats as a list rather than a paragraph.
 *
 * These notes are a series of separate facts — how many records lack a field,
 * which system asked the question, what a placeholder means — and running them
 * together as prose made the reader parse a paragraph to find the one that
 * applied to them. Empty and false entries are dropped so a card can build its
 * list with inline conditions and never render a stray bullet.
 */
export function FootnoteList({
  items,
  marker = '\u2022',
}: {
  items: FootnoteEntry[];
  /**
   * What precedes each line. A bullet by default.
   *
   * Pass `*` (or `**`) to make the list a reference note keyed to a marked
   * figure above it — Service Summary's "treat this as an undercount" is
   * meaningless without saying *what* is undercounted, and the asterisk on the
   * "People served" tile is what supplies the referent. A marker only earns
   * its place when something above carries the matching mark; a bare asterisk
   * with nothing to point at is just a bullet the reader has to decode.
   */
  marker?: string;
}) {
  const kept = items.filter((item) => item !== null && item !== undefined && item !== false && item !== '');
  if (kept.length === 0) return null;

  return (
    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
      {kept.map((item, index) => (
        // Index keys: these lists are static per render and never reordered.
        <li key={index} className="flex gap-1.5">
          <span aria-hidden="true" className="select-none">{marker}</span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
