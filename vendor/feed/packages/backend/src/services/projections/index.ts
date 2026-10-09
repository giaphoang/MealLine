// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { PrismaClient } from '@prisma/client';
import { convertToPerTokenRate } from '../token/calculation';
import { createRouteError } from '../../lib/route-error';

const prisma = new PrismaClient();

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
  totalTranslations: number;
  averagePromptTokens: number;
  averageCompletionTokens: number;
}

/**
 * Service for analyzing usage patterns and projecting future costs
 */
export class ProjectionService {
  private static instance: ProjectionService;

  private constructor() {}

  public static getInstance(): ProjectionService {
    if (!ProjectionService.instance) {
      ProjectionService.instance = new ProjectionService();
    }
    return ProjectionService.instance;
  }

  /**
   * Gets active AI configuration for cost calculations
   */
  private async getActiveConfig() {
    const config = await prisma.aIConfiguration.findFirst({
      where: {
        type: 'apikey',
        isActive: true
      }
    });
    
    if (!config) {
      throw createRouteError('No active AI configuration found. Please configure AI settings.', 409, 'AI_NOT_CONFIGURED');
    }
    
    return config;
  }

  /**
   * Calculates key usage statistics from UsageRecord table
   */
  async getUsageStats(days: number = 30): Promise<UsageStats> {
    const { UsageRecordService } = await import('../usage-record');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get usage records from the past specified days
    const usageRecords = await prisma.usageRecord.findMany({
      where: {
        timestamp: { gte: startDate }
      },
      select: {
        timestamp: true,
        promptTokens: true,
        completionTokens: true,
        totalCost: true
      },
      orderBy: {
        timestamp: 'asc'
      }
    });

    // Group by date with rounded token values
    const dailyUsage = usageRecords.reduce((acc, record) => {
      const date = record.timestamp.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = {
          tokens: 0,
          cost: 0
        };
      }
      // Round token values when adding
      acc[date].tokens += Math.round((record.promptTokens || 0) + (record.completionTokens || 0));
      acc[date].cost += record.totalCost || 0;
      return acc;
    }, {} as Record<string, { tokens: number; cost: number }>);

    // Calculate total operations (each UsageRecord represents one AI operation)
    const totalTranslations = usageRecords.length;
    
    // Calculate token averages with rounding
    const totalPromptTokens = usageRecords.reduce((sum, r) => sum + Math.round(r.promptTokens || 0), 0);
    const totalCompletionTokens = usageRecords.reduce((sum, r) => sum + Math.round(r.completionTokens || 0), 0);
    
    // Ensure whole number averages for tokens
    const averagePromptTokens = totalTranslations > 0 ? Math.round(totalPromptTokens / totalTranslations) : 0;
    const averageCompletionTokens = totalTranslations > 0 ? Math.round(totalCompletionTokens / totalTranslations) : 0;
    
    // Calculate daily values with rounding
    const dailyValues = Object.values(dailyUsage);
    const dailyAverage = Math.round(
      dailyValues.reduce((sum, day) => sum + day.tokens, 0) / (dailyValues.length || 1)
    );
    const peakUsage = dailyValues.length > 0 ? Math.max(...dailyValues.map(day => day.tokens)) : 0;
    const totalSpent = dailyValues.reduce((sum, day) => sum + day.cost, 0);
    const activeDays = dailyValues.length;

    // Calculate growth rates
    const weeklyGrowth = this.calculateGrowthRate(dailyValues, 7);
    const monthlyGrowth = this.calculateGrowthRate(dailyValues, 30);

    return {
      dailyAverage,
      weeklyGrowth,
      monthlyGrowth,
      peakUsage,
      totalSpent,
      activeDays,
      totalTranslations,
      averagePromptTokens,
      averageCompletionTokens
    };
  }

  /**
   * Projects future costs based on historical data
   */
  async projectCosts(daysAhead: number = 30): Promise<{ projections: CostProjection[]; isCostFree: boolean; hasUsageData: boolean }> {
    const [stats, config] = await Promise.all([
      this.getUsageStats(),
      this.getActiveConfig()
    ]);
    
    const projections: CostProjection[] = [];
    const today = new Date();

    // Calculate weighted average rate from active configuration
    const inputCostPerToken = convertToPerTokenRate(config.inputCost || 0, config.unitPrice);
    const outputCostPerToken = convertToPerTokenRate(config.outputCost || 0, config.unitPrice);
    
    // Weighted average based on typical prompt:completion ratio (~1:1.5)
    const WEIGHTED_RATE = (inputCostPerToken * 0.4) + (outputCostPerToken * 0.6);
    const isCostFree = WEIGHTED_RATE === 0;
    const hasUsageData = stats.totalTranslations > 0;
    
    for (let i = 1; i <= daysAhead; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);

      // Calculate projected tokens with growth rate and ensure whole numbers
      const projectedTokens = Math.round(
        stats.dailyAverage * Math.pow(1 + stats.monthlyGrowth / 30, i)
      );

      // Calculate cost with actual rates
      const projectedCost = projectedTokens * WEIGHTED_RATE;

      // Calculate bounds (wider as we look further ahead)
      const uncertaintyFactor = 1 + (i / daysAhead) * 0.5; // Increases up to 50% by end
      const lowerBound = projectedCost / uncertaintyFactor;
      const upperBound = projectedCost * uncertaintyFactor;

      // Calculate confidence (decreases as we look further ahead)
      const confidence = Math.max(0.5, 1 - (i / daysAhead) * 0.5) * 100;

      projections.push({
        date: date.toISOString().split('T')[0],
        projectedTokens,
        projectedCost,
        lowerBound,
        upperBound,
        confidence
      });
    }

    return { projections, isCostFree, hasUsageData };
  }

  /**
   * Calculates growth rate over a given period
   */
  private calculateGrowthRate(data: { tokens: number }[], period: number): number {
    if (data.length < period * 2) {
      return 0; // Not enough data
    }

    const recentAvg = Math.round(
      data.slice(-period).reduce((sum, day) => sum + day.tokens, 0) / period
    );
    
    const previousAvg = Math.round(
      data.slice(-period * 2, -period).reduce((sum, day) => sum + day.tokens, 0) / period
    );

    if (previousAvg === 0) return 0;
    return (recentAvg - previousAvg) / previousAvg;
  }

  /**
   * Suggests cost optimization strategies based on usage patterns
   */
  async suggestOptimizations(): Promise<string[]> {
    const stats = await this.getUsageStats();
    const suggestions: string[] = [];

    // Example suggestions based on usage patterns
    if (stats.monthlyGrowth > 0.2) { // 20% monthly growth
      suggestions.push(
        'Usage is growing rapidly. Consider implementing token limits or optimizing prompts to control costs.'
      );
    }

    if (stats.peakUsage > stats.dailyAverage * 2) {
      suggestions.push(
        'High variation in daily usage. Consider spreading workload more evenly or implementing rate limiting.'
      );
    }

    const avgCostPerToken = stats.totalSpent / (stats.dailyAverage * 30);
    if (avgCostPerToken > 0.00002) { // $0.02 per 1K tokens
      suggestions.push(
        'Higher than average cost per token. Consider using a more cost-effective model for appropriate tasks.'
      );
    }

    return suggestions;
  }
}

// Export singleton instance
export const projectionService = ProjectionService.getInstance();
