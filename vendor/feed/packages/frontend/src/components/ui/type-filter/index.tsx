// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react"
import { ChevronDown } from "@/components/ui/icons";
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** One checkbox in the dropdown: the value stored, and what staff read. */
export interface TypeFilterOption<TType extends string> {
  value: TType
  label: string
}

interface TypeFilterProps<TType extends string> {
  selectedTypes: TType[]
  /**
   * The types this table can filter by. Required, and deliberately not
   * defaulted: this component used to map over a module-level list of
   * *translation* types, which meant AI Configuration — the only other page
   * using it — rendered "Category / Food Item / Custom / Generated
   * (Document)" over rows that are only ever API keys and system prompts.
   * Worse than mislabelled, it could not work: every box drew unchecked
   * because none of those values appear in `['prompt', 'apikey']`, and
   * ticking one appended a type the table has no rows of while leaving both
   * real types selected, so the list never changed. A default here would put
   * one page's vocabulary back inside a shared component and let the next
   * caller inherit the same bug silently.
   */
  options: readonly TypeFilterOption<TType>[]
  onTypeChange: (types: TType[]) => void
  className?: string
}

export function TypeFilter<TType extends string>({
  selectedTypes,
  options,
  onTypeChange,
  className
}: TypeFilterProps<TType>) {
  const toggleType = (type: TType) => {
    const newTypes = selectedTypes.includes(type)
      ? selectedTypes.filter(t => t !== type)
      : [...selectedTypes, type]
    // Clearing every box shows everything rather than nothing — an empty
    // table with no way back would read as data loss.
    onTypeChange(newTypes.length ? newTypes : options.map(option => option.value))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-8", className)}
          data-testid="type-filter-button"
        >
          Types <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selectedTypes.includes(option.value)}
            onCheckedChange={() => toggleType(option.value)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
