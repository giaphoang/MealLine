// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * CSV serialization for report cards (Reports initiative §3).
 *
 * Rules: UTF-8 BOM, RFC 4180 quoting, CRLF line endings, rectangular
 * schemas, raw numeric values, ISO timestamps, unknown values blank,
 * donated costs numeric 0 with an explicit price-type column, and
 * spreadsheet-formula-injection protection. An empty dataset still emits
 * its header row.
 */

import { TabResults } from '../inventory-analytics';
import { getReportCard } from './card-registry';
import type { DashboardSnapshot } from './dashboard';

export type CsvValue = string | number | boolean | null | undefined;

const BOM = '\uFEFF';
const CRLF = '\r\n';

/** Characters that can trigger formula evaluation in spreadsheet apps. */
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

function serializeValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  let text = value;
  // Formula-injection protection: neutralize a leading trigger character
  // with a single-quote prefix (the value stays readable in spreadsheets).
  if (text.length > 0 && FORMULA_TRIGGERS.has(text[0])) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(serializeValue).join(',')];
  for (const row of rows) {
    if (row.length !== headers.length) {
      throw new Error(
        `CSV row width ${row.length} does not match header width ${headers.length}`
      );
    }
    lines.push(row.map(serializeValue).join(','));
  }
  return BOM + lines.join(CRLF) + CRLF;
}

/** Full-precision analytics numbers, trimmed of float noise; nulls blank. */
const num = (value: number | null): number | null =>
  value === null ? null : Number(value.toFixed(4));

export interface CardCsv {
  headers: string[];
  rows: CsvValue[][];
}

function requireTab<K extends keyof TabResults>(
  tabs: Partial<TabResults>,
  tab: K,
  cardId: string
): TabResults[K] {
  const result = tabs[tab];
  if (!result) {
    throw new Error(`Missing ${tab} data for report card ${cardId}`);
  }
  return result as TabResults[K];
}

/**
 * Per-card CSV builders, keyed by registry card id. KPI CSVs contain one
 * summary row; chart CSVs their underlying series or item rows; table
 * CSVs every filtered row.
 */
export function buildCardCsv(
  cardId: string,
  tabs: Partial<TabResults>,
  dashboard?: DashboardSnapshot
): CardCsv {
  const card = getReportCard(cardId);
  if (!card) throw new Error(`No CSV serializer for report card: ${cardId}`);

  switch (cardId) {
    // ---- Inventory Outlook ------------------------------------------------
    case 'inventory-outlook-kpi': {
      const result = requireTab(tabs, 'inventory-outlook', cardId);
      const { kpis } = result;
      return {
        headers: [
          'total_items', 'in_stock_items', 'out_of_stock_items',
          'availability_percent', 'items_with_known_quantity',
          'items_with_computable_cover', 'median_days_of_cover',
          'projected_stockouts_within_horizon', 'horizon_days', 'data_as_of',
        ],
        rows: [[
          kpis.totalItems, kpis.inStockItems, kpis.outOfStockItems,
          num(kpis.availabilityPercent), kpis.itemsWithKnownQuantity,
          kpis.itemsWithComputableCover, num(kpis.medianDaysOfCover),
          kpis.projectedStockoutsWithinHorizon, kpis.horizonDays,
          result.dataAsOf,
        ]],
      };
    }
    case 'inventory-outlook-cover-bands': {
      const result = requireTab(tabs, 'inventory-outlook', cardId);
      return {
        headers: ['band', 'item_count'],
        rows: result.daysOfCoverBands.map((band) => [band.band, band.itemCount]),
      };
    }
    case 'inventory-outlook-stockout-timeline': {
      const result = requireTab(tabs, 'inventory-outlook', cardId);
      return {
        headers: ['week_start', 'item_count', 'item_names'],
        rows: result.stockoutTimeline.map((bucket) => [
          bucket.weekStart, bucket.itemCount, bucket.itemNames.join('; '),
        ]),
      };
    }
    case 'inventory-outlook-item-table': {
      const result = requireTab(tabs, 'inventory-outlook', cardId);
      return {
        headers: [
          'food_item_id', 'name', 'category', 'in_stock', 'estimated_quantity',
          'price_type', 'purchase_price_cents', 'units_per_purchase',
          'daily_burn', 'weekly_burn', 'days_of_cover', 'projected_stockout_at',
          'required_units', 'purchases_needed', 'projected_cost_cents',
          'data_status',
        ],
        rows: result.items.map((item) => [
          item.foodItemId, item.name, item.categoryName, item.isInStock,
          item.estimatedQuantity, item.priceType, item.purchasePriceCents,
          item.unitsPerPurchase, num(item.dailyBurn), num(item.weeklyBurn),
          num(item.daysOfCover), item.projectedStockoutAt, item.requiredUnits,
          item.purchasesNeeded, item.projectedCostCents, item.dataStatus,
        ]),
      };
    }

    // ---- Unit Prices ------------------------------------------------------
    case 'unit-prices-kpi': {
      const result = requireTab(tabs, 'unit-prices', cardId);
      const { kpis } = result;
      return {
        headers: [
          'total_items', 'paid_items', 'donated_items', 'unknown_price_items',
          'price_changes_in_range', 'items_with_price_change_in_range',
          'horizon_days', 'data_as_of',
        ],
        rows: [[
          kpis.totalItems, kpis.paidItems, kpis.donatedItems,
          kpis.unknownPriceItems, kpis.priceChangesInRange,
          kpis.itemsWithPriceChangeInRange, kpis.horizonDays, result.dataAsOf,
        ]],
      };
    }
    case 'unit-prices-cost-trends': {
      const result = requireTab(tabs, 'unit-prices', cardId);
      return {
        headers: [
          'food_item_id', 'name', 'previous_unit_cost_cents',
          'latest_unit_cost_cents', 'change_cents', 'change_percent',
          'changed_at',
        ],
        rows: result.unitCostChanges.map((row) => [
          row.sourceFoodItemId, row.itemName, num(row.previousUnitCostCents),
          num(row.latestUnitCostCents), num(row.changeCents),
          num(row.changePercent), row.changedAt,
        ]),
      };
    }
    case 'unit-prices-cost-impact': {
      const result = requireTab(tabs, 'unit-prices', cardId);
      return {
        headers: [
          'food_item_id', 'name', 'projected_demand_units',
          'previous_unit_cost_cents', 'latest_unit_cost_cents', 'impact_cents',
        ],
        rows: result.costImpacts.map((row) => [
          row.sourceFoodItemId, row.itemName, num(row.projectedDemandUnits),
          num(row.previousUnitCostCents), num(row.latestUnitCostCents),
          num(row.impactCents),
        ]),
      };
    }
    case 'unit-prices-history-table': {
      const result = requireTab(tabs, 'unit-prices', cardId);
      return {
        headers: [
          'recorded_at', 'food_item_id', 'name', 'category', 'event_kind',
          'price_type', 'purchase_price_cents', 'units_per_purchase',
          'unit_cost_cents', 'previous_unit_cost_cents', 'change_cents',
          'item_still_exists',
        ],
        rows: result.priceHistory.map((row) => [
          row.at, row.sourceFoodItemId, row.itemName, row.categoryName,
          row.eventKind, row.priceType, row.purchasePriceCents,
          row.unitsPerPurchase, num(row.unitCostCents),
          num(row.previousUnitCostCents), num(row.changeCents), row.isLive,
        ]),
      };
    }

    // ---- Scarcity & Availability -------------------------------------------
    case 'scarcity-kpi': {
      const result = requireTab(tabs, 'scarcity', cardId);
      const { kpis } = result;
      return {
        headers: [
          'availability_item_days_percent', 'stockout_episodes',
          'items_with_stockout', 'ongoing_stockouts', 'average_restock_days',
          'median_restock_days', 'data_as_of',
        ],
        rows: [[
          num(kpis.availabilityItemDaysPercent), kpis.stockoutEpisodes,
          kpis.itemsWithStockout, kpis.ongoingStockouts,
          num(kpis.averageRestockDays), num(kpis.medianRestockDays),
          result.dataAsOf,
        ]],
      };
    }
    case 'scarcity-availability-over-time': {
      const result = requireTab(tabs, 'scarcity', cardId);
      return {
        headers: ['date', 'tracked_items', 'in_stock_items', 'availability_percent'],
        rows: result.availabilityOverTime.map((point) => [
          point.date, point.trackedItems, point.inStockItems,
          num(point.availabilityPercent),
        ]),
      };
    }
    case 'scarcity-stockout-frequency': {
      const result = requireTab(tabs, 'scarcity', cardId);
      return {
        headers: ['food_item_id', 'name', 'episode_count', 'total_out_days'],
        rows: result.stockoutFrequency.map((row) => [
          row.sourceFoodItemId, row.itemName, row.episodeCount,
          num(row.totalOutDays),
        ]),
      };
    }
    case 'scarcity-episodes-table': {
      const result = requireTab(tabs, 'scarcity', cardId);
      return {
        headers: [
          'food_item_id', 'name', 'category', 'start_at', 'end_at',
          'ended_by', 'duration_days', 'item_still_exists',
        ],
        rows: result.episodes.map((episode) => [
          episode.sourceFoodItemId, episode.itemName, episode.categoryName,
          episode.startAt, episode.endAt, episode.endedBy,
          num(episode.durationDays), episode.isLive,
        ]),
      };
    }

    // ---- Replenishment Planning --------------------------------------------
    case 'replenishment-kpi': {
      const result = requireTab(tabs, 'replenishment', cardId);
      const { kpis } = result;
      return {
        headers: [
          'horizon_days', 'items_needing_purchase', 'urgent_items',
          'known_spend_cents', 'donated_demand_items', 'missing_input_items',
          'data_as_of',
        ],
        rows: [[
          kpis.horizonDays, kpis.itemsNeedingPurchase, kpis.urgentItems,
          kpis.knownSpendCents, kpis.donatedDemandItems,
          kpis.missingInputItems, result.dataAsOf,
        ]],
      };
    }
    case 'replenishment-reorder-priority': {
      const result = requireTab(tabs, 'replenishment', cardId);
      return {
        headers: [
          'food_item_id', 'name', 'in_stock', 'days_of_cover', 'required_units',
          'purchases_needed',
        ],
        rows: result.reorderPriority.map((row) => [
          row.foodItemId, row.name, row.isInStock, num(row.daysOfCover),
          row.requiredUnits, row.purchasesNeeded,
        ]),
      };
    }
    case 'replenishment-spend-by-category': {
      const result = requireTab(tabs, 'replenishment', cardId);
      return {
        headers: [
          'category_id', 'category', 'known_spend_cents', 'paid_items',
          'donated_items', 'unknown_cost_items',
        ],
        rows: result.spendByCategory.map((row) => [
          row.categoryId, row.categoryName, row.knownSpendCents,
          row.paidItems, row.donatedItems, row.unknownCostItems,
        ]),
      };
    }
    case 'replenishment-plan-table': {
      const result = requireTab(tabs, 'replenishment', cardId);
      return {
        headers: [
          'food_item_id', 'name', 'category', 'in_stock', 'estimated_quantity',
          'daily_burn', 'days_of_cover', 'required_units',
          'units_per_purchase', 'purchases_needed', 'price_type',
          'purchase_price_cents', 'projected_cost_cents', 'missing_inputs',
        ],
        rows: result.plan.map((row) => [
          row.foodItemId, row.name, row.categoryName, row.isInStock,
          row.estimatedQuantity,
          num(row.dailyBurn), num(row.daysOfCover), row.requiredUnits,
          row.unitsPerPurchase, row.purchasesNeeded, row.priceType,
          row.purchasePriceCents, row.projectedCostCents,
          row.missingInputs.join('; '),
        ]),
      };
    }

    // ---- Data Coverage -----------------------------------------------------
    case 'data-coverage-kpi': {
      const result = requireTab(tabs, 'data-coverage', cardId);
      const { kpis } = result;
      return {
        headers: [
          'live_items', 'quantity_coverage_percent', 'price_coverage_percent',
          'burn_ready_percent', 'events_in_range', 'data_as_of',
        ],
        rows: [[
          kpis.liveItems, num(kpis.quantityCoveragePercent),
          num(kpis.priceCoveragePercent), num(kpis.burnReadyPercent),
          kpis.eventsInRange, result.dataAsOf,
        ]],
      };
    }
    case 'data-coverage-burn-readiness': {
      const result = requireTab(tabs, 'data-coverage', cardId);
      return {
        headers: ['status', 'item_count'],
        rows: result.burnReadiness.map((row) => [row.status, row.itemCount]),
      };
    }
    case 'data-coverage-recording-activity': {
      const result = requireTab(tabs, 'data-coverage', cardId);
      return {
        headers: [
          'week_start', 'event_count', 'quantity_events', 'price_events',
          'status_events',
        ],
        rows: result.recordingActivity.map((row) => [
          row.weekStart, row.eventCount, row.quantityEvents, row.priceEvents,
          row.statusEvents,
        ]),
      };
    }
    case 'data-coverage-gaps-table': {
      const result = requireTab(tabs, 'data-coverage', cardId);
      return {
        headers: [
          'food_item_id', 'name', 'category', 'has_quantity', 'has_price',
          'burn_ready', 'last_quantity_change_at',
        ],
        rows: result.gaps.map((row) => [
          row.foodItemId, row.name, row.categoryName, row.hasQuantity,
          row.hasPrice, row.burnReady, row.lastQuantityChangeAt,
        ]),
      };
    }

    // ---- Dashboard --------------------------------------------------------
    case 'dashboard-overview-categories':
      return dashboardKpi(dashboard, cardId, [
        ['total_categories', dashboard!.overview.categories.total],
        ['no_limit_percent', num(dashboard!.overview.categories.noLimitPercentage)],
      ]);
    case 'dashboard-overview-food-items':
      return dashboardKpi(dashboard, cardId, [
        ['total_food_items', dashboard!.overview.foodItems.total],
        ['in_stock_items', dashboard!.overview.foodItems.inStock],
        ['in_stock_percent', num(dashboard!.overview.foodItems.inStockPercentage)],
      ]);
    case 'dashboard-overview-languages':
      return dashboardKpi(dashboard, cardId, [
        ['total_languages', dashboard!.overview.languages.total],
        ['active_languages', dashboard!.overview.languages.active],
      ]);
    case 'dashboard-overview-translations':
      return dashboardKpi(dashboard, cardId, [
        ['total_translations', dashboard!.overview.translations.total],
        ['success_rate_percent', num(dashboard!.overview.translations.successRate)],
        ['language_count', dashboard!.overview.translations.languageCount],
      ]);
    case 'dashboard-inventory-status':
      requireDashboard(dashboard, cardId);
      return {
        headers: ['status', 'item_count'],
        rows: dashboard.inventoryStatus.map((row) => [row.status, row.itemCount]),
      };
    case 'dashboard-category-distribution':
      requireDashboard(dashboard, cardId);
      return {
        headers: ['category_id', 'category', 'item_count'],
        rows: dashboard.categoryDistribution.map((row) => [
          row.categoryId, row.categoryName, row.itemCount,
        ]),
      };
    case 'dashboard-translation-success':
      requireDashboard(dashboard, cardId);
      return {
        headers: ['completed', 'pending', 'failed', 'total', 'data_as_of'],
        rows: [[
          dashboard.translationSuccess.completed,
          dashboard.translationSuccess.pending,
          dashboard.translationSuccess.failed,
          dashboard.translationSuccess.total,
          dashboard.dataAsOf,
        ]],
      };
    case 'dashboard-projected-stockouts':
      return dashboardKpi(dashboard, cardId, [
        ['projected_stockouts_within_30_days', dashboard!.logistics.projectedStockouts],
      ]);
    case 'dashboard-quantity-coverage':
      return dashboardKpi(dashboard, cardId, [
        ['quantity_coverage_percent', num(dashboard!.logistics.quantityCoveragePercent)],
        ['known_quantity_items', dashboard!.logistics.quantityKnownItems],
        ['total_items', dashboard!.logistics.totalItems],
      ]);
    case 'dashboard-median-cover':
      return dashboardKpi(dashboard, cardId, [
        ['median_days_of_cover', num(dashboard!.logistics.medianDaysOfCover)],
        ['cover_ready_items', dashboard!.logistics.coverReadyItems],
      ]);
    case 'dashboard-replenishment-cost':
      return dashboardKpi(dashboard, cardId, [
        ['known_30_day_replenishment_cost_cents', dashboard!.logistics.knownReplenishmentCostCents],
        ['donated_demand_items_excluded', dashboard!.logistics.donatedDemandItems],
        ['unknown_cost_demand_items_excluded', dashboard!.logistics.unknownCostDemandItems],
      ]);

    default:
      throw new Error(`No CSV serializer for report card: ${cardId}`);
  }
}

function requireDashboard(
  dashboard: DashboardSnapshot | undefined,
  cardId: string
): asserts dashboard is DashboardSnapshot {
  if (!dashboard) throw new Error(`Missing dashboard data for report card ${cardId}`);
}

function dashboardKpi(
  dashboard: DashboardSnapshot | undefined,
  cardId: string,
  fields: Array<[string, CsvValue]>
): CardCsv {
  requireDashboard(dashboard, cardId);
  return {
    headers: [...fields.map(([header]) => header), 'data_as_of'],
    rows: [[...fields.map(([, value]) => value), dashboard.dataAsOf]],
  };
}
