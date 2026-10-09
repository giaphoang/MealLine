// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseApiService } from '../base';
import config from '@/config/config';

export interface Alert {
  id: number;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  isRead: boolean;
  createdAt: string;
}

export type AlertEventCallback = (data: {
  type: 'initial' | 'new' | 'update' | 'error';
  alert?: Alert;
  alerts?: Alert[];
  unreadCount?: number;
  message?: string;
  /**
   * True while the stream is only *probably* broken.
   *
   * `EventSource.onerror` fires for things that are not failures from the
   * user's point of view: switching tabs long enough for the browser to
   * throttle the connection, a moment of flaky wifi, a backend restart. The
   * service already retries every 5 seconds and usually recovers silently, so
   * announcing the first drop reports normal behaviour as a fault.
   *
   * Subscribers should update their own state either way and only tell the
   * user when this is false.
   */
  transient?: boolean;
}) => void;

/** Failed reconnects tolerated before the user is told the stream is down. */
export const ALERT_STREAM_FAILURES_BEFORE_ANNOUNCING = 3;

export class AlertService extends BaseApiService {
  private eventSource: EventSource | null = null;
  private subscribers = new Set<AlertEventCallback>();
  private reconnectTimeout: number | null = null;
  /**
   * Consecutive failed connection attempts. Reset the moment a snapshot
   * arrives, so an outage has to persist to be worth interrupting anyone over.
   */
  private consecutiveFailures = 0;
  // Cache the latest snapshot so late subscribers can be hydrated immediately
  private lastSnapshot: { alerts: Alert[]; unreadCount: number } | null = null;
  // Cache the last error so late subscribers can exit loading if the stream failed earlier
  private lastError: string | null = null;
  // Prevent duplicate initial REST fetches when SSE is delayed or blocked
  private initialFetchPromise: Promise<void> | null = null;

  constructor() {
    super(config.api.endpoints.alerts?.base ?? '/api/alerts');
  }

  /**
   * Ensures we have an initial snapshot via REST if SSE hasn't delivered one yet.
   * Notifies current subscribers with an 'initial' (or 'error') event accordingly.
   */
  private ensureInitialSnapshot(): Promise<void> {
    if (this.lastSnapshot || this.initialFetchPromise) {
      return this.initialFetchPromise ?? Promise.resolve();
    }

    this.initialFetchPromise = this.get<{ alerts: Alert[]; unreadCount: number }>('')
      .then((data) => {
        this.lastSnapshot = { alerts: data.alerts ?? [], unreadCount: data.unreadCount ?? 0 };
        // Clear last error on successful fetch
        this.lastError = null;
        this.consecutiveFailures = 0;
        // Notify all subscribers with the fetched snapshot
        this.subscribers.forEach(cb => cb({
          type: 'initial',
          alerts: this.lastSnapshot!.alerts,
          unreadCount: this.lastSnapshot!.unreadCount,
        }));
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load alerts.';
        this.lastError = message;
        this.subscribers.forEach(cb => cb({ type: 'error', message }));
      })
      .finally(() => {
        this.initialFetchPromise = null;
      });

    return this.initialFetchPromise;
  }

  connectToAlertStream() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const streamUrl = `${this.baseUrl}/stream`;

    this.eventSource = new EventSource(streamUrl, { withCredentials: true });

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Maintain cache for late subscribers
        if (data?.type === 'initial' && Array.isArray(data.alerts)) {
          this.lastSnapshot = {
            alerts: data.alerts as Alert[],
            unreadCount: typeof data.unreadCount === 'number' ? data.unreadCount : 0,
          };
          // Clear any prior connection error once we have a valid snapshot
          this.lastError = null;
          this.consecutiveFailures = 0;
        } else if (data?.type === 'new' && data.alert) {
          // Prepend new alert and maintain a bounded list (server usually sends up to 20)
          const prevAlerts = this.lastSnapshot?.alerts ?? [];
          const nextAlerts = [data.alert as Alert, ...prevAlerts].slice(0, 20);
          const prevUnread = this.lastSnapshot?.unreadCount ?? 0;
          this.lastSnapshot = { alerts: nextAlerts, unreadCount: prevUnread + 1 };
        } else if (data?.type === 'update' && data.alert) {
          // Replace updated alert in cache and adjust unread count if transitioning to read
          if (this.lastSnapshot) {
            const existed = this.lastSnapshot.alerts.find(a => a.id === data.alert.id);
            const wasUnread = existed ? !existed.isRead : false;
            const isNowRead = !!data.alert.isRead;
            const alerts = this.lastSnapshot.alerts.map(a => (a.id === data.alert.id ? data.alert as Alert : a));
            let unreadCount = this.lastSnapshot.unreadCount;
            if (wasUnread && isNowRead) unreadCount = Math.max(0, unreadCount - 1);
            this.lastSnapshot = { alerts, unreadCount };
          }
        } else if (data?.type === 'error') {
          // Record last error from server so new subscribers can be notified
          this.lastError = typeof data.message === 'string' ? data.message : 'Failed to load alerts.';
        }
        this.subscribers.forEach(callback => callback(data));
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      this.consecutiveFailures += 1;
      // Three tries at five seconds apart: roughly fifteen seconds down before
      // the user hears about it. A tab switch or a brief drop reconnects well
      // inside that and stays silent.
      const transient = this.consecutiveFailures < ALERT_STREAM_FAILURES_BEFORE_ANNOUNCING;
      if (!transient) console.error('SSE Error:', error);
      const message = 'Unable to connect to alerts stream. Please ensure you are logged in and try again.';
      this.lastError = transient ? null : message;
      this.subscribers.forEach(callback => callback({ type: 'error', message, transient }));
      this.eventSource?.close();
      this.eventSource = null;

      // Clear any existing reconnect timeout
      if (this.reconnectTimeout) {
        window.clearTimeout(this.reconnectTimeout);
      }

      // Attempt to reconnect after 5 seconds
      this.reconnectTimeout = window.setTimeout(() => {
        this.reconnectTimeout = null;
        if (this.subscribers.size > 0) {
          this.connectToAlertStream();
        }
      }, 5000);
    };
  }

  subscribe(callback: AlertEventCallback) {
    this.subscribers.add(callback);
    if (!this.eventSource && !this.reconnectTimeout) {
      this.connectToAlertStream();
    }
    // Immediately hydrate new subscribers if we have a cached snapshot
    if (this.lastSnapshot) {
      callback({
        type: 'initial',
        alerts: this.lastSnapshot.alerts,
        unreadCount: this.lastSnapshot.unreadCount,
      });
    } else if (this.lastError) {
      // If we don't have data but we know the stream failed earlier, inform the subscriber
      callback({ type: 'error', message: this.lastError });
    } else {
      // Kick off a one-time REST fetch to populate state if SSE is delayed/blocked
      this.ensureInitialSnapshot();
    }
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
      if (this.subscribers.size === 0) {
        if (this.reconnectTimeout) {
          window.clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
        this.eventSource?.close();
        this.eventSource = null;
      }
    };
  }

  async markAsRead(id: number): Promise<void> {
    try {
      await this.put(`/${id}/read`);
    } catch (error) {
      console.error('Failed to mark alert as read:', error);
      throw error;
    }
  }

  async markAllAsRead(): Promise<void> {
    try {
      await this.put('/read-all');
    } catch (error) {
      console.error('Failed to mark all alerts as read:', error);
      throw error;
    }
  }

  async getUnreadCount(): Promise<number> {
    try {
      const response = await this.get<{ count: number }>('/unread-count');
      return response.count;
    } catch (error) {
      console.error('Failed to get unread count:', error);
      throw error;
    }
  }

  // Clean up method to be called when service is no longer needed
  destroy() {
    if (this.reconnectTimeout) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.subscribers.clear();
  }
}

// Export a singleton instance
export const alertService = new AlertService();
