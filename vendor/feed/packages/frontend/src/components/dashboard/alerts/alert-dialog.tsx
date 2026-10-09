// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bell, CheckCircle, Clock, Info } from "@/components/ui/icons";
import { Alert } from "@/services/alert";
import { useAlerts } from "@/hooks/alerts/useAlerts";

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

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AlertDialog({ open, onOpenChange }: AlertDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] h-[80vh] flex flex-col overflow-hidden">
        <div className="h-full overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <DialogTitle>Alerts</DialogTitle>
                  <DialogDescription>System notifications and warnings</DialogDescription>
                </div>
                {unreadCount > 0 && (
                  <div className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                  </div>
                )}
              </div>
              {unreadCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={markAllAsRead}
                  className="text-sm"
                >
                  Mark all as read
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden min-h-0">
            <ScrollArea className="h-full w-full pr-4">
              {isLoading ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Loading alerts...
                </div>
              ) : alerts.length > 0 ? (
                <div className="space-y-2 py-2">
                  {alerts.map((alert) => (
                    <AlertItem
                      key={alert.id}
                      alert={alert}
                      onMarkAsRead={markAsRead}
                    />
                  ))}
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No alerts to display
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}