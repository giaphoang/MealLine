// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import { DeleteDialog as SharedDeleteDialog } from "@/components/shared/delete-dialog"
import { FoodItem, OUT_OF_STOCK_FLAGS } from '@/types/food-item'
import { FoodItemService } from '@/services/food-item'
import { useToast } from "@/components/ui/use-toast"

interface DeleteDialogProps {
  foodItem: FoodItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (foodItem: FoodItem) => Promise<void>
  onError?: (error: Error) => void
  isLoading?: boolean
  onSuccess?: () => void
}

const foodItemService = new FoodItemService();

export function DeleteDialog({
  foodItem,
  open,
  onOpenChange,
  onConfirm,
  onError,
  isLoading,
  onSuccess
}: DeleteDialogProps) {
  const { toast } = useToast();

  const handleMarkOutOfStock = async (item: FoodItem) => {
    try {
      await foodItemService.updateFoodItem({
        ...item,
        statusFlags: OUT_OF_STOCK_FLAGS
      });
      
      toast({
        title: "Success",
        description: `${item.name} has been marked as out of stock.`,
        variant: "default"
      });

      onSuccess?.();
    } catch (error) {
      console.error('Error marking item as out of stock:', error);
      if (error instanceof Error) {
        onError?.(error);
      } else {
        onError?.(new Error('Failed to mark item as out of stock'));
      }
    }
  };

  return (
    <SharedDeleteDialog
      item={foodItem}
      itemType="Food Item"
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      onError={onError}
      isLoading={isLoading}
      onAlternativeAction={handleMarkOutOfStock}
      alternativeActionLabel="Mark as Out of Stock"
    />
  )
}
