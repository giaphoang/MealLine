// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, it, expect } from 'vitest';
import {
  computeMessageDuration,
  MIN_MESSAGE_DURATION_MS,
  MAX_MESSAGE_DURATION_MS,
} from '@/services/message/types';

// ISSUES.md #44: length-aware toast duration = chars × 50ms × 3 reads,
// clamped to [3s, 12s].
describe('computeMessageDuration', () => {
  it('floors short messages at the 3s minimum', () => {
    // "Marked in stock." = 16 chars → 16×150 = 2400ms → clamped up to 3000.
    expect(computeMessageDuration('Marked in stock.')).toBe(MIN_MESSAGE_DURATION_MS);
    expect(computeMessageDuration('')).toBe(MIN_MESSAGE_DURATION_MS);
    expect(computeMessageDuration('OK')).toBe(MIN_MESSAGE_DURATION_MS);
  });

  it('scales linearly with length in the mid-range', () => {
    // 28 chars × 150 = 4200ms.
    expect(computeMessageDuration('a'.repeat(28))).toBe(4200);
    // 65 chars × 150 = 9750ms.
    expect(computeMessageDuration('a'.repeat(65))).toBe(9750);
  });

  it('caps long messages at the 12s maximum', () => {
    // 80 chars × 150 = 12000ms (exactly the cap).
    expect(computeMessageDuration('a'.repeat(80))).toBe(MAX_MESSAGE_DURATION_MS);
    // Anything longer stays clamped at the cap.
    expect(computeMessageDuration('a'.repeat(500))).toBe(MAX_MESSAGE_DURATION_MS);
  });

  it('ignores surrounding whitespace when measuring length', () => {
    expect(computeMessageDuration('   Marked in stock.   ')).toBe(MIN_MESSAGE_DURATION_MS);
  });

  it('treats non-string input as empty (min duration)', () => {
    expect(computeMessageDuration(undefined as unknown as string)).toBe(MIN_MESSAGE_DURATION_MS);
    expect(computeMessageDuration(null as unknown as string)).toBe(MIN_MESSAGE_DURATION_MS);
  });
});
