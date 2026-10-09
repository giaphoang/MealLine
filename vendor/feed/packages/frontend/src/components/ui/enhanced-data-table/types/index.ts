// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { ColumnDef, Table } from "@tanstack/react-table"

export interface TableFeatureProps<TData> {
  table: Table<TData>
  filterColumn?: string
  filterPlaceholder?: string
  enableColumnVisibility?: boolean
  enableFiltering?: boolean
}

export interface UseTableFeaturesOptions<TData> {
  data: TData[]
  columns: ColumnDef<TData>[]
  initialVisibility?: Record<string, boolean>
  initialFilters?: Record<string, any>
}

export interface TableFeatureBarProps<TData> extends TableFeatureProps<TData> {
  className?: string
}