// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import { runThemeTransition } from "@/lib/theme-transition"

/**
 * Safari 15.4 — the engine on the iPad mini 4 — has no View Transitions API,
 * so the theme change there runs through the crossfade path.
 *
 * The rule these lock is that nothing may be hidden while the theme changes.
 * The first attempt at this fallback covered the viewport with an opaque layer
 * to mask the flip, which blanked the whole dashboard mid-animation.
 */
function setReducedMotion(matches: boolean) {
  window.matchMedia = ((q: string) =>
    ({
      matches,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

describe("theme transition without View Transitions", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = "<main id='content'>dashboard</main>"
    document.documentElement.className = ""
    // @ts-expect-error — exercising the engine that lacks it
    delete document.startViewTransition
    setReducedMotion(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("never covers the page while the theme changes", () => {
    const before = document.body.childElementCount

    runThemeTransition({ update: () => document.documentElement.classList.add("dark") })

    // No overlay may be introduced: the content must stay on screen and
    // visible for the whole change.
    expect(document.body.childElementCount).toBe(before)
    expect(document.getElementById("content")).toBeTruthy()
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("arms the crossfade before the theme flips, so there is something to interpolate from", () => {
    let classAtFlip: string | undefined
    runThemeTransition({
      update: () => {
        classAtFlip = document.documentElement.className
        document.documentElement.classList.add("dark")
      },
    })
    expect(classAtFlip).toContain("theme-crossfade")
  })

  it("removes the crossfade class afterwards, leaving normal transitions alone", () => {
    runThemeTransition({ update: () => undefined })
    expect(document.documentElement.classList.contains("theme-crossfade")).toBe(true)

    vi.advanceTimersByTime(1000)
    expect(document.documentElement.classList.contains("theme-crossfade")).toBe(false)
  })

  it("changes the theme instantly under reduced motion", () => {
    setReducedMotion(true)
    runThemeTransition({ update: () => document.documentElement.classList.add("dark") })

    expect(document.documentElement.classList.contains("theme-crossfade")).toBe(false)
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })
})
