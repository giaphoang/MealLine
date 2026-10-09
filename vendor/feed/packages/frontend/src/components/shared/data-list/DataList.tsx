// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useState, useRef, useImperativeHandle, forwardRef, type ComponentType } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { EnhancedDataTable } from "@/components/ui/enhanced-data-table"
import type { LucideIcon } from "lucide-react";
import { TableBulkAction } from "@/types/table"
import { SectionHeader } from "@/components/shared/section-header"
import { TranslationType } from "@/types/translation"
import type { TypeFilterOption } from "@/components/ui/type-filter"

// Accepts Lucide and animate-ui icons (heterogeneous prop shapes). We
// only pass className/size, but slot variance requires a permissive
// type so all icon components are accepted.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolbarIcon = ComponentType<any>;

interface DataItem {
  id: number
  name: string
}

interface ToolbarAction {
  label: string
  icon: LucideIcon
  variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  action: () => void
}

interface DataListProps<T extends DataItem, TType extends string = TranslationType> {
  title: string
  description: string
  items: T[]
  columns: ColumnDef<T>[]
  isLoading: boolean
  bulkActions?: TableBulkAction<T>[]
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
  onError?: (error: Error) => void
  onUpdate?: (item: T) => Promise<void>
  toolbarActions?: ToolbarAction[]
  toolbarControls?: React.ReactNode
  toolbarIcon?: ToolbarIcon
  preservePageOnDataChange?: boolean
}

/** Imperative handle a page may use to clear the table's current selection. */
export interface DataListHandle {
  clearSelection: () => void
}

const DataListInner = forwardRef(function DataList<
  T extends DataItem,
  TType extends string = TranslationType
>({
  title,
  description,
  items,
  columns,
  isLoading,
  bulkActions = [],
  filterColumn = "name",
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
  onUpdate,
  toolbarActions = [],
  toolbarControls,
  toolbarIcon: Icon,
  preservePageOnDataChange = true
}: DataListProps<T, TType>, ref: React.ForwardedRef<DataListHandle>) {
  const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);
  const pendingUpdatesRef = useRef<Map<number, T>>(new Map());
  const tableRef = useRef<{ clearSelection?: () => void }>(null);

  useImperativeHandle(ref, () => ({
    clearSelection: () => {
      tableRef.current?.clearSelection?.();
      pendingUpdatesRef.current.clear();
    }
  }));

  const wrappedBulkActions: TableBulkAction<T>[] = bulkActions.map(action => ({
    ...action,
    action: async (selected: T[]) => {
      setIsBulkActionLoading(true);
      try {
        await action.action(selected);
      } catch (error) {
        // Handle error
      } finally {
        setIsBulkActionLoading(false);
      }
    }
  }));

  return (
    <div className="space-y-6 min-w-0 w-full pt-6" data-testid="data-list">
      {/* Use shared SectionHeader */}
      {Icon && (
        <SectionHeader
          title={title}
          description={description}
          icon={Icon}
        />
      )}

      {/* Table Section — outer overflow:auto removed so shadows on rows,
          pagination, and viewport-edge cells aren't clipped. EnhancedDataTable's
          inner wrapper still handles horizontal scroll for wide tables. */}
      <div className="w-full">
        <EnhancedDataTable 
          ref={tableRef}
          columns={columns}
          data={items}
          isLoading={isLoading || isBulkActionLoading}
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
          selection={bulkActions.length > 0 ? {
            enabled: true,
            selectionColumn: true,
            bulkActions: wrappedBulkActions
          } : undefined}
          onUpdate={onUpdate}
          toolbarActions={toolbarActions}
          toolbarControls={toolbarControls}
          preservePageOnDataChange={preservePageOnDataChange}
        />
      </div>
    </div>
  )
})

/**
 * Same `forwardRef` generic erasure as `EnhancedDataTable`, one layer up:
 * without this, `T` collapses to the `DataItem` constraint and every page
 * passing real columns fails with `ColumnDef<Category>[]` not being
 * assignable to `ColumnDef<DataItem>[]`. Type-level only — the runtime value
 * is the same component. See the note on `EnhancedDataTable`'s export.
 */
export const DataList = DataListInner as <
  T extends DataItem,
  TType extends string = TranslationType
>(
  props: DataListProps<T, TType> & { ref?: React.Ref<DataListHandle> }
) => React.ReactElement
