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

interface BulkDeleteDialogProps<T extends DeleteItem> {
  items: T[]
  itemType: string
  pluralItemType: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (items: T[]) => Promise<void>
  onError?: (error: Error) => void
  isLoading?: boolean
  onAlternativeAction?: (items: T[]) => Promise<void>
  alternativeActionLabel?: string
  customDescription?: string
}

export function BulkDeleteDialog<T extends DeleteItem>({
  items,
  itemType,
  pluralItemType,
  open,
  onOpenChange,
  onConfirm,
  onError,
  isLoading: externalLoading,
  onAlternativeAction,
  alternativeActionLabel,
  customDescription
}: BulkDeleteDialogProps<T>) {
  const [internalLoading, setInternalLoading] = useState(false);
  const [actionType, setActionType] = useState<'delete' | 'alternative' | null>(null);
  const isLoading = externalLoading || internalLoading;

  const handleConfirm = async () => {
    if (!items.length) return;
    
    setActionType('delete');
    setInternalLoading(true);
    try {
      await onConfirm(items);
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
    if (!items.length || !onAlternativeAction) return;
    
    setActionType('alternative');
    setInternalLoading(true);
    try {
      await onAlternativeAction(items);
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

  // Format item names for display
  const itemNames = items.map(item => item.name).join(", ");
  const truncatedNames = itemNames.length > 100 
    ? `${itemNames.slice(0, 100)}...` 
    : itemNames;

  const displayType = items.length === 1 ? itemType.toLowerCase() : pluralItemType.toLowerCase();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete {items.length}{" "}
            {displayType}:
            <span className="block mt-2 font-medium text-sm">{truncatedNames}</span>
            {customDescription && (
              <>
                <br /><br />
                {customDescription}
              </>
            )}
            {onAlternativeAction && (
              <>
                <br />
                Would you like to mark the {displayType} as out of stock instead?
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
              `Deleting ${items.length} ${displayType}...`
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
                `Updating ${items.length} ${displayType}...`
              ) : (
                alternativeActionLabel || `Update ${items.length} ${displayType}`
              )}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}