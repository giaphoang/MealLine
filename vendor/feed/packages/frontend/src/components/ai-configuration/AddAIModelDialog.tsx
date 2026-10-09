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
import type { ThinkingLevelValue } from './types'
import { getServiceEndpoint } from './service-endpoints'

interface AddAIModelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: {
    name: string
    type: 'apikey'
    value: string
    description?: string
    modelName?: string
    model?: string
    serviceType?: 'OpenAI' | 'Anthropic' | 'Google' | 'Azure'
    endpointUrl?: string
    apiKey?: string
    inputCost?: number
    outputCost?: number
    inputTokenLimit?: number
    outputTokenLimit?: number
    dailyCostLimit?: number
    monthlyCostLimit?: number
    temperature?: number
    topP?: number
    thinkingLevel?: ThinkingLevelValue | null
    tokensPerMinute?: number
    requestsPerMinute?: number
    requestsPerDay?: number
    unitPrice?: 'per_1k' | 'per_1m'
  }) => Promise<boolean>
  isLoading?: boolean
}

export function AddAIModelDialog({
  open,
  onOpenChange,
  onSave,
  isLoading
}: AddAIModelDialogProps) {
  const initialData = React.useMemo<ApiKeyConfigData>(() => {
    // Costs and limits are left unset here on purpose. They used to be read
    // from the duplicated `model-specs.ts`; the catalogue that replaces it is
    // fetched, and this runs synchronously before any request. `ServiceStep`
    // fills them in as soon as the catalogue arrives, and again whenever a
    // different model is chosen.
    const defaultServiceType: ApiKeyConfigData['serviceType'] = 'Google'
    // Was `gemini-2.5-flash-lite` — the model Google refuses to new projects,
    // whose 404 is what ISSUES.md #84 was reported for. Every configuration
    // created since then started out pointed at it.
    const defaultModelName = 'gemini-3.5-flash-lite'

    return {
      type: 'apikey',
      serviceType: defaultServiceType,
      model: defaultModelName,
      modelName: defaultModelName,
      customModel: '',
      customModelName: '',
      apiKey: '',
      endpointUrl: getServiceEndpoint(defaultServiceType),
      inputCost: undefined,
      outputCost: undefined,
      unitPrice: 'per_1m',
      inputTokenLimit: undefined,
      outputTokenLimit: undefined,
      dailyCostLimit: undefined,
      monthlyCostLimit: undefined,
      tokensPerMinute: undefined,
      requestsPerMinute: undefined,
      requestsPerDay: undefined,
      name: '',
      description: '',
      value: '',
      temperature: 0.7,
      topP: 1.0,
      // Unset, not `high`. The backend resolves an unset level to the cheapest
      // the chosen model accepts (D2) — which is `low` for a model that cannot
      // turn thinking off, and nothing at all for a model with no reasoning
      // control. Defaulting to `high` here sent `reasoning_effort: high` on
      // every new GPT-5 configuration; production's own gpt-5-mini runs at
      // minimal.
      thinkingLevel: null,
      isActive: true
    }
  }, [])

  const handleSave = async (data: ApiKeyConfigData): Promise<boolean> => {
    return onSave({
      name: data.name,
      type: 'apikey',
      value: '',
      description: data.description || undefined,
      // Trimmed, as Edit has always done. Add saved them raw, so a custom id
      // pasted with a trailing space was stored with it and every request for
      // that model failed (ISSUES.md #84).
      modelName: data.modelName === 'Custom' ? data.customModelName.trim() : data.modelName,
      model: data.model === 'Custom' ? data.customModel.trim() : data.model,
      serviceType: data.serviceType,
      endpointUrl: data.endpointUrl,
      apiKey: data.apiKey,
      inputCost: data.inputCost,
      outputCost: data.outputCost,
      inputTokenLimit: data.inputTokenLimit,
      outputTokenLimit: data.outputTokenLimit,
      dailyCostLimit: data.dailyCostLimit,
      monthlyCostLimit: data.monthlyCostLimit,
      temperature: data.temperature,
      topP: data.topP,
      thinkingLevel: data.thinkingLevel,
      tokensPerMinute: data.tokensPerMinute,
      requestsPerMinute: data.requestsPerMinute,
      requestsPerDay: data.requestsPerDay,
      unitPrice: data.unitPrice
    })
  }

  return (
    <BaseAIConfigDialog<ApiKeyConfigData>
      open={open}
      onOpenChange={onOpenChange}
      mode="add"
      title="AI Model Configuration"
      getSteps={() => createApiKeySteps('add')}
      initialData={initialData}
      onSave={handleSave}
      isLoading={isLoading}
    />
  )
}
