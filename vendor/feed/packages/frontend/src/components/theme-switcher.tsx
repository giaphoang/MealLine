// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import * as React from "react"
import { useTheme } from "next-themes"

import { AnimateIcon } from "@/components/animate-ui/icons/icon"
import { MoonIcon } from "@/components/animate-ui/icons/moon"
import { SunIcon } from "@/components/animate-ui/icons/sun"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { runThemeTransition } from "@/lib/theme-transition"
import { cn } from "@/lib/utils"

/**
 * A two-state toggle, not a three-state picker.
 *
 * FEED still has three underlying states — light, dark, and "follow the
 * device" — and the stylesheet must keep handling all three, because the
 * unstamped system state is a real thing the app renders. But the *control*
 * used to expose all three as a dropdown of radio items, which put a popover
 * and a three-way decision in front of the only thing anyone actually wants
 * here: make it stop being this. That is the data model leaking into the UI.
 *
 * The toggle still reaches all three states. It switches to the opposite of
 * whatever is currently on screen, and when that opposite is what the device
 * would have given anyway, the stored override is removed instead of being
 * written — so following the device is the natural result of toggling back,
 * not a third thing to pick. An override is only ever cleared by a deliberate
 * toggle; it is never dropped just because it happens to match the device for
 * a while.
 *
 * That also makes the common failure self-healing: someone who chose Dark in
 * winter and finds FEED still dark on a bright morning simply toggles, and the
 * app resumes following their device.
 *
 * Explicit "Follow device" remains selectable in Settings → Appearance, for
 * anyone who wants to set it deliberately rather than arrive at it. Reasoning:
 * docs/frontend-services/theme-control.md.
 */
export function ThemeSwitcher() {
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const { resolvedTheme, systemTheme, setTheme } = useTheme()

  // next-themes resolves against the device only after mount, so the first
  // render has no honest answer. Render the button disabled rather than
  // guessing a theme and flipping it a frame later.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const visible = resolvedTheme === "dark" ? "dark" : "light"
  const target = visible === "dark" ? "light" : "dark"
  const label = target === "dark" ? "Switch to dark theme" : "Switch to light theme"

  const toggle = () => {
    void runThemeTransition({
      trigger: triggerRef.current,
      // Clearing the override when the target matches the device is what keeps
      // "follow the device" reachable without a third button.
      update: () => setTheme(target === systemTheme ? "system" : target),
    })
  }

  return (
    <TooltipProvider delayDuration={400}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          size="icon"
          onClick={toggle}
          disabled={!mounted}
          aria-label={label}
          className={cn(
            "relative h-10 w-10 rounded-full border-border/70 bg-background/72 shadow-sm backdrop-blur-md transition-colors",
            "hover:bg-background/90 supports-backdrop-filter:bg-background/58"
          )}
        >
          {/* The icon shows what the click will produce, matching the label, so
              the button reads the same way whether you see it or hear it. */}
          <AnimateIcon animateOnHover animateOnTap>
            {target === "dark"
              ? <MoonIcon size={16} className="h-4 w-4" />
              : <SunIcon size={16} className="h-4 w-4" />}
          </AnimateIcon>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
    </TooltipProvider>
  )
}
