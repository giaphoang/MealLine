// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseApiService } from '@/services/base';

// Type definitions for backend aggregation responses
export interface DashboardOverviewResponse {
  data: {
    categories: {
      total: number;
      trend?: number;
    };
    foodItems: {
      total: number;
      inStock: number;
      trend?: number;
    };
    languages: {
      total: number;
      active: number;
    };
    translations: {
      total: number;
      successRate: number;
      trend?: number;
    };
  };
  metadata: {
    lastUpdated: string;
    timeRange?: string;
    source: string;
  };
  performance: {
    responseTime: number;
    cacheHit: boolean;
  };
}

export interface CategoryDistributionResponse {
  data: Array<{
    category: string;
    items: number;
    percentage: number;
  }>;
  metadata: {
    lastUpdated: string;
    timeRange?: string;
    source: string;
    minimumThreshold: number;
  };
  performance: {
    responseTime: number;
    cacheHit: boolean;
  };
}

/**
 * `GET /api/projections/inventory-distribution`.
 *
 * This described a payload the server has never sent. It declared
 * `data.distribution` of `{ status, items, fill }` plus a `data.metadata`,
 * while `InventoryAggregator.getInventoryDistribution` returns
 * `statusDistribution` of `{ status, count, percentage, color }` and no
 * nested metadata. `useInventoryChartData` reads the real shape and maps it
 * to the chart's `{ status, items, fill }` — so the transform was right and
 * the contract it was written against was fiction, which is the only reason
 * the dashboard chart works.
 *
 * Corrected to the aggregator's actual return. The payload also carries
 * `dietaryDistribution`, `limitDistribution` and `categoryBreakdown`; they
 * are left undeclared because nothing on the client reads them, and guessing
 * at their shape is what produced this in the first place.
 */
export interface InventoryDistributionResponse {
  data: {
    totalItems: number;
    statusDistribution: Array<{
      status: string;
      count: number;
      percentage: number;
      color: string;
    }>;
  };
  metadata: {
    lastUpdated: string;
    timeRange?: string;
    source: string;
  };
  performance: {
    responseTime: number;
    cacheHit: boolean;
  };
}

export interface TranslationMetricsResponse {
  data: {
    success: Array<{
      success: number;
      pending: number;
    }>;
    responseTimes: Array<{
      language: string;
      time: number;
    }>;
    performanceMetrics: {
      averageResponseTime: number;
      totalOperations: number;
      successRate: number;
    };
  };
  metadata: {
    lastUpdated: string;
    timeRange?: string;
    source: string;
  };
  performance: {
    responseTime: number;
    cacheHit: boolean;
  };
}

/**
 * Service for dashboard aggregation endpoints from Phase 2 backend infrastructure
 * Replaces direct service calls with optimized backend aggregation
 */
export class DashboardService extends BaseApiService {
  constructor() {
    super('/api/projections');
  }

  /**
   * Get comprehensive overview metrics for all dashboard stats cards
   */
  async getDashboardOverview(timeRange?: string): Promise<DashboardOverviewResponse> {
    const params = timeRange ? `?timeRange=${timeRange}` : '';
    return this.get<DashboardOverviewResponse>(`/dashboard-overview${params}`);
  }

  /**
   * Get category distribution with item counts and percentage analysis
   */
  async getCategoryDistribution(minimumItems: number = 1, timeRange?: string): Promise<CategoryDistributionResponse> {
    const params = new URLSearchParams();
    if (timeRange) params.append('timeRange', timeRange);
    params.append('minimumThreshold', minimumItems.toString());
    
    const queryString = params.toString();
    return this.get<CategoryDistributionResponse>(`/category-distribution${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * Get inventory status distribution and analysis
   */
  async getInventoryDistribution(timeRange?: string): Promise<InventoryDistributionResponse> {
    const params = timeRange ? `?timeRange=${timeRange}` : '';
    return this.get<InventoryDistributionResponse>(`/inventory-distribution${params}`);
  }

  /**
   * Get translation performance and usage metrics
   */
  async getTranslationMetrics(timeRange?: string): Promise<TranslationMetricsResponse> {
    const params = timeRange ? `?timeRange=${timeRange}` : '';
    return this.get<TranslationMetricsResponse>(`/translation-metrics${params}`);
  }
}

// Create singleton instance
export const dashboardService = new DashboardService();

export default dashboardService;