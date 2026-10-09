// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Administrator control over what this deployment publishes.
 *
 * This lives in Data Management rather than in the Appearance wizard because
 * publishing the inventory feed is a data-sharing decision, not brand identity.
 * It was ported into the wizard from LOTTO, where the toggle is genuinely a
 * branding-adjacent capability (a queue-only agency has no FEED at all); in
 * FEED the endpoint is FEED's own feature.
 */

import * as React from 'react';
import { Globe } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/formatting/date';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { messageService } from '@/services/message';
import {
  deploymentSettingsService,
  type DeploymentSettings,
} from '@/services/deployment-settings';

export function DeploymentCapabilitiesPanel({
  isAdministrator,
}: {
  isAdministrator: boolean;
}) {
  const [settings, setSettings] = React.useState<DeploymentSettings | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!isAdministrator) {
      setIsLoading(false);
      return;
    }
    let active = true;
    deploymentSettingsService
      .load()
      .then((loaded) => {
        if (active) setSettings(loaded);
      })
      .catch((error) =>
        ErrorHandlerService.handleError(error, 'dataManagementLoadDeploymentSettings'),
      )
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAdministrator]);

  // Administrators own this; everyone else sees nothing rather than a disabled
  // control they cannot explain.
  if (!isAdministrator) return null;

  const setPublicInventory = async (publicInventoryEnabled: boolean) => {
    setIsSaving(true);
    try {
      const saved = await deploymentSettingsService.update({ publicInventoryEnabled });
      setSettings(saved);
      messageService.success(
        publicInventoryEnabled
          ? 'The public inventory feed is now published.'
          : 'The public inventory feed is no longer published.',
      );
    } catch (error) {
      ErrorHandlerService.handleError(error, 'dataManagementSaveDeploymentSettings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          Published Data
        </CardTitle>
        <CardDescription>
          Choose what this FEED deployment shares outside the organization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" aria-label="Loading published data settings" />
        ) : (
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-1">
              <Label htmlFor="deployment-public-inventory">Public inventory feed</Label>
              <p className="text-sm text-muted-foreground">
                Publishes the current in-stock categories and items, with no client or
                staff information, to anyone who has the address. The LOTTO queue display
                reads this feed.
              </p>
              {settings?.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  Last changed {formatDateTime(settings.updatedAt)}
                  {settings.updatedBy ? ` by ${settings.updatedBy}` : ''}.
                </p>
              )}
            </div>
            <Switch
              id="deployment-public-inventory"
              checked={settings?.publicInventoryEnabled ?? true}
              onCheckedChange={(checked) => void setPublicInventory(checked)}
              disabled={isSaving}
              aria-label="Publish the public inventory feed"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
