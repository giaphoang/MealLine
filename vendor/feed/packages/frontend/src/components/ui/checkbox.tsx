// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react"
import {
  Checkbox as AnimateCheckbox,
  CheckboxIndicator,
} from "@/components/animate-ui/primitives/radix/checkbox"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof AnimateCheckbox>
>(({ className, ...props }, ref) => (
  <AnimateCheckbox
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className
    )}
    {...props}
  >
    <CheckboxIndicator className="h-4 w-4 text-current" />
  </AnimateCheckbox>
))
Checkbox.displayName = "Checkbox"

export { Checkbox }
