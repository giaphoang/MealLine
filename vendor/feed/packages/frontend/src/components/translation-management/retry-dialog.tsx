// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Translation } from '@/types/translation';
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

interface RetryDialogProps {
  translation: Translation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (translation: Translation) => void;
  isLoading?: boolean;
}

export function RetryDialog({
  translation,
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
}: RetryDialogProps) {
  if (!translation) return null;

  const handleConfirm = () => {
    onConfirm(translation);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{translation.status === 'completed' ? 'Restart Completed Translation' : 'Retry Translation Process'}</AlertDialogTitle>
          <AlertDialogDescription>
            {translation.status === 'completed' ? (
              <>
                This translation is already completed. Restarting will reset it to pending status and 
                generate a new translation. This may incur additional costs.
              </>
            ) : translation.status === 'pending' ? (
              <>
                This translation is currently in progress. Restarting will reset the process and
                attempt to generate a new translation. This may help if a translation appears to be stuck.
              </>
            ) : (
              <>
                Are you sure you want to retry this failed translation? It will be reset to pending status
                and a new translation will be generated.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={translation.status === 'completed' ? 'bg-amber-500 hover:bg-amber-600' : ''}
          >
            {isLoading ? 'Processing...' : translation.status === 'completed' ? 'Restart Translation' : 'Retry Translation'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
