// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ChevronDown, X } from "@/components/ui/icons";
import { FunnelIcon, type FunnelIconHandle } from "@/components/ui/funnel";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Table } from "@tanstack/react-table"
import { TableBulkAction } from "@/types/table"
import { humanizeString } from "@/lib/utils"
import { LanguageFilter } from "@/components/ui/language-filter"
import { TypeFilter, type TypeFilterOption } from "@/components/ui/type-filter"
import { TranslationType } from "@/types/translation"
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

interface ToolbarAction {
  label: string
  // Accepts both static Lucide icons and animate-ui native icons (the latter
  // animate on button hover/tap via the AnimateIcon wrapper below).
  icon?: React.ComponentType<any>
  // 'outline', not 'outline-solid'. The Tailwind v4 codemod rewrote this union
  // member as though it were a utility class name (that rename is real for
  // classes, not for these values), leaving a variant Button does not accept
  // while every caller passed 'outline'.
  variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  action: () => void
  /** Native title attribute — a one-line hint, matching TableRowAction.title. */
  title?: string
  /** Optional trigger ref for dialogs that must restore focus on close. */
  buttonRef?: React.Ref<HTMLButtonElement>
}

interface TableFeatureBarProps<TData, TType extends string = TranslationType> {
  table: Table<TData>
  filterColumn?: string
  filterPlaceholder?: string
  enableColumnVisibility?: boolean
  enableFiltering?: boolean
  enableLanguageFilter?: boolean
  enableTypeFilter?: boolean
  selectedLanguage?: string
  selectedTypes?: TType[]
  /** The filterable types and their labels. Without these no filter renders. */
  typeOptions?: readonly TypeFilterOption<TType>[]
  availableLanguages?: string[]
  onLanguageChange?: (language: string) => void
  onTypeChange?: (types: TType[]) => void
  className?: string
  bulkActions?: TableBulkAction<TData>[]
  toolbarActions?: ToolbarAction[]
  toolbarControls?: React.ReactNode
  selectedRows?: TData[]
  onClearSelection?: () => void
}

export function TableFeatureBar<TData, TType extends string = TranslationType>({
  table,
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
  bulkActions,
  toolbarActions = [],
  toolbarControls,
  selectedRows = [],
  onClearSelection,
}: TableFeatureBarProps<TData, TType>) {
  const hasSelection = selectedRows.length > 0

  // Animated filter funnel: draws on at page load, and again on hover / click
  // of the filter field (the icon itself is pointer-events-none, so the
  // surrounding field drives it via this ref).
  const filterIconRef = React.useRef<FunnelIconHandle>(null)
  React.useEffect(() => {
    filterIconRef.current?.startAnimation()
  }, [])
  const playFilterIcon = React.useCallback(() => {
    filterIconRef.current?.startAnimation()
  }, [])

  const handleBulkAction = React.useCallback(async (action: TableBulkAction<TData>) => {
    if (!selectedRows.length) return;

    try {
      await action.action(selectedRows);
    } catch (error) {
      // Error will be handled by the action itself
    }
  }, [selectedRows]);

  return (
    <div 
      className="flex flex-col gap-4"
      data-testid="table-feature-bar"
    >
      {/* Toolbar Actions Row */}
      <div className="flex flex-wrap items-center gap-2">
        {toolbarActions.map((action, index) => (
          // Wrap in AnimateIcon so animate-ui icons animate on hover/tap of the
          // whole button. Inert for plain Lucide icons (they ignore the context).
          <AnimateIcon key={index} asChild animateOnHover animateOnTap>
            <Button
              variant={action.variant}
              size="sm"
              onClick={action.action}
              title={action.title}
              ref={action.buttonRef}
            >
              {action.icon && <action.icon className="h-4 w-4 mr-2" />}
              {action.label}
            </Button>
          </AnimateIcon>
        ))}
      </div>

      {/* Table Feature Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {enableFiltering && filterColumn && (
            <div
              className="relative w-full px-px"
              onMouseEnter={playFilterIcon}
              onClick={playFilterIcon}
            >
              <FunnelIcon
                ref={filterIconRef}
                size={16}
                className="absolute left-[9px] top-2 h-4 w-4 text-muted-foreground pointer-events-none"
              />
              <Input
                placeholder={filterPlaceholder || `Filter ${filterColumn}...`}
                value={(table.getColumn(filterColumn)?.getFilterValue() as string) ?? ""}
                onChange={(event) =>
                  table.getColumn(filterColumn)?.setFilterValue(event.target.value)
                }
                className="w-full pl-8"
              />
            </div>
          )}
          {hasSelection && bulkActions && bulkActions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedRows.length} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                className="h-8 px-2"
              >
                <X className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-8 whitespace-nowrap" data-testid="bulk-actions-button">
                    Actions <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {bulkActions.map((action, index) => (
                    <DropdownMenuItem
                      key={index}
                      onClick={async () => await handleBulkAction(action)}
                      className={cn(
                        action.variant === 'destructive' && "text-destructive focus:text-destructive",
                        action.disabled && "cursor-not-allowed opacity-50"
                      )}
                      disabled={action.disabled}
                    >
                      {action.icon && (
                        <action.icon className="mr-2 h-4 w-4" />
                      )}
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Right-aligned menu controls */}
        <div className="flex items-center gap-2">
          {toolbarControls}
          {enableLanguageFilter && onLanguageChange && (
            <LanguageFilter
              value={selectedLanguage}
              onChange={onLanguageChange}
              availableLanguages={availableLanguages}
            />
          )}
          {enableTypeFilter && onTypeChange && selectedTypes && typeOptions?.length ? (
            <TypeFilter
              selectedTypes={selectedTypes}
              options={typeOptions}
              onTypeChange={onTypeChange}
            />
          ) : null}
          {enableColumnVisibility && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-8">
                  Columns <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => {
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="normal-case"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) =>
                          column.toggleVisibility(!!value)
                        }
                      >
                        {humanizeString(column.id)}
                      </DropdownMenuCheckboxItem>
                    )
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )
}
