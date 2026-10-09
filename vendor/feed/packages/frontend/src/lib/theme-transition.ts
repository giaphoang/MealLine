// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { flushSync } from "react-dom"

interface ThemeTransitionOptions {
  trigger?: HTMLElement | null
  update: () => void
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function getTransitionOrigin(trigger?: HTMLElement | null) {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 }
  }

  if (!trigger) {
    return {
      x: window.innerWidth - 56,
      y: 56,
    }
  }

  const rect = trigger.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

/**
 * The theme change on engines without the View Transitions API.
 *
 * `document.startViewTransition` is absent on Safari 15.4 — the engine on the
 * iPad mini 4 — so the change there was correct but instantaneous.
 *
 * This is deliberately NOT the circular reveal. That effect needs the old and
 * new frames on screen at once, which is precisely the thing the API provides
 * and we cannot otherwise get: showing old content outside the circle and new
 * content inside requires two simultaneous renderings of the page. An earlier
 * attempt faked it by covering the viewport in the outgoing background colour
 * and sweeping a disc of the incoming one across it. A flat colour is not a
 * frame — it is a blank — so the entire dashboard vanished for the length of
 * the sweep and returned at the end. Worse on a real screen than no animation.
 *
 * A crossfade is honest about what is available. Every element stays visible
 * and its colours interpolate in place, so the theme dissolves rather than
 * snapping. Colour interpolation is not compositor-accelerated, which is why
 * the property list is kept tight and the duration short — this has to stay
 * cheap on an A8.
 *
 * The transition rule lives in `index.css` under `.theme-crossfade`; it is
 * applied for the length of the change and then removed, so it never
 * interferes with ordinary hover and focus transitions.
 */
const CROSSFADE_CLASS = "theme-crossfade"
const CROSSFADE_MS = 420

let crossfadeTimer: number | undefined

function runFallbackCrossfade(update: () => void) {
  const root = document.documentElement
  root.classList.add(CROSSFADE_CLASS)

  // Committed synchronously so the class is already in effect when the theme
  // flips; otherwise the first paint lands on the new colours with nothing to
  // interpolate from.
  flushSync(update)

  window.clearTimeout(crossfadeTimer)
  crossfadeTimer = window.setTimeout(() => {
    root.classList.remove(CROSSFADE_CLASS)
  }, CROSSFADE_MS + 60)
}

export async function runThemeTransition({
  trigger,
  update,
}: ThemeTransitionOptions) {
  if (typeof document === "undefined") {
    update()
    return
  }

  const supportsViewTransition =
    "startViewTransition" in document &&
    typeof document.startViewTransition === "function"

  if (prefersReducedMotion()) {
    flushSync(update)
    return
  }

  if (!supportsViewTransition) {
    runFallbackCrossfade(update)
    return
  }

  const origin = getTransitionOrigin(trigger)
  const width = window.innerWidth
  const height = window.innerHeight
  const maxX = Math.max(origin.x, width - origin.x)
  const maxY = Math.max(origin.y, height - origin.y)
  const endRadius = Math.hypot(maxX, maxY)

  // The reveal is expressed in PERCENTAGES, not pixels, and this is load
  // bearing.
  //
  // `clip-path` on `::view-transition-new(root)` resolves against that
  // pseudo-element's own box, not the viewport. Those happen to coincide only
  // while the browser sizes the snapshot in CSS pixels. Chrome 150 on a
  // 2× display placed a pixel origin at roughly half its intended fraction
  // across — a button 92% of the way to the right rendered as though it were
  // at 46%, i.e. top centre — while Chromium 148 on the same display and
  // Safari both honoured it. Diagnostics from the affected browser confirmed
  // FEED was requesting the correct coordinates and the browser drew them
  // elsewhere, so the origin cannot be trusted to a fixed pixel box.
  //
  // Percentages resolve proportionally against whatever box the browser uses,
  // so the origin tracks the button regardless of how the snapshot is scaled.
  // A percentage radius resolves against sqrt(w² + h²) / sqrt(2), so the end
  // radius is converted through that reference rather than guessed — the
  // geometry is equivalent to the pixel form it replaced, not an approximation
  // of it.
  const radiusReference = Math.hypot(width, height) / Math.SQRT2
  const originX = (origin.x / width) * 100
  const originY = (origin.y / height) * 100
  const startRadius = (20 / radiusReference) * 100
  const endRadiusPercent = (endRadius / radiusReference) * 100

  const transition = document.startViewTransition(() => {
    flushSync(update)
  })

  try {
    await transition.ready

    const animation = document.documentElement.animate(
      {
        clipPath: [
          `circle(${startRadius}% at ${originX}% ${originY}%)`,
          `circle(${endRadiusPercent}% at ${originX}% ${originY}%)`,
        ],
      },
      {
        // A symmetric ease-in-out S-curve — reflecting it through (0.5, 0.5)
        // maps (0.64, 0) onto (0.36, 1), so the acceleration in mirrors the
        // deceleration out exactly. It is effectively easeInOutCubic, whose
        // canonical form is cubic-bezier(0.65, 0, 0.35, 1).
        //
        // Chosen over the previous 600ms ease-out (cubic-bezier(0.22, 1, 0.36,
        // 1)) for how it renders on 60Hz displays: that curve spent most of its
        // travel in the first handful of frames, which reads as a jump on a
        // 16.7ms frame budget. At 1200ms the sweep has ~72 frames to cover, and
        // the symmetric curve spreads the movement across them instead of
        // front-loading it.
        //
        // This is a deliberate feel choice, not a derived value — retune it
        // freely, but check it on a 60Hz panel rather than only on 120Hz.
        duration: 1200,
        easing: "cubic-bezier(0.64, 0, 0.36, 1)",
        pseudoElement: "::view-transition-new(root)",
      } as KeyframeAnimationOptions & { pseudoElement: string }
    )

    void animation.finished.catch(() => undefined)
  } catch {
    // Keep the theme change even if the custom reveal cannot be animated.
  }
}
