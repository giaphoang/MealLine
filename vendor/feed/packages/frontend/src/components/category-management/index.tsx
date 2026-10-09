// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Category } from "@/types/category"
import { useCategoryData } from "@/hooks/category/useCategoryData"
import { useDialogState } from "@/hooks/dialog/useDialogState"
import { CategoryList } from "./CategoryList"
import { EditDialog } from "./edit-dialog"
import { DeleteDialog } from "./delete-dialog"
import { AddCategoryDialog } from "./add-dialog"
import { useMessage } from "@/hooks/message/useMessage"

export function CategoryManagement() {
  // Hooks for data management and UI state
  const {
    categories,
    isLoading,
    isSaving,
    refreshCategories,
    updateCategory,
    deleteCategory,
    bulkDeleteCategories,
    createCategory
  } = useCategoryData();

  const { showMessage } = useMessage();

  // Dialog state
  const editDialog = useDialogState<Category>();
  const deleteDialog = useDialogState<Category>();
  const addDialog = useDialogState();

  // Edit handlers
  const handleEdit = (category: Category) => {
    editDialog.open(category);
  };

  const handleSaveEdit = async (updatedCategory: Partial<Category> & { keepTranslations?: boolean }) => {
    if (!editDialog.data) return;

    try {
      await updateCategory({
        id: editDialog.data.id,
        name: updatedCategory.name!,
        limit: updatedCategory.limit!,
        limitType: updatedCategory.limitType!,
        icon: updatedCategory.icon,
        keepTranslations: updatedCategory.keepTranslations
      });
      await refreshCategories(); // Force refresh
      editDialog.close();
      showMessage("Category updated successfully", "success");
    } catch (err) {
      // Error handled by ErrorHandlerService in hook
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async (categoriesToDelete: Category[]) => {
    try {
      console.log("Starting bulk delete:", categoriesToDelete);
      const result = await bulkDeleteCategories(categoriesToDelete);
      console.log("Bulk delete result:", result);

      await refreshCategories(); // Force refresh

      if (result.failed > 0) {
        // Show the actual error message from the backend
        const message = result.errors[0] || "Operation failed";
        showMessage(message, "error");
      } else {
        const message = `Successfully deleted ${result.success} ${
          result.success === 1 ? "category" : "categories"
        }`;
        showMessage(message, "success");
      }
    } catch (err) {
      // Error handled by ErrorHandlerService in hook
      console.error("Bulk delete failed:", err);
    }
  };

  // Delete handlers
  const handleDelete = (category: Category) => {
    deleteDialog.open(category);
  };

  const handleConfirmDelete = async (category: Category) => {
    try {
      await deleteCategory(category.id);
      deleteDialog.close();
      showMessage("Category deleted successfully", "success");
    } catch (err) {
      // Error handled by ErrorHandlerService in hook
    }
  };

  // Add new category handler
  const handleCreateCategory = async (data: { name: string; limit: number; limitType: 'person' | 'household'; icon: string }) => {
    try {
      await createCategory(data);
      addDialog.close();
      showMessage("Category created successfully", "success");
    } catch (err) {
      // Error handled by ErrorHandlerService in hook
    }
  };

  // Helper function for the "Add New Category" button in CategoryList
  const handleAddNewCategory = () => {
    addDialog.open();
  };

  return (
    <div className="space-y-8">
      <CategoryList
        categories={categories}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        bulkDelete={handleBulkDelete}
        onAddCategory={handleAddNewCategory} // Pass the helper function down
      />

      <EditDialog
        category={editDialog.data}
        open={editDialog.isOpen}
        onOpenChange={editDialog.setOpen}
        onSave={handleSaveEdit}
        isLoading={isSaving}
      />

      <DeleteDialog
        category={deleteDialog.data}
        open={deleteDialog.isOpen}
        onOpenChange={deleteDialog.setOpen}
        onConfirm={handleConfirmDelete}
        isLoading={isSaving}
      />

      <AddCategoryDialog
        open={addDialog.isOpen}
        onOpenChange={addDialog.setOpen}
        onSave={handleCreateCategory}
        isLoading={isSaving}
      />
    </div>
  );
}