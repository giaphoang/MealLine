// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import prisma from '../../db';
import { AIConfiguration, UsageRecord } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'crypto';

type CapturedRecord = Pick<UsageRecord, 'id' | 'promptTokens' | 'completionTokens' | 'totalCost' | 'success'>;
const usageCapture = new AsyncLocalStorage<{ records: CapturedRecord[]; writeFailed: boolean }>();

export interface UsageMetrics {
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  duration?: number;        // Response time in milliseconds
  success?: boolean; // Track operation success/failure
}

export interface ConfigurationSnapshot {
  serviceType: string;
  model: string;
  inputCost: number;
  outputCost: number;
  unitPrice: string;
  tokensPerMinute?: number;
  requestsPerMinute?: number;
  requestsPerDay?: number;
  timestamp: string;
}

interface CachedSnapshot {
  hash: string;
  snapshot: ConfigurationSnapshot;
  lastUsed: number;
}

/**
 * Configuration Snapshot Cache for optimizing pricing preservation
 * Implements LRU cache to reduce redundant snapshot creation
 */
class ConfigurationSnapshotCache {
  private static cache = new Map<number, CachedSnapshot>();
  private static readonly MAX_CACHE_SIZE = 100;
  private static readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Creates a hash of configuration fields that affect pricing and limits
   */
  private static createConfigHash(config: AIConfiguration): string {
    const hashFields = {
      serviceType: config.serviceType,
      model: config.model,
      inputCost: config.inputCost,
      outputCost: config.outputCost,
      unitPrice: config.unitPrice,
      tokensPerMinute: config.tokensPerMinute,
      requestsPerMinute: config.requestsPerMinute,
      requestsPerDay: config.requestsPerDay,
      updatedAt: config.updatedAt.toISOString()
    };
    
    return crypto.createHash('sha256')
      .update(JSON.stringify(hashFields))
      .digest('hex');
  }

  /**
   * Creates a configuration snapshot from AIConfiguration
   */
  private static createSnapshot(config: AIConfiguration, modelUsed: string): ConfigurationSnapshot {
    return {
      serviceType: config.serviceType || 'Unknown',
      model: config.model || modelUsed,
      inputCost: config.inputCost || 0,
      outputCost: config.outputCost || 0,
      unitPrice: config.unitPrice || 'per_1k',
      tokensPerMinute: config.tokensPerMinute ?? undefined,
      requestsPerMinute: config.requestsPerMinute ?? undefined,
      requestsPerDay: config.requestsPerDay ?? undefined,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Evicts old entries to maintain cache size limit
   */
  private static evictOldEntries(): void {
    if (this.cache.size <= this.MAX_CACHE_SIZE) return;

    // Convert to array and sort by lastUsed (LRU)
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
    
    // Remove oldest entries until we're under the limit
    const toRemove = entries.slice(0, this.cache.size - this.MAX_CACHE_SIZE);
    toRemove.forEach(([configId]) => {
      this.cache.delete(configId);
    });
  }

  /**
   * Cleans up expired cache entries
   */
  private static cleanupExpired(): void {
    const now = Date.now();
    for (const [configId, cached] of this.cache.entries()) {
      if (now - cached.lastUsed > this.CACHE_TTL) {
        this.cache.delete(configId);
      }
    }
  }

  /**
   * Gets or creates a configuration snapshot with caching
   */
  static getOrCreateSnapshot(config: AIConfiguration, modelUsed: string): ConfigurationSnapshot {
    const configHash = this.createConfigHash(config);
    const cached = this.cache.get(config.id);
    
    // Return cached snapshot if hash matches (configuration unchanged)
    if (cached && cached.hash === configHash) {
      cached.lastUsed = Date.now();
      return cached.snapshot;
    }
    
    // Create new snapshot and cache it
    const snapshot = this.createSnapshot(config, modelUsed);
    this.cache.set(config.id, {
      hash: configHash,
      snapshot,
      lastUsed: Date.now()
    });
    
    // Perform cache maintenance
    this.evictOldEntries();
    this.cleanupExpired();
    
    return snapshot;
  }

  /**
   * Invalidates cache entry for a specific configuration
   */
  static invalidate(configId: number): void {
    this.cache.delete(configId);
  }

  /**
   * Clears entire cache (useful for testing or memory management)
   */
  static clear(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics for monitoring
   */
  static getStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: 0 // Would need hit/miss tracking for actual hit rate
    };
  }
}

/**
 * Service for tracking AI usage with persistent records linked to configurations
 */
export class UsageRecordService {
  /** Collect only persisted rows from this async operation, including failed replies.
   * Other requests and processes cannot enter this collection. No database schema change.
   */
  static async captureUsage<T>(work: () => Promise<T>): Promise<{ result: T; records: CapturedRecord[] }> {
    const capture = { records: [] as CapturedRecord[], writeFailed: false };
    return usageCapture.run(capture, async () => {
      const result = await work();
      if (capture.writeFailed) {
        throw new Error('Usage could not be recorded. Stop live testing and check the database before spending more.');
      }
      return { result, records: capture.records };
    });
  }
  
  /**
   * Creates a usage record with configuration snapshot
   */
  static async createUsageRecord(
    aiConfigurationId: number,
    configuration: AIConfiguration,
    operationType: 'translation' | 'classification' | 'batch',
    metrics: UsageMetrics,
    modelUsed: string,
    options?: {
      translationId?: number;
      documentId?: number;
      language?: string;
    }
  ): Promise<void> {
    try {
      // Get cached configuration snapshot to preserve pricing at time of operation
      const configSnapshot = ConfigurationSnapshotCache.getOrCreateSnapshot(configuration, modelUsed);

      const record = await prisma.usageRecord.create({
        data: {
          aiConfigurationId,
          configurationSnapshot: JSON.stringify(configSnapshot),
          operationType,
          promptTokens: metrics.promptTokens || 0,
          completionTokens: metrics.completionTokens || 0,
          totalCost: isNaN(metrics.totalCost) ? 0 : metrics.totalCost,
          success: metrics.success ?? true, // Default to true if not specified
          duration: metrics.duration, // Response time in milliseconds
          translationId: options?.translationId,
          documentId: options?.documentId,
          modelUsed,
          serviceProvider: configuration.serviceType || 'Unknown',
          language: options?.language // Target language for language-specific analytics
        }
      });
      usageCapture.getStore()?.records.push(record);
    } catch (error) {
      const capture = usageCapture.getStore();
      if (capture) capture.writeFailed = true;
      console.error('Error creating usage record:', error);
      // Don't throw - this is non-critical logging
    }
  }

  /**
   * Gets usage metrics for a specific service provider
   */
  static async getServiceUsageMetrics(
    serviceProvider: string,
    startDate?: Date,
    endDate?: Date
  ) {
    const where: any = { serviceProvider };
    
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const [usage, totalCount, successCount] = await Promise.all([
      prisma.usageRecord.aggregate({
        where,
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalCost: true
        }
      }),
      prisma.usageRecord.count({ where }),
      prisma.usageRecord.count({ where: { ...where, success: true } })
    ]);

    return {
      totalPromptTokens: usage._sum.promptTokens || 0,
      totalCompletionTokens: usage._sum.completionTokens || 0,
      totalCost: usage._sum.totalCost || 0,
      requestCount: totalCount,
      successRate: totalCount > 0 ? successCount / totalCount : 0
    };
  }

  /**
   * Gets usage metrics for all services with breakdown
   */
  static async getAllServiceUsageMetrics(startDate?: Date, endDate?: Date) {
    const where: any = {};
    
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    // Get usage grouped by service provider
    const serviceUsage = await prisma.usageRecord.groupBy({
      by: ['serviceProvider'],
      where,
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalCost: true
      },
      _count: {
        id: true
      }
    });

    // Get success counts for each service
    const successCounts = await prisma.usageRecord.groupBy({
      by: ['serviceProvider'],
      where: { ...where, success: true },
      _count: {
        id: true
      }
    });
    
    const successCountMap = new Map(successCounts.map(s => [s.serviceProvider, s._count.id]));

    return serviceUsage.map(service => ({
      serviceProvider: service.serviceProvider,
      totalPromptTokens: service._sum.promptTokens || 0,
      totalCompletionTokens: service._sum.completionTokens || 0,
      totalCost: service._sum.totalCost || 0,
      requestCount: service._count.id,
      successRate: service._count.id > 0 ? (successCountMap.get(service.serviceProvider) || 0) / service._count.id : 0
    }));
  }

  /**
   * Gets usage metrics for a specific AI configuration
   */
  static async getConfigurationUsageMetrics(
    aiConfigurationId: number,
    startDate?: Date,
    endDate?: Date
  ) {
    const where: any = { aiConfigurationId };
    
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const [usage, totalCount, successCount] = await Promise.all([
      prisma.usageRecord.aggregate({
        where,
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalCost: true
        }
      }),
      prisma.usageRecord.count({ where }),
      prisma.usageRecord.count({ where: { ...where, success: true } })
    ]);

    return {
      aiConfigurationId,
      totalPromptTokens: usage._sum.promptTokens || 0,
      totalCompletionTokens: usage._sum.completionTokens || 0,
      totalCost: usage._sum.totalCost || 0,
      requestCount: totalCount,
      successRate: totalCount > 0 ? successCount / totalCount : 0
    };
  }

  /**
   * Gets usage metrics for all configurations with breakdown
   */
  static async getAllConfigurationUsageMetrics(startDate?: Date, endDate?: Date) {
    const where: any = {};
    
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    // Get usage grouped by AI configuration ID
    const configUsage = await prisma.usageRecord.groupBy({
      by: ['aiConfigurationId'],
      where,
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalCost: true
      },
      _count: {
        id: true
      }
    });

    // Get success counts for each configuration
    const successCounts = await prisma.usageRecord.groupBy({
      by: ['aiConfigurationId'],
      where: { ...where, success: true },
      _count: {
        id: true
      }
    });
    
    const successCountMap = new Map(successCounts.map(s => [s.aiConfigurationId, s._count.id]));

    return configUsage.map(config => ({
      aiConfigurationId: config.aiConfigurationId,
      totalPromptTokens: config._sum.promptTokens || 0,
      totalCompletionTokens: config._sum.completionTokens || 0,
      totalCost: config._sum.totalCost || 0,
      requestCount: config._count.id,
      successRate: config._count.id > 0 ? (successCountMap.get(config.aiConfigurationId) || 0) / config._count.id : 0
    }));
  }

  /**
   * Gets historical usage data for charts with timezone-aware grouping
   */
  static async getHistoricalUsage(
    serviceProvider?: string,
    startDate?: Date,
    endDate?: Date,
    timezone?: string
  ) {
    const where: any = { 
      timestamp: { 
        gte: startDate,
        ...(endDate && { lte: endDate })
      } 
    };
    if (serviceProvider) {
      where.serviceProvider = serviceProvider;
    }

    // Get daily usage
    const usage = await prisma.usageRecord.findMany({
      where,
      select: {
        timestamp: true,
        promptTokens: true,
        completionTokens: true,
        totalCost: true,
        serviceProvider: true
      },
      orderBy: { timestamp: 'asc' }
    });

    // Group by user timezone date if timezone provided, otherwise use UTC date
    const dailyUsage = new Map<string, any>();
    
    usage.forEach(record => {
      // Convert UTC timestamp to user timezone date for grouping
      const date = timezone 
        ? this.convertUTCToUserDate(record.timestamp, timezone)
        : record.timestamp.toISOString().split('T')[0];
        
      if (!dailyUsage.has(date)) {
        dailyUsage.set(date, {
          date,
          totalTokens: 0,
          totalCost: 0,
          services: new Map()
        });
      }

      const dayData = dailyUsage.get(date)!;
      const totalTokens = record.promptTokens + record.completionTokens;
      
      dayData.totalTokens += totalTokens;
      dayData.totalCost += record.totalCost;

      // Track per-service data
      if (!dayData.services.has(record.serviceProvider)) {
        dayData.services.set(record.serviceProvider, {
          tokens: 0,
          cost: 0
        });
      }
      const serviceData = dayData.services.get(record.serviceProvider)!;
      serviceData.tokens += totalTokens;
      serviceData.cost += record.totalCost;
    });

    return Array.from(dailyUsage.values()).map(day => ({
      date: day.date,
      totalTokens: day.totalTokens,
      totalCost: day.totalCost,
      services: Object.fromEntries(day.services)
    }));
  }

  /**
   * Gets performance metrics including response time statistics with timezone-aware grouping
   */
  static async getPerformanceMetrics(
    serviceProvider?: string,
    startDate?: Date,
    endDate?: Date,
    timezone?: string
  ): Promise<{
    averageResponseTime: number;
    responseTimeRange: { min: number; max: number };
    responseTimeData?: Array<{ date: string; responseTime: number }>;
  }> {
    const where: any = {
      duration: { not: null }, // Only include records with duration data
      success: true // Only successful operations for performance metrics
    };
    
    if (serviceProvider) {
      where.serviceProvider = serviceProvider;
    }
    
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    // Get duration statistics
    const durationStats = await prisma.usageRecord.aggregate({
      where,
      _avg: {
        duration: true
      },
      _min: {
        duration: true
      },
      _max: {
        duration: true
      }
    });

    // Get daily average response times for trending
    const dailyPerformance = await prisma.usageRecord.findMany({
      where,
      select: {
        timestamp: true,
        duration: true
      },
      orderBy: { timestamp: 'asc' }
    });

    // Group by user timezone date if timezone provided, otherwise use UTC date
    const dailyAverages = new Map<string, { totalDuration: number; count: number }>();
    
    dailyPerformance.forEach(record => {
      if (record.duration) {
        // Convert UTC timestamp to user timezone date for grouping
        const date = timezone 
          ? this.convertUTCToUserDate(record.timestamp, timezone)
          : record.timestamp.toISOString().split('T')[0];
          
        if (!dailyAverages.has(date)) {
          dailyAverages.set(date, { totalDuration: 0, count: 0 });
        }
        const dayData = dailyAverages.get(date)!;
        dayData.totalDuration += record.duration;
        dayData.count += 1;
      }
    });

    const responseTimeData = Array.from(dailyAverages.entries()).map(([date, data]) => ({
      date,
      responseTime: Math.round(data.totalDuration / data.count)
    }));

    return {
      averageResponseTime: Math.round(durationStats._avg.duration || 0),
      responseTimeRange: {
        min: durationStats._min.duration || 0,
        max: durationStats._max.duration || 0
      },
      responseTimeData
    };
  }

  /**
   * Gets configuration snapshots to track pricing changes over time
   */
  static async getConfigurationHistory(aiConfigurationId: number, limit = 10) {
    const records = await prisma.usageRecord.findMany({
      where: { aiConfigurationId },
      select: {
        configurationSnapshot: true,
        timestamp: true
      },
      orderBy: { timestamp: 'desc' },
      take: limit
    });

    return records.map(record => ({
      ...JSON.parse(record.configurationSnapshot),
      usageTimestamp: record.timestamp
    }));
  }

  /**
   * Invalidates configuration snapshot cache for a specific configuration
   * Should be called when AI configurations are updated
   */
  static invalidateConfigurationCache(configId: number): void {
    ConfigurationSnapshotCache.invalidate(configId);
  }

  /**
   * Gets configuration snapshot cache statistics for monitoring
   */
  static getSnapshotCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return ConfigurationSnapshotCache.getStats();
  }

  /**
   * Converts UTC timestamp to user timezone date string (YYYY-MM-DD)
   * Used for timezone-aware data grouping
   */
  private static convertUTCToUserDate(utcTimestamp: Date, timezone: string): string {
    try {
      // Convert UTC timestamp to user's local date
      const userDate = new Date(utcTimestamp.toLocaleString('en-US', { timeZone: timezone }));
      
      // Format as YYYY-MM-DD
      const year = userDate.getFullYear();
      const month = String(userDate.getMonth() + 1).padStart(2, '0');
      const day = String(userDate.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.warn(`Failed to convert timestamp to timezone '${timezone}', using UTC:`, error);
      // Fallback to UTC date if timezone conversion fails
      return utcTimestamp.toISOString().split('T')[0];
    }
  }
}

export default UsageRecordService;
