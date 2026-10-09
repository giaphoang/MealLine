// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Maximize2 } from "@/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ViewTextDialog } from "@/components/ui/view-text-dialog"
import { cn } from "@/lib/utils"

interface TruncatedTextProps {
  text: string
  maxLength: number
  title?: string
  className?: string
}

export function TruncatedText({ 
  text, 
  maxLength, 
  title = "View full text",
  className 
}: TruncatedTextProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  
  if (!text || text.length <= maxLength) {
    return <span className={className}>{text || ''}</span>
  }

  const truncatedText = text.substring(0, maxLength - 3) + "..."

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span>{truncatedText}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 p-0"
            onClick={() => setDialogOpen(true)}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{title}</p>
        </TooltipContent>
      </Tooltip>
      <ViewTextDialog
        title={title}
        text={text}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}