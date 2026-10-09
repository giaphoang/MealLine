// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CategoryForm } from './form/CategoryForm'
import { DEFAULT_ICON } from '@/lib/food-icons'

interface AddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: { name: string; limit: number; limitType: 'person' | 'household'; icon: string }) => Promise<void>
  isLoading?: boolean
}

export function AddCategoryDialog({ 
  open, 
  onOpenChange, 
  onSave,
  isLoading 
}: AddDialogProps) {
  // Clean up side effects
  const [error, setError] = React.useState<{ message: string } | null>(null);

  // Reset error when dialog opens/closes
  React.useEffect(() => {
    setError(null);
  }, [open]);

  // Handle errors from the save operation
  const handleSaveError = (err: Error) => {
    setError({ message: err.message });
  };

  // Wrapper for onSave to handle errors
  const handleSave = async (data: { name: string; limit: number; limitType: 'person' | 'household'; icon: string }) => {
    try {
      await onSave(data);
      onOpenChange(false); // Close on success
    } catch (err) {
      if (err instanceof Error) {
        handleSaveError(err);
      } else {
        handleSaveError(new Error('An unknown error occurred'));
      }
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Category</DialogTitle>
          <DialogDescription>
            Create a new category for food items.
          </DialogDescription>
        </DialogHeader>
        <CategoryForm 
          onSubmit={handleSave}
          error={error}
          isSaving={isLoading}
        />
      </DialogContent>
    </Dialog>
  )
}