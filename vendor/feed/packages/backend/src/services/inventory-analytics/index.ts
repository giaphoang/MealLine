// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Shared inventory-analytics service (Reports initiative §2). Used by the
 * Reports workspace, exports, and Dashboard logistics cards so every
 * surface agrees on every number.
 *
 * One context load (`data.ts`) feeds five pure tab builders. Interactive
 * queries compute a single tab; exports load one context and render every
 * selected block from that canonical snapshot.
 */

import { PrismaClient } from '@prisma/client';
import {
  AnalyticsContext,
  loadAnalyticsContext,
} from './data';
import { computeItemOutlooks, buildInventoryOutlook, InventoryOutlookResult } from './outlook';
import { buildUnitPrices, UnitPricesResult } from './unit-prices';
import { buildScarcity, ScarcityResult } from './scarcity';
import { buildReplenishment, ReplenishmentResult } from './replenishment';
import { buildCoverage, CoverageResult } from './coverage';
import { ResolvedRange } from './timezone';
import type { AnalyticsFilters } from './data';

export * from './outlook';
export * from './unit-prices';
export * from './scarcity';
export * from './replenishment';
export * from './coverage';
export { loadAnalyticsContext } from './data';
export type { AnalyticsContext, ItemTimeline, LedgerEvent } from './data';

export type ReportTabId =
  | 'inventory-outlook'
  | 'unit-prices'
  | 'scarcity'
  | 'replenishment'
  | 'data-coverage';

export const REPORT_TAB_IDS: ReportTabId[] = [
  'inventory-outlook',
  'unit-prices',
  'scarcity',
  'replenishment',
  'data-coverage',
];

export interface TabResults {
  'inventory-outlook': InventoryOutlookResult;
  'unit-prices': UnitPricesResult;
  scarcity: ScarcityResult;
  replenishment: ReplenishmentResult;
  'data-coverage': CoverageResult;
}

export interface ComputeOptions {
  range: ResolvedRange;
  horizonDays: number;
  categoryIds?: number[];
  filters?: AnalyticsFilters;
  asOf?: Date;
  client?: PrismaClient;
}

/** Builds one tab's result from an already-loaded context. */
export function buildTab<T extends ReportTabId>(
  tab: T,
  context: AnalyticsContext
): TabResults[T] {
  // Item outlooks feed three of the five tabs; compute them once.
  const items = computeItemOutlooks(context);
  switch (tab) {
    case 'inventory-outlook':
      return buildInventoryOutlook(context, items) as TabResults[T];
    case 'unit-prices':
      return buildUnitPrices(context, items) as TabResults[T];
    case 'scarcity':
      return buildScarcity(context) as TabResults[T];
    case 'replenishment':
      return buildReplenishment(context, items) as TabResults[T];
    case 'data-coverage':
      return buildCoverage(context, items) as TabResults[T];
    default: {
      const exhaustive: never = tab;
      throw new Error(`Unknown report tab: ${exhaustive}`);
    }
  }
}

export async function computeReportsTab<T extends ReportTabId>(
  tab: T,
  options: ComputeOptions
): Promise<TabResults[T]> {
  const context = await loadAnalyticsContext(options);
  return buildTab(tab, context);
}

/** All five tabs from one canonical context (used by exports). */
export async function computeAllTabs(
  options: ComputeOptions
): Promise<{ context: AnalyticsContext; tabs: TabResults }> {
  const context = await loadAnalyticsContext(options);
  const items = computeItemOutlooks(context);
  return {
    context,
    tabs: {
      'inventory-outlook': buildInventoryOutlook(context, items),
      'unit-prices': buildUnitPrices(context, items),
      scarcity: buildScarcity(context),
      replenishment: buildReplenishment(context, items),
      'data-coverage': buildCoverage(context, items),
    },
  };
}

/** Back-compat wrapper used by the Phase 2 route and tests. */
export async function computeInventoryOutlook(
  options: ComputeOptions
): Promise<InventoryOutlookResult> {
  return computeReportsTab('inventory-outlook', options);
}
