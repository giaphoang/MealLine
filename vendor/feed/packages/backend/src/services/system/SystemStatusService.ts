// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import prisma from '../../db';

export interface SystemStartupStatus {
  isStartupCondition: boolean;
  hasFoundationalData: boolean;
  hasUsageData: boolean;
  foundationalDataCounts: {
    categories: number;
    foodItems: number;
    languages: number;
  };
  usageDataCounts: {
    apiUsageLogs: number;
    usageRecords: number;
  };
  systemState: 'startup' | 'operational' | 'error';
}

/**
 * Service for detecting system startup conditions vs actual errors
 */
export class SystemStatusService {
  
  /**
   * Determines if system is in startup condition or has actual data issues
   * Startup condition = foundational data exists but usage data is empty
   * Error condition = foundational data is missing or insufficient
   */
  static async getStartupStatus(): Promise<SystemStartupStatus> {
    try {
      // Check foundational data in parallel
      const [categoriesCount, foodItemsCount, languagesCount] = await Promise.all([
        prisma.category.count(),
        prisma.foodItem.count(),
        prisma.language.count()
      ]);

      const foundationalDataCounts = {
        categories: categoriesCount,
        foodItems: foodItemsCount,
        languages: languagesCount
      };

      // Check usage data with fallback for missing tables
      const usageDataCounts = await this.getUsageDataCounts();

      // Determine if foundational data exists
      const hasFoundationalData = this.hasMinimumFoundationalData(foundationalDataCounts);

      // Determine if usage data exists
      const hasUsageData = this.hasMinimumUsageData(usageDataCounts);

      // Classify system state
      const systemState = this.determineSystemState(hasFoundationalData, hasUsageData);
      
      // Startup condition = foundational data exists but usage data is empty
      const isStartupCondition = hasFoundationalData && !hasUsageData;

      return {
        isStartupCondition,
        hasFoundationalData,
        hasUsageData,
        foundationalDataCounts,
        usageDataCounts,
        systemState
      };
    } catch (error) {
      console.error('Error checking system startup status:', error);
      
      // Return error state if we can't even check basic status
      return {
        isStartupCondition: false,
        hasFoundationalData: false,
        hasUsageData: false,
        foundationalDataCounts: { categories: 0, foodItems: 0, languages: 0 },
        usageDataCounts: { apiUsageLogs: 0, usageRecords: 0 },
        systemState: 'error'
      };
    }
  }

  /**
   * Check usage data counts with graceful handling of missing tables
   */
  private static async getUsageDataCounts(): Promise<{ apiUsageLogs: number; usageRecords: number }> {
    let apiUsageLogs = 0;
    let usageRecords = 0;

    try {
      // Try to count ApiUsageLog records
      await prisma.apiUsageLog.findFirst({ take: 1 });
      apiUsageLogs = await prisma.apiUsageLog.count();
    } catch (error) {
      // Table doesn't exist or other error - keep at 0
      console.debug('ApiUsageLog table not accessible:', error);
    }

    try {
      // Try to count UsageRecord records
      usageRecords = await prisma.usageRecord.count();
    } catch (error) {
      // Table doesn't exist or other error - keep at 0
      console.debug('UsageRecord table not accessible:', error);
    }

    return { apiUsageLogs, usageRecords };
  }

  /**
   * Determines if system has minimum foundational data to be considered operational
   */
  private static hasMinimumFoundationalData(counts: { categories: number; foodItems: number; languages: number }): boolean {
    // System needs at least some languages and either categories or food items
    return counts.languages > 0 && (counts.categories > 0 || counts.foodItems > 0);
  }

  /**
   * Determines if system has usage data indicating it's been used
   */
  private static hasMinimumUsageData(counts: { apiUsageLogs: number; usageRecords: number }): boolean {
    return counts.apiUsageLogs > 0 || counts.usageRecords > 0;
  }

  /**
   * Determines overall system state based on data availability
   */
  private static determineSystemState(hasFoundationalData: boolean, hasUsageData: boolean): 'startup' | 'operational' | 'error' {
    if (!hasFoundationalData) {
      return 'error';  // Missing foundational data indicates system issues
    }
    
    if (hasUsageData) {
      return 'operational';  // Has both foundational and usage data
    }
    
    return 'startup';  // Has foundational data but no usage data yet
  }

  /**
   * Get a human-readable description of the current system state
   */
  static getSystemStateDescription(status: SystemStartupStatus): string {
    switch (status.systemState) {
      case 'startup':
        return 'System initialized with base data. Usage statistics will appear after AI operations begin.';
      case 'operational':
        return 'System is operational with active usage data.';
      case 'error':
        return 'System may have configuration issues. Check database connectivity and data seeding.';
      default:
        return 'Unknown system state.';
    }
  }

  /**
   * Determine if usage-related errors should be suppressed in favor of startup messaging
   */
  static shouldSuppressUsageErrors(status: SystemStartupStatus): boolean {
    return status.isStartupCondition;
  }
}
