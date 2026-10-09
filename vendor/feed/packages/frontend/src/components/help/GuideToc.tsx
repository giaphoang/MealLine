// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState } from "react"

import { ChevronDown, List } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { GuideTocItem } from "@/lib/user-guides"

import { GuideTocScrollSpy } from "./GuideTocScrollSpy"

type GuideTocProps = {
  items: GuideTocItem[]
  variant: "mobile" | "desktop"
  enableScrollSpy?: boolean
}

function GuideTocLinks({ items }: { items: GuideTocItem[] }) {
  return (
    <ol className="space-y-1">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            data-guide-toc-link
            data-heading-id={item.id}
            className={cn(
              "block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[active=true]:bg-accent data-[active=true]:font-medium data-[active=true]:text-foreground",
              item.depth === 3 && "ml-3 text-xs"
            )}
          >
            {item.title}
          </a>
        </li>
      ))}
    </ol>
  )
}

export function GuideToc({ items, variant, enableScrollSpy = false }: GuideTocProps) {
  const [open, setOpen] = useState(false)

  if (items.length === 0) return null

  const headingIds = items.map((item) => item.id)

  if (variant === "mobile") {
    return (
      <div className="lg:hidden">
        {enableScrollSpy ? <GuideTocScrollSpy headingIds={headingIds} /> : null}
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span className="inline-flex items-center gap-2">
                <List className="h-4 w-4" aria-hidden="true" />
                On this page
              </span>
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 rounded-lg border bg-card p-3">
            <nav aria-label="Guide table of contents">
              <GuideTocLinks items={items} />
            </nav>
          </CollapsibleContent>
        </Collapsible>
      </div>
    )
  }

  return (
    <aside className="hidden lg:mt-4 lg:block">
      {enableScrollSpy ? <GuideTocScrollSpy headingIds={headingIds} /> : null}
      <div className="sticky top-20 rounded-lg border border-border/70 bg-background/40 p-4 shadow-xl backdrop-blur-[14px] backdrop-saturate-150 supports-backdrop-filter:bg-background/40">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <List className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          On this page
        </div>
        <ScrollArea className="h-[calc(100vh-9rem)] pr-3">
          <nav aria-label="Guide table of contents">
            <GuideTocLinks items={items} />
          </nav>
        </ScrollArea>
      </div>
    </aside>
  )
}
