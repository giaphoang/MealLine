// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useQuery } from '@tanstack/react-query';
import { ServiceProvider } from '@/types/multi-service-usage';
import { multiServiceUsageService } from '@/services/multi-service-usage';
import { useMessage } from '@/hooks/message/useMessage';
import { queryKeys } from '@/lib/react-query';
import { systemStatusService } from '@/services/system';

export interface PerformanceData {
  date: string;
  responseTime: number; // in milliseconds
  cost: number; // in USD
  promptTokens: number;
  completionTokens: number;
  operationsCount: number;
  serviceType: ServiceProvider;
  configurationName: string;
  model: string;
}

export interface ServicePerformanceMetrics {
  serviceType: ServiceProvider;
  configurationName: string;
  model: string;
  data: PerformanceData[];
  totals: {
    cost: number;
    responseTime: number; // average
    operations: number;
    tokens: number;
  };
}

export interface MultiServicePerformanceData {
  services: ServicePerformanceMetrics[];
  aggregated: PerformanceData[];
  configurations: any[]; // Raw configurations for state checking
  lastUpdated: string;
}

/**
 * Generate performance data from real usage metrics and backend performance data
 */
function generatePerformanceDataFromUsage(usageData: any, timeRange: string): MultiServicePerformanceData {
  const services: ServicePerformanceMetrics[] = [];
  
  // Use real backend data if available
  if (!usageData || !usageData.configurations) {
    return {
      services: [],
      aggregated: [],
      configurations: [], // No configurations available
      lastUpdated: new Date().toISOString()
    };
  }

  // Process each configuration from real data
  usageData.configurations.forEach((configData: any) => {
    const performanceData = createServicePerformanceFromReal(
      configData.serviceType as ServiceProvider,
      configData.configurationName,
      configData.model,
      configData.historicalData || [],
      usageData.performance || null,
      usageData.performanceByService
    );
    
    if (performanceData) {
      services.push(performanceData);
    }
  });

  // Generate aggregated data from real backend performance metrics
  const aggregated = createAggregatedDataFromBackend(usageData.performance, services);

  return {
    services,
    aggregated,
    configurations: usageData.configurations || [], // Pass through raw configurations
    lastUpdated: usageData.lastUpdated || new Date().toISOString()
  };
}

/**
 * Create service performance data from real usage records and backend performance data
 */
function createServicePerformanceFromReal(
  serviceType: ServiceProvider,
  configName: string,
  model: string,
  historicalData: any[],
  performanceData: any,
  performanceByService?: any
): ServicePerformanceMetrics | null {
  const data: PerformanceData[] = [];
  
  let totalCost = 0;
  let totalOperations = 0;
  let totalTokens = 0;
  
  // Use service-specific performance data if available
  const servicePerformance = performanceByService?.[serviceType];
  
  // Use real response time data from backend (service-specific or overall)
  const responseTimeData = servicePerformance?.responseTimeData || performanceData?.responseTimeData || [];
  const responseTimeMap = new Map(responseTimeData.map((item: any) => [item.date, item.responseTime]));
  
  // Use service-specific average response time when available, fall back to overall
  const averageResponseTime = servicePerformance?.averageResponseTime || 
                             performanceData?.averageResponseTime || 
                             0;

  // Process each day of historical data
  historicalData.forEach((dayData: any) => {
    // Skip days without usage data
    if (!dayData || dayData.usage === 0) {
      return;
    }
    
    // Use real response time from backend data or average as fallback
    const responseTime = responseTimeMap.get(dayData.date) || averageResponseTime;
    
    // Estimate prompt/completion token breakdown (60/40 split typical for translation)
    const promptTokens = Math.floor(dayData.usage * 0.6);
    const completionTokens = Math.floor(dayData.usage * 0.4);
    
    // Use real cost from backend
    const cost = dayData.cost;
    
    // Estimate operations count from token usage (avg ~200 tokens per operation)
    const operationsCount = Math.max(1, Math.floor(dayData.usage / 200));
    
    // Backend now provides timezone-aware dates - use directly
    const date = new Date(dayData.date + 'T00:00:00.000Z');
    
    data.push({
      date: date.toISOString(),
      responseTime,
      cost,
      promptTokens,
      completionTokens,
      operationsCount,
      serviceType,
      configurationName: configName,
      model
    });
    
    // Accumulate totals
    totalCost += cost;
    totalOperations += operationsCount;
    totalTokens += dayData.usage;
  });
  
  // Return null if no real data found
  if (data.length === 0) {
    return null;
  }

  return {
    serviceType,
    configurationName: configName,
    model,
    data,
    totals: {
      cost: totalCost,
      responseTime: averageResponseTime, // Use real average from backend
      operations: totalOperations,
      tokens: totalTokens
    }
  };
}

/**
 * Create aggregated performance data from backend performance metrics
 */
function createAggregatedDataFromBackend(
  performanceData: any,
  services: ServicePerformanceMetrics[]
): PerformanceData[] {
  const aggregated: PerformanceData[] = [];
  
  // If no performance data from backend, return empty array
  if (!performanceData || !performanceData.responseTimeData) {
    return [];
  }
  
  // Create a date map to track all dates with data
  const dateMap = new Map<string, PerformanceData[]>();
  
  // Collect all data points by date from services
  services.forEach(service => {
    service.data.forEach(dataPoint => {
      const dateKey = dataPoint.date.split('T')[0];
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, []);
      }
      dateMap.get(dateKey)!.push(dataPoint);
    });
  });
  
  // Process each date with data, using real response times from backend
  const responseTimeMap = new Map(performanceData.responseTimeData.map((item: any) => [item.date, item.responseTime]));
  
  for (const [dateKey, dayData] of dateMap.entries()) {
    if (dayData.length > 0) {
      // Use real response time from backend
      const responseTime = responseTimeMap.get(dateKey) || performanceData.averageResponseTime || 0;
      
      // Aggregate metrics across all services for this day
      const totalCost = dayData.reduce((sum, d) => sum + d.cost, 0);
      const totalOperations = dayData.reduce((sum, d) => sum + d.operationsCount, 0);
      const totalPromptTokens = dayData.reduce((sum, d) => sum + d.promptTokens, 0);
      const totalCompletionTokens = dayData.reduce((sum, d) => sum + d.completionTokens, 0);
      
      // Backend provides timezone-aware dates - use from first data point
      const date = new Date(dayData[0].date);
      
      aggregated.push({
        date: date.toISOString(),
        responseTime: Math.round(responseTime),
        cost: totalCost,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        operationsCount: totalOperations,
        serviceType: 'OpenAI', // Placeholder for aggregated view
        configurationName: 'All Services',
        model: 'Multiple Models'
      });
    }
  }
  
  // Sort by date
  return aggregated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function useMultiServiceTranslationPerformance(timeRange: string = '30d') {
  const { showError } = useMessage();

  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: queryKeys.dashboard.translationPerformance(timeRange),
    queryFn: async () => {
      try {
        // Phase 4: Use real multi-service usage data with performance metrics
        const usageData = await multiServiceUsageService.getUsageMetrics(undefined, timeRange);
        return generatePerformanceDataFromUsage(usageData, timeRange);
      } catch (err) {
        console.error('Error fetching multi-service performance data:', err);
        
        // Check if this is a startup condition before showing error
        try {
          const startupStatus = await systemStatusService.getStartupStatus();
          if (startupStatus.isStartupCondition) {
            // Return empty data structure for startup condition - no error shown
            return {
              services: [],
              aggregated: [],
              configurations: [], // No configurations in startup state
              lastUpdated: new Date().toISOString()
            };
          }
        } catch (statusError) {
          console.error('Failed to check startup status:', statusError);
          // If we can't check startup status, proceed with error handling
        }
        
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch performance metrics';
        showError('Failed to load multi-service performance metrics');
        throw new Error(errorMessage);
      }
    },
    // React Query 5 Native Refetch Pattern
    refetchOnMount: 'always',
    staleTime: 0, // Force fresh data on dashboard load
    gcTime: 5 * 60 * 1000, // Maintain cache for navigation
    refetchInterval: 2 * 60 * 1000, // 2 minutes - performance data changes moderately
    refetchOnWindowFocus: true,
  });

  return { 
    data: data || null, 
    isLoading, 
    error: error as Error | null,
    refetch
  };
}

/**
 * Get performance data filtered by selected service
 */
export function getFilteredPerformanceData(
  data: MultiServicePerformanceData | null,
  selectedService: ServiceProvider | 'all'
): PerformanceData[] {
  if (!data) return [];
  
  if (selectedService === 'all') {
    return data.aggregated;
  }
  
  const serviceMetrics = data.services.find(service => service.serviceType === selectedService);
  return serviceMetrics?.data || [];
}

/**
 * Get service totals for metric display
 */
export function getServiceTotals(
  data: MultiServicePerformanceData | null,
  selectedService: ServiceProvider | 'all'
) {
  if (!data) {
    return { cost: 0, responseTime: 0, operations: 0, tokens: 0 };
  }
  
  if (selectedService === 'all') {
    // Aggregate totals across all services
    const totals = data.services.reduce(
      (acc, service) => ({
        cost: acc.cost + service.totals.cost,
        responseTime: acc.responseTime + service.totals.responseTime,
        operations: acc.operations + service.totals.operations,
        tokens: acc.tokens + service.totals.tokens
      }),
      { cost: 0, responseTime: 0, operations: 0, tokens: 0 }
    );
    
    // Average response time across services
    totals.responseTime = data.services.length > 0 ? totals.responseTime / data.services.length : 0;
    
    return totals;
  }
  
  const serviceMetrics = data.services.find(service => service.serviceType === selectedService);
  return serviceMetrics?.totals || { cost: 0, responseTime: 0, operations: 0, tokens: 0 };
}
