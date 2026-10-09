// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";
import { AlertTriangle, Bell, CheckCircle, Clock, Info } from "@/components/ui/icons";
import { useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert } from '@/services/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAlerts } from '@/hooks/alerts/useAlerts';
import { Button } from '@/components/ui/button';

// Constants for alert styling
const ALERT_ICONS = {
  info: <Info className="h-4 w-4 text-blue-500" />,
  warning: <Clock className="h-4 w-4 text-yellow-500" />,
  error: <AlertTriangle className="h-4 w-4 text-red-500" />,
  critical: <AlertTriangle className="h-4 w-4 text-red-600" />
} as const;

const ALERT_COLORS = {
  info: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950',
  warning: 'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950',
  error: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950',
  critical: 'border-red-300 bg-red-100 dark:border-red-800 dark:bg-red-900'
} as const;

interface AlertItemProps {
  alert: Alert;
  onMarkAsRead: (id: number) => void;
}

function AlertItem({ alert, onMarkAsRead }: AlertItemProps) {
  const timeAgo = new Date(alert.createdAt).toLocaleString();

  return (
    <div 
      className={`
        p-4 border rounded-lg mb-2 
        ${ALERT_COLORS[alert.level]} 
        ${alert.isRead ? 'opacity-70' : ''}
      `}
    >
      <div className="flex items-start gap-4">
        <div className="mt-1">
          {ALERT_ICONS[alert.level]}
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium">
            {alert.message}
          </p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{timeAgo}</span>
            {!alert.isRead && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={() => onMarkAsRead(alert.id)}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Mark as read
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AlertList() {
  const { 
    alerts, 
    unreadCount, 
    isLoading, 
    markAsRead, 
    markAllAsRead 
  } = useAlerts({
    limit: 20,
    refreshInterval: 30000 // Refresh every 30 seconds
  });

  useEffect(() => {
    // Request notification permission if needed
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Alerts</CardTitle>
              <CardDescription>System notifications and warnings</CardDescription>
            </div>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Loading alerts...
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasUnread = unreadCount > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <CardTitle>Alerts</CardTitle>
              <CardDescription>System notifications and warnings</CardDescription>
            </div>
            {hasUnread && (
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasUnread && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={markAllAsRead}
                className="text-sm"
              >
                Mark all as read
              </Button>
            )}
            <Bell className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          {alerts.length > 0 ? (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  onMarkAsRead={markAsRead}
                />
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              No alerts to display
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
