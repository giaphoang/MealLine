// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useCallback, useState, useEffect } from 'react';
import { DocumentService } from '@/services/document-translator';
import { useDocuments } from '@/hooks/document-translator/useDocuments';
import { useDialogState } from '@/hooks/dialog/useDialogState';
import { Document } from './types';
import { useMessage } from '@/hooks/message/useMessage';
import { useEnabledLanguages } from '@/hooks/language/useEnabledLanguages';
import { DocumentList } from './DocumentList';
import { EditDialog } from './dialogs/edit-dialog';
import { TranslateDialog } from './dialogs/translate-dialog';
import { DeleteDialog, DeleteAction } from './dialogs/delete-dialog';
import { BulkDeleteAction } from './dialogs/bulk-delete-dialog';
import { ErrorBoundary } from 'react-error-boundary';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileUpload } from './file-upload';
import { Translation, TranslationProgress } from '@/services/document-translator';

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

export function DocumentTranslator() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Refresh the page when error boundary is reset
        window.location.reload()
      }}
    >
      <DocumentTranslatorContent />
    </ErrorBoundary>
  )
}

function DocumentTranslatorContent() {
  // Dialog state for upload
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  
  // Hooks for data management and UI state
  const {
    documents,
    isLoading,
    error,
    refreshDocuments,
    uploadDocument,
    downloadDocument,
    downloadTranslation,
    deleteDocument,
    editDocument,
    bulkDeleteDocuments,
    translateDocument,
    getTranslationProgress,
    getTranslations,
    translationProgress,
    translations
  } = useDocuments();

  const { showMessage } = useMessage();
  const { languages: allEnabledLanguages, isLoading: isLoadingLanguages, refresh: refreshLanguages } = useEnabledLanguages();

  // Dialog state
  const editDialog = useDialogState<Document>();
  const translateDialog = useDialogState<Document>();
  
  // Dialog state for delete
  const deleteDialog = useDialogState<Document>();

  // Translation dialog state (controlled)
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [translationStep, setTranslationStep] = useState<'languages' | 'conflict' | 'formatting' | 'download'>('languages');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationCompleted, setTranslationCompleted] = useState(false);
  const [currentTranslations, setCurrentTranslations] = useState<Translation[]>([]);
  const [includeOriginalText, setIncludeOriginalText] = useState(false);
  const [shouldPoll, setShouldPoll] = useState(false);

  // Available languages (excluding English)
  const availableLanguages = allEnabledLanguages.filter(lang => lang.name !== 'English');

  // Translation progress polling effect
  useEffect(() => {
    let progressInterval: NodeJS.Timer | null = null;
    const displayedWarnings = new Set<string>(); // Track displayed warnings to avoid duplicates
    
    if (shouldPoll && translateDialog.data?.id && selectedLanguages.length > 0) {
      const documentId = translateDialog.data.id;
      let pollCount = 0;
      const maxPolls = 300; // 15 minutes at 3-second intervals
      
      progressInterval = setInterval(async () => {
        pollCount++;
        let allCompleted = true;
        let anyFailed = false;
        const failedLanguages: string[] = [];
        const partialFailures: { language: string; failedCount: number }[] = [];
        
        // Check progress for each language
        for (const language of selectedLanguages) {
          try {
            const progress = await getTranslationProgress(documentId, language);
            
            // Display any parameter override warnings once
            if (progress.warnings && progress.warnings.length > 0) {
              for (const warning of progress.warnings) {
                if (!displayedWarnings.has(warning)) {
                  displayedWarnings.add(warning);
                  // Show ASK-compliant warning message
                  showMessage(
                    `${warning} To use custom parameter values, select a different AI model in Tools → AI Configuration.`,
                    'warning'
                  );
                }
              }
            }
            
            if (progress.status === 'failed') {
              anyFailed = true;
              failedLanguages.push(language);
              
              // Show specific error message for complete failures
              if (progress.message && progress.message !== 'Translation failed') {
                showMessage(
                  `Translation to ${language} failed: ${progress.message}`, 
                  'error'
                );
              }
            } else if (progress.status === 'completed') {
              // Check for partial failures (completed with failed segments)
              if (progress.stats?.failed && progress.stats.failed > 0) {
                partialFailures.push({ 
                  language, 
                  failedCount: progress.stats.failed 
                });
              }
            } else {
              allCompleted = false;
            }
          } catch (error) {
            console.error(`Error checking progress for ${language}:`, error);
            allCompleted = false;
          }
        }
        
        // Stop polling if done or timed out
        if (allCompleted || anyFailed || pollCount >= maxPolls) {
          if (progressInterval) {
            clearInterval(progressInterval as any);
          }
          setShouldPoll(false);
          setIsTranslating(false);
          setTranslationCompleted(true);
          
          // Fetch final translations
          try {
            const translatedDocs = await getTranslations(documentId);
            setCurrentTranslations(translatedDocs);
          } catch (error) {
            console.error('Error fetching final translations:', error);
          }
          
          // Show summary message for failures
          if (failedLanguages.length > 0) {
            const failedLangsStr = failedLanguages.join(', ');
            showMessage(
              `Translation failed for: ${failedLangsStr}. Please check your AI configuration and try again.`,
              'error'
            );
          } else if (partialFailures.length > 0) {
            // Show warning for partial failures
            const totalFailedSegments = partialFailures.reduce((sum, pf) => sum + pf.failedCount, 0);
            showMessage(
              `Translation completed with ${totalFailedSegments} segments using fallback text. Some content may not be translated.`,
              'warning'
            );
          } else if (allCompleted && !anyFailed) {
            // Success message only if no failures
            showMessage(
              `Successfully translated to ${selectedLanguages.length} language${selectedLanguages.length > 1 ? 's' : ''}`,
              'success'
            );
          }
          
          if (pollCount >= maxPolls) {
            console.warn('Translation progress polling timed out after 15 minutes');
            showMessage(
              'Translation is taking longer than expected. Please check back later.',
              'warning'
            );
          }
        }
      }, 3000);
    }
    
    // Cleanup
    return () => {
      if (progressInterval) {
        clearInterval(progressInterval as any);
      }
    };
  }, [shouldPoll, translateDialog.data?.id, selectedLanguages, getTranslationProgress, getTranslations, showMessage]);

  // Edit handlers - using useCallback to ensure function identity is preserved
  const handleEdit = useCallback((document: Document) => {
    console.log("Edit triggered for document:", document);
    editDialog.open(document);
  }, [editDialog]);

  const handleSaveEdit = useCallback(async (id: number, name: string) => {
    try {
      await editDocument(id, name);
      editDialog.close();
      showMessage("Document updated successfully", "success");
    } catch (err) {
      if (err instanceof Error) {
        showMessage(err.message, "error");
      }
    }
  }, [editDocument, editDialog, showMessage]);

  // Delete handler
  const handleDelete = useCallback(async (document: Document) => {
    // Only count translations for original documents
    let translationsCount = 0;
    let cachedTranslationsCount = 0;
    
    if (document.type !== 'translated' && document.id) {
      // For original documents - get translated documents count
      const documentTranslations = translations.get(document.id);
      translationsCount = documentTranslations ? documentTranslations.length : 0;
      
      // Get cached translations count directly from the API
      try {
        cachedTranslationsCount = await DocumentService.getCachedTranslationsCount(document.id);
      } catch (err) {
        console.error('Error getting cached translations count:', err);
      }
    } else if (document.type === 'translated' && document.parentId) {
      // For translated documents - get cached translations for this specific language
      try {
        cachedTranslationsCount = await DocumentService.getCachedTranslationsCount(
          document.parentId, 
          document.language
        );
      } catch (err) {
        console.error('Error getting cached translations count:', err);
      }
    }
      
    // Store the counts in the dialog data
    deleteDialog.open({
      ...document, 
      translationsCount,
      cachedTranslationsCount
    });
  }, [deleteDialog, translations]);

  const handleConfirmDelete = useCallback(async (document: Document, action?: DeleteAction) => {
    try {      
      // Check document type and ensure we're handling translations correctly
      if (document.type === 'translated' && document.parentId && document.language) {
        // IMPORTANT: For translated documents, always use explicit parentId and language
        // This prevents ID collisions where a translation might have the same ID as an original document
        console.log(`Deleting translation with parentId=${document.parentId}, language=${document.language}`);
        
        // Pass explicit translation data to avoid any possibility of ID collision
        const translationData = {
          parentId: document.parentId,
          language: document.language
        };
        
        await deleteDocument(document.id, action, translationData);
      } else {
        // For regular documents, pass the action to determine translation preservation
        console.log(`Delete action: ${action}`);
        await deleteDocument(document.id, action);
      }
      
      await refreshDocuments(); // Force refresh to get updated list
      deleteDialog.close();
    } catch (err) {
      if (err instanceof Error) {
        showMessage(err.message, "error");
      }
    }
  }, [deleteDocument, refreshDocuments, showMessage]);

  // Handle bulk delete operations
  const handleBulkDelete = useCallback(async (documentsToDelete: Document[], action?: BulkDeleteAction) => {
    try {
      // Pass the action to determine whether to preserve translations
      console.log(`Bulk delete action: ${action}`);
      await bulkDeleteDocuments(documentsToDelete, action);
      
      // Show success message
      const numDeleted = documentsToDelete.length;
      showMessage(
        `Successfully deleted ${numDeleted} document${numDeleted > 1 ? 's' : ''}.`,
        'success'
      );
    } catch (err) {
      console.error("Bulk delete failed:", err);
      if (err instanceof Error) {
        showMessage(err.message, "error");
      }
      throw err;
    }
  }, [bulkDeleteDocuments, showMessage]);

  // Upload handler
  const handleUpload = useCallback(async (file: File, name: string) => {
    const newDocument = await uploadDocument(file, name);
    
    if (newDocument) {
      showMessage("Document uploaded successfully", "success");
      
      // Open translate dialog with the new document directly
      await handleTranslate({
        ...newDocument,
        type: 'original'
      });
      
      // Refresh documents after starting the dialog
      refreshDocuments();
      
      // Return the document to signal success to the upload dialog
      return newDocument;
    }
    
    // Return null to signal failure
    return null;
  }, [uploadDocument, showMessage, translateDialog, refreshDocuments]);

  // Translation dialog handlers
  const resetTranslationState = useCallback(() => {
    setSelectedLanguages([]);
    setTranslationStep('languages');
    setIsTranslating(false);
    setTranslationCompleted(false);
    setCurrentTranslations([]);
    setIncludeOriginalText(false);
    setShouldPoll(false);
  }, []);

  const handleTranslate = useCallback(async (document: Document) => {
    // Reset state and fetch fresh data when opening dialog
    resetTranslationState();
    
    try {
      // Refresh documents and languages
      await Promise.all([
        refreshDocuments(),
        refreshLanguages()
      ]);
      
      // Fetch existing translations
      if (document.id) {
        const translations = await getTranslations(document.id);
        setCurrentTranslations(translations);
        
        // Pre-select existing languages if any
        if (translations.length > 0) {
          const existingLanguages = translations.map(t => t.language);
          setSelectedLanguages(existingLanguages);
        }
      }
      
      translateDialog.open(document);
    } catch (error) {
      console.error('Error preparing translation dialog:', error);
      showMessage('Failed to load translation data', 'error');
    }
  }, [translateDialog, resetTranslationState, refreshDocuments, refreshLanguages, getTranslations, showMessage]);

  const handleTranslateDocument = useCallback(async (languages: string[], options: { includeOriginalText: boolean; segmentOptions?: { skipSegments: string[]; includeEnglishSegments: string[]; bypassCache?: string[] }; overwrite?: boolean }) => {
    const documentId = translateDialog.data?.id;
    if (!documentId) return;
    
    try {
      setIsTranslating(true);
      await translateDocument(documentId, languages, options);
      setShouldPoll(true);
    } catch (error) {
      console.error('Error starting translation:', error);
      setIsTranslating(false);
      setTranslationCompleted(true);
      showMessage(error instanceof Error ? error.message : 'Translation failed', 'error');
    }
  }, [translateDialog.data, translateDocument, showMessage]);

  // `setOpen(false)`, not `close()`. The dialog is rendered behind a
  // `{translateDialog.data && ...}` guard, and `close()` clears `data` in the
  // same commit as `isOpen`, unmounting the subtree before Radix can reach
  // `data-state="closed"` — the exit animation is skipped and the modal
  // vanishes. Leaving `data` set lets it animate out; it is re-keyed by
  // document id on the next open, so a stale value is inert.
  const handleTranslationCancel = useCallback(() => {
    resetTranslationState();
    translateDialog.setOpen(false);
  }, [resetTranslationState, translateDialog]);

  const handleTranslationDone = useCallback(() => {
    if (translationCompleted) {
      refreshDocuments();
    }
    resetTranslationState();
    translateDialog.setOpen(false);
  }, [translationCompleted, refreshDocuments, resetTranslationState, translateDialog]);

  // Download handler
  const handleDownload = useCallback((document: Document, isBulk?: boolean) => {
    console.log("Download triggered for document:", document);
    try {
      // Show a warning if the document has integrity issues
      if (document.hasIntegrityIssue && !isBulk) {
        showMessage(
          "This file may be missing or corrupt. Attempting download anyway...", 
          "warning"
        );
      }
      
      if (document.type === 'translated' && document.parentId && document.language) {
        // If it's a translation, download using the translation API endpoint
        downloadTranslation(document.parentId, document.language, isBulk);
      } else {
        // Otherwise download the document directly
        downloadDocument(document.id, isBulk);
      }
      
      if (!document.hasIntegrityIssue && !isBulk) {
        showMessage("Download started", "success");
      }
    } catch (err) {
      if (err instanceof Error) {
        showMessage(err.message, "error");
      }
    }
  }, [downloadDocument, downloadTranslation, showMessage]);

  // Download all translations handler
  const handleDownloadAllTranslations = useCallback(async (document: Document) => {
    try {
      const translations = await getTranslations(document.id);
      
      if (translations.length === 0) {
        showMessage("No translations available for this document", "info");
        return;
      }
      
      showMessage(`Downloading ${translations.length} translation${translations.length > 1 ? 's' : ''}...`, "info");
      
      let successCount = 0;
      let failureCount = 0;
      
      for (const translation of translations) {
        try {
          await downloadTranslation(document.id, translation.language, true); // true for bulk mode
          successCount++;
        } catch (error) {
          console.error(`Failed to download ${translation.language} translation:`, error);
          failureCount++;
        }
      }
      
      if (failureCount === 0) {
        showMessage(`Successfully downloaded ${successCount} translation${successCount > 1 ? 's' : ''}`, "success");
      } else {
        showMessage(`Downloaded ${successCount} translation${successCount > 1 ? 's' : ''}, ${failureCount} failed`, "warning");
      }
    } catch (error) {
      showMessage("Failed to fetch translations", "error");
    }
  }, [getTranslations, downloadTranslation, showMessage]);

  // Handle upload dialog open
  const handleUploadDialogOpen = useCallback(() => {
    setUploadDialogOpen(true);
  }, []);

  return (
    <div className="space-y-8">
      <DocumentList
        documents={documents}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onTranslate={handleTranslate}
        onDownload={handleDownload}
        onDownloadAllTranslations={(doc) => handleDownloadAllTranslations(doc)}
        onBulkDelete={handleBulkDelete}
        onUpload={handleUploadDialogOpen}
        refreshDocuments={refreshDocuments}
      />

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <FileUpload 
              onUpload={async (file, name) => {
                const newDocument = await handleUpload(file, name);
                // Only close dialog on successful upload (following established pattern)
                if (newDocument) {
                  setUploadDialogOpen(false);
                } else {
                  // Throw error to signal failure to FileUpload component
                  // This allows FileUpload to maintain its state for retry
                  throw new Error('Upload failed');
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <EditDialog
        document={editDialog.data}
        open={editDialog.isOpen}
        onOpenChange={editDialog.setOpen}
        onSave={handleSaveEdit}
      />

      {/* Translate Dialog */}
      {translateDialog.data && (
        <TranslateDialog
          key={translateDialog.data.id} // Force re-mount on document change
          documentId={translateDialog.data.id}
          documentName={translateDialog.data.name}
          open={translateDialog.isOpen}
          onOpenChange={translateDialog.setOpen}
          // Controlled state props
          selectedLanguages={selectedLanguages}
          onSelectedLanguagesChange={setSelectedLanguages}
          step={translationStep}
          onStepChange={setTranslationStep}
          isTranslating={isTranslating}
          translationCompleted={translationCompleted}
          currentTranslations={currentTranslations}
          includeOriginalText={includeOriginalText}
          onIncludeOriginalTextChange={setIncludeOriginalText}
          availableLanguages={availableLanguages}
          isLoadingLanguages={isLoadingLanguages}
          translationProgress={translationProgress}
          // Action handlers
          onTranslate={handleTranslateDocument}
          onDownloadDocument={downloadDocument}
          onDownloadTranslation={downloadTranslation}
          onDownloadAll={() => handleDownloadAllTranslations(translateDialog.data as Document)}
          onCancel={handleTranslationCancel}
          onDone={handleTranslationDone}
        />
      )}

      {/* Delete Dialog */}
      <DeleteDialog
        document={deleteDialog.data}
        open={deleteDialog.isOpen}
        onOpenChange={deleteDialog.setOpen}
        onConfirm={handleConfirmDelete}
        isLoading={isLoading}
        translationsCount={deleteDialog.data?.translationsCount}
        cachedTranslationsCount={deleteDialog.data?.cachedTranslationsCount}
      />
    </div>
  );
}
