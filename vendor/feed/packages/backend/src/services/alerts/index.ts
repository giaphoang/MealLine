// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { TRANSLATION_THRESHOLDS, ALERT_LEVELS, ALERT_MESSAGES } from '../../config/translation';
import { alertEventEmitter } from '../events/alert-events';
import prisma from '../../db';

type AlertLevel = typeof ALERT_LEVELS[keyof typeof ALERT_LEVELS];

/**
 * Alert service for monitoring translation usage and sending notifications
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
   * Monitors response times and sends alerts for slow translations
   */
  async checkResponseTime(duration: number): Promise<void> {
    if (duration >= TRANSLATION_THRESHOLDS.MAX_RESPONSE_TIME) {
      await this.createAlert(
        ALERT_LEVELS.ERROR,
        ALERT_MESSAGES.SLOW_RESPONSE(duration)
      );
    } else if (duration >= TRANSLATION_THRESHOLDS.SLOW_RESPONSE_TIME) {
      await this.createAlert(
        ALERT_LEVELS.WARNING,
        ALERT_MESSAGES.SLOW_RESPONSE(duration)
      );
    }
  }

  /**
   * Creates a new alert in the database and triggers notifications
   */
  public async createAlert(level: AlertLevel | keyof typeof ALERT_LEVELS, message: string): Promise<void> {
    try {
      const normalizedLevel = (typeof level === 'string' ? level : ALERT_LEVELS[level]).toLowerCase() as AlertLevel;

      // Create alert record
      const alert = await prisma.alert.create({
        data: {
          level: normalizedLevel,
          message,
          isRead: false,
          createdAt: new Date()
        }
      });

      // Emit new alert event
      alertEventEmitter.emitNewAlert(alert);

      console.log(`[ALERT] ${normalizedLevel.toUpperCase()}: ${message}`);
    } catch (error) {
      console.error('Failed to create alert:', error);
    }
  }

  /**
   * Updates an alert's read status
   */
  async markAsRead(id: number): Promise<void> {
    try {
      const alert = await prisma.alert.update({
        where: { id },
        data: { isRead: true }
      });
      
      // Emit alert update event
      alertEventEmitter.emitAlertUpdate(alert);
    } catch (error) {
      console.error('Failed to mark alert as read:', error);
      throw error;
    }
  }

  /**
   * Marks all alerts as read
   */
  async markAllAsRead(): Promise<void> {
    try {
      // Get all unread alerts first
      const unreadAlerts = await prisma.alert.findMany({
        where: { isRead: false }
      });

      // Update all unread alerts
      await prisma.alert.updateMany({
        where: { isRead: false },
        data: { isRead: true }
      });
      
      // Get the updated alerts and emit events
      const updatedAlerts = await prisma.alert.findMany({
        where: {
          id: {
            in: unreadAlerts.map(alert => alert.id)
          }
        }
      });
      
      // Emit updates for each alert that was changed
      updatedAlerts.forEach(alert => alertEventEmitter.emitAlertUpdate(alert));
    } catch (error) {
      console.error('Failed to mark all alerts as read:', error);
      throw error;
    }
  }

  /**
   * Cleans up old alerts to prevent database growth
   */
  private async cleanupOldAlerts(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      await prisma.alert.deleteMany({
        where: {
          createdAt: {
            lt: thirtyDaysAgo
          }
        }
      });
    } catch (error) {
      console.error('Failed to cleanup old alerts:', error);
    }
  }
}

// Export singleton instance
export const alertService = AlertService.getInstance();
