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
import { ScrollArea } from "@/components/ui/scroll-area"
import { useState } from "react"

interface LanguageWarningDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  onError?: (error: Error) => void
  selectedCount: number
  isLoading?: boolean
}

export function LanguageWarningDialog({
  open,
  onOpenChange,
  onConfirm,
  onError,
  selectedCount,
  isLoading: externalLoading
}: LanguageWarningDialogProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = externalLoading || internalLoading;

  const handleConfirm = async () => {
    setInternalLoading(true);
    try {
      await onConfirm();
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

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <div className="flex flex-col h-full max-h-[80vh]">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          </AlertDialogHeader>
          
          <ScrollArea className="flex-1 h-[30vh] my-4">
            <AlertDialogDescription className="pr-4">
              Selecting {selectedCount} languages will impact translation performance.
              Consider selecting fewer languages to ensure optimal system responsiveness.
            </AlertDialogDescription>
          </ScrollArea>
          
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isLoading}
            >
              {isLoading ? "Saving Changes..." : "Continue Anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}