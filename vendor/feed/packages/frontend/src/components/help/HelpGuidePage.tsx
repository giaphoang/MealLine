// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Link, Navigate, useParams, useSearchParams } from "react-router-dom"

import { ArrowLeft, ChevronLeft, ChevronRight } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import {
  getAllUserGuides,
  getGuideToc,
  getHelpSearchIndex,
  getUserGuideBySlug,
} from "@/lib/user-guides"

import { GuideToc } from "./GuideToc"
import { HelpSearch } from "./HelpSearch"
import { HighlightOnArrival } from "./HighlightOnArrival"
import { MarkdownGuide } from "./MarkdownGuide"

export function HelpGuidePage() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const guide = slug ? getUserGuideBySlug(slug) : null

  if (!guide) {
    return <Navigate to="/help" replace />
  }

  const guides = getAllUserGuides()
  const searchIndex = getHelpSearchIndex()
  const toc = getGuideToc(guide.content)
  const index = guides.findIndex((entry) => entry.slug === guide.slug)
  const previous = index > 0 ? guides[index - 1] : null
  const next = index >= 0 && index < guides.length - 1 ? guides[index + 1] : null
  const searchQuery = searchParams.get("q")

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/help">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            All guides
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          Guide {guide.order} of {guides.length}
        </span>
      </div>

      <HelpSearch index={searchIndex} className="max-w-2xl" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <GuideToc items={toc} variant="mobile" />
          <MarkdownGuide content={guide.content} />
          <HighlightOnArrival query={searchQuery} />
        </div>
        <GuideToc items={toc} variant="desktop" enableScrollSpy />
      </div>

      <nav
        aria-label="Guide navigation"
        className="mt-4 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-stretch sm:justify-between"
      >
        {previous ? (
          <Button variant="outline" className="h-auto justify-start py-3 sm:max-w-sm" asChild>
            <Link to={`/help/${previous.slug}`}>
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span className="text-xs text-muted-foreground">Previous</span>
                <span className="font-medium">{previous.title}</span>
              </span>
            </Link>
          </Button>
        ) : (
          <span aria-hidden="true" className="hidden sm:block sm:max-w-sm sm:flex-1" />
        )}
        {next ? (
          <Button variant="outline" className="h-auto justify-end py-3 sm:max-w-sm" asChild>
            <Link to={`/help/${next.slug}`}>
              <span className="flex flex-col items-end gap-0.5 text-right">
                <span className="text-xs text-muted-foreground">Next</span>
                <span className="font-medium">{next.title}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </nav>
    </section>
  )
}
