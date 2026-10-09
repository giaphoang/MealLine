// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect, useCallback } from 'react';
import { Alert, alertService, type AlertEventCallback } from '@/services/alert';
import { useMessage } from '../message/useMessage';

interface UseAlertsOptions {
  limit?: number;
  unreadOnly?: boolean;
  /**
   * Polling interval in ms for re-fetching alerts. Currently unused at
   * the hook level (SSE handles real-time updates) but accepted from
   * callers so the option remains stable if polling is reintroduced.
   */
  refreshInterval?: number;
}

export function useAlerts(options: UseAlertsOptions = {}) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { showError } = useMessage();

  // Handle real-time updates
  // Taken from the service rather than restated here. The two had already
  // drifted — the hook's copy did not know about `transient`.
  const handleAlertEvent = useCallback((data: Parameters<AlertEventCallback>[0]) => {
    switch (data.type) {
      case 'initial':
        if (data.alerts) {
          setAlerts(data.alerts);
        }
        if (typeof data.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }
        setIsLoading(false);
        break;

      case 'new':
        if (data.alert) {
          setAlerts(prev => {
            const newAlerts = [data.alert!, ...prev];
            // Maintain limit if specified
            return options.limit ? newAlerts.slice(0, options.limit) : newAlerts;
          });
          setUnreadCount(prev => prev + 1);
        }
        break;

      case 'update':
        if (data.alert) {
          // Check if the alert was previously unread and is now read
          setAlerts(prev => {
            const existingAlert = prev.find(a => a.id === data.alert!.id);
            const wasUnread = existingAlert && !existingAlert.isRead;
            const isNowRead = data.alert!.isRead;
            
            // Update unread count if needed
            if (wasUnread && isNowRead) {
              setUnreadCount(count => Math.max(0, count - 1));
            }
            
            // Update the alert in the list
            return prev.map(alert =>
              alert.id === data.alert!.id ? data.alert! : alert
            );
          });
        }
        break;
      case 'error':
        // Stop the loading state either way — the list has nothing to show.
        setIsLoading(false);
        setError(new Error(data.message || 'Failed to load alerts.'));
        // But only interrupt the user once the service has decided the stream
        // is genuinely down rather than momentarily dropped. Tab switches and
        // brief blips reconnect on their own and are not the user's problem.
        if (!data.transient) {
          showError('We couldn\'t load alerts right now. Please retry in a moment or contact the administrator if this persists.');
        }
        break;
    }
  }, [options.limit]);

  useEffect(() => {
    // Subscribe to real-time updates
    const unsubscribe = alertService.subscribe(handleAlertEvent);

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [handleAlertEvent]);

  const markAsRead = async (id: number) => {
    try {
      await alertService.markAsRead(id);
      // The update will come through SSE
    } catch (err) {
      showError('Failed to mark alert as read');
    }
  };

  const markAllAsRead = async () => {
    try {
      await alertService.markAllAsRead();
      
      // Set up a timeout to check if unread count reaches zero
      const checkInterval = setInterval(() => {
        if (unreadCount === 0) {
          clearInterval(checkInterval);
          // Wait a brief moment for any final SSE updates
          setTimeout(() => {
            window.location.reload();
          }, 100);
        }
      }, 50);

      // Safety cleanup after 2 seconds in case something goes wrong
      setTimeout(() => {
        clearInterval(checkInterval);
        window.location.reload();
      }, 2000);

    } catch (err) {
      showError('Failed to mark all alerts as read');
    }
  };

  return {
    alerts,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead
  };
}
