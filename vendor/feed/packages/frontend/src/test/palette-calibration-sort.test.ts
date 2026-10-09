// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, it } from 'vitest';

import { sortByDrift, type SortMode } from '@/components/palette-calibration';

const rows = [
  { key: 'a', drift: 0.02 },
  { key: 'b', drift: 0.10 },
  { key: 'c', drift: Number.NaN },
  { key: 'd', drift: 0.05 },
];
const driftOf = (row: (typeof rows)[number]) => row.drift;
const keys = (mode: SortMode) => sortByDrift(rows, mode, driftOf).map(r => r.key);

describe('calibration ordering', () => {
  it('leaves source order untouched', () => {
    expect(keys('order')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('orders highest deviation first', () => {
    expect(keys('drift-desc')).toEqual(['b', 'd', 'a', 'c']);
  });

  it('orders lowest deviation first', () => {
    expect(keys('drift-asc')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('sorts an uncomputable drift last in both directions, never mid-list', () => {
    // NaN compares false against everything, so an unguarded comparator leaves
    // the array in arbitrary order rather than obviously wrong order.
    expect(keys('drift-desc').at(-1)).toBe('c');
    expect(keys('drift-asc').at(-1)).toBe('c');
  });

  it('does not mutate the input', () => {
    const before = rows.map(r => r.key);
    sortByDrift(rows, 'drift-desc', driftOf);
    expect(rows.map(r => r.key)).toEqual(before);
  });
});
