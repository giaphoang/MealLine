// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CategoryForm } from './form/CategoryForm'
import { Category, LimitType } from '@/types/category'
import { AlertCircle } from "@/components/ui/icons";
import { DEFAULT_ICON } from '@/lib/food-icons'

interface EditDialogProps {
  category: Category | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (category: Partial<Category> & { keepTranslations?: boolean }) => Promise<void>
  isLoading?: boolean
}

export function EditDialog({ 
  category, 
  open, 
  onOpenChange, 
  onSave,
  isLoading 
}: EditDialogProps) {
  const [error, setError] = useState<{ message: string } | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<{ name: string; limit: number; limitType: LimitType; icon: string } | null>(null);
  const [showTranslationConfirm, setShowTranslationConfirm] = useState(false);
  
  // Reset state when dialog opens/closes
  useEffect(() => {
    setError(null);
    setPendingUpdate(null);
    setShowTranslationConfirm(false);
  }, [open]);

  // Handle form submission
  const handleSubmit = async (data: { name: string; limit: number; limitType: LimitType; icon: string }) => {
    try {
      if (category) {
        // Check if name has changed
        if (data.name !== category.name) {
          // Show translation confirmation
          setPendingUpdate(data);
          setShowTranslationConfirm(true);
        } else {
          // Name hasn't changed, save directly
          await onSave({
            id: category.id,
            name: data.name,
            limit: data.limit,
            limitType: data.limitType,
            icon: data.icon
          });
          onOpenChange(false);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError({ message: err.message });
      } else {
        setError({ message: 'An unknown error occurred' });
      }
    }
  };

  // Handle keeping translations
  const handleKeepTranslations = async () => {
    if (!category || !pendingUpdate) return;
    
    try {
      await onSave({
        id: category.id,
        name: pendingUpdate.name,
        limit: pendingUpdate.limit,
        limitType: pendingUpdate.limitType,
        icon: pendingUpdate.icon,
        keepTranslations: true
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof Error) {
        setError({ message: err.message });
      } else {
        setError({ message: 'An unknown error occurred' });
      }
    }
  };

  // Handle replacing translations
  const handleReplaceTranslations = async () => {
    if (!category || !pendingUpdate) return;
    
    try {
      await onSave({
        id: category.id,
        name: pendingUpdate.name,
        limit: pendingUpdate.limit,
        limitType: pendingUpdate.limitType,
        icon: pendingUpdate.icon,
        keepTranslations: false
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof Error) {
        setError({ message: err.message });
      } else {
        setError({ message: 'An unknown error occurred' });
      }
    }
  };

  // Go back to edit form
  const handleBack = () => {
    setShowTranslationConfirm(false);
  };

  // We'll render two completely separate dialogs based on the current step
  return (
    <Dialog 
      open={open} 
      onOpenChange={(isOpen) => {
        if (!isOpen && !isLoading) {
          onOpenChange(false);
        }
      }}
    >
      {!showTranslationConfirm ? (
        // Step 1: Normal edit form
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Make changes to the category. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          {category && (
            <CategoryForm
              onSubmit={handleSubmit}
              error={error}
              isSaving={isLoading}
              initialLimit={category.limit === 100 ? 'no-limit' : category.limit.toString()}
              initialLimitType={category.limitType}
              initialName={category.name}
              initialIcon={category.icon || DEFAULT_ICON}
            />
          )}
        </DialogContent>
      ) : (
        // Step 2: Translation confirmation - completely separate dialog content
        <DialogContent className="sm:max-w-[540px] px-8 sm:px-6">
          <DialogHeader>
            <DialogTitle>Translation Management</DialogTitle>
            <DialogDescription className="pt-4">
              Existing translations were found for this category.
            </DialogDescription>
            <div className="flex items-start space-x-3 py-4">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="block mb-2">
                  Would you like to keep the current translations or replace them with new ones?
                </span>
                <span className="block text-amber-600 font-medium">
                  Warning: this choice cannot be undone.
                </span>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="secondary" 
              onClick={handleBack}
              disabled={isLoading}
              className="sm:mt-0 mt-2"
            >
              Back
            </Button>
            <Button 
              variant="outline"
              className="text-destructive border-destructive hover:bg-destructive/10" 
              onClick={handleReplaceTranslations}
              disabled={isLoading}
            >
              Replace Translations
            </Button>
            <Button 
              variant="default"
              className="bg-blue-600 hover:bg-blue-700" 
              onClick={handleKeepTranslations}
              disabled={isLoading}
            >
              Keep Current Translations
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}