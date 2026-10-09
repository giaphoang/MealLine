// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom

/**
 * The Types filter, on a page that is not Translation Management.
 *
 * `TypeFilter` mapped over a module-level list of *translation* types, so AI
 * Configuration — the only other page that enables it — offered "Category /
 * Food Item / Custom / Generated (Document)" above rows that are only ever
 * API keys and system prompts. It was not merely mislabelled: every box drew
 * unchecked, because none of those four values appear in `['prompt',
 * 'apikey']`, and ticking one appended a type the table has no rows of while
 * leaving both real types selected — so no sequence of clicks changed the
 * list. The control could not work on that page.
 *
 * TypeScript had in fact been reporting this the whole time, as two errors in
 * the frontend's pre-existing baseline: `AIConfigurationType[]` is not
 * assignable to `TranslationType[]`, and the same for the change handler.
 * Both are gone now that the filter is generic over its own option list.
 *
 * The list components are exercised through a stubbed `DataList` that records
 * the props it receives. What went wrong was which options a page hands to
 * the shared filter, and that is exactly what these assert; driving Radix's
 * dropdown open in jsdom would test the menu primitive instead.
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'

import { TypeFilter, type TypeFilterOption } from '@/components/ui/type-filter'
import type { UnifiedConfiguration } from '@/services/unified-config'

/** Props the page under test handed to the table, captured per render. */
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

vi.mock('@/hooks/ai-config/useModelCatalogue', () => ({
  useModelCatalogue: () => ({
    models: [],
    withdrawn: [],
    endpoints: {},
    isLoading: false,
    findModel: () => undefined,
    refresh: vi.fn()
  })
}))

/**
 * Radix's dropdown will not open under jsdom: it opens on pointer handling
 * that needs a real `PointerEvent`, which jsdom does not implement, so
 * neither `click` nor `pointerDown` mounts the menu and every query finds
 * only the trigger. These stubs render the same structure without the
 * portal, which keeps the tests below about this component's own logic —
 * which options it maps, and what a toggle emits — rather than about the
 * menu primitive, which is a dependency and not ours to verify.
 */
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    onCheckedChange
  }: {
    children: React.ReactNode
    checked?: boolean
    onCheckedChange?: (next: boolean) => void
  }) => (
    <button role="menuitemcheckbox" aria-checked={checked} onClick={() => onCheckedChange?.(!checked)}>
      {children}
    </button>
  )
}))

import { AIConfigurationList } from '@/components/ai-configuration/AIConfigurationList'

const AI_TYPES: TypeFilterOption<'prompt' | 'apikey'>[] = [
  { value: 'apikey', label: 'API Key' },
  { value: 'prompt', label: 'System Prompt' }
]

const row = (overrides: Partial<UnifiedConfiguration>): UnifiedConfiguration =>
  ({
    id: 'apikey-1',
    name: 'Production',
    type: 'apikey',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }) as UnifiedConfiguration

describe('the Types filter renders the options it is given', () => {
  test('shows each option’s label, not a hardcoded vocabulary', () => {
    render(
      <TypeFilter selectedTypes={['apikey', 'prompt']} options={AI_TYPES} onTypeChange={vi.fn()} />
    )


    expect(screen.getByText('API Key')).toBeTruthy()
    expect(screen.getByText('System Prompt')).toBeTruthy()
    // The four that used to appear here regardless of the caller.
    expect(screen.queryByText('Category')).toBeNull()
    expect(screen.queryByText('Food Item')).toBeNull()
    expect(screen.queryByText('Generated (Document)')).toBeNull()
  })

  test('unticking one type leaves the rest selected', () => {
    const onTypeChange = vi.fn()
    render(
      <TypeFilter
        selectedTypes={['apikey', 'prompt']}
        options={AI_TYPES}
        onTypeChange={onTypeChange}
      />
    )

    fireEvent.click(screen.getByText('System Prompt'))

    // Previously this *appended*, because the clicked value was never in the
    // selection to begin with — so the filter never removed anything.
    expect(onTypeChange).toHaveBeenCalledWith(['apikey'])
  })

  test('unticking the last type shows everything rather than nothing', () => {
    const onTypeChange = vi.fn()
    render(
      <TypeFilter selectedTypes={['apikey']} options={AI_TYPES} onTypeChange={onTypeChange} />
    )

    fireEvent.click(screen.getByText('API Key'))

    // An empty table with no visible way back would read as data loss.
    expect(onTypeChange).toHaveBeenCalledWith(['apikey', 'prompt'])
  })
})

describe('what AI Configuration offers in its Types filter', () => {
  beforeEach(() => {
    captured = null
  })

  const renderList = () =>
    render(
      <AIConfigurationList
        configurations={[
          row({ id: 'apikey-1', type: 'apikey', name: 'GPT-5 Mini' }),
          row({ id: 'prompt-1', type: 'prompt', name: 'Food Items and Categories' })
        ]}
        isLoading={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleActive={vi.fn()}
        bulkDelete={vi.fn()}
        bulkToggleActive={vi.fn()}
      />
    )

  test('offers API Key and System Prompt, and nothing from Translation Management', () => {
    renderList()

    expect(captured?.typeOptions).toEqual([
      { value: 'apikey', label: 'API Key' },
      { value: 'prompt', label: 'System Prompt' }
    ])
  })

  test('starts with both types selected, so every row is visible', () => {
    renderList()

    expect(captured?.selectedTypes).toEqual(['prompt', 'apikey'])
    expect(captured?.items).toHaveLength(2)
  })

  test('every offered option is a type the page can actually filter by', () => {
    // The defect in one assertion: the options and the selection have to be
    // drawn from the same vocabulary, or ticking a box can never match a row.
    renderList()

    const offered = (captured?.typeOptions ?? []).map((option: TypeFilterOption<string>) => option.value)
    for (const value of captured?.selectedTypes ?? []) {
      expect(offered).toContain(value)
    }
  })
})
