// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'

const dialogCapture = vi.hoisted(() => ({ props: null as any }))

vi.mock('@/components/ai-configuration/shared/BaseAIConfigDialog', () => ({
  BaseAIConfigDialog: (props: any) => {
    dialogCapture.props = props
    return null
  }
}))

import { AddAIModelDialog } from '@/components/ai-configuration/AddAIModelDialog'
import { EditAIModelDialog } from '@/components/ai-configuration/EditAIModelDialog'

describe('Thinking level dialog integration', () => {
  beforeEach(() => {
    dialogCapture.props = null
  })

  test('AddAIModelDialog leaves thinkingLevel unset so the model decides', () => {
    // This asserted `'high'`, which is what the dialog did and what D2 in
    // docs/ai-config/model-catalogue-refresh-2026-09.md reverses: default to
    // off, or the lowest level a model allows. That is per-model — `low` for a
    // model that cannot disable thinking, nothing at all for a model with no
    // reasoning control — so the dialog cannot pick it. Sending no level lets
    // the backend resolve the cheapest one the chosen model accepts.
    render(
      <AddAIModelDialog
        open={true}
        onOpenChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
      />
    )

    expect(dialogCapture.props.initialData.thinkingLevel).toBeNull()
  })

  test('AddAIModelDialog trims a custom model id before saving', () => {
    // Edit has always trimmed; Add stored the id raw, so a pasted trailing
    // space became part of the model name and every request for it failed.
    const onSave = vi.fn().mockResolvedValue(true)
    render(
      <AddAIModelDialog
        open={true}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    )

    return dialogCapture.props
      .onSave({
        ...dialogCapture.props.initialData,
        model: 'Custom',
        customModel: '  gemini-3.5-flash-lite  ',
        modelName: 'Custom',
        customModelName: '  My Model  '
      })
      .then(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            model: 'gemini-3.5-flash-lite',
            modelName: 'My Model'
          })
        )
      })
  })

  test('AddAIModelDialog includes thinkingLevel in save payload', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(
      <AddAIModelDialog
        open={true}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    )

    const payload = {
      ...dialogCapture.props.initialData,
      thinkingLevel: 'low'
    }

    await dialogCapture.props.onSave(payload)

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ thinkingLevel: 'low' }))
  })

  test('EditAIModelDialog loads existing thinkingLevel', () => {
    render(
      <EditAIModelDialog
        open={true}
        configuration={{
          id: 1,
          name: 'Gemini',
          type: 'apikey',
          value: '',
          isActive: true,
          createdAt: '2025-12-01T00:00:00.000Z',
          updatedAt: '2025-12-01T00:00:00.000Z',
          serviceType: 'Google',
          modelName: 'gemini-3-flash-preview',
          model: 'gemini-3-flash-preview',
          thinkingLevel: 'medium'
        }}
        onOpenChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
      />
    )

    expect(dialogCapture.props.initialData.thinkingLevel).toBe('medium')
    expect(dialogCapture.props.existingData.thinkingLevel).toBe('medium')
  })

  test('EditAIModelDialog preserves null thinkingLevel on save', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(
      <EditAIModelDialog
        open={true}
        configuration={{
          id: 2,
          name: 'Gemini',
          type: 'apikey',
          value: '',
          isActive: true,
          createdAt: '2025-12-01T00:00:00.000Z',
          updatedAt: '2025-12-01T00:00:00.000Z',
          serviceType: 'Google',
          modelName: 'gemini-3-flash-preview',
          model: 'gemini-3-flash-preview',
          thinkingLevel: null
        }}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    )

    const payload = {
      ...dialogCapture.props.initialData,
      thinkingLevel: null
    }

    await dialogCapture.props.onSave(payload)

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ thinkingLevel: null }))
  })
})
