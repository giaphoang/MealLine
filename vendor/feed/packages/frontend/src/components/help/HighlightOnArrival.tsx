// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useEffect } from "react"

type HighlightOnArrivalProps = {
  query?: string | null
}

const HIGHLIGHT_SELECTOR = 'mark[data-help-search-highlight="true"]'
const SKIP_SELECTOR = "a, button, input, textarea, select, code, pre, script, style, mark"

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function getSearchTerms(query?: string | null): string[] {
  return Array.from(
    new Set(
      (query ?? "")
        .trim()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
    )
  )
}

function removeExistingHighlights(root: Element) {
  const marks = Array.from(root.querySelectorAll<HTMLElement>(HIGHLIGHT_SELECTOR))
  for (const mark of marks) {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""))
  }
  root.normalize()
}

export function HighlightOnArrival({ query }: HighlightOnArrivalProps) {
  useEffect(() => {
    const article = document.querySelector("[data-guide-article]")
    if (!article) return

    removeExistingHighlights(article)

    const terms = getSearchTerms(query)
    if (terms.length === 0) return

    const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi")
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement
        if (!parent || parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT
        pattern.lastIndex = 0
        return pattern.test(node.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
      },
    })

    const textNodes: Text[] = []
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text)
    }

    for (const node of textNodes) {
      const value = node.nodeValue ?? ""
      const fragment = document.createDocumentFragment()
      let lastIndex = 0

      pattern.lastIndex = 0
      for (const match of value.matchAll(pattern)) {
        const matchText = match[0]
        const index = match.index ?? 0
        if (index > lastIndex) {
          fragment.append(document.createTextNode(value.slice(lastIndex, index)))
        }

        const mark = document.createElement("mark")
        mark.dataset.helpSearchHighlight = "true"
        mark.className =
          "rounded bg-yellow-200 px-0.5 text-yellow-950 dark:bg-yellow-300/80 dark:text-yellow-950"
        mark.textContent = matchText
        fragment.append(mark)
        lastIndex = index + matchText.length
      }

      if (lastIndex < value.length) {
        fragment.append(document.createTextNode(value.slice(lastIndex)))
      }

      node.replaceWith(fragment)
    }

    const hash = window.location.hash.slice(1)
    if (hash) {
      window.requestAnimationFrame(() => {
        document.getElementById(decodeURIComponent(hash))?.scrollIntoView({
          block: "start",
        })
      })
    }
  }, [query])

  return null
}
