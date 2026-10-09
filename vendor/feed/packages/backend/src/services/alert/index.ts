// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import prisma from '../../db';

export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';

interface CreateAlertOptions {
  level: AlertLevel;
  message: string;
}

/**
 * Service for managing system alerts
 */
export class AlertService {
  private static instance: AlertService;

  private constructor() {}

  public static getInstance(): AlertService {
    if (!AlertService.instance) {
      AlertService.instance = new AlertService();
    }
    return AlertService.instance;
  }

  /**
   * Creates a new alert
   */
  async createAlert({ level, message }: CreateAlertOptions) {
    try {
      const alert = await prisma.alert.create({
        data: {
          level,
          message,
          isRead: false,
          createdAt: new Date()
        }
      });

      return alert;
    } catch (error) {
      console.error('Failed to create alert:', error);
      throw error;
    }
  }

  /**
   * Creates multiple alerts in a transaction
   */
  async createAlerts(alerts: CreateAlertOptions[]) {
    try {
      await prisma.$transaction(
        alerts.map(alert => 
          prisma.alert.create({
            data: {
              level: alert.level,
              message: alert.message,
              isRead: false,
              createdAt: new Date()
            }
          })
        )
      );
    } catch (error) {
      console.error('Failed to create alerts:', error);
      throw error;
    }
  }

  /**
   * Marks alerts as read
   */
  async markAsRead(ids: number[]) {
    try {
      await prisma.alert.updateMany({
        where: {
          id: { in: ids }
        },
        data: {
          isRead: true
        }
      });
    } catch (error) {
      console.error('Failed to mark alerts as read:', error);
      throw error;
    }
  }

  /**
   * Marks all alerts as read
   */
  async markAllAsRead() {
    try {
      await prisma.alert.updateMany({
        where: {
          isRead: false
        },
        data: {
          isRead: true
        }
      });
    } catch (error) {
      console.error('Failed to mark all alerts as read:', error);
      throw error;
    }
  }

  /**
   * Gets alerts with optional filtering
   */
  async getAlerts({ limit = 20, unreadOnly = false }: { limit?: number; unreadOnly?: boolean } = {}) {
    try {
      const alerts = await prisma.alert.findMany({
        where: unreadOnly ? { isRead: false } : undefined,
        orderBy: {
          createdAt: 'desc'
        },
        take: Math.min(limit, 100) // Cap at 100
      });

      const unreadCount = await prisma.alert.count({
        where: { isRead: false }
      });

      return { alerts, unreadCount };
    } catch (error) {
      console.error('Failed to get alerts:', error);
      throw error;
    }
  }

  /**
   * Gets count of unread alerts
   */
  async getUnreadCount() {
    try {
      return await prisma.alert.count({
        where: { isRead: false }
      });
    } catch (error) {
      console.error('Failed to get unread count:', error);
      throw error;
    }
  }

  /**
   * Cleans up old alerts (older than 30 days and read)
   */
  async cleanupOldAlerts() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await prisma.alert.deleteMany({
        where: {
          isRead: true,
          createdAt: {
            lt: thirtyDaysAgo
          }
        }
      });

      return result.count;
    } catch (error) {
      console.error('Failed to cleanup old alerts:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const alertService = AlertService.getInstance();