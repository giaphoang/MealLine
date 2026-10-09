// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect, useCallback, useRef } from 'react';
import { Category, BulkOperationResult, LimitType } from '@/types/category';
import { CategoryService } from '@/services/category';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';

interface CreateCategoryData {
  name: string;
  limit: number;
  limitType: LimitType;
  icon?: string;
}

interface UpdateCategoryData extends CreateCategoryData {
  id: number;
  keepTranslations?: boolean;
}

interface UseCategoryDataReturn {
  categories: Category[];
  isLoading: boolean;
  isSaving: boolean;
  lastUpdate: Date | null;
  refreshCategories: () => Promise<void>;
  createCategory: (data: CreateCategoryData) => Promise<Category>;
  updateCategory: (data: UpdateCategoryData) => Promise<Category>;
  deleteCategory: (id: number) => Promise<void>;
  bulkDeleteCategories: (categories: Category[]) => Promise<BulkOperationResult>;
}

interface CacheEntry {
  categories: Category[];
  timestamp: Date;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export const useCategoryData = (): UseCategoryDataReturn => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  const cacheRef = useRef<CacheEntry | null>(null);
  const categoryService = new CategoryService();

  const isCacheValid = useCallback(() => {
    if (!cacheRef.current) return false;
    const now = new Date();
    const cacheAge = now.getTime() - cacheRef.current.timestamp.getTime();
    return cacheAge < CACHE_DURATION;
  }, []);

  const fetchCategories = useCallback(async (force: boolean = false) => {
    if (!force && isCacheValid()) {
      setCategories(cacheRef.current!.categories);
      setLastUpdate(cacheRef.current!.timestamp);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    try {
      const data = await categoryService.getCategories();
      
      cacheRef.current = {
        categories: data,
        timestamp: new Date()
      };
      
      setCategories(data);
      setLastUpdate(new Date());
    } catch (err) {
      ErrorHandlerService.handleError(err, 'fetchCategories');
    } finally {
      setIsLoading(false);
    }
  }, [isCacheValid]);

  const refreshCategories = useCallback(async () => {
    await fetchCategories(true);
  }, [fetchCategories]);

  const handleBulkDelete = useCallback(async (categoriesToDelete: Category[]): Promise<BulkOperationResult> => {
    setIsSaving(true);

    try {
      if (!Array.isArray(categoriesToDelete) || categoriesToDelete.length === 0) {
        throw new Error('No categories selected for deletion');
      }

      const categoryIds = categoriesToDelete.map(category => category.id);
      const result = await categoryService.bulkDeleteCategories(categoryIds);
      await refreshCategories();
      return result;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'bulkDeleteCategories');
      await refreshCategories();
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [refreshCategories]);

  const handleCreateCategory = useCallback(async (data: CreateCategoryData): Promise<Category> => {
    setIsSaving(true);
    
    const tempId = Math.max(0, ...categories.map(c => c.id)) + 1;
    const tempCategory: Category = {
      id: tempId,
      name: data.name,
      limit: data.limit,
      limitType: data.limitType,
      icon: data.icon,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setCategories(prev => [...prev, tempCategory]);

    try {
      const createdCategory = await categoryService.createCategory(data);
      
      setCategories(prev => 
        prev.map(c => c.id === tempId ? createdCategory : c)
      );
      
      if (cacheRef.current) {
        cacheRef.current = {
          categories: categories.map(c => c.id === tempId ? createdCategory : c),
          timestamp: new Date()
        };
      }
      
      setLastUpdate(new Date());
      return createdCategory;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'createCategory');
      setCategories(prev => prev.filter(c => c.id !== tempId));
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [categories]);

  const handleUpdateCategory = useCallback(async (data: UpdateCategoryData): Promise<Category> => {
    setIsSaving(true);

    const originalCategory = categories.find(c => c.id === data.id);
    if (!originalCategory) {
      throw new Error('Category not found');
    }

    const updatedCategory: Category = {
      ...originalCategory,
      ...data,
      updatedAt: new Date().toISOString()
    };

    setCategories(prev => 
      prev.map(c => c.id === data.id ? updatedCategory : c)
    );

    try {
      const result = await categoryService.updateCategory(data);
      
      setCategories(prev => 
        prev.map(c => c.id === data.id ? result : c)
      );
      
      if (cacheRef.current) {
        cacheRef.current = {
          categories: categories.map(c => c.id === data.id ? result : c),
          timestamp: new Date()
        };
      }
      
      setLastUpdate(new Date());
      return result;
    } catch (err) {
      ErrorHandlerService.handleError(err, 'updateCategory');
      setCategories(prev => 
        prev.map(c => c.id === data.id ? originalCategory : c)
      );
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [categories]);

  const handleDeleteCategory = useCallback(async (id: number): Promise<void> => {
    setIsSaving(true);

    const categoryToDelete = categories.find(c => c.id === id);
    if (!categoryToDelete) {
      throw new Error('Category not found');
    }

    setCategories(prev => prev.filter(c => c.id !== id));

    try {
      await categoryService.deleteCategory(id);
      if (cacheRef.current) {
        cacheRef.current = {
          categories: cacheRef.current.categories.filter(c => c.id !== id),
          timestamp: new Date()
        };
      }
      await refreshCategories();
    } catch (err) {
      ErrorHandlerService.handleError(err, 'deleteCategory');
      await refreshCategories();
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [categories, refreshCategories]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    isLoading,
    isSaving,
    lastUpdate,
    refreshCategories,
    createCategory: handleCreateCategory,
    updateCategory: handleUpdateCategory,
    deleteCategory: handleDeleteCategory,
    bulkDeleteCategories: handleBulkDelete
  };
};