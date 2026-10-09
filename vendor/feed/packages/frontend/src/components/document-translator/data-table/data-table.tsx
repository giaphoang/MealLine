// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Document } from "../types"
import { EnhancedDataTable } from "@/components/ui/enhanced-data-table"
import { TableBulkAction } from "@/types/table"
import { useIsMobile } from "@/hooks/use-mobile"

interface DataTableProps {
  columns: ColumnDef<Document>[]
  data: Document[]
  isLoading?: boolean
  bulkActions?: TableBulkAction<Document>[]
  onSelectionChange?: (selected: Document[]) => void
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

  return (
    <EnhancedDataTable
      ref={tableRef}
      columns={columns}
      data={data}
      isLoading={isLoading}
      filterColumn="name"
      filterPlaceholder="Filter documents..."
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