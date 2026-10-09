// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { QueryClient } from '@tanstack/react-query';

/**
 * React Query configuration for dashboard performance optimization
 * Phase 4: Intelligent caching, background sync, error recovery
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache for 5 minutes before considering stale
      staleTime: 5 * 60 * 1000,
      // Keep in cache for 10 minutes after component unmount
      gcTime: 10 * 60 * 1000,
      // Retry failed requests up to 3 times
      retry: 3,
      // Exponential backoff with max 30s delay
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Refetch on window focus for real-time data
      refetchOnWindowFocus: true,
      // Disable global background refetch - configure per query
      refetchInterval: false,
      // Enable background refetch when window hidden
      refetchIntervalInBackground: false,
      // Network error handling
      networkMode: 'online',
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
      // Network error handling for mutations
      networkMode: 'online',
    },
  },
});

/**
 * Query keys for consistent cache management
 */
export const queryKeys = {
  dashboard: {
    overview: ['dashboard', 'overview'] as const,
    categoryDistribution: (minimumItems: number) => ['dashboard', 'category-distribution', minimumItems] as const,
    inventoryDistribution: ['dashboard', 'inventory-distribution'] as const,
    translationMetrics: ['dashboard', 'translation-metrics'] as const,
    tokenMetrics: (serviceProvider?: string) => ['dashboard', 'token-metrics', serviceProvider] as const,
    multiServiceUsage: (selectedService?: string, timeRange?: string) => ['dashboard', 'multi-service-usage', selectedService, timeRange] as const,
    translationPerformance: (timeRange?: string) => ['dashboard', 'translation-performance', timeRange] as const,
  },
  // Reserve space for other feature query keys
  categories: {
    all: ['categories'] as const,
    byId: (id: number) => ['categories', id] as const,
  },
  foodItems: {
    all: ['food-items'] as const,
    byId: (id: number) => ['food-items', id] as const,
  },
} as const;
