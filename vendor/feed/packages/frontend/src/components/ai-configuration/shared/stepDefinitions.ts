// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import { ServiceStep } from '../steps/ServiceStep'
import { ApiKeyStep } from '../steps/ApiKeyStep'
import { CostStep } from '../steps/CostStep'
import { TokenLimitsStep } from '../steps/TokenLimitsStep'
import { CostLimitsStep } from '../steps/CostLimitsStep'
import { UsageLimitsStep } from '../steps/UsageLimitsStep'
import { ParametersStep } from '../steps/ParametersStep'
import { ThinkingLevelStep } from '../steps/ThinkingLevelStep'
import { NameStep } from '../steps/NameStep'
import { PromptCategoryStep } from '../steps/PromptCategoryStep'
import { TabbedPromptConfigStep } from '../steps/TabbedPromptConfigStep'
import { PromptThresholdsStep } from '../steps/PromptThresholdsStep'
import {
  StepDefinition,
  ApiKeyConfigData,
  PromptConfigData,
  ValidationType
} from './types'
import {
  validateField,
  validateApiKey
} from './validation'

/**
 * API Key configuration steps for Add mode
 */
export const createApiKeySteps = (mode: 'add' | 'edit'): StepDefinition<ApiKeyConfigData>[] => [
  {
    id: 'service',
    title: 'Service Configuration',
    description: 'Configure the AI service and model settings',
    component: ServiceStep,
    validate: (data) => {
      const effectiveModel = data.model === 'Custom' ? data.customModel : data.model
      const effectiveModelName = data.modelName === 'Custom' ? data.customModelName : data.modelName
      return !!(data.serviceType && effectiveModel.trim() && effectiveModelName.trim())
    }
  },
  {
    id: 'apikey',
    title: 'API Credentials',
    description: mode === 'add'
      ? 'Enter API credentials and endpoint'
      : 'Update API credentials',
    component: ApiKeyStep,
    validate: (data) => {
      // Edit: blank means "keep the current key", so there is nothing to
      // require. A typed value gets the same soft, non-blocking check on blur
      // that Add gets.
      if (mode === 'edit') return true
      const apiKeyResult = validateApiKey(data.apiKey)
      return !apiKeyResult.error && data.apiKey.trim().length > 0
    }
  },
  {
    id: 'cost',
    title: 'Cost Tracking',
    description: mode === 'add'
      ? 'Set cost tracking parameters'
      : 'Update cost tracking parameters',
    component: CostStep,
    isOptional: true
  },
  {
    id: 'tokenlimits',
    title: 'Token Limits',
    description: 'Configure input and output token limits',
    component: TokenLimitsStep,
    isOptional: true
  },
  {
    id: 'costlimits',
    title: 'Cost Limits',
    description: 'Configure daily and monthly cost limits',
    component: CostLimitsStep,
    isOptional: true
  },
  {
    id: 'limits',
    title: 'Usage Limits',
    description: 'Record provider allowances',
    component: UsageLimitsStep,
    isOptional: true
  },
  {
    id: 'parameters',
    title: 'AI Parameters',
    description: 'Configure AI behavior parameters',
    component: ParametersStep,
    isOptional: true
  },
  {
    id: 'thinkinglevel',
    title: 'Thinking Level',
    description: 'Configure model thinking',
    component: ThinkingLevelStep,
    isOptional: true
  },
  {
    id: 'name',
    title: 'Configuration Details',
    description: mode === 'add'
      ? 'Name your configuration and add details'
      : 'Update configuration name and details',
    component: NameStep,
    validate: (data) => {
      return data.name.trim().length >= 3
    }
  }
]

/**
 * System Prompt configuration steps for Add mode
 */
export const createSystemPromptSteps = (mode: 'add' | 'edit'): StepDefinition<PromptConfigData>[] => [
  {
    id: 'promptcategory',
    title: 'Prompt Category',
    description: 'Select the category that best fits your prompt purpose',
    component: PromptCategoryStep,
    validate: (data) => {
      return !!data.promptCategory
    }
  },
  {
    id: 'configuration',
    title: 'Translation Customization',
    description: 'Customize your translation prompt with specific guidance',
    component: TabbedPromptConfigStep,
    validate: (data) => {
      if (data.promptCategory === 'classification') {
        // Classification prompts require skip/include rules
        return !!(data.skipTranslationRules.trim() || data.includeEnglishRules.trim())
      } else {
        // Translation prompts require customization fields
        return !!(data.serviceDescription.trim() || 
                 data.translationApproach.trim() || 
                 data.contextGuidance.trim() || 
                 data.additionalGuidance.trim())
      }
    }
  },
  {
    id: 'thresholds',
    title: 'Classification Settings',
    description: 'Configure classification thresholds and cache behavior',
    component: PromptThresholdsStep,
    isOptional: true
  },
  {
    id: 'parameters',
    title: 'Performance Parameters',
    description: 'Configure AI behavior and response characteristics',
    component: ParametersStep,
    isOptional: true
  },
  {
    id: 'name',
    title: 'Configuration Details',
    description: mode === 'add'
      ? 'Name your configuration and add details'
      : 'Update configuration name and details',
    component: NameStep,
    validate: (data) => {
      return data.name.trim().length >= 3
    }
  }
]

/**
 * Helper function to filter steps based on prompt category
 */
export const getFilteredPromptSteps = (
  steps: StepDefinition<PromptConfigData>[], 
  promptCategory: string
): StepDefinition<PromptConfigData>[] => {
  if (promptCategory === 'classification') {
    // For classification prompts: category → configuration → thresholds → name
    return steps.filter(step => 
      ['promptcategory', 'configuration', 'thresholds', 'name'].includes(step.id)
    )
  } else {
    // For translation prompts: category → configuration → parameters → name
    return steps.filter(step => 
      ['promptcategory', 'configuration', 'parameters', 'name'].includes(step.id)
    )
  }
}
