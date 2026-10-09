// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import { BaseAIConfigDialog } from './shared/BaseAIConfigDialog'
import { createSystemPromptSteps, getFilteredPromptSteps } from './shared/stepDefinitions'
import { PromptConfigData } from './shared/types'
import { SystemPromptService } from '@/services/system-prompt'
import { PromptType } from '@/types/system-prompt'
import { useMessage } from '@/hooks/message/useMessage'

interface AddSystemPromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => Promise<boolean>
  isLoading?: boolean
}

export function AddSystemPromptDialog({
  open,
  onOpenChange,
  onSave,
  isLoading
}: AddSystemPromptDialogProps) {
  const { showMessage } = useMessage()

  const initialData: PromptConfigData = {
    type: 'prompt',
    name: '',
    description: '',
    temperature: 0.7,
    topP: 1.0,
    promptCategory: '',
    serviceDescription: '',
    translationApproach: '',
    contextGuidance: '',
    additionalGuidance: '',
    skipTranslationRules: '',
    includeEnglishRules: '',
    skipTranslationThreshold: 0.7,
    includeEnglishThreshold: 0.7,
    rememberFormattingChoices: true,
    value: '',
    isActive: true
  }

  // Map frontend prompt categories to backend PromptType enum
  const mapPromptCategory = (category: string): PromptType => {
    switch (category) {
      case 'food_translation':
        return 'FOOD_TRANSLATION'
      case 'custom_translation':
        return 'CUSTOM_TRANSLATION'
      case 'batch_translation':
        return 'BATCH_TRANSLATION'
      case 'classification':
        return 'CLASSIFICATION'
      default:
        return 'FOOD_TRANSLATION'
    }
  }

  const handleSave = async (data: PromptConfigData): Promise<boolean> => {
    try {
      const systemPromptService = new SystemPromptService()
      const promptType = mapPromptCategory(data.promptCategory)
      
      const createData = {
        name: data.name,
        promptType,
        isActive: true,
        isDefault: false,
        description: data.description?.trim() || undefined,
        serviceDescription: data.serviceDescription || undefined,
        translationApproach: data.translationApproach || undefined,
        contextGuidance: data.contextGuidance || undefined,
        additionalGuidance: data.additionalGuidance || undefined,
        skipTranslation: data.skipTranslationRules || undefined,
        includeEnglish: data.includeEnglishRules || undefined,
        skipTranslationThreshold: data.skipTranslationThreshold,
        includeEnglishThreshold: data.includeEnglishThreshold,
        rememberFormattingChoices: data.rememberFormattingChoices,
        temperature: data.temperature,
        topP: data.topP
      }
      
      await systemPromptService.createSystemPrompt(createData)
      showMessage('System prompt created successfully', 'success')
      return await onSave()
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Failed to create system prompt', 'error')
      return false
    }
  }

  // Filter steps based on selected prompt category dynamically
  const getStepsForCategory = (data: PromptConfigData) => {
    const allSteps = createSystemPromptSteps('add')
    if (!data.promptCategory) return allSteps
    return getFilteredPromptSteps(allSteps, data.promptCategory)
  }

  return (
    <BaseAIConfigDialog<PromptConfigData>
      open={open}
      onOpenChange={onOpenChange}
      mode="add"
      title="System Prompt"
      getSteps={getStepsForCategory}
      initialData={initialData}
      onSave={handleSave}
      isLoading={isLoading}
    />
  )
}
