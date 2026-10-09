// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { ColumnDef } from "@tanstack/react-table"

/**
 * Column width calculation utilities for table truncation
 */

export interface ColumnSizeConfig {
  id: string
  size: number
  isFixed?: boolean
}

export interface CalculatedWidths {
  [columnId: string]: string
}

/**
 * Fixed column widths (in pixels) that are preserved
 */
export const FIXED_COLUMN_WIDTHS = {
  selection: '32px',
  actions: '72px'
} as const

/**
 * Calculate percentage widths for table columns based on size values
 * Preserves fixed widths for first (selection) and last (actions) columns
 */
export function calculateColumnWidths(columns: ColumnSizeConfig[]): CalculatedWidths {
  const widths: CalculatedWidths = {}
  
  // Identify fixed columns (selection and actions)
  const fixedColumns = columns.filter(col => 
    col.id === 'select' || 
    col.id === 'actions' || 
    col.isFixed
  )
  
  // Calculate flexible columns (exclude fixed ones)
  const flexibleColumns = columns.filter(col => 
    col.id !== 'select' && 
    col.id !== 'actions' && 
    !col.isFixed
  )
  
  // Apply fixed widths
  fixedColumns.forEach(col => {
    if (col.id === 'select') {
      widths[col.id] = FIXED_COLUMN_WIDTHS.selection
    } else if (col.id === 'actions') {
      widths[col.id] = FIXED_COLUMN_WIDTHS.actions
    } else {
      widths[col.id] = `${col.size}px`
    }
  })
  
  // Calculate total size for flexible columns
  const totalFlexibleSize = flexibleColumns.reduce((sum, col) => sum + col.size, 0)
  
  // Convert flexible column sizes to percentages
  if (totalFlexibleSize > 0) {
    flexibleColumns.forEach(col => {
      const percentage = (col.size / totalFlexibleSize) * 100
      widths[col.id] = `${percentage.toFixed(2)}%`
    })
  }
  
  return widths
}

/**
 * Extract column size configuration from TanStack Table column definitions
 */
export function extractColumnSizes<T>(columns: ColumnDef<T>[]): ColumnSizeConfig[] {
  return columns.map(col => ({
    id: col.id || String(col.accessorKey) || 'unknown',
    size: col.size || 100,
    isFixed: col.id === 'select' || col.id === 'actions'
  }))
}

/**
 * Generate CSS width style for a column
 */
export function getColumnWidthStyle(width: string): React.CSSProperties {
  return {
    width,
    minWidth: width,
    maxWidth: width
  }
}

/**
 * Recalculate widths from only the columns that remain visible on a compact
 * table. Percentage widths calculated from the full desktop column set leave
 * unused percentages behind when responsive columns are hidden; fixed columns
 * then expand to consume that space. Subtracting each flexible column's share
 * of the fixed pixel total keeps the final widths at exactly 100%.
 */
export function calculateVisibleColumnWidths(
  columns: ColumnSizeConfig[]
): Record<string, React.CSSProperties> {
  const fixedColumns = columns.filter(
    (column) => column.id === 'select' || column.id === 'actions' || column.isFixed
  )
  const flexibleColumns = columns.filter(
    (column) => column.id !== 'select' && column.id !== 'actions' && !column.isFixed
  )
  const fixedWidth = (column: ColumnSizeConfig) => {
    if (column.id === 'select') return Number.parseInt(FIXED_COLUMN_WIDTHS.selection, 10)
    if (column.id === 'actions') return Number.parseInt(FIXED_COLUMN_WIDTHS.actions, 10)
    return column.size
  }
  const fixedTotal = fixedColumns.reduce(
    (total, column) => total + fixedWidth(column),
    0
  )
  const flexibleTotal = flexibleColumns.reduce(
    (total, column) => total + column.size,
    0
  )
  const styles: Record<string, React.CSSProperties> = {}

  fixedColumns.forEach((column) => {
    const width = `${fixedWidth(column)}px`
    styles[column.id] = getColumnWidthStyle(width)
  })

  flexibleColumns.forEach((column) => {
    const ratio = flexibleTotal === 0 ? 0 : column.size / flexibleTotal
    const percentage = ratio * 100
    const fixedShare = ratio * fixedTotal
    const width = `calc(${percentage.toFixed(2)}% - ${fixedShare.toFixed(2)}px)`
    styles[column.id] = getColumnWidthStyle(width)
  })

  return styles
}

/**
 * Generate CSS classes for proper text truncation in table cells
 */
export function getTruncationClasses(): string {
  return 'overflow-hidden text-ellipsis whitespace-nowrap min-w-0'
}
