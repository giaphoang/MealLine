// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// Mirrors the backend reports API contracts
// (packages/backend/src/services/inventory-analytics and
// services/reports/card-registry). Card ids are stable and shared across
// frontend, backend registry, templates, PDF, and CSV.

export type RangePreset =
  | 'last-30-days'
  | 'last-90-days'
  | 'last-6-months'
  | 'last-12-months'
  | 'ytd'
  | 'custom';

export type PlanningHorizon = 14 | 30 | 60 | 90;
export type ReportSource = 'reports' | 'dashboard';

export interface ReportsRangeRequest {
  preset: RangePreset;
  timeZone: string;
  startDate?: string;
  endDate?: string;
}

export type StockStatusFilter = 'in-stock' | 'out-of-stock';

export interface ReportFilters {
  categoryIds?: number[];
  stockStatuses?: StockStatusFilter[];
  priceTypes?: PriceType[];
  search?: string;
}

export interface ReportCardOptions {
  maxRows?: 5 | 10;
}

export type ReportCardOptionsMap = Record<string, ReportCardOptions>;

export type ReportTabId =
  | 'inventory-outlook'
  | 'unit-prices'
  | 'scarcity'
  | 'replenishment'
  | 'data-coverage';

export interface ReportsQueryRequest {
  source: ReportSource;
  tab?: ReportTabId;
  range: ReportsRangeRequest;
  horizonDays: PlanningHorizon;
  filters?: ReportFilters;
  cardOptions?: ReportCardOptionsMap;
  cardIds?: string[];
}

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

export type PriceType = 'unknown' | 'donated' | 'paid';

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

// ---- Unit Prices tab -------------------------------------------------------

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

export interface UnitPricesResult {
  kpis: {
    totalItems: number;
    paidItems: number;
    donatedItems: number;
    unknownPriceItems: number;
    priceChangesInRange: number;
    itemsWithPriceChangeInRange: number;
    horizonDays: number;
  };
  unitCostChanges: UnitCostChangeRow[];
  costImpacts: CostImpactRow[];
  priceHistory: PriceHistoryRow[];
  dataAsOf: string;
}

// ---- Scarcity & Availability tab -------------------------------------------

export interface StockoutEpisode {
  sourceFoodItemId: number;
  itemName: string;
  categoryName: string;
  isLive: boolean;
  startAt: string;
  endAt: string | null;
  endedBy: 'restock' | 'deletion' | 'range-end';
  durationDays: number;
}

export interface AvailabilityPoint {
  date: string;
  trackedItems: number;
  inStockItems: number;
  availabilityPercent: number | null;
}

export interface StockoutFrequencyRow {
  sourceFoodItemId: number;
  itemName: string;
  episodeCount: number;
  totalOutDays: number;
}

export interface ScarcityResult {
  kpis: {
    availabilityItemDaysPercent: number | null;
    stockoutEpisodes: number;
    itemsWithStockout: number;
    ongoingStockouts: number;
    averageRestockDays: number | null;
    medianRestockDays: number | null;
  };
  availabilityOverTime: AvailabilityPoint[];
  stockoutFrequency: StockoutFrequencyRow[];
  episodes: StockoutEpisode[];
  dataAsOf: string;
}

// ---- Replenishment Planning tab ---------------------------------------------

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
  priceType: PriceType;
  purchasePriceCents: number | null;
  projectedCostCents: number | null;
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

export interface ReplenishmentResult {
  kpis: {
    horizonDays: number;
    itemsNeedingPurchase: number;
    urgentItems: number;
    knownSpendCents: number;
    donatedDemandItems: number;
    missingInputItems: number;
  };
  reorderPriority: ReorderPriorityRow[];
  spendByCategory: CategorySpendRow[];
  plan: ReplenishmentPlanRow[];
  dataAsOf: string;
}

// ---- Data Coverage tab -------------------------------------------------------

export interface BurnReadinessRow {
  status: string;
  itemCount: number;
}

export interface RecordingActivityRow {
  weekStart: string;
  eventCount: number;
  quantityEvents: number;
  priceEvents: number;
  statusEvents: number;
}

export interface DataGapRow {
  foodItemId: number;
  name: string;
  categoryName: string;
  hasQuantity: boolean;
  hasPrice: boolean;
  burnReady: boolean;
  lastQuantityChangeAt: string | null;
}

export interface CoverageResult {
  kpis: {
    liveItems: number;
    quantityCoveragePercent: number | null;
    priceCoveragePercent: number | null;
    burnReadyPercent: number | null;
    eventsInRange: number;
  };
  burnReadiness: BurnReadinessRow[];
  recordingActivity: RecordingActivityRow[];
  gaps: DataGapRow[];
  dataAsOf: string;
}

export interface TabResults {
  'inventory-outlook': InventoryOutlookResult;
  'unit-prices': UnitPricesResult;
  scarcity: ScarcityResult;
  replenishment: ReplenishmentResult;
  'data-coverage': CoverageResult;
}

export interface ReportsQueryResponse<T extends ReportTabId = 'inventory-outlook'> {
  range: {
    preset: RangePreset;
    startDate: string;
    endDate: string;
    timeZone: string;
  };
  horizonDays: PlanningHorizon;
  tab: T;
  result: TabResults[T];
}

// Stable card ids, shared with the backend registry, templates, PDF, and
// CSV. Never rename one.
export const INVENTORY_OUTLOOK_CARDS = {
  kpi: 'inventory-outlook-kpi',
  coverBands: 'inventory-outlook-cover-bands',
  stockoutTimeline: 'inventory-outlook-stockout-timeline',
  itemTable: 'inventory-outlook-item-table',
} as const;

export const UNIT_PRICES_CARDS = {
  kpi: 'unit-prices-kpi',
  costTrends: 'unit-prices-cost-trends',
  costImpact: 'unit-prices-cost-impact',
  historyTable: 'unit-prices-history-table',
} as const;

export const SCARCITY_CARDS = {
  kpi: 'scarcity-kpi',
  availabilityOverTime: 'scarcity-availability-over-time',
  stockoutFrequency: 'scarcity-stockout-frequency',
  episodesTable: 'scarcity-episodes-table',
} as const;

export const REPLENISHMENT_CARDS = {
  kpi: 'replenishment-kpi',
  reorderPriority: 'replenishment-reorder-priority',
  spendByCategory: 'replenishment-spend-by-category',
  planTable: 'replenishment-plan-table',
} as const;

export const DATA_COVERAGE_CARDS = {
  kpi: 'data-coverage-kpi',
  burnReadiness: 'data-coverage-burn-readiness',
  recordingActivity: 'data-coverage-recording-activity',
  gapsTable: 'data-coverage-gaps-table',
} as const;

export const MAX_REPORT_SELECTION = 8;

// Display titles for stable card ids (mirrors the backend registry).
export const REPORT_CARD_TITLES: Record<string, string> = {
  'inventory-outlook-kpi': 'Stock, Coverage & Risk',
  'inventory-outlook-cover-bands': 'Days-of-Cover Bands',
  'inventory-outlook-stockout-timeline': 'Projected Stockout Timeline',
  'inventory-outlook-item-table': 'Item Outlook',
  'unit-prices-kpi': 'Price Coverage & Changes',
  'unit-prices-cost-trends': 'Unit Cost Trends',
  'unit-prices-cost-impact': 'Paid Replacement Cost Impact',
  'unit-prices-history-table': 'Price History',
  'scarcity-kpi': 'Availability, Stockouts & Restock',
  'scarcity-availability-over-time': 'Availability Over Time',
  'scarcity-stockout-frequency': 'Stockout Frequency',
  'scarcity-episodes-table': 'Stockout Episodes',
  'replenishment-kpi': 'Urgency, Spend & Missing Inputs',
  'replenishment-reorder-priority': 'Reorder Priority',
  'replenishment-spend-by-category': 'Projected Spend by Category',
  'replenishment-plan-table': 'Replenishment Plan',
  'data-coverage-kpi': 'Recording Coverage',
  'data-coverage-burn-readiness': 'Burn-Rate Readiness',
  'data-coverage-recording-activity': 'Recording Activity',
  'data-coverage-gaps-table': 'Item-Level Data Gaps',
  'dashboard-overview-categories': 'Categories',
  'dashboard-overview-food-items': 'Food Items',
  'dashboard-overview-languages': 'Languages',
  'dashboard-overview-translations': 'Translations',
  'dashboard-inventory-status': 'Inventory Status Distribution',
  'dashboard-category-distribution': 'Category Distribution',
  'dashboard-translation-success': 'Translation Success',
  'dashboard-projected-stockouts': 'Projected Stockouts',
  'dashboard-quantity-coverage': 'Quantity Coverage',
  'dashboard-median-cover': 'Median Days of Cover',
  'dashboard-replenishment-cost': 'Known 30-Day Replenishment Cost',
};

export interface ReportsExportRequest {
  source: ReportSource;
  title: string;
  cardIds: string[];
  range: ReportsRangeRequest;
  horizonDays: PlanningHorizon;
  filters?: ReportFilters;
  cardOptions?: ReportCardOptionsMap;
  includePdf: boolean;
  includeCsv: boolean;
}

// Versioned shared-template payload (mirrors the backend Zod schema).
export interface ReportTemplateData {
  schemaVersion: 1;
  source: 'reports' | 'dashboard';
  cardIds: string[];
  range: ReportsRangeRequest;
  horizonDays: PlanningHorizon;
  filters?: ReportFilters;
  cardOptions?: ReportCardOptionsMap;
  /** Compatibility with templates saved before filters were nested. */
  categoryIds?: number[];
}

export interface ReportTemplate {
  id: number;
  name: string;
  source: 'reports' | 'dashboard';
  templateData: ReportTemplateData;
  /** Card ids the registry no longer recognizes — "needs attention". */
  staleCardIds: string[];
  createdAt: string;
  updatedAt: string;
}

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  'last-30-days': 'Last 30 Days',
  'last-90-days': 'Last 90 Days',
  'last-6-months': 'Last 6 Months',
  'last-12-months': 'Last 12 Months',
  ytd: 'Year to Date',
  custom: 'Custom',
};

export const PLANNING_HORIZONS: PlanningHorizon[] = [14, 30, 60, 90];
