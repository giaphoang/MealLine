// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Document } from '../types';
import { useFilenameForm } from '@/hooks/document-translator/useFilenameForm';
import { useMessage } from '@/hooks/message/useMessage';

interface EditDialogProps {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: number, name: string) => Promise<void>;
}

export function EditDialog({ document, open, onOpenChange, onSave }: EditDialogProps) {
  const {
    filename,
    showValidation,
    validationError,
    handleFilenameChange,
    setFilename,
    resetForm,
    validateForm
  } = useFilenameForm();
  
  const { showMessage } = useMessage();
  
  // Update filename when document changes
  useEffect(() => {
    if (document) {
      setFilename(document.name);
    } else {
      resetForm();
    }
  }, [document, setFilename, resetForm]);
  
  // Watch for validation errors
  useEffect(() => {
    if (validationError && showValidation) {
      showMessage(validationError, 'error');
    }
  }, [validationError, showValidation, showMessage]);

  const handleSave = async () => {
    if (!document) return;
    
    if (!validateForm()) {
      return;
    }
    
    try {
      await onSave(document.id, filename.trim());
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving document name:', error);
      // Error is handled by the parent component
    }
  };
  
  const handleCancel = () => {
    onOpenChange(false);
    if (document) {
      setFilename(document.name); // Reset to original value
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Rename Document</DialogTitle>
          <DialogDescription>
            Change the document name. Maximum 64 characters.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="document-name">Document Name</Label>
            <Input
              id="document-name"
              value={filename}
              onChange={handleFilenameChange}
              placeholder="Enter document name"
              maxLength={64}
              className={showValidation && validationError ? 'border-destructive' : ''}
            />
            <p className="text-sm text-muted-foreground">
              Maximum 64 characters. Special characters will be automatically cleaned.
            </p>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!filename.trim()}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}