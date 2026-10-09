// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseAggregationService, DashboardResponse } from './BaseAggregationService';

export interface TranslationMetrics {
  total: number;
  successRate: number;
  averageResponseTime: number;
  totalCost: number;
  statusCounts?: {
    completed: number;
    pending: number;
    failed: number;
  };
  byLanguage: Array<{
    languageCode: string;
    languageName: string;
    count: number;
    successRate: number;
    averageResponseTime: number;
    cost: number;
  }>;
  byService: Array<{
    serviceProvider: string;
    count: number;
    successRate: number;
    averageResponseTime: number;
    cost: number;
    configurations: Array<{
      configurationId: number;
      configurationName: string;
      model: string;
      count: number;
      successRate: number;
      averageResponseTime: number;
      cost: number;
    }>;
  }>;
  performance: {
    dailyTrends: Array<{
      date: string;
      count: number;
      successRate: number;
      averageResponseTime: number;
      cost: number;
    }>;
    responseTimeRange: {
      min: number;
      max: number;
      p50: number;
      p95: number;
    };
  };
}

/**
 * Aggregator for translation performance and usage metrics
 */
export class TranslationAggregator extends BaseAggregationService {
  constructor() {
    super('TranslationAggregator');
  }

  /**
   * Get comprehensive translation metrics with optional time filtering
   */
  async getTranslationMetrics(timeRange?: string): Promise<DashboardResponse<TranslationMetrics>> {
    const resolvedTimeRange = this.resolveTimeRange(timeRange);
    
    return this.executeAggregation(async () => {
      const [
        overallMetrics,
        languageBreakdown,
        serviceBreakdown,
        performanceMetrics
      ] = await Promise.all([
        this.getOverallMetrics(resolvedTimeRange),
        this.getLanguageBreakdown(resolvedTimeRange),
        this.getServiceBreakdown(resolvedTimeRange),
        this.getPerformanceMetrics(resolvedTimeRange)
      ]);

      return {
        total: overallMetrics.total,
        successRate: overallMetrics.successRate,
        averageResponseTime: overallMetrics.averageResponseTime,
        totalCost: overallMetrics.totalCost,
        statusCounts: overallMetrics.statusCounts,
        byLanguage: languageBreakdown,
        byService: serviceBreakdown,
        performance: performanceMetrics
      };
    }, resolvedTimeRange);
  }

  /**
   * Get overall translation metrics (hybrid source)
   * - Success rate and total come from Translation table (current state)
   * - Response time and cost come from UsageRecord (performance/cost telemetry)
   */
  private async getOverallMetrics(timeRange: { startDate: Date; endDate: Date; label: string }) {
    // 1) Current state from Translation table
    const translationWhere = this.applyTimeFilter({}, timeRange); // defaults to createdAt

    // 2) Performance/cost from UsageRecord telemetry
    const usageWhere = this.applyTimeFilter(
      {
        operationType: { in: ['translation', 'batch'] },
        language: { not: null }
      },
      timeRange,
      'timestamp'
    );

    const [
      // Translation table truth for success rate / status breakdown
      totalTranslations,
      completedTranslations,
      pendingTranslations,
      failedTranslations,
      // Usage telemetry for performance/cost
      usageStats
    ] = await Promise.all([
      this.db.translation.count({ where: translationWhere }),
      this.db.translation.count({ where: { ...translationWhere, status: 'completed' } }),
      this.db.translation.count({ where: { ...translationWhere, status: 'pending' } }),
      this.db.translation.count({ where: { ...translationWhere, status: 'failed' } }),
      this.db.usageRecord.aggregate({
        where: usageWhere,
        _avg: { duration: true },
        _sum: { totalCost: true }
      })
    ]);

    return {
      total: totalTranslations,
      successRate: this.calculateSuccessRate(completedTranslations, totalTranslations),
      averageResponseTime: Math.round(usageStats._avg.duration || 0),
      totalCost: usageStats._sum.totalCost || 0,
      statusCounts: {
        completed: completedTranslations,
        pending: pendingTranslations,
        failed: failedTranslations
      }
    };
  }

  /**
   * Get translation breakdown by language using direct UsageRecord queries
   */
  private async getLanguageBreakdown(timeRange: { startDate: Date; endDate: Date; label: string }) {
    // Build base where condition for UsageRecord with language-specific operations
    const usageWhere = this.applyTimeFilter(
      {
        operationType: { in: ['translation', 'batch'] }, // Include both individual and batch translations
        language: { not: null } // Only translation operations have language data
      },
      timeRange,
      'timestamp'
    );

    // Get usage stats grouped by language using direct UsageRecord queries
    const languageUsageStats = await this.db.usageRecord.groupBy({
      by: ['language'],
      where: usageWhere,
      _count: { id: true },
      _sum: { totalCost: true },
      _avg: { duration: true }
    });

    // Get success counts for each language
    const languageSuccessStats = await this.db.usageRecord.groupBy({
      by: ['language'],
      where: { ...usageWhere, success: true },
      _count: { id: true }
    });

    const successCountMap = new Map(languageSuccessStats.map(s => [s.language!, s._count.id]));

    // Get language names from Language table for display
    const enabledLanguages = await this.db.language.findMany({
      where: { isEnabled: true },
      select: { name: true }
    });
    const languageNameMap = new Map(enabledLanguages.map(l => [l.name, l.name]));

    // Transform the results to match the expected interface
    const languageBreakdown = languageUsageStats
      .filter(stat => stat.language) // Extra safety check for non-null languages
      .map(stat => {
        const language = stat.language!;
        const count = stat._count.id;
        const successCount = successCountMap.get(language) || 0;
        
        return {
          languageCode: language,
          languageName: languageNameMap.get(language) || language, // Use full name if available, fallback to code
          count,
          successRate: this.calculateSuccessRate(successCount, count),
          averageResponseTime: Math.round(stat._avg.duration || 0),
          cost: stat._sum.totalCost || 0
        };
      })
      .sort((a, b) => b.count - a.count); // Sort by count descending

    return languageBreakdown;
  }

  /**
   * Get translation breakdown by AI service and configuration
   */
  private async getServiceBreakdown(timeRange: { startDate: Date; endDate: Date; label: string }) {
    const usageWhere = this.applyTimeFilter(
      { 
        operationType: { in: ['translation', 'batch'] }, // Include both individual and batch translations
        language: { not: null } // Only translation operations (exclude classification)
      },
      timeRange,
      'timestamp'
    );
    
    // Get service-level aggregations
    const serviceStats = await this.db.usageRecord.groupBy({
      by: ['serviceProvider', 'aiConfigurationId'],
      where: usageWhere,
      _count: { id: true },
      _sum: { totalCost: true },
      _avg: { duration: true }
    });
    
    // Get success rates from related translations
    const serviceSuccessPromises = serviceStats.map(async (stat) => {
      const successCount = await this.db.usageRecord.count({
        where: {
          ...usageWhere,
          serviceProvider: stat.serviceProvider,
          aiConfigurationId: stat.aiConfigurationId,
          success: true
        }
      });
      
      return {
        serviceProvider: stat.serviceProvider,
        aiConfigurationId: stat.aiConfigurationId,
        count: stat._count.id,
        successCount,
        cost: stat._sum.totalCost || 0,
        averageResponseTime: Math.round(stat._avg.duration || 0)
      };
    });
    
    const serviceSuccessData = await Promise.all(serviceSuccessPromises);
    
    // Get configuration details
    const configIds = [...new Set(serviceSuccessData.map(s => s.aiConfigurationId))];
    const configurations = await this.db.aIConfiguration.findMany({
      where: { id: { in: configIds } },
      select: { id: true, name: true, model: true, serviceType: true }
    });
    
    const configMap = new Map(configurations.map(c => [c.id, c]));
    
    // Group by service provider
    const serviceGroups = new Map<string, any[]>();
    serviceSuccessData.forEach(stat => {
      if (!serviceGroups.has(stat.serviceProvider)) {
        serviceGroups.set(stat.serviceProvider, []);
      }
      serviceGroups.get(stat.serviceProvider)!.push(stat);
    });
    
    // Build final service breakdown
    return Array.from(serviceGroups.entries()).map(([serviceProvider, stats]) => {
      const totalCount = stats.reduce((sum, s) => sum + s.count, 0);
      const totalSuccess = stats.reduce((sum, s) => sum + s.successCount, 0);
      const totalCost = stats.reduce((sum, s) => sum + s.cost, 0);
      const avgResponseTime = stats.reduce((sum, s) => sum + s.averageResponseTime, 0) / stats.length;
      
      const configurations = stats.map(stat => {
        const config = configMap.get(stat.aiConfigurationId);
        return {
          configurationId: stat.aiConfigurationId,
          configurationName: config?.name || 'Unknown',
          model: config?.model || 'Unknown',
          count: stat.count,
          successRate: this.calculateSuccessRate(stat.successCount, stat.count),
          averageResponseTime: stat.averageResponseTime,
          cost: stat.cost
        };
      });
      
      return {
        serviceProvider,
        count: totalCount,
        successRate: this.calculateSuccessRate(totalSuccess, totalCount),
        averageResponseTime: Math.round(avgResponseTime),
        cost: totalCost,
        configurations
      };
    });
  }

  /**
   * Get performance metrics and trends
   */
  private async getPerformanceMetrics(timeRange: { startDate: Date; endDate: Date; label: string }) {
    const usageWhere = this.applyTimeFilter(
      { 
        operationType: { in: ['translation', 'batch'] }, // Include both individual and batch translations
        language: { not: null } // Only translation operations (exclude classification)
      },
      timeRange,
      'timestamp'
    );
    
    // Get daily trends using proper Prisma query building
    let dailyTrends;
    
    if (timeRange.label !== 'all-time') {
      dailyTrends = await this.db.$queryRaw<Array<{
        date: string;
        count: bigint;
        successCount: bigint;
        avgResponseTime: number;
        totalCost: number;
      }>>`
        SELECT 
          DATE(ur.timestamp) as date,
          COUNT(ur.id) as count,
          COUNT(CASE WHEN ur.success = true THEN 1 END) as successCount,
          AVG(ur.duration) as avgResponseTime,
          SUM(ur."totalCost") as totalCost
        FROM "UsageRecord" ur
        WHERE ur."operationType" IN ('translation', 'batch')
          AND ur.language IS NOT NULL
          AND ur.timestamp >= ${timeRange.startDate.toISOString()}
          AND ur.timestamp <= ${timeRange.endDate.toISOString()}
        GROUP BY DATE(ur.timestamp)
        ORDER BY DATE(ur.timestamp)
      `;
    } else {
      dailyTrends = await this.db.$queryRaw<Array<{
        date: string;
        count: bigint;
        successCount: bigint;
        avgResponseTime: number;
        totalCost: number;
      }>>`
        SELECT 
          DATE(ur.timestamp) as date,
          COUNT(ur.id) as count,
          COUNT(CASE WHEN ur.success = true THEN 1 END) as successCount,
          AVG(ur.duration) as avgResponseTime,
          SUM(ur."totalCost") as totalCost
        FROM "UsageRecord" ur
        WHERE ur."operationType" IN ('translation', 'batch')
          AND ur.language IS NOT NULL
        GROUP BY DATE(ur.timestamp)
        ORDER BY DATE(ur.timestamp)
      `;
    }
    
    // Get response time percentiles
    const responseTimeStats = await this.db.usageRecord.findMany({
      where: {
        ...usageWhere,
        duration: { not: null }
      },
      select: { duration: true },
      orderBy: { duration: 'asc' }
    });
    
    const responseTimes = responseTimeStats.map(r => r.duration!).sort((a, b) => a - b);
    const responseTimeRange = {
      min: responseTimes[0] || 0,
      max: responseTimes[responseTimes.length - 1] || 0,
      p50: responseTimes[Math.floor(responseTimes.length * 0.5)] || 0,
      p95: responseTimes[Math.floor(responseTimes.length * 0.95)] || 0
    };
    
    return {
      dailyTrends: dailyTrends.map(trend => ({
        date: trend.date,
        count: Number(trend.count),
        successRate: this.calculateSuccessRate(Number(trend.successCount), Number(trend.count)),
        averageResponseTime: Math.round(trend.avgResponseTime || 0),
        cost: trend.totalCost || 0
      })),
      responseTimeRange
    };
  }
}
