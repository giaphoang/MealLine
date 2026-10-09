// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { Image } from 'lucide-react';

import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { SearchCheckIcon } from '@/components/animate-ui/icons/search-check';
import { Trash2Icon } from '@/components/animate-ui/icons/trash-2';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { messageService } from '@/services/message';
import { brandService, type BrandAssetStorageCheck } from '@/services/brand';

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function BrandAssetStoragePanel() {
  const [check, setCheck] = React.useState<BrandAssetStorageCheck | null>(null);
  const [isChecking, setIsChecking] = React.useState(false);
  const [isCleaning, setIsCleaning] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const runCheck = async () => {
    setIsChecking(true);
    try {
      const response = await brandService.checkAssetStorage();
      setCheck(response.check);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'brandAssetStorageCheck');
    } finally {
      setIsChecking(false);
    }
  };

  const cleanup = async () => {
    setIsCleaning(true);
    try {
      const response = await brandService.cleanupUnusedAssets();
      setCheck(response.check);
      setConfirmOpen(false);
      messageService.success(
        response.cleanup.deletedCount === 1
          ? `Removed 1 unused brand asset (${formatBytes(response.cleanup.deletedBytes)}).`
          : `Removed ${response.cleanup.deletedCount} unused brand assets (${formatBytes(response.cleanup.deletedBytes)}).`,
      );
    } catch (error) {
      ErrorHandlerService.handleError(error, 'brandAssetStorageCleanup');
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          Brand Asset Storage
        </CardTitle>
        <CardDescription>
          Find uploaded Appearance images that no saved configuration uses, then remove them from the database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <AnimateIcon asChild animateOnView animateOnViewOnce animateOnHover animateOnTap>
            <Button type="button" variant="outline" onClick={() => void runCheck()} disabled={isChecking || isCleaning}>
              <SearchCheckIcon className="h-4 w-4" aria-hidden="true" />
              {isChecking ? 'Checking…' : 'Run Storage Check'}
            </Button>
          </AnimateIcon>
          {check && check.eligibleUnusedCount > 0 ? (
            <AnimateIcon asChild animateOnView animateOnViewOnce animateOnHover animateOnTap>
              <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)} disabled={isCleaning}>
                <Trash2Icon className="h-4 w-4" aria-hidden="true" />
                Clean Up {check.eligibleUnusedCount} {check.eligibleUnusedCount === 1 ? 'Asset' : 'Assets'}
              </Button>
            </AnimateIcon>
          ) : null}
        </div>

        {check ? (
          <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stored</p>
              <p className="text-2xl font-semibold">{check.totalCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">In use</p>
              <p className="text-2xl font-semibold">{check.referencedCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ready to clean up</p>
              <p className="text-2xl font-semibold">{check.eligibleUnusedCount}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(check.eligibleUnusedBytes)}</p>
            </div>
            <p className="text-sm text-muted-foreground sm:col-span-3">
              {check.unusedCount === 0
                ? 'Every stored brand asset is referenced by a saved appearance.'
                : `${check.unusedCount} unused ${check.unusedCount === 1 ? 'asset was' : 'assets were'} found. ${check.protectedRecentCount > 0 ? `${check.protectedRecentCount} uploaded within the last hour will be left alone so an open Appearance wizard remains safe.` : 'Only assets older than one hour are eligible for cleanup.'}`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            The check is read-only. Cleanup becomes available only when unused assets older than one hour are found.
          </p>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove unused brand assets?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {check?.eligibleUnusedCount ?? 0} database {(check?.eligibleUnusedCount ?? 0) === 1 ? 'asset' : 'assets'} that no saved Appearance configuration references. Uploads from the last hour are protected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleaning}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void cleanup(); }} disabled={isCleaning} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isCleaning ? 'Cleaning up…' : 'Remove unused assets'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
