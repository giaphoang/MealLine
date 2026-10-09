// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MarkdownGuideContent } from "@/components/help/MarkdownGuide"
import releaseNotes from "../../../../../docs/release-notes.md?raw"

export function ReleaseNotesCard() {
  return (
    <Card className="mx-auto max-w-2xl rounded-lg">
      <CardContent className="p-6 sm:p-8">
        <ScrollArea className="h-[min(70vh,640px)] pr-4">
          <div className="space-y-5">
            <MarkdownGuideContent content={releaseNotes} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
