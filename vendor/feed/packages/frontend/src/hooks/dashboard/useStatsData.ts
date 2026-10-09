// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useQuery } from '@tanstack/react-query'
import { dashboardService } from '@/services/dashboard'
import { queryKeys } from '@/lib/react-query'

interface StatsData {
  categories: {
    total: number
    noLimitPercentage: number
    trend?: number
  }
  foodItems: {
    total: number
    inStock: number
    inStockPercentage: number
    trend?: number
  }
  languages: {
    total: number
    active: number
  }
  translations: {
    total: number
    successRate: number
    languageCount: number
    trend?: number
  }
}

export function useStatsData() {
  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: queryKeys.dashboard.overview,
    queryFn: async () => {
      const response = await dashboardService.getDashboardOverview()
      return response.data
    },
    select: (data): StatsData => data,
    // React Query 5 Native Refetch Pattern
    refetchOnMount: 'always',
    staleTime: 0, // Force fresh data on dashboard load
    gcTime: 5 * 60 * 1000, // Maintain cache for navigation
  })

  return { 
    data: data || null, 
    isLoading, 
    error: error as Error | null,
    refetch
  }
}