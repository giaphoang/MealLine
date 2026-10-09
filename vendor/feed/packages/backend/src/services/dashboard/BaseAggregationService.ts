// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import prisma from '../../db';
import { DateRangeResolver } from '../../utils/dateRangeResolver';

export interface AggregationMetadata {
  lastUpdated: string;
  timeRange?: {
    startDate: string;
    endDate: string;
    label: string;
  };
  source: string;
  recordCount: number;
}

export interface DashboardResponse<T> {
  data: T;
  metadata: AggregationMetadata;
  performance: {
    responseTime: number;
    cacheHit: boolean;
  };
}

/**
 * Base aggregation service providing shared infrastructure for dashboard metrics
 */
export abstract class BaseAggregationService {
  protected serviceName: string;
  protected startTime: number = 0;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Start performance tracking for this aggregation
   */
  protected startPerformanceTracking(): void {
    this.startTime = Date.now();
  }

  /**
   * Resolve time range parameters using shared DateRangeResolver
   */
  protected resolveTimeRange(timeRange?: string): { startDate: Date; endDate: Date; label: string } {
    if (!timeRange) {
      return {
        startDate: new Date(0), // Beginning of time for all-time queries
        endDate: new Date(),    // Current time
        label: 'all-time'
      };
    }

    const dateRange = DateRangeResolver.resolveTimeRange(timeRange);
    return {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      label: timeRange
    };
  }

  /**
   * Create standardized metadata for aggregation responses
   */
  protected createMetadata(
    timeRange?: { startDate: Date; endDate: Date; label: string },
    recordCount: number = 0,
    cacheHit: boolean = false
  ): { metadata: AggregationMetadata; performance: { responseTime: number; cacheHit: boolean } } {
    const responseTime = Date.now() - this.startTime;
    
    return {
      metadata: {
        lastUpdated: new Date().toISOString(),
        timeRange: timeRange ? {
          startDate: timeRange.startDate.toISOString(),
          endDate: timeRange.endDate.toISOString(),
          label: timeRange.label
        } : undefined,
        source: this.serviceName,
        recordCount
      },
      performance: {
        responseTime,
        cacheHit
      }
    };
  }

  /**
   * Apply time filtering to Prisma where clause
   */
  protected applyTimeFilter(
    where: any,
    timeRange?: { startDate: Date; endDate: Date; label: string },
    timestampField: string = 'createdAt'
  ): any {
    if (!timeRange || timeRange.label === 'all-time') {
      return where;
    }

    return {
      ...where,
      [timestampField]: {
        gte: timeRange.startDate,
        lte: timeRange.endDate
      }
    };
  }

  /**
   * Execute aggregation with standardized error handling and performance tracking
   */
  protected async executeAggregation<T>(
    aggregationFunction: () => Promise<T>,
    timeRange?: { startDate: Date; endDate: Date; label: string }
  ): Promise<DashboardResponse<T>> {
    this.startPerformanceTracking();
    
    try {
      const data = await aggregationFunction();
      const { metadata, performance } = this.createMetadata(timeRange, 0, false);
      
      return {
        data,
        metadata,
        performance
      };
    } catch (error) {
      console.error(`Aggregation error in ${this.serviceName}:`, error);
      throw new Error(`Failed to aggregate ${this.serviceName} data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate growth rate between two periods
   */
  protected calculateGrowthRate(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  /**
   * Calculate success rate as percentage
   */
  protected calculateSuccessRate(successful: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((successful / total) * 100 * 10) / 10; // Round to 1 decimal
  }

  /**
   * Group database records by date
   */
  protected groupByDate<T extends { createdAt: Date }>(
    records: T[],
    dateExtractor?: (record: T) => Date
  ): Map<string, T[]> {
    const groupedData = new Map<string, T[]>();
    
    records.forEach(record => {
      const date = dateExtractor ? dateExtractor(record) : record.createdAt;
      const dateKey = date.toISOString().split('T')[0];
      
      if (!groupedData.has(dateKey)) {
        groupedData.set(dateKey, []);
      }
      groupedData.get(dateKey)!.push(record);
    });
    
    return groupedData;
  }

  /**
   * Calculate percentage distribution
   */
  protected calculateDistribution(counts: Record<string, number>): Record<string, { count: number; percentage: number }> {
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    
    if (total === 0) {
      return Object.keys(counts).reduce((acc, key) => {
        acc[key] = { count: 0, percentage: 0 };
        return acc;
      }, {} as Record<string, { count: number; percentage: number }>);
    }
    
    return Object.entries(counts).reduce((acc, [key, count]) => {
      acc[key] = {
        count,
        percentage: Math.round((count / total) * 100 * 10) / 10 // Round to 1 decimal
      };
      return acc;
    }, {} as Record<string, { count: number; percentage: number }>);
  }

  /**
   * Get database instance for derived classes
   */
  protected get db() {
    return prisma;
  }
}
