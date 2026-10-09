// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseApiService } from '@/services/base';
import { CostProjection, UsageStats } from '@/hooks/cost/useProjections';
import config from '@/config/config';

interface BackendProjectionResponse {
  projections: Array<{
    date: string;
    projectedTokens: number;
    projectedCost: number;
    lowerBound: number;
    upperBound: number;
    confidence: number;
  }>;
  stats: {
    dailyAverage: number;
    weeklyGrowth: number;
    monthlyGrowth: number;
    peakUsage: number;
    totalSpent: number;
    activeDays: number;
  };
  suggestions: string[];
  isCostFree?: boolean;
  hasUsageData?: boolean;
}

/**
 * Service for cost projections and usage statistics with real backend integration
 * Replaces Phase 2 mock data with actual UsageRecord projections
 */
export class ProjectionsService extends BaseApiService {
  constructor() {
    super('/api/projections');
  }

  /**
   * Get cost projections and usage statistics from real backend data
   */
  async getProjections(days: number = 30): Promise<{
    projections: CostProjection[];
    stats: UsageStats;
    suggestions: string[];
    isCostFree: boolean;
    hasUsageData: boolean;
  }> {
    const response = await this.get<BackendProjectionResponse>(`/costs?days=${days}`);
    
    return {
      projections: response.projections || [],
      stats: response.stats,
      suggestions: response.suggestions || [],
      isCostFree: response.isCostFree ?? false,
      hasUsageData: response.hasUsageData ?? true
    };
  }


}

// Create singleton instance
export const projectionsService = new ProjectionsService();

export default projectionsService;
