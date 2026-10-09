// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { formatServiceCost } from './service-utils';

export function formatCostWithCents(
  value: number,
  options: { useCents?: boolean; threshold?: number } = {}
): string {
  const threshold = options.threshold ?? 0.10;
  const shouldUseCents = options.useCents ?? value < threshold;

  if (shouldUseCents) {
    return `${(value * 100).toFixed(3)}¢`;
  }

  return formatServiceCost(value);
}
