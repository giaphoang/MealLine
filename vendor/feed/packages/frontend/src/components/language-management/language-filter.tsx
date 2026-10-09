// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useCallback, useEffect, useRef } from "react"
import { SearchIcon, type SearchIconHandle } from "@/components/ui/search";
import { Input } from "@/components/ui/input"
import { Language } from "@/types/language"

interface LanguageFilterProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

export function LanguageFilter({
  value,
  onValueChange,
  disabled
}: LanguageFilterProps) {
  // Animated search glass: draws on at page load, and again on hover / click
  // of the search field (the icon is pointer-events-none, so the field drives
  // it via this ref).
  const searchIconRef = useRef<SearchIconHandle>(null)
  useEffect(() => {
    searchIconRef.current?.startAnimation()
  }, [])
  const playSearchIcon = useCallback(() => {
    searchIconRef.current?.startAnimation()
  }, [])

  return (
    <div className="relative" onMouseEnter={playSearchIcon} onClick={playSearchIcon}>
      <SearchIcon
        ref={searchIconRef}
        size={16}
        className="absolute left-2 top-2 h-4 w-4 text-muted-foreground pointer-events-none"
      />
      <Input
        placeholder="Search languages..."
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled}
        className="pl-8 w-full sm:w-auto sm:min-w-[200px] sm:max-w-sm"
      />
    </div>
  )
}