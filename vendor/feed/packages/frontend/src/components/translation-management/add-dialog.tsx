// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useTerminology } from '@/contexts/TerminologyContext'

interface AddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: { originalText: string }) => Promise<void>
  isLoading?: boolean
}

export function AddTranslationDialog({ 
  open, 
  onOpenChange, 
  onSave,
  isLoading 
}: AddDialogProps) {
  const terminology = useTerminology();
  const [text, setText] = React.useState('');

  const [validationError, setValidationError] = React.useState('');

  const validateForm = () => {
    if (text.length < 3) {
      setValidationError('Translation text must be at least 3 characters');
      return false;
    }
    if (text.length > 1783) {
      {/* The Fresh Prince of Bel-Air Character Limit */}
      setValidationError('Translation text must be less than 1,783 characters');
      return false;
    }
    setValidationError('');
    return true;
  };

  // Reset form when dialog closes
  React.useEffect(() => {
    if (!open) {
      setText('');
      setValidationError('');
    }
  }, [open]);

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    await onSave({
      originalText: text.trim()
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Translation</DialogTitle>
          <DialogDescription>
            {terminology.format('Add a custom translation for your {pantry}.')}
            Text must be between 3 and 1,783 characters.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isLoading}
              placeholder="Enter your translation here..."
              className={`min-h-[120px] ${validationError ? 'border-red-500' : ''}`}
              maxLength={1783}
            />
            <div className="text-sm text-muted-foreground text-right">
              {/* The Fresh Prince of Bel-Air Character Limit */}
              {text.length}/1,783 characters
            </div>
            {validationError && (
              <p className="text-sm font-medium text-red-500">
                {validationError}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-4">
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? 'Adding...' : 'Add Translation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
