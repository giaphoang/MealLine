// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { Language } from '@/types/language';
import { LanguageService } from '@/services/language';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { useMessage } from '@/hooks/message/useMessage';

interface LanguageContextType {
  languages: Language[];
  isLoading: boolean;
  isSaving: boolean;
  lastUpdate: Date | null;
  refreshLanguages: () => Promise<void>;
  updateLanguages: (activeNames: string[], preserveTranslations?: boolean) => Promise<void>;
  getTranslationCount: (languageNames: string[]) => Promise<number>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export interface LanguageProviderProps {
  children: React.ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { showMessage } = useMessage();
  const languageService = new LanguageService();

  const refreshLanguages = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await languageService.getLanguages();
      setLanguages(data);
      setLastUpdate(new Date());
    } catch (err) {
      ErrorHandlerService.handleError(err, 'refreshLanguages');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateLanguages = useCallback(async (activeNames: string[], preserveTranslations: boolean = false) => {
    setIsSaving(true);
    try {
      const updates = languages.map(lang => ({
        name: lang.name,
        isEnabled: activeNames.includes(lang.name),
        preserveTranslations: activeNames.includes(lang.name) ? undefined : preserveTranslations
      }));

      const result = await languageService.bulkUpdateLanguages(updates);
      
      // Refresh the language list to get updated state
      await refreshLanguages();
      
      showMessage(result.message, 'success');
    } catch (err) {
      ErrorHandlerService.handleError(err, 'updateLanguages');
      // Don't re-throw error - centralized handler displays message
    } finally {
      setIsSaving(false);
    }
  }, [languages, refreshLanguages, showMessage]);

  // Initial load
  useEffect(() => {
    refreshLanguages();
  }, [refreshLanguages]);

  const getTranslationCount = useCallback(async (languageNames: string[]): Promise<number> => {
    try {
      return await languageService.getTranslationCount(languageNames);
    } catch (err) {
      ErrorHandlerService.handleError(err, 'getTranslationCount');
      return 0;
    }
  }, []);

  const value = {
    languages,
    isLoading,
    isSaving,
    lastUpdate,
    refreshLanguages,
    updateLanguages,
    getTranslationCount,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguageContext() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguageContext must be used within a LanguageProvider');
  }
  return context;
}