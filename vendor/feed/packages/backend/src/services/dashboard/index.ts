// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

export { BaseAggregationService } from './BaseAggregationService';
export { OverviewAggregator } from './OverviewAggregator';
export { CategoryAggregator } from './CategoryAggregator';
export { InventoryAggregator } from './InventoryAggregator';
export { TranslationAggregator } from './TranslationAggregator';

export type { DashboardResponse, AggregationMetadata } from './BaseAggregationService';
export type { OverviewMetrics } from './OverviewAggregator';
export type { CategoryDistribution, CategoryDistributionMetrics } from './CategoryAggregator';
export type { InventoryStatusDistribution, InventoryMetrics } from './InventoryAggregator';
export type { TranslationMetrics } from './TranslationAggregator';
