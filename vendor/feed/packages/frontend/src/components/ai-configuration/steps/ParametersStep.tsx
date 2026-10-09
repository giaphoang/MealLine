// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Temperature and top-p, offered only where the chosen model accepts them.
 *
 * D3 requires model-parameter constraints to be enforced "in both backend and
 * UI, so a forbidden parameter can never reach a request". The backend half
 * has been true for a while: all three providers pass the merged value
 * through `checkAndOverrideParameters`, which consults the model's catalogue
 * capabilities, so nothing forbidden is sent. The UI half was not — these two
 * sliders rendered for every model, including the eleven catalogue entries
 * whose `sampling` is `unsupported`, inviting staff to set a value the model
 * refuses outright and FEED then silently drops.
 *
 * The three cases mirror the three backend resolvers exactly:
 *
 * - `unsupported` — Claude 4.6+ and the GPT-5 line reject these parameters,
 *   so nothing is offered.
 * - `temperature-or-top-p` — Claude 4.5 takes one, never both; the backend
 *   keeps temperature and drops top-p, so only temperature is offered.
 * - `fixedTemperature` — Gemini 3.x accepts a temperature and then FEED
 *   replaces it with the pinned value. `sampling` stays `supported` because
 *   Google's guidance is advice rather than refusal, but the administrator's
 *   number is still discarded, so the control shows what will actually be
 *   used rather than pretending to take an instruction. Top-p is untouched
 *   for these models and stays editable.
 *
 * Following `ThinkingLevelStep`: an absent catalogue entry is never grounds
 * for hiding a control. A Custom id, a request that has not returned, and a
 * system prompt — which carries its own temperature but has no model, since
 * the same prompt may be used with any configuration — all render exactly as
 * before. The UI can only gate the controls it owns.
 */

import React from 'react'
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { SlidersVerticalIcon } from "@/components/animate-ui/icons/sliders-vertical"
import { StepWrapper } from '../shared/StepWrapper'
import { ParametersStepProps } from '../shared/types'
import { useModelCatalogue } from '@/hooks/ai-config/useModelCatalogue'

export function ParametersStep({
  mode,
  data,
  onChange,
  isLoading = false,
  validation,
  onBlur
}: ParametersStepProps) {
  // `findModel` rather than a search of the offered list: editing a saved row
  // whose model has since been withdrawn must still resolve its capabilities.
  const { findModel } = useModelCatalogue()
  // Only an API key configuration names a model. A system prompt has none.
  const model = 'model' in data ? data.model : undefined
  const entry = model ? findModel(model) : undefined
  const sampling = entry?.capabilities.sampling
  const fixedTemperature = entry?.capabilities.fixedTemperature

  if (sampling === 'unsupported') {
    return (
      <StepWrapper
        icon={SlidersVerticalIcon as React.ComponentType<{ className?: string; size?: number }>}
        title="AI Parameters"
        description="Configure AI behavior and response characteristics"
      >
        <p className="text-sm text-muted-foreground">
          {entry?.displayName ?? 'This model'} does not accept temperature or
          top-p — it rejects the request outright if either is sent, so FEED
          omits them. There is nothing to configure here, and any value saved
          against it would be ignored.
        </p>
      </StepWrapper>
    )
  }

  const temperatureIsFixed = typeof fixedTemperature === 'number'
  const shownTemperature = temperatureIsFixed
    ? fixedTemperature
    : (data.temperature || 0.7)

  return (
    <StepWrapper
      icon={SlidersVerticalIcon as React.ComponentType<{ className?: string; size?: number }>}
      title="AI Parameters"
      description="Configure AI behavior and response characteristics"
    >
      <div className="space-y-2">
        <Label htmlFor="temperature">Temperature (Creativity)</Label>
        <div className="px-3">
          <Slider
            value={[shownTemperature]}
            onValueChange={([value]) => onChange({ temperature: value })}
            min={0}
            max={2}
            step={0.1}
            className="w-full"
            disabled={isLoading || temperatureIsFixed}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0.0 (Focused)</span>
            <span className="font-medium">{shownTemperature}</span>
            <span>2.0 (Creative)</span>
          </div>
        </div>
        {temperatureIsFixed ? (
          <p role="note" className="text-xs text-destructive">
            {entry?.displayName ?? 'This model'} runs at temperature{' '}
            {fixedTemperature}. FEED replaces any other value before sending
            the request, so this is shown rather than offered.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Lower values = more focused and deterministic, Higher values = more creative and random
          </p>
        )}
      </div>

      {sampling === 'temperature-or-top-p' ? (
        <div className="space-y-2">
          <Label>Top-p (Response Diversity)</Label>
          <p role="note" className="text-xs text-destructive">
            {entry?.displayName ?? 'This model'} accepts one of temperature or
            top-p, never both. FEED keeps temperature and omits top-p, so there
            is nothing to set here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="topP">Top-p (Response Diversity)</Label>
          <div className="px-3">
            <Slider
              value={[data.topP || 1.0]}
              onValueChange={([value]) => onChange({ topP: value })}
              min={0}
              max={1}
              step={0.1}
              className="w-full"
              disabled={isLoading}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0.0 (Narrow)</span>
              <span className="font-medium">{data.topP || 1.0}</span>
              <span>1.0 (Full)</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Lower values = narrower vocabulary selection, Higher values = full vocabulary range
          </p>
        </div>
      )}
    </StepWrapper>
  )
}
