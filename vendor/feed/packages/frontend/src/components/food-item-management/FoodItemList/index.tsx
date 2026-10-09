// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useCallback, useMemo, useState, useRef } from "react"
import { FoodItem, FoodItemSupply, FoodItemStatus, OUT_OF_STOCK_FLAGS } from "@/types/food-item"
import { columns } from "../data-table/columns"
import { DataList } from "@/components/shared/data-list/DataList"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCategoryContext } from "@/contexts/CategoryContext"
import { useFoodItemContext } from "@/contexts/FoodItemContext"
import { TableBulkAction } from "@/types/table"
import { useMessage } from "@/hooks/message/useMessage"
import { BulkDeleteDialog } from "@/components/shared/bulk-delete-dialog"
import { BulkCategoryDialog } from "../bulk-category-dialog"
import {
  FOOD_ITEM_STATUS_FILTERS,
  filterFoodItemsForInventoryUpdate,
} from "../filters"
import { X, Trash2, Package, AlertTriangle, Tag, ArrowLeftRight, ChevronDown, ListFilter } from "@/components/ui/icons";
import { PlusIcon } from "@/components/animate-ui/icons/plus";
import { AppleIcon } from "@/components/ui/apple";
import { createPageTitleIcon } from "@/components/layout/page-title-icon";

// Page-title icon: animates on mount (page load) + hover. Mirrors the
// AI Configuration title pattern.
const PageTitleAppleIcon = createPageTitleIcon(AppleIcon);

interface FoodItemListProps {
  onAddItem?: () => void
  foodItems: FoodItem[]
  isLoading: boolean
  onEdit: (item: FoodItem) => void
  onDelete: (item: FoodItem) => void
  onUpdate: (
    updatedItem: FoodItem & { supplyUpdate?: FoodItemSupply }
  ) => Promise<void>
  onCategoryChange?: (item: FoodItem, categoryId: number) => Promise<void>
}

export function FoodItemList({
  foodItems,
  isLoading,
  onEdit,
  onDelete,
  onUpdate,
  onAddItem,
  onCategoryChange,
}: FoodItemListProps) {
  const { categories } = useCategoryContext()
  const { bulkUpdateFoodItems, bulkDeleteFoodItems } = useFoodItemContext()
  const { showError, showSuccess } = useMessage()
  const [selectedForBulkDelete, setSelectedForBulkDelete] = useState<FoodItem[]>([])
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [selectedForCategoryChange, setSelectedForCategoryChange] = useState<FoodItem[]>([])
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set())
  const [selectedStatuses, setSelectedStatuses] = useState<Set<FoodItemStatus>>(new Set())
  const dataListRef = useRef<{ clearSelection: () => void } | null>(null)

  const filteredFoodItems = useMemo(
    () => filterFoodItemsForInventoryUpdate(foodItems, selectedCategoryIds, selectedStatuses),
    [foodItems, selectedCategoryIds, selectedStatuses],
  )

  const categoryFilterLabel = selectedCategoryIds.size === 0
    ? 'All Categories'
    : `${selectedCategoryIds.size} ${selectedCategoryIds.size === 1 ? 'Category' : 'Categories'}`

  const statusFilterLabel = selectedStatuses.size === 0
    ? 'All Status'
    : `${selectedStatuses.size} ${selectedStatuses.size === 1 ? 'Status' : 'Statuses'}`

  const toggleCategoryFilter = useCallback((categoryId: number, checked: boolean) => {
    setSelectedCategoryIds((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(categoryId)
      } else {
        next.delete(categoryId)
      }
      return next
    })
  }, [])

  const toggleStatusFilter = useCallback((status: FoodItemStatus, checked: boolean) => {
    setSelectedStatuses((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(status)
      } else {
        next.delete(status)
      }
      return next
    })
  }, [])

  const handleError = useCallback((error: Error) => {
    showError(error.message)
  }, [showError])

  const handleUpdateStatus = useCallback(async (item: FoodItem, statusFlags: FoodItem['statusFlags']) => {
    try {
      await onUpdate({ ...item, statusFlags })
    } catch (error) {
      handleError(error as Error)
    }
  }, [onUpdate, handleError])

  const handleDataListRef = useCallback((dataList: { clearSelection: () => void } | null) => {
    dataListRef.current = dataList;
  }, []);

  const clearAllSelections = useCallback(() => {
    setSelectedForBulkDelete([]);
    setSelectedForCategoryChange([]);
    if (dataListRef.current?.clearSelection) {
      dataListRef.current.clearSelection();
    }
  }, []);

  const handleBulkOperation = useCallback(async (
    operation: (selected: FoodItem[]) => Promise<unknown> | unknown,
    selected: FoodItem[], 
    successMessage: string
  ) => {
    try {
      await operation(selected)
      showSuccess(successMessage)
      clearAllSelections()
    } catch (error) {
      handleError(error as Error)
      throw error
    }
  }, [handleError, showSuccess, clearAllSelections])

  const handleBulkOutOfStock = useCallback(async (selected: FoodItem[]) => {
    await handleBulkOperation(
      () => bulkUpdateFoodItems(selected, {
        statusFlags: OUT_OF_STOCK_FLAGS
      }),
      selected,
      `Successfully marked ${selected.length} ${selected.length === 1 ? 'item' : 'items'} as out of stock`
    )
  }, [bulkUpdateFoodItems, handleBulkOperation])

  const handleBulkInStock = useCallback(async (selected: FoodItem[]) => {
    await handleBulkOperation(
      () => bulkUpdateFoodItems(selected, {
        statusFlags: {
          isInStock: true,
          isLimited: false,
          isClearance: false
        }
      }),
      selected,
      `Successfully marked ${selected.length} ${selected.length === 1 ? 'item' : 'items'} as in stock`
    )
  }, [bulkUpdateFoodItems, handleBulkOperation])

  const handleBulkLimitedSupply = useCallback(async (selected: FoodItem[]) => {
    await handleBulkOperation(
      () => bulkUpdateFoodItems(selected, {
        statusFlags: {
          isInStock: true,
          isLimited: true,
          isClearance: false
        }
      }),
      selected,
      `Successfully marked ${selected.length} ${selected.length === 1 ? 'item' : 'items'} as limited supply`
    )
  }, [bulkUpdateFoodItems, handleBulkOperation])

  const handleBulkClearance = useCallback(async (selected: FoodItem[]) => {
    await handleBulkOperation(
      () => bulkUpdateFoodItems(selected, {
        statusFlags: {
          isInStock: true,
          isLimited: false,
          isClearance: true
        }
      }),
      selected,
      `Successfully marked ${selected.length} ${selected.length === 1 ? 'item' : 'items'} as clearance`
    )
  }, [bulkUpdateFoodItems, handleBulkOperation])

  const handleBulkDelete = useCallback(async (selected: FoodItem[]) => {
    setSelectedForBulkDelete(selected);
    setBulkDeleteDialogOpen(true);
  }, [])

  const handleBulkChangeCategory = useCallback(async (selected: FoodItem[]) => {
    setSelectedForCategoryChange(selected);
    setCategoryDialogOpen(true);
  }, [])

  const handleConfirmBulkDelete = useCallback(async (itemsToDelete: FoodItem[]) => {
    try {
      await bulkDeleteFoodItems(itemsToDelete);
      showSuccess(`Successfully deleted ${itemsToDelete.length} ${itemsToDelete.length === 1 ? 'item' : 'items'}`);
      setBulkDeleteDialogOpen(false);
      clearAllSelections();
    } catch (error) {
      if (error instanceof Error) {
        showError(`Bulk delete operation failed: ${error.message}`);
      } else {
        showError('An unexpected error occurred during bulk delete');
      }
    }
  }, [bulkDeleteFoodItems, showError, showSuccess, clearAllSelections])

  const handleConfirmCategoryChange = useCallback(async (items: FoodItem[], categoryId: number) => {
    try {
      await bulkUpdateFoodItems(items, { categoryId });
      showSuccess(`Successfully updated category for ${items.length} ${items.length === 1 ? 'item' : 'items'}`);
      setCategoryDialogOpen(false);
      clearAllSelections();
    } catch (error) {
      if (error instanceof Error) {
        showError(`Failed to update categories: ${error.message}`);
      } else {
        showError('An unexpected error occurred while updating categories');
      }
      throw error;
    }
  }, [bulkUpdateFoodItems, showError, showSuccess, clearAllSelections]);

  const handleBulkMarkOutOfStock = useCallback(async (items: FoodItem[]) => {
    try {
      await bulkUpdateFoodItems(items, { statusFlags: OUT_OF_STOCK_FLAGS });
      showSuccess(`Successfully marked ${items.length} ${items.length === 1 ? 'item' : 'items'} as out of stock`);
      setBulkDeleteDialogOpen(false);
      clearAllSelections();
    } catch (error) {
      if (error instanceof Error) {
        showError(`Failed to mark items as out of stock: ${error.message}`);
      } else {
        showError('An unexpected error occurred while updating items');
      }
    }
  }, [bulkUpdateFoodItems, showError, showSuccess, clearAllSelections]);

  const handleBulkDeleteDialogClose = useCallback(() => {
    setBulkDeleteDialogOpen(false);
    setSelectedForBulkDelete([]);
  }, []);

  const toolbarActions = [
    {
      label: 'Add New Item',
      icon: PlusIcon,
      variant: 'default' as const,
      action: () => onAddItem?.()
    }
  ]

  const inventoryFilterControls = (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 whitespace-nowrap">
            <ListFilter className="h-4 w-4" />
            {categoryFilterLabel}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuItem onSelect={() => setSelectedCategoryIds(new Set())}>
            All Categories
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {categories.map((category) => (
            <DropdownMenuCheckboxItem
              key={category.id}
              checked={selectedCategoryIds.has(category.id)}
              onCheckedChange={(checked) => toggleCategoryFilter(category.id, checked === true)}
              onSelect={(event) => event.preventDefault()}
            >
              {category.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 whitespace-nowrap">
            <ListFilter className="h-4 w-4" />
            {statusFilterLabel}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setSelectedStatuses(new Set())}>
            All Status
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {FOOD_ITEM_STATUS_FILTERS.map((status) => (
            <DropdownMenuCheckboxItem
              key={status.value}
              checked={selectedStatuses.has(status.value)}
              onCheckedChange={(checked) => toggleStatusFilter(status.value, checked === true)}
              onSelect={(event) => event.preventDefault()}
            >
              {status.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  const bulkActions: TableBulkAction<FoodItem>[] = [
    {
      label: 'Mark In Stock',
      icon: Package,
      action: handleBulkInStock
    },
    {
      label: 'Mark Limited Supply',
      icon: AlertTriangle,
      action: handleBulkLimitedSupply
    },
    {
      label: 'Mark Clearance',
      icon: Tag,
      action: handleBulkClearance
    },
    {
      label: 'Mark Out of Stock',
      icon: X,
      action: handleBulkOutOfStock
    },
    {
      label: 'Change Category',
      icon: ArrowLeftRight,
      action: handleBulkChangeCategory
    },
    {
      label: 'Delete Selected',
      icon: Trash2,
      action: handleBulkDelete,
      variant: 'destructive'
    }
  ]

  return (
    <div className="space-y-6 min-w-0 w-full" data-testid="data-list">
      <TooltipProvider>
        <DataList
          ref={handleDataListRef}
          title="Food Item Management"
          description="Manage food items, their limits, status, and dietary information."
          items={filteredFoodItems}
          columns={columns({ 
            onEdit, 
            onDelete, 
            categories,
            onCategoryChange: onCategoryChange || (async (item: FoodItem) => {
              // If no category change handler provided, use bulk dialog for single item
              setSelectedForCategoryChange([item]);
              setCategoryDialogOpen(true);
            }),
            onUpdateStatus: handleUpdateStatus
          })}
          isLoading={isLoading}
          bulkActions={bulkActions}
          filterColumn="name"
          filterPlaceholder="Filter food items..."
          enableColumnVisibility={true}
          onError={handleError}
          onUpdate={onUpdate}
          toolbarIcon={PageTitleAppleIcon}
          toolbarActions={toolbarActions}
          toolbarControls={inventoryFilterControls}
          preservePageOnDataChange={true}
        />

        <BulkDeleteDialog
          items={selectedForBulkDelete}
          itemType="Food Item"
          pluralItemType="Food Items"
          open={bulkDeleteDialogOpen}
          onOpenChange={handleBulkDeleteDialogClose}
          onConfirm={handleConfirmBulkDelete}
          onError={handleError}
          isLoading={isLoading}
          onAlternativeAction={handleBulkMarkOutOfStock}
          alternativeActionLabel="Mark as Out of Stock"
        />

        <BulkCategoryDialog
          items={selectedForCategoryChange}
          open={categoryDialogOpen}
          onOpenChange={setCategoryDialogOpen}
          onConfirm={handleConfirmCategoryChange}
          onError={handleError}
          isLoading={isLoading}
        />

      </TooltipProvider>
    </div>
  )
}
