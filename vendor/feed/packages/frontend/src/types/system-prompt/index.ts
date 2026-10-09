// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

export type PromptType = 'FOOD_TRANSLATION' | 'CUSTOM_TRANSLATION' | 'BATCH_TRANSLATION' | 'CLASSIFICATION';

export interface SystemPrompt {
  id: number;
  name: string;
  promptType: PromptType;
  isActive: boolean;
  isDefault: boolean;
  description?: string;
  serviceDescription?: string;
  translationApproach?: string;
  contextGuidance?: string;
  additionalGuidance?: string;
  skipTranslation?: string;
  includeEnglish?: string;
  skipTranslationThreshold?: number;
  includeEnglishThreshold?: number;
  rememberFormattingChoices?: boolean;
  temperature?: number;
  topP?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSystemPromptData {
  name: string;
  promptType: PromptType;
  isActive?: boolean;
  isDefault?: boolean;
  description?: string;
  serviceDescription?: string;
  translationApproach?: string;
  contextGuidance?: string;
  additionalGuidance?: string;
  skipTranslation?: string;
  includeEnglish?: string;
  skipTranslationThreshold?: number;
  includeEnglishThreshold?: number;
  rememberFormattingChoices?: boolean;
  temperature?: number;
  topP?: number;
}

export interface UpdateSystemPromptData extends CreateSystemPromptData {
  id: number;
}

export interface BulkSystemPromptOperationResult {
  success: number;
  failed: number;
  errors: string[];
}

export const SYSTEM_PROMPT_VALIDATION = {
  MIN_NAME_LENGTH: 3,
  MAX_NAME_LENGTH: 100,
  MIN_THRESHOLD: 0.1,
  MAX_THRESHOLD: 1.0,
  MIN_TEMPERATURE: 0.0,
  MAX_TEMPERATURE: 2.0,
  MIN_TOP_P: 0.0,
  MAX_TOP_P: 1.0,
} as const;

export const PROMPT_TYPE_LABELS: Record<PromptType, string> = {
  FOOD_TRANSLATION: 'Food Items & Categories Translation',
  CUSTOM_TRANSLATION: 'Custom Text Translation',
  BATCH_TRANSLATION: 'Document Text Translation',
  CLASSIFICATION: 'Document Auto-Format Rules',
} as const;

export const PROMPT_TYPE_DESCRIPTIONS: Record<PromptType, string> = {
  FOOD_TRANSLATION: 'Instructions for translating inventory database entries (food items, category names)',
  CUSTOM_TRANSLATION: 'Instructions for translating user-generated content and administrative text',
  BATCH_TRANSLATION: 'Instructions for translating text segments extracted from DOCX files',
  CLASSIFICATION: 'Configure when to apply "Don\'t Translate" and "Include English" options based on content analysis',
} as const;
