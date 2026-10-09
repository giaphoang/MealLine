// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

export const TOKEN_LIMITS = {
  // Application-level request protection. Provider/account allowances live
  // on AIConfiguration and are never converted into daily token budgets.
  RATE_LIMITS: {
    RPM: 500,              // 500 requests per minute
    RPD: 10_000,           // 10,000 requests per day
    TPM: 200_000,          // 200,000 tokens per minute
    WINDOW_MS: 60_000      // 1 minute window
  }
} as const;

/**
 * Determines if an operation would exceed token limits
 */
export function wouldExceedLimit(
  current: number,
  additional: number,
  limit: number
): boolean {
  return (current + additional) > limit;
}
