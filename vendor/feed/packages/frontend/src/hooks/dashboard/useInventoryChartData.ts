// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard';
import { queryKeys } from '@/lib/react-query';

export interface InventoryDistribution {
  status: string;
  items: number;
  fill: string;
}

interface InventoryData {
  distribution: InventoryDistribution[];
  totalItems: number;
}

export function useInventoryChartData() {
  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: queryKeys.dashboard.inventoryDistribution,
    queryFn: async () => {
      const response = await dashboardService.getInventoryDistribution();
      return response.data;
    },
    // React Query 5 Native Refetch Pattern
    refetchOnMount: 'always',
    staleTime: 0, // Force fresh data on dashboard load
    gcTime: 5 * 60 * 1000, // Maintain cache for navigation
    select: (data): InventoryData => {
      // Transform backend InventoryMetrics to frontend InventoryData format
      if (!data || !data.statusDistribution) {
        return { distribution: [], totalItems: 0 };
      }
      
      // Status transformation map to convert backend space-separated to camelCase
      const statusTransformMap: Record<string, string> = {
        'In Stock': 'inStock',
        'Out of Stock': 'outOfStock',
        'Limited': 'limited',
        'Clearance': 'clearance',
        'Unknown': 'unknown'
      };
      
      return {
        distribution: data.statusDistribution.map(item => ({
          status: statusTransformMap[item.status] || item.status.toLowerCase(),
          items: item.count,
          fill: item.color
        })),
        totalItems: data.totalItems
      };
    },
  });

  return {
    distribution: data ? data.distribution : [],
    totalItems: data ? data.totalItems : 0,
    isLoading,
    error: error as Error | null,
    refetch
  };
}