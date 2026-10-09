// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom
import React from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CostLimitsStep } from '@/components/ai-configuration/steps/CostLimitsStep'
import type { ApiKeyConfigData } from '@/components/ai-configuration/shared/types'

const buildBaseData = (overrides?: Partial<ApiKeyConfigData>): ApiKeyConfigData => ({
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
  value: '',
  name: '',
  description: '',
  temperature: 0.7,
  topP: 1.0,
  ...overrides
})

describe('CostLimitsStep', () => {
  test('renders empty fields when values are undefined', () => {
    const onChange = vi.fn()
    render(
      <CostLimitsStep
        mode="add"
        data={buildBaseData()}
        onChange={onChange}
      />
    )

    expect((screen.getByLabelText('Daily Maximum') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Monthly Maximum') as HTMLInputElement).value).toBe('')
  })

  test('renders empty fields when values are null', () => {
    const onChange = vi.fn()
    render(
      <CostLimitsStep
        mode="edit"
        data={buildBaseData({ dailyCostLimit: null, monthlyCostLimit: null })}
        onChange={onChange}
      />
    )

    expect((screen.getByLabelText('Daily Maximum') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Monthly Maximum') as HTMLInputElement).value).toBe('')
  })

  test('renders numeric values from data', () => {
    const onChange = vi.fn()
    render(
      <CostLimitsStep
        mode="edit"
        data={buildBaseData({ dailyCostLimit: 100, monthlyCostLimit: 2500 })}
        onChange={onChange}
      />
    )

    expect((screen.getByLabelText('Daily Maximum') as HTMLInputElement).value).toBe('100')
    expect((screen.getByLabelText('Monthly Maximum') as HTMLInputElement).value).toBe('2500')
  })

  test('clearing a value sends null', () => {
    const onChange = vi.fn()
    render(
      <CostLimitsStep
        mode="edit"
        data={buildBaseData({ dailyCostLimit: 100 })}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByLabelText('Daily Maximum'), { target: { value: '' } })

    expect(onChange).toHaveBeenLastCalledWith({ dailyCostLimit: null })
  })

  test('entering 0 sends null', () => {
    const onChange = vi.fn()
    render(
      <CostLimitsStep
        mode="edit"
        data={buildBaseData({ monthlyCostLimit: 200 })}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByLabelText('Monthly Maximum'), { target: { value: '0' } })

    expect(onChange).toHaveBeenLastCalledWith({ monthlyCostLimit: null })
  })
})

/**
 * Defect 6 of ISSUES.md #84, said on the step where the limit is set.
 *
 * A cost limit is compared against recorded spend, and recorded spend is
 * tokens x price. With no price the product is zero, so the limit never stops
 * a translation however small it is. The API refuses to save this pair, but
 * being told at save time — several steps later, as a red banner — is a poor
 * substitute for being told while typing the number.
 */
describe('CostLimitsStep when there is no price to measure against', () => {
  test('warns that a limit with no rates cannot be enforced', () => {
    render(
      <CostLimitsStep
        mode="add"
        data={buildBaseData({ dailyCostLimit: 5 })}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByRole('note')).toBeTruthy()
    expect(screen.getByText(/cannot be enforced yet/i)).toBeTruthy()
  })

  test('a monthly limit alone earns the same warning', () => {
    render(
      <CostLimitsStep
        mode="add"
        data={buildBaseData({ monthlyCostLimit: 30 })}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByRole('note')).toBeTruthy()
  })

  test('says nothing once a rate is set', () => {
    render(
      <CostLimitsStep
        mode="edit"
        data={buildBaseData({ dailyCostLimit: 5, inputCost: 0.25, outputCost: 2 })}
        onChange={vi.fn()}
      />
    )

    expect(screen.queryByRole('note')).toBeNull()
  })

  test('one rate is enough — a partly priced configuration measures something', () => {
    render(
      <CostLimitsStep
        mode="edit"
        data={buildBaseData({ dailyCostLimit: 5, inputCost: 0.25 })}
        onChange={vi.fn()}
      />
    )

    expect(screen.queryByRole('note')).toBeNull()
  })

  test('says nothing about an unpriced configuration with no limit', () => {
    // The Cost step offers "leave empty to skip cost tracking" deliberately.
    // Warning here would scold an administrator for accepting that offer.
    render(<CostLimitsStep mode="add" data={buildBaseData()} onChange={vi.fn()} />)

    expect(screen.queryByRole('note')).toBeNull()
  })

  test('a limit of zero is unlimited, not unenforceable', () => {
    render(
      <CostLimitsStep
        mode="edit"
        data={buildBaseData({ dailyCostLimit: 0 })}
        onChange={vi.fn()}
      />
    )

    expect(screen.queryByRole('note')).toBeNull()
  })
})
