// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import React, { useState, useEffect } from "react"
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
import { Button } from "@/components/ui/button"

export type DeactivationAction = 'cancel' | 'deactivate' | 'deactivateAndDelete'

interface LanguageDeactivationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAction: (action: DeactivationAction) => Promise<void>
  onError?: (error: Error) => void
  deactivatedLanguages: string[]
  translationCount: number
  isLoading?: boolean
}

export function LanguageDeactivationDialog({
  open,
  onOpenChange,
  onAction,
  onError,
  deactivatedLanguages,
  translationCount,
  isLoading: externalLoading
}: LanguageDeactivationDialogProps) {
  const [internalLoading, setInternalLoading] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const isLoading = externalLoading || internalLoading

  const handleAction = async (action: DeactivationAction) => {
    if (action === 'cancel') {
      onOpenChange(false)
      return
    }

    if (action === 'deactivateAndDelete' && !showConfirmDialog) {
      setShowConfirmDialog(true)
      return
    }

    setInternalLoading(true)
    try {
      await onAction(action)
      setShowConfirmDialog(false)
      
      // Close the dialog when deactivate action is successful
      if (action === 'deactivate') {
        onOpenChange(false)
      }
    } catch (error) {
      if (error instanceof Error) {
        onError?.(error)
      } else {
        onError?.(new Error('An unexpected error occurred'))
      }
    } finally {
      setInternalLoading(false)
    }
  }

  const getLanguageDisplayText = () => {
    if (deactivatedLanguages.length === 1) {
      return deactivatedLanguages[0];
    } else {
      return `${deactivatedLanguages.length} languages (${deactivatedLanguages.join(', ')})`;
    }
  }

  // First dialog - Deactivation options
  if (!showConfirmDialog) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <div className="flex flex-col h-full max-h-[80vh]">
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate {deactivatedLanguages.length > 1 ? 'Languages' : 'Language'}?</AlertDialogTitle>
            </AlertDialogHeader>

            <ScrollArea className="flex-1 h-[30vh] my-4">
              <AlertDialogDescription className="pr-4">
                You are about to deactivate <span className="font-medium">{getLanguageDisplayText()}</span>.
              </AlertDialogDescription>
              <div className="pr-4 text-sm text-muted-foreground mt-2">
                Please select how you would like to handle translations for {deactivatedLanguages.length === 1 ? "this language" : "these languages"}:
              </div>
            </ScrollArea>
            <AlertDialogFooter className="flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
              <AlertDialogCancel 
                className="mt-0"
                disabled={isLoading}
                onClick={() => handleAction('cancel')}
              >
                Cancel
              </AlertDialogCancel>
              <Button
                variant="outline"
                onClick={() => handleAction('deactivate')}
                disabled={isLoading}
              >
                Deactivate Only
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleAction('deactivateAndDelete')}
                disabled={isLoading}
              >
                Deactivate & Delete Translations
              </Button>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  // Second dialog - Confirmation for deletion
  return (
    <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <AlertDialogContent>
        <div className="flex flex-col h-full max-h-[80vh]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Translation Deletion</AlertDialogTitle>
          </AlertDialogHeader>
          
          <ScrollArea className="flex-1 h-[30vh] my-4">
            <AlertDialogDescription className="pr-4">
              This will permanently delete {translationCount} {translationCount === 1 ? "translation" : "translations"} for <span className="font-medium">{getLanguageDisplayText()}</span>.
            </AlertDialogDescription>
            <div className="pr-4 text-sm text-destructive font-medium mt-2">
              This action cannot be undone.
            </div>
          </ScrollArea>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="mt-0"
              disabled={isLoading}
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => handleAction('deactivateAndDelete')}
              disabled={isLoading}
            >
              {isLoading ? "Deleting..." : "Yes, Delete Translations"}
            </Button>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
