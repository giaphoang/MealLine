// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom

/**
 * Translation Management's Types filter offers every type the page holds.
 *
 * `TRANSLATION_TYPES` has declared five since the Shopping List Builder began
 * caching its render-time strings, but the filter offered four. That omission
 * was carried over deliberately when the option list moved out of the shared
 * `TypeFilter` — so that fixing AI Configuration's dropdown would not alter
 * this page — and then outlived its reason.
 *
 * The missing checkbox was the smaller half. `TypeFilter.toggleType` restores
 * `options.map(o => o.value)` when the last box is unticked, so a full untick
 * reset the selection to the four offered types and dropped every
 * 'Generated (List)' row: 170 of them in a local database, the second-largest
 * type after FoodItem, with no control left on screen to bring them back.
 *
 * The invariant worth holding is not "there are five options" — a count says
 * nothing about which — but that the options and the initial selection are
 * drawn from the same set. Any future type added to one and not the other
 * reopens exactly this defect.
 *
 * Rendered through a stubbed `DataList` that records the props it is given,
 * as `ai-configuration-type-filter.test.tsx` does. Radix's dropdown does not
 * open under jsdom, and what is under test here is which options the page
 * hands over, not the menu primitive.
 */

import React from 'react'
import { act, render } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'

import type { TypeFilterOption } from '@/components/ui/type-filter'
import type { Translation, TranslationType } from '@/types/translation'

/** Props the page handed to the table, captured per render. */
let captured: Record<string, any> | null = null

vi.mock('@/components/shared/data-list/DataList', () => ({
  DataList: (props: Record<string, any>) => {
    captured = props
    return null
  }
}))

vi.mock('@/hooks/message/useMessage', () => ({
  useMessage: () => ({
    showMessage: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn()
  })
}))

/**
 * The list builds a `TranslationService` on mount and awaits
 * `getCapabilities()`. Nothing in src/test/setup.ts stubs `fetch`, and Node's
 * global one is real under jsdom, so leaving this unmocked would have the
 * suite open a socket to localhost on every run — the same trap
 * `ai-configuration-edit-dialog.test.tsx` records. Capabilities decide which
 * bulk actions a row offers and have no bearing on the filter's options.
 */
vi.mock('@/services/translation', () => ({
  TranslationService: class {
    async getCapabilities() {
      return {}
    }
  }
}))

import { TranslationList } from '@/components/translation-management/TranslationList'

const translation = (overrides: Partial<Translation> = {}): Translation =>
  ({
    id: 1,
    originalText: 'Apples',
    translatedText: 'Manzanas',
    language: 'Spanish',
    type: 'FoodItem' as TranslationType,
    status: 'completed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }) as Translation

/**
 * Rendered inside `act` and flushed, because the list awaits
 * `getCapabilities()` on mount and then calls `setCapabilities`. Without the
 * flush every test prints "An update to TranslationList inside a test was not
 * wrapped in act(...)" — five warnings for five passing tests, which is the
 * kind of routine noise that teaches people to stop reading test output.
 */
const renderList = async (translations: Translation[] = []) => {
  await act(async () => {
    render(
      <TranslationList
        translations={translations}
        isLoading={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
        bulkDelete={vi.fn()}
        bulkRetry={vi.fn()}
      />
    )
  })
}

describe('the Types filter on Translation Management', () => {
  beforeEach(() => {
    captured = null
    vi.clearAllMocks()
  })

  test('offers a checkbox for Shopping List rows', async () => {
    await renderList()

    const values = (captured?.typeOptions ?? []).map(
      (option: TypeFilterOption<TranslationType>) => option.value
    )
    expect(values).toContain('Generated (List)')
  })

  test('names it as the Find Missing dialog and the backend already do', async () => {
    // Those two say 'Generated (Shopping List)'. A third spelling in the same
    // dropdown as 'Generated (Document)' would read as a different thing.
    await renderList()

    const option = (captured?.typeOptions ?? []).find(
      (candidate: TypeFilterOption<TranslationType>) => candidate.value === 'Generated (List)'
    )
    expect(option?.label).toBe('Generated (Shopping List)')
  })

  test('every selectable type has an option, and every option is selectable', async () => {
    // The actual invariant. `toggleType` restores the *options* when the last
    // box is unticked, so a type in the initial selection but missing from the
    // options vanishes at that moment and cannot be recovered.
    await renderList()

    const optionValues = (captured?.typeOptions ?? [])
      .map((option: TypeFilterOption<TranslationType>) => option.value)
      .sort()
    const selected = [...(captured?.selectedTypes ?? [])].sort()

    expect(optionValues).toEqual(selected)
  })

  test('a Shopping List row is visible on first render', async () => {
    // It always was — the initial selection carries all five. The defect only
    // appeared after a full untick, which is what the invariant above guards.
    const rows = [
      translation({ id: 1, type: 'FoodItem' as TranslationType }),
      translation({ id: 2, type: 'Generated (List)' as TranslationType, originalText: 'Produce' })
    ]

    await renderList(rows)

    expect(captured?.items).toHaveLength(2)
  })

  test('the four existing options are unchanged', async () => {
    // This page's behaviour should differ in exactly one way.
    await renderList()

    expect(captured?.typeOptions).toEqual([
      { value: 'Category', label: 'Category' },
      { value: 'FoodItem', label: 'Food Item' },
      { value: 'Custom', label: 'Custom' },
      { value: 'Generated', label: 'Generated (Document)' },
      { value: 'Generated (List)', label: 'Generated (Shopping List)' }
    ])
  })
})
