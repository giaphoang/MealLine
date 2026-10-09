// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ViewTextDialogProps {
  title: string
  text: string
  subtitle?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ViewTextDialog({
  title,
  text,
  subtitle,
  open,
  onOpenChange
}: ViewTextDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && (
            <DialogDescription>{subtitle}</DialogDescription>
          )}
        </DialogHeader>
        {/* Native max-h grow-to-fit is intentional here (shadcn-exception,
            per AGENTS.md / ISSUES.md #32): this views a single truncated
            string that is usually short, so a fixed-height ScrollArea would
            render a large empty muted box. The box grows to the content and
            only scrolls past 400px. */}
        <div className="mt-4 p-4 bg-muted rounded-md whitespace-pre-wrap wrap-break-word max-h-[400px] overflow-y-auto">
          {text}
        </div>
      </DialogContent>
    </Dialog>
  )
}