// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect, useCallback } from 'react'
import { Translation, BulkOperationResult, TranslationType } from '@/types/translation'
import { TranslationService } from '@/services/translation'
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService'

const translationService = new TranslationService()

interface CreateTranslationData {
  originalText: string;
  targetLanguages: string[];
}

export function useTranslationData() {
  const [translations, setTranslations] = useState<Translation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const fetchTranslations = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await translationService.getTranslations();
      setTranslations(data || []);
    } catch (err) {
      ErrorHandlerService.handleError(err, 'fetchTranslations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTranslations();
  }, [fetchTranslations]);

  const createTranslation = async (data: CreateTranslationData) => {
    setIsSaving(true);
    try {
      const newTranslations = await translationService.createTranslation(data);
      setTranslations(prev => {
        const updated = [...newTranslations, ...prev];
        return updated;
      });
      return newTranslations;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'createTranslation');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const updateTranslation = async (data: { id: number; translatedText?: string }) => {
    setIsSaving(true);
    try {
      const updatedTranslation = await translationService.updateTranslation(data);
      setTranslations(prev => 
        prev.map(t => t.id === data.id ? updatedTranslation : t)
      );
      return updatedTranslation;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'updateTranslation');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTranslation = async (id: number) => {
    setIsSaving(true);
    try {
      await translationService.deleteTranslation(id);
      setTranslations(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      ErrorHandlerService.handleError(err, 'deleteTranslation');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const bulkDeleteTranslations = async (translationsToDelete: Translation[]): Promise<BulkOperationResult> => {
    setIsSaving(true);
    try {
      const ids = translationsToDelete.map(t => t.id);
      const result = await translationService.bulkDeleteTranslations(ids);
      
      // If successful, remove the deleted translations from state
      if (result.success > 0) {
        setTranslations(prev => 
          prev.filter(t => !ids.includes(t.id))
        );
      }
      
      return result;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'bulkDeleteTranslations');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const bulkRetryTranslations = async (translationsToRetry: Translation[]): Promise<BulkOperationResult> => {
    setIsSaving(true);
    try {
      const ids = translationsToRetry.map(t => t.id);
      const result = await translationService.bulkRetryTranslations(ids);
      
      // If any were successful, refresh translations to get updated status
      if (result.success > 0) {
        await fetchTranslations();
      }
      
      return result;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'bulkRetryTranslations');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const bulkIncludeOriginal = async (translationsToUpdate: Translation[]): Promise<BulkOperationResult> => {
    setIsSaving(true);
    try {
      const ids = translationsToUpdate.map(t => t.id);
      const result = await translationService.bulkIncludeOriginal(ids);
      
      // If any were successful, refresh translations to get updated status
      if (result.success > 0) {
        await fetchTranslations();
      }
      
      return result;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'bulkIncludeOriginal');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const bulkRemoveOriginal = async (translationsToUpdate: Translation[]): Promise<BulkOperationResult> => {
    setIsSaving(true);
    try {
      const ids = translationsToUpdate.map(t => t.id);
      const result = await translationService.bulkRemoveOriginal(ids);
      
      // If any were successful, refresh translations to get updated status
      if (result.success > 0) {
        await fetchTranslations();
      }
      
      return result;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'bulkRemoveOriginal');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const retryTranslation = async (id: number) => {
    setIsSaving(true);
    try {
      const updatedTranslation = await translationService.retryTranslation(id);
      setTranslations(prev => 
        prev.map(t => t.id === id ? updatedTranslation : t)
      );
      return updatedTranslation;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'retryTranslation');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const findMissingTranslations = async (process: boolean = false, types?: TranslationType[]): Promise<{ count: number; message: string; details?: any }> => {
    setIsSaving(true);
    try {
      const result = await translationService.findMissingTranslations(process, types);
      await fetchTranslations(); // Refresh to get new translations
      return result;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'findMissingTranslations');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  /*
   * DEPRECATED (2025-09-01): Skip/Enable Translation methods removed from project.
   * The following methods are intentionally commented out to prevent usage.
   */
  // const skipTranslation = async (id: number) => { ... };
  // const bulkSkipTranslation = async (translationsToSkip: Translation[]): Promise<BulkOperationResult> => { ... };
  // const enableTranslation = async (id: number) => { ... };
  // const bulkEnableTranslation = async (translationsToEnable: Translation[]): Promise<BulkOperationResult> => { ... };

  return {
    translations,
    isLoading,
    isSaving,
    refreshTranslations: fetchTranslations,
    createTranslation,
    updateTranslation,
    deleteTranslation,
    bulkDeleteTranslations,
    bulkRetryTranslations,
    bulkIncludeOriginal,
    bulkRemoveOriginal,
    retryTranslation,
    findMissingTranslations
  };
}
