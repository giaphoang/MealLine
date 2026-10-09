// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import { trimSeriesToData } from '@/lib/chart-series';

/**
 * The distinction this exists to keep: a zero inside a series' life is a real
 * observation, and a zero outside it is an absence being drawn as a fact.
 *
 * Procurement payloads are a dense grid — every month carries every key,
 * defaulted to zero — because Recharts bridges a missing key and invents a
 * delivery. That default runs a partner who stopped delivering in May along
 * the axis for every month since, which reads as "we received nothing from
 * them" rather than "they were not a partner then".
 */

const rows = [
  { month: '2023-01', ended: 10, started: 0, always: 5 },
  { month: '2023-02', ended: 0, started: 0, always: 0 },
  { month: '2023-03', ended: 4, started: 0, always: 7 },
  { month: '2023-04', ended: 0, started: 8, always: 2 },
  { month: '2023-05', ended: 0, started: 3, always: 6 },
];

describe('trimSeriesToData', () => {
  it('ends a series at its last real value', () => {
    const [, , , april, may] = trimSeriesToData(rows, ['ended']);
    expect(april.ended).toBeNull();
    expect(may.ended).toBeNull();
  });

  it('starts a series at its first real value', () => {
    const [january, february] = trimSeriesToData(rows, ['started']);
    expect(january.started).toBeNull();
    expect(february.started).toBeNull();
  });

  it('keeps a zero between two real values, because that one happened', () => {
    // February is inside both series' lives: the partner was active and
    // delivered nothing. Nulling it would bridge the gap and draw a delivery.
    const trimmed = trimSeriesToData(rows, ['ended', 'always']);
    expect(trimmed[1].ended).toBe(0);
    expect(trimmed[1].always).toBe(0);
  });

  it('leaves a series that spans the whole range untouched', () => {
    const trimmed = trimSeriesToData(rows, ['always']);
    expect(trimmed.map(row => row.always)).toEqual([5, 0, 7, 2, 6]);
  });

  it('nulls a series with nothing in range end to end', () => {
    const empty = rows.map(row => ({ ...row, ended: 0 }));
    expect(trimSeriesToData(empty, ['ended']).every(row => row.ended === null)).toBe(true);
  });

  it('does not mutate the rows it was given', () => {
    const original = rows.map(row => ({ ...row }));
    trimSeriesToData(rows, ['ended', 'started', 'always']);
    expect(rows).toEqual(original);
  });

  it('handles an empty range without throwing', () => {
    expect(trimSeriesToData([], ['ended'])).toEqual([]);
  });
});
