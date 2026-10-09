// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BaseApiService } from '../base';
import config from '@/config/config';
import { 
  Language, 
  BulkUpdateLanguageState, 
  BulkUpdateResponse,
  LanguageResponse,
  TranslationCountResponse,
  ActiveModelLanguageCoverageResponse,
  ActiveModelLanguageCoverage
} from '@/types/language';

export class LanguageService extends BaseApiService {
  constructor() {
    super(config.api.endpoints.languages.base);
  }

  /**
   * Fetches all languages
   * @returns Promise<Language[]>
   */
  async getLanguages(): Promise<Language[]> {
    try {
      const response = await this.request<LanguageResponse>('');
      return response.languages;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Fetches only enabled languages
   * @returns Promise<Language[]>
   */
  async getEnabledLanguages(): Promise<Language[]> {
    try {
      const response = await this.request<LanguageResponse>('/enabled');
      return response.languages;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getActiveModelCoverage(): Promise<ActiveModelLanguageCoverage | null> {
    try {
      const response = await this.request<ActiveModelLanguageCoverageResponse>('/model-coverage');
      return response.model;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Updates multiple language states in bulk
   * @param updates - Array of language state updates
   * @returns Promise<BulkUpdateResponse>
   */
  async bulkUpdateLanguages(updates: BulkUpdateLanguageState[]): Promise<BulkUpdateResponse> {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new Error('No languages provided for update');
    }

    // Validate updates before sending
    this.validateBulkUpdate(updates);

    try {
      return await this.request<BulkUpdateResponse>('/bulk', {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Gets the count of translations for specific languages
   * @param languageNames - Array of language names to count translations for
   * @returns Promise<number> - Total count of translations
   */
  async getTranslationCount(languageNames: string[]): Promise<number> {
    if (!Array.isArray(languageNames) || languageNames.length === 0) {
      return 0;
    }

    try {
      const response = await this.request<TranslationCountResponse>('/translation-count', {
        method: 'POST',
        body: JSON.stringify({ languageNames })
      });
      return response.count;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Validates a language name
   * @param name - The language name to validate
   * @throws Error if the name is invalid
   */
  private validateLanguageName(name: string): void {
    if (typeof name !== 'string') {
      throw new Error('Language name must be a string');
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      throw new Error('Language name must be between 2 and 50 characters');
    }
  }

  /**
   * Validates a bulk update request
   * @param updates - Array of updates to validate
   * @throws Error if the updates are invalid
   */
  private validateBulkUpdate(updates: BulkUpdateLanguageState[]): void {
    if (!Array.isArray(updates)) {
      throw new Error('Updates must be an array');
    }

    if (updates.length === 0) {
      throw new Error('No languages provided for update');
    }

    // Check for duplicate names
    const names = new Set<string>();
    for (const update of updates) {
      if (names.has(update.name)) {
        throw new Error(`Duplicate language name found: ${update.name}`);
      }
      names.add(update.name);

      // Validate each update
      this.validateLanguageName(update.name);
      if (typeof update.isEnabled !== 'boolean') {
        throw new Error(`Invalid enabled state for language: ${update.name}`);
      }
    }
  }
}
