// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Unit Prices tab (Reports initiative §2). Cost outlook uses demand ×
 * latest positive paid cost compared with the preceding positive paid
 * cost. Donated/free and unknown-cost supply stay separate; no linear
 * price extrapolation in V1. Unit costs keep full precision (cents may be
 * fractional); currency display rounds at the edge.
 */

import { deriveUnitCostCents } from '../../utils/unit-cost';
import { priceTypeOf, PriceType } from './calculations';
import { AnalyticsContext, pricePoints } from './data';
import { computeItemOutlooks, ItemOutlook } from './outlook';

export interface PriceHistoryRow {
  at: string;
  sourceFoodItemId: number;
  itemName: string;
  categoryName: string;
  eventKind: string;
  purchasePriceCents: number | null;
  unitsPerPurchase: number;
  unitCostCents: number | null;
  priceType: PriceType;
  previousUnitCostCents: number | null;
  changeCents: number | null;
  isLive: boolean;
}

export interface UnitCostChangeRow {
  sourceFoodItemId: number;
  itemName: string;
  latestUnitCostCents: number;
  previousUnitCostCents: number;
  changeCents: number;
  changePercent: number;
  changedAt: string;
}

export interface CostImpactRow {
  sourceFoodItemId: number;
  itemName: string;
  projectedDemandUnits: number;
  latestUnitCostCents: number;
  previousUnitCostCents: number;
  impactCents: number;
}

export interface UnitPricesKpis {
  totalItems: number;
  paidItems: number;
  donatedItems: number;
  unknownPriceItems: number;
  priceChangesInRange: number;
  itemsWithPriceChangeInRange: number;
  horizonDays: number;
}

export interface UnitPricesResult {
  kpis: UnitPricesKpis;
  unitCostChanges: UnitCostChangeRow[];
  costImpacts: CostImpactRow[];
  priceHistory: PriceHistoryRow[];
  dataAsOf: string;
}

const CHART_ROW_LIMIT = 8;

/** Paid (positive-cost) unit-cost sequence for one timeline, ascending. */
function paidUnitCosts(
  timeline: AnalyticsContext['timelines'][number]
): { at: Date; unitCostCents: number }[] {
  return pricePoints(timeline)
    .filter(
      (point) =>
        point.purchasePriceCents !== null && point.purchasePriceCents > 0
    )
    .map((point) => ({
      at: point.at,
      unitCostCents: deriveUnitCostCents(
        point.purchasePriceCents,
        point.unitsPerPurchase
      ) as number,
    }));
}

export function buildUnitPrices(
  context: AnalyticsContext,
  precomputedItems?: ItemOutlook[]
): UnitPricesResult {
  const items = precomputedItems ?? computeItemOutlooks(context);
  const outlookBySource = new Map(items.map((item) => [item.foodItemId, item]));
  const { range } = context;

  // Price history detail: in-range price-recording events across live AND
  // deleted items, with per-item previous-unit-cost deltas (same price
  // type only — a paid→donated flip is a change of kind, not a delta).
  const priceHistory: PriceHistoryRow[] = [];
  const unitCostChanges: UnitCostChangeRow[] = [];
  const costImpacts: CostImpactRow[] = [];
  let priceChangesInRange = 0;
  const itemsChanged = new Set<number>();

  for (const timeline of context.timelines) {
    const points = pricePoints(timeline);
    let previousUnitCost: number | null = null;
    let previousType: PriceType | null = null;

    for (const point of points) {
      const unitCost = deriveUnitCostCents(
        point.purchasePriceCents,
        point.unitsPerPurchase
      );
      const type = priceTypeOf(point.purchasePriceCents);
      const inRange = point.at >= range.startUtc;

      if (inRange) {
        if (point.eventKind === 'updated') {
          priceChangesInRange += 1;
          itemsChanged.add(timeline.sourceFoodItemId);
        }
        priceHistory.push({
          at: point.at.toISOString(),
          sourceFoodItemId: timeline.sourceFoodItemId,
          itemName: timeline.name,
          categoryName: timeline.categoryName,
          eventKind: point.eventKind,
          purchasePriceCents: point.purchasePriceCents,
          unitsPerPurchase: point.unitsPerPurchase,
          unitCostCents: unitCost,
          priceType: type,
          previousUnitCostCents:
            previousType === type ? previousUnitCost : null,
          changeCents:
            previousType === type &&
            previousUnitCost !== null &&
            unitCost !== null
              ? unitCost - previousUnitCost
              : null,
          isLive: timeline.isLive,
        });
      }

      previousUnitCost = unitCost;
      previousType = type;
    }

    // Chart rows use positive paid costs only (spec: cost outlook compares
    // the latest positive paid cost with the preceding one).
    const paid = paidUnitCosts(timeline);
    if (paid.length >= 2) {
      const latest = paid[paid.length - 1];
      const preceding = paid[paid.length - 2];
      if (latest.at >= range.startUtc && timeline.isLive) {
        const changeCents = latest.unitCostCents - preceding.unitCostCents;
        if (changeCents !== 0) {
          unitCostChanges.push({
            sourceFoodItemId: timeline.sourceFoodItemId,
            itemName: timeline.name,
            latestUnitCostCents: latest.unitCostCents,
            previousUnitCostCents: preceding.unitCostCents,
            changeCents,
            changePercent: (changeCents / preceding.unitCostCents) * 100,
            changedAt: latest.at.toISOString(),
          });
        }
      }

      const outlook = outlookBySource.get(timeline.sourceFoodItemId);
      const demand =
        outlook?.dailyBurn != null
          ? outlook.dailyBurn * context.horizonDays
          : null;
      if (demand !== null && timeline.isLive) {
        const impactCents =
          demand * (latest.unitCostCents - preceding.unitCostCents);
        if (impactCents !== 0) {
          costImpacts.push({
            sourceFoodItemId: timeline.sourceFoodItemId,
            itemName: timeline.name,
            projectedDemandUnits: demand,
            latestUnitCostCents: latest.unitCostCents,
            previousUnitCostCents: preceding.unitCostCents,
            impactCents,
          });
        }
      }
    }
  }

  priceHistory.sort((a, b) => b.at.localeCompare(a.at));
  unitCostChanges.sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)
  );
  costImpacts.sort((a, b) => Math.abs(b.impactCents) - Math.abs(a.impactCents));

  const kpis: UnitPricesKpis = {
    totalItems: items.length,
    paidItems: items.filter((item) => item.priceType === 'paid').length,
    donatedItems: items.filter((item) => item.priceType === 'donated').length,
    unknownPriceItems: items.filter((item) => item.priceType === 'unknown')
      .length,
    priceChangesInRange,
    itemsWithPriceChangeInRange: itemsChanged.size,
    horizonDays: context.horizonDays,
  };

  return {
    kpis,
    unitCostChanges: unitCostChanges.slice(0, CHART_ROW_LIMIT),
    costImpacts: costImpacts.slice(0, CHART_ROW_LIMIT),
    priceHistory,
    dataAsOf: context.asOf.toISOString(),
  };
}
