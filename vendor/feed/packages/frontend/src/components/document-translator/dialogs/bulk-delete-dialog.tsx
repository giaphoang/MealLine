// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import { Document } from '../types'
import { useMessage } from "@/hooks/message/useMessage"
import { useState } from "react"
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

export type BulkDeleteAction = 'document' | 'documentAndTranslations'

interface BulkDeleteDialogProps {
  documents: Document[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (documents: Document[], action?: BulkDeleteAction) => Promise<void>
  onError?: (error: Error) => void
  isLoading?: boolean
  translationsCount?: number
  cachedTranslationsCount?: number // For UI display purposes only
}

export function BulkDeleteDialog({
  documents,
  open,
  onOpenChange,
  onConfirm,
  onError,
  isLoading,
  translationsCount = 0,
  cachedTranslationsCount // Use the actual value passed in, no default calculation
}: BulkDeleteDialogProps) {
  const { showMessage } = useMessage();
  const [showSecondaryConfirm, setShowSecondaryConfirm] = useState(false);

  const handleError = (error: Error) => {
    showMessage(error.message, "error");
    onError?.(error);
  };
  
  const [selectedAction, setSelectedAction] = useState<BulkDeleteAction>('document');

  const handleActionSelect = (action: BulkDeleteAction) => {
    setSelectedAction(action);
    
    // If there are original documents with translations, show secondary confirmation
    if (translationsCount > 0 && documents.some(doc => doc.type === 'original')) {
      setShowSecondaryConfirm(true);
    } else {
      // Otherwise proceed with deletion
      onConfirm(documents, action);
    }
  };

  const handleSecondaryConfirm = () => {
    onConfirm(documents, selectedAction);
    setShowSecondaryConfirm(false);
  };

  const handleSecondaryCancel = () => {
    setShowSecondaryConfirm(false);
  };
  
  const getTranslationsText = () => {
    if (translationsCount === 0) return '';
    
    return `This will also permanently delete ${translationsCount} associated translated ${translationsCount === 1 ? 'document' : 'documents'} and ${cachedTranslationsCount} cached translations.`;
  };

  // Determine if we're deleting original documents, translations, or both
  const originalCount = documents.filter(doc => doc.type === 'original').length;
  const translationCount = documents.filter(doc => doc.type === 'translated').length;
  
  // Choose the appropriate item type based on what's being deleted
  let itemType = "Document";
  let pluralItemType = "Documents";
  
  if (originalCount > 0 && translationCount === 0) {
    itemType = "Document";
    pluralItemType = "Documents";
  } else if (originalCount === 0 && translationCount > 0) {
    itemType = "Translation";
    pluralItemType = "Translations";
  } else {
    // Mixed items being deleted
    itemType = "Document/Translation";
    pluralItemType = "Documents/Translations";
  }

  // Format item names for display
  const itemNames = documents.map(item => item.name).join(", ");
  const truncatedNames = itemNames.length > 100 
    ? `${itemNames.slice(0, 100)}...` 
    : itemNames;
  
  return (
    <>
      <AlertDialog
        open={open && !showSecondaryConfirm}
        onOpenChange={(open) => {
          onOpenChange(open);
          if (!open) setShowSecondaryConfirm(false);
        }}
      >
        <AlertDialogContent className="sm:max-w-[600px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          </AlertDialogHeader>
          
          <ScrollArea className="my-4">
            <AlertDialogDescription className="pr-4">
              {originalCount === 0 && translationCount > 0 ? (
                // For translated documents only
                <>
                  This action cannot be undone. This will permanently delete <strong>{cachedTranslationsCount} cached translations</strong> and {translationCount} translated documents:
                  <span className="block mt-2 font-medium text-sm">{truncatedNames}</span>
                </>
              ) : (
                // For original documents (with or without translations)
                <>
                  This action cannot be undone. This will permanently delete {originalCount} {originalCount === 1 ? 'document' : 'documents'}:
                  <span className="block mt-2 font-medium text-sm">{truncatedNames}</span>
                  {translationsCount > 0 && (
                    <>
                      <br />
                      This will also permanently delete <strong>{translationsCount} associated translated {translationsCount === 1 ? 'document' : 'documents'}</strong> and <strong>{cachedTranslationsCount} cached translations</strong>.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </ScrollArea>
          
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex sm:flex-row sm:justify-between">
            {originalCount === 0 && translationCount > 0 ? (
              // For translated documents only - show the two buttons
              <>
                <Button
                  onClick={() => handleActionSelect('document')}
                  disabled={isLoading}
                  variant="destructive"
                  className="w-full sm:w-auto"
                >
                  Delete Documents Only
                </Button>
                <AlertDialogCancel 
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </AlertDialogCancel>
                <Button
                  onClick={() => handleActionSelect('documentAndTranslations')}
                  disabled={isLoading}
                  variant="outline"
                  className="text-destructive border-destructive hover:bg-destructive/10 w-full sm:w-auto"
                >
                  Delete Documents & Translations
                </Button>
              </>
            ) : (
              // For original documents - single delete button
              <>
                <Button
                  onClick={() => handleActionSelect('document')}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full text-red-600 hover:text-red-600 hover:bg-red-50 border-red-200 sm:w-auto"
                >
                  {isLoading ? `Deleting...` : `Delete Anyway`}
                </Button>
                <AlertDialogCancel 
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </AlertDialogCancel>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Secondary confirmation dialog for deleting documents with translations */}
      <AlertDialog open={showSecondaryConfirm} onOpenChange={setShowSecondaryConfirm}>
        <AlertDialogContent className="sm:max-w-[600px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Final warning!</AlertDialogTitle>
          </AlertDialogHeader>
          <ScrollArea className="my-4">
            <AlertDialogDescription className="pr-4">
              You are about to permanently delete <strong>{originalCount} original {originalCount === 1 ? 'document' : 'documents'}</strong>, <strong>{translationsCount} translated {translationsCount === 1 ? 'document' : 'documents'}</strong>, and <strong>{cachedTranslationsCount} cached translations</strong>.
              <br /><br />
              <span className="font-semibold">This action cannot be undone and all translated content will be lost.</span>
              <br /><br />
              Are you absolutely certain you want to proceed?
            </AlertDialogDescription>
          </ScrollArea>
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex sm:flex-row sm:justify-between">
            <Button
              onClick={handleSecondaryConfirm}
              disabled={isLoading}
              variant="destructive"
              className="w-full sm:w-auto"
            >
              {isLoading ? `Deleting...` : `Yes, permanently delete everything`}
            </Button>
            <AlertDialogCancel 
              disabled={isLoading}
              className="w-full sm:w-auto"
              onClick={handleSecondaryCancel}
            >
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}