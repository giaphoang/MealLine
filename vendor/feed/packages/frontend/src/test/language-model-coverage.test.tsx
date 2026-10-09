// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { LanguageSelectionForm } from '@/components/language-management/language-selection-form'
import { useLanguageContext } from '@/contexts/LanguageContext'

const getActiveModelCoverage = vi.hoisted(() => vi.fn())

vi.mock('@/services/language', () => ({
  LanguageService: vi.fn(() => ({ getActiveModelCoverage }))
}))

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguageContext: vi.fn()
}))

vi.mock('@/services/error/ErrorHandlerService', () => ({
  ErrorHandlerService: { handleError: vi.fn() }
}))

describe('language selection model coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useLanguageContext).mockReturnValue({
      languages: [
        { id: 1, name: 'English', isEnabled: true, sortOrder: 1, createdAt: '', updatedAt: '' },
        { id: 2, name: 'Somali', isEnabled: false, sortOrder: 2, createdAt: '', updatedAt: '' }
      ],
      isLoading: false,
      isSaving: false,
      updateLanguages: vi.fn(),
      getTranslationCount: vi.fn()
    } as unknown as ReturnType<typeof useLanguageContext>)
    getActiveModelCoverage.mockResolvedValue({
      id: 'gemini-3.5-flash-lite',
      displayName: 'gemini-3.5-flash-lite',
      provider: 'Google',
      languages: { English: 'supported', Somali: 'unsupported' }
    })
  })

  test('warns at the moment an unsupported language is selected', async () => {
    render(<LanguageSelectionForm />)

    await waitFor(() => expect(getActiveModelCoverage).toHaveBeenCalled())
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])

    expect(screen.getByText('Not supported by gemini-3.5-flash-lite')).toBeTruthy()
  })
})
