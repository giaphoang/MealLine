// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Translation usage warning thresholds
 */
export const TRANSLATION_THRESHOLDS = {
  // Performance thresholds
  MAX_RESPONSE_TIME: 10000,    // 10 seconds
  SLOW_RESPONSE_TIME: 5000,    // 5 seconds
} as const;

/**
 * Alert levels for usage monitoring
 */
export const ALERT_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const;

/**
 * Message templates for alerts
 */
export const ALERT_MESSAGES = {
  SLOW_RESPONSE: (time: number) =>
    `Slow translation response time: ${(time / 1000).toFixed(1)}s`,
} as const;
