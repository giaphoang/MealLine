// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState } from 'react';
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { BellIcon } from "@/components/animate-ui/icons/bell";
import { BellDotIcon } from "@/components/ui/bell-dot";
import { Button } from '@/components/ui/button';
import { AlertDialog } from './alert-dialog';
import { useAlerts } from '@/hooks/alerts/useAlerts';

export function AlertButton() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { unreadCount } = useAlerts({
    limit: 1, // We only need to know if there are any unread alerts
    refreshInterval: 30000
  });

  return (
    <>
      {/* The "no new alerts" Bell rings on hover/tap of the button (no page-load
          animation). data-feed-no-icon-motion suppresses the generic icon pop.
          The "new alerts" BellDot is imperative and self-shakes on appearance. */}
      <AnimateIcon asChild animateOnHover animateOnTap>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          data-feed-no-icon-motion="true"
          onClick={() => setDialogOpen(true)}
        >
          {unreadCount > 0 ? (
            // `animateOnMount` shakes the bell when the "new alerts" state first
            // appears (page load or 0 -> >0); it also shakes on hover. The icon
            // only mounts while there are unread alerts, so mount == appearance.
            <BellDotIcon
              size={20}
              animateOnMount
              style={{ color: 'var(--color-clearance)' }}
            />
          ) : (
            <BellIcon className="h-5 w-5 text-muted-foreground" size={20} />
          )}
        </Button>
      </AnimateIcon>
      <AlertDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}