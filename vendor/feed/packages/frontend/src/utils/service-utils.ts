// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { ServiceProvider, SERVICE_COLORS } from '@/types/multi-service-usage';

/**
 * Get service-specific display color
 */
export function getServiceColor(serviceType: ServiceProvider): string {
  return SERVICE_COLORS[serviceType];
}

/**
 * Format cost with consistent thousandth precision for alignment
 * Shows costs to thousandth ($0.001) with rounding, "< $0.001" for smaller values
 */
export function formatServiceCost(cost: number): string {
  // For values less than a thousandth, show "< $0.001"
  if (cost < 0.001) {
    return '< $0.001';
  }
  
  // For values $0.001 and above, show to thousandth with rounding
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  }).format(cost);
}

/**
 * Format large numbers with K/M suffixes
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}
