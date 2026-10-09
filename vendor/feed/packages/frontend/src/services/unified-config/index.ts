// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { AIConfigService } from '../ai-config';
import { SystemPromptService } from '../system-prompt';
import { AIConfiguration, ThinkingLevelValue } from '@/components/ai-configuration/types';
import { SystemPrompt } from '@/types/system-prompt';

/**
 * Utility functions for composite ID management
 */
export function createCompositeId(type: 'apikey' | 'prompt', originalId: number): string {
  return `${type}-${originalId}`;
}

export function parseCompositeId(compositeId: string): { type: 'apikey' | 'prompt'; originalId: number } {
  const [type, idStr] = compositeId.split('-');
  const originalId = parseInt(idStr, 10);
  
  if (!type || isNaN(originalId) || !['apikey', 'prompt'].includes(type)) {
    throw new Error(`Invalid composite ID format: ${compositeId}`);
  }
  
  return { type: type as 'apikey' | 'prompt', originalId };
}

export interface UnifiedConfiguration {
  id: string; // Composite ID format: "apikey-1" or "prompt-1"
  name: string;
  type: 'apikey' | 'prompt';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  description?: string;
  // API key fields (when type === 'apikey')
  serviceType?: string;
  modelName?: string;
  model?: string;
  endpointUrl?: string;
  inputCost?: number;
  outputCost?: number;
  temperature?: number;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  thinkingLevel?: ThinkingLevelValue | null;
  dailyCostLimit?: number | null;
  monthlyCostLimit?: number | null;
  tokensPerMinute?: number;
  requestsPerMinute?: number;
  requestsPerDay?: number;
  // Prompt fields (when type === 'prompt')
  promptType?: string;
  promptCategory?: string;
  serviceDescription?: string;
  translationApproach?: string;
  contextGuidance?: string;
  additionalGuidance?: string;
}

export class UnifiedConfigService {
  private aiConfigService: AIConfigService;
  private systemPromptService: SystemPromptService;

  constructor() {
    this.aiConfigService = new AIConfigService();
    this.systemPromptService = new SystemPromptService();
  }

  /**
   * Fetches and merges configurations from both services
   */
  async getUnifiedConfigurations(): Promise<UnifiedConfiguration[]> {
    const [aiConfigs, systemPrompts] = await Promise.all([
      this.aiConfigService.getConfigurations(),
      this.systemPromptService.getSystemPrompts()
    ]);

    const unified: UnifiedConfiguration[] = [];

    // Convert AI configurations
    aiConfigs.forEach(config => {
      unified.push({
        id: createCompositeId('apikey', config.id),
        name: config.name,
        type: 'apikey',
        isActive: config.isActive,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        description: config.description,
        serviceType: config.serviceType,
        modelName: config.modelName,
        model: config.model,
        endpointUrl: config.endpointUrl,
        inputCost: config.inputCost,
        outputCost: config.outputCost,
        temperature: config.temperature,
        thinkingLevel: config.thinkingLevel,
        inputTokenLimit: config.inputTokenLimit,
        outputTokenLimit: config.outputTokenLimit ?? config.maxTokens,
        dailyCostLimit: config.dailyCostLimit,
        monthlyCostLimit: config.monthlyCostLimit,
        tokensPerMinute: config.tokensPerMinute,
        requestsPerMinute: config.requestsPerMinute,
        requestsPerDay: config.requestsPerDay
      });
    });

    // Convert SystemPrompt configurations
    systemPrompts.forEach(prompt => {
      unified.push({
        id: createCompositeId('prompt', prompt.id),
        name: prompt.name,
        type: 'prompt',
        isActive: prompt.isActive,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
        description: prompt.description,
        promptType: prompt.promptType,
        promptCategory: this.mapPromptTypeToCategory(prompt.promptType),
        serviceDescription: prompt.serviceDescription,
        translationApproach: prompt.translationApproach,
        contextGuidance: prompt.contextGuidance,
        additionalGuidance: prompt.additionalGuidance
      });
    });

    // Sort by most recent first
    unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return unified;
  }

  /**
   * Routes delete operation to appropriate service
   */
  async deleteConfiguration(config: UnifiedConfiguration): Promise<void> {
    const { originalId } = parseCompositeId(config.id);
    
    if (config.type === 'apikey') {
      await this.aiConfigService.deleteConfiguration(originalId);
    } else {
      await this.systemPromptService.deleteSystemPrompt(originalId);
    }
  }

  /**
   * Routes bulk delete operation to appropriate services
   */
  async bulkDeleteConfigurations(configs: UnifiedConfiguration[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const apiKeyConfigs = configs.filter(c => c.type === 'apikey');
    const promptConfigs = configs.filter(c => c.type === 'prompt');

    const results = await Promise.allSettled([
      ...(apiKeyConfigs.length > 0 ? [this.aiConfigService.bulkDeleteConfigurations(apiKeyConfigs.map(c => parseCompositeId(c.id).originalId))] : []),
      ...(promptConfigs.length > 0 ? [this.systemPromptService.bulkDeleteSystemPrompts(promptConfigs.map(c => parseCompositeId(c.id).originalId))] : [])
    ]);

    let totalSuccess = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        totalSuccess += result.value.success;
        totalFailed += result.value.failed;
        allErrors.push(...result.value.errors);
      } else {
        totalFailed += configs.length;
        allErrors.push(result.reason?.message || 'Unknown error');
      }
    });

    return {
      success: totalSuccess,
      failed: totalFailed,
      errors: allErrors
    };
  }

  /**
   * Routes toggle active operation to appropriate service
   */
  async toggleActive(config: UnifiedConfiguration): Promise<UnifiedConfiguration> {
    const { originalId } = parseCompositeId(config.id);
    
    if (config.type === 'apikey') {
      const updated = await this.aiConfigService.toggleActive(originalId, config.isActive);
      return {
        ...config,
        isActive: updated.isActive,
        updatedAt: updated.updatedAt
      };
    } else {
      const updated = await this.systemPromptService.toggleActive(originalId, config.isActive);
      return {
        ...config,
        isActive: updated.isActive,
        updatedAt: updated.updatedAt
      };
    }
  }

  /**
   * Routes bulk toggle active operation to appropriate services
   */
  async bulkToggleActive(configs: UnifiedConfiguration[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const apiKeyConfigs = configs.filter(c => c.type === 'apikey');
    const promptConfigs = configs.filter(c => c.type === 'prompt');

    // Transform UnifiedConfiguration objects back to their original types
    const transformedApiKeyConfigs: AIConfiguration[] = apiKeyConfigs.map(config => {
      const { originalId } = parseCompositeId(config.id);
      return {
        id: originalId,
        name: config.name,
        type: 'apikey' as const,
        value: '', // Not used in toggle operation
        description: config.description,
        isActive: config.isActive,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        modelName: config.modelName,
        model: config.model,
        serviceType: config.serviceType as 'OpenAI' | 'Anthropic' | 'Google' | 'Azure' | undefined,
        endpointUrl: config.endpointUrl,
        inputCost: config.inputCost,
        outputCost: config.outputCost,
        temperature: config.temperature,
        inputTokenLimit: config.inputTokenLimit,
        outputTokenLimit: config.outputTokenLimit ?? config.maxTokens,
        tokensPerMinute: config.tokensPerMinute,
        requestsPerMinute: config.requestsPerMinute,
        requestsPerDay: config.requestsPerDay
      };
    });

    const transformedPromptConfigs: SystemPrompt[] = promptConfigs.map(config => {
      const { originalId } = parseCompositeId(config.id);
      return {
        id: originalId,
        name: config.name,
        promptType: config.promptType || '',
        isActive: config.isActive,
        isDefault: false, // Default value, not used in toggle operation
        description: config.description,
        serviceDescription: config.serviceDescription,
        translationApproach: config.translationApproach,
        contextGuidance: config.contextGuidance,
        additionalGuidance: config.additionalGuidance,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt
      };
    });

    const results = await Promise.allSettled([
      ...(transformedApiKeyConfigs.length > 0 ? [this.aiConfigService.bulkToggleActive(transformedApiKeyConfigs)] : []),
      ...(transformedPromptConfigs.length > 0 ? [this.systemPromptService.bulkToggleActive(transformedPromptConfigs)] : [])
    ]);

    let totalSuccess = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        totalSuccess += result.value.success;
        totalFailed += result.value.failed;
        allErrors.push(...result.value.errors);
      } else {
        totalFailed += configs.length;
        allErrors.push(result.reason?.message || 'Unknown error');
      }
    });

    return {
      success: totalSuccess,
      failed: totalFailed,
      errors: allErrors
    };
  }

  /**
   * Maps backend PromptType enum to frontend category names
   */
  private mapPromptTypeToCategory(promptType: string): string {
    switch (promptType) {
      case 'FOOD_TRANSLATION':
        return 'Food Items & Categories Translation';
      case 'CUSTOM_TRANSLATION':
        return 'Custom Text Translation';
      case 'BATCH_TRANSLATION':
        return 'Document Text Translation';
      case 'CLASSIFICATION':
        return 'Document Auto-Format Rules';
      default:
        return promptType;
    }
  }
}
