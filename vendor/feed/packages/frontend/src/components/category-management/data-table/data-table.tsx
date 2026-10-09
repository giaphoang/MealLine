// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import * as React from "react"
import { flexRender, ColumnDef } from "@tanstack/react-table"
import { TableFeatureBar } from "@/components/ui/enhanced-data-table/components/TableFeatureBar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Category } from "@/types/category"
import { useTableFeatures } from "@/components/ui/enhanced-data-table/hooks/useTableFeatures"
import { TableBulkAction } from "@/types/table"

interface DataTableProps {
  columns: ColumnDef<Category>[]
  data: Category[]
  isLoading?: boolean
  bulkActions?: TableBulkAction<Category>[]
  onSelectionChange?: (selected: Category[]) => void
}

export function DataTable({
  columns,
  data,
  isLoading = false,
  bulkActions,
  onSelectionChange,
}: DataTableProps) {
  const {
    table,
    selection
  } = useTableFeatures({
    data,
    columns,
    selection: {
      enabled: true,
      selectionColumn: true,
      onSelectionChange,
      bulkActions,
    },
    autoResetPageIndex: false,
    initialState: {
      columnVisibility: {
        lastUpdated: false
      }
    }
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        <Skeleton className="h-6 w-20" />
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
                      <Skeleton className="h-6 w-20" />
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
    <div className="space-y-4">
      <TableFeatureBar
        table={table}
        filterColumn="name"
        filterPlaceholder="Filter categories..."
        bulkActions={bulkActions}
        selectedRows={selection?.selectedRows ?? []}
        onClearSelection={selection?.clearSelection ?? (() => undefined)}
      />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={header.column.columnDef.meta?.style}>
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
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} style={cell.column.columnDef.meta?.style}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No categories found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between space-x-2">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
