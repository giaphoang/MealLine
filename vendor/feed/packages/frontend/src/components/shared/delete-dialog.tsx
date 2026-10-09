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
import { useState } from "react"

interface DeleteItem {
  id: number
  name: string
}

interface DeleteDialogProps<T extends DeleteItem> {
  item: T | null
  itemType: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (item: T) => Promise<void>
  onError?: (error: Error) => void
  isLoading?: boolean
  onAlternativeAction?: (item: T) => Promise<void>
  alternativeActionLabel?: string
  customDescription?: string
}

export function DeleteDialog<T extends DeleteItem>({
  item,
  itemType,
  open,
  onOpenChange,
  onConfirm,
  onError,
  isLoading: externalLoading,
  onAlternativeAction,
  alternativeActionLabel,
  customDescription
}: DeleteDialogProps<T>) {
  const [internalLoading, setInternalLoading] = useState(false);
  const [actionType, setActionType] = useState<'delete' | 'alternative' | null>(null);
  const isLoading = externalLoading || internalLoading;

  const handleConfirm = async () => {
    if (!item) return;
    
    setActionType('delete');
    setInternalLoading(true);
    try {
      await onConfirm(item);
    } catch (error) {
      if (error instanceof Error) {
        onError?.(error);
      } else {
        onError?.(new Error('An unexpected error occurred'));
      }
    } finally {
      setInternalLoading(false);
      setActionType(null);
    }
  }

  const handleAlternativeAction = async () => {
    if (!item || !onAlternativeAction) return;
    
    setActionType('alternative');
    setInternalLoading(true);
    try {
      await onAlternativeAction(item);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof Error) {
        onError?.(error);
      } else {
        onError?.(new Error('An unexpected error occurred'));
      }
    } finally {
      setInternalLoading(false);
      setActionType(null);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the {itemType.toLowerCase()}{" "}
            <span className="font-medium">{item?.name}</span> and remove it from
            the system.
            {customDescription && (
              <>
                <br /><br />
                {customDescription}
              </>
            )}
            {onAlternativeAction && (
              <>
                <br /><br />
                Would you like to mark the item as out of stock instead?
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex sm:flex-row sm:justify-between">
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            variant="outline"
            className="w-full text-red-600 hover:text-red-600 hover:bg-red-50 border-red-200 sm:w-auto"
          >
            {isLoading && actionType === 'delete' ? (
              `Deleting ${itemType}...`
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
          {onAlternativeAction && (
            <Button
              onClick={handleAlternativeAction}
              disabled={isLoading}
              variant="default"
              className="w-full sm:w-auto"
            >
              {isLoading && actionType === 'alternative' ? (
                `Updating ${itemType}...`
              ) : (
                alternativeActionLabel || `Update ${itemType}`
              )}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}