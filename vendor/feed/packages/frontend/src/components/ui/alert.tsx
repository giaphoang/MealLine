// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * A single centred row: icon, then title, then description.
 *
 * This diverges from upstream shadcn, whose alert is a grid with the icon
 * absolutely positioned and the title stacked *above* the description. Keeping
 * the row layout means every child has to share one vertical rhythm — a stray
 * margin or a different line-height on any one of them lands it on its own
 * baseline, which is what "the icon, title, and text each sit at a different
 * height" looks like.
 *
 * `[&>svg]:shrink-0` keeps the icon from being squeezed when the description is
 * long enough to compete for width.
 */
const alertVariants = cva(
  "relative w-full rounded-lg border border-slate-200 px-4 py-3 text-sm flex items-center gap-3 [&>svg]:shrink-0 dark:border-slate-800 dark:[&>svg]:text-slate-50",
  {
    variants: {
      variant: {
        default: "bg-white text-slate-950 dark:bg-slate-950 dark:text-slate-50",
        destructive:
          "border-red-500/50 text-red-500 dark:border-red-500 [&>svg]:text-red-500 dark:border-red-900/50 dark:text-red-900 dark:dark:border-red-900 dark:[&>svg]:text-red-900",
        warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] border-[var(--status-warning-border)] [&>svg]:stroke-[var(--status-warning-text)] dark:bg-[var(--status-warning-bg)] dark:text-[var(--status-warning-text)] dark:border-[var(--status-warning-border)] dark:[&>svg]:stroke-[var(--status-warning-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    // No `mb-1` and no `leading-none`. Both are holdovers from the stacked
    // upstream layout: inside a centred flex row a bottom margin lifts the
    // title above its siblings, and a different line-height puts its text on a
    // different baseline than the description beside it. Inheriting the row's
    // `text-sm` leading is what puts all three on one line.
    className={cn("shrink-0 font-medium tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
