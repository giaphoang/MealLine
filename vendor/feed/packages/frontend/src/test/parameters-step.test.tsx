// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom

/**
 * The Parameters step, offering only what the chosen model accepts.
 *
 * Defect 5 of ISSUES.md #84, and the UI half of D3: "model-parameter
 * constraints are enforced in both backend and UI, so a forbidden parameter
 * can never reach a request". The backend half was already true — all three
 * providers route the merged temperature and top-p through
 * `checkAndOverrideParameters`, which reads the model's catalogue
 * capabilities, across all twelve call sites. The UI half was not: these two
 * sliders rendered for every model, including the eleven catalogue entries
 * whose `sampling` is `unsupported`.
 *
 * Nothing rendered this step in any test before, which is how a control that
 * cannot work for a third of the catalogue went unnoticed.
 *
 * The principle inherited from `ThinkingLevelStep`: gate on knowledge, never
 * on ignorance. A Custom id, a catalogue that has not arrived, and a system
 * prompt (which carries a temperature but names no model, because the same
 * prompt may be used with any configuration) all render exactly as before.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'

import { ParametersStep } from '@/components/ai-configuration/steps/ParametersStep'
import type { ApiKeyConfigData, PromptConfigData } from '@/components/ai-configuration/shared/types'
import type { CatalogueModel } from '@/components/ai-configuration/types'
import { useModelCatalogue } from '@/hooks/ai-config/useModelCatalogue'

vi.mock('@/hooks/ai-config/useModelCatalogue', () => ({
  useModelCatalogue: vi.fn()
}))

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver
}

const TEMPERATURE = 'Temperature (Creativity)'
const TOP_P = 'Top-p (Response Diversity)'

const model = (
  id: string,
  capabilities: Record<string, unknown>
): CatalogueModel =>
  ({
    id,
    displayName: id,
    provider: 'OpenAI',
    pricing: { input: 1, output: 1, verifiedAt: '2026-09-12' },
    contextWindow: 1000,
    maxOutputTokens: 1000,
    lifecycle: { status: 'active' },
    costTier: 'economy',
    capabilities: {
      maxTokensField: 'max_completion_tokens',
      reasoning: { kind: 'none' },
      prefill: 'allowed',
      ...capabilities
    }
  }) as unknown as CatalogueModel

const CATALOGUE: Record<string, CatalogueModel> = {
  'gpt-5.6-luna': model('gpt-5.6-luna', { sampling: 'unsupported' }),
  'gpt-4.1-nano': model('gpt-4.1-nano', { sampling: 'supported' }),
  'claude-haiku-4-5-20251001': model('claude-haiku-4-5-20251001', {
    sampling: 'temperature-or-top-p'
  }),
  'gemini-3.5-flash-lite': model('gemini-3.5-flash-lite', {
    sampling: 'supported',
    fixedTemperature: 1.0
  })
}

const withCatalogue = () => {
  vi.mocked(useModelCatalogue).mockReturnValue({
    models: Object.values(CATALOGUE),
    withdrawn: [],
    endpoints: {},
    isLoading: false,
    findModel: (id?: string | null) => (id ? CATALOGUE[id] : undefined),
    refresh: vi.fn()
  } as unknown as ReturnType<typeof useModelCatalogue>)
}

const apiKeyData = (model: string): ApiKeyConfigData =>
  ({
    type: 'apikey',
    serviceType: 'OpenAI',
    model,
    modelName: model,
    customModel: '',
    customModelName: '',
    apiKey: '',
    endpointUrl: '',
    inputCost: undefined,
    outputCost: undefined,
    unitPrice: 'per_1m',
    name: '',
    description: '',
    value: '',
    temperature: 0.7,
    topP: 1.0
  }) as unknown as ApiKeyConfigData

const promptData = (): PromptConfigData =>
  ({
    type: 'prompt',
    promptCategory: 'FOOD_TRANSLATION',
    name: '',
    description: '',
    value: '',
    temperature: 0.3,
    topP: 1.0
  }) as unknown as PromptConfigData

describe('which sampling controls a model is offered', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withCatalogue()
  })

  test('a model that refuses both is offered neither', () => {
    render(<ParametersStep mode="add" data={apiKeyData('gpt-5.6-luna')} onChange={vi.fn()} />)

    expect(screen.queryByText(TEMPERATURE)).toBeNull()
    expect(screen.queryByText(TOP_P)).toBeNull()
    expect(screen.getByText(/does not accept temperature or/i)).toBeTruthy()
    expect(screen.getByText(/gpt-5\.6-luna/)).toBeTruthy()
  })

  test('a model that accepts both keeps both sliders', () => {
    render(<ParametersStep mode="add" data={apiKeyData('gpt-4.1-nano')} onChange={vi.fn()} />)

    expect(screen.getByText(TEMPERATURE)).toBeTruthy()
    expect(screen.getByText(TOP_P)).toBeTruthy()
    expect(screen.queryByRole('note')).toBeNull()
  })

  test('a model that takes one of the two keeps temperature and withdraws top-p', () => {
    // Claude 4.5. The backend drops top_p and keeps temperature, so the step
    // must not offer a top-p the request will never carry.
    render(
      <ParametersStep
        mode="edit"
        data={apiKeyData('claude-haiku-4-5-20251001')}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText(TEMPERATURE)).toBeTruthy()
    expect(screen.getByText(TOP_P)).toBeTruthy() // the label stays, as an explanation
    expect(screen.getByText(/accepts one of temperature or/i)).toBeTruthy()
  })

  test('a fixed temperature is shown rather than offered, and top-p stays editable', () => {
    // Gemini 3.x. `sampling` is `supported` because Google accepts the
    // parameter — but FEED replaces the value before sending, so a slider
    // that appears to take an instruction would be lying. Top-p is passed
    // through untouched for these models, so it must remain a real control.
    render(
      <ParametersStep
        mode="edit"
        data={apiKeyData('gemini-3.5-flash-lite')}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText(/runs at temperature/i)).toBeTruthy()
    expect(screen.getByText(/replaces any other value/i)).toBeTruthy()
    expect(screen.getByText(TOP_P)).toBeTruthy()
    expect(screen.queryByText(/accepts one of temperature/i)).toBeNull()
  })
})

describe('when the catalogue cannot answer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withCatalogue()
  })

  test('a Custom id keeps both controls', () => {
    // Gating on ignorance would strip a working control from a model FEED
    // simply has not catalogued. The backend substitutes whatever the model
    // turns out to refuse.
    render(<ParametersStep mode="add" data={apiKeyData('Custom')} onChange={vi.fn()} />)

    expect(screen.getByText(TEMPERATURE)).toBeTruthy()
    expect(screen.getByText(TOP_P)).toBeTruthy()
  })

  test('a system prompt keeps both controls, having no model to gate against', () => {
    // A prompt's temperature overrides the configuration's in PromptBuilder,
    // and the same prompt may be used with any model — so this step cannot
    // know what will honour it.
    render(<ParametersStep mode="edit" data={promptData()} onChange={vi.fn()} />)

    expect(screen.getByText(TEMPERATURE)).toBeTruthy()
    expect(screen.getByText(TOP_P)).toBeTruthy()
  })

  test('an empty catalogue changes nothing', () => {
    vi.mocked(useModelCatalogue).mockReturnValue({
      models: [],
      withdrawn: [],
      endpoints: {},
      isLoading: true,
      findModel: () => undefined,
      refresh: vi.fn()
    } as unknown as ReturnType<typeof useModelCatalogue>)

    render(<ParametersStep mode="add" data={apiKeyData('gpt-5.6-luna')} onChange={vi.fn()} />)

    // The same model that is gated above renders in full here, because the
    // catalogue has not arrived to say otherwise.
    expect(screen.getByText(TEMPERATURE)).toBeTruthy()
    expect(screen.getByText(TOP_P)).toBeTruthy()
  })
})
