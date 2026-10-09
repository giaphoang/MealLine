// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { SystemPrompt } from '@prisma/client';

// Define local type for database prompt types
type PromptType = string;

export type TranslationContext = 'food' | 'custom' | 'document' | 'classification';

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  requiredSlots: string[];
  optionalSlots: string[];
  context: TranslationContext;
}

export interface PromptVariables {
  targetLanguage?: string;
  instructions?: string;
  specialInstructions?: string;
  [key: string]: any;
}

export interface ValidationResult {
  isValid: boolean;
  missingRequired: string[];
  errors: string[];
}

/**
 * Structured prompt templates with essential operational elements preserved
 * and user customization slots for safe interpolation
 */
const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  FOOD_TRANSLATION: {
    id: 'FOOD_TRANSLATION',
    name: 'Food Items & Categories Translation',
    template: `You are a translation service for a nonprofit food pantry specializing in food inventory. {serviceDescription}
Translate to {{targetLanguage}} using {translationApproach}. In food pantry contexts, prioritize standard terminology native speakers expect (e.g., "Turkey" refers to meat, not country). {contextGuidance}
Your response must be a valid JSON string containing only a "translatedText" field.
{additionalGuidance} Never refuse to translate unless the content is inappropriate.`,
    requiredSlots: ['translationApproach'],
    optionalSlots: ['serviceDescription', 'contextGuidance', 'additionalGuidance'],
    context: 'food'
  },
  
  CUSTOM_TRANSLATION: {
    id: 'CUSTOM_TRANSLATION',
    name: 'Custom Text Translation',
    template: `You are a translation service for a nonprofit food pantry. {serviceDescription}
Translate to {{targetLanguage}} using {translationApproach}. {contextGuidance}
Your response must be a valid JSON string containing only a "translatedText" field.
{additionalGuidance} Never refuse to translate unless the content is inappropriate.`,
    requiredSlots: ['translationApproach'],
    optionalSlots: ['serviceDescription', 'contextGuidance', 'additionalGuidance'],
    context: 'custom'
  },
  
  BATCH_TRANSLATION: {
    id: 'BATCH_TRANSLATION', 
    name: 'Document Text Translation',
    template: `You are a translation service for a nonprofit food pantry. {serviceDescription}
Translate each text segment to {{targetLanguage}} using {translationApproach}. {contextGuidance}
Return valid JSON with an array of translations in the same order as input.
Each translation must have the exact translatedText field. {additionalGuidance}`,
    requiredSlots: ['translationApproach'],
    optionalSlots: ['serviceDescription', 'contextGuidance', 'additionalGuidance'],
    context: 'document'
  },
  
  CLASSIFICATION: {
    id: 'CLASSIFICATION',
    name: 'Document Auto-Format Rules',
    template: `You are a text classifier. Rate each text segment's similarity to these descriptions on a scale of 0.0 to 1.0:
Description A: {skipTranslation}
Description B: {includeEnglish}
Rate each segment independently for both descriptions. Low scores for both descriptions are acceptable.
Respond with valid JSON containing an array of classifications with id, a, and b (0-1).`,
    requiredSlots: [],
    optionalSlots: ['skipTranslation', 'includeEnglish'],
    context: 'classification'
  }
};

/**
 * Template engine for constructing AI prompts with structured templates
 * that preserve essential operational elements while allowing user customization
 */
export class TemplateEngine {
  /**
   * Get prompt template by PromptType
   */
  static getTemplate(promptType: PromptType): PromptTemplate {
    const template = PROMPT_TEMPLATES[promptType];
    if (!template) {
      throw new Error(`No template found for prompt type: ${promptType}`);
    }
    return template;
  }

  /**
   * Interpolate user fields into template slots
   */
  static interpolateTemplate(templateId: string, userFields: SystemPrompt): string {
    const template = PROMPT_TEMPLATES[templateId];
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    let result = template.template;

    // Map SystemPrompt fields to template slots
    const fieldMapping: Record<string, string | null> = {
      '{serviceDescription}': userFields.serviceDescription || '',
      '{translationApproach}': userFields.translationApproach || 'the closest natural equivalent',
      '{contextGuidance}': userFields.contextGuidance || '',
      '{additionalGuidance}': userFields.additionalGuidance || '',
      '{skipTranslation}': userFields.skipTranslation || '',
      '{includeEnglish}': userFields.includeEnglish || ''
    };

    // Replace slots with user content or remove empty slots
    for (const [slot, value] of Object.entries(fieldMapping)) {
      if (value && value.trim()) {
        result = result.replace(new RegExp(`\\${slot}`, 'g'), value);
      } else {
        // Remove empty slots and clean up extra whitespace
        result = result.replace(new RegExp(`\\${slot}\\s*`, 'g'), '');
      }
    }

    // Clean up multiple spaces and line breaks
    result = result.replace(/\s+/g, ' ').trim();
    
    return result;
  }

  /**
   * Validate that required slots have content in user fields
   */
  static validateSlots(templateId: string, userFields: SystemPrompt): ValidationResult {
    const template = PROMPT_TEMPLATES[templateId];
    if (!template) {
      return {
        isValid: false,
        missingRequired: [],
        errors: [`Template not found: ${templateId}`]
      };
    }

    const missingRequired: string[] = [];
    const errors: string[] = [];

    // Check required slots
    for (const slot of template.requiredSlots) {
      switch (slot) {
        case 'translationApproach':
          if (!userFields.translationApproach?.trim()) {
            missingRequired.push('translationApproach');
          }
          break;
        case 'serviceDescription':
          if (!userFields.serviceDescription?.trim()) {
            missingRequired.push('serviceDescription');
          }
          break;
        case 'contextGuidance':
          if (!userFields.contextGuidance?.trim()) {
            missingRequired.push('contextGuidance');
          }
          break;
      }
    }

    const isValid = missingRequired.length === 0 && errors.length === 0;

    return {
      isValid,
      missingRequired,
      errors
    };
  }

  /**
   * Substitute variables in template using {{variable}} syntax
   */
  static substituteVariables(template: string, variables: PromptVariables): string {
    let result = template;
    
    for (const [key, value] of Object.entries(variables)) {
      if (value !== undefined && value !== null) {
        const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(pattern, String(value));
      }
    }
    
    return result;
  }

  /**
   * Get all available template IDs
   */
  static getAvailableTemplates(): string[] {
    return Object.keys(PROMPT_TEMPLATES);
  }

  /**
   * Get template by context type
   */
  static getTemplateByContext(context: TranslationContext): PromptTemplate | null {
    for (const template of Object.values(PROMPT_TEMPLATES)) {
      if (template.context === context) {
        return template;
      }
    }
    return null;
  }

  /**
   * Preview template with sample data for testing
   */
  static previewTemplate(templateId: string, sampleData?: Partial<SystemPrompt>): string {
    const template = PROMPT_TEMPLATES[templateId];
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const mockFields: SystemPrompt = {
      id: 1,
      name: 'Preview',
      promptType: templateId as PromptType,
      isActive: true,
      isDefault: false,
      description: sampleData?.description ?? null,
      serviceDescription: sampleData?.serviceDescription || '[Service Description]',
      translationApproach: sampleData?.translationApproach || '[Translation Approach]',
      contextGuidance: sampleData?.contextGuidance || '[Context Guidance]',
      additionalGuidance: sampleData?.additionalGuidance || '[Additional Guidance]',
      skipTranslation: sampleData?.skipTranslation || '[Skip Translation Rules]',
      includeEnglish: sampleData?.includeEnglish || '[Include English Rules]',
      skipTranslationThreshold: 0.7,
      includeEnglishThreshold: 0.7,
      rememberFormattingChoices: sampleData?.rememberFormattingChoices ?? true,
      temperature: sampleData?.temperature ?? 0.7,
      topP: sampleData?.topP ?? 1.0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return this.interpolateTemplate(templateId, mockFields);
  }

  /**
   * Validate template interpolation safety
   */
  static validateTemplateOutput(output: string): boolean {
    // Check for dangerous patterns that might indicate injection
    const dangerousPatterns = [
      /ignore\s+previous\s+instructions/i,
      /system\s*:\s*you\s+are\s+now/i,
      /forget\s+everything/i,
      /<\s*script/i,
      /javascript:/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(output)) {
        console.warn('[TemplateEngine] Potential prompt injection detected in template output');
        return false;
      }
    }

    // Check that essential elements are present
    const requiredElements = [
      /JSON/i  // JSON response format requirement
    ];

    // Check for operation-specific requirements
    const hasTranslateOperation = /translate/i.test(output);
    const hasClassifyOperation = /classif/i.test(output);
    
    if (!hasTranslateOperation && !hasClassifyOperation) {
      console.warn('[TemplateEngine] Neither translate nor classify operation found in template output');
      return false;
    }

    for (const element of requiredElements) {
      if (!element.test(output)) {
        console.warn('[TemplateEngine] Essential element missing from template output');
        return false;
      }
    }

    return true;
  }
}
