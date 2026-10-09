// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect } from 'react';
import { Document } from '../../components/document-translator/types';
import { DeleteAction } from '../../components/document-translator/dialogs/delete-dialog';
import { BulkDeleteAction } from '../../components/document-translator/dialogs/bulk-delete-dialog';
import { useMessage } from '@/hooks/message/useMessage';
import { useEnabledLanguages } from '@/hooks/language/useEnabledLanguages';
import { DocumentService, TranslationProgress, Translation } from '@/services/document-translator';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';

export function useDocuments() {
  const { showMessage } = useMessage();
  
  // Get all enabled languages for displaying language names
  const { languages: allEnabledLanguages } = useEnabledLanguages();
  
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translationProgress, setTranslationProgress] = useState<Map<string, TranslationProgress>>(new Map());
  const [translations, setTranslations] = useState<Map<number, Translation[]>>(new Map());
  
  // Fetch documents on mount and provide a way to manually refresh
  const fetchDocumentsAndTranslations = async () => {
    setIsLoading(true);
    try {
      // Fetch all documents
      const documents = await DocumentService.getAll();
      
      // Create a map to store translations
      const translationsMap = new Map<number, Translation[]>();
      
      // Use Promise.all to fetch translations for all documents in parallel 
      // This is much more efficient than sequential fetching
      if (documents.length > 0) {
        const translationPromises = documents.map(async (document) => {
          try {
            const translations = await DocumentService.getTranslations(document.id);
            if (translations.length > 0) {
              return { documentId: document.id, translations };
            }
            return null;
          } catch (err) {
            console.error(`Error fetching translations for document ${document.id}:`, err);
            return null;
          }
        });
        
        const results = await Promise.all(translationPromises);
        results.forEach(result => {
          if (result) {
            translationsMap.set(result.documentId, result.translations);
          }
        });
      }
      
      setTranslations(translationsMap);
      
      // Process documents to include translations as separate rows
      const processedDocuments: Document[] = [];
      
      // First add all original documents, passing raw date strings
      processedDocuments.push(...documents.map(doc => ({
        ...doc,
        type: 'original' as const,
        hasIntegrityIssue: doc.hasIntegrityIssue || false,
        wasCleared: doc.wasCleared || false,
        translationsCount: translationsMap.get(doc.id)?.length || 0
      })));
      
      // Then add all translations as separate entries
      for (const [documentId, translationList] of translationsMap.entries()) {
        const sourceDocument = documents.find(d => d.id === documentId);
        if (!sourceDocument) continue;
        
        for (const translation of translationList) {
          processedDocuments.push({
            id: translation.id,
            name: translation.fileName,
            createdAt: translation.createdAt,
            updatedAt: sourceDocument.updatedAt,
            fileSize: translation.fileSize,
            type: 'translated',
            parentId: documentId,
            language: translation.language
          });
        }
      }
      
      setDocuments(processedDocuments);
      setError(null);
    } catch (err) {
      setError('Failed to load documents');
      ErrorHandlerService.handleError(err, 'fetchDocumentsAndTranslations');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch on mount
  useEffect(() => {
    fetchDocumentsAndTranslations();
  }, []);
  
  // Re-process when languages change
  useEffect(() => {
    // No need to re-fetch - just re-process the documents we already have
    if (translations.size > 0) {
      // Process documents to include translations as separate rows
      const processedDocuments: Document[] = [];
      
      // First get all documents from the original documents state
      const originalDocuments = documents.filter(d => d.type !== 'translated');
      processedDocuments.push(...originalDocuments.map(doc => ({
        ...doc,
        translationsCount: translations.get(doc.id)?.length || 0
      })));
      
      // Then add all translations as separate entries with updated language names
      for (const [documentId, translationList] of translations.entries()) {
        const sourceDocument = originalDocuments.find(d => d.id === documentId);
        if (!sourceDocument) continue;
        
        for (const translation of translationList) {
          processedDocuments.push({
            id: translation.id,
            name: translation.fileName,
            createdAt: translation.createdAt,
            updatedAt: sourceDocument.updatedAt,
            fileSize: translation.fileSize,
            type: 'translated',
            parentId: documentId,
            language: translation.language
          });
        }
      }
      
      setDocuments(processedDocuments);
    }
  }, [allEnabledLanguages, translations]); // Removed 'documents' from dependencies to prevent infinite loop
  
  const createDocument = async (name: string) => {
    setIsLoading(true);
    
    try {
      const newDocument = await DocumentService.create(name);
      setDocuments(prev => [...prev, {...newDocument, type: 'original'}]);
      showMessage(`Document "${name}" created successfully`, 'success');
      return newDocument;
    } catch (err: any) {
      ErrorHandlerService.handleError(err, 'createDocument');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  const uploadDocument = async (file: File, name: string) => {
    console.log('--- useDocuments Hook: Starting Upload ---');
    console.log(`Uploading file: ${file.name}, size: ${file.size} bytes, custom name: ${name}`);
    setIsLoading(true);
    
    try {
      const newDocument = await DocumentService.upload(file, name);
      console.log('Upload successful, adding new document to state:', newDocument);
      setDocuments(prev => [...prev, {...newDocument, type: 'original'}]);
      return newDocument;
    } catch (err: any) {
      console.error('--- useDocuments Hook: Upload Failed ---', err);
      ErrorHandlerService.handleError(err, 'uploadDocument');
      return null; // Return null to indicate failure
    } finally {
      console.log('--- useDocuments Hook: Upload Process Finished ---');
      setIsLoading(false);
    }
  };
  
  const downloadDocument = async (id: number, silent?: boolean) => {
    setIsLoading(true);
    
    try {
      await DocumentService.download(id);
      // Find document name for success message
      const document = documents.find(d => d.id === id);
      if (document) {
        if (!document.hasIntegrityIssue && !silent) {
          showMessage(`Document "${document.name}" downloaded successfully`, 'success');
        }
        // If there was an integrity issue, refresh documents to see if it's been updated
        if (document.hasIntegrityIssue) {
          console.log('Document had integrity issues, refreshing list');
          await fetchDocumentsAndTranslations();
        }
      }
    } catch (err: any) {
      if (!silent) {
        ErrorHandlerService.handleError(err, 'downloadDocument');
      }
      // Refresh documents to update status
      await fetchDocumentsAndTranslations();
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  /**
   * Deletes a document (original or translation)
   * @param id - The document ID
   * @param action - The deletion action (document or documentAndTranslations)
   * @param translationData - Optional data for translation deletion to avoid ID conflicts
   * @returns Promise<void>
   */
  const deleteDocument = async (id: number, action?: DeleteAction, translationData?: { parentId: number, language: string }) => {
    setIsLoading(true);
    
    try {
      // IMPORTANT: If explicit translation data is provided, we MUST use that instead of document ID
      // This prevents ID collisions where a translation might have the same ID as an original document
      if (translationData && translationData.parentId && translationData.language) {
        console.log(`Using explicit translation data for deletion: parentId=${translationData.parentId}, language=${translationData.language}`);
        
        // Determine if we should preserve cached translations based on action
        const preserveTranslations = action === 'document';
        
        // Call the translation-specific endpoint
        await DocumentService.deleteTranslation(translationData.parentId, translationData.language, preserveTranslations);
        
        // Capture translation details before mutating state so we can reference the name in the toast
        const translationDetails = translations.get(translationData.parentId)?.find(
          (translation) => translation.language === translationData.language
        );
        
        // Update UI state - find the translation document by ID
        setDocuments(prev => prev.filter(d => !(
          d.type === 'translated' && 
          d.parentId === translationData.parentId && 
          d.language === translationData.language
        )));
        
        // Update translations map
        if (translations.has(translationData.parentId)) {
          const parentTranslations = translations.get(translationData.parentId) || [];
          const updatedTranslations = parentTranslations.filter(
            t => t.language !== translationData.language
          );
          
          const newMap = new Map(translations);
          if (updatedTranslations.length > 0) {
            newMap.set(translationData.parentId, updatedTranslations);
          } else {
            newMap.delete(translationData.parentId);
          }
          
          setTranslations(newMap);
        }
        
        const translationName = translationDetails?.fileName ?? translationData.language;
        showMessage(`Translation "${translationName}" deleted successfully`, 'success');
        setIsLoading(false);
        return;
      }
      
      // If we get here, we didn't use the translationData shortcut
      // Find document to determine delete type
      const document = documents.find(d => d.id === id);
      
      if (!document) {
        throw new Error(`Document with ID ${id} not found`);
      }
      
      // Determine if we should preserve cached translations
      // Always set preserveTranslations=false for original documents
      const preserveTranslations = document.type === 'original' ? false : action === 'document';
      
      // Determine if it's a regular document or translation
      if (document.type === 'translated' && document.parentId && document.language) {
        // It's a translation - delete using the translation endpoint
        // IMPORTANT: Use parentId/language to identify the translation rather than its own ID
        // This prevents the ID collision bug where translation.id = some other document.id
        await DocumentService.deleteTranslation(document.parentId, document.language, preserveTranslations);
        
        // Update UI state by removing this translation
        setDocuments(prev => prev.filter(d => d.id !== id));
        
        // Update translations map
        if (translations.has(document.parentId)) {
          const parentTranslations = translations.get(document.parentId) || [];
          const updatedTranslations = parentTranslations.filter(
            t => t.language !== document.language
          );
          
          const newMap = new Map(translations);
          if (updatedTranslations.length > 0) {
            newMap.set(document.parentId, updatedTranslations);
          } else {
            newMap.delete(document.parentId);
          }
          
          setTranslations(newMap);
        }
        
        showMessage(`Translation "${document.name}" deleted successfully`, 'success');
      } else {
        // It's a regular document - delete using the document endpoint
        await DocumentService.deleteDocument(id, preserveTranslations);
        
        // Update UI state by removing this document and all its translations
        setDocuments(prev => prev.filter(d => d.id !== id && d.parentId !== id));
        
        // Clean up translations map
        if (translations.has(id)) {
          const newMap = new Map(translations);
          newMap.delete(id);
          setTranslations(newMap);
        }
        
        showMessage(`Document "${document.name}" deleted successfully`, 'success');
      }
    } catch (err: any) {
      ErrorHandlerService.handleError(err, 'deleteDocument');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  const editDocument = async (id: number, name: string) => {
    setIsLoading(true);
    
    try {
      const updatedDocument = await DocumentService.update(id, name);
      
      // Find the existing document to preserve fields not returned by the API
      const existingDoc = documents.find(d => d.id === id);
      
      setDocuments(prev => prev.map(d => {
        if (d.id === id) {
          return {
            ...d, // Preserve all existing properties
            ...updatedDocument, // Apply updates
            fileSize: updatedDocument.fileSize || existingDoc?.fileSize, // Ensure fileSize is preserved
            type: 'original'
          };
        }
        return d;
      }));
      
      showMessage(`Document updated successfully`, 'success');
    } catch (err: any) {
      ErrorHandlerService.handleError(err, 'editDocument');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  /**
   * Bulk deletes documents and translations
   * @param selectedDocuments - The documents to delete
   * @param action - The deletion action (document or documentAndTranslations)
   * @returns Promise with a result summary
   */
  const bulkDeleteDocuments = async (selectedDocuments: Document[], action?: BulkDeleteAction) => {
    if (!selectedDocuments || selectedDocuments.length === 0) {
      return { success: 0, failed: 0, errors: [] };
    }
    
    setIsLoading(true);
    
    // Check if any original documents are included in the selection
    const hasOriginalDocuments = selectedDocuments.some(doc => doc.type === 'original');
    
    // Determine if we should preserve cached translations
    // Always set preserveTranslations=false if any original documents are being deleted
    const preserveTranslations = hasOriginalDocuments ? false : action === 'document';
    
    try {
      // Separate documents and translations for efficient deletion
      const originalDocuments: Document[] = [];
      const translationsToDelete: {id: number, parentId: number, language: string, name: string}[] = [];
      
      selectedDocuments.forEach(doc => {
        if (doc.type === 'translated' && doc.parentId && doc.language) {
          translationsToDelete.push({
            id: doc.id,
            parentId: doc.parentId,
            language: doc.language,
            name: doc.name
          });
        } else {
          originalDocuments.push(doc);
        }
      });
      
      let success = 0;
      let failed = 0;
      const errors: string[] = [];
      
      // Delete translations first
      if (translationsToDelete.length > 0) {
        const translationPromises = translationsToDelete.map(async (translation) => {
          try {
            // IMPORTANT: Use parentId/language to identify the translation rather than its own ID
            // This prevents the ID collision bug where translation.id = some other document.id
            await DocumentService.deleteTranslation(translation.parentId, translation.language, preserveTranslations);
            success++;
            return { success: true, id: translation.id };
          } catch (err) {
            failed++;
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            errors.push(`Failed to delete translation "${translation.name}": ${errorMessage}`);
            return { success: false, id: translation.id, error: errorMessage };
          }
        });
        
        // Wait for all translation deletions to complete
        const translationResults = await Promise.all(translationPromises);
        
        // Update UI state - remove translations that were successfully deleted
        const deletedTranslationIds = translationResults
          .filter(result => result.success)
          .map(result => result.id);
        
        if (deletedTranslationIds.length > 0) {
          // Update documents state
          setDocuments(prev => prev.filter(d => !deletedTranslationIds.includes(d.id)));
          
          // Update translations map
          const translationsMap = new Map(translations);
          translationsToDelete.forEach(translation => {
            if (deletedTranslationIds.includes(translation.id) && translationsMap.has(translation.parentId)) {
              const parentTranslations = translationsMap.get(translation.parentId) || [];
              const updatedTranslations = parentTranslations.filter(
                t => t.language !== translation.language
              );
              
              if (updatedTranslations.length > 0) {
                translationsMap.set(translation.parentId, updatedTranslations);
              } else {
                translationsMap.delete(translation.parentId);
              }
            }
          });
          
          setTranslations(translationsMap);
        }
      }
      
      // Delete original documents
      if (originalDocuments.length > 0) {
        // Only use bulk delete if we have multiple documents
        if (originalDocuments.length > 1) {
          const documentIds = originalDocuments.map(doc => doc.id);
          try {
            const result = await DocumentService.bulkDeleteDocuments(documentIds, preserveTranslations);
            success += result.success;
            failed += result.failed;
            
            // Add any backend errors to our error list
            if (result.errors && result.errors.length > 0) {
              errors.push(...result.errors);
            }
            
            // Remove successfully deleted documents and their translations from UI
            const successIds = documentIds.slice(0, result.success); // Assuming the first N were successful
            setDocuments(prev => prev.filter(d => {
              // Keep if not in deleted documents AND not a translation of deleted documents
              return !successIds.includes(d.id) && !successIds.includes(d.parentId as number);
            }));
            
            // Clean up translations map
            const newTranslationsMap = new Map(translations);
            successIds.forEach(id => {
              newTranslationsMap.delete(id);
            });
            setTranslations(newTranslationsMap);
            
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            failed += originalDocuments.length;
            errors.push(`Failed to delete documents: ${errorMessage}`);
          }
        } else {
          // Single document deletion
          try {
            const document = originalDocuments[0];
            await DocumentService.deleteDocument(document.id, preserveTranslations);
            success++;
            
            // Update UI
            setDocuments(prev => prev.filter(d => d.id !== document.id && d.parentId !== document.id));
            
            // Clean up translations map
            if (translations.has(document.id)) {
              const newMap = new Map(translations);
              newMap.delete(document.id);
              setTranslations(newMap);
            }
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            failed++;
            errors.push(`Failed to delete document "${originalDocuments[0].name}": ${errorMessage}`);
          }
        }
      }
      
      return { success, failed, errors };
    } catch (err: any) {
      ErrorHandlerService.handleError(err, 'bulkDeleteDocuments');
      
      return {
        success: 0,
        failed: selectedDocuments.length,
        errors: [err.message || 'Unknown error']
      };
    } finally {
      setIsLoading(false);
    }
  };
  
  // Translate a document to specified languages
  const translateDocument = async (id: number, languages: string[], options?: { includeOriginalText?: boolean; segmentOptions?: { skipSegments: string[]; includeEnglishSegments: string[] }; overwrite?: boolean }) => {
    setIsLoading(true);
    
    try {
      // Start the translation process directly without requiring document lookup
      console.log(`Starting translation for document ID: ${id}`, options);
      const result = await DocumentService.translateDocument(id, languages, options);
      
      // Set up progress tracking for each language
      languages.forEach(language => {
        const key = `${id}-${language}`;
        setTranslationProgress(prev => {
          const newMap = new Map(prev);
          newMap.set(key, {
            documentId: id,
            language: language,
            status: 'pending',
            progress: 0,
            message: 'Translation queued'
          });
          return newMap;
        });
      });
      
      // Refresh documents to ensure we have latest state
      fetchDocumentsAndTranslations();
      
      showMessage(`Translation started for ${languages.length} language(s)`, 'success');
      return result;
    } catch (err: any) {
      ErrorHandlerService.handleError(err, 'translateDocument');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Get translation progress
  const getTranslationProgress = async (id: number, language: string) => {
    try {
      const key = `${id}-${language}`;
      const progress = await DocumentService.getTranslationProgress(id, language);
      
      setTranslationProgress(prev => {
        const newMap = new Map(prev);
        newMap.set(key, progress);
        return newMap;
      });
      
      return progress;
    } catch (err: any) {
      console.error('Error getting translation progress:', err);
      // Create a default progress object instead of returning null
      const defaultProgress = {
        documentId: id,
        language: language,
        status: 'pending' as const,
        progress: 0,
        message: 'Waiting for translation to start'
      };
      
      // Update the map with the default progress
      setTranslationProgress(prev => new Map(prev.set(`${id}-${language}`, defaultProgress)));
      
      return defaultProgress;
    }
  };

  // Get all translations for a document
  const getTranslations = async (id: number) => {
    try {
      const translationsList = await DocumentService.getTranslations(id);
      
      setTranslations(prev => {
        const newMap = new Map(prev);
        newMap.set(id, translationsList);
        return newMap;
      });
      
      return translationsList;
    } catch (err: any) {
      ErrorHandlerService.handleError(err, 'getTranslations');
      return [];
    }
  };

  // Download a translated document
  const downloadTranslation = async (id: number, language: string, silent?: boolean) => {
    setIsLoading(true);
    
    try {
      await DocumentService.downloadTranslation(id, language);
      
      // Find the translation document for success message
      const translationDoc = documents.find(d => 
        d.type === 'translated' && 
        d.parentId === id && 
        d.language === language
      );
      
      if (translationDoc && !translationDoc.hasIntegrityIssue && !silent) {
        showMessage(`Translation "${translationDoc.name}" downloaded successfully`, 'success');
      }
      
      // If we tried to download a document with integrity issues, refresh the list
      const hasIssues = documents.some(d => 
        d.type === 'translated' && 
        d.parentId === id && 
        d.language === language && 
        d.hasIntegrityIssue
      );
      
      if (hasIssues) {
        console.log('Translation had integrity issues, refreshing list');
        await fetchDocumentsAndTranslations();
      }
    } catch (err: any) {
      if (!silent) {
        ErrorHandlerService.handleError(err, 'downloadTranslation');
      }
      // Refresh documents to update status
      await fetchDocumentsAndTranslations();
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  return {
    documents,
    isLoading,
    error,
    translationProgress,
    translations,
    createDocument,
    uploadDocument,
    downloadDocument,
    deleteDocument,
    editDocument,
    bulkDeleteDocuments,
    translateDocument,
    getTranslationProgress,
    getTranslations,
    downloadTranslation,
    refreshDocuments: fetchDocumentsAndTranslations
  };
}
