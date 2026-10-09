// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Batching helpers shared by the procurement import paths.
 *
 * Lives in its own module because `index.ts` imports `fresh-alliance.ts`;
 * putting this in either would make the cycle explicit for no benefit.
 */

/**
 * SQLite caps a single statement's bound parameters
 * (`SQLITE_MAX_VARIABLE_NUMBER`, 32766 on modern builds). A `createMany`
 * covering every line of a decade-long export is far past that, so bulk writes
 * are chunked rather than trusted to fit. Sized conservatively: the widest row
 * here binds roughly 20 parameters, so 1000 rows stays an order of magnitude
 * clear of the ceiling.
 */
export const BULK_CHUNK_ROWS = 1000;

/**
 * Splits `items` into runs of at most `size`. An empty input yields no
 * batches, so `for (const batch of chunk(xs))` issues no query when there is
 * nothing to write.
 */
export const chunk = <T>(items: T[], size = BULK_CHUNK_ROWS): T[][] => {
  if (items.length === 0) return [];
  if (items.length <= size) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};
