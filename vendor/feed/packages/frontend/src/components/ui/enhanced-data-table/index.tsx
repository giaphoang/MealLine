// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react"
import { ColumnDef } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { useTableFeatures } from "./hooks/useTableFeatures"
import { TableFeatureBar } from "./components/TableFeatureBar"
import { flexRender } from "@tanstack/react-table"
import { TablePagination } from "./components/TablePagination"
import { TableSelectionOptions } from "@/types/table"
import { useIsMobile } from "@/hooks/use-mobile"
import { TranslationType } from "@/types/translation"
import type { TypeFilterOption } from "@/components/ui/type-filter"
import {
  calculateColumnWidths,
  calculateVisibleColumnWidths,
  getColumnWidthStyle,
} from "@/lib/table"

const mobileResponsiveColumnIds = [
  'lastUpdated',
  'dietaryFlags',
  'categoryId',
  'type',
  'language',
  'status',
  'limit',
  'statusFlags',
]

interface EnhancedDataTableProps<TData, TType extends string = TranslationType> {
  columns: ColumnDef<TData>[]
  data: TData[]
  isLoading?: boolean
  /**
   * What to show when there are no rows.
   *
   * Defaults to the generic line. Worth overriding wherever the table is a
   * known set rather than a search result — "No one is on the roster yet."
   * tells an administrator the roster is empty; "No results found." suggests
   * their filter is wrong.
   */
  emptyMessage?: string
  filterColumn?: string
  filterPlaceholder?: string
  enableColumnVisibility?: boolean
  enableFiltering?: boolean
  enableLanguageFilter?: boolean
  enableTypeFilter?: boolean
  selectedLanguage?: string
  selectedTypes?: TType[]
  typeOptions?: readonly TypeFilterOption<TType>[]
  availableLanguages?: string[]
  onLanguageChange?: (language: string) => void
  onTypeChange?: (types: TType[]) => void
  className?: string
  selection?: TableSelectionOptions<TData>
  defaultPageSize?: number
  preservePageOnDataChange?: boolean
  onUpdate?: (item: TData) => Promise<void>
  toolbarActions?: Array<{
    label: string
    // TableFeatureBar intentionally accepts both Lucide and animate-ui icons.
    icon?: React.ComponentType<any>
    // 'outline', not 'outline-solid'. The Tailwind v4 codemod rewrote this union
    // member as though it were a utility class name (that rename is real for
    // classes, not for these values), leaving a variant Button does not accept
    // while every caller passed 'outline'.
    variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
    action: () => void
    title?: string
    /** Optional trigger ref for dialogs that must restore focus on close. */
    buttonRef?: React.Ref<HTMLButtonElement>
  }>
  toolbarControls?: React.ReactNode
  /**
   * Publishes the table's live view state: filter, sort, visible columns, and
   * page.
   *
   * Reports need this. A table card must reproduce what the user configured, and
   * that configuration lives in here — not in the page that rendered the table.
   * Published as state rather than as resolved rows because a saved template
   * regenerates months later with no client to resolve anything.
   */
  onViewStateChange?: (state: {
    search: string
    sort: { id: string; desc: boolean } | null
    visibleColumns: string[]
    pageSize: number
    pageIndex: number
  }) => void
}

/** Imperative handle callers may reach for to clear the current selection. */
export interface EnhancedDataTableHandle {
  clearSelection?: () => void
}

const EnhancedDataTableInner = React.forwardRef(function EnhancedDataTable<
  TData,
  TType extends string = TranslationType
>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'No results found.',
  filterColumn,
  filterPlaceholder,
  enableColumnVisibility = true,
  enableFiltering = true,
  enableLanguageFilter = false,
  enableTypeFilter = false,
  selectedLanguage,
  selectedTypes,
  availableLanguages,
  onLanguageChange,
  onTypeChange,
  typeOptions,
  className,
  selection,
  defaultPageSize = 5,
  preservePageOnDataChange = true,
  onUpdate,
  toolbarActions,
  toolbarControls,
  onViewStateChange,
}: EnhancedDataTableProps<TData, TType>, ref: React.ForwardedRef<EnhancedDataTableHandle>) {
  const isMobile = useIsMobile()
  const responsiveColumnVisibility = React.useMemo(() => {
    const availableColumnIds = new Set(
      columns.map((column, index) => {
        if ('id' in column && typeof column.id === 'string') {
          return column.id
        }

        if ('accessorKey' in column && typeof column.accessorKey === 'string') {
          return column.accessorKey
        }

        return `col-${index}`
      })
    )

    return Object.fromEntries(
      mobileResponsiveColumnIds
        .filter((columnId) => availableColumnIds.has(columnId))
        .map((columnId) => [columnId, !isMobile])
    )
  }, [columns, isMobile])

  const { table, selection: tableSelection } = useTableFeatures({
    ref,
    data,
    columns,
    selection,
    defaultPageSize,
    autoResetPageIndex: preservePageOnDataChange ? false : undefined,
    initialState: {
      columnVisibility: responsiveColumnVisibility,
    },
    meta: {
      onUpdate,
    },
  })


  // Published after render, from the table itself, so it reflects what is on
  // screen rather than what a caller believes it configured.
  const state = table.getState()
  const searchValue = filterColumn
    ? ((table.getColumn(filterColumn)?.getFilterValue() as string) ?? '')
    : ''
  const sortKey = state.sorting[0]
  const visibleKey = table
    .getVisibleLeafColumns()
    .map(column => column.id)
    .join(',')

  React.useEffect(() => {
    onViewStateChange?.({
      search: searchValue,
      sort: sortKey ? { id: sortKey.id, desc: Boolean(sortKey.desc) } : null,
      visibleColumns: visibleKey ? visibleKey.split(',') : [],
      pageSize: state.pagination.pageSize,
      pageIndex: state.pagination.pageIndex,
    })
    // Primitive deps only: the objects behind them are new on every render, so
    // depending on those would loop.
  }, [
    onViewStateChange,
    searchValue,
    sortKey?.id,
    sortKey?.desc,
    visibleKey,
    state.pagination.pageSize,
    state.pagination.pageIndex,
  ])

  // Update column visibility when screen size changes
  React.useEffect(() => {
    Object.keys(responsiveColumnVisibility).forEach((columnId) => {
      table.getColumn(columnId)?.toggleVisibility(!isMobile)
    })
  }, [isMobile, responsiveColumnVisibility, table])

  const handlePageSizeChange = (newPageSize: number) => {
    // If we're changing page size and the current page would be out of bounds,
    // this ensures we adjust to a valid page
    const currentPageIndex = table.getState().pagination.pageIndex
    const maxPageIndex = Math.ceil(data.length / newPageSize) - 1
    
    if (currentPageIndex > maxPageIndex && maxPageIndex >= 0) {
      table.setPageIndex(maxPageIndex)
    }
  }

  /**
   * Column widths, resolved here rather than by each caller.
   *
   * This used to run only on mobile; on desktop the table fell back to
   * `meta.style`, which every column file had to compute and assign by hand.
   * Seven did and nine did not, and the nine got `table-layout: fixed`'s even
   * split — eight columns at exactly 262px, whatever their declared `size`.
   * `size` looked like the knob and was inert, which is a trap rather than an
   * API.
   *
   * Computing it from the visible leaf columns on every viewport makes `size`
   * mean what it appears to mean, and makes it impossible for a new table to
   * forget. `meta.style` stays as an explicit per-column override.
   */
  const visibleColumnSizes = table.getVisibleLeafColumns().map((column) => ({
    id: column.id,
    size: column.columnDef.size ?? 100,
    isFixed: column.id === 'select' || column.id === 'actions',
  }))

  /*
   * Plain percentages on desktop, `calc()` only when columns are hidden.
   *
   * `calculateVisibleColumnWidths` subtracts each flexible column's share of
   * the fixed pixel total, which is arithmetically tidier — and a fixed-layout
   * table does not resolve a percentage inside `calc()`, so every column
   * silently collapsed to an equal split. Consolidating these two call sites
   * introduced exactly that: Data Management went back to eight equal columns
   * while its inline styles still read `calc(17.17% - 12.36px)`, which is a
   * particularly good disguise.
   *
   * The plain percentages slightly over-declare (they ignore the fixed columns'
   * pixels, so the total exceeds 100%) and the browser scales them down
   * proportionally, which is the behaviour every table shipped with.
   */
  const resolvedColumnStyles = isMobile
    ? calculateVisibleColumnWidths(visibleColumnSizes)
    : Object.fromEntries(
        Object.entries(calculateColumnWidths(visibleColumnSizes)).map(
          ([id, width]) => [id, getColumnWidthStyle(width)]
        )
      )

  const columnStyle = (
    column: ReturnType<typeof table.getVisibleLeafColumns>[number]
  ) => column.columnDef.meta?.style ?? resolvedColumnStyles[column.id]

  /**
   * Alignment, applied to the header and the cells from one declaration.
   *
   * Reading it per column rather than per cell is the point: right-aligning a
   * cell while leaving its header left-aligned is exactly the defect this
   * replaces, and that combination is no longer expressible.
   */
  const alignClass = (
    column: ReturnType<typeof table.getVisibleLeafColumns>[number]
  ) => (column.columnDef.meta?.align === 'right' ? 'text-right' : undefined)

  if (isLoading) {
    return (
      <div className={cn("space-y-4 w-full", className)} data-testid="enhanced-table-container">
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        <Skeleton className="h-6 w-20" role="status" />
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: columns.length }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-6 w-20" role="status" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      <TableFeatureBar
        table={table}
        filterColumn={filterColumn}
        filterPlaceholder={filterPlaceholder}
        enableColumnVisibility={enableColumnVisibility}
        enableFiltering={enableFiltering}
        enableLanguageFilter={enableLanguageFilter}
        enableTypeFilter={enableTypeFilter}
        selectedLanguage={selectedLanguage}
        selectedTypes={selectedTypes}
        typeOptions={typeOptions}
        availableLanguages={availableLanguages}
        onLanguageChange={onLanguageChange}
        onTypeChange={onTypeChange}
        bulkActions={selection?.bulkActions}
        toolbarActions={toolbarActions}
        toolbarControls={toolbarControls}
        selectedRows={tableSelection?.selectedRows}
        onClearSelection={tableSelection?.clearSelection}
      />
      <div className="rounded-md border w-full overflow-x-auto relative" data-testid="table-wrapper">
        <div className="min-w-full">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={columnStyle(header.column)}
                      className={alignClass(header.column)}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      row.getIsSelected() && "bg-muted/50"
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={columnStyle(cell.column)}
                        className={alignClass(cell.column)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center py-4 sm:py-6"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <div data-testid="pagination-controls">
        <TablePagination 
          table={table} 
          pageSize={table.getState().pagination.pageSize} 
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </div>
  )
})

/**
 * `React.forwardRef` is not generic-transparent: its type signature has no
 * type parameter to thread `TData` through, so the component it returns is
 * `ForwardRefExoticComponent<EnhancedDataTableProps<unknown> & …>` and every
 * caller passing real columns fails with `ColumnDef<Category>[]` not being
 * assignable to `ColumnDef<unknown>[]`.
 *
 * That single erasure accounted for 52 of the frontend's 227 type errors, and
 * it was the mechanism by which the count kept *growing* — each new table
 * copied the pattern and contributed three more (docs/TSC-DEBT.md records
 * 240 → 292 → 300). Restating the public type restores what the
 * implementation already does correctly. It is a type-level assertion only:
 * the runtime value is the same component, and nothing about rendering,
 * refs, or props changes.
 *
 * The prop is typed `React.Ref`, not `React.ForwardedRef`: the latter is what
 * the render function receives (and admits only a mutable ref object), while
 * a caller's `useRef<Handle>(null)` produces a `RefObject` that only `Ref`
 * accepts.
 *
 * The cast is the standard remedy for generic `forwardRef` components. The
 * alternative — dropping `forwardRef` and taking `ref` as an ordinary prop —
 * would be the cleaner shape under React 19, but it changes the call
 * signature at eighteen call sites for no behavioural gain.
 */
export const EnhancedDataTable = EnhancedDataTableInner as <
  TData,
  TType extends string = TranslationType
>(
  props: EnhancedDataTableProps<TData, TType> & {
    ref?: React.Ref<EnhancedDataTableHandle>
  }
) => React.ReactElement
