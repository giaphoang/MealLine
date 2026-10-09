// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from "react"
import { MoreHorizontal } from "@/components/ui/icons";
import { TableActionMenuProps } from "@/types/table"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AnimateIcon } from "@/components/animate-ui/icons/icon"
import { cn } from "@/lib/utils"

// Longest single animation across all action-menu icons (X: 0.2 delay + 0.4s = 0.6s,
// Tag: 0.4 delay + 0.2s = 0.6s). 800 ms gives a comfortable margin before we reset
// localAnimate so hover can work — see ICON_ANIMATIONS.md "animate prop stuck" note.
const ANIMATE_RESET_DELAY_MS = 800

export function TableActionMenu({
  actions,
  triggerLabel = "Open menu",
  isLoading = false,
  size = "default",
  align = "end"
}: TableActionMenuProps) {
  const buttonSize = size === "sm" ? "h-8 w-8" : "h-9 w-9"
  const hasDestructiveActions = actions.some(action => action.variant === 'destructive')

  // Drive the AnimateIcon `animate` prop from open state so that after the
  // mount animation completes, localAnimate resets to false and every subsequent
  // hover can cycle false → true, replaying the animation reliably.
  const [animateMount, setAnimateMount] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleOpenChange = React.useCallback((isOpen: boolean) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (isOpen) {
      setAnimateMount(true)
      timerRef.current = setTimeout(() => {
        setAnimateMount(false)
        timerRef.current = null
      }, ANIMATE_RESET_DELAY_MS)
    } else {
      setAnimateMount(false)
    }
  }, [])

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(buttonSize, "p-0")}
          disabled={isLoading}
        >
          <span className="sr-only">{triggerLabel}</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        {actions.map((action, index) => {
          const Icon = action.icon
          const isDestructive = action.variant === 'destructive'

          const shouldAddSeparator =
            (isDestructive && index !== actions.length - 1) ||
            (hasDestructiveActions && !isDestructive && actions[index + 1]?.variant === 'destructive')

          return (
            <React.Fragment key={action.label}>
              <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
                <DropdownMenuItem
                  onClick={action.onClick}
                  disabled={action.disabled || isLoading}
                  className={cn(
                    "flex items-center",
                    isDestructive && "text-red-600 dark:text-red-400",
                    action.className
                  )}
                >
                  {Icon && (
                    <Icon className="mr-2 h-4 w-4" size={16} />
                  )}
                  {action.label}
                </DropdownMenuItem>
              </AnimateIcon>
              {shouldAddSeparator && <DropdownMenuSeparator />}
            </React.Fragment>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
