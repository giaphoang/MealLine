// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useEffect, useState } from "react"

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQueryList = window.matchMedia(query)
      setMatches(mediaQueryList.matches)

      const listener = (e: MediaQueryListEvent) => {
        setMatches(e.matches)
      }

      mediaQueryList.addEventListener("change", listener)
      return () => mediaQueryList.removeEventListener("change", listener)
    }
    return undefined
  }, [query])

  return matches
}