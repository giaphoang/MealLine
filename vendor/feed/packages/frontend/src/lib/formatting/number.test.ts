// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import { formatAxisNumber, formatNumber } from './number';

/**
 * The reason this exists: `45000` and `4500` differ by one glyph inside a run
 * of zeros, and an axis of bare numbers makes a reader count digits to tell
 * forty-five thousand from forty-five hundred.
 */

describe('formatNumber', () => {
  it('separates thousands', () => {
    expect(formatNumber(8000)).toBe('8,000');
    expect(formatNumber(45000)).toBe('45,000');
    expect(formatNumber(4500)).toBe('4,500');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('leaves figures under a thousand alone', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
  });

  it('keeps one decimal place, for weights that land between pounds', () => {
    // 23,930.5 lb and 23,930.4 lb are different months; rounding to whole
    // pounds would draw them as the same figure.
    expect(formatNumber(23930.5)).toBe('23,930.5');
    expect(formatNumber(23930.44)).toBe('23,930.4');
  });

  it('pins the locale rather than following the device', () => {
    // A de-DE device renders 1.000 for one thousand under a bare
    // toLocaleString(), which would disagree with every figure rendered
    // elsewhere in the same page.
    expect(formatNumber(1000)).toBe('1,000');
  });

  it('handles a non-finite value without printing "NaN" on an axis', () => {
    expect(formatNumber(Number.NaN)).toBe('');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('formatAxisNumber', () => {
  it('formats numeric ticks', () => {
    expect(formatAxisNumber(8000)).toBe('8,000');
  });

  it('formats a numeric string, which is what some axes hand over', () => {
    expect(formatAxisNumber('8000')).toBe('8,000');
  });

  it('passes a category tick through untouched', () => {
    // Running a month name through a number formatter yields an empty label
    // and an axis of blanks — the failure mode this guard exists for.
    expect(formatAxisNumber('Jan')).toBe('Jan');
    expect(formatAxisNumber('8+')).toBe('8+');
    expect(formatAxisNumber('2026-08')).toBe('2026-08');
  });

  it('survives an absent tick', () => {
    expect(formatAxisNumber(undefined)).toBe('');
    expect(formatAxisNumber(null)).toBe('');
  });
});
