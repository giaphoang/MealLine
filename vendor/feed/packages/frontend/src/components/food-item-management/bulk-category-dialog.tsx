// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useState, useEffect, useMemo } from "react"
import { FoodItem } from "@/types/food-item"
import { Category } from "@/types/category"
import { useCategoryContext } from "@/contexts/CategoryContext"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ArrowLeftRight } from "@/components/ui/icons";

interface BulkCategoryDialogProps {
  items: FoodItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (items: FoodItem[], categoryId: number) => Promise<void>
  onError?: (error: Error) => void
  isLoading?: boolean
}

export function BulkCategoryDialog({
  items,
  open,
  onOpenChange,
  onConfirm,
  onError,
  isLoading = false,
}: BulkCategoryDialogProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("")
  const { categories, isLoading: isCategoriesLoading } = useCategoryContext()
  
  // Reset selected category when dialog opens or items change
  useEffect(() => {
    if (open) {
      setSelectedCategoryId("")
    }
  }, [open, items])

  const handleConfirm = async () => {
    if (!selectedCategoryId) {
      onError?.(new Error("Please select a category"))
      return
    }

    try {
      await onConfirm(items, Number(selectedCategoryId))
      onOpenChange(false)
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Failed to update categories"))
    }
  }

  const isDisabled = isLoading || isCategoriesLoading || !selectedCategoryId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            Change Category for {items.length} {items.length === 1 ? "Item" : "Items"}
          </DialogTitle>
          <DialogDescription>
            Select a new category for the selected items. This action will update all items at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="category">New Category</Label>
            <Select
              value={selectedCategoryId}
              onValueChange={(value) => setSelectedCategoryId(value)}
              disabled={isLoading || isCategoriesLoading}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {useMemo(() => {
                  return (categories || []).map((category: Category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ));
                }, [categories])}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={isDisabled}
          >
            {isLoading ? "Updating..." : "Update Categories"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
