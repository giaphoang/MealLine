// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useEffect } from 'react'
import { FoodItem, DietaryFlags, StatusFlags, FoodItemSupply, FoodItemFulfilment } from "@/types/food-item"
import { useFoodItemContext } from '@/contexts/FoodItemContext'
import { useDialogState } from '@/hooks/dialog/useDialogState'
import { FoodItemList } from './FoodItemList'
import { EditDialog } from "./edit-dialog"
import { DeleteDialog } from "./delete-dialog"
import { AddFoodItemDialog } from "./add-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { BulkDeleteDialog } from "@/components/shared/bulk-delete-dialog"
import { createFoodItemBulkActions } from "./utils/bulk-actions"
import { ErrorBoundary } from 'react-error-boundary'
import { useMessage } from '@/hooks/message/useMessage'
import { notifyFoodItemCreateError } from '@/services/food-item/duplicate-name-notification'

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div role="alert" className="p-4 bg-red-50 text-red-900 rounded-md">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <pre className="mt-2 text-sm">{error.message}</pre>
      <button
        onClick={resetErrorBoundary}
        className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
      >
        Try again
      </button>
    </div>
  )
}

export function FoodItemManagement() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Refresh the page when error boundary is reset
        window.location.reload()
      }}
    >
      <FoodItemContent />
    </ErrorBoundary>
  )
}

function FoodItemContent() {
  // State for bulk operations
  const [selectedForBulkDelete, setSelectedForBulkDelete] = React.useState<FoodItem[]>([])
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = React.useState(false)

  // Hook for food item data management
  const { showMessage } = useMessage();

  const {
    foodItems,
    isLoading,
    isSaving,
    error,
    refreshFoodItems,
    createFoodItem,
    updateFoodItem,
    deleteFoodItem
  } = useFoodItemContext();

  // Dialog state
  const editDialog = useDialogState<FoodItem>()
  const deleteDialog = useDialogState<FoodItem>()
  const addDialog = useDialogState()

  // Quick status actions never supply optional Supply annotations.
  const handleUpdate = async (
    updatedItem: FoodItem & { supplyUpdate?: FoodItemSupply }
  ) => {
    try {
      await updateFoodItem(updatedItem)
      await refreshFoodItems()
      showMessage('Food item updated successfully', 'success');
    } catch (err) {
      console.error('Update failed:', err);
    }
  }

  // Handle food item creation
  const handleCreateFoodItem = async (data: {
    name: string;
    limit: number;
    limitType?: FoodItem['limitType'];
    categoryId: number;
    statusFlags: StatusFlags;
    dietaryFlags: DietaryFlags;
    supply?: FoodItemSupply;    fulfilment?: FoodItemFulfilment;
  }) => {
    try {
      await createFoodItem({
        ...data,
        categoryId: parseInt(data.categoryId.toString(), 10),
        supplyUpdate: data.supply,
        fulfilmentUpdate: data.fulfilment
      });
      await refreshFoodItems(); // Force refresh to get latest data
      showMessage('Food item created successfully', 'success');
      addDialog.close(); // Close the dialog on success
      return true; // Indicate success
    } catch (err) {
      console.error('Food item creation failed:', err);
      // Duplicate-name conflicts get a "Mark In Stock" toast action; on
      // success the inventory list is refreshed so the (formerly hidden)
      // item appears. Other errors are already toasted by the data hook.
      notifyFoodItemCreateError(err, { onMarkedInStock: refreshFoodItems });
      return false; // Indicate failure
    }
  }

  // Edit handlers
  const handleEdit = (foodItem: FoodItem) => {
    editDialog.open(foodItem)
  }

  const handleSaveEdit = async (updatedFoodItem: Partial<FoodItem> & { keepTranslations?: boolean }) => {
    if (!editDialog.data) return;

    try {
      await updateFoodItem({
        id: editDialog.data.id,
        name: updatedFoodItem.name!,
        limit: updatedFoodItem.limit!,
        limitType: updatedFoodItem.limitType,
        categoryId: updatedFoodItem.categoryId!,
        statusFlags: updatedFoodItem.statusFlags!,
        dietaryFlags: updatedFoodItem.dietaryFlags!,
        supplyUpdate: updatedFoodItem.supply,
        fulfilmentUpdate: updatedFoodItem.fulfilment,
        keepTranslations: updatedFoodItem.keepTranslations,
      });
      await refreshFoodItems(); // Force refresh
      showMessage('Food item updated successfully', 'success');
      editDialog.close();
    } catch (err) {
      console.error('Update failed:', err);
    }
  }

  // Delete handlers
  const handleDelete = (foodItem: FoodItem) => {
    deleteDialog.open(foodItem)
  }

  useEffect(() => {
    refreshFoodItems()
  }, [refreshFoodItems])

  const handleConfirmDelete = async (foodItem: FoodItem) => {
    try {
      await deleteFoodItem(foodItem.id);
      showMessage('Food item deleted successfully', 'success');
      deleteDialog.close();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  // Bulk operation handlers
  const handleBulkDelete = async (items: FoodItem[]) => {
    setSelectedForBulkDelete(items);
    setBulkDeleteDialogOpen(true);
  }

  const handleConfirmBulkDelete = async (itemsToDelete: FoodItem[]) => {
    try {
      await Promise.all(itemsToDelete.map(item => deleteFoodItem(item.id)));
      showMessage(`Successfully deleted ${itemsToDelete.length} items`, 'success');
      setBulkDeleteDialogOpen(false);
      setSelectedForBulkDelete([]);
    } catch (err) {
      console.error('Bulk delete failed:', err);
    }
  }

  const handleBulkSetInStock = async (items: FoodItem[]) => {
    try {
      await Promise.all(items.map(item => updateFoodItem({
        ...item,
        statusFlags: { isInStock: true, isLimited: false, isClearance: false }
      })));
      await refreshFoodItems();
      showMessage(`Successfully updated ${items.length} items`, 'success');
    } catch (err) {
      console.error('Bulk update failed:', err);
    }
  }

  const handleBulkSetOutOfStock = async (items: FoodItem[]) => {
    try {
      await Promise.all(items.map(item => updateFoodItem({
        ...item,
        statusFlags: { isInStock: false, isLimited: false, isClearance: false }
      })));
      await refreshFoodItems();
      showMessage(`Successfully updated ${items.length} items`, 'success');
    } catch (err) {
      console.error('Bulk update failed:', err);
    }
  }

  return (
    <div className="space-y-8" data-testid="food-item-management">
        <FoodItemList
          foodItems={foodItems}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onAddItem={() => addDialog.open()}
        />

        <EditDialog
          foodItem={editDialog.data}
          open={editDialog.isOpen}
          onOpenChange={editDialog.setOpen}
          onSave={handleSaveEdit}
          isLoading={isSaving}
        />

        <DeleteDialog
          foodItem={deleteDialog.data}
          open={deleteDialog.isOpen}
          onOpenChange={deleteDialog.setOpen}
          onConfirm={() => handleConfirmDelete(deleteDialog.data!)}
          isLoading={isSaving}
          onSuccess={() => refreshFoodItems()}
        />

        <AddFoodItemDialog
          open={addDialog.isOpen}
          onOpenChange={addDialog.setOpen}
          onSave={handleCreateFoodItem}
          isLoading={isSaving}
        />

        <BulkDeleteDialog
          items={selectedForBulkDelete}
          itemType="Food Item"
          pluralItemType="Food Items"
          open={bulkDeleteDialogOpen}
          onOpenChange={setBulkDeleteDialogOpen}
          onConfirm={handleConfirmBulkDelete}
          onError={(err) => showMessage(err.message, 'error')}
          isLoading={isSaving}
        />
    </div>
  )
}
