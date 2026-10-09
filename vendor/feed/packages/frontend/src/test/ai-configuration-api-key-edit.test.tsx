// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom

/**
 * Editing an API key on an existing configuration.
 *
 * The field is write-only: the API never returns the key, so Edit opens with it
 * blank and blank means "keep the current one". That makes the save payload the
 * thing worth pinning down, because the backend distinguishes the two cases by
 * whether the property is present at all — `PUT /api/ai-config/:id` re-encrypts
 * when `apiKey !== undefined` and rejects an empty string with 400. Sending
 * `apiKey: ''` for an untouched field would therefore fail every edit that did
 * not change the key.
 */

import { render } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'

/** Only the parts of the base dialog's props these assertions reach for. */
interface CapturedDialogProps {
  initialData: ApiKeyConfigData
  onSave: (data: ApiKeyConfigData) => Promise<boolean>
}

const dialogCapture = vi.hoisted(() => ({
  props: null as CapturedDialogProps | null
}))

vi.mock('@/components/ai-configuration/shared/BaseAIConfigDialog', () => ({
  BaseAIConfigDialog: (props: CapturedDialogProps) => {
    dialogCapture.props = props
    return null
  }
}))

import { EditAIModelDialog } from '@/components/ai-configuration/EditAIModelDialog'
import type { AIConfiguration } from '@/components/ai-configuration/types'
import type { ApiKeyConfigData } from '@/components/ai-configuration/shared/types'

const configuration: AIConfiguration = {
  id: 7,
  name: 'OpenAI GPT-4',
  type: 'apikey',
  value: '',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  serviceType: 'OpenAI',
  model: 'gpt-4',
  modelName: 'gpt-4'
}

describe('Editing an API key', () => {
  beforeEach(() => {
    dialogCapture.props = null
  })

  const renderDialog = () => {
    const onSave = vi.fn().mockResolvedValue(true)
    render(
      <EditAIModelDialog
        open
        configuration={configuration}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    )

    const props = dialogCapture.props
    if (!props) throw new Error('BaseAIConfigDialog did not render')

    /** Save as the wizard would, with whatever the administrator left in the field. */
    const saveWithKey = (apiKey: string) => props.onSave({ ...props.initialData, apiKey })

    return { onSave, props, saveWithKey }
  }

  test('opens with the key blank rather than a fake value', () => {
    const { props } = renderDialog()

    // A prefilled placeholder string would be sent back as if it were a key.
    expect(props.initialData.apiKey).toBe('')
  })

  test('omits apiKey entirely when the field is left blank', async () => {
    const { onSave, saveWithKey } = renderDialog()

    await saveWithKey('')

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('apiKey')
  })

  test('omits apiKey when the field holds only whitespace', async () => {
    const { onSave, saveWithKey } = renderDialog()

    await saveWithKey('   ')

    expect(onSave.mock.calls[0][0]).not.toHaveProperty('apiKey')
  })

  test('sends the trimmed key when one is typed', async () => {
    const { onSave, saveWithKey } = renderDialog()

    await saveWithKey('  sk-replacement-key-value  ')

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-replacement-key-value' })
    )
  })
})
