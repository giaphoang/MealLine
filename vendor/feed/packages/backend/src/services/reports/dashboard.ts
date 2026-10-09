// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import prisma from '../../db';
import {
  buildInventoryOutlook,
  buildReplenishment,
  computeItemOutlooks,
  loadAnalyticsContext,
} from '../inventory-analytics';
import type { AnalyticsFilters } from '../inventory-analytics/data';
import type { ResolvedRange } from '../inventory-analytics/timezone';

export interface DashboardSnapshot {
  overview: {
    categories: { total: number; noLimitPercentage: number };
    foodItems: { total: number; inStock: number; inStockPercentage: number };
    languages: { total: number; active: number };
    translations: { total: number; successRate: number; languageCount: number };
  };
  inventoryStatus: Array<{ status: string; itemCount: number }>;
  categoryDistribution: Array<{ categoryId: number; categoryName: string; itemCount: number }>;
  translationSuccess: { completed: number; pending: number; failed: number; total: number };
  logistics: {
    projectedStockouts: number;
    quantityCoveragePercent: number | null;
    quantityKnownItems: number;
    totalItems: number;
    medianDaysOfCover: number | null;
    coverReadyItems: number;
    knownReplenishmentCostCents: number;
    donatedDemandItems: number;
    unknownCostDemandItems: number;
  };
  dataAsOf: string;
}

export async function buildDashboardSnapshot(options: {
  range: ResolvedRange;
  filters?: AnalyticsFilters;
  asOf?: Date;
}): Promise<DashboardSnapshot> {
  const asOf = options.asOf ?? new Date();
  const [context, categoryTotals, languageTotals, translationRows] = await Promise.all([
    loadAnalyticsContext({
      range: options.range,
      horizonDays: 30,
      filters: options.filters,
      asOf,
    }),
    Promise.all([
      prisma.category.count(),
      prisma.category.count({ where: { limit: 100 } }),
    ]),
    Promise.all([
      prisma.language.count(),
      prisma.language.count({ where: { isEnabled: true } }),
    ]),
    prisma.translation.findMany({
      select: { status: true, language: true },
    }),
  ]);

  const items = computeItemOutlooks(context);
  const outlook = buildInventoryOutlook(context, items);
  const replenishment = buildReplenishment(context, items);
  const inStock = items.filter((item) => item.isInStock).length;

  const inventoryStatus = new Map<string, number>([
    ['In Stock', 0],
    ['Out of Stock', 0],
    ['Limited', 0],
    ['Clearance', 0],
  ]);
  for (const item of context.liveItems) {
    const status = !item.isInStock
      ? 'Out of Stock'
      : item.isLimited
        ? 'Limited'
        : item.isClearance
          ? 'Clearance'
          : 'In Stock';
    inventoryStatus.set(status, (inventoryStatus.get(status) ?? 0) + 1);
  }

  const categories = new Map<number, { categoryId: number; categoryName: string; itemCount: number }>();
  for (const item of context.liveItems) {
    const row = categories.get(item.categoryId) ?? {
      categoryId: item.categoryId,
      categoryName: item.category.name,
      itemCount: 0,
    };
    row.itemCount += 1;
    categories.set(item.categoryId, row);
  }

  const completed = translationRows.filter((row) => row.status === 'completed').length;
  const failed = translationRows.filter((row) => row.status === 'failed').length;
  const pending = translationRows.length - completed - failed;
  const languagesWithTranslations = new Set(translationRows.map((row) => row.language)).size;
  const unknownCostDemandItems = replenishment.plan.filter(
    (row) => (row.requiredUnits ?? 0) > 0 && row.priceType === 'unknown'
  ).length;

  return {
    overview: {
      categories: {
        total: categoryTotals[0],
        noLimitPercentage: categoryTotals[0] > 0
          ? (categoryTotals[1] / categoryTotals[0]) * 100
          : 0,
      },
      foodItems: {
        total: items.length,
        inStock,
        inStockPercentage: items.length > 0 ? (inStock / items.length) * 100 : 0,
      },
      languages: { total: languageTotals[0], active: languageTotals[1] },
      translations: {
        total: translationRows.length,
        successRate: translationRows.length > 0
          ? (completed / translationRows.length) * 100
          : 0,
        languageCount: languagesWithTranslations,
      },
    },
    inventoryStatus: [...inventoryStatus].map(([status, itemCount]) => ({ status, itemCount })),
    categoryDistribution: [...categories.values()].sort(
      (a, b) => b.itemCount - a.itemCount || a.categoryName.localeCompare(b.categoryName)
    ),
    translationSuccess: { completed, pending, failed, total: translationRows.length },
    logistics: {
      projectedStockouts: outlook.kpis.projectedStockoutsWithinHorizon,
      quantityCoveragePercent: items.length > 0
        ? (outlook.kpis.itemsWithKnownQuantity / items.length) * 100
        : null,
      quantityKnownItems: outlook.kpis.itemsWithKnownQuantity,
      totalItems: items.length,
      medianDaysOfCover: outlook.kpis.medianDaysOfCover,
      coverReadyItems: outlook.kpis.itemsWithComputableCover,
      knownReplenishmentCostCents: replenishment.kpis.knownSpendCents,
      donatedDemandItems: replenishment.kpis.donatedDemandItems,
      unknownCostDemandItems,
    },
    dataAsOf: asOf.toISOString(),
  };
}
