// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Choosing a service and a model.
 *
 * The lists come from `GET /api/ai-config/models` rather than from a second
 * copy of the catalogue (ISSUES.md #84). That copy also shaped this file: with
 * the models in three separate exported arrays, every question had to be asked
 * three times, and the component carried four parallel triplications — a
 * Model Name select per provider, a Model select per provider, and a
 * three-armed switch in each of two handlers. One list filtered by provider
 * removes all four.
 *
 * The step stays usable before the catalogue arrives, and if it never does.
 * An empty list falls back to the free-text inputs that Azure and Custom have
 * always used, so navigation never waits on a request — the configuration
 * wizard's own tests click straight through this step to reach later ones.
 */

import React from 'react'
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Bot } from "@/components/ui/icons";
import { StepWrapper } from '../shared/StepWrapper'
import { ServiceStepProps } from '../shared/types'
import type { CatalogueModel } from '../types'
import { getServiceEndpoint } from '../service-endpoints'
import { noticesFor } from '../model-notices'
import { useModelCatalogue } from '@/hooks/ai-config/useModelCatalogue'
import { useEnabledLanguages } from '@/hooks/language/useEnabledLanguages'

const CUSTOM = 'Custom'

export function ServiceStep({
  mode,
  data,
  onChange,
  isLoading = false,
  validation,
  onBlur
}: ServiceStepProps) {
  const { models } = useModelCatalogue()
  const { languages: enabledLanguages } = useEnabledLanguages()

  const modelsFor = (serviceType: string): CatalogueModel[] =>
    models.filter((entry) => entry.provider === serviceType)

  const available = modelsFor(data.serviceType)

  /** The cost and limit fields a chosen model pre-fills. */
  const specFor = (entry: CatalogueModel | undefined) =>
    entry
      ? {
          inputCost: entry.pricing.input,
          outputCost: entry.pricing.output,
          unitPrice: 'per_1m' as const,
          inputTokenLimit: entry.contextWindow,
          outputTokenLimit: entry.maxOutputTokens,
          tokensPerMinute: entry.rateLimits?.tokensPerMinute,
          requestsPerMinute: entry.rateLimits?.requestsPerMinute,
          requestsPerDay: entry.rateLimits?.requestsPerDay
        }
      : {}

  // The Add dialog opens with a model already selected, but the catalogue that
  // prices it arrives a moment later — so the costs it would have pre-filled
  // never get applied and the administrator reaches the Cost step to find it
  // blank. Fill them once, when the catalogue lands, and only when nothing has
  // been entered: an edit must never have its stored costs overwritten.
  const hydrated = React.useRef(false)
  React.useEffect(() => {
    if (hydrated.current || mode !== 'add' || models.length === 0) return
    if (data.inputCost !== undefined && data.inputCost !== null) return
    const entry = available.find((candidate) => candidate.id === data.model)
    if (!entry) return
    hydrated.current = true
    onChange(specFor(entry))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the catalogue first arrives
  }, [models])

  const handleServiceTypeChange = (value: 'OpenAI' | 'Anthropic' | 'Google') => {
    const first = modelsFor(value)[0]
    onChange({
      serviceType: value,
      modelName: first?.displayName ?? '',
      model: first?.id ?? '',
      customModelName: '',
      customModel: '',
      endpointUrl: getServiceEndpoint(value),
      ...specFor(first)
    })
  }

  const handleModelNameChange = (value: string) => {
    if (value === CUSTOM) {
      onChange({ modelName: CUSTOM })
      return
    }
    const entry = available.find((candidate) => candidate.displayName === value)
    onChange({
      modelName: value,
      ...(entry ? { model: entry.id, ...specFor(entry) } : {})
    })
  }

  const handleModelChange = (value: string) => {
    if (value === CUSTOM) {
      onChange({ model: CUSTOM })
      return
    }
    const entry = available.find((candidate) => candidate.id === value)
    onChange({
      model: value,
      ...(entry ? { modelName: entry.displayName, ...specFor(entry) } : {})
    })
  }

  const modelNameError = validation?.showValidation && validation?.errors?.modelName
  const modelError = validation?.showValidation && validation?.errors?.model

  // What the chosen model is worth saying out loud: how much life it has left
  // (D26 for previews, defect 10 for the rest) and whether it costs far more
  // than this work needs (D1/D7). Both are advisory — an administrator may
  // spend their budget as they see fit — and a model can warrant both at once,
  // as `gpt-5.6-sol` does, being active and frontier together.
  const chosen = available.find((entry) => entry.id === data.model)
  const notices = data.model === CUSTOM ? [] : noticesFor(chosen)
  const unsupportedEnabledLanguages = chosen
    ? enabledLanguages
        .filter((language) => language.isEnabled && chosen.languages?.[language.name] === 'unsupported')
        .map((language) => language.name)
    : []

  return (
    <StepWrapper
      icon={Bot}
      title="Service Configuration"
      description="Configure the AI service and model settings"
    >
      <div className="space-y-2">
        <Label htmlFor="serviceType">Service Type</Label>
        {mode === 'edit' ? (
          <>
            <Input
              id="serviceType"
              value={data.serviceType}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Service type cannot be changed when editing
            </p>
          </>
        ) : (
          <Select
            value={data.serviceType}
            onValueChange={handleServiceTypeChange}
          >
            <SelectTrigger id="serviceType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Anthropic">Anthropic</SelectItem>
              <SelectItem value="Google">Google (Default)</SelectItem>
              <SelectItem value="OpenAI">OpenAI</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="modelName">Model Name</Label>
        {available.length > 0 ? (
          <>
            <Select value={data.modelName} onValueChange={handleModelNameChange}>
              <SelectTrigger id="modelName">
                <SelectValue placeholder="Select model name" />
              </SelectTrigger>
              <SelectContent>
                {available.map((entry) => (
                  <SelectItem key={entry.id} value={entry.displayName}>
                    {entry.displayName}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>{CUSTOM}</SelectItem>
              </SelectContent>
            </Select>
            {data.modelName === CUSTOM && (
              <Input
                value={data.customModelName}
                onChange={(e) => onChange({ customModelName: e.target.value })}
                onBlur={() => onBlur?.('customModelName')}
                placeholder="Enter custom model name"
                disabled={isLoading}
                className={`mt-2 ${modelNameError ? 'border-destructive' : ''}`}
              />
            )}
          </>
        ) : (
          <Input
            id="modelName"
            value={data.modelName}
            onChange={(e) => onChange({ modelName: e.target.value })}
            onBlur={() => onBlur?.('modelName')}
            placeholder="Display name for model"
            disabled={isLoading}
            className={`${modelNameError ? 'border-destructive' : ''}`}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Human-readable name for identification
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="model">Model</Label>
        {available.length > 0 ? (
          <>
            <Select value={data.model} onValueChange={handleModelChange}>
              <SelectTrigger id="model">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {available.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.id}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>{CUSTOM}</SelectItem>
              </SelectContent>
            </Select>
            {data.model === CUSTOM && (
              <Input
                value={data.customModel}
                onChange={(e) => onChange({ customModel: e.target.value })}
                onBlur={() => onBlur?.('customModel', 'model')}
                placeholder="Enter custom model identifier"
                disabled={isLoading}
                className={`mt-2 ${modelError ? 'border-destructive' : ''}`}
              />
            )}
          </>
        ) : (
          <Input
            id="model"
            value={data.model}
            onChange={(e) => onChange({ model: e.target.value })}
            onBlur={() => onBlur?.('model', 'model')}
            placeholder="Enter model identifier"
            disabled={isLoading}
            className={`${modelError ? 'border-destructive' : ''}`}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Exact model identifier as provided by the AI service
        </p>
        {notices.map((notice) => (
          <p
            key={notice.label}
            role="note"
            className={
              notice.tone === 'danger'
                ? 'text-xs text-destructive'
                : 'text-xs text-[var(--status-warning-text)]'
            }
          >
            {notice.detail}
          </p>
        ))}
        {unsupportedEnabledLanguages.length > 0 && (
          <p role="note" className="text-xs text-destructive">
            This model does not support these enabled languages: {unsupportedEnabledLanguages.join(', ')}.
          </p>
        )}
      </div>
    </StepWrapper>
  )
}
