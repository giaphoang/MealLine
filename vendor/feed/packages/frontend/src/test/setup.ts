// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import '@testing-library/jest-dom'
import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react';

// Extend matchers
expect.extend({})

// jsdom runs no animation frames, so a Framer Motion value that animates from
// opacity 0 to 1 never leaves 0 — content is genuinely rendered but assertions
// like `toBeVisible()` fail on it. `skipAnimations` is Motion's own switch for
// this: values jump straight to their target. Without it, any test touching an
// animated wrapper (the animate-ui tab panels, most obviously) has to weaken
// its assertions to `toBeInTheDocument()`, which stops checking the thing that
// matters.
MotionGlobalConfig.skipAnimations = true;

// jsdom implements no ResizeObserver. Several Radix/animate-ui primitives
// observe their own size — the auto-height `TabsContents` wrapper and InputOTP
// among them — so any test rendering a page with tabs fails without this.
// Stubbed here rather than per test file: it is an environment gap, not a
// concern of whatever is being tested.
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      // Report `prefers-reduced-motion: reduce` in tests. jsdom drives no
      // animation frames, so a component that fades or grows into place stays
      // at its initial opacity/height forever and assertions like
      // `toBeVisible()` fail on content that is genuinely rendered. FEED honours
      // reduced motion throughout (1.5.0-beta.1), so this settles those
      // components at their final state through a supported path rather than by
      // weakening the assertions.
      matches: /prefers-reduced-motion/.test(query),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

if (!window.IntersectionObserver) {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null
    readonly rootMargin = ''
    readonly thresholds: ReadonlyArray<number> = []

    disconnect() {
      return undefined
    }

    observe() {
      return undefined
    }

    takeRecords(): IntersectionObserverEntry[] {
      return []
    }

    unobserve() {
      return undefined
    }
  }

  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: MockIntersectionObserver,
  })

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    value: MockIntersectionObserver,
  })
}

afterEach(() => {
  cleanup()
})
