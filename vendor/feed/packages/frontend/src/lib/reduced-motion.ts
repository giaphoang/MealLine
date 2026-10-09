// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Whether the viewer has asked the OS to reduce motion.
 *
 * A plain read rather than a hook on purpose. Recharts animation is driven in
 * JavaScript by react-smooth, so no CSS media query can reach it — the only
 * lever is each series' `isAnimationActive` prop, and those props appear
 * inside `.map()` callbacks and helper render functions where a hook cannot be
 * called. Wrapping the Recharts primitives to inject the prop centrally is not
 * an option either: Recharts resolves its children by component identity
 * (`findAllByType`), so a custom wrapper around `<Bar>` stops being recognised
 * and the series disappears.
 *
 * The tradeoff is that this is not reactive — toggling the OS setting mid-
 * session takes effect on the next render rather than immediately. That is
 * acceptable for chart entrance animations, and matches the existing
 * `matchMedia` read in `lib/theme-transition.ts`.
 *
 * For anything Motion drives, prefer `useReducedMotion()` from `motion/react`,
 * or rely on the app-level `<MotionConfig reducedMotion="user">` in App.tsx.
 * For anything CSS drives, the `prefers-reduced-motion` block in index.css
 * already handles it.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
