// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react";
import { Table } from "@tanstack/react-table"

export interface TableRowAction {
  label: string
  icon?: React.ComponentType<{ className?: string; size?: number }>
  onClick: () => void
  variant?: 'default' | 'destructive'
  disabled?: boolean
  className?: string
  /** Native HTML title attribute applied to the menu item (tooltip text) */
  title?: string
}

export interface TableActionMenuProps {
  actions: TableRowAction[]
  triggerLabel?: string
  isLoading?: boolean
  size?: 'default' | 'sm'
  align?: 'start' | 'end'
}

export interface TableBulkAction<TData = unknown> {
  label: string
  icon?: React.ComponentType<{ className?: string; size?: number }>
  action: (selected: TData[]) => Promise<void> | void
  variant?: 'default' | 'destructive'
  disabled?: boolean
}

export interface TableSelectionState<TData> {
  selectedRows: TData[]
  toggleRow: (row: TData) => void
  toggleAll: () => void
  isSelected: (row: TData) => boolean
  clearSelection: () => void
}

export interface TableSelectionOptions<TData> {
  enabled?: boolean
  selectionColumn?: boolean
  onSelectionChange?: (selected: TData[]) => void
  bulkActions?: TableBulkAction<TData>[]
}

export interface UseTableFeaturesOptions<TData> {
  data: TData[]
  columns: any[]
  selection?: TableSelectionOptions<TData>
}