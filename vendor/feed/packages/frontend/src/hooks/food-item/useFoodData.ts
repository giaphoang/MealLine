// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useCallback, useMemo } from 'react'
import { FoodItem, StatusMessage, DietaryFlags, StatusFlags, FoodItemSupply, FoodItemFulfilment } from '@/types/food-item'
import { FoodItemService } from '@/services/food-item'
import { isDuplicateFoodItemNameError } from '@/services/food-item/duplicate-name-notification'
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService'

// Create a singleton instance of FoodItemService
const foodItemService = new FoodItemService();

export function useFoodItemData() {
  const [foodItems, setFoodItems] = useState<FoodItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<StatusMessage | null>(null)

  const setters = useMemo(() => ({
    setFoodItems,
    setIsLoading,
    setIsSaving,
    setError
  }), [])

  const refreshFoodItems = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Use the authenticated service
      const data = await foodItemService.getFoodItems();
      console.log('Food items received:', data);
      setFoodItems(data || []);
    } catch (err) {
      ErrorHandlerService.handleError(err, 'refreshFoodItems');
    } finally {
      setIsLoading(false);
    }
  }, [setters]);

  const createFoodItem = useCallback(async (data: {
    name: string
    limit: number
    limitType?: FoodItem['limitType']
    categoryId: number
    statusFlags: StatusFlags
    dietaryFlags: DietaryFlags
    supplyUpdate?: FoodItemSupply
    fulfilmentUpdate?: FoodItemFulfilment
  }) => {
    setIsSaving(true)
    setError(null)
    try {
      // Use the authenticated service
      const newItem = await foodItemService.createFoodItem(data);
      setFoodItems(current => [...current, newItem])
      return newItem
    } catch (err) {
      // The duplicate-name conflict gets a richer, page-aware toast (with a
      // "Mark In Stock" action) from `notifyFoodItemCreateError`, which the
      // calling page invokes in its own catch. Skip the generic toast here
      // so the two do not stack; still rethrow so callers know it failed.
      if (!isDuplicateFoodItemNameError(err)) {
        ErrorHandlerService.handleError(err, 'createFoodItem');
      }
      throw err
    } finally {
      setIsSaving(false)
    }
  }, [setters])

  const updateFoodItem = useCallback(async (data: {
    id: number
    name: string
    limit: number
    limitType?: FoodItem['limitType']
    categoryId: number
    statusFlags: StatusFlags
    dietaryFlags: DietaryFlags
    supplyUpdate?: FoodItemSupply
    fulfilmentUpdate?: FoodItemFulfilment
    keepTranslations?: boolean
  }) => {
    setIsSaving(true)
    setError(null)
    try {
      console.log('Updating food item with data:', data); // Debug log
      
      // Use the authenticated service
      const updatedItem = await foodItemService.updateFoodItem(data);
      setFoodItems(current =>
        current.map(item =>
          item.id === data.id ? updatedItem : item
        )
      )
      return updatedItem
    } catch (err) {
      ErrorHandlerService.handleError(err, 'updateFoodItem');
      throw err
    } finally {
      setIsSaving(false)
    }
  }, [setters])

  const deleteFoodItem = useCallback(async (id: number) => {
    setIsSaving(true)
    setError(null)
    try {
      await foodItemService.deleteFoodItem(id);
      setFoodItems(current => current.filter(item => item.id !== id));
    } catch (err) {
      ErrorHandlerService.handleError(err, 'deleteFoodItem');
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [setters])

  const bulkUpdateFoodItems = useCallback(async (
    items: FoodItem[],
    updates: Partial<Omit<FoodItem, 'id'>>
  ) => {
    setIsSaving(true)
    setError(null)
    try {
      // Use the authenticated service
      const updatedItems = await foodItemService.bulkUpdateFoodItems(items, updates);
      const itemIds = items.map(item => item.id);
      
      setFoodItems(current =>
        current.map(item =>
          itemIds.includes(item.id)
            ? updatedItems.find((updated: FoodItem) => updated.id === item.id) || item
            : item
        )
      )
      return updatedItems
    } catch (err) {
      ErrorHandlerService.handleError(err, 'bulkUpdateFoodItems');
      throw err
    } finally {
      setIsSaving(false)
    }
  }, [setters])

  const bulkDeleteFoodItems = useCallback(async (items: FoodItem[]) => {
    setIsSaving(true)
    setError(null)
    try {
      // Use the authenticated service
      await foodItemService.bulkDeleteFoodItems(items);
      const itemIds = items.map(item => item.id);
      
      setFoodItems(current => current.filter(item => !itemIds.includes(item.id)))
    } catch (err) {
      ErrorHandlerService.handleError(err, 'bulkDeleteFoodItems');
      throw err
    } finally {
      setIsSaving(false)
    }
  }, [setters])

  return {
    foodItems,
    isLoading,
    isSaving,
    error,
    refreshFoodItems,
    createFoodItem,
    updateFoodItem,
    deleteFoodItem,
    bulkUpdateFoodItems,
    bulkDeleteFoodItems
  }
}
