// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect } from 'react';
import { projectionsService } from '@/services/projections';
import { systemStatusService } from '@/services/system';

export interface CostProjection {
  date: string;
  projectedTokens: number;
  projectedCost: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export interface UsageStats {
  dailyAverage: number;
  weeklyGrowth: number;
  monthlyGrowth: number;
  peakUsage: number;
  totalSpent: number;
  activeDays: number;
}



interface UseProjectionsResult {
  projections: CostProjection[];
  stats: UsageStats | null;
  suggestions: string[];
  isCostFree: boolean;
  hasUsageData: boolean;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for cost projections and usage statistics from real backend data
 */
export function useProjections(days: number = 30): UseProjectionsResult {
  const [projections, setProjections] = useState<CostProjection[]>([]);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isCostFree, setIsCostFree] = useState(false);
  const [hasUsageData, setHasUsageData] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Phase 3: Use real backend API with UsageRecord aggregation
      const result = await projectionsService.getProjections(days);
      
      setStats(result.stats);
      setProjections(result.projections);
      setSuggestions(result.suggestions);
      setIsCostFree(result.isCostFree);
      setHasUsageData(result.hasUsageData);
    } catch (err) {
      console.error('Error fetching projection data:', err);
      
      // Check if this is a startup condition before showing error
      try {
        const startupStatus = await systemStatusService.getStartupStatus();
        if (startupStatus.isStartupCondition) {
          // Return empty data for startup condition - no error shown
          setStats(null);
          setProjections([]);
          setSuggestions([]);
          setIsCostFree(false);
          setHasUsageData(false);
          return;
        }
      } catch (statusError) {
        console.error('Failed to check startup status:', statusError);
        // If we can't check startup status, proceed with error handling
      }
      
      setError(err instanceof Error ? err : new Error('Failed to fetch projection data'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [days]);

  return {
    projections,
    stats,
    suggestions,
    isCostFree,
    hasUsageData,
    isLoading,
    error,
    refresh: fetchData
  };
}
