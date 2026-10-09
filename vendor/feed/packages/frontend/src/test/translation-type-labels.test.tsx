// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom

/**
 * One name per translation type, wherever staff read it.
 *
 * The Type column formatted `FoodItem` and `Generated` and let everything else
 * through unchanged, so a Shopping List row printed its stored value
 * `Generated (List)` — while the Types filter, the Find Missing dialog and the
 * backend's own "no queueable translations" message all called those same rows
 * `Generated (Shopping List)`. Three surfaces agreeing and the table
 * disagreeing reads as two different kinds of row rather than one.
 *
 * The parity test below is the point of this file. Asserting the column
 * renders "Generated (Shopping List)" would only prove I typed the same string
 * in two places; asserting it renders *the filter's own label for that value*
 * makes the agreement a contract. Add a sixth type to one and not the other
 * and this fails, which is exactly how the fifth one went unnoticed.
 *
 * Cells are rendered directly with `flexRender` rather than by mounting a
 * table, as `ai-configuration-lifecycle-badge.test.tsx` does.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { flexRender } from '@tanstack/react-table'

import { columns } from '@/components/translation-management/data-table/columns'
import { TRANSLATION_TYPE_OPTIONS } from '@/components/translation-management/TranslationList'
import type { Translation, TranslationType } from '@/types/translation'

const row = (type: TranslationType): Translation =>
  ({
    id: 1,
    originalText: 'Apples',
    translatedText: 'Manzanas',
    language: 'Spanish',
    type,
    status: 'completed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }) as Translation

/** Render one column's cell for one row, without mounting the whole table. */
const renderTypeCell = (type: TranslationType) => {
  const defs = columns({
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onRetry: vi.fn(),
    onToggleOriginal: vi.fn(),
    capabilities: undefined
  })
  const def: any = defs.find((candidate: any) => candidate.accessorKey === 'type')
  if (!def) throw new Error('no column with accessorKey "type"')

  const translation = row(type)
  const context: any = {
    row: { original: translation, getValue: (key: string) => (translation as any)[key] }
  }
  return render(<>{flexRender(def.cell, context)}</>)
}

describe('the Type column and the Types filter agree on every type', () => {
  test.each(TRANSLATION_TYPE_OPTIONS.map((option) => [option.value, option.label]))(
    'a %s row reads as "%s"',
    (value, label) => {
      const { container } = renderTypeCell(value as TranslationType)

      expect(container.textContent).toBe(label)
    }
  )

  test('every filterable type is covered by this parity check', () => {
    // Guards the guard: if the options list were ever emptied or renamed, the
    // table above would silently run zero cases and still pass.
    expect(TRANSLATION_TYPE_OPTIONS.length).toBeGreaterThanOrEqual(5)
  })
})

describe('the individual mappings', () => {
  test('a Shopping List row is named, not left as its stored value', () => {
    const { container } = renderTypeCell('Generated (List)' as TranslationType)

    expect(container.textContent).toBe('Generated (Shopping List)')
    expect(container.textContent).not.toBe('Generated (List)')
  })

  test('a document row still reads as before', () => {
    const { container } = renderTypeCell('Generated' as TranslationType)

    expect(container.textContent).toBe('Generated (Document)')
  })

  test('FoodItem still reads as Food Item', () => {
    const { container } = renderTypeCell('FoodItem' as TranslationType)

    expect(container.textContent).toBe('Food Item')
  })

  test('a type needing no formatting passes through unchanged', () => {
    const { container } = renderTypeCell('Custom' as TranslationType)

    expect(container.textContent).toBe('Custom')
  })
})
