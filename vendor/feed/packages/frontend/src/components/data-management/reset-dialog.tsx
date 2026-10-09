// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { adminService } from '@/services/admin';
import type { CleanSlateResult, DatabaseSummary } from '@/types/admin';

/**
 * Reset to a clean slate.
 *
 * Shares restore's machinery and must not share its tone. Restore *recovers*
 * data someone wants back; this *discards* data on purpose, and there is no
 * file to go back to — only the snapshot FEED writes before the swap. Every
 * sentence here is written so those two never blur.
 *
 * Because it is unrecoverable from the UI, it asks the administrator to type
 * the word rather than click through. That is not theatre: the button sits two
 * inches from Download Backup, and a misclick here costs the pantry its data.
 */

const CONFIRM_WORD = 'RESET';

interface ResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown so the administrator sees what they are about to discard. */
  summary: DatabaseSummary | null;
}

export function ResetDialog({ open, onOpenChange, summary }: ResetDialogProps) {
  const [withExamples, setWithExamples] = React.useState(true);
  const [clearRoster, setClearRoster] = React.useState(false);
  const [typed, setTyped] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CleanSlateResult | null>(null);

  React.useEffect(() => {
    if (open) {
      setWithExamples(true);
      setClearRoster(false);
      setTyped('');
      setError(null);
      setResult(null);
      setBusy(false);
    }
  }, [open]);

  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const handleReset = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await adminService.resetToCleanSlate({ withExamples, clearRoster }));
      // The server exits right after responding. Reloading brings the app back
      // on the new database rather than leaving discarded data on screen.
      window.setTimeout(() => window.location.reload(), 6000);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The reset did not run. Your data has not been changed.'
      );
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (busy || result) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {result ? 'FEED has been reset' : 'Reset to a clean slate'}
          </DialogTitle>
          <DialogDescription>
            {result
              ? 'FEED is restarting and will reload on the fresh database.'
              : 'This deletes your pantry data and starts over. It is not a restore.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!result && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                {summary
                  ? `All ${summary.totalRecords.toLocaleString()} records — inventory, translations, shopping lists, procurement, and settings — will be deleted.`
                  : 'Your inventory, translations, shopping lists, procurement, and settings will be deleted.'}{' '}
                FEED saves a snapshot on the server first, but nothing in the app
                can undo this. Download a backup if you have not already.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={withExamples}
                  onCheckedChange={checked => setWithExamples(checked === true)}
                  disabled={busy}
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm">Start with examples</span>
                  <span className="block text-xs text-muted-foreground">
                    Three categories and nine food items, so the Shopping List Builder
                    has something to show. Easy to delete later. Clear this to start
                    completely empty.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3">
                <Checkbox
                  checked={clearRoster}
                  onCheckedChange={checked => setClearRoster(checked === true)}
                  disabled={busy}
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm">Also remove everyone&rsquo;s access</span>
                  <span className="block text-xs text-muted-foreground">
                    Signs out every account, including yours. The next person to sign in
                    becomes the administrator. Leave this off unless you are handing this
                    instance to someone else.
                  </span>
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-confirm">
                Type {CONFIRM_WORD} to confirm
              </Label>
              <Input
                id="reset-confirm"
                value={typed}
                onChange={event => setTyped(event.target.value)}
                disabled={busy}
                autoComplete="off"
                placeholder={CONFIRM_WORD}
              />
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-2 text-sm">
            <p>
              {result.seeded.categories > 0
                ? `Started over with ${result.seeded.categories} categories and ${result.seeded.foodItems} food items.`
                : 'Started over with no inventory.'}{' '}
              {result.seeded.enabledLanguages === 1
                ? 'English is enabled; the other languages are available to turn on.'
                : `${result.seeded.enabledLanguages} languages enabled.`}
            </p>
            {result.rosterCleared && (
              <p className="text-muted-foreground">
                Access was cleared. The next person to sign in becomes the administrator.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {!result && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleReset()}
                disabled={busy || !confirmed}
              >
                {busy ? 'Resetting…' : 'Delete everything and restart'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
