// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Link } from "react-router-dom"

import { ChevronRight, CircleHelp } from "@/components/ui/icons"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SectionHeader } from "@/components/shared/section-header"
import { getAllUserGuides, getHelpSearchIndex } from "@/lib/user-guides"
import { useBrand } from "@/contexts/BrandContext"
import { useTerminology } from "@/contexts/TerminologyContext"

import { HelpSearch } from "./HelpSearch"

export function HelpPage() {
  const brand = useBrand()
  const terminology = useTerminology()
  const guides = getAllUserGuides()
  const searchIndex = getHelpSearchIndex()

  return (
    <div className="space-y-6 min-w-0 w-full pt-6">
      <div className="w-full min-w-0">
        <SectionHeader
          icon={CircleHelp}
          title="Help"
          description={terminology.format(`Short guides for using ${brand.identity.appName} during daily {pantry} work.`)}
        />
      </div>

      <HelpSearch index={searchIndex} className="max-w-2xl" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {guides.map((guide) => (
          <Link
            key={guide.slug}
            to={`/help/${guide.slug}`}
            className="group focus:outline-hidden"
          >
            <Card className="h-full rounded-lg transition-colors hover:border-primary/50 hover:bg-accent/30 group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-2 text-lg">
                  <span>{guide.title}</span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    aria-hidden="true"
                  />
                </CardTitle>
                {guide.description ? (
                  <CardDescription className="line-clamp-3">
                    {guide.description}
                  </CardDescription>
                ) : null}
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Need more help?{" "}
        <a
          href="https://github.com/MattGeiger/williamtemple-feed#contact"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Contact FEED's developer.
        </a>
      </p>
    </div>
  )
}
