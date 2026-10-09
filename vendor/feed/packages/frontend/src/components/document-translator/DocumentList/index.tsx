// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { DocumentService } from "@/services/document-translator";
import React, { useCallback, useState, useRef, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Document } from "../types";
import { columns } from "../data-table/columns";
import { DataList } from "@/components/shared/data-list/DataList";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TableBulkAction } from "@/types/table";
import { useMessage } from "@/hooks/message/useMessage";
import { Trash2, Download } from "@/components/ui/icons";
import { UploadIcon } from "@/components/animate-ui/icons/upload";
import { FolderCheckIcon } from "@/components/animate-ui/icons/folder-check";
import { FileTextIcon } from "@/components/ui/file-text";
import { createPageTitleIcon } from "@/components/layout/page-title-icon";

// Page-title icon: animates on mount (page load) + hover. Mirrors the
// AI Configuration title pattern.
const PageTitleFileTextIcon = createPageTitleIcon(FileTextIcon);
import { BulkDeleteDialog, BulkDeleteAction } from "../dialogs/bulk-delete-dialog";
import { ReconciliationDialog } from "../dialogs/reconciliation-dialog";

interface DocumentListProps {
  documents: Document[];
  isLoading: boolean;
  onEdit: (document: Document) => void;
  onDelete: (document: Document) => void;
  onTranslate: (document: Document) => void;
  onDownload: (document: Document, isBulk?: boolean) => void;
  onDownloadAllTranslations: (document: Document) => Promise<void>;
  onBulkDelete: (documents: Document[], action?: BulkDeleteAction) => Promise<void>;
  onUpload: () => void;
  refreshDocuments: () => Promise<void>;
}

export function DocumentList({
  documents,
  isLoading,
  onEdit,
  onDelete,
  onTranslate,
  onDownload,
  onDownloadAllTranslations,
  onBulkDelete,
  onUpload,
  refreshDocuments
}: DocumentListProps) {
  const isMobile = useIsMobile();
  const { showMessage, showProgress } = useMessage();
  // Bulk delete state
  const [selectedForBulkDelete, setSelectedForBulkDelete] = useState<Document[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [totalTranslationsCount, setTotalTranslationsCount] = useState(0);
  const [totalCachedTranslationsCount, setTotalCachedTranslationsCount] = useState(0);
  const dataListRef = useRef<{ clearSelection: () => void } | null>(null);

  // Clean up selection when documents change or component unmounts
  useEffect(() => {
    // When documents change, clear selection to prevent stale state
    if (dataListRef.current?.clearSelection) {
      dataListRef.current.clearSelection();
    }
    
    return () => {
      // Cleanup function when component unmounts
      setSelectedForBulkDelete([]);
      setBulkDeleteDialogOpen(false);
    };
  }, [documents]);

  // Bulk delete handlers
  const handleBulkDelete = useCallback(async (selected: Document[]) => {
    // Count translations for original documents (excluding translations)
    const originalDocuments = selected.filter(doc => doc.type === 'original');
    const translatedDocuments = selected.filter(doc => doc.type === 'translated');
    
    let totalCount = 0;
    let totalCachedCount = 0;
    
    if (originalDocuments.length > 0) {
      // Find and count all translations associated with these documents
      for (const doc of documents) {
        if (doc.type === 'translated' && 
            originalDocuments.some(original => original.id === doc.parentId)) {
          totalCount++;
        }
      }
      
      // Get cached translations count for each original document
      const cachedCountPromises = originalDocuments.map(doc => 
        DocumentService.getCachedTranslationsCount(doc.id)
      );
      
      try {
        const cachedCounts = await Promise.all(cachedCountPromises);
        totalCachedCount = cachedCounts.reduce((sum, count) => sum + count, 0);
      } catch (error) {
        console.error('Error fetching cached translation counts:', error);
        // Default to 0 if there's an error
        totalCachedCount = 0;
      }
    } else if (translatedDocuments.length > 0) {
      // Get cached translations count for each translated document
      const cachedCountPromises = translatedDocuments.map(doc => {
        if (doc.parentId && doc.language) {
          return DocumentService.getCachedTranslationsCount(doc.parentId, doc.language);
        }
        return Promise.resolve(0);
      });
      
      try {
        const cachedCounts = await Promise.all(cachedCountPromises);
        totalCachedCount = cachedCounts.reduce((sum, count) => sum + count, 0);
      } catch (error) {
        console.error('Error fetching cached translation counts:', error);
        // Default to 0 if there's an error
        totalCachedCount = 0;
      }
    }
    
    setTotalTranslationsCount(totalCount);
    setTotalCachedTranslationsCount(totalCachedCount);
    setSelectedForBulkDelete(selected);
    setBulkDeleteDialogOpen(true);
  }, [documents]);

  const handleConfirmBulkDelete = useCallback(async (documentsToDelete: Document[], action?: BulkDeleteAction) => {
    try {
      // First close the dialog to avoid UI freezing during operation
      setBulkDeleteDialogOpen(false);
      
      // Perform the bulk delete operation
      await onBulkDelete(documentsToDelete, action);
      
      // Clear selected items
      setSelectedForBulkDelete([]);
      if (dataListRef.current?.clearSelection) {
        dataListRef.current.clearSelection();
      }
    } catch (error) {
      // Handle any unexpected errors
      console.error('DocumentList: Bulk delete error:', error);
      if (error instanceof Error) {
        showMessage(error.message, 'error');
      } else {
        showMessage('An unknown error occurred', 'error');
      }
    }
  }, [onBulkDelete, showMessage]);

  const handleError = useCallback((error: Error) => {
    showMessage(error.message, "error");
  }, [showMessage]);

  const handleDataListRef = useCallback((dataList: { clearSelection: () => void } | null) => {
    dataListRef.current = dataList;
  }, []);
  
  // State for reconciliation dialog
  const [reconciliationDialogOpen, setReconciliationDialogOpen] = useState(false);

  // Storage reconciliation handler
  const handleStorageCheck = useCallback(() => {
    setReconciliationDialogOpen(true);
  }, []);
  
  // Handle when reconciliation is complete
  const handleReconciliationComplete = useCallback(() => {
    // Refresh documents to show updated file statuses
    refreshDocuments();
  }, [refreshDocuments]);

  const toolbarActions = [
    {
      label: 'Upload Document',
      icon: UploadIcon,
      variant: 'default' as const,
      action: onUpload
    },
    {
      label: 'Run Storage Check',
      icon: FolderCheckIcon,
      variant: 'outline' as const,
      action: handleStorageCheck
    }
  ];

  // Bulk download handler
  const handleBulkDownload = useCallback(async (selected: Document[]) => {
    if (selected.length === 0) return;
    
    // Show warning for large selections
    if (selected.length > 10) {
      const proceed = window.confirm(
        `You are about to download ${selected.length} files. This may take some time. Continue?`
      );
      if (!proceed) return;
    }
    
    // Create progress toast for tracking bulk download
    const progressToast = showProgress(`Starting download of ${selected.length} file(s)...`, 'info');
    
    let successCount = 0;
    let failedCount = 0;
    
    // Download files sequentially with small delay
    for (let i = 0; i < selected.length; i++) {
      const doc = selected[i];
      
      try {
        onDownload(doc, true); // Pass true to indicate bulk download
        successCount++;
        
        // Update progress with aggregate count for multiple files
        if (selected.length > 1) {
          progressToast.update(`Downloaded ${successCount} of ${selected.length} files...`);
        }
        
        // Small delay to prevent browser throttling and reduce visual noise
        if (i < selected.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        failedCount++;
        console.error(`Failed to download ${doc.name}:`, error);
      }
    }
    
    // Dismiss progress toast
    progressToast.dismiss();
    
    // Show final summary
    if (failedCount === 0) {
      showMessage(
        `Successfully downloaded ${successCount} file(s)`,
        'success'
      );
    } else if (successCount === 0) {
      showMessage(
        `Failed to download all ${failedCount} file(s)`,
        'error'
      );
    } else {
      showMessage(
        `Downloaded ${successCount} file(s). ${failedCount} failed.`,
        'warning'
      );
    }
    
    // Clear selection after download
    if (dataListRef.current?.clearSelection) {
      dataListRef.current.clearSelection();
    }
  }, [onDownload, showMessage, showProgress]);

  const bulkActions: TableBulkAction<Document>[] = [
    {
      label: 'Download Selected',
      icon: Download,
      action: handleBulkDownload,
      variant: 'default'
    },
    {
      label: 'Delete Selected',
      icon: Trash2,
      action: handleBulkDelete,
      variant: 'destructive'
    }
  ];

  return (
    <TooltipProvider>
      <DataList
        ref={handleDataListRef}
        title="Document Translator"
        description="Upload, translate, and manage documents in multiple languages."
        items={documents as any}
        columns={columns({ onEdit, onDelete, onTranslate, onDownload, onDownloadAllTranslations: (doc) => onDownloadAllTranslations(doc) }) as any}
        isLoading={isLoading}
        bulkActions={bulkActions as any}
        filterColumn="name"
        filterPlaceholder="Filter documents..."
        enableColumnVisibility={true}
        onError={handleError}
        toolbarActions={toolbarActions}
        toolbarIcon={PageTitleFileTextIcon}
      />

      <BulkDeleteDialog
        documents={selectedForBulkDelete}
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        onConfirm={handleConfirmBulkDelete}
        onError={handleError}
        isLoading={isLoading}
        translationsCount={totalTranslationsCount}
        cachedTranslationsCount={totalCachedTranslationsCount}
      />

      <ReconciliationDialog
        open={reconciliationDialogOpen}
        onOpenChange={setReconciliationDialogOpen}
        onComplete={handleReconciliationComplete}
      />
    </TooltipProvider>
  );
}
