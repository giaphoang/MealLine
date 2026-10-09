// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EnhancedDataTable } from '@/components/ui/enhanced-data-table'
import { builderTemplateColumns } from '@/components/shopping-lists/data-table/builder-template-columns'
import { SavedBuilderTemplate } from '@/components/shopping-lists/builder/types'

const savedTemplate: SavedBuilderTemplate = {
  id: 1,
  name: 'Pantry Template',
  createdAt: '2026-04-29T00:00:00Z',
  updatedAt: '2026-04-29T00:00:00Z',
  templateData: {
    id: 'pantry-template',
    name: 'Pantry Template',
    paper: { size: 'letter', width: 612, height: 792, unit: 'pt' },
    components: [
      {
        id: 'dry-goods',
        type: 'section-table',
        name: 'Dry Goods inventory table',
        title: 'Dry Goods',
        x: 0,
        y: 54,
        width: 253,
        height: 72,
        rows: [],
        showLimit: true,
        limitHeader: 'Limit',
        wantHeader: 'Want',
        limitWidth: 54,
        wantWidth: 45,
        fontSize: 9,
        rowHeight: 18,
        alternateRows: true,
        inventorySource: {
          categoryId: 1,
          categoryName: 'Dry Goods',
          generatedAt: '2026-04-29T00:00:00Z',
        },
      },
    ],
  },
}

describe('builderTemplateColumns', () => {
  it('renders saved template section boxes in the details column', () => {
    render(
      <EnhancedDataTable
        columns={builderTemplateColumns({
          onRename: vi.fn(),
          onDelete: vi.fn(),
          onDuplicate: vi.fn(),
          onEdit: vi.fn(),
          onPrint: vi.fn(),
          onDownloadPdf: vi.fn(),
          onTranslateAndDownloadPdf: vi.fn(),
        })}
        data={[savedTemplate]}
        enableFiltering={false}
        selection={{ enabled: true, selectionColumn: true, bulkActions: [] }}
      />
    )

    expect(screen.getByText('1 live inventory section')).toBeInTheDocument()
    expect(screen.getByText('Dry Goods')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Select row'))
    expect(screen.getByText('1 of 1 row(s) selected.')).toBeInTheDocument()
  })
})
