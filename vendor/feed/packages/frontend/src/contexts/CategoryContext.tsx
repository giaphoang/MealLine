// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { createContext, useContext, useEffect } from 'react';
import { Category, BulkOperationResult, LimitType } from '@/types/category';
import { useCategoryData } from '@/hooks/category/useCategoryData';

interface CategoryContextType {
  categories: Category[];
  isLoading: boolean;
  isSaving: boolean;
  lastUpdate: Date | null;
  refreshCategories: () => Promise<void>;
  createCategory: (data: { name: string; limit: number; limitType: LimitType; icon?: string }) => Promise<Category>;
  updateCategory: (
    data: { id: number; name: string; limit: number; limitType: LimitType; icon?: string; keepTranslations?: boolean },
  ) => Promise<Category>;
  deleteCategory: (id: number) => Promise<void>;
  bulkDeleteCategories: (categories: Category[]) => Promise<BulkOperationResult>;
}

const CategoryContext = createContext<CategoryContextType | undefined>(undefined);

export interface CategoryProviderProps {
  children: React.ReactNode;
  pollInterval?: number; // in milliseconds
  enablePolling?: boolean;
}

export function CategoryProvider({ 
  children,
  pollInterval = 30000,
  enablePolling = true
}: CategoryProviderProps) {
  const categoryData = useCategoryData();
  const { refreshCategories } = categoryData;
  const [isSyncing, setIsSyncing] = React.useState(false);

  const handleRefresh = React.useCallback(async (force: boolean = false) => {
    if (!isSyncing) {
      setIsSyncing(true);
      try {
        await refreshCategories();
        if (force) {
          // Second attempt for forced refresh
          await refreshCategories();
        }
      } catch (error) {
        // Error will be handled by categoryData hook
      } finally {
        setIsSyncing(false);
      }
    }
  }, [isSyncing, refreshCategories]);

  // Initial fetch
  React.useEffect(() => {
    handleRefresh();
  }, []);

  // Polling
  React.useEffect(() => {
    if (!enablePolling) return;

    const intervalId = setInterval(handleRefresh, pollInterval);

    return () => clearInterval(intervalId);
  }, [enablePolling, pollInterval, handleRefresh]);

  // Focus/visibility handling
  React.useEffect(() => {
    if (!enablePolling) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleRefresh);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleRefresh);
    };
  }, [enablePolling, handleRefresh]);

  return (
    <CategoryContext.Provider value={categoryData}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategoryContext() {
  const context = useContext(CategoryContext);
  if (context === undefined) {
    throw new Error('useCategoryContext must be used within a CategoryProvider');
  }
  return context;
}