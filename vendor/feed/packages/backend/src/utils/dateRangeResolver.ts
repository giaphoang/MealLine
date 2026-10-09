// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Unified Date Range Resolver
 * 
 * Provides consistent date handling across all API endpoints.
 * Eliminates ambiguous "days back" calculations and timezone inconsistencies.
 */

export interface DateRange {
  startDate: Date;
  endDate: Date;
  timeZone: string;
  originalRange?: string;
}

export type TimeRangeOption = 'today' | 'this-week' | 'this-month' | 'this-year' | '1d' | '7d' | '30d' | '90d' | '365d';

/**
 * Resolves time range strings to explicit start/end dates
 */
export class DateRangeResolver {
  
  /**
   * Converts time range string to explicit date range with timezone awareness
   * Calculates date boundaries in user's timezone, then converts to UTC for database queries
   */
  static resolveTimeRange(timeRange?: string, baseDate?: Date, timezone?: string): DateRange {
    const now = baseDate || new Date();
    const timeZone = timezone || 'UTC';
    
    // If no timezone provided, use original UTC logic
    if (!timezone || timezone === 'UTC') {
      return this.resolveTimeRangeUTC(timeRange, now);
    }
    
    // Calculate date boundaries in user's timezone using their local time
    const userDateBoundaries = this.calculateUserDateBoundaries(timeRange, now, timezone);
    
    return {
      startDate: userDateBoundaries.startDate,
      endDate: userDateBoundaries.endDate,
      timeZone,
      originalRange: timeRange || '30d'
    };
  }

  /**
   * Calculate date boundaries in user's timezone and return as UTC dates
   * This is the core of Approach 3: Convert the question, not the answer
   */
  private static calculateUserDateBoundaries(
    timeRange: string | undefined,
    now: Date,
    timezone: string
  ): { startDate: Date; endDate: Date } {
    // Get the current time in the user's timezone
    const nowInUserTZ = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    
    let startDate: Date;
    let endDate: Date = now; // Keep end date as "now" in UTC
    
    switch (timeRange) {
      case 'today':
      case '1d': // Today - start of user's current day to now
        // Create start of day in user's timezone
        const startOfUserDay = new Date(nowInUserTZ);
        startOfUserDay.setHours(0, 0, 0, 0);
        
        // Convert to UTC by calculating the equivalent UTC time
        startDate = this.convertUserLocalTimeToUTC(startOfUserDay, timezone);
        break;
      
      case 'this-week':
      case '7d': // This Week - Sunday to now for the current week
        const dayOfWeek = nowInUserTZ.getDay(); // Sunday = 0, Saturday = 6
        const startOfWeek = new Date(nowInUserTZ);
        startOfWeek.setDate(nowInUserTZ.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);
        startDate = this.convertUserLocalTimeToUTC(startOfWeek, timezone);
        break;
        
      case 'this-month':
      case '30d': // This Month - first day of the current month to now
        const startOfMonth = new Date(nowInUserTZ.getFullYear(), nowInUserTZ.getMonth(), 1);
        startDate = this.convertUserLocalTimeToUTC(startOfMonth, timezone);
        break;
      
      case 'this-year':
      case '365d': // This Year - first day of the current year to now
        const startOfYear = new Date(nowInUserTZ.getFullYear(), 0, 1);
        startDate = this.convertUserLocalTimeToUTC(startOfYear, timezone);
        break;
        
      case '90d': // Last 90 days in user's timezone
        const ninetyDaysAgoInUserTZ = new Date(nowInUserTZ);
        ninetyDaysAgoInUserTZ.setDate(ninetyDaysAgoInUserTZ.getDate() - 90);
        startDate = this.convertUserLocalTimeToUTC(ninetyDaysAgoInUserTZ, timezone);
        break;
        
      case '365d': // Last 365 days in user's timezone
        const oneYearAgoInUserTZ = new Date(nowInUserTZ);
        oneYearAgoInUserTZ.setDate(oneYearAgoInUserTZ.getDate() - 365);
        startDate = this.convertUserLocalTimeToUTC(oneYearAgoInUserTZ, timezone);
        break;
        
      default: // Default to 30 days
        const defaultDaysAgoInUserTZ = new Date(nowInUserTZ);
        defaultDaysAgoInUserTZ.setDate(defaultDaysAgoInUserTZ.getDate() - 30);
        startDate = this.convertUserLocalTimeToUTC(defaultDaysAgoInUserTZ, timezone);
        break;
    }
    
    return { startDate, endDate };
  }

  /**
   * Convert a user's local time to the equivalent UTC time
   * This handles timezone offset calculations properly
   */
  private static convertUserLocalTimeToUTC(userLocalTime: Date, timezone: string): Date {
    try {
      // Calculate what this local time would be as a UTC time
      // We need to find the UTC time that, when converted to the user's timezone, matches userLocalTime
      
      // Get the offset between user timezone and UTC for this specific date
      const tempUTC = new Date(userLocalTime.toISOString());
      const tempInUserTZ = new Date(tempUTC.toLocaleString('en-US', { timeZone: timezone }));
      const offsetMs = tempUTC.getTime() - tempInUserTZ.getTime();
      
      // Apply the offset to get the correct UTC time
      return new Date(userLocalTime.getTime() + offsetMs);
    } catch (error) {
      console.warn(`Timezone conversion failed for '${timezone}', using local time:`, error);
      return userLocalTime;
    }
  }

  /**
   * Original UTC-based time range resolution (for backward compatibility)
   */
  private static resolveTimeRangeUTC(timeRange?: string, baseDate?: Date): DateRange {
    const now = baseDate || new Date();
    const timeZone = 'UTC';
    
    let startDate: Date;
    let endDate: Date = new Date(now);
    
    switch (timeRange) {
      case '1d': // Today - start of current day to now
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case '7d': // This Week - 7 days ago to now
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        break;
        
      case '30d': // This Month - 30 days ago to now
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        break;
        
      case '90d': // Last 90 days
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 90);
        break;
        
      case '365d': // This Year - 365 days ago to now
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 365);
        break;
        
      default: // Default to 30 days
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        timeRange = '30d';
        break;
    }
    
    return {
      startDate,
      endDate,
      timeZone,
      originalRange: timeRange
    };
  }

  /**
   * Creates date range for "start of day" scenarios
   * Useful for daily metrics that should include full day boundaries
   */
  static resolveDayBoundaries(timeRange?: string, baseDate?: Date): DateRange {
    const now = baseDate || new Date();
    const timeZone = 'UTC';
    
    let startDate: Date;
    let endDate: Date;
    
    switch (timeRange) {
      case '1d': // Today - start to end of current day
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
        
      case '7d': // Last 7 full days
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 6); // 7 days including today
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case '30d': // Last 30 full days
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 29); // 30 days including today
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case '90d': // Last 90 full days
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 89); // 90 days including today
        startDate.setHours(0, 0, 0, 0);
        break;
        
      case '365d': // Last 365 full days
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 364); // 365 days including today
        startDate.setHours(0, 0, 0, 0);
        break;
        
      default: // Default to 30 full days
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 29);
        startDate.setHours(0, 0, 0, 0);
        timeRange = '30d';
        break;
    }
    
    return {
      startDate,
      endDate,
      timeZone,
      originalRange: timeRange
    };
  }

  /**
   * Creates date range from explicit start and end date strings
   * Used when frontend passes explicit date parameters
   */
  static resolveExplicitRange(
    startDateStr: string, 
    endDateStr: string,
    timeZone: string = 'UTC'
  ): DateRange {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error('Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)');
    }
    
    if (startDate >= endDate) {
      throw new Error('Start date must be before end date');
    }
    
    return {
      startDate,
      endDate,
      timeZone,
      originalRange: 'explicit'
    };
  }

  /**
   * Validates time range parameter
   */
  static isValidTimeRange(timeRange: string): timeRange is TimeRangeOption {
    return ['today', 'this-week', 'this-month', 'this-year', '1d', '7d', '30d', '90d', '365d'].includes(timeRange);
  }

  /**
   * Creates metadata object for API responses
   */
  static createMetadata(dateRange: DateRange): {
    timeRange: string;
    startDate: string;
    endDate: string;
    timeZone: string;
    durationDays: number;
  } {
    const durationMs = dateRange.endDate.getTime() - dateRange.startDate.getTime();
    const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
    
    return {
      timeRange: dateRange.originalRange || 'custom',
      startDate: dateRange.startDate.toISOString(),
      endDate: dateRange.endDate.toISOString(),
      timeZone: dateRange.timeZone,
      durationDays
    };
  }
}

/**
 * Legacy compatibility function for existing getTimeRangeParams calls
 * @deprecated Use DateRangeResolver.resolveTimeRange() instead
 */
export function getTimeRangeParams(timeRange?: string): {
  historicalStartDate: Date;
  historicalDays: number;
} {
  const dateRange = DateRangeResolver.resolveTimeRange(timeRange);
  const durationMs = dateRange.endDate.getTime() - dateRange.startDate.getTime();
  const historicalDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
  
  return {
    historicalStartDate: dateRange.startDate,
    historicalDays
  };
}

export default DateRangeResolver;
