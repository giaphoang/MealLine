// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Inventory Outlook tab (Reports initiative §2). Forward-looking, so only
 * live items appear; burn history comes from the shared ledger context.
 */

import {
  computeBurn,
  daysOfCover,
  median,
  priceTypeOf,
  projectedCostCents,
  purchasesNeeded,
  requiredUnits,
  weeklyBurn,
  PriceType,
} from './calculations';
import {
  AnalyticsContext,
  ItemTimeline,
  quantityObservations,
} from './data';

const MS_PER_DAY = 86_400_000;

export interface ItemOutlook {
  foodItemId: number;
  name: string;
  categoryId: number;
  categoryName: string;
  isInStock: boolean;
  estimatedQuantity: number | null;
  priceType: PriceType;
  purchasePriceCents: number | null;
  unitsPerPurchase: number;
  dailyBurn: number | null;
  weeklyBurn: number | null;
  daysOfCover: number | null;
  projectedStockoutAt: string | null;
  requiredUnits: number | null;
  purchasesNeeded: number | null;
  projectedCostCents: number | null;
  dataStatus: 'ok' | 'unknown-quantity' | 'insufficient-history' | 'out-of-stock';
}

export interface DaysOfCoverBand {
  band: string;
  itemCount: number;
}

export interface StockoutTimelineBucket {
  weekStart: string;
  itemCount: number;
  itemNames: string[];
}

export interface InventoryOutlookKpis {
  totalItems: number;
  inStockItems: number;
  outOfStockItems: number;
  availabilityPercent: number | null;
  itemsWithKnownQuantity: number;
  itemsWithComputableCover: number;
  medianDaysOfCover: number | null;
  projectedStockoutsWithinHorizon: number;
  horizonDays: number;
}

export interface InventoryOutlookResult {
  kpis: InventoryOutlookKpis;
  daysOfCoverBands: DaysOfCoverBand[];
  stockoutTimeline: StockoutTimelineBucket[];
  items: ItemOutlook[];
  dataAsOf: string;
}

export const DAYS_OF_COVER_BANDS = [
  { band: '0–7 days', min: 0, max: 7 },
  { band: '8–14 days', min: 7, max: 14 },
  { band: '15–30 days', min: 14, max: 30 },
  { band: '31–60 days', min: 30, max: 60 },
  { band: '60+ days', min: 60, max: Infinity },
] as const;

/**
 * Per-item outlook rows for every live item in the context. Shared by the
 * Inventory Outlook, Replenishment Planning, and Data Coverage tabs.
 */
export function computeItemOutlooks(context: AnalyticsContext): ItemOutlook[] {
  const liveTimelines = context.timelines.filter(
    (timeline): timeline is ItemTimeline & { liveItem: NonNullable<ItemTimeline['liveItem']> } =>
      timeline.isLive && timeline.liveItem !== null
  );

  return liveTimelines.map((timeline) => {
    const item = timeline.liveItem;
    const burn = computeBurn(quantityObservations(timeline, context.range));
    const daily = burn.dailyBurn;
    const quantity = item.estimatedQuantity;
    const cover = daysOfCover(quantity, daily);
    const required = requiredUnits(daily, context.horizonDays, quantity);
    // Prototype calculator is retained dormant while operational reports are
    // rebuilt. Its former package/cost inputs no longer exist on FoodItem.
    const purchases = purchasesNeeded(required, 1);
    const cost = projectedCostCents(purchases, null);

    let dataStatus: ItemOutlook['dataStatus'] = 'ok';
    if (!item.isInStock) dataStatus = 'out-of-stock';
    else if (quantity === null) dataStatus = 'unknown-quantity';
    else if (daily === null) dataStatus = 'insufficient-history';

    return {
      foodItemId: item.id,
      name: item.name,
      categoryId: item.categoryId,
      categoryName: item.category.name,
      isInStock: item.isInStock,
      estimatedQuantity: quantity,
      priceType: priceTypeOf(null),
      purchasePriceCents: null,
      unitsPerPurchase: 1,
      dailyBurn: daily,
      weeklyBurn: weeklyBurn(daily),
      daysOfCover: cover,
      projectedStockoutAt:
        cover !== null && item.isInStock
          ? new Date(context.asOf.getTime() + cover * MS_PER_DAY).toISOString()
          : null,
      requiredUnits: required,
      purchasesNeeded: purchases,
      projectedCostCents: cost,
      dataStatus,
    };
  });
}

export function buildInventoryOutlook(
  context: AnalyticsContext,
  precomputedItems?: ItemOutlook[]
): InventoryOutlookResult {
  const items = precomputedItems ?? computeItemOutlooks(context);
  const { horizonDays, asOf } = context;

  // KPIs — counts and medians only; never summed unlike quantities.
  const inStock = items.filter((item) => item.isInStock);
  const covers = inStock
    .map((item) => item.daysOfCover)
    .filter((value): value is number => value !== null);
  const projectedOut = inStock.filter(
    (item) => item.daysOfCover !== null && item.daysOfCover <= horizonDays
  );

  const kpis: InventoryOutlookKpis = {
    totalItems: items.length,
    inStockItems: inStock.length,
    outOfStockItems: items.length - inStock.length,
    availabilityPercent:
      items.length > 0 ? (inStock.length / items.length) * 100 : null,
    itemsWithKnownQuantity: items.filter(
      (item) => item.estimatedQuantity !== null
    ).length,
    itemsWithComputableCover: covers.length,
    medianDaysOfCover: median(covers),
    projectedStockoutsWithinHorizon: projectedOut.length,
    horizonDays,
  };

  // Chart 1: days-of-cover bands (plus explicit Unknown band). Bands are
  // (min, max] except the first, which includes 0.
  const bands: DaysOfCoverBand[] = DAYS_OF_COVER_BANDS.map(({ band, min, max }) => ({
    band,
    itemCount: covers.filter(
      (value) => (min === 0 ? value >= 0 : value > min) && value <= max
    ).length,
  }));
  bands.push({ band: 'Unknown', itemCount: inStock.length - covers.length });

  // Chart 2: projected stockout timeline, bucketed by week within horizon.
  const weeks = Math.max(1, Math.ceil(horizonDays / 7));
  const stockoutTimeline: StockoutTimelineBucket[] = [];
  for (let week = 0; week < weeks; week++) {
    const bucketItems = projectedOut.filter(
      (item) =>
        item.daysOfCover !== null &&
        item.daysOfCover > week * 7 &&
        item.daysOfCover <= (week + 1) * 7
    );
    const weekStartInstant = new Date(asOf.getTime() + week * 7 * MS_PER_DAY);
    stockoutTimeline.push({
      weekStart: weekStartInstant.toISOString().slice(0, 10),
      itemCount: bucketItems.length,
      itemNames: bucketItems.map((item) => item.name).sort(),
    });
  }

  return {
    kpis,
    daysOfCoverBands: bands,
    stockoutTimeline,
    items,
    dataAsOf: asOf.toISOString(),
  };
}
