// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect, useCallback } from 'react';
import { Language } from '@/types/language';
import { LanguageService } from '@/services/language';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';

const languageService = new LanguageService();

export function useEnabledLanguages() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEnabledLanguages = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await languageService.getEnabledLanguages();
      setLanguages(data || []);
    } catch (err) {
      ErrorHandlerService.handleError(err, 'fetchEnabledLanguages');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnabledLanguages();
  }, [fetchEnabledLanguages]);

  return {
    languages,
    isLoading,
    refresh: fetchEnabledLanguages
  };
}