// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom

/**
 * The thinking-level step, offering only what the chosen model accepts.
 *
 * These tests used to assert that the slider "defaults to high" and shows all
 * four levels for everything. Both were the defect: `high` is the most
 * expensive setting, and a level set on a model with no reasoning control was
 * accepted by the form and silently discarded. D2 reverses the default, and
 * the catalogue says which levels each model actually takes.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { ThinkingLevelStep } from '@/components/ai-configuration/steps/ThinkingLevelStep'
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

const model = (
  id: string,
  reasoning: Record<string, unknown>
): CatalogueModel =>
  ({
    id,
    displayName: id,
    provider: 'Google',
    pricing: { input: 1, output: 1, verifiedAt: '2026-09-11' },
    contextWindow: 1000,
    maxOutputTokens: 1000,
    lifecycle: { status: 'active' },
    costTier: 'economy',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      reasoning,
      prefill: 'allowed'
    }
  }) as unknown as CatalogueModel

/** Four levels, as the GPT-5 snapshots and Gemini 3 Flash offer. */
const fourLevel = model('gemini-3-flash-preview', {
  kind: 'thinking-level',
  values: ['minimal', 'low', 'medium', 'high'],
  leastCost: 'minimal'
})

/** Two levels: Gemini 3 Pro cannot go below `low`. */
const twoLevel = model('gemini-3-pro-preview', {
  kind: 'thinking-level',
  values: ['low', 'high'],
  leastCost: 'low'
})

/** No control at all, as Gemini 2.5 and the gpt-4o family. */
const noControl = model('gemini-2.5-flash', { kind: 'none' })

const withCatalogue = (models: CatalogueModel[]) => {
  vi.mocked(useModelCatalogue).mockReturnValue({
    models,
    endpoints: {},
    isLoading: false,
    refresh: vi.fn()
  } as unknown as ReturnType<typeof useModelCatalogue>)
}

const buildProps = (overrides: Record<string, unknown> = {}) => ({
  mode: 'add' as const,
  data: { thinkingLevel: undefined, model: fourLevel.id },
  onChange: vi.fn(),
  isLoading: false,
  ...overrides
})

describe('ThinkingLevelStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withCatalogue([fourLevel, twoLevel, noControl])
  })

  test('an unset level shows the cheapest the model takes, marked as the default', () => {
    render(<ThinkingLevelStep {...(buildProps() as any)} />)

    expect(screen.getByText('minimal', { selector: 'div' })).toBeTruthy()
    expect(screen.getByText(/model default/)).toBeTruthy()
  })

  test('showing it does not write it — the stored level stays unset', () => {
    // The whole point of leaving it null: it keeps tracking the model's own
    // cheapest setting instead of freezing today's value into the row.
    const onChange = vi.fn()

    render(<ThinkingLevelStep {...(buildProps({ onChange }) as any)} />)

    expect(onChange).not.toHaveBeenCalled()
  })

  test('offers only the levels the model accepts', () => {
    render(
      <ThinkingLevelStep
        {...(buildProps({ data: { thinkingLevel: undefined, model: twoLevel.id } }) as any)}
      />
    )

    // The label row under the slider is what lists the offered levels; the
    // `div` below it repeats the current one, so every query is scoped to the
    // spans or it matches both.
    expect(screen.getByText('low', { selector: 'span' })).toBeTruthy()
    expect(screen.getByText('high', { selector: 'span' })).toBeTruthy()
    // `minimal` and `medium` are not offered: Gemini 3 Pro refuses both.
    expect(screen.queryByText('minimal', { selector: 'span' })).toBeNull()
    expect(screen.queryByText('medium', { selector: 'span' })).toBeNull()
  })

  test('says so, rather than offering a control, when the model has none', () => {
    render(
      <ThinkingLevelStep
        {...(buildProps({ data: { thinkingLevel: undefined, model: noControl.id } }) as any)}
      />
    )

    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByText(/no thinking or reasoning setting/)).toBeTruthy()
  })

  test('warns when the chosen level is above medium', () => {
    render(
      <ThinkingLevelStep
        {...(buildProps({ data: { thinkingLevel: 'high', model: fourLevel.id } }) as any)}
      />
    )

    expect(screen.getByText(/raises the cost of every request/)).toBeTruthy()
  })

  test('does not warn at or below medium', () => {
    render(
      <ThinkingLevelStep
        {...(buildProps({ data: { thinkingLevel: 'medium', model: fourLevel.id } }) as any)}
      />
    )

    expect(screen.queryByText(/raises the cost of every request/)).toBeNull()
  })

  test('shows the configured thinking level', () => {
    render(
      <ThinkingLevelStep
        {...(buildProps({ data: { thinkingLevel: 'low', model: fourLevel.id } }) as any)}
      />
    )

    expect(screen.getByText('low', { selector: 'div' })).toBeTruthy()
  })

  test('updates thinking level on slider interaction', () => {
    const onChange = vi.fn()
    render(
      <ThinkingLevelStep
        {...(buildProps({ data: { thinkingLevel: 'low', model: fourLevel.id }, onChange }) as any)}
      />
    )

    const slider = screen.getByRole('slider')
    slider.focus()
    fireEvent.keyDown(slider, { key: 'ArrowRight' })

    expect(onChange).toHaveBeenLastCalledWith({ thinkingLevel: 'medium' })
  })

  test('an unknown model keeps the four common levels, because nothing knows better', () => {
    // A Custom id, or a catalogue that has not arrived. Hiding the control
    // would be a guess; the backend substitutes anything the model refuses.
    //
    // Four, not the seven FEED can store: `xhigh` and `max` point at the
    // expensive end on nothing but a hunch, and `none` is refused by every
    // model except GPT-5.6. A guess about an unrecognised id should only
    // offer what the catalogued models actually use.
    render(
      <ThinkingLevelStep
        {...(buildProps({ data: { thinkingLevel: undefined, model: 'something-custom' } }) as any)}
      />
    )

    expect(screen.getByRole('slider')).toBeTruthy()
    expect(screen.getByText('minimal', { selector: 'span' })).toBeTruthy()
    expect(screen.getByText('medium', { selector: 'span' })).toBeTruthy()
    expect(screen.getByText('high', { selector: 'span' })).toBeTruthy()
  })
})
