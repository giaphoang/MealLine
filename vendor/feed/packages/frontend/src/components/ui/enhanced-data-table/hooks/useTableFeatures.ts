// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, useRef, useImperativeHandle, useCallback, useEffect } from "react"
import {
  ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  RowSelectionState,
  PaginationState,
  TableMeta
} from "@tanstack/react-table"
import { TableSelectionOptions } from "@/types/table"

interface TableFeatureProps<TData> {
  data: TData[]
  columns: ColumnDef<TData>[]
  selection?: TableSelectionOptions<TData>
  ref?: React.ForwardedRef<{ clearSelection?: () => void }>
  initialState?: {
    sorting?: SortingState
    columnVisibility?: VisibilityState
    columnFilters?: ColumnFiltersState
    pagination?: PaginationState
  }
  defaultPageSize?: number
  autoResetPageIndex?: boolean
  meta?: TableMeta<TData>
}

export function useTableFeatures<TData>({
  data,
  columns,
  selection,
  ref,
  initialState,
  defaultPageSize = 5,
  autoResetPageIndex,
  meta,
}: TableFeatureProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialState?.columnVisibility || {}
  )
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    initialState?.columnFilters || []
  )

  // Use the provided default page size
  const [pagination, setPagination] = useState<PaginationState>(
    initialState?.pagination || { pageIndex: 0, pageSize: defaultPageSize }
  )
  const selectedRowsRef = useRef<TData[]>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination
    },
    autoResetPageIndex,
    enableRowSelection: selection?.enabled,
    meta,
  })

  const filteredRowCount = table.getFilteredRowModel().rows.length

  useEffect(() => {
    const maxPageIndex = Math.max(
      Math.ceil(filteredRowCount / pagination.pageSize) - 1,
      0
    )

    if (pagination.pageIndex <= maxPageIndex) {
      return
    }

    setPagination((current) => (
      current.pageIndex > maxPageIndex
        ? { ...current, pageIndex: maxPageIndex }
        : current
    ))
  }, [filteredRowCount, pagination.pageIndex, pagination.pageSize])

  const selectedRows = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original)

  selectedRowsRef.current = selectedRows

  const clearSelection = useCallback(() => {
    table.resetRowSelection()
  }, [table])

  useImperativeHandle(
    ref,
    () => ({
      clearSelection,
    }),
    [clearSelection]
  )

  return {
    table,
    pagination,
    setPagination,
    selection: selection?.enabled
      ? {
          selectedRows,
          clearSelection,
        }
      : undefined,
  }
}
