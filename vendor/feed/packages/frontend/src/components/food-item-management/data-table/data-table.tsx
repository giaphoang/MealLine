// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import * as React from "react"
import { ColumnDef } from "@tanstack/react-table"
import { FoodItem } from "@/types/food-item"
import { EnhancedDataTable } from "@/components/ui/enhanced-data-table"
import { TableBulkAction } from "@/types/table"
import { useIsMobile } from "@/hooks/use-mobile"
import { useTableFeatures } from "@/components/ui/enhanced-data-table/hooks/useTableFeatures"

interface DataTableProps {
  columns: ColumnDef<FoodItem>[]
  data: FoodItem[]
  isLoading?: boolean
  bulkActions?: TableBulkAction<FoodItem>[]
  onSelectionChange?: (selected: FoodItem[]) => void
}

export function DataTable({
  columns,
  data,
  isLoading = false,
  bulkActions,
  onSelectionChange,
}: DataTableProps) {
  const isMobile = useIsMobile()
  const tableRef = React.useRef<{ clearSelection?: () => void }>(null)

  const { table } = useTableFeatures({
    ref: tableRef,
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
      pagination: {
        pageSize: 5,
        pageIndex: 0
      },
      columnVisibility: {
        categoryId: !isMobile,
        dietaryFlags: !isMobile,
        lastUpdated: !isMobile,
        limit: !isMobile,
        statusFlags: !isMobile,
      },
    },
  })

  // Update column visibility when screen size changes
  React.useEffect(() => {
    table.getColumn('categoryId')?.toggleVisibility(!isMobile)
    table.getColumn('dietaryFlags')?.toggleVisibility(!isMobile)
    table.getColumn('lastUpdated')?.toggleVisibility(!isMobile)
    table.getColumn('limit')?.toggleVisibility(!isMobile)
    table.getColumn('statusFlags')?.toggleVisibility(!isMobile)
  }, [isMobile, table])

  return (
    <EnhancedDataTable
      ref={tableRef}
      columns={columns}
      data={data}
      isLoading={isLoading}
      filterColumn="name"
      filterPlaceholder="Filter food items..."
      selection={{
        enabled: true,
        selectionColumn: true,
        onSelectionChange,
        bulkActions,
      }}
      enableColumnVisibility={true}
      enableFiltering={true}
    />
  )
}
