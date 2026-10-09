// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { SystemPrompt, CreateSystemPromptData, UpdateSystemPromptData, BulkSystemPromptOperationResult, SYSTEM_PROMPT_VALIDATION, PromptType } from '@/types/system-prompt';
import { BaseApiService } from '../base';
import config from '@/config/config';

/**
 * Filters data fields based on prompt type to send only relevant fields
 * @param promptType - The prompt type to filter for
 * @param data - The data object containing all fields
 * @returns Filtered data object with only relevant fields
 */
function getValidFieldsForPromptType(promptType: PromptType, data: any): any {
  const commonFields = {
    name: data.name,
    promptType: data.promptType,
    isActive: data.isActive,
    isDefault: data.isDefault,
    description: data.description,
    serviceDescription: data.serviceDescription,
    translationApproach: data.translationApproach,
    contextGuidance: data.contextGuidance,
    additionalGuidance: data.additionalGuidance,
    skipTranslation: data.skipTranslation,
    includeEnglish: data.includeEnglish
  };

  // Classification prompts: include thresholds and cache control, exclude temperature/topP
  if (promptType === 'CLASSIFICATION') {
    return {
      ...commonFields,
      skipTranslationThreshold: data.skipTranslationThreshold,
      includeEnglishThreshold: data.includeEnglishThreshold,
      rememberFormattingChoices: data.rememberFormattingChoices
    };
  }

  // Translation prompts: include temperature/topP, exclude thresholds
  return {
    ...commonFields,
    temperature: data.temperature,
    topP: data.topP
  };
}

interface BulkDeleteResult {
  success: {
    count: number;
    names: string[];
  };
  failure: {
    count: number;
    prompts: Array<{
      name: string;
      reason: string;
    }>;
  };
}

interface CacheStats {
  promptId: number;
  promptName: string;
  cachedChoicesCount: number;
  uniqueTextsCount: number;
  cacheHitRate: number;
  estimatedApiCallsSaved: number;
}

interface ClearCacheResult {
  message: string;
  clearedCount: number;
  promptName: string;
}

export class SystemPromptService extends BaseApiService {
  constructor() {
    super(config.api.endpoints.systemPrompts.base);
  }

  /**
   * Fetches all system prompts from the API
   * @returns Promise<SystemPrompt[]>
   */
  async getSystemPrompts(): Promise<SystemPrompt[]> {
    try {
      const response = await this.get<{ prompts: SystemPrompt[] }>('');
      return response.prompts;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Gets a single system prompt by ID
   * @param id - ID of prompt to fetch
   * @returns Promise<SystemPrompt>
   */
  async getSystemPrompt(id: number): Promise<SystemPrompt> {
    try {
      const response = await this.get<{ prompt: SystemPrompt }>(`/${id}`);
      return response.prompt;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Creates a new system prompt
   * @param data - System prompt data to create
   * @returns Promise<SystemPrompt>
   */
  async createSystemPrompt(data: CreateSystemPromptData): Promise<SystemPrompt> {
    // DEBUG: Log incoming data
    console.log('[DEBUG] SystemPromptService.createSystemPrompt - incoming data:', {
      ...data,
      hasDescription: !!data.description,
      descriptionValue: data.description,
      descriptionLength: data.description?.length || 0
    });
    
    this.validateName(data.name);
    this.validatePromptType(data.promptType);
    
    if (data.skipTranslationThreshold !== undefined) {
      this.validateThreshold(data.skipTranslationThreshold, 'skipTranslationThreshold');
    }
    
    if (data.includeEnglishThreshold !== undefined) {
      this.validateThreshold(data.includeEnglishThreshold, 'includeEnglishThreshold');
    }
    
    if (data.temperature !== undefined) {
      this.validateTemperature(data.temperature);
    }
    
    if (data.topP !== undefined) {
      this.validateTopP(data.topP);
    }

    try {
      const filteredData = getValidFieldsForPromptType(data.promptType, data);
      
      // DEBUG: Log filtered data being sent to API
      console.log('[DEBUG] SystemPromptService.createSystemPrompt - filteredData being sent to API:', {
        ...filteredData,
        hasDescription: !!filteredData.description,
        descriptionValue: filteredData.description,
        descriptionLength: filteredData.description?.length || 0
      });
      
      const response = await this.post<{ prompt: SystemPrompt }>('', filteredData);
      return response.prompt;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Updates an existing system prompt
   * @param data - System prompt data to update
   * @returns Promise<SystemPrompt>
   */
  async updateSystemPrompt(data: UpdateSystemPromptData): Promise<SystemPrompt> {
    this.validateName(data.name);
    this.validatePromptType(data.promptType);
    
    if (data.skipTranslationThreshold !== undefined) {
      this.validateThreshold(data.skipTranslationThreshold, 'skipTranslationThreshold');
    }
    
    if (data.includeEnglishThreshold !== undefined) {
      this.validateThreshold(data.includeEnglishThreshold, 'includeEnglishThreshold');
    }
    
    if (data.temperature !== undefined) {
      this.validateTemperature(data.temperature);
    }
    
    if (data.topP !== undefined) {
      this.validateTopP(data.topP);
    }

    try {
      const filteredData = getValidFieldsForPromptType(data.promptType, data);
      const response = await this.put<{ prompt: SystemPrompt }>(`/${data.id}`, filteredData);
      return response.prompt;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Deletes a system prompt
   * @param id - ID of prompt to delete
   * @returns Promise<void>
   */
  async deleteSystemPrompt(id: number): Promise<void> {
    try {
      await this.delete(`/${id}`);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Deletes multiple system prompts in bulk
   * @param ids - Array of prompt IDs to delete
   * @returns Promise<BulkSystemPromptOperationResult>
   */
  async bulkDeleteSystemPrompts(ids: number[]): Promise<BulkSystemPromptOperationResult> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('No system prompts selected for deletion');
    }

    try {
      const endpoint = '/bulk';
      const payload = { ids };
      
      const response = await this.delete<{ message: string; result: BulkDeleteResult }>(endpoint, payload);

      if (response?.message && response?.result) {
        const result: BulkSystemPromptOperationResult = {
          success: response.result.success.count,
          failed: response.result.failure.count,
          errors: [response.message]
        };
        return result;
      }

      throw new Error('Unexpected response format from server');
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Toggles the active state of a system prompt
   * @param id - ID of prompt to toggle
   * @param currentState - Current active state
   * @returns Promise<SystemPrompt>
   */
  async toggleActive(id: number, currentState: boolean): Promise<SystemPrompt> {
    try {
      const response = await this.put<{ prompt: SystemPrompt }>(`/${id}`, {
        isActive: !currentState
      });
      return response.prompt;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Toggles the active state of multiple system prompts in bulk
   * @param prompts - Array of prompts to toggle
   * @returns Promise<BulkSystemPromptOperationResult>
   */
  async bulkToggleActive(prompts: SystemPrompt[]): Promise<BulkSystemPromptOperationResult> {
    if (!Array.isArray(prompts) || prompts.length === 0) {
      throw new Error('No system prompts selected for toggle');
    }

    try {
      const toActivate = prompts.filter(p => !p.isActive);
      const toDeactivate = prompts.filter(p => p.isActive);
      
      const results = await Promise.allSettled([
        ...toActivate.map(p => this.toggleActive(p.id, p.isActive)),
        ...toDeactivate.map(p => this.toggleActive(p.id, p.isActive))
      ]);
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected');
      
      return {
        success: succeeded,
        failed: failed.length,
        errors: failed.map(f => f.status === 'rejected' ? f.reason?.message || 'Unknown error' : 'Unknown error')
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Validates a prompt name
   * @param name - The prompt name to validate
   * @returns true if valid, throws Error if invalid
   */
  validateName(name: string): boolean {
    if (typeof name !== 'string') {
      throw new Error('System prompt name must be a string');
    }

    const trimmedName = name.trim();
    if (trimmedName.length < SYSTEM_PROMPT_VALIDATION.MIN_NAME_LENGTH || 
        trimmedName.length > SYSTEM_PROMPT_VALIDATION.MAX_NAME_LENGTH) {
      throw new Error(
        `System prompt name must be between ${SYSTEM_PROMPT_VALIDATION.MIN_NAME_LENGTH} and ${SYSTEM_PROMPT_VALIDATION.MAX_NAME_LENGTH} characters`
      );
    }

    return true;
  }

  /**
   * Validates a prompt type
   * @param promptType - The prompt type to validate
   * @returns true if valid, throws Error if invalid
   */
  validatePromptType(promptType: PromptType): boolean {
    const validTypes: PromptType[] = ['FOOD_TRANSLATION', 'CUSTOM_TRANSLATION', 'BATCH_TRANSLATION', 'CLASSIFICATION'];
    
    if (!validTypes.includes(promptType)) {
      throw new Error(`Invalid prompt type. Must be one of: ${validTypes.join(', ')}`);
    }

    return true;
  }

  /**
   * Validates a threshold value
   * @param threshold - The threshold to validate
   * @param fieldName - Name of the field for error messages
   * @returns true if valid, throws Error if invalid
   */
  validateThreshold(threshold: number, fieldName: string): boolean {
    if (typeof threshold !== 'number' || isNaN(threshold)) {
      throw new Error(`${fieldName} must be a number`);
    }

    if (threshold < SYSTEM_PROMPT_VALIDATION.MIN_THRESHOLD || 
        threshold > SYSTEM_PROMPT_VALIDATION.MAX_THRESHOLD) {
      throw new Error(
        `${fieldName} must be between ${SYSTEM_PROMPT_VALIDATION.MIN_THRESHOLD} and ${SYSTEM_PROMPT_VALIDATION.MAX_THRESHOLD}`
      );
    }

    return true;
  }

  /**
   * Validates a temperature value
   * @param temperature - The temperature to validate
   * @returns true if valid, throws Error if invalid
   */
  validateTemperature(temperature: number): boolean {
    if (typeof temperature !== 'number' || isNaN(temperature)) {
      throw new Error('temperature must be a number');
    }

    if (temperature < SYSTEM_PROMPT_VALIDATION.MIN_TEMPERATURE || 
        temperature > SYSTEM_PROMPT_VALIDATION.MAX_TEMPERATURE) {
      throw new Error(
        `temperature must be between ${SYSTEM_PROMPT_VALIDATION.MIN_TEMPERATURE} and ${SYSTEM_PROMPT_VALIDATION.MAX_TEMPERATURE}`
      );
    }

    return true;
  }

  /**
   * Validates a topP value
   * @param topP - The topP to validate
   * @returns true if valid, throws Error if invalid
   */
  validateTopP(topP: number): boolean {
    if (typeof topP !== 'number' || isNaN(topP)) {
      throw new Error('topP must be a number');
    }

    if (topP < SYSTEM_PROMPT_VALIDATION.MIN_TOP_P || 
        topP > SYSTEM_PROMPT_VALIDATION.MAX_TOP_P) {
      throw new Error(
        `topP must be between ${SYSTEM_PROMPT_VALIDATION.MIN_TOP_P} and ${SYSTEM_PROMPT_VALIDATION.MAX_TOP_P}`
      );
    }

    return true;
  }

  /**
   * Gets cache statistics for a system prompt
   * @param id - ID of system prompt to get cache stats for
   * @returns Promise<CacheStats>
   */
  async getCacheStats(id: number): Promise<CacheStats> {
    try {
      const response = await this.get<CacheStats>(`/${id}/cache-stats`);
      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Clears cached formatting choices for a system prompt
   * @param id - ID of system prompt to clear cache for
   * @returns Promise<ClearCacheResult>
   */
  async clearCache(id: number): Promise<ClearCacheResult> {
    try {
      const response = await this.delete<ClearCacheResult>(`/${id}/cache`);
      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }
}
