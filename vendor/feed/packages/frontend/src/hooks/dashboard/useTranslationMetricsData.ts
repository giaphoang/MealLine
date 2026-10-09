// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard';
import { queryKeys } from '@/lib/react-query';

interface TranslationMetrics {
  success: Array<{
    success: number;
    pending: number;
    failed?: number;
  }>;
  responseTimes: Array<{
    language: string;      // Full language name
    time: number;
    requests: number;
    tokens: number;        // Total tokens used
    cost: number;         // Total cost in USD
  }>;
  statusCounts?: {
    total: number;
    completed: number;
    pending: number;
    failed: number;
  };
}

export function useTranslationMetricsData() {
  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: queryKeys.dashboard.translationMetrics,
    queryFn: async () => {
      const response = await dashboardService.getTranslationMetrics();
      return response.data;
    },
    // React Query 5 Native Refetch Pattern
    refetchOnMount: 'always',
    staleTime: 0, // Force fresh data on dashboard load
    gcTime: 5 * 60 * 1000, // Maintain cache for navigation
    select: (data): TranslationMetrics => {
      // Transform backend aggregated response to component interface
      if (!data || typeof data !== 'object') {
        return {
          success: [{ success: 0, pending: 0 }],
          responseTimes: []
        };
      }

      const backendData = data as any;
      
      // Extract success rate from aggregated response
      const successRate = backendData.successRate || 0;
      const total = backendData.total || 0;
      const hasStatusCounts = backendData.statusCounts && typeof backendData.statusCounts === 'object';
      const completedCount = hasStatusCounts ? (backendData.statusCounts.completed || 0) : Math.round((successRate / 100) * total);
      const pendingCount = hasStatusCounts ? (backendData.statusCounts.pending || 0) : (total - completedCount);
      const failedCount = hasStatusCounts ? (backendData.statusCounts.failed || 0) : 0;

      // Percentages
      const toPct = (count: number) => total > 0 ? (count / total) * 100 : 0;
      const successPct = hasStatusCounts ? toPct(completedCount) : successRate;
      const pendingPct = toPct(pendingCount);
      const failedPct = toPct(failedCount);
      
      // Transform language breakdown to response times format
      const responseTimes = (backendData.byLanguage || []).map((lang: any) => ({
        language: lang.languageName || lang.languageCode || 'Unknown',
        time: (lang.averageResponseTime || 0) / 1000, // Convert ms to seconds
        requests: lang.count || 0,
        tokens: 0, // Not available in current aggregation
        cost: lang.cost || 0
      }));
      
      return {
        success: [{ 
          success: successPct, 
          pending: pendingPct,
          failed: failedPct
        }],
        responseTimes,
        statusCounts: {
          total,
          completed: completedCount,
          pending: pendingCount,
          failed: failedCount
        }
      };
    },
  });

  return { 
    data: data || null, 
    isLoading, 
    error: error as Error | null,
    refetch
  };
}
