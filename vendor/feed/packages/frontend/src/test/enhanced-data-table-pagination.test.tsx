// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTableFeatures } from '@/components/ui/enhanced-data-table/hooks/useTableFeatures'
import { EnhancedDataTable } from '@/components/ui/enhanced-data-table'

interface TestItem {
  id: number
  name: string
}

const columns: ColumnDef<TestItem>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
]

function createItems(count: number): TestItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Food ${index + 1}`,
  }))
}

function TableHarness() {
  const [items, setItems] = React.useState<TestItem[]>(() => createItems(8))
  const { table } = useTableFeatures({
    data: items,
    columns,
    defaultPageSize: 5,
    autoResetPageIndex: false,
  })

  const pagination = table.getState().pagination

  return (
    <div>
      <p data-testid="page-index">{pagination.pageIndex}</p>
      <ul>
        {table.getRowModel().rows.map((row) => (
          <li key={row.original.id}>{row.original.name}</li>
        ))}
      </ul>
      <button type="button" onClick={() => table.nextPage()}>
        Next
      </button>
      <button type="button" onClick={() => setItems((current) => [...current])}>
        Refresh Data
      </button>
      <button type="button" onClick={() => setItems(createItems(3))}>
        Shrink Data
      </button>
    </div>
  )
}

function EnhancedTableHarness() {
  const [items, setItems] = React.useState<TestItem[]>(() => createItems(8))

  return (
    <div>
      <EnhancedDataTable
        columns={columns}
        data={items}
        filterColumn="name"
        filterPlaceholder="Filter test items..."
      />
      <button type="button" onClick={() => setItems((current) => [...current])}>
        Refresh Data
      </button>
    </div>
  )
}

describe('useTableFeatures pagination preservation', () => {
  it('preserves current page when data changes and auto reset is disabled', async () => {
    render(<TableHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByTestId('page-index')).toHaveTextContent('1')
    expect(screen.getByText('Food 6')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh Data' }))

    await waitFor(() => {
      expect(screen.getByTestId('page-index')).toHaveTextContent('1')
      expect(screen.getByText('Food 6')).toBeInTheDocument()
    })
  })

  it('clamps preserved pagination when the current page no longer exists', async () => {
    render(<TableHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByTestId('page-index')).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('button', { name: 'Shrink Data' }))

    await waitFor(() => {
      expect(screen.getByTestId('page-index')).toHaveTextContent('0')
      expect(screen.getByText('Food 1')).toBeInTheDocument()
    })
  })
})

describe('EnhancedDataTable pagination preservation', () => {
  it('preserves current page by default when refreshed data is replaced', async () => {
    render(<EnhancedTableHarness />)

    fireEvent.click(screen.getByRole('link', { name: '2' }))
    expect(screen.getByText('Food 6')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh Data' }))

    await waitFor(() => {
      expect(screen.getByText('Food 6')).toBeInTheDocument()
    })
  })
})
