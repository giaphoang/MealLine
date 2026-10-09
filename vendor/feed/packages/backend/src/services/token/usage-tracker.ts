// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import prisma from '../../db';

/**
 * Service for tracking API usage
 */
export class ApiUsageTracker {
  /**
   * Log a new API request with token usage
   */
  static async logApiUsage(
    promptTokens: number,
    completionTokens: number,
    model: string = 'unknown',
    endpoint: string = 'completion'
  ): Promise<void> {
    const totalTokens = promptTokens + completionTokens;
    
    try {
      // Check if the ApiUsageLog table exists by trying to access it
      await prisma.apiUsageLog.findFirst({ take: 1 });
      
      // If we get here, the table exists, so we can create a record
      await prisma.apiUsageLog.create({
        data: {
          model,
          promptTokens,
          completionTokens,
          totalTokens,
          endpoint,
          timestamp: new Date()
        }
      });
    } catch (error) {
      // If Prisma throws an error about the model not existing,
      // we'll silently ignore it since the migration hasn't been run yet
      if (error instanceof Error && 
          (error.message.includes("doesn't exist") || 
           error.message.includes("no such table") ||
           error.message.includes("ApiUsageLog"))) {
        console.warn('ApiUsageLog table not found, skipping usage logging');
        return;
      }
      
      console.error('Error logging API usage:', error);
      // Don't throw - this is non-critical logging
    }
  }

  /**
   * Get tokens per minute (TPM) for the current minute
   */
  static async getTokensPerMinute(): Promise<number> {
    try {
      // Check if the ApiUsageLog table exists
      await prisma.apiUsageLog.findFirst({ take: 1 });
      
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      
      const result = await prisma.apiUsageLog.aggregate({
        where: {
          timestamp: { gte: oneMinuteAgo }
        },
        _sum: {
          totalTokens: true
        }
      });
      
      return result._sum.totalTokens || 0;
    } catch (error) {
      // If table doesn't exist, return 0
      return 0;
    }
  }

  /**
   * Get requests per minute (RPM) for the current minute
   */
  static async getRequestsPerMinute(): Promise<number> {
    try {
      // Check if the ApiUsageLog table exists
      await prisma.apiUsageLog.findFirst({ take: 1 });
      
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      
      const result = await prisma.apiUsageLog.count({
        where: {
          timestamp: { gte: oneMinuteAgo }
        }
      });
      
      return result;
    } catch (error) {
      // If table doesn't exist, return 0
      return 0;
    }
  }

  /**
   * Get requests per day (RPD) for the current day
   */
  static async getRequestsPerDay(): Promise<number> {
    try {
      // Check if the ApiUsageLog table exists
      await prisma.apiUsageLog.findFirst({ take: 1 });
      
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      
      const result = await prisma.apiUsageLog.count({
        where: {
          timestamp: { gte: startOfDay }
        }
      });
      
      return result;
    } catch (error) {
      // If table doesn't exist, return 0
      return 0;
    }
  }

  /**
   * Get all metrics in a single call
   */
  static async getAllMetrics(): Promise<{
    tokensPerMinute: number;
    requestsPerMinute: number;
    requestsPerDay: number;
  }> {
    try {
      // Try a quick check if the table exists
      await prisma.apiUsageLog.findFirst({ take: 1 });
      
      // If we get here, get all metrics in parallel
      const [tpm, rpm, rpd] = await Promise.all([
        this.getTokensPerMinute(),
        this.getRequestsPerMinute(),
        this.getRequestsPerDay()
      ]);
      
      return {
        tokensPerMinute: tpm,
        requestsPerMinute: rpm,
        requestsPerDay: rpd
      };
    } catch (error) {
      // Handle case where table doesn't exist yet
      console.warn('ApiUsageLog table not found, returning zero metrics');
      return {
        tokensPerMinute: 0,
        requestsPerMinute: 0,
        requestsPerDay: 0
      };
    }
  }
}

export default ApiUsageTracker;
