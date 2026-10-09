// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Translation } from '@/types/translation'
import { useState } from "react"

interface BulkDeleteDialogProps {
  translations: Translation[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (translations: Translation[]) => Promise<void>
  onError?: (error: Error) => void
  isLoading?: boolean
}

export function BulkDeleteDialog({
  translations,
  open,
  onOpenChange,
  onConfirm,
  onError,
  isLoading: externalLoading
}: BulkDeleteDialogProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = externalLoading || internalLoading;

  const handleConfirm = async () => {
    if (!translations.length) return;
    
    setInternalLoading(true);
    try {
      await onConfirm(translations);
    } catch (error) {
      if (error instanceof Error) {
        onError?.(error);
      } else {
        onError?.(new Error('An unexpected error occurred'));
      }
    } finally {
      setInternalLoading(false);
    }
  }

  // Get the type of translations being deleted
  const allSameType = translations.every(t => t.type === translations[0]?.type);
  
  // Create the display message based on whether all translations are of the same type
  let displayMessage;
  if (allSameType && translations[0]) {
    const type = translations[0].type.toLowerCase();
    displayMessage = translations.length === 1 
      ? `${type} translation`
      : `${type} translations`;
  } else {
    displayMessage = translations.length === 1 
      ? "translation"
      : "translations";
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete {translations.length} {displayMessage}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex sm:flex-row sm:justify-between">
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            variant="outline"
            className="w-full text-red-600 hover:text-red-600 hover:bg-red-50 border-red-200 sm:w-auto"
          >
            {isLoading ? (
              `Deleting ${translations.length} ${displayMessage}...`
            ) : (
              `Delete Anyway`
            )}
          </Button>
          <AlertDialogCancel 
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Cancel
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}