// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import { AIConfiguration } from './types'
import { useMessage } from "@/hooks/message/useMessage"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { cn } from "@/lib/utils"

export type DeleteAction = 'configuration' | 'configurationAndDependencies'

interface DeleteDialogProps {
  configuration: AIConfiguration | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (configuration: AIConfiguration, action?: DeleteAction) => Promise<void>
  onError?: (error: Error) => void
  isLoading?: boolean
  serviceIntegrationsCount?: number
}

export function DeleteDialog({
  configuration,
  open,
  onOpenChange,
  onConfirm,
  onError,
  isLoading,
  serviceIntegrationsCount = 0
}: DeleteDialogProps) {
  const { showMessage } = useMessage();
  const [showSecondaryConfirm, setShowSecondaryConfirm] = useState(false);
  const [selectedAction, setSelectedAction] = useState<DeleteAction>('configuration');
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

  const handleFirstConfirm = () => {
    // For API keys, show secondary confirmation
    if (configuration?.type === 'apikey') {
      setShowSecondaryConfirm(true);
    } else {
      // For prompts, proceed directly
      configuration && onConfirm(configuration, selectedAction);
    }
  };

  const handleActionSelect = (action: DeleteAction) => {
    setSelectedAction(action);
    // For API keys, show secondary confirmation
    if (configuration?.type === 'apikey') {
      setShowSecondaryConfirm(true);
    } else {
      // For prompts, proceed directly
      configuration && onConfirm(configuration, action);
    }
  };

  const handleSecondaryConfirm = () => {
    if (!isConfirmationValid) return;
    configuration && onConfirm(configuration, selectedAction);
    resetState();
  };

  const handleSecondaryCancel = () => {
    resetState();
  };

  const getConfigTypeDisplay = () => {
    switch (configuration?.type) {
      case 'apikey': return 'API Key Configuration';
      case 'prompt': return 'System Prompt Configuration';
      default: return 'Configuration';
    }
  };

  const getWarningText = () => {
    if (configuration?.type === 'apikey') {
      return (
        <>
          <strong>Warning:</strong> API keys cannot be recovered from service providers. 
          You must generate new keys manually from your {configuration.serviceType} account.
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

  // First confirmation dialog
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
            <AlertDialogTitle>Delete {getConfigTypeDisplay()}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete 
              the {configuration?.type === 'apikey' ? 'API key configuration' : 'system prompt'}{" "}
              <span className="font-medium">{configuration?.name}</span> and remove it from the system.
              {getWarningText() && (
                <>
                  <br /><br />
                  {getWarningText()}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex sm:flex-row sm:justify-between">
            <Button
              onClick={handleFirstConfirm}
              disabled={isLoading}
              variant="outline"
              className="w-full text-red-600 hover:text-red-600 hover:bg-red-50 border-red-200 sm:w-auto"
            >
              {isLoading ? `Deleting...` : `Delete ${configuration?.type === 'apikey' ? 'API Key' : 'Prompt'}`}
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

      {/* Secondary confirmation dialog for API keys only */}
      <AlertDialog open={showSecondaryConfirm} onOpenChange={setShowSecondaryConfirm}>
        <AlertDialogContent className="sm:max-w-[600px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Final Warning!</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to permanently delete the API key configuration{" "}
              <span className="font-medium">{configuration?.name}</span> for {configuration?.serviceType}.
              <br /><br />
              <span className="font-semibold">This action cannot be undone and the API key cannot be recovered.</span>
              {" "}You will need to generate a new API key from your {configuration?.serviceType} account 
              and reconfigure this integration manually.
              <br /><br />
              Are you absolutely certain you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-2 px-6">
            <Label htmlFor="confirmation-input">Type "Yes" to confirm deletion</Label>
            <Input
              id="confirmation-input"
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
              {isLoading ? `Deleting...` : `Yes, permanently delete API key`}
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
  );
}
