// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useCallback, useEffect } from 'react'
import { Table } from '@tanstack/react-table'
import { TableSelectionState } from '@/types/table'

interface UseTableSelectionOptions<TData> {
  table: Table<TData>
  onSelectionChange?: (selected: TData[]) => void
}

export function useTableSelection<TData>({
  table,
  onSelectionChange,
}: UseTableSelectionOptions<TData>): TableSelectionState<TData> {
  const [selectedRows, setSelectedRows] = useState<TData[]>([])

  useEffect(() => {
    const rowSelectionState = table.getState().rowSelection;
    const selectedModel = table.getFilteredSelectedRowModel();
    const dataMap = (table.options.meta as any)?.dataMap;

    // Get selected data with proper mapping
    const selected = selectedModel.rows.map(row => {
      // Get the mapped data for this row
      const mappedData = dataMap?.get(parseInt(row.id, 10));

      // Prefer mapped data, fall back to original
      return mappedData || row.original;
    }).filter(data => {
      // Validate data object
      if (!data || typeof data !== 'object') {
        return false;
      }

      // Validate ID field
      if (!('id' in data)) {
        return false;
      }

      return true;
    });

    setSelectedRows(selected);
  }, [table.getState().rowSelection])

  const toggleRow = useCallback((row: TData) => {
    setSelectedRows((current) => {
      const isSelected = current.some(
        (selectedRow) => 
          // @ts-expect-error - We expect an id property but can't enforce it in the type
          selectedRow.id === (row as any).id
      )
      
      if (isSelected) {
        return current.filter(
          (selectedRow) => 
            // @ts-expect-error - We expect an id property but can't enforce it in the type
            selectedRow.id !== (row as any).id
        )
      }
      
      return [...current, row]
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedRows((current) => 
      current.length === table.getFilteredRowModel().rows.length
        ? []
        : table.getFilteredRowModel().rows.map(row => row.original)
    )
  }, [table])

  const isSelected = useCallback((row: TData) => 
    selectedRows.some(
      (selectedRow) => 
        // @ts-expect-error - We expect an id property but can't enforce it in the type
        selectedRow.id === (row as any).id
    )
  , [selectedRows])

  const clearSelection = useCallback(() => {
    setSelectedRows([])
  }, [])

  useEffect(() => {
    onSelectionChange?.(selectedRows)
  }, [selectedRows, onSelectionChange])

  return {
    selectedRows,
    toggleRow,
    toggleAll,
    isSelected,
    clearSelection,
  }
}