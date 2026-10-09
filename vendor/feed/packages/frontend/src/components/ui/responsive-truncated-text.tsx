// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Maximize2 } from "@/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ViewTextDialog } from "@/components/ui/view-text-dialog"
import { cn } from "@/lib/utils"
import { getTruncationClasses } from "@/lib/table"

interface ResponsiveTruncatedTextProps {
  text: string
  title?: string
  className?: string
  showExpandButton?: boolean
}

export function ResponsiveTruncatedText({ 
  text, 
  title = "View full text",
  className,
  showExpandButton = true
}: ResponsiveTruncatedTextProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isTruncated, setIsTruncated] = useState(false)
  const textRef = useRef<HTMLSpanElement>(null)
  
  // Check if text is actually truncated by measuring DOM dimensions
  useEffect(() => {
    if (textRef.current) {
      setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth)
    }
  }, [text])
  
  if (!text) {
    return <span className={className}>{text || ''}</span>
  }

  // Use table-based truncation classes instead of clamp-based sizing
  const truncateClasses = getTruncationClasses()

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span 
        ref={textRef}
        className={cn(truncateClasses, "flex-1")}
        title={text} // Native tooltip for basic accessibility
      >
        {text}
      </span>
      {showExpandButton && isTruncated && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 p-0 shrink-0"
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
        </>
      )}
    </div>
  )
}
