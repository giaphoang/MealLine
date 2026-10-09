// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, test, expect } from 'vitest';
import {
  parseCurrencyToCents,
  formatCentsAsCurrencyText,
  formatCentsAsUsd,
  deriveUnitCostCents,
  formatUnitCostForDisplay,
} from './currency';

describe('parseCurrencyToCents', () => {
  test('parses string representations directly to integer cents', () => {
    expect(parseCurrencyToCents('12.34')).toBe(1234);
    expect(parseCurrencyToCents('12.3')).toBe(1230);
    expect(parseCurrencyToCents('12')).toBe(1200);
    expect(parseCurrencyToCents('$4.99')).toBe(499);
    expect(parseCurrencyToCents('0.00')).toBe(0);
    expect(parseCurrencyToCents('0')).toBe(0);
    // The classic float trap: 10.28 * 100 === 1027.999... — string parsing
    // must be immune to it.
    expect(parseCurrencyToCents('10.28')).toBe(1028);
  });

  test('blank means Unknown (null); invalid means undefined', () => {
    expect(parseCurrencyToCents('')).toBeNull();
    expect(parseCurrencyToCents('   ')).toBeNull();
    expect(parseCurrencyToCents('12.345')).toBeUndefined();
    expect(parseCurrencyToCents('abc')).toBeUndefined();
    expect(parseCurrencyToCents('-5')).toBeUndefined();
    expect(parseCurrencyToCents('12.')).toBeUndefined();
  });
});

describe('formatting', () => {
  test('formats cents as text and USD', () => {
    expect(formatCentsAsCurrencyText(1234)).toBe('12.34');
    expect(formatCentsAsCurrencyText(0)).toBe('0.00');
    expect(formatCentsAsCurrencyText(5)).toBe('0.05');
    expect(formatCentsAsUsd(1234)).toBe('$12.34');
  });
});

describe('unit cost derivation', () => {
  test('$100 ÷ 50 = $2/unit (spec formula check)', () => {
    expect(deriveUnitCostCents(10000, 50)).toBe(200);
    expect(formatUnitCostForDisplay(10000, 50)).toBe('$2.00');
  });

  test('keeps full precision internally, rounds for display only', () => {
    expect(deriveUnitCostCents(200, 3)).toBeCloseTo(66.666, 2);
    expect(formatUnitCostForDisplay(200, 3)).toBe('$0.67');
  });

  test('unknown price yields unknown unit cost', () => {
    expect(deriveUnitCostCents(null, 10)).toBeNull();
    expect(formatUnitCostForDisplay(null, 10)).toBeNull();
  });

  test('donated/free stays $0.00, distinct from Unknown', () => {
    expect(deriveUnitCostCents(0, 12)).toBe(0);
    expect(formatUnitCostForDisplay(0, 12)).toBe('$0.00');
  });
});
