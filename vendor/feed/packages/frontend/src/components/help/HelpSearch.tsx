// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { ChevronRight, FileText, Search, X } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { GuideSearchEntry } from "@/lib/user-guides"

type HelpSearchProps = {
  index: GuideSearchEntry[]
  className?: string
}

type SearchResult = GuideSearchEntry & {
  score: number
  snippet: string
}

const MIN_QUERY_LENGTH = 2
const MAX_RESULTS = 8

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function getSearchTerms(query: string): string[] {
  return Array.from(
    new Set(
      normalizeSearchText(query)
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= MIN_QUERY_LENGTH)
    )
  )
}

function countTermOccurrences(value: string, term: string): number {
  if (!term) return 0

  let count = 0
  let index = value.indexOf(term)
  while (index !== -1) {
    count += 1
    index = value.indexOf(term, index + term.length)
  }

  return count
}

function scoreEntry(entry: GuideSearchEntry, terms: string[], normalizedQuery: string): number {
  const guideTitle = normalizeSearchText(entry.guideTitle)
  const sectionTitle = normalizeSearchText(entry.sectionTitle)
  const content = normalizeSearchText(entry.content)
  const haystack = `${guideTitle} ${sectionTitle} ${content}`

  if (!terms.every((term) => haystack.includes(term))) return 0

  let score = 0
  for (const term of terms) {
    if (sectionTitle.includes(term)) score += 30
    if (guideTitle.includes(term)) score += 20
    score += Math.min(countTermOccurrences(content, term), 6)
  }

  if (sectionTitle.includes(normalizedQuery)) score += 20
  if (guideTitle.includes(normalizedQuery)) score += 12
  if (content.includes(normalizedQuery)) score += 8

  return score
}

function buildSnippet(content: string, terms: string[]): string {
  const lowerContent = normalizeSearchText(content)
  const firstIndex = terms.reduce<number | null>((best, term) => {
    const index = lowerContent.indexOf(term)
    if (index === -1) return best
    return best === null ? index : Math.min(best, index)
  }, null)

  const start = Math.max((firstIndex ?? 0) - 72, 0)
  const end = Math.min(start + 180, content.length)
  const prefix = start > 0 ? "..." : ""
  const suffix = end < content.length ? "..." : ""

  return `${prefix}${content.slice(start, end).trim()}${suffix}`
}

function HighlightMatches({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi")
  const parts = text.split(pattern)

  return (
    <>
      {parts.map((part, index) => {
        const isMatch = terms.some((term) => normalizeSearchText(part) === term)
        return isMatch ? (
          <mark
            key={`${part}-${index}`}
            className="rounded bg-yellow-200 px-0.5 text-yellow-950 dark:bg-yellow-300/80 dark:text-yellow-950"
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      })}
    </>
  )
}

export function HelpSearch({ index, className }: HelpSearchProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [isFocused, setIsFocused] = useState(false)

  const terms = useMemo(() => getSearchTerms(query), [query])
  const results = useMemo<SearchResult[]>(() => {
    const normalizedQuery = normalizeSearchText(query.trim())
    if (normalizedQuery.length < MIN_QUERY_LENGTH || terms.length === 0) return []

    return index
      .map((entry) => {
        const score = scoreEntry(entry, terms, normalizedQuery)
        if (score <= 0) return null
        return {
          ...entry,
          score,
          snippet: buildSnippet(entry.content, terms),
        }
      })
      .filter((entry): entry is SearchResult => Boolean(entry))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (a.guideOrder !== b.guideOrder) return a.guideOrder - b.guideOrder
        return a.sectionTitle.localeCompare(b.sectionTitle)
      })
      .slice(0, MAX_RESULTS)
  }, [index, query, terms])

  const trimmedQuery = query.trim()
  const showPanel = isFocused && trimmedQuery.length > 0

  return (
    <div className={cn("relative w-full max-w-xl", className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsFocused(false)
              event.currentTarget.blur()
            }
          }}
          placeholder="Search help..."
          aria-label="Search help"
          aria-expanded={showPanel}
          className="h-9 pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        />
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setQuery("")}
            aria-label="Clear help search"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {showPanel ? (
        <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
          <Command shouldFilter={false}>
            {trimmedQuery.length < MIN_QUERY_LENGTH ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                Type at least {MIN_QUERY_LENGTH} characters to search.
              </p>
            ) : results.length > 0 ? (
              <CommandList className="max-h-[min(28rem,70vh)]">
                <CommandGroup>
                  {results.map((result) => {
                    const href = `/help/${result.guideSlug}?q=${encodeURIComponent(
                      trimmedQuery
                    )}#${result.sectionId}`

                    return (
                      <CommandItem
                        key={result.id}
                        value={`${result.guideTitle} ${result.sectionTitle}`}
                        className="group p-0"
                        onSelect={() => {
                          setIsFocused(false)
                          navigate(href)
                        }}
                      >
                        <Link
                          to={href}
                          className="flex w-full items-start gap-3 px-3 py-2.5"
                          onClick={() => setIsFocused(false)}
                        >
                          <FileText
                            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              <HighlightMatches text={result.sectionTitle} terms={terms} />
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {result.guideTitle}
                            </span>
                            <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                              <HighlightMatches text={result.snippet} terms={terms} />
                            </span>
                          </span>
                          <ChevronRight
                            className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                            aria-hidden="true"
                          />
                        </Link>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            ) : (
              <CommandList>
                <CommandEmpty>No help sections match "{trimmedQuery}".</CommandEmpty>
              </CommandList>
            )}
          </Command>
        </div>
      ) : null}
    </div>
  )
}
