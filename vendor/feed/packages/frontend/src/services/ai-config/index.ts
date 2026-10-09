// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { AIConfiguration, BulkOperationResult, AIConfigurationType, ModelCatalogueResponse, ThinkingLevelValue } from '@/components/ai-configuration/types';
import { BaseApiService } from '../base';
import config from '@/config/config';

interface CreateAIConfigData {
  name: string;
  type: AIConfigurationType;
  value: string;
  description?: string;
  modelName?: string;
  model?: string;
  serviceType?: 'OpenAI' | 'Anthropic' | 'Google' | 'Azure';
  endpointUrl?: string;
  apiKey?: string;
  inputCost?: number;
  outputCost?: number;
  temperature?: number;
  topP?: number;
  thinkingLevel?: ThinkingLevelValue | null;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  dailyCostLimit?: number | null;
  monthlyCostLimit?: number | null;
  tokensPerMinute?: number;
  requestsPerMinute?: number;
  requestsPerDay?: number;
  unitPrice?: 'per_1k' | 'per_1m';
}

interface UpdateAIConfigData extends CreateAIConfigData {
  id: number;
}

interface BulkDeleteResult {
  success: {
    count: number;
    names: string[];
  };
  failure: {
    count: number;
    configurations: Array<{
      name: string;
      reason: string;
    }>;
  };
}

export class AIConfigService extends BaseApiService {
  constructor() {
    super(config.api.endpoints.aiConfig.base);
  }

  /**
   * Checks system initialization status
   * @returns Promise<{ initialized: boolean; components: { encryptionKey: boolean } }>
   */
  async getSystemStatus(): Promise<{ initialized: boolean; components: { encryptionKey: boolean } }> {
    try {
      const response = await fetch(`${config.api.baseUrl}/api/system/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Initializes system with encryption key
   * @param encryptionKey - Base64 encoded encryption key
   * @returns Promise<{ message: string; initialized: boolean }>
   */
  async initializeSystem(encryptionKey: string): Promise<{ message: string; initialized: boolean }> {
    try {
      const response = await fetch(`${config.api.baseUrl}/api/system/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ encryptionKey })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Fetches all AI configurations from the API
   * @returns Promise<AIConfiguration[]>
   */
  async getConfigurations(): Promise<AIConfiguration[]> {
    try {
      const response = await this.get<{ configurations: AIConfiguration[] }>('');
      return response.configurations;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Fetches the server-authoritative model catalogue.
   *
   * Replaces the dialogs' second copy of the model list (ISSUES.md #84). The
   * whole envelope is returned rather than just `models`, because the wizard
   * needs `endpoints` to pre-fill the service URL.
   *
   * @returns Promise<ModelCatalogueResponse>
   */
  async getModels(): Promise<ModelCatalogueResponse> {
    try {
      return await this.get<ModelCatalogueResponse>('/models');
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Creates a new AI configuration
   * @param data - AI configuration data to create
   * @returns Promise<AIConfiguration>
   */
  async createConfiguration(data: CreateAIConfigData): Promise<AIConfiguration> {
    this.validateName(data.name);
    if (data.type === 'prompt') {
      this.validatePrompt(data.value);
    }

    try {
      const response = await this.post<{ configuration: AIConfiguration }>('', data);
      return response.configuration;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Updates an existing AI configuration
   * @param data - AI configuration data to update
   * @returns Promise<AIConfiguration>
   */
  async updateConfiguration(data: UpdateAIConfigData): Promise<AIConfiguration> {
    this.validateName(data.name);
    if (data.type === 'prompt') {
      this.validatePrompt(data.value);
    }

    try {
      const response = await this.put<{ configuration: AIConfiguration }>(`/${data.id}`, data);
      return response.configuration;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Deletes an AI configuration
   * @param id - ID of configuration to delete
   * @returns Promise<void>
   */
  async deleteConfiguration(id: number): Promise<void> {
    try {
      await this.delete(`/${id}`);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Deletes multiple AI configurations in bulk
   * @param ids - Array of configuration IDs to delete
   * @returns Promise<BulkOperationResult>
   */
  async bulkDeleteConfigurations(ids: number[]): Promise<BulkOperationResult> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('No configurations selected for deletion');
    }

    try {
      const endpoint = '/bulk';
      const payload = { ids };
      
      const response = await this.delete<{ message: string; result: BulkDeleteResult }>(endpoint, payload);

      if (response?.message && response?.result) {
        const result: BulkOperationResult = {
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
   * Validates a configuration name
   * @param name - The configuration name to validate
   * @returns true if valid, throws Error if invalid
   */
  validateName(name: string): boolean {
    if (typeof name !== 'string') {
      throw new Error('Configuration name must be a string');
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 100) {
      throw new Error('Configuration name must be between 3 and 100 characters');
    }

    return true;
  }

  /**
   * Toggles the active state of an AI configuration
   * @param id - ID of configuration to toggle
   * @param currentState - Current active state
   * @returns Promise<AIConfiguration>
   */
  async toggleActive(id: number, currentState: boolean): Promise<AIConfiguration> {
    try {
      const response = await this.put<{ configuration: AIConfiguration }>(`/${id}`, {
        isActive: !currentState
      });
      return response.configuration;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Toggles the active state of multiple AI configurations in bulk
   * @param configurations - Array of configurations to toggle
   * @returns Promise<BulkOperationResult>
   */
  async bulkToggleActive(configurations: AIConfiguration[]): Promise<BulkOperationResult> {
    if (!Array.isArray(configurations) || configurations.length === 0) {
      throw new Error('No configurations selected for toggle');
    }

    try {
      // Group configurations by their current active state
      const toActivate = configurations.filter(c => !c.isActive);
      const toDeactivate = configurations.filter(c => c.isActive);
      
      const results = await Promise.allSettled([
        ...toActivate.map(c => this.toggleActive(c.id, c.isActive)),
        ...toDeactivate.map(c => this.toggleActive(c.id, c.isActive))
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
   * Validates a prompt value
   * @param value - The prompt value to validate
   * @returns true if valid, throws Error if invalid
   */
  validatePrompt(value: string): boolean {
    if (typeof value !== 'string') {
      throw new Error('Prompt value must be a string');
    }

    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      throw new Error('Prompt value cannot be empty');
    }

    if (trimmedValue.length > 4000) {
      throw new Error('Prompt value must be 4000 characters or less');
    }

    return true;
  }
}
