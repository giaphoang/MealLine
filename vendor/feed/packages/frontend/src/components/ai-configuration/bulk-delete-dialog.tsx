// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import { AIConfiguration } from './types'
import { useMessage } from "@/hooks/message/useMessage"
import { useState } from "react"
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export type BulkDeleteAction = 'configuration' | 'configurationAndDependencies'

interface BulkDeleteDialogProps {
  configurations: AIConfiguration[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (configurations: AIConfiguration[], action?: BulkDeleteAction) => Promise<void>
  onError?: (error: Error) => void
  isLoading?: boolean
  serviceIntegrationsCount?: number
}

export function BulkDeleteDialog({
  configurations,
  open,
  onOpenChange,
  onConfirm,
  onError,
  isLoading,
  serviceIntegrationsCount = 0
}: BulkDeleteDialogProps) {
  const { showMessage } = useMessage();
  const [showSecondaryConfirm, setShowSecondaryConfirm] = useState(false);
  const [selectedAction, setSelectedAction] = useState<BulkDeleteAction>('configuration');
  const [confirmationText, setConfirmationText] = useState('');
  
  // Reset confirmation text when dialog opens/closes
  const isConfirmationValid = confirmationText.toLowerCase() === 'yes';
  
  const resetState = () => {
    setShowSecondaryConfirm(false);
    setConfirmationText('');
  };

  const handleError = (error: Error) => {
    showMessage(error.message, "error");
    onError?.(error);
  };

  const handleActionSelect = (action: BulkDeleteAction) => {
    setSelectedAction(action);
    
    // If there are API keys in the selection, show secondary confirmation
    const hasApiKeys = configurations.some(config => config.type === 'apikey');
    if (hasApiKeys) {
      setShowSecondaryConfirm(true);
    } else {
      // Otherwise proceed with deletion
      onConfirm(configurations, action);
    }
  };

  const handleSecondaryConfirm = () => {
    if (!isConfirmationValid) return;
    onConfirm(configurations, selectedAction);
    resetState();
  };

  const handleSecondaryCancel = () => {
    resetState();
  };

  // Determine configuration types being deleted
  const apiKeyCount = configurations.filter(config => config.type === 'apikey').length;
  const promptCount = configurations.filter(config => config.type === 'prompt').length;
  
  // Choose the appropriate item type based on what's being deleted
  let itemType = "Configuration";
  let pluralItemType = "Configurations";
  
  if (apiKeyCount > 0 && promptCount === 0) {
    itemType = "API Key Configuration";
    pluralItemType = "API Key Configurations";
  } else if (apiKeyCount === 0 && promptCount > 0) {
    itemType = "System Prompt Configuration";
    pluralItemType = "System Prompt Configurations";
  } else {
    // Mixed items being deleted
    itemType = "Configuration";
    pluralItemType = "Configurations";
  }

  // Format item names for display
  const itemNames = configurations.map(item => item.name).join(", ");
  const truncatedNames = itemNames.length > 100 
    ? `${itemNames.slice(0, 100)}...` 
    : itemNames;

  const getWarningText = () => {
    if (apiKeyCount > 0) {
      return (
        <>
          <br /><br />
          <strong>Warning:</strong> {apiKeyCount} API {apiKeyCount === 1 ? 'key' : 'keys'} cannot be recovered from service providers. 
          You must generate new keys manually from your service accounts.
          {serviceIntegrationsCount > 0 && (
            <>
              <br /><br />
              This will affect <strong>{serviceIntegrationsCount} active service integrations</strong> 
              and may disrupt translation operations.
            </>
          )}
        </>
      );
    }
    return null;
  };
  
  return (
    <>
      <AlertDialog
        open={open && !showSecondaryConfirm}
        onOpenChange={(open) => {
          onOpenChange(open);
          if (!open) resetState();
        }}
      >
        <AlertDialogContent className="sm:max-w-[600px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {configurations.length} {configurations.length === 1 ? itemType : pluralItemType}?</AlertDialogTitle>
          </AlertDialogHeader>
          
          <ScrollArea className="my-4">
            <AlertDialogDescription className="pr-4">
              This action cannot be undone. This will permanently delete {configurations.length} {configurations.length === 1 ? itemType.toLowerCase() : pluralItemType.toLowerCase()}:
              <span className="block mt-2 font-medium text-sm">{truncatedNames}</span>
              {getWarningText()}
            </AlertDialogDescription>
          </ScrollArea>
          
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex sm:flex-row sm:justify-between">
            <Button
              onClick={() => handleActionSelect('configuration')}
              disabled={isLoading}
              variant="outline"
              className="w-full text-red-600 hover:text-red-600 hover:bg-red-50 border-red-200 sm:w-auto"
            >
              {isLoading ? `Deleting...` : `Delete ${configurations.length} ${configurations.length === 1 ? itemType : pluralItemType}`}
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

      {/* Secondary confirmation dialog for configurations with API keys */}
      <AlertDialog open={showSecondaryConfirm} onOpenChange={setShowSecondaryConfirm}>
        <AlertDialogContent className="sm:max-w-[600px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Final Warning!</AlertDialogTitle>
          </AlertDialogHeader>
          <ScrollArea className="my-4">
            <AlertDialogDescription className="pr-4">
              You are about to permanently delete <strong>{configurations.length} {configurations.length === 1 ? itemType.toLowerCase() : pluralItemType.toLowerCase()}</strong>
              {apiKeyCount > 0 && (
                <>, including <strong>{apiKeyCount} API {apiKeyCount === 1 ? 'key' : 'keys'}</strong></>
              )}.
              <br /><br />
              <span className="font-semibold">This action cannot be undone and API keys cannot be recovered.</span>
              {" "}You will need to generate new API keys from your service provider accounts 
              and reconfigure these integrations manually.
              <br /><br />
              Are you absolutely certain you want to proceed?
            </AlertDialogDescription>
          </ScrollArea>
          
          <div className="space-y-2 px-6">
            <Label htmlFor="bulk-confirmation-input">Type "Yes" to confirm deletion</Label>
            <Input
              id="bulk-confirmation-input"
              placeholder="Yes"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              className={cn(
                "transition-colors",
                confirmationText.length > 0 && !isConfirmationValid && "border-red-500 focus-visible:ring-red-500",
                isConfirmationValid && "border-green-500 focus-visible:ring-green-500"
              )}
              disabled={isLoading}
              autoComplete="off"
            />
            {confirmationText.length > 0 && !isConfirmationValid && (
              <p className="text-sm text-red-500">Please type "Yes" exactly</p>
            )}
            {isConfirmationValid && (
              <p className="text-sm text-green-600">Ready to proceed</p>
            )}
          </div>
          
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex sm:flex-row sm:justify-between">
            <Button
              onClick={handleSecondaryConfirm}
              disabled={!isConfirmationValid || isLoading}
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
