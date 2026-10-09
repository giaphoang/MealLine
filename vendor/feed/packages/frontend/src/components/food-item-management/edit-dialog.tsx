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
import { FoodItemForm } from './form/FoodItemForm'
import { FoodItem } from '@/types/food-item'
import { AlertCircle } from "@/components/ui/icons";

interface EditDialogProps {
  foodItem: FoodItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (foodItem: Partial<FoodItem> & { keepTranslations?: boolean }) => Promise<void>
  isLoading?: boolean
}

export function EditDialog({ 
  foodItem, 
  open, 
  onOpenChange, 
  onSave,
  isLoading 
}: EditDialogProps) {
  const [error, setError] = useState<{ message: string } | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<any | null>(null);
  const [showTranslationConfirm, setShowTranslationConfirm] = useState(false);
  
  // Reset state when dialog opens/closes
  useEffect(() => {
    setError(null);
    setPendingUpdate(null);
    setShowTranslationConfirm(false);
  }, [open]);

  // Handle form submission
  const handleSubmit = async (data: any) => {
    try {
      if (foodItem) {
        // Check if name has changed
        if (data.name !== foodItem.name) {
          // Show translation confirmation
          setPendingUpdate(data);
          setShowTranslationConfirm(true);
        } else {
          // Name hasn't changed, save directly
          await onSave({
            id: foodItem.id,
            ...data
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
    if (!foodItem || !pendingUpdate) return;
    
    try {
      await onSave({
        id: foodItem.id,
        ...pendingUpdate,
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
    if (!foodItem || !pendingUpdate) return;
    
    try {
      await onSave({
        id: foodItem.id,
        ...pendingUpdate,
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
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Food Item</DialogTitle>
            <DialogDescription>
              Make changes to the food item. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          {foodItem && (
            <FoodItemForm
              key={foodItem.id}
              initialFulfilment={foodItem.fulfilment}
              onSubmit={handleSubmit}
              error={error}
              isSaving={isLoading}
              initialLimit={foodItem.limit === 100 ? 'no-limit' : foodItem.limit.toString()}
              initialLimitType={foodItem.limitType}
              initialName={foodItem.name}
              initialCategoryId={foodItem.categoryId.toString()}
              initialStatusFlags={foodItem.statusFlags}
              initialDietaryFlags={foodItem.dietaryFlags}
              initialSupply={foodItem.supply}
              onCancel={() => onOpenChange(false)}
            />
          )}
        </DialogContent>
      ) : (
        // Step 2: Translation confirmation - completely separate dialog content
        <DialogContent className="sm:max-w-[540px] px-8 sm:px-6">
          <DialogHeader>
            <DialogTitle>Translation Management</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="mb-2">
                  Existing translations were found for this food item.
                </p>
                <p className="mb-2">
                  Would you like to keep the current translations or replace them with new ones?
                </p>
                <p className="text-amber-600 font-medium">
                  Warning: this choice cannot be undone.
                </p>
              </div>
            </div>
          </div>
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
  );
}
