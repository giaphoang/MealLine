// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { TabResults } from '../inventory-analytics';
import { ReportCardOptions } from './card-registry';

/** Applies presentation-only card options without changing canonical math. */
export function applyCardOptions(
  tabs: Partial<TabResults>,
  options: Record<string, ReportCardOptions>
): Partial<TabResults> {
  const next: Partial<TabResults> = { ...tabs };
  const limit = (cardId: string) => options[cardId]?.maxRows ?? 10;

  if (next['unit-prices']) {
    next['unit-prices'] = {
      ...next['unit-prices'],
      unitCostChanges: next['unit-prices'].unitCostChanges.slice(
        0,
        limit('unit-prices-cost-trends')
      ),
      costImpacts: next['unit-prices'].costImpacts.slice(
        0,
        limit('unit-prices-cost-impact')
      ),
    };
  }
  if (next.scarcity) {
    next.scarcity = {
      ...next.scarcity,
      stockoutFrequency: next.scarcity.stockoutFrequency.slice(
        0,
        limit('scarcity-stockout-frequency')
      ),
    };
  }
  if (next.replenishment) {
    next.replenishment = {
      ...next.replenishment,
      reorderPriority: next.replenishment.reorderPriority.slice(
        0,
        limit('replenishment-reorder-priority')
      ),
    };
  }
  return next;
}
