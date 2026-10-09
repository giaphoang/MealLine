// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import { AIConfigurationType, ThinkingLevelValue } from '../types'

/**
 * Base configuration data shared by both API key and prompt configurations
 */
export interface BaseConfigData {
  name: string
  description: string
  temperature: number
  topP: number
  thinkingLevel?: ThinkingLevelValue | null
}

/**
 * API key configuration data extending base configuration
 */
export interface ApiKeyConfigData extends BaseConfigData {
  type: 'apikey'
  serviceType: 'OpenAI' | 'Anthropic' | 'Google' | 'Azure'
  model: string
  modelName: string
  customModel: string
  customModelName: string
  apiKey: string
  endpointUrl: string
  inputCost: number | null | undefined
  outputCost: number | null | undefined
  unitPrice: 'per_1k' | 'per_1m'
  inputTokenLimit: number | null | undefined
  outputTokenLimit: number | null | undefined
  dailyCostLimit: number | null | undefined
  monthlyCostLimit: number | null | undefined
  tokensPerMinute: number | null | undefined
  requestsPerMinute: number | null | undefined
  requestsPerDay: number | null | undefined
  /**
   * `null` means "no level chosen" — the backend then applies the cheapest
   * value the model accepts (D2), which is per-model and therefore not
   * something the dialog can work out for itself. Narrowing this away from
   * `BaseConfigData`'s nullable version is what forced the old hard-coded
   * `'high'` default.
   */
  thinkingLevel?: ThinkingLevelValue | null
  value: string
  isActive?: boolean
}

/**
 * Prompt configuration data extending base configuration
 */
export interface PromptConfigData extends BaseConfigData {
  type: 'prompt'
  promptCategory: string
  serviceDescription: string
  translationApproach: string
  contextGuidance: string
  additionalGuidance: string
  skipTranslationRules: string
  includeEnglishRules: string
  skipTranslationThreshold: number
  includeEnglishThreshold: number
  rememberFormattingChoices: boolean
  value: string
  isActive?: boolean
}



/**
 * Validation state interface
 */
export interface ValidationState {
  showValidation: boolean
  errors: {
    serviceType?: string
    model?: string
    modelName?: string
    apiKey?: string
    endpointUrl?: string
    name?: string
    value?: string
    description?: string
    promptCategory?: string
    selectedTemplate?: string
    temperature?: string
    topP?: string
  }
}



/**
 * Prompt category interface
 */
export interface PromptCategory {
  id: string
  name: string
  description: string
  icon: any
}

/**
 * Validation type for field validation
 */
export type ValidationType = 'required' | 'model' | 'apikey' | 'url' | 'name' | 'prompt'

/**
 * API key validation result
 */
export interface ApiKeyValidationResult {
  error?: string
  warning?: string
}

/**
 * Edit-specific form data for API key configurations
 */
export interface EditAIModelFormData {
  name: string
  description: string
  isActive: boolean
  modelName: string
  model: string
  customModelName: string
  customModel: string
  temperature: number
  topP: number
  // Cost tracking fields
  unitPrice: 'per_1k' | 'per_1m'
  inputCost: number | null | undefined
  outputCost: number | null | undefined
  // Usage limits fields
  tokensPerMinute: number | null | undefined
  requestsPerMinute: number | null | undefined
  requestsPerDay: number | null | undefined
  // Token limits fields
  inputTokenLimit: number | null | undefined
  outputTokenLimit: number | null | undefined
}

/**
 * Edit-specific form data for system prompt configurations
 */
export interface EditSystemPromptFormData {
  name: string
  description: string
  isActive: boolean
  temperature: number
  topP: number
  // SystemPrompt structured fields
  serviceDescription: string
  translationApproach: string
  contextGuidance: string
  additionalGuidance: string
  skipTranslation: string
  includeEnglish: string
  skipTranslationThreshold: number
  includeEnglishThreshold: number
  rememberFormattingChoices: boolean
}

/**
 * Validation errors for edit forms
 */
export interface EditValidationErrors {
  name?: string
  description?: string
  temperature?: string
  topP?: string
  modelName?: string
  model?: string
  inputCost?: string
  outputCost?: string
  tokensPerMinute?: string
  requestsPerMinute?: string
  requestsPerDay?: string
  inputTokenLimit?: string
  outputTokenLimit?: string
  serviceDescription?: string
  translationApproach?: string
  contextGuidance?: string
  additionalGuidance?: string
}

/**
 * Cache statistics for system prompts
 */
export interface CacheStatistics {
  totalEntries: number
  cacheSize: string
  lastUpdated: string
}

/**
 * Mode for step components
 */
export type StepMode = 'add' | 'edit'

/**
 * Base step component props
 */
export interface BaseStepProps<T = any> {
  mode: StepMode
  data: T
  onChange: (data: Partial<T>) => void
  isLoading?: boolean
  validation?: ValidationState
  onBlur?: (field: keyof T, type?: ValidationType) => void
}

/**
 * Service step props for API key configurations
 */
export interface ServiceStepProps extends BaseStepProps<ApiKeyConfigData> {
  serviceType?: 'OpenAI' | 'Anthropic' | 'Google' | 'Azure'
}

/**
 * API key step props
 */
export interface ApiKeyStepProps extends BaseStepProps<ApiKeyConfigData> {
  // Additional props specific to API key step if needed
}

/**
 * Cost step props
 */
export interface CostStepProps extends BaseStepProps<ApiKeyConfigData> {
  // Additional props specific to cost step if needed
}

/**
 * Token limits step props
 */
export interface TokenLimitsStepProps extends BaseStepProps<ApiKeyConfigData> {
  // Additional props specific to token limits step if needed
}

/**
 * Cost limits step props
 */
export interface CostLimitsStepProps extends BaseStepProps<ApiKeyConfigData> {
  // Additional props specific to cost limits step if needed
}

/**
 * Usage limits step props
 */
export interface UsageLimitsStepProps extends BaseStepProps<ApiKeyConfigData> {
  // Additional props specific to usage limits step if needed
}

/**
 * Parameters step props
 */
export interface ParametersStepProps extends BaseStepProps<ApiKeyConfigData | PromptConfigData> {
  // Additional props specific to parameters step if needed
}

/**
 * Name step props
 */
export interface NameStepProps extends BaseStepProps<BaseConfigData> {
  showActiveToggle?: boolean
  isActive?: boolean
  onActiveChange?: (active: boolean) => void
}

/**
 * Prompt configuration step props
 */
export interface PromptConfigStepProps extends BaseStepProps<PromptConfigData> {
  availableCategories?: PromptCategory[]
}

/**
 * Prompt thresholds step props
 */
export interface PromptThresholdsStepProps extends BaseStepProps<PromptConfigData> {
  // Additional props specific to thresholds step if needed
}

/**
 * Prompt category step props
 */
export interface PromptCategoryStepProps extends BaseStepProps<PromptConfigData> {
  availableCategories?: PromptCategory[]
}

/**
 * Prompt cache step props
 */
export interface PromptCacheStepProps extends BaseStepProps<PromptConfigData> {
  cacheStats?: CacheStatistics
  onClearCache?: () => void
}

/**
 * Tabbed prompt configuration step props
 */
export interface TabbedPromptConfigStepProps extends BaseStepProps<PromptConfigData> {
  mode?: 'add' | 'edit'
}

/**
 * Generic configuration data type
 */
export type ConfigData = ApiKeyConfigData | PromptConfigData

/**
 * Step definition for base dialog
 */
export interface StepDefinition<T> {
  id: string
  title: string
  description: string
  component: React.ComponentType<BaseStepProps<T> & any>
  validate?: (data: T) => boolean
  isOptional?: boolean
}

/**
 * Base dialog props
 */
export interface BaseDialogProps<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: StepMode
  title: string
  getSteps: (data: T) => StepDefinition<T>[]
  initialData: T
  onSave: (data: T) => Promise<boolean>
  isLoading?: boolean
  existingData?: any // For edit mode
}

/**
 * Dialog step state
 */
export interface DialogStepState {
  currentStep: number
  canProceed: boolean
  isValid: boolean
}
