// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom

/**
 * The service step, reading the server catalogue rather than a second copy of
 * the model list (ISSUES.md #84).
 *
 * Two behaviours earn tests here. The step must degrade to free-text inputs
 * when the catalogue is empty — the configuration wizard's own tests click
 * straight through this step to reach later ones, so gating navigation on a
 * network round trip would break them and, more importantly, would strand an
 * administrator whenever the request failed. And the pre-fill has to survive
 * the catalogue arriving late: the Add dialog opens with a model already
 * chosen, so if nothing applied its prices once they loaded, the Cost step
 * would simply be blank.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'

import { ServiceStep } from '@/components/ai-configuration/steps/ServiceStep'
import type { ApiKeyConfigData } from '@/components/ai-configuration/shared/types'
import type { CatalogueModel } from '@/components/ai-configuration/types'
import { useModelCatalogue } from '@/hooks/ai-config/useModelCatalogue'
import { useEnabledLanguages } from '@/hooks/language/useEnabledLanguages'

vi.mock('@/hooks/ai-config/useModelCatalogue', () => ({
  useModelCatalogue: vi.fn()
}))

vi.mock('@/hooks/language/useEnabledLanguages', () => ({
  useEnabledLanguages: vi.fn()
}))

const flashLite = {
  id: 'gemini-2.5-flash-lite',
  displayName: 'gemini-2.5-flash-lite',
  provider: 'Google',
  pricing: { input: 0.1, output: 0.4, verifiedAt: '2026-09-11' },
  contextWindow: 1048576,
  maxOutputTokens: 65536,
  lifecycle: { status: 'deprecated' },
  costTier: 'economy',
  capabilities: {
    sampling: 'supported',
    maxTokensField: 'max_tokens',
    reasoning: { kind: 'none' },
    prefill: 'allowed'
  },
  rateLimits: { tokensPerMinute: 4000000, requestsPerMinute: 2000 },
  languages: { Spanish: 'supported', Somali: 'unsupported' }
} as unknown as CatalogueModel

const haiku = {
  ...flashLite,
  id: 'claude-haiku-4-5-20251001',
  displayName: 'claude-haiku-4.5',
  provider: 'Anthropic',
  lifecycle: { status: 'active' }
} as unknown as CatalogueModel

/** Current, healthy, and far more model than translation needs (D1/D7). */
const astra = {
  ...flashLite,
  id: 'gpt-6-astra',
  displayName: 'gpt-6-astra',
  provider: 'OpenAI',
  pricing: { input: 10, output: 50, verifiedAt: '2026-09-12' },
  lifecycle: { status: 'active' },
  costTier: 'frontier'
} as unknown as CatalogueModel

const buildData = (overrides: Partial<ApiKeyConfigData> = {}): ApiKeyConfigData =>
  ({
    type: 'apikey',
    serviceType: 'Google',
    model: 'gemini-2.5-flash-lite',
    modelName: 'gemini-2.5-flash-lite',
    customModel: '',
    customModelName: '',
    apiKey: '',
    endpointUrl: '',
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
    ...overrides
  }) as ApiKeyConfigData

const withCatalogue = (models: CatalogueModel[]) => {
  vi.mocked(useModelCatalogue).mockReturnValue({
    models,
    endpoints: {},
    isLoading: false,
    refresh: vi.fn()
  } as unknown as ReturnType<typeof useModelCatalogue>)
}

describe('ServiceStep reading the model catalogue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useEnabledLanguages).mockReturnValue({
      languages: [],
      isLoading: false,
      refresh: vi.fn()
    })
  })

  test('offers the catalogue models for the chosen provider as a select', () => {
    withCatalogue([flashLite, haiku])

    render(<ServiceStep mode="add" data={buildData()} onChange={vi.fn()} />)

    // The labels finally name their controls: `htmlFor` pointed at ids that
    // did not exist, so these selects had no accessible name at all.
    expect(screen.getByRole('combobox', { name: 'Model Name' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Model' })).toBeTruthy()
  })

  test('falls back to free text when the catalogue is empty, so the step stays usable', () => {
    withCatalogue([])

    render(<ServiceStep mode="add" data={buildData()} onChange={vi.fn()} />)

    const modelName = screen.getByLabelText('Model Name') as HTMLInputElement
    const model = screen.getByLabelText('Model') as HTMLInputElement

    expect(modelName.tagName).toBe('INPUT')
    expect(model.tagName).toBe('INPUT')
    // And the values the administrator already had are still there to save.
    expect(model.value).toBe('gemini-2.5-flash-lite')
  })

  test('applies prices and limits when the catalogue arrives after the dialog opens', () => {
    withCatalogue([flashLite])
    const onChange = vi.fn()

    render(<ServiceStep mode="add" data={buildData()} onChange={onChange} />)

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        inputCost: 0.1,
        outputCost: 0.4,
        unitPrice: 'per_1m',
        inputTokenLimit: 1048576,
        outputTokenLimit: 65536,
        tokensPerMinute: 4000000,
        requestsPerMinute: 2000
      })
    )
  })

  test('never overwrites costs an administrator has already set', () => {
    // The same hydrate path, on a configuration that already carries prices.
    withCatalogue([flashLite])
    const onChange = vi.fn()

    render(
      <ServiceStep
        mode="add"
        data={buildData({ inputCost: 9.99, outputCost: 1.23 })}
        onChange={onChange}
      />
    )

    expect(onChange).not.toHaveBeenCalled()
  })

  test('warns in the dialog when the chosen model is on its way out', () => {
    // The plan asks for this "in the dialog and as a list badge". The list
    // half shipped first; without this an administrator could pick a
    // deprecated model in the wizard with no indication at all.
    withCatalogue([flashLite])

    render(<ServiceStep mode="add" data={buildData()} onChange={vi.fn()} />)

    expect(screen.getByText(/gemini-2\.5-flash-lite is deprecated/)).toBeTruthy()
  })

  test('warns that a frontier model costs far more than this work needs', () => {
    withCatalogue([astra])

    render(
      <ServiceStep
        mode="add"
        data={buildData({ serviceType: 'OpenAI', model: 'gpt-6-astra', modelName: 'gpt-6-astra' })}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText(/costs \$10\/\$50 per 1M tokens/)).toBeTruthy()
    expect(screen.getByText(/not known to translate better/)).toBeTruthy()
  })

  test('lists enabled languages the chosen model does not support', () => {
    withCatalogue([flashLite])
    vi.mocked(useEnabledLanguages).mockReturnValue({
      languages: [
        { id: 1, name: 'Spanish', isEnabled: true, sortOrder: 1, createdAt: '', updatedAt: '' },
        { id: 2, name: 'Somali', isEnabled: true, sortOrder: 2, createdAt: '', updatedAt: '' }
      ],
      isLoading: false,
      refresh: vi.fn()
    })

    render(<ServiceStep mode="add" data={buildData()} onChange={vi.fn()} />)

    expect(screen.getByText('This model does not support these enabled languages: Somali.')).toBeTruthy()
  })

  test('says nothing about a current, sensibly priced model', () => {
    // Silence when there is nothing to say, or the warnings become wallpaper.
    withCatalogue([haiku])

    render(
      <ServiceStep
        mode="add"
        data={buildData({
          serviceType: 'Anthropic',
          model: 'claude-haiku-4-5-20251001',
          modelName: 'claude-haiku-4.5'
        })}
        onChange={vi.fn()}
      />
    )

    expect(screen.queryByRole('note')).toBeNull()
  })

  test('says nothing for a Custom model, which the catalogue knows nothing about', () => {
    withCatalogue([flashLite, astra])

    render(
      <ServiceStep mode="add" data={buildData({ model: 'Custom' })} onChange={vi.fn()} />
    )

    expect(screen.queryByRole('note')).toBeNull()
  })

  test('leaves an edited configuration alone', () => {
    // Edit reads its costs from the stored row; hydrating would silently
    // replace what the administrator saved with the catalogue's list price.
    withCatalogue([flashLite])
    const onChange = vi.fn()

    render(<ServiceStep mode="edit" data={buildData()} onChange={onChange} />)

    expect(onChange).not.toHaveBeenCalled()
  })
})
