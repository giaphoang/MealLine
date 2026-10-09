// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Translation, BulkOperationResult, TranslationType, TranslationCapabilities } from '@/types/translation';
import { BaseApiService } from '../base';
import config from '@/config/config';

interface CreateTranslationData {
  originalText: string;
  targetLanguages: string[];
}

interface UpdateTranslationData {
  id: number;
  translatedText?: string;
}

interface TranslationMetrics {
  success: Array<{
    success: number;
    pending: number;
  }>;
  responseTimes: Array<{
    language: string;
    time: number;
    requests: number;
    tokens: number;
    cost: number;
  }>;
}

interface PerformanceMetrics {
  date: string;
  responseTime: number;
  cost: number;
  promptTokens: number;
  completionTokens: number;
}

interface MissingTranslationDetails {
  byType: {
    [key: string]: number;
  };
  byLanguage: {
    [key: string]: number;
  };
  totalItems: number;
  sampleItems?: {
    [key: string]: string[];
  };
}

export class TranslationService extends BaseApiService {
  // Utility function to check if a translation already includes the original English text
  hasOriginalTextIncluded(translation: Translation): boolean {
    if (!translation?.translatedText || !translation?.originalText) {
      return false;
    }
    
    // Check if the translated text includes the original text in parentheses
    return translation.translatedText.includes(`(${translation.originalText})`);
  }
  constructor() {
    super(config.api.endpoints.translations?.base ?? '/api/translations');
  }

  async getMetrics(): Promise<TranslationMetrics> {
    try {
      const response = await this.get<{ metrics: TranslationMetrics }>('/metrics');
      return response.metrics;
    } catch (error) {
      console.error('Failed to get translation metrics:', error);
      throw error;
    }
  }

  async getPerformanceMetrics(timeRange: string): Promise<PerformanceMetrics[]> {
    try {
      const response = await this.get<{ metrics: PerformanceMetrics[] }>(`/performance?timeRange=${timeRange}`);
      return response.metrics;
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      throw error;
    }
  }

  async getTranslations(): Promise<Translation[]> {
    try {
      const response = await this.get<{ translations: Translation[] }>('');
      return response.translations;
    } catch (error) {
      console.error('Failed to get translations:', error);
      throw error;
    }
  }

  // Fetch server-declared capabilities for translation actions (by type)
  async getCapabilities(): Promise<TranslationCapabilities> {
    try {
      const response = await this.get<{ capabilities: TranslationCapabilities }>(`/capabilities`);
      return response.capabilities;
    } catch (error) {
      console.error('Failed to get translation capabilities:', error);
      // Fallback: allow include/remove only for Custom and Generated
      return {
        Category: [],
        FoodItem: [],
        Custom: ['includeOriginal', 'removeOriginal'],
        Generated: ['includeOriginal', 'removeOriginal']
      };
    }
  }

  async createTranslation(data: CreateTranslationData): Promise<Translation[]> {
    try {
      const response = await this.post<{ translations: Translation[] }>('', data);
      return response.translations;
    } catch (error) {
      console.error('Failed to create translation:', error);
      throw error;
    }
  }

  async updateTranslation(data: UpdateTranslationData): Promise<Translation> {
    try {
      const response = await this.put<{ translation: Translation }>(`/${data.id}`, data);
      return response.translation;
    } catch (error) {
      console.error('Failed to update translation:', error);
      throw error;
    }
  }

  async deleteTranslation(id: number): Promise<void> {
    try {
      await this.delete(`/${id}`);
    } catch (error) {
      console.error('Failed to delete translation:', error);
      throw error;
    }
  }

  async bulkDeleteTranslations(ids: number[]): Promise<BulkOperationResult> {
    try {
      const response = await this.post<BulkOperationResult>('/bulk-delete', { ids });
      return response;
    } catch (error) {
      console.error('Failed to bulk delete translations:', error);
      throw error;
    }
  }

  async bulkRetryTranslations(ids: number[]): Promise<BulkOperationResult> {
    try {
      const response = await this.post<BulkOperationResult>('/bulk-retry', { ids });
      return response;
    } catch (error) {
      console.error('Failed to bulk retry translations:', error);
      throw error;
    }
  }

  async bulkIncludeOriginal(ids: number[]): Promise<BulkOperationResult> {
    try {
      const response = await this.post<BulkOperationResult>('/bulk-include-original', { ids });
      return response;
    } catch (error) {
      console.error('Failed to include original text in translations:', error);
      throw error;
    }
  }

  async bulkRemoveOriginal(ids: number[]): Promise<BulkOperationResult> {
    try {
      const response = await this.post<BulkOperationResult>('/bulk-remove-original', { ids });
      return response;
    } catch (error) {
      console.error('Failed to remove original text from translations:', error);
      throw error;
    }
  }

  // Single item methods for including/removing original text
  async includeOriginalText(id: number): Promise<BulkOperationResult> {
    return this.bulkIncludeOriginal([id]);
  }

  async removeOriginalText(id: number): Promise<BulkOperationResult> {
    return this.bulkRemoveOriginal([id]);
  }

  // Context-aware toggle method that determines which action to take
  async toggleOriginalText(translation: Translation): Promise<BulkOperationResult> {
    if (this.hasOriginalTextIncluded(translation)) {
      return this.removeOriginalText(translation.id);
    } else {
      return this.includeOriginalText(translation.id);
    }
  }

  // Skip translation methods
  /*
   * DEPRECATED (2025-09-01): Skip/Enable Translation actions are removed from the project.
   * The following methods are preserved as commented reference only.
   */
  // async skipTranslation(id: number): Promise<BulkOperationResult> {
  //   try {
  //     const response = await this.post<BulkOperationResult>(`/${id}/skip-translation`);
  //     return response;
  //   } catch (error) {
  //     console.error('Failed to skip translation:', error);
  //     throw error;
  //   }
  // }

  // async bulkSkipTranslation(ids: number[]): Promise<BulkOperationResult> {
  //   try {
  //     const response = await this.post<BulkOperationResult>('/bulk-skip-translation', { ids });
  //     return response;
  //   } catch (error) {
  //     console.error('Failed to skip translations:', error);
  //     throw error;
  //   }
  // }

  // async enableTranslation(id: number): Promise<BulkOperationResult> {
  //   try {
  //     const response = await this.post<BulkOperationResult>(`/${id}/enable-translation`);
  //     return response;
  //   } catch (error) {
  //     console.error('Failed to enable translation:', error);
  //     throw error;
  //   }
  // }

  // async bulkEnableTranslation(ids: number[]): Promise<BulkOperationResult> {
  //   try {
  //     const response = await this.post<BulkOperationResult>('/bulk-enable-translation', { ids });
  //     return response;
  //   } catch (error) {
  //     console.error('Failed to enable translations:', error);
  //     throw error;
  //   }
  // }
  
  // Determines if a translation is skipped
  // Legacy utility retained for backward compatibility in data rendering.
  isSkipped(translation: Translation): boolean {
    return translation?.skipTranslation === true;
  }

  async retryTranslation(id: number): Promise<Translation> {
    try {
      const response = await this.post<{ translation: Translation }>(`/${id}/retry`);
      return response.translation;
    } catch (error) {
      console.error('Failed to retry translation:', error);
      throw error;
    }
  }

  async findMissingTranslations(process: boolean = true, types?: TranslationType[]): Promise<{ count: number; message: string; details?: MissingTranslationDetails; staleCount?: number }> {
    try {
      const response = await this.post<{ count: number; message: string; details?: MissingTranslationDetails }>('/find-missing', { process, types });
      return response;
    } catch (error) {
      console.error('Failed to find missing translations:', error);
      throw error;
    }
  }

  /**
   * Find missing translations relevant to Shopping List generation.
   * This intentionally excludes the 'Generated (Document)' type which is unrelated
   * to shopping list creation. Follows established per-type filtering patterns
   * used across Translation Management.
   */
  async findMissingForShoppingList(process: boolean = true): Promise<{ count: number; message: string; details?: MissingTranslationDetails; staleCount?: number }> {
    const SHOPPING_LIST_TYPES: TranslationType[] = ['Custom', 'Category', 'FoodItem'];
    return this.findMissingTranslations(process, SHOPPING_LIST_TYPES);
  }
}
