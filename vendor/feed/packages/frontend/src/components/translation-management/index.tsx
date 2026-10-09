// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Translation, TranslationType } from "@/types/translation"
import { useTranslationData } from "@/hooks/translation/useTranslationData"
import { useDialogState } from "@/hooks/dialog/useDialogState"
import { useEnabledLanguages } from "@/hooks/language/useEnabledLanguages"
import { TranslationList } from "./TranslationList"
import { EditDialog } from "./edit-dialog"
import { DeleteDialog } from "./delete-dialog"
import { AddTranslationDialog } from "./add-dialog"
import { RetryDialog } from "./retry-dialog"
import { FindMissingDialog } from "./find-missing-dialog"
import { useMessage } from "@/hooks/message/useMessage"

export function TranslationManagement() {
  // Hooks for data management and UI state
  const { 
    translations,
    isLoading,
    isSaving,
    refreshTranslations,
    updateTranslation,
    deleteTranslation,
    bulkDeleteTranslations,
    bulkRetryTranslations,
    bulkIncludeOriginal,
    bulkRemoveOriginal,
    createTranslation,
    retryTranslation,
    findMissingTranslations
  } = useTranslationData();

  const { showMessage } = useMessage();
  const { languages: enabledLanguages } = useEnabledLanguages();

  // Dialog state
  const editDialog = useDialogState<Translation>();
  const deleteDialog = useDialogState<Translation>();
  const retryDialog = useDialogState<Translation>();
  const addDialog = useDialogState();
  const findMissingDialog = useDialogState();

  // Edit handlers
  const handleEdit = (translation: Translation) => {
    editDialog.open(translation);
  };

  const handleSaveEdit = async (updatedTranslation: Partial<Translation>) => {
    if (!editDialog.data) return;

    try {
      await updateTranslation({
        id: editDialog.data.id,
        translatedText: updatedTranslation.translatedText
      });
      await refreshTranslations(); // Force refresh
      editDialog.close();
      showMessage("Translation updated successfully", "success");
    } catch (err) {
      // Error already handled by ErrorHandlerService in hook
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async (translationsToDelete: Translation[]) => {
    try {
      console.log("Starting bulk delete:", translationsToDelete);
      const result = await bulkDeleteTranslations(translationsToDelete);
      console.log("Bulk delete result:", result);

      await refreshTranslations(); // Force refresh

      if (result.failed > 0) {
        // Show the actual error message from the backend
        const message = result.errors[0] || "Operation failed";
        showMessage(message, "error");
      } else {
        const message = `Successfully deleted ${result.success} ${
          result.success === 1 ? "translation" : "translations"
        }`;
        showMessage(message, "success");
      }
    } catch (err) {
      // Error already handled by ErrorHandlerService in hook
    }
  };
  
  // Bulk retry handler
  const handleBulkRetry = async (translationsToRetry: Translation[]) => {
    try {
      console.log("Starting bulk retry:", translationsToRetry);
      const result = await bulkRetryTranslations(translationsToRetry);
      console.log("Bulk retry result:", result);

      await refreshTranslations(); // Force refresh

      if (result.failed > 0) {
        // Show the actual error message from the backend
        const message = result.errors[0] || "Some translations failed to retry";
        showMessage(message, "error");
      } else {
        const message = `Successfully queued ${result.success} ${
          result.success === 1 ? "translation" : "translations"
        } for retry`;
        showMessage(message, "success");
      }
    } catch (err) {
      // Error already handled by ErrorHandlerService in hook
    }
  };

  // Delete handlers
  const handleDelete = (translation: Translation) => {
    deleteDialog.open(translation);
  };

  const handleConfirmDelete = async (translation: Translation) => {
    try {
      await deleteTranslation(translation.id);
      deleteDialog.close();
      showMessage("Translation deleted successfully", "success");
    } catch (err) {
      // Error already handled by ErrorHandlerService in hook
    }
  };

  // Add new translation handler
  const handleCreateTranslation = async (data: { originalText: string }) => {
    try {
      // Get enabled languages
      const availableLanguages = enabledLanguages || [];
      
      if (availableLanguages.length === 0) {
        showMessage("No target languages are enabled. Please enable languages in the Language Management section.", "error");
        return;
      }

      // Filter out source language (English)
      const targetLanguages = availableLanguages
        .filter(lang => lang.name !== 'English')
        .map(lang => lang.name);

      if (targetLanguages.length === 0) {
        showMessage("No target languages found. Please enable at least one non-English language.", "error");
        return;
      }

      await createTranslation({
        originalText: data.originalText,
        targetLanguages
      });
      addDialog.close();
      showMessage("Translations initiated successfully", "success");
      await refreshTranslations();
    } catch (err) {
      // Error already handled by ErrorHandlerService in hook
    }
  };

  // Helper function for the "Add New Translation" button
  const handleAddNewTranslation = () => {
    addDialog.open();
  };

  // Helper function for the "Find Missing Translations" button
  const handleFindMissingTranslations = () => {
    findMissingDialog.open();
  };

  // Handler to actually find missing translations
  const handleExecuteFindMissing = async () => {
    try {
      const result = await findMissingTranslations(false); // Just scan, don't process automatically
      return result;
    } catch (err) {
      // Error already handled by ErrorHandlerService in hook
      throw err;
    }
  };

  // Handler to process selected translation types
  const handleProcessSelectedTranslations = async (types: TranslationType[]) => {
    try {
      const result = await findMissingTranslations(true, types); // Process the selected types
      await refreshTranslations(); // Refresh to show the new translations
      return result;
    } catch (err) {
      // Error already handled by ErrorHandlerService in hook
      throw err;
    }
  };

  // Handler to bulk retry selected translation types
  const handleBulkRetryByType = async (types: TranslationType[]) => {
    try {
      // Define timeout for stale pending translations (1 minute)
      const PENDING_TIMEOUT_MS = 60 * 1000;
      const now = new Date().getTime();
      
      // Find translations to retry - both failed and stale pending
      const translationsToRetry = translations.filter(translation => 
        types.includes(translation.type) && (
          // Include failed translations
          translation.status === 'failed' ||
          // Include stale pending translations (pending for > 1 minute)
          (translation.status === 'pending' && 
           translation.createdAt && 
           (now - new Date(translation.createdAt).getTime() > PENDING_TIMEOUT_MS))
        )
      );
      
      if (translationsToRetry.length === 0) {
        showMessage("No failed or stale translations found for the selected types", "warning");
        return { success: 0, failed: 0 };
      }
      
      // Log what we're about to retry
      console.log(`Retrying ${translationsToRetry.length} translations:`, 
        translationsToRetry.map(t => ({ id: t.id, type: t.type, status: t.status })));
      
      const result = await bulkRetryTranslations(translationsToRetry);
      await refreshTranslations(); // Refresh to show updated status
      return result;
    } catch (err) {
      // Error already handled by ErrorHandlerService in hook
      throw err;
    }
  };

  // Handler to bulk delete selected translation types
  const handleBulkDeleteByType = async (types: TranslationType[]) => {
    try {
      // Define timeout for stale pending translations (1 minute)
      const PENDING_TIMEOUT_MS = 60 * 1000;
      const now = new Date().getTime();
      
      // Find all translations of selected types that are missing, failed, or stale pending
      const deletableTranslations = translations.filter(translation => 
        types.includes(translation.type) && (
          // Include failed translations
          translation.status === 'failed' || 
          // Include translations with no text
          !translation.translatedText ||
          // Include stale pending translations
          (translation.status === 'pending' && 
           translation.createdAt && 
           (now - new Date(translation.createdAt).getTime() > PENDING_TIMEOUT_MS))
        )
      );
      
      if (deletableTranslations.length === 0) {
        showMessage("No translations found to delete for the selected types", "warning");
        return { success: 0, failed: 0 };
      }
      
      // Log what we're about to delete
      console.log(`Deleting ${deletableTranslations.length} translations:`, 
        deletableTranslations.map(t => ({ id: t.id, type: t.type, status: t.status })));
      
      const result = await bulkDeleteTranslations(deletableTranslations);
      await refreshTranslations(); // Refresh to show updated list
      return result;
    } catch (err) {
      // Error already handled by ErrorHandlerService in hook
      throw err;
    }
  };

  // Retry handlers
  const handleRetry = (translation: Translation) => {
    // If it's a completed or pending translation, show confirmation dialog
    if (translation.status === 'completed' || translation.status === 'pending') {
      retryDialog.open(translation);
    } else {
      // For failed status, retry directly
      handleConfirmRetry(translation);
    }
  };
  
  const handleConfirmRetry = async (translation: Translation) => {
    try {
      await retryTranslation(translation.id);
      if (retryDialog.isOpen) {
        retryDialog.close();
      }
      // Show appropriate success message based on status
      const successMessage = translation.status === 'completed' ? 
        "Translation restarted successfully" : 
        translation.status === 'pending' ? 
        "Translation process reset successfully" :
        "Initiated retry for failed translation";

      showMessage(successMessage, "success");
      await refreshTranslations(); // Refresh to get updated status
    } catch (err) {
      // Error already handled by ErrorHandlerService in hook
    }
  };

  return (
    <div className="space-y-8">
      <TranslationList
        translations={translations}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRetry={handleRetry}
        bulkDelete={handleBulkDelete}
        bulkRetry={handleBulkRetry}
        bulkIncludeOriginal={bulkIncludeOriginal}
        bulkRemoveOriginal={bulkRemoveOriginal}
        onAddTranslation={handleAddNewTranslation}
        onFindMissingTranslations={handleFindMissingTranslations}
      />

      <EditDialog
        translation={editDialog.data}
        open={editDialog.isOpen}
        onOpenChange={editDialog.setOpen}
        onSave={handleSaveEdit}
        isLoading={isSaving}
      />

      <DeleteDialog
        translation={deleteDialog.data}
        open={deleteDialog.isOpen}
        onOpenChange={deleteDialog.setOpen}
        onConfirm={handleConfirmDelete}
        isLoading={isSaving}
      />

      <AddTranslationDialog
        open={addDialog.isOpen}
        onOpenChange={addDialog.setOpen}
        onSave={handleCreateTranslation}
        isLoading={isSaving}
      />
      
      <RetryDialog 
        translation={retryDialog.data}
        open={retryDialog.isOpen}
        onOpenChange={retryDialog.setOpen}
        onConfirm={handleConfirmRetry}
        isLoading={isSaving}
      />
      
      <FindMissingDialog
        open={findMissingDialog.isOpen}
        onOpenChange={findMissingDialog.setOpen}
        onFindMissing={handleExecuteFindMissing}
        onProcessSelected={handleProcessSelectedTranslations}
        onBulkRetry={handleBulkRetryByType}
        onBulkDelete={handleBulkDeleteByType}
        isLoading={isSaving}
        translations={translations}
      />
    </div>
  );
}
