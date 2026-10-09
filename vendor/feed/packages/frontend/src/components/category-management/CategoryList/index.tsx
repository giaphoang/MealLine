// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useCallback, useState, useRef } from "react"
import { Category, BulkOperationResult } from "@/types/category"
import { columns } from "../data-table/columns"
import { DataList } from "@/components/shared/data-list/DataList"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TableBulkAction } from "@/types/table"
import { useMessage } from "@/hooks/message/useMessage"
import { Trash2 } from "@/components/ui/icons";
import { PlusIcon } from "@/components/animate-ui/icons/plus";
import { ShapesIcon } from "@/components/ui/shapes";
import { createPageTitleIcon } from "@/components/layout/page-title-icon";

// Page-title icon: animates on mount (page load) + hover. Mirrors the
// AI Configuration title pattern.
const PageTitleShapesIcon = createPageTitleIcon(ShapesIcon);
import { BulkDeleteDialog } from "./bulk-delete-dialog"

interface CategoryListProps {
  categories: Category[]
  isLoading: boolean
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
  bulkDelete: (categories: Category[]) => Promise<BulkOperationResult>
  onAddCategory?: () => void // <-- Add this line
}

export function CategoryList({
  categories,
  isLoading,
  onEdit,
  onDelete,
  bulkDelete,
  onAddCategory,
}: CategoryListProps) {
  const { showSuccess, showError } = useMessage()
  const [selectedForBulkDelete, setSelectedForBulkDelete] = useState<Category[]>([])
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const dataListRef = useRef<{ clearSelection: () => void } | null>(null)

  const handleBulkDelete = useCallback(async (selected: Category[]) => {
    console.log('CategoryList: Preparing bulk delete', { selected });
    setSelectedForBulkDelete(selected);
    setBulkDeleteDialogOpen(true);
  }, [])

  const handleConfirmBulkDelete = useCallback(async (categoriesToDelete: Category[]) => {
    try {
      console.log('CategoryList: Starting bulk delete', { categoriesToDelete });
      const result = await bulkDelete(categoriesToDelete);
      console.log('CategoryList: Got bulk delete result', { result });

      // Clean up all UI state
      setBulkDeleteDialogOpen(false);
      setSelectedForBulkDelete([]);
      
      // Clear selection in DataList component
      // This will cascade down to EnhancedDataTable
      if (dataListRef.current?.clearSelection) {
        dataListRef.current.clearSelection();
      }
      
      // Clear selection in DataList component
      dataListRef.current?.clearSelection?.();

      // Then handle messaging
      if (result && typeof result === 'object') {
        if (result.errors?.length > 0) {
          showError(result.errors[0], {
            duration: 8000
          });
        } else {
          showSuccess(`Successfully deleted ${result.success} ${result.success === 1 ? 'category' : 'categories'}`);
        }
      }
    } catch (error) {
      console.error('CategoryList: Bulk delete error:', error);
      if (error instanceof Error) {
        showError(`Bulk delete operation failed: ${error.message}`, {
          duration: 8000
        });
      }
    }
  }, [bulkDelete, showSuccess, showError])

  const handleError = useCallback((error: Error) => {
    showError(error.message, {
      duration: 8000
    });
  }, [showError])

  const handleDataListRef = useCallback((dataList: { clearSelection: () => void } | null) => {
    dataListRef.current = dataList;
  }, []);

  const toolbarActions = [
    {
      label: 'Add New Category',
      icon: PlusIcon,
      variant: 'default' as const,
      action: () => onAddCategory?.() // Call the prop function instead
    }
  ]

  const bulkActions: TableBulkAction<Category>[] = [
    {
      label: 'Delete Selected',
      icon: Trash2,
      action: handleBulkDelete,
      variant: 'destructive'
    }
  ]

  return (
    <TooltipProvider>
      <DataList
        ref={handleDataListRef}
        title="Category Management"
        description="Manage categories and their item limits."
        items={categories}
        columns={columns({ onEdit, onDelete })}
        isLoading={isLoading}
        bulkActions={bulkActions}
        filterColumn="name"
        filterPlaceholder="Filter categories..."
        enableColumnVisibility={true}
        onError={handleError}
        toolbarActions={toolbarActions}
        toolbarIcon={PageTitleShapesIcon}
      />

      <BulkDeleteDialog
        categories={selectedForBulkDelete}
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        onConfirm={handleConfirmBulkDelete}
        onError={handleError}
        isLoading={isLoading}
      />
    </TooltipProvider>
  )
}