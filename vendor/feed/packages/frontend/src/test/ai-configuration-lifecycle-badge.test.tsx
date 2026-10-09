// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom

/**
 * Telling staff a saved configuration is running out of time.
 *
 * Defect 10 of ISSUES.md #84: a configuration pointing at a shut-down model
 * looked exactly like one pointing at a current model. Nothing in the list
 * read `lifecycle`, so the first sign of trouble was a failed translation,
 * reported as a provider error rather than as "this model no longer exists".
 *
 * The case that matters is production's own row. `gpt-5-mini-2025-08-07` is
 * what FEED runs, it is no longer offered as a preset, and OpenAI shuts it
 * down on 2026-12-11 — so it must say so while there is still time to move.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { flexRender } from '@tanstack/react-table'

import { columns } from '@/components/ai-configuration/data-table/columns'
import type { CatalogueModel } from '@/components/ai-configuration/types'
import type { UnifiedConfiguration } from '@/services/unified-config'

const model = (
  id: string,
  lifecycle: Record<string, unknown>,
  costTier: 'economy' | 'standard' | 'frontier' = 'economy',
  pricing: { input: number; output: number } = { input: 1, output: 1 }
): CatalogueModel =>
  ({
    id,
    displayName: id,
    provider: 'OpenAI',
    pricing: { ...pricing, verifiedAt: '2026-09-12' },
    contextWindow: 1000,
    maxOutputTokens: 1000,
    lifecycle,
    costTier,
    capabilities: {
      sampling: 'unsupported',
      maxTokensField: 'max_completion_tokens',
      reasoning: { kind: 'none' },
      prefill: 'allowed',
    },
  }) as unknown as CatalogueModel

const CATALOGUE: Record<string, CatalogueModel> = {
  'gpt-5-mini-2025-08-07': model('gpt-5-mini-2025-08-07', {
    status: 'deprecated',
    shutdownDate: '2026-12-11',
    replacement: 'gpt-5.6-terra',
  }),
  'gemini-2.5-flash-lite': model('gemini-2.5-flash-lite', {
    status: 'deprecated',
    replacement: 'gemini-3.5-flash-lite',
  }),
  'gemini-3-pro-preview': model('gemini-3-pro-preview', {
    status: 'retired',
    shutdownDate: '2026-03-09',
    replacement: 'gemini-3.1-pro-preview',
  }),
  'gemini-3.1-pro-preview': model('gemini-3.1-pro-preview', { status: 'preview' }),
  'gpt-5.6-luna': model('gpt-5.6-luna', { status: 'active' }),
  // Active and frontier at once — the case that proves the two notices are
  // independent rather than either/or (D1/D7).
  'gpt-6-astra': model('gpt-6-astra', { status: 'active' }, 'frontier', {
    input: 10,
    output: 50,
  }),
  // Frontier *and* on its way out, so both badges must appear together.
  'claude-opus-4-5-20251101': model(
    'claude-opus-4-5-20251101',
    { status: 'deprecated', shutdownDate: '2026-11-24', replacement: 'claude-opus-5' },
    'frontier',
    { input: 5, output: 25 }
  ),
}

const findModel = (id?: string | null) => (id ? CATALOGUE[id] : undefined)

const row = (overrides: Partial<UnifiedConfiguration> = {}): UnifiedConfiguration =>
  ({
    id: 'apikey-1',
    name: 'Production',
    type: 'apikey',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    serviceType: 'OpenAI',
    modelName: 'gpt-5-mini',
    model: 'gpt-5-mini-2025-08-07',
    ...overrides,
  }) as UnifiedConfiguration

/** Render one column's cell for one row, without mounting the whole table. */
const renderCell = (accessorKey: string, config: UnifiedConfiguration) => {
  const defs = columns({
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleActive: vi.fn(),
    findModel,
  })
  const def: any = defs.find((d: any) => d.accessorKey === accessorKey)
  if (!def) throw new Error(`no column with accessorKey ${accessorKey}`)
  const context: any = {
    row: { original: config, getValue: (key: string) => (config as any)[key] },
  }
  return render(<>{flexRender(def.cell, context)}</>)
}

describe('what the configuration list says about a model’s remaining life', () => {
  test('production’s model shows its shutdown date rather than looking healthy', () => {
    renderCell('isActive', row())

    // Still active — the configuration works today, and saying otherwise
    // would be its own lie.
    expect(screen.getByText('Active')).toBeTruthy()
    // And it ends on a date staff can act on.
    expect(screen.getByText('Ends 2026-12-11')).toBeTruthy()
  })

  test('the description names the date and where to go', () => {
    renderCell('description', row())

    expect(
      screen.getByText(/gpt-5-mini-2025-08-07 stops working on 2026-12-11\. Move to gpt-5\.6-terra\./)
    ).toBeTruthy()
  })

  test('a deprecated model with no date is a warning, not a deadline', () => {
    // gemini-2.5-flash-lite is refused to new projects but has no announced
    // shutdown. Inventing a date would be worse than saying none exists.
    renderCell('isActive', row({ model: 'gemini-2.5-flash-lite', serviceType: 'Google' }))

    expect(screen.getByText('Deprecated')).toBeTruthy()
    expect(screen.queryByText(/Ends /)).toBeNull()
  })

  test('a retired model says requests fail', () => {
    renderCell('description', row({ model: 'gemini-3-pro-preview', serviceType: 'Google' }))

    expect(screen.getByText(/has been shut down and requests to it fail/)).toBeTruthy()
  })

  test('a preview model is flagged as one', () => {
    renderCell('isActive', row({ model: 'gemini-3.1-pro-preview', serviceType: 'Google' }))

    expect(screen.getByText('Preview')).toBeTruthy()
  })

  test('a current model gets no lifecycle badge at all', () => {
    // The list must stay quiet when there is nothing to say, or the badges
    // become wallpaper.
    renderCell('isActive', row({ model: 'gpt-5.6-luna' }))

    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.queryByText(/Ends |Deprecated|Retired|Preview/)).toBeNull()
  })

  test('the table renders unchanged before the catalogue arrives', () => {
    // `findModel` is optional precisely so a pending or failed fetch cannot
    // blank the list. Omitting it must behave like a model with nothing to say.
    const defs = columns({ onEdit: vi.fn(), onDelete: vi.fn(), onToggleActive: vi.fn() })
    const def: any = defs.find((d: any) => d.accessorKey === 'isActive')
    const config = row()
    render(
      <>
        {flexRender(def.cell, {
          row: { original: config, getValue: (key: string) => (config as any)[key] },
        } as any)}
      </>
    )

    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.queryByText(/Ends /)).toBeNull()
  })

  test('a frontier model is flagged as expensive even though nothing is wrong with it', () => {
    // D1/D7. `gpt-6-astra` is current and healthy — the warning is about
    // $50 per 1M output tokens against work that costs a few dozen.
    renderCell('isActive', row({ model: 'gpt-6-astra' }))

    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getByText('Expensive')).toBeTruthy()
    // And no lifecycle badge, because there is nothing wrong with its life.
    expect(screen.queryByText(/Ends |Deprecated|Retired|Preview/)).toBeNull()
  })

  test('a model can be both expensive and expiring, and says both', () => {
    // The two notices answer different questions, so one must not hide the
    // other. Opus 4.5 is withdrawn from the presets and costs $25/1M out.
    renderCell('isActive', row({ model: 'claude-opus-4-5-20251101', serviceType: 'Anthropic' }))

    expect(screen.getByText('Ends 2026-11-24')).toBeTruthy()
    expect(screen.getByText('Expensive')).toBeTruthy()
  })

  test('a system prompt row is never given a model badge', () => {
    // Prompts have no `model`, and looking one up would be meaningless.
    renderCell('isActive', row({ type: 'prompt', model: undefined, modelName: undefined }))

    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.queryByText(/Ends |Deprecated|Retired|Preview/)).toBeNull()
  })
})
