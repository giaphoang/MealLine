// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { AIConfiguration, SystemPrompt, PrismaClient } from '@prisma/client';
import { TemplateEngine, PromptVariables, TranslationContext } from './TemplateEngine';
import prisma from '../../../db';

// SystemPrompt cache configuration
interface CachedSystemPrompt {
  prompt: SystemPrompt;
  timestamp: number;
}

interface CachedPromptConfig {
  config: PromptConfiguration;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const systemPromptCache = new Map<string, CachedSystemPrompt>();
const promptConfigCache = new Map<string, CachedPromptConfig>();

export type PromptType = 'translation' | 'batch_translation' | 'classification' | 'batch_classification';

// Database PromptType string constants
const PROMPT_TYPES = {
  FOOD_TRANSLATION: 'FOOD_TRANSLATION',
  CUSTOM_TRANSLATION: 'CUSTOM_TRANSLATION',
  BATCH_TRANSLATION: 'BATCH_TRANSLATION',
  CLASSIFICATION: 'CLASSIFICATION'
} as const;

type DatabasePromptType = typeof PROMPT_TYPES[keyof typeof PROMPT_TYPES];

export interface PromptConfiguration {
  systemPrompt: string;
  customInstructions?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  isCustom: boolean;
}

/**
 * PromptBuilder handles construction of AI prompts with database-driven customization
 * and fallback to default templates when no custom configuration exists.
 */
export class PromptBuilder {
  /**
   * Clear SystemPrompt cache (useful for testing or configuration updates)
   */
  static clearCache(): void {
    systemPromptCache.clear();
    promptConfigCache.clear();
  }

  /**
   * Get cached SystemPrompt or fetch from database
   */
  private static async getCachedSystemPrompt(promptType: string): Promise<SystemPrompt | null> {
    const cacheKey = `${promptType}:active`;
    const cached = systemPromptCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      return cached.prompt;
    }

    // Fetch from database
    const prompt = await prisma.systemPrompt.findFirst({
      where: {
        promptType,
        isActive: true
      }
    });

    if (prompt) {
      systemPromptCache.set(cacheKey, {
        prompt,
        timestamp: now
      });
    }

    return prompt;
  }

  /**
   * Get cached prompt configuration
   */
  private static getCachedPromptConfig(
    configId: number,
    promptType: PromptType,
    context?: TranslationContext
  ): PromptConfiguration | null {
    const cacheKey = `${configId}:${promptType}:${context || 'none'}`;
    const cached = promptConfigCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      return cached.config;
    }

    return null;
  }

  /**
   * Cache prompt configuration
   */
  private static setCachedPromptConfig(
    configId: number,
    promptType: PromptType,
    context: TranslationContext | undefined,
    config: PromptConfiguration
  ): void {
    const cacheKey = `${configId}:${promptType}:${context || 'none'}`;
    promptConfigCache.set(cacheKey, {
      config,
      timestamp: Date.now()
    });
  }

  /**
   * Build a translation prompt using structured templates
   */
  static async buildTranslationPrompt(
    config: AIConfiguration,
    targetLanguage: string,
    instructions?: string,
    context: TranslationContext = 'custom'
  ): Promise<string> {
    console.log('[PromptBuilder] Building translation prompt for config:', {
      configId: config.id,
      serviceType: config.serviceType,
      targetLanguage,
      hasInstructions: !!instructions
    });
    
    const promptConfig = await this.getPromptConfiguration(config, 'translation', context);
    const variables: PromptVariables = {
      targetLanguage,
      instructions
    };

    let systemPrompt = TemplateEngine.substituteVariables(promptConfig.systemPrompt, variables);
    
    // Add instructions if provided
    if (instructions) {
      systemPrompt += ` Special instructions: ${instructions}`;
    }

    console.log('[PromptBuilder] Built translation prompt:', {
      promptLength: systemPrompt.length,
      isCustom: promptConfig.isCustom,
      preview: systemPrompt.substring(0, 100) + '...'
    });

    return systemPrompt;
  }

  /**
   * Build a batch translation prompt using structured templates
   */
  static async buildBatchTranslationPrompt(
    config: AIConfiguration,
    targetLanguage: string,
    specialInstructions?: string,
    context: TranslationContext = 'document'
  ): Promise<string> {
    console.log('[PromptBuilder] Building batch translation prompt for config:', {
      configId: config.id,
      serviceType: config.serviceType,
      targetLanguage,
      hasSpecialInstructions: !!specialInstructions
    });
    
    const promptConfig = await this.getPromptConfiguration(config, 'batch_translation', context);
    const variables: PromptVariables = {
      targetLanguage,
      specialInstructions
    };

    let systemPrompt = TemplateEngine.substituteVariables(promptConfig.systemPrompt, variables);
    
    // Add special instructions if provided
    if (specialInstructions) {
      systemPrompt += ` ${specialInstructions}`;
    }

    console.log('[PromptBuilder] Built batch translation prompt:', {
      promptLength: systemPrompt.length,
      isCustom: promptConfig.isCustom,
      preview: systemPrompt.substring(0, 100) + '...'
    });

    return systemPrompt;
  }

  /**
   * Build a classification prompt using structured templates
   */
  static async buildClassificationPrompt(
    config: AIConfiguration,
    isBatch: boolean = false
  ): Promise<string> {
    const promptType = isBatch ? 'batch_classification' : 'classification';
    console.log('[PromptBuilder] Building classification prompt for config:', {
      configId: config.id,
      serviceType: config.serviceType,
      promptType,
      isBatch
    });
    
    const promptConfig = await this.getPromptConfiguration(config, promptType);
    
    let systemPrompt = promptConfig.systemPrompt;

    console.log('[PromptBuilder] Built classification prompt:', {
      promptLength: systemPrompt.length,
      isCustom: promptConfig.isCustom,
      preview: systemPrompt.substring(0, 100) + '...'
    });

    return systemPrompt;
  }

  /**
   * Map frontend prompt categories to database PromptType string
   */
  private static mapCategoryToPromptType(
    category: PromptType,
    context?: TranslationContext
  ): DatabasePromptType {
    switch (category) {
      case 'translation':
        // Route based on translation context
        switch (context) {
          case 'food':
            return PROMPT_TYPES.FOOD_TRANSLATION;
          case 'custom':
            return PROMPT_TYPES.CUSTOM_TRANSLATION;
          case 'document':
            return PROMPT_TYPES.BATCH_TRANSLATION;
          default:
            return PROMPT_TYPES.CUSTOM_TRANSLATION;
        }
      case 'batch_translation':
        return PROMPT_TYPES.BATCH_TRANSLATION;
      case 'classification':
        return PROMPT_TYPES.CLASSIFICATION;
      case 'batch_classification':
        return PROMPT_TYPES.CLASSIFICATION;
      default:
        return context === 'food' ? PROMPT_TYPES.FOOD_TRANSLATION : PROMPT_TYPES.CUSTOM_TRANSLATION;
    }
  }

  /**
   * Create default SystemPrompt fields for processing default templates
   */
  private static createDefaultSystemPromptFields(): SystemPrompt {
    return {
      id: 0,
      name: 'Default Template',
      promptType: 'DEFAULT',
      isActive: true,
      isDefault: true,
      description: null,
      serviceDescription: null,
      translationApproach: 'the closest natural equivalent',
      contextGuidance: null,
      additionalGuidance: null,
      skipTranslation: null,
      includeEnglish: null,
      rememberFormattingChoices: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      includeEnglishThreshold: null,
      skipTranslationThreshold: null,
      temperature: null,
      topP: null
    };
  }

  /**
   * Retrieve prompt configuration using structured templates
   */
  static async getPromptConfiguration(
    config: AIConfiguration,
    promptType: PromptType,
    context?: TranslationContext
  ): Promise<PromptConfiguration> {
    try {
      // Check cache first
      const cachedConfig = this.getCachedPromptConfig(config.id, promptType, context);
      if (cachedConfig) {
        return cachedConfig;
      }

      // Early validation for classification prompts
      if (promptType === 'classification' || promptType === 'batch_classification') {
        const activeClassificationPrompt = await this.getCachedSystemPrompt('CLASSIFICATION');
        
        if (!activeClassificationPrompt) {
          throw new Error('Auto-Format requires configuration. Please set up Document Auto-Format Rules in Tools → AI Configuration to define your classification preferences.');
        }
      }
      
      // Query SystemPrompt table for active custom prompts using cache
      let dbPromptType = this.mapCategoryToPromptType(promptType, context);
      let templateType: DatabasePromptType = dbPromptType;

      if (promptType === 'batch_translation' && context && context !== 'document') {
        dbPromptType = this.mapCategoryToPromptType('translation', context);
        templateType = PROMPT_TYPES.BATCH_TRANSLATION;
      }
      
      console.log('[PromptBuilder] Querying SystemPrompt for configuration (cached):', {
        serviceType: config.serviceType,
        promptType,
        context,
        dbPromptType,
        templateType
      });
      const customPromptConfig = await this.getCachedSystemPrompt(dbPromptType);
      
      if (customPromptConfig) {
        console.log('[PromptBuilder] Found custom SystemPrompt configuration:', {
          configId: customPromptConfig.id,
          promptType: customPromptConfig.promptType,
          hasServiceDescription: !!customPromptConfig.serviceDescription,
          hasTranslationApproach: !!customPromptConfig.translationApproach,
          hasContextGuidance: !!customPromptConfig.contextGuidance,
          hasAdditionalGuidance: !!customPromptConfig.additionalGuidance,
          promptTemperature: customPromptConfig.temperature,
          promptTopP: customPromptConfig.topP
        });
        
        // Build custom prompt using structured template
        const systemPrompt = TemplateEngine.interpolateTemplate(templateType, customPromptConfig);
        
        // Implement hierarchical parameter resolution: SystemPrompt overrides AIConfiguration
        const resolvedTemperature = customPromptConfig.temperature ?? config.temperature ?? 0.7;
        const resolvedTopP = customPromptConfig.topP ?? config.topP ?? 1.0;
        const resolvedMaxTokens = config.maxTokens ?? 4096;
        
        console.log('[PromptBuilder] Parameter resolution (SystemPrompt overrides):', {
          temperature: `${customPromptConfig.temperature} -> ${resolvedTemperature}`,
          topP: `${customPromptConfig.topP} -> ${resolvedTopP}`,
          maxTokens: `${config.maxTokens} -> ${resolvedMaxTokens}`,
          source: 'SystemPrompt'
        });
        
        const result = {
          systemPrompt,
          customInstructions: undefined,
          temperature: resolvedTemperature,
          topP: resolvedTopP,
          maxTokens: resolvedMaxTokens,
          isCustom: true
        };
        
        // Cache the result
        this.setCachedPromptConfig(config.id, promptType, context, result);
        return result;
      }
      
      console.log('[PromptBuilder] No custom SystemPrompt found, using default template for type:', promptType);
      
      // Process default template through interpolateTemplate with default fields
      const defaultFields = this.createDefaultSystemPromptFields();
      const systemPrompt = TemplateEngine.interpolateTemplate(templateType, defaultFields);
      
      // Use AIConfiguration parameters when no custom prompt exists
      const resolvedTemperature = config.temperature ?? 0.7;
      const resolvedTopP = config.topP ?? 1.0;
      const resolvedMaxTokens = config.maxTokens ?? 4096;
      
      console.log('[PromptBuilder] Parameter resolution (AIConfiguration defaults):', {
        temperature: `${config.temperature} -> ${resolvedTemperature}`,
        topP: `${config.topP} -> ${resolvedTopP}`,
        maxTokens: `${config.maxTokens} -> ${resolvedMaxTokens}`,
        source: 'AIConfiguration'
      });
      
      const result = {
        systemPrompt,
        customInstructions: undefined,
        temperature: resolvedTemperature,
        topP: resolvedTopP,
        maxTokens: resolvedMaxTokens,
        isCustom: false
      };
      
      // Cache the result
      this.setCachedPromptConfig(config.id, promptType, context, result);
      return result;
    } catch (error) {
      console.warn('[PromptBuilder] Failed to retrieve SystemPrompt configuration, using fallback:', error);
      
      // Fallback also uses interpolateTemplate for consistency
      const defaultFields = this.createDefaultSystemPromptFields();
      const systemPrompt = TemplateEngine.interpolateTemplate(this.mapCategoryToPromptType(promptType, context), defaultFields);
      
      return {
        systemPrompt,
        temperature: 0.7,
        topP: 1.0,
        maxTokens: 4096,
        isCustom: false
      };
    }
  }







  /**
   * Validate prompt configuration for security and length constraints
   */
  static validatePromptConfiguration(config: PromptConfiguration): boolean {
    // Check for basic prompt injection patterns
    const dangerousPatterns = [
      /ignore\s+previous\s+instructions/i,
      /system\s*:\s*you\s+are\s+now/i,
      /forget\s+everything/i,
      /<\s*script/i,
      /javascript:/i
    ];

    const combinedPrompt = [
      config.systemPrompt,
      config.customInstructions
    ].filter(Boolean).join(' ');

    // Check for dangerous patterns
    for (const pattern of dangerousPatterns) {
      if (pattern.test(combinedPrompt)) {
        console.warn('Potential prompt injection detected in configuration');
        return false;
      }
    }

    // Check prompt length (approximate token limit check)
    if (combinedPrompt.length > 8000) { // Rough character-to-token ratio check
      console.warn('Prompt configuration exceeds recommended length');
      return false;
    }

    return true;
  }

  /**
   * Get supported prompt types
   */
  static getSupportedPromptTypes(): PromptType[] {
    return ['translation', 'batch_translation', 'classification', 'batch_classification'];
  }

  /**
   * Preview prompt with given variables (for testing/debugging)
   */
  static async previewPrompt(
    config: AIConfiguration,
    promptType: PromptType,
    variables: PromptVariables = {}
  ): Promise<string> {
    const promptConfig = await this.getPromptConfiguration(config, promptType);
    return TemplateEngine.substituteVariables(promptConfig.systemPrompt, variables);
  }
}
