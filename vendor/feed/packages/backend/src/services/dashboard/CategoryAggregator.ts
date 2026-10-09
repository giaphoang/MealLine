// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseAggregationService, DashboardResponse } from './BaseAggregationService';

export interface CategoryDistribution {
  categoryId: number;
  categoryName: string;
  itemCount: number;
  percentage: number;
  isNoLimit: boolean;
  globalLimit?: number;
  createdAt: string;
}

export interface CategoryDistributionMetrics {
  categories: CategoryDistribution[];
  totalItems: number;
  totalCategories: number;
  averageItemsPerCategory: number;
  minimumThreshold: number;
}

/**
 * Aggregator for category distribution and item count analysis
 */
export class CategoryAggregator extends BaseAggregationService {
  constructor() {
    super('CategoryAggregator');
  }

  /**
   * Get category distribution with item counts and optional time filtering
   */
  async getCategoryDistribution(
    timeRange?: string,
    minimumThreshold: number = 1
  ): Promise<DashboardResponse<CategoryDistributionMetrics>> {
    const resolvedTimeRange = this.resolveTimeRange(timeRange);
    
    return this.executeAggregation(async () => {
      // Get categories with food item counts
      const categoriesWithCounts = await this.getCategoriesWithItemCounts(
        resolvedTimeRange,
        minimumThreshold
      );
      
      // Calculate totals and averages
      const totalItems = categoriesWithCounts.reduce((sum, cat) => sum + cat.itemCount, 0);
      const totalCategories = categoriesWithCounts.length;
      const averageItemsPerCategory = totalCategories > 0 
        ? Math.round((totalItems / totalCategories) * 10) / 10 
        : 0;
      
      // Calculate percentages
      const distribution = this.calculateDistribution(
        categoriesWithCounts.reduce((acc, cat) => {
          acc[cat.categoryName] = cat.itemCount;
          return acc;
        }, {} as Record<string, number>)
      );
      
      // Map to final structure with percentages
      const categories: CategoryDistribution[] = categoriesWithCounts.map(cat => ({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        itemCount: cat.itemCount,
        percentage: distribution[cat.categoryName]?.percentage || 0,
        isNoLimit: cat.isNoLimit,
        globalLimit: cat.globalLimit,
        createdAt: cat.createdAt
      }));
      
      // Sort by item count descending
      categories.sort((a, b) => b.itemCount - a.itemCount);
      
      return {
        categories,
        totalItems,
        totalCategories,
        averageItemsPerCategory,
        minimumThreshold
      };
    }, resolvedTimeRange);
  }

  /**
   * Get categories with their food item counts
   */
  private async getCategoriesWithItemCounts(
    timeRange: { startDate: Date; endDate: Date; label: string },
    minimumThreshold: number
  ) {
    // Build time filter for food items if applicable
    const foodItemWhere = this.applyTimeFilter({}, timeRange);
    
    // Get categories with item counts using raw query for performance
    let categoriesWithCounts;
    
    if (timeRange.label !== 'all-time') {
      categoriesWithCounts = await this.db.$queryRaw<Array<{
        categoryId: number;
        categoryName: string;
        itemCount: bigint;
        limit: number;
        createdAt: Date;
      }>>`
        SELECT 
          c.id as categoryId,
          c.name as categoryName,
          COUNT(fi.id) as itemCount,
          c."limit",
          c."createdAt"
        FROM "Category" c
        LEFT JOIN "FoodItem" fi ON c.id = fi."categoryId"
          AND fi."createdAt" >= ${timeRange.startDate.toISOString()}
          AND fi."createdAt" <= ${timeRange.endDate.toISOString()}
        GROUP BY c.id, c.name, c."limit", c."createdAt"
        HAVING COUNT(fi.id) >= ${minimumThreshold}
        ORDER BY COUNT(fi.id) DESC
      `;
    } else {
      categoriesWithCounts = await this.db.$queryRaw<Array<{
        categoryId: number;
        categoryName: string;
        itemCount: bigint;
        limit: number;
        createdAt: Date;
      }>>`
        SELECT 
          c.id as categoryId,
          c.name as categoryName,
          COUNT(fi.id) as itemCount,
          c."limit",
          c."createdAt"
        FROM "Category" c
        LEFT JOIN "FoodItem" fi ON c.id = fi."categoryId"
        GROUP BY c.id, c.name, c."limit", c."createdAt"
        HAVING COUNT(fi.id) >= ${minimumThreshold}
        ORDER BY COUNT(fi.id) DESC
      `;
    }
    
    // Convert BigInt to number and format dates
    return categoriesWithCounts.map(cat => ({
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      itemCount: Number(cat.itemCount),
      // FEED's persisted No Limit sentinel is 100 (shared with category and
      // food-item forms plus Shopping List generation).
      isNoLimit: cat.limit === 100,
      globalLimit: cat.limit,
      createdAt: cat.createdAt.toISOString()
    }));
  }

  /**
   * Get category trend analysis comparing periods
   */
  async getCategoryTrends(
    timeRange?: string
  ): Promise<DashboardResponse<Array<{
    categoryId: number;
    categoryName: string;
    currentCount: number;
    previousCount: number;
    trend: number;
    trendDirection: 'up' | 'down' | 'stable';
  }>>> {
    const resolvedTimeRange = this.resolveTimeRange(timeRange);
    
    return this.executeAggregation(async () => {
      // Get current period data
      const currentData = await this.getCategoriesWithItemCounts(resolvedTimeRange, 0);
      
      // Calculate previous period
      const periodDuration = resolvedTimeRange.endDate.getTime() - resolvedTimeRange.startDate.getTime();
      const previousTimeRange = {
        startDate: new Date(resolvedTimeRange.startDate.getTime() - periodDuration),
        endDate: new Date(resolvedTimeRange.endDate.getTime() - periodDuration),
        label: `previous-${resolvedTimeRange.label}`
      };
      
      const previousData = await this.getCategoriesWithItemCounts(previousTimeRange, 0);
      const previousMap = new Map(previousData.map(cat => [cat.categoryId, cat.itemCount]));
      
      // Calculate trends
      return currentData.map(cat => {
        const previousCount = previousMap.get(cat.categoryId) || 0;
        const trend = this.calculateGrowthRate(cat.itemCount, previousCount);
        
        let trendDirection: 'up' | 'down' | 'stable';
        if (Math.abs(trend) < 5) { // Less than 5% change considered stable
          trendDirection = 'stable';
        } else if (trend > 0) {
          trendDirection = 'up';
        } else {
          trendDirection = 'down';
        }
        
        return {
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          currentCount: cat.itemCount,
          previousCount,
          trend,
          trendDirection
        };
      }).sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend)); // Sort by trend magnitude
    }, resolvedTimeRange);
  }
}
