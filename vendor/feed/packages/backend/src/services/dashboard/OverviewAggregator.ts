// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseAggregationService, DashboardResponse } from './BaseAggregationService';

export interface OverviewMetrics {
  categories: {
    total: number;
    noLimitPercentage: number;
    trend?: number;
  };
  foodItems: {
    total: number;
    inStock: number;
    inStockPercentage: number;
    trend?: number;
  };
  languages: {
    total: number;
    active: number;
  };
  translations: {
    total: number;
    successRate: number;
    languageCount: number;
    trend?: number;
  };
}

/**
 * Aggregator for dashboard overview statistics
 */
export class OverviewAggregator extends BaseAggregationService {
  constructor() {
    super('OverviewAggregator');
  }

  /**
   * Get comprehensive overview metrics with optional time filtering
   */
  async getOverviewMetrics(timeRange?: string): Promise<DashboardResponse<OverviewMetrics>> {
    const resolvedTimeRange = this.resolveTimeRange(timeRange);
    
    return this.executeAggregation(async () => {
      // Execute all queries in parallel for performance
      const [
        categoryData,
        foodItemData,
        languageData,
        translationData,
        previousPeriodData
      ] = await Promise.all([
        this.getCategoryMetrics(resolvedTimeRange),
        this.getFoodItemMetrics(resolvedTimeRange),
        this.getLanguageMetrics(),
        this.getTranslationMetrics(resolvedTimeRange),
        this.getPreviousPeriodData(resolvedTimeRange)
      ]);

      // Calculate trends where applicable
      const overview: OverviewMetrics = {
        categories: {
          total: categoryData.total,
          noLimitPercentage: categoryData.noLimitPercentage,
          trend: this.calculateTrend(categoryData.total, previousPeriodData.categories)
        },
        foodItems: {
          total: foodItemData.total,
          inStock: foodItemData.inStock,
          inStockPercentage: foodItemData.inStockPercentage,
          trend: this.calculateTrend(foodItemData.total, previousPeriodData.foodItems)
        },
        languages: {
          total: languageData.total,
          active: languageData.active
        },
        translations: {
          total: translationData.total,
          successRate: translationData.successRate,
          languageCount: translationData.languageCount,
          trend: this.calculateTrend(translationData.total, previousPeriodData.translations)
        }
      };

      return overview;
    }, resolvedTimeRange);
  }

  /**
   * Get category metrics with time filtering and no-limit percentage
   */
  private async getCategoryMetrics(timeRange: { startDate: Date; endDate: Date; label: string }) {
    const where = this.applyTimeFilter({}, timeRange);
    
    const [total, noLimitCount] = await Promise.all([
      this.db.category.count({ where }),
      this.db.category.count({ where: { ...where, limit: 100 } })
    ]);
    
    const noLimitPercentage = total > 0 ? Math.round((noLimitCount / total) * 100) : 0;
    
    return { total, noLimitPercentage };
  }

  /**
   * Get food item metrics with time filtering and in-stock percentage
   */
  private async getFoodItemMetrics(timeRange: { startDate: Date; endDate: Date; label: string }) {
    const where = this.applyTimeFilter({}, timeRange);
    
    const [total, inStockItems] = await Promise.all([
      this.db.foodItem.count({ where }),
      this.db.foodItem.count({ 
        where: {
          ...where,
          isInStock: true
        }
      })
    ]);
    
    const inStockPercentage = total > 0 ? Math.round((inStockItems / total) * 100) : 0;
    
    return { total, inStock: inStockItems, inStockPercentage };
  }

  /**
   * Get language metrics (no time filtering - current state)
   */
  private async getLanguageMetrics() {
    const [total, active] = await Promise.all([
      this.db.language.count(),
      this.db.language.count({ where: { isEnabled: true } })
    ]);
    
    return { total, active };
  }

  /**
   * Get translation metrics with time filtering and success rate calculation
   */
  private async getTranslationMetrics(timeRange: { startDate: Date; endDate: Date; label: string }) {
    const where = this.applyTimeFilter({}, timeRange);
    
    const [total, completedTranslations, distinctLanguages] = await Promise.all([
      this.db.translation.count({ where }),
      this.db.translation.count({ 
        where: {
          ...where,
          status: 'completed'
        }
      }),
      this.db.translation.findMany({
        where,
        select: { language: true },
        distinct: ['language']
      })
    ]);
    
    const successRate = this.calculateSuccessRate(completedTranslations, total);
    const languageCount = distinctLanguages.length;
    
    return { total, successRate, languageCount };
  }

  /**
   * Get previous period data for trend calculations
   */
  private async getPreviousPeriodData(timeRange: { startDate: Date; endDate: Date; label: string }) {
    // Calculate previous period of same duration
    const periodDuration = timeRange.endDate.getTime() - timeRange.startDate.getTime();
    const previousStart = new Date(timeRange.startDate.getTime() - periodDuration);
    const previousEnd = new Date(timeRange.endDate.getTime() - periodDuration);
    
    const previousTimeRange = {
      startDate: previousStart,
      endDate: previousEnd,
      label: `previous-${timeRange.label}`
    };
    
    const [categoryData, foodItemData, translationData] = await Promise.all([
      this.getCategoryMetrics(previousTimeRange),
      this.getFoodItemMetrics(previousTimeRange),
      this.getTranslationMetrics(previousTimeRange)
    ]);
    
    return {
      categories: categoryData.total,
      foodItems: foodItemData.total,
      translations: translationData.total
    };
  }

  /**
   * Calculate trend percentage, handling edge cases
   */
  private calculateTrend(current: number, previous: number): number | undefined {
    if (previous === 0) {
      return current > 0 ? 100 : undefined;
    }
    return this.calculateGrowthRate(current, previous);
  }
}
