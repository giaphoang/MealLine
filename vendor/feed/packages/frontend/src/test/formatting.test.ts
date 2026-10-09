// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import type { ChangeEvent } from 'react'
import { describe, expect, test, vi } from 'vitest'
import {
  createCostLimitChangeHandler,
  createCurrencyChangeHandler,
  createNumberChangeHandler,
  createTokenLimitChangeHandler
} from '@/components/ai-configuration/shared/formatting'

const buildEvent = (value: string) =>
  ({ target: { value } } as ChangeEvent<HTMLInputElement>)

describe('createCostLimitChangeHandler', () => {
  test('sends null when field is cleared', () => {
    const setRaw = vi.fn()
    const onChange = vi.fn()
    const handler = createCostLimitChangeHandler('dailyCostLimit', setRaw, onChange)

    handler(buildEvent(''))

    expect(onChange).toHaveBeenLastCalledWith({ dailyCostLimit: null })
  })

  test('sends null when user enters zero', () => {
    const setRaw = vi.fn()
    const onChange = vi.fn()
    const handler = createCostLimitChangeHandler('monthlyCostLimit', setRaw, onChange)

    handler(buildEvent('0.00'))

    expect(onChange).toHaveBeenLastCalledWith({ monthlyCostLimit: null })
  })

  test('sends numeric value for valid input', () => {
    const setRaw = vi.fn()
    const onChange = vi.fn()
    const handler = createCostLimitChangeHandler('dailyCostLimit', setRaw, onChange)

    handler(buildEvent('100.50'))

    expect(onChange).toHaveBeenLastCalledWith({ dailyCostLimit: 100.5 })
  })
})

describe('createCurrencyChangeHandler', () => {
  test('sends null when field is cleared', () => {
    const setRaw = vi.fn()
    const onChange = vi.fn()
    const handler = createCurrencyChangeHandler('inputCost', setRaw, onChange)

    handler(buildEvent(''))

    expect(onChange).toHaveBeenLastCalledWith({ inputCost: null })
  })

  test('preserves zero for free-tier rates', () => {
    const setRaw = vi.fn()
    const onChange = vi.fn()
    const handler = createCurrencyChangeHandler('outputCost', setRaw, onChange)

    handler(buildEvent('0'))

    expect(onChange).toHaveBeenLastCalledWith({ outputCost: 0 })
  })
})

describe('createTokenLimitChangeHandler', () => {
  test('sends null when field is cleared', () => {
    const setRaw = vi.fn()
    const onChange = vi.fn()
    const handler = createTokenLimitChangeHandler('inputTokenLimit', setRaw, onChange)

    handler(buildEvent(''))

    expect(onChange).toHaveBeenLastCalledWith({ inputTokenLimit: null })
  })

  test('preserves zero as a hard limit', () => {
    const setRaw = vi.fn()
    const onChange = vi.fn()
    const handler = createTokenLimitChangeHandler('outputTokenLimit', setRaw, onChange)

    handler(buildEvent('0'))

    expect(onChange).toHaveBeenLastCalledWith({ outputTokenLimit: 0 })
  })
})

describe('createNumberChangeHandler', () => {
  test('sends null when field is cleared', () => {
    const setRaw = vi.fn()
    const onChange = vi.fn()
    const handler = createNumberChangeHandler('requestsPerDay', setRaw, onChange)

    handler(buildEvent(''))

    expect(onChange).toHaveBeenLastCalledWith({ requestsPerDay: null })
  })

  test('preserves zero as a hard limit', () => {
    const setRaw = vi.fn()
    const onChange = vi.fn()
    const handler = createNumberChangeHandler('tokensPerMinute', setRaw, onChange)

    handler(buildEvent('0'))

    expect(onChange).toHaveBeenLastCalledWith({ tokensPerMinute: 0 })
  })
})
