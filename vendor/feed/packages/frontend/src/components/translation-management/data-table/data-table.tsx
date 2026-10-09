// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import * as React from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Translation } from "@/types/translation"
import { TableBulkAction } from "@/types/table"
import { EnhancedDataTable } from "@/components/ui/enhanced-data-table"
import { useIsMobile } from "@/hooks/use-mobile"
import { useTableFeatures } from "@/components/ui/enhanced-data-table/hooks/useTableFeatures"

interface DataTableProps {
  columns: ColumnDef<Translation>[]
  data: Translation[]
  isLoading?: boolean
  bulkActions?: TableBulkAction<Translation>[]
  onSelectionChange?: (selected: Translation[]) => void
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
        language: !isMobile,
        type: !isMobile,
        lastUpdated: !isMobile,
        status: true, // Keep status visible by default
      },
    },
  })

  // Update column visibility when screen size changes
  React.useEffect(() => {
    table.getColumn('language')?.toggleVisibility(!isMobile)
    table.getColumn('type')?.toggleVisibility(!isMobile)
    table.getColumn('lastUpdated')?.toggleVisibility(!isMobile)
    // We don't automatically toggle status visibility based on screen size
    // because it's an important column that we want to keep visible by default
  }, [isMobile, table])

  return (
    <EnhancedDataTable
      ref={tableRef}
      columns={columns}
      data={data}
      isLoading={isLoading}
      filterColumn="originalText"
      filterPlaceholder="Filter translations..."
      selection={{
        enabled: true,
        selectionColumn: true,
        onSelectionChange,
        bulkActions,
      }}
    />
  )
}
