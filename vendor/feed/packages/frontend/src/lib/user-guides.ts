// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

export type UserGuide = {
  slug: string
  filename: string
  title: string
  description: string
  order: number
  content: string
}

export type GuideTocItem = {
  id: string
  title: string
  depth: 2 | 3
}

export type GuideSearchEntry = {
  id: string
  guideSlug: string
  guideTitle: string
  guideOrder: number
  sectionId: string
  sectionTitle: string
  content: string
}

const GUIDE_MODULES = import.meta.glob<string>(
  "../../../../docs/user-guides/[0-9][0-9]-*.md",
  {
    eager: true,
    import: "default",
    query: "?raw",
  }
)

const FILENAME_PATTERN = /^(\d+)-(.+)\.md$/
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE_PATTERN = /^\s*(```|~~~)/

function filenameFromPath(path: string): string {
  return path.split("/").pop() ?? path
}

function parseFilename(filename: string): { slug: string; order: number } | null {
  const match = filename.match(FILENAME_PATTERN)
  if (!match) return null

  return {
    order: Number.parseInt(match[1], 10),
    slug: match[2],
  }
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? cleanHeadingText(match[1]) : "Untitled"
}

function extractDescription(content: string): string {
  const lines = content.split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    return markdownToPlainText(trimmed)
  }

  return ""
}

export function cleanHeadingText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .trim()
}

export function markdownToPlainText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>#|]/g, " ")
    .replace(/^-{3,}$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function baseHeadingSlug(value: string): string {
  return cleanHeadingText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

export function createGuideSlugger() {
  const seen = new Map<string, number>()

  return {
    slug(value: string): string {
      const base = baseHeadingSlug(value) || "section"
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      return count === 0 ? base : `${base}-${count}`
    },
  }
}

export function getGuideToc(content: string): GuideTocItem[] {
  const slugger = createGuideSlugger()
  const headings: GuideTocItem[] = []
  let inFence = false

  for (const line of content.split("\n")) {
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = line.match(HEADING_PATTERN)
    if (!match) continue

    const depth = match[1].length
    if (depth !== 2 && depth !== 3) continue

    const title = cleanHeadingText(match[2])
    if (!title) continue

    headings.push({
      id: slugger.slug(title),
      title,
      depth,
    })
  }

  return headings
}

export function getGuideHeadingIdsByLine(content: string): Map<number, string> {
  const slugger = createGuideSlugger()
  const headingIds = new Map<number, string>()
  let inFence = false

  content.split("\n").forEach((line, index) => {
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return

    const match = line.match(HEADING_PATTERN)
    if (!match) return

    const depth = match[1].length
    if (depth !== 2 && depth !== 3) return

    const title = cleanHeadingText(match[2])
    if (!title) return

    headingIds.set(index + 1, slugger.slug(title))
  })

  return headingIds
}

function getGuideSearchEntries(guide: UserGuide): GuideSearchEntry[] {
  const slugger = createGuideSlugger()
  const entries: GuideSearchEntry[] = []
  let inFence = false
  let current:
    | {
        sectionId: string
        sectionTitle: string
        contentLines: string[]
      }
    | null = null

  const flushCurrent = () => {
    if (!current) return

    const content = markdownToPlainText(current.contentLines.join("\n")) || current.sectionTitle
    entries.push({
      id: `${guide.slug}:${current.sectionId}`,
      guideSlug: guide.slug,
      guideTitle: guide.title,
      guideOrder: guide.order,
      sectionId: current.sectionId,
      sectionTitle: current.sectionTitle,
      content,
    })
  }

  for (const line of guide.content.split("\n")) {
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence
      current?.contentLines.push(line)
      continue
    }

    if (!inFence) {
      const match = line.match(HEADING_PATTERN)
      if (match) {
        const depth = match[1].length
        if (depth === 2 || depth === 3) {
          const sectionTitle = cleanHeadingText(match[2])
          if (sectionTitle) {
            flushCurrent()
            current = {
              sectionId: slugger.slug(sectionTitle),
              sectionTitle,
              contentLines: [],
            }
            continue
          }
        }
      }
    }

    current?.contentLines.push(line)
  }

  flushCurrent()

  return entries
}

export function buildUserGuidesFromModules(modules: Record<string, string>): UserGuide[] {
  const guides: UserGuide[] = []

  for (const [path, content] of Object.entries(modules)) {
    const filename = filenameFromPath(path)
    const parsed = parseFilename(filename)
    if (!parsed) continue

    guides.push({
      slug: parsed.slug,
      filename,
      title: extractTitle(content),
      description: extractDescription(content),
      order: parsed.order,
      content,
    })
  }

  return guides.sort((a, b) => a.order - b.order)
}

export function getAllUserGuides(): UserGuide[] {
  return buildUserGuidesFromModules(GUIDE_MODULES)
}

export function getUserGuideSlugs(): string[] {
  return getAllUserGuides().map((guide) => guide.slug)
}

export function getUserGuideBySlug(slug: string): UserGuide | null {
  return getAllUserGuides().find((guide) => guide.slug === slug) ?? null
}

export function getHelpSearchIndex(): GuideSearchEntry[] {
  return getAllUserGuides().flatMap((guide) => getGuideSearchEntries(guide))
}

export function rewriteGuideLink(href: string): string {
  if (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("#")
  ) {
    return href
  }

  const [hrefPath, hash] = href.split("#")
  if (!hrefPath.endsWith(".md")) return href

  const filename = filenameFromPath(hrefPath)
  const parsed = parseFilename(filename)
  if (!parsed) return href

  return `/help/${parsed.slug}${hash ? `#${hash}` : ""}`
}
