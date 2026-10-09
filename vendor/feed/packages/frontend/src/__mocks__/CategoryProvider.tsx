// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import { CategoryContext } from '@/contexts/CategoryContext'

const mockCategories = [
  {
    id: 1,
    name: 'Test Category',
    limit: 10,
    createdAt: '2025-01-20T12:00:00Z',
    updatedAt: '2025-01-20T12:00:00Z'
  }
]

export const CategoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <CategoryContext.Provider
      value={{
        categories: mockCategories,
        isLoading: false,
        error: null,
        refresh: vi.fn(),
      }}
    >
      {children}
    </CategoryContext.Provider>
  )
}