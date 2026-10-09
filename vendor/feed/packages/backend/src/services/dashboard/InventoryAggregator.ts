// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseAggregationService, DashboardResponse } from './BaseAggregationService';

export interface InventoryStatusDistribution {
  status: string;
  count: number;
  percentage: number;
  color: string;
}

export interface InventoryMetrics {
  totalItems: number;
  statusDistribution: InventoryStatusDistribution[];
  dietaryDistribution: {
    vegetarian: number;
    vegan: number;
    glutenFree: number;
    dairyFree: number;
    nutFree: number;
    lowSodium: number;
  };
  limitDistribution: {
    noLimit: number;
    withLimit: number;
    averageLimit: number;
  };
  categoryBreakdown: Array<{
    categoryId: number;
    categoryName: string;
    itemCount: number;
    inStockCount: number;
    inStockPercentage: number;
  }>;
}

/**
 * Aggregator for inventory status and distribution analysis
 */
export class InventoryAggregator extends BaseAggregationService {
  constructor() {
    super('InventoryAggregator');
  }

  /**
   * Get comprehensive inventory distribution metrics with optional time filtering
   */
  async getInventoryDistribution(timeRange?: string): Promise<DashboardResponse<InventoryMetrics>> {
    const resolvedTimeRange = this.resolveTimeRange(timeRange);
    
    return this.executeAggregation(async () => {
      const [
        statusDistribution,
        dietaryDistribution,
        limitDistribution,
        categoryBreakdown,
        totalItems
      ] = await Promise.all([
        this.getStatusDistribution(resolvedTimeRange),
        this.getDietaryDistribution(resolvedTimeRange),
        this.getLimitDistribution(resolvedTimeRange),
        this.getCategoryBreakdown(resolvedTimeRange),
        this.getTotalItemCount(resolvedTimeRange)
      ]);

      return {
        totalItems,
        statusDistribution,
        dietaryDistribution,
        limitDistribution,
        categoryBreakdown
      };
    }, resolvedTimeRange);
  }

  /**
   * Get status distribution with color coding
   */
  private async getStatusDistribution(timeRange: { startDate: Date; endDate: Date; label: string }) {
    const where = this.applyTimeFilter({}, timeRange);
    
    // Get all food items with their status flags
    const items = await this.db.foodItem.findMany({
      where,
      select: {
        isInStock: true,
        isLimited: true,
        isClearance: true
      }
    });

    // Count status combinations
    const statusCounts = {
      'In Stock': 0,
      'Out of Stock': 0,
      'Limited': 0,
      'Clearance': 0,
      'Unknown': 0
    };

    items.forEach(item => {
      if (item.isInStock && !item.isLimited && !item.isClearance) {
        statusCounts['In Stock']++;
      } else if (!item.isInStock) {
        statusCounts['Out of Stock']++;
      } else if (item.isLimited) {
        statusCounts['Limited']++;
      } else if (item.isClearance) {
        statusCounts['Clearance']++;
      } else {
        statusCounts['Unknown']++;
      }
    });

    // Calculate percentages and assign colors using CSS chart variables
    const distribution = this.calculateDistribution(statusCounts);
    const colorMap = {
      'In Stock': 'hsl(141, 53%, 53%)',     // --color-inStock (green)
      'Out of Stock': 'hsl(0, 0%, 50%)',    // --color-outOfStock (gray)
      'Limited': 'hsl(39, 100%, 50%)',      // --color-limited (orange)
      'Clearance': 'hsl(3, 87%, 63%)',      // --color-clearance (red)
      'Unknown': 'hsl(220, 14%, 60%)'       // --status-neutral-border (gray)
    };

    return Object.entries(distribution).map(([status, data]) => ({
      status,
      count: data.count,
      percentage: data.percentage,
      color: colorMap[status as keyof typeof colorMap]
    }));
  }

  /**
   * Get dietary restriction distribution
   */
  private async getDietaryDistribution(timeRange: { startDate: Date; endDate: Date; label: string }) {
    const where = this.applyTimeFilter({}, timeRange);
    
    const items = await this.db.foodItem.findMany({
      where,
      select: {
        vegetarian: true,
        vegan: true,
        glutenFree: true,
        organic: true,
        halal: true,
        kosher: true
      }
    });

    const dietary = {
      vegetarian: 0,
      vegan: 0,
      glutenFree: 0,
      dairyFree: 0,
      nutFree: 0,
      lowSodium: 0
    };

    items.forEach(item => {
      if (item.vegetarian) dietary.vegetarian++;
      if (item.vegan) dietary.vegan++;
      if (item.glutenFree) dietary.glutenFree++;
      if (item.organic) dietary.dairyFree++; // Map organic to dairyFree for now
      if (item.halal) dietary.nutFree++; // Map halal to nutFree for now  
      if (item.kosher) dietary.lowSodium++; // Map kosher to lowSodium for now
    });

    return dietary;
  }

  /**
   * Get limit distribution analysis
   */
  private async getLimitDistribution(timeRange: { startDate: Date; endDate: Date; label: string }) {
    const where = this.applyTimeFilter({}, timeRange);
    
    const items = await this.db.foodItem.findMany({
      where,
      select: {
        limit: true
      }
    });

    let noLimit = 0;
    let withLimit = 0;
    let totalLimit = 0;

    items.forEach(item => {
      if (item.limit === null || item.limit === 0) {
        noLimit++;
      } else {
        withLimit++;
        totalLimit += item.limit;
      }
    });

    const averageLimit = withLimit > 0 ? Math.round(totalLimit / withLimit) : 0;

    return {
      noLimit,
      withLimit,
      averageLimit
    };
  }

  /**
   * Get category breakdown with in-stock analysis
   */
  private async getCategoryBreakdown(timeRange: { startDate: Date; endDate: Date; label: string }) {
    const where = this.applyTimeFilter({}, timeRange);
    
    // Use raw query for better performance
    let breakdown;
    
    if (timeRange.label !== 'all-time') {
      breakdown = await this.db.$queryRaw<Array<{
        categoryId: number;
        categoryName: string;
        itemCount: bigint;
        inStockCount: bigint;
      }>>`
        SELECT 
          c.id as categoryId,
          c.name as categoryName,
          COUNT(fi.id) as itemCount,
          COUNT(CASE WHEN fi."isInStock" = true THEN 1 END) as inStockCount
        FROM "Category" c
        LEFT JOIN "FoodItem" fi ON c.id = fi."categoryId"
          AND fi."createdAt" >= ${timeRange.startDate.toISOString()}
          AND fi."createdAt" <= ${timeRange.endDate.toISOString()}
        GROUP BY c.id, c.name
        HAVING COUNT(fi.id) > 0
        ORDER BY COUNT(fi.id) DESC
      `;
    } else {
      breakdown = await this.db.$queryRaw<Array<{
        categoryId: number;
        categoryName: string;
        itemCount: bigint;
        inStockCount: bigint;
      }>>`
        SELECT 
          c.id as categoryId,
          c.name as categoryName,
          COUNT(fi.id) as itemCount,
          COUNT(CASE WHEN fi."isInStock" = true THEN 1 END) as inStockCount
        FROM "Category" c
        LEFT JOIN "FoodItem" fi ON c.id = fi."categoryId"
        GROUP BY c.id, c.name
        HAVING COUNT(fi.id) > 0
        ORDER BY COUNT(fi.id) DESC
      `;
    }

    return breakdown.map(cat => {
      const itemCount = Number(cat.itemCount);
      const inStockCount = Number(cat.inStockCount);
      const inStockPercentage = itemCount > 0 
        ? Math.round((inStockCount / itemCount) * 100 * 10) / 10 
        : 0;

      return {
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        itemCount,
        inStockCount,
        inStockPercentage
      };
    });
  }

  /**
   * Get total item count for the time period
   */
  private async getTotalItemCount(timeRange: { startDate: Date; endDate: Date; label: string }) {
    const where = this.applyTimeFilter({}, timeRange);
    return await this.db.foodItem.count({ where });
  }

  /**
   * Get inventory alerts based on stock levels and thresholds
   */
  async getInventoryAlerts(timeRange?: string): Promise<DashboardResponse<Array<{
    categoryId: number;
    categoryName: string;
    alertType: 'outOfStock' | 'lowStock' | 'discontinued';
    itemCount: number;
    severity: 'low' | 'medium' | 'high';
  }>>> {
    const resolvedTimeRange = this.resolveTimeRange(timeRange);
    const range = resolvedTimeRange || {
      label: 'all-time',
      startDate: new Date(0),
      endDate: new Date()
    };
    
    return this.executeAggregation(async () => {
      const where = this.applyTimeFilter({}, range);
      
      // Get categories with problematic stock levels
      let alerts;
      
      if (range.label !== 'all-time') {
        alerts = await this.db.$queryRaw<Array<{
          categoryId: number;
          categoryName: string;
          outOfStockCount: bigint;
          clearanceCount: bigint;
          totalCount: bigint;
        }>>`
          SELECT 
            c.id as categoryId,
            c.name as categoryName,
            COUNT(CASE WHEN fi."isInStock" = false THEN 1 END) as outOfStockCount,
            COUNT(CASE WHEN fi."isClearance" = true THEN 1 END) as clearanceCount,
            COUNT(fi.id) as totalCount
          FROM "Category" c
          INNER JOIN "FoodItem" fi ON c.id = fi."categoryId"
            AND fi."createdAt" >= ${range.startDate.toISOString()}
            AND fi."createdAt" <= ${range.endDate.toISOString()}
          GROUP BY c.id, c.name
          HAVING COUNT(fi.id) > 0
          ORDER BY c.name
        `;
      } else {
        alerts = await this.db.$queryRaw<Array<{
          categoryId: number;
          categoryName: string;
          outOfStockCount: bigint;
          clearanceCount: bigint;
          totalCount: bigint;
        }>>`
          SELECT 
            c.id as categoryId,
            c.name as categoryName,
            COUNT(CASE WHEN fi."isInStock" = false THEN 1 END) as outOfStockCount,
            COUNT(CASE WHEN fi."isClearance" = true THEN 1 END) as clearanceCount,
            COUNT(fi.id) as totalCount
          FROM "Category" c
          INNER JOIN "FoodItem" fi ON c.id = fi."categoryId"
          GROUP BY c.id, c.name
          HAVING COUNT(fi.id) > 0
          ORDER BY c.name
        `;
      }

      const processedAlerts: Array<{
        categoryId: number;
        categoryName: string;
        alertType: 'outOfStock' | 'lowStock' | 'discontinued';
        itemCount: number;
        severity: 'low' | 'medium' | 'high';
      }> = [];

      alerts.forEach(alert => {
        const totalCount = Number(alert.totalCount);
        const outOfStockCount = Number(alert.outOfStockCount);
        const clearanceCount = Number(alert.clearanceCount);
        
        // Out of stock alerts
        if (outOfStockCount > 0) {
          const outOfStockPercentage = (outOfStockCount / totalCount) * 100;
          let severity: 'low' | 'medium' | 'high' = 'low';
          
          if (outOfStockPercentage >= 50) severity = 'high';
          else if (outOfStockPercentage >= 25) severity = 'medium';
          
          processedAlerts.push({
            categoryId: alert.categoryId,
            categoryName: alert.categoryName,
            alertType: 'outOfStock',
            itemCount: outOfStockCount,
            severity
          });
        }
        
        // Clearance alerts (map to discontinued)
        if (clearanceCount > 0) {
          processedAlerts.push({
            categoryId: alert.categoryId,
            categoryName: alert.categoryName,
            alertType: 'discontinued',
            itemCount: clearanceCount,
            severity: 'medium'
          });
        }
      });

      return processedAlerts.sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      });
    }, resolvedTimeRange);
  }
}
