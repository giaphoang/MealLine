// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useEffect, useCallback } from 'react';
import customTextService, { CustomText, CustomTextCreate, CustomTextUpdate } from '@/services/custom-text';
import { useMessage } from '../message/useMessage';

interface UseCustomTextDataReturn {
  customTexts: CustomText[];
  isLoading: boolean;
  error: Error | null;
  refreshCustomTexts: () => Promise<void>;
  createCustomText: (data: CustomTextCreate) => Promise<CustomText | null>;
  updateCustomText: (id: number, data: CustomTextUpdate) => Promise<CustomText | null>;
  deleteCustomText: (id: number) => Promise<boolean>;
}

export function useCustomTextData(): UseCustomTextDataReturn {
  const [customTexts, setCustomTexts] = useState<CustomText[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const { showMessage } = useMessage();

  const refreshCustomTexts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await customTextService.getCustomTexts();
      
      // Sort by type first (title texts first), then by most recently created
      const sortedData = [...data].sort((a, b) => {
        if (a.isTitle !== b.isTitle) {
          return a.isTitle ? -1 : 1; // Title texts first
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // Then by most recent
      });
      
      setCustomTexts(sortedData);
      return sortedData;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch custom texts'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCustomTexts().catch(err => {
      console.error('Error fetching custom texts:', err);
    });
  }, [refreshCustomTexts]);

  const createCustomText = async (data: CustomTextCreate): Promise<CustomText | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const newCustomText = await customTextService.createCustomText(data);
      await refreshCustomTexts();
      showMessage('Custom text created successfully', 'success');
      return newCustomText;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create custom text';
      setError(err instanceof Error ? err : new Error(errorMessage));
      showMessage(errorMessage, 'error');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateCustomText = async (id: number, data: CustomTextUpdate): Promise<CustomText | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedCustomText = await customTextService.updateCustomText(id, data);
      await refreshCustomTexts();
      showMessage('Custom text updated successfully', 'success');
      return updatedCustomText;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update custom text';
      setError(err instanceof Error ? err : new Error(errorMessage));
      showMessage(errorMessage, 'error');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCustomText = async (id: number): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await customTextService.deleteCustomText(id);
      await refreshCustomTexts();
      showMessage('Custom text deleted successfully', 'success');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete custom text';
      setError(err instanceof Error ? err : new Error(errorMessage));
      showMessage(errorMessage, 'error');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    customTexts,
    isLoading,
    error,
    refreshCustomTexts,
    createCustomText,
    updateCustomText,
    deleteCustomText,
  };
}