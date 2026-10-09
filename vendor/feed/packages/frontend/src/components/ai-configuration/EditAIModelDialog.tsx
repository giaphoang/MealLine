// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import { BaseAIConfigDialog } from './shared/BaseAIConfigDialog'
import { createApiKeySteps } from './shared/stepDefinitions'
import { ApiKeyConfigData } from './shared/types'
import { AIConfiguration } from './types'

interface EditAIModelDialogProps {
  open: boolean
  configuration: AIConfiguration | null
  onOpenChange: (open: boolean) => void
  onSave: (data: Partial<AIConfiguration>) => Promise<boolean>
  isLoading?: boolean
}

export function EditAIModelDialog({
  open,
  configuration,
  onOpenChange,
  onSave,
  isLoading = false
}: EditAIModelDialogProps) {
  const initialData = React.useMemo<ApiKeyConfigData | null>(() => {
    if (!configuration || configuration.type !== 'apikey') return null

    return {
      type: 'apikey',
      serviceType: configuration.serviceType || 'OpenAI',
      model: configuration.model || '',
      modelName: configuration.modelName || '',
      customModel: '',
      customModelName: '',
      apiKey: '', // Write-only: the API never returns it, so there is nothing to prefill
      endpointUrl: configuration.endpointUrl || '',
      inputCost: configuration.inputCost,
      outputCost: configuration.outputCost,
      unitPrice: configuration.unitPrice || 'per_1m',
      inputTokenLimit: configuration.inputTokenLimit,
      outputTokenLimit: configuration.outputTokenLimit ?? configuration.maxTokens,
      dailyCostLimit: configuration.dailyCostLimit,
      monthlyCostLimit: configuration.monthlyCostLimit,
      tokensPerMinute: configuration.tokensPerMinute,
      requestsPerMinute: configuration.requestsPerMinute,
      requestsPerDay: configuration.requestsPerDay,
      name: configuration.name || '',
      description: configuration.description || '',
      value: '',
      temperature: configuration.temperature || 0.7,
      topP: configuration.topP || 1.0,
      thinkingLevel: configuration.thinkingLevel ?? undefined,
      isActive: configuration.isActive
    }
  }, [configuration])

  const existingData = React.useMemo(() => {
    if (!configuration || configuration.type !== 'apikey') return null

    return {
      name: configuration.name,
      description: configuration.description,
      isActive: configuration.isActive,
      modelName: configuration.modelName,
      model: configuration.model,
      temperature: configuration.temperature,
      topP: configuration.topP,
      thinkingLevel: configuration.thinkingLevel,
      unitPrice: configuration.unitPrice,
      inputCost: configuration.inputCost,
      outputCost: configuration.outputCost,
      dailyCostLimit: configuration.dailyCostLimit,
      monthlyCostLimit: configuration.monthlyCostLimit,
      tokensPerMinute: configuration.tokensPerMinute,
      requestsPerMinute: configuration.requestsPerMinute,
      requestsPerDay: configuration.requestsPerDay,
      inputTokenLimit: configuration.inputTokenLimit,
      outputTokenLimit: configuration.outputTokenLimit ?? configuration.maxTokens
    }
  }, [configuration])

  if (!configuration || configuration.type !== 'apikey' || !initialData || !existingData) {
    return null
  }

  const handleSave = async (data: ApiKeyConfigData): Promise<boolean> => {
    const updateData: Partial<AIConfiguration> = {
      name: data.name.trim(),
      description: data.description.trim() || undefined,
      modelName: data.modelName === 'Custom' ? data.customModelName.trim() : data.modelName,
      model: data.model === 'Custom' ? data.customModel.trim() : data.model,
      unitPrice: data.unitPrice,
      inputCost: data.inputCost,
      outputCost: data.outputCost,
      inputTokenLimit: data.inputTokenLimit,
      outputTokenLimit: data.outputTokenLimit,
      dailyCostLimit: data.dailyCostLimit,
      monthlyCostLimit: data.monthlyCostLimit,
      tokensPerMinute: data.tokensPerMinute,
      requestsPerMinute: data.requestsPerMinute,
      requestsPerDay: data.requestsPerDay,
      maxTokens: data.outputTokenLimit,
      temperature: data.temperature,
      topP: data.topP,
      thinkingLevel: data.thinkingLevel,
      isActive: data.isActive
    }

    // Only send a key the administrator actually typed. Sending an empty string
    // would re-encrypt nothing over a working key; omitting the field entirely
    // is what tells the backend to leave the stored one alone.
    const apiKey = data.apiKey.trim()
    if (apiKey) {
      updateData.apiKey = apiKey
    }

    return await onSave(updateData)
  }

  return (
    <BaseAIConfigDialog<ApiKeyConfigData>
      open={open}
      onOpenChange={onOpenChange}
      mode="edit"
      title="AI Model Configuration"
      getSteps={() => createApiKeySteps('edit')}
      initialData={initialData}
      onSave={handleSave}
      isLoading={isLoading}
      existingData={existingData}
    />
  )
}
