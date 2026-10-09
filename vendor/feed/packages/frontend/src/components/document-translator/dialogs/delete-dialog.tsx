// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import { DeleteDialog as SharedDeleteDialog } from "@/components/shared/delete-dialog"
import { Document } from '../types'
import { useMessage } from "@/hooks/message/useMessage"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useState } from "react"

export type DeleteAction = 'document' | 'documentAndTranslations'

interface DeleteDialogProps {
  document: Document | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (document: Document, action?: DeleteAction) => Promise<void>
  onError?: (error: Error) => void
  isLoading?: boolean
  translationsCount?: number
  cachedTranslationsCount?: number // For UI display purposes only
}

export function DeleteDialog({
  document,
  open,
  onOpenChange,
  onConfirm,
  onError,
  isLoading,
  translationsCount = 0,
  cachedTranslationsCount // Use the actual value passed in, no default calculation
}: DeleteDialogProps) {
  const { showMessage } = useMessage();
  const [showSecondaryConfirm, setShowSecondaryConfirm] = useState(false);

  const handleError = (error: Error) => {
    showMessage(error.message, "error");
    onError?.(error);
  };

  const [selectedAction, setSelectedAction] = useState<DeleteAction>('document');

  const handleFirstConfirm = () => {
    // If this is an original document with translations, show secondary confirmation
    if (document?.type !== 'translated' && translationsCount > 0) {
      setShowSecondaryConfirm(true);
    } else {
      // Otherwise proceed with deletion
      document && onConfirm(document, selectedAction);
    }
  };
  
  // Handle action selection
  const handleActionSelect = (action: DeleteAction) => {
    setSelectedAction(action);
    // If this is an original document with translations, show secondary confirmation
    if (document?.type !== 'translated' && translationsCount > 0) {
      setShowSecondaryConfirm(true);
    } else {
      // Otherwise proceed with deletion
      document && onConfirm(document, action);
    }
  };

  const handleSecondaryConfirm = () => {
    document && onConfirm(document, selectedAction);
    setShowSecondaryConfirm(false);
  };

  const handleSecondaryCancel = () => {
    setShowSecondaryConfirm(false);
  };

  const getTranslationsText = () => {
    if (document?.type === 'translated' || translationsCount === 0) return '';
    
    return `This will also permanently delete ${translationsCount} associated translated ${translationsCount === 1 ? 'document' : 'documents'} and ${cachedTranslationsCount} cached translations.`;
  };

  // First confirmation dialog
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
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete 
              {document?.type === 'translated' ? (
                <>
                  <strong> {cachedTranslationsCount} cached translations </strong> 
                  and the document <span className="font-medium">{document?.name}</span> will be removed from the system.
                </>
              ) : (
                <>
                  the document <span className="font-medium">{document?.name}</span> and remove it from the system.
                  {translationsCount > 0 && (
                    <>
                      <br /><br />
                      This will also permanently delete <strong>{translationsCount} associated translated {translationsCount === 1 ? 'document' : 'documents'}</strong> and <strong>{cachedTranslationsCount} cached translations</strong>.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex sm:flex-row sm:justify-between">
            {document?.type === 'translated' ? (
              <>
                <Button
                  onClick={() => handleActionSelect('document')}
                  disabled={isLoading}
                  variant="destructive"
                  className="w-full sm:w-auto"
                >
                  Delete Document Only
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
                  Delete Document & Translations
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleFirstConfirm}
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
            <AlertDialogDescription>
              You are about to permanently delete the document{" "}
              <span className="font-medium">{document?.name}</span>, {translationsCount}{" "}
              translated {translationsCount === 1 ? 'document' : 'documents'}, and {cachedTranslationsCount} cached translations.
              <br /><br />
              <span className="font-semibold">This action cannot be undone and all translated content will be lost.</span>
              <br /><br />
              Are you absolutely certain you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
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
            >
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}