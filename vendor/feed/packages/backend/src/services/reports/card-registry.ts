// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Report card registry (Reports initiative §2–3). Every selectable block
 * has ONE stable id shared by the frontend, this registry, templates, the
 * PDF renderer, the CSV serializer, and runtime validation. Never rename an
 * id — templates persist them.
 */

export type ReportSource = 'reports' | 'dashboard';
export type ReportBlockType = 'kpi' | 'chart' | 'table';

export interface ReportCardDefinition {
  id: string;
  source: ReportSource;
  /** Reports tab (or dashboard section) the card lives on. */
  tab: string;
  type: ReportBlockType;
  title: string;
}

export interface ReportCardOptions {
  /** Ranking charts may be reduced for a more focused generated report. */
  maxRows?: 5 | 10;
}

export const MAX_REPORT_SELECTION = 8;

export const REPORT_CARDS: ReportCardDefinition[] = [
  // Inventory Outlook
  { id: 'inventory-outlook-kpi', source: 'reports', tab: 'inventory-outlook', type: 'kpi', title: 'Stock, Coverage & Risk' },
  { id: 'inventory-outlook-cover-bands', source: 'reports', tab: 'inventory-outlook', type: 'chart', title: 'Days-of-Cover Bands' },
  { id: 'inventory-outlook-stockout-timeline', source: 'reports', tab: 'inventory-outlook', type: 'chart', title: 'Projected Stockout Timeline' },
  { id: 'inventory-outlook-item-table', source: 'reports', tab: 'inventory-outlook', type: 'table', title: 'Item Outlook' },
  // Unit Prices
  { id: 'unit-prices-kpi', source: 'reports', tab: 'unit-prices', type: 'kpi', title: 'Price Coverage & Changes' },
  { id: 'unit-prices-cost-trends', source: 'reports', tab: 'unit-prices', type: 'chart', title: 'Unit Cost Trends' },
  { id: 'unit-prices-cost-impact', source: 'reports', tab: 'unit-prices', type: 'chart', title: 'Paid Replacement Cost Impact' },
  { id: 'unit-prices-history-table', source: 'reports', tab: 'unit-prices', type: 'table', title: 'Price History' },
  // Scarcity & Availability
  { id: 'scarcity-kpi', source: 'reports', tab: 'scarcity', type: 'kpi', title: 'Availability, Stockouts & Restock' },
  { id: 'scarcity-availability-over-time', source: 'reports', tab: 'scarcity', type: 'chart', title: 'Availability Over Time' },
  { id: 'scarcity-stockout-frequency', source: 'reports', tab: 'scarcity', type: 'chart', title: 'Stockout Frequency' },
  { id: 'scarcity-episodes-table', source: 'reports', tab: 'scarcity', type: 'table', title: 'Stockout Episodes' },
  // Replenishment Planning
  { id: 'replenishment-kpi', source: 'reports', tab: 'replenishment', type: 'kpi', title: 'Urgency, Spend & Missing Inputs' },
  { id: 'replenishment-reorder-priority', source: 'reports', tab: 'replenishment', type: 'chart', title: 'Reorder Priority' },
  { id: 'replenishment-spend-by-category', source: 'reports', tab: 'replenishment', type: 'chart', title: 'Projected Spend by Category' },
  { id: 'replenishment-plan-table', source: 'reports', tab: 'replenishment', type: 'table', title: 'Replenishment Plan' },
  // Data Coverage
  { id: 'data-coverage-kpi', source: 'reports', tab: 'data-coverage', type: 'kpi', title: 'Recording Coverage' },
  { id: 'data-coverage-burn-readiness', source: 'reports', tab: 'data-coverage', type: 'chart', title: 'Burn-Rate Readiness' },
  { id: 'data-coverage-recording-activity', source: 'reports', tab: 'data-coverage', type: 'chart', title: 'Recording Activity' },
  { id: 'data-coverage-gaps-table', source: 'reports', tab: 'data-coverage', type: 'table', title: 'Item-Level Data Gaps' },
  // Dashboard — only metrics already judged authoritative are selectable.
  { id: 'dashboard-overview-categories', source: 'dashboard', tab: 'overview', type: 'kpi', title: 'Categories' },
  { id: 'dashboard-overview-food-items', source: 'dashboard', tab: 'overview', type: 'kpi', title: 'Food Items' },
  { id: 'dashboard-overview-languages', source: 'dashboard', tab: 'overview', type: 'kpi', title: 'Languages' },
  { id: 'dashboard-overview-translations', source: 'dashboard', tab: 'overview', type: 'kpi', title: 'Translations' },
  { id: 'dashboard-inventory-status', source: 'dashboard', tab: 'inventory', type: 'chart', title: 'Inventory Status Distribution' },
  { id: 'dashboard-category-distribution', source: 'dashboard', tab: 'inventory', type: 'chart', title: 'Category Distribution' },
  { id: 'dashboard-translation-success', source: 'dashboard', tab: 'translation', type: 'chart', title: 'Translation Success' },
  { id: 'dashboard-projected-stockouts', source: 'dashboard', tab: 'logistics', type: 'kpi', title: 'Projected Stockouts' },
  { id: 'dashboard-quantity-coverage', source: 'dashboard', tab: 'logistics', type: 'kpi', title: 'Quantity Coverage' },
  { id: 'dashboard-median-cover', source: 'dashboard', tab: 'logistics', type: 'kpi', title: 'Median Days of Cover' },
  { id: 'dashboard-replenishment-cost', source: 'dashboard', tab: 'logistics', type: 'kpi', title: 'Known 30-Day Replenishment Cost' },
];

const cardsById = new Map(REPORT_CARDS.map((card) => [card.id, card]));

const RANKING_CARD_IDS = new Set([
  'unit-prices-cost-trends',
  'unit-prices-cost-impact',
  'scarcity-stockout-frequency',
  'replenishment-reorder-priority',
]);

export function getReportCard(id: string): ReportCardDefinition | undefined {
  return cardsById.get(id);
}

/** Runtime validation for source-bound, selected-card-specific options. */
export function validateCardOptions(
  source: ReportSource,
  cardIds: string[],
  value: unknown
): { ok: true; value: Record<string, ReportCardOptions> } | { ok: false; message: string } {
  if (value === undefined) return { ok: true, value: {} };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: 'cardOptions must be an object.' };
  }
  const selected = new Set(cardIds);
  const parsed: Record<string, ReportCardOptions> = {};
  for (const [cardId, rawOptions] of Object.entries(value)) {
    const card = cardsById.get(cardId);
    if (!card || card.source !== source || !selected.has(cardId)) {
      return { ok: false, message: `Options reference an unavailable report block: ${cardId}` };
    }
    if (!rawOptions || typeof rawOptions !== 'object' || Array.isArray(rawOptions)) {
      return { ok: false, message: `Options for ${cardId} must be an object.` };
    }
    const keys = Object.keys(rawOptions);
    if (!RANKING_CARD_IDS.has(cardId)) {
      if (keys.length > 0) {
        return { ok: false, message: `${cardId} does not support card options.` };
      }
      parsed[cardId] = {};
      continue;
    }
    if (keys.some((key) => key !== 'maxRows')) {
      return { ok: false, message: `${cardId} has an unsupported card option.` };
    }
    const maxRows = (rawOptions as { maxRows?: unknown }).maxRows;
    if (maxRows !== undefined && maxRows !== 5 && maxRows !== 10) {
      return { ok: false, message: `${cardId} maxRows must be 5 or 10.` };
    }
    parsed[cardId] = maxRows === undefined ? {} : { maxRows };
  }
  return { ok: true, value: parsed };
}

export function cardSupportsMaxRows(cardId: string): boolean {
  return RANKING_CARD_IDS.has(cardId);
}

export function isValidCardSelection(
  source: ReportSource,
  cardIds: string[]
): { ok: true } | { ok: false; message: string } {
  if (cardIds.length === 0) {
    return { ok: false, message: 'Select at least one report block.' };
  }
  if (cardIds.length > MAX_REPORT_SELECTION) {
    return {
      ok: false,
      message: `Select at most ${MAX_REPORT_SELECTION} report blocks.`,
    };
  }
  if (new Set(cardIds).size !== cardIds.length) {
    return { ok: false, message: 'Report blocks must not repeat.' };
  }
  for (const id of cardIds) {
    const card = cardsById.get(id);
    if (!card) {
      return { ok: false, message: `Unknown report block: ${id}` };
    }
    if (card.source !== source) {
      // Templates are source-bound; Dashboard and Reports cards never mix.
      return {
        ok: false,
        message: `Report block ${id} does not belong to the ${source} source.`,
      };
    }
  }
  return { ok: true };
}
