// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Replenishment Planning tab (Reports initiative §2). Purchases are whole
 * packages; spend aggregates are dollars (a valid aggregate). Donated and
 * unknown-cost demand stay separate from the known-spend subtotal.
 */

import { AnalyticsContext } from './data';
import { computeItemOutlooks, ItemOutlook } from './outlook';

export interface ReplenishmentPlanRow {
  foodItemId: number;
  name: string;
  categoryName: string;
  isInStock: boolean;
  estimatedQuantity: number | null;
  dailyBurn: number | null;
  daysOfCover: number | null;
  requiredUnits: number | null;
  unitsPerPurchase: number;
  purchasesNeeded: number | null;
  priceType: ItemOutlook['priceType'];
  purchasePriceCents: number | null;
  projectedCostCents: number | null;
  /** What prevents a complete plan row, when something does. */
  missingInputs: ('quantity' | 'burn-history' | 'price')[];
}

export interface ReorderPriorityRow {
  foodItemId: number;
  name: string;
  isInStock: boolean;
  daysOfCover: number | null;
  requiredUnits: number | null;
  purchasesNeeded: number | null;
}

export interface CategorySpendRow {
  categoryId: number;
  categoryName: string;
  knownSpendCents: number;
  paidItems: number;
  donatedItems: number;
  unknownCostItems: number;
}

export interface ReplenishmentKpis {
  horizonDays: number;
  itemsNeedingPurchase: number;
  urgentItems: number;
  knownSpendCents: number;
  donatedDemandItems: number;
  missingInputItems: number;
}

export interface ReplenishmentResult {
  kpis: ReplenishmentKpis;
  reorderPriority: ReorderPriorityRow[];
  spendByCategory: CategorySpendRow[];
  plan: ReplenishmentPlanRow[];
  dataAsOf: string;
}

const PRIORITY_ROW_LIMIT = 10;
const URGENT_COVER_DAYS = 7;

export function buildReplenishment(
  context: AnalyticsContext,
  precomputedItems?: ItemOutlook[]
): ReplenishmentResult {
  const items = precomputedItems ?? computeItemOutlooks(context);

  const plan: ReplenishmentPlanRow[] = items.map((item) => {
    const missingInputs: ReplenishmentPlanRow['missingInputs'] = [];
    if (item.estimatedQuantity === null) missingInputs.push('quantity');
    if (item.dailyBurn === null) missingInputs.push('burn-history');
    if (item.priceType === 'unknown') missingInputs.push('price');
    return {
      foodItemId: item.foodItemId,
      name: item.name,
      categoryName: item.categoryName,
      isInStock: item.isInStock,
      estimatedQuantity: item.estimatedQuantity,
      dailyBurn: item.dailyBurn,
      daysOfCover: item.daysOfCover,
      requiredUnits: item.requiredUnits,
      unitsPerPurchase: item.unitsPerPurchase,
      purchasesNeeded: item.purchasesNeeded,
      priceType: item.priceType,
      purchasePriceCents: item.purchasePriceCents,
      projectedCostCents: item.projectedCostCents,
      missingInputs,
    };
  });

  // The plan surfaces items that need purchases first (soonest stockout at
  // the top), then incomplete rows so the gaps stay visible, then the rest.
  plan.sort((a, b) => {
    const aNeeds = !a.isInStock ? 0 : (a.requiredUnits ?? 0) > 0 ? 1 : a.missingInputs.length > 0 ? 2 : 3;
    const bNeeds = !b.isInStock ? 0 : (b.requiredUnits ?? 0) > 0 ? 1 : b.missingInputs.length > 0 ? 2 : 3;
    if (aNeeds !== bNeeds) return aNeeds - bNeeds;
    const aCover = a.daysOfCover ?? Infinity;
    const bCover = b.daysOfCover ?? Infinity;
    return aCover - bCover || a.name.localeCompare(b.name);
  });

  const needingPurchase = items.filter(
    (item) => !item.isInStock || (item.requiredUnits ?? 0) > 0
  );

  // Chart 1: reorder priority — out-of-stock items remain visible even
  // when missing burn history prevents a numeric reorder calculation.
  const reorderPriority: ReorderPriorityRow[] = needingPurchase
    .sort((a, b) => {
      if (a.isInStock !== b.isInStock) return a.isInStock ? 1 : -1;
      return (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity) ||
        a.name.localeCompare(b.name);
    })
    .slice(0, PRIORITY_ROW_LIMIT)
    .map((item) => ({
      foodItemId: item.foodItemId,
      name: item.name,
      isInStock: item.isInStock,
      daysOfCover: item.daysOfCover,
      requiredUnits: item.requiredUnits,
      purchasesNeeded: item.purchasesNeeded,
    }));

  // Chart 2: projected paid spend by category (dollars aggregate).
  const spendByCategory = new Map<number, CategorySpendRow>();
  for (const item of needingPurchase.filter((candidate) => candidate.requiredUnits !== null)) {
    const row = spendByCategory.get(item.categoryId) ?? {
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      knownSpendCents: 0,
      paidItems: 0,
      donatedItems: 0,
      unknownCostItems: 0,
    };
    if (item.priceType === 'paid' && item.projectedCostCents !== null) {
      row.knownSpendCents += item.projectedCostCents;
      row.paidItems += 1;
    } else if (item.priceType === 'donated') {
      row.donatedItems += 1;
    } else {
      row.unknownCostItems += 1;
    }
    spendByCategory.set(item.categoryId, row);
  }

  const kpis: ReplenishmentKpis = {
    horizonDays: context.horizonDays,
    itemsNeedingPurchase: needingPurchase.length,
    urgentItems: items.filter(
      (item) =>
        !item.isInStock ||
        (item.daysOfCover !== null && item.daysOfCover <= URGENT_COVER_DAYS)
    ).length,
    knownSpendCents: needingPurchase.reduce(
      (sum, item) =>
        item.priceType === 'paid' && item.projectedCostCents !== null
          ? sum + item.projectedCostCents
          : sum,
      0
    ),
    donatedDemandItems: needingPurchase.filter(
      (item) => item.requiredUnits !== null && item.priceType === 'donated'
    ).length,
    missingInputItems: plan.filter((row) => row.missingInputs.length > 0)
      .length,
  };

  return {
    kpis,
    reorderPriority,
    spendByCategory: [...spendByCategory.values()].sort(
      (a, b) => b.knownSpendCents - a.knownSpendCents
    ),
    plan,
    dataAsOf: context.asOf.toISOString(),
  };
}
