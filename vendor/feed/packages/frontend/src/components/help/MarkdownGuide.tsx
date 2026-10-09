// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useMemo } from "react"
import { Link } from "react-router-dom"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"
import { getGuideHeadingIdsByLine, rewriteGuideLink } from "@/lib/user-guides"

type MarkdownGuideProps = {
  content: string
}

type MarkdownGuideContentProps = MarkdownGuideProps

function getDarkScreenshotSrc(src?: string) {
  if (!src?.startsWith("/help-screenshots/") || !src.endsWith(".png")) {
    return undefined
  }

  return src.replace(/\.png$/, "-dark.png")
}

export function MarkdownGuideContent({ content }: MarkdownGuideContentProps) {
  const headingIdsByLine = useMemo(() => getGuideHeadingIdsByLine(content), [content])

  const components: Components = {
    a: ({ href, children, className, node: _node, title, ...props }) => {
      const shouldUnderline = title === "underline"
      const linkClassName = cn(
        shouldUnderline && "underline underline-offset-4",
        className
      )

      if (!href) {
        return (
          <a className={linkClassName} {...props}>
            {children}
          </a>
        )
      }

      const rewrittenHref = rewriteGuideLink(href)
      const isExternal =
        rewrittenHref.startsWith("http://") || rewrittenHref.startsWith("https://")

      if (isExternal) {
        return (
          <a
            className={linkClassName}
            href={rewrittenHref}
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          >
            {children}
          </a>
        )
      }

      if (rewrittenHref.startsWith("mailto:") || rewrittenHref.startsWith("#")) {
        return (
          <a className={linkClassName} href={rewrittenHref} {...props}>
            {children}
          </a>
        )
      }

      return (
        <Link className={linkClassName} to={rewrittenHref} {...props}>
          {children}
        </Link>
      )
    },
    h1: ({ children, node: _node, ...props }) => (
      <h1
        className="text-3xl font-semibold tracking-tight text-foreground"
        {...props}
      >
        {children}
      </h1>
    ),
    h2: ({ children, node: _node, ...props }) => {
      const line = _node?.position?.start.line
      const id = line ? headingIdsByLine.get(line) : undefined
      return (
        <h2
          id={id}
          className="scroll-mt-24 border-t pt-8 text-2xl font-semibold tracking-tight text-foreground first:border-t-0 first:pt-0"
          {...props}
        >
          {children}
        </h2>
      )
    },
    h3: ({ children, node: _node, ...props }) => {
      const line = _node?.position?.start.line
      const id = line ? headingIdsByLine.get(line) : undefined
      return (
        <h3
          id={id}
          className="scroll-mt-24 text-lg font-semibold text-foreground"
          {...props}
        >
          {children}
        </h3>
      )
    },
    p: ({ className, node: _node, ...props }) => (
      <p className={cn("leading-7 text-foreground/90", className)} {...props} />
    ),
    ul: ({ className, node: _node, ...props }) => (
      <ul className={cn("ml-5 list-disc space-y-2 leading-7", className)} {...props} />
    ),
    ol: ({ className, node: _node, ...props }) => (
      <ol className={cn("ml-5 list-decimal space-y-2 leading-7", className)} {...props} />
    ),
    li: ({ className, node: _node, ...props }) => (
      <li className={cn("pl-1 text-foreground/90", className)} {...props} />
    ),
    blockquote: ({ className, node: _node, ...props }) => (
      <blockquote
        className={cn("border-l-4 border-primary/40 pl-4 text-muted-foreground", className)}
        {...props}
      />
    ),
    img: ({ alt, className, node: _node, src, ...props }) => {
      const darkSrc = getDarkScreenshotSrc(src)
      const imageClassName = cn("rounded-lg border shadow-sm", className)

      if (!darkSrc) {
        return (
          <img
            alt={alt}
            className={cn("my-4", imageClassName)}
            loading="lazy"
            src={src}
            {...props}
          />
        )
      }

      return (
        <span className="my-4 block">
          <img
            alt={alt}
            className={cn(imageClassName, "dark:hidden")}
            loading="lazy"
            src={src}
            {...props}
          />
          <img
            alt={alt}
            className={cn(imageClassName, "hidden dark:block")}
            loading="lazy"
            src={darkSrc}
            {...props}
          />
        </span>
      )
    },
    code: ({ className, node: _node, ...props }) => (
      <code
        className={cn(
          "rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground",
          className
        )}
        {...props}
      />
    ),
    pre: ({ className, node: _node, ...props }) => (
      <pre
        className={cn(
          "overflow-x-auto rounded-lg border bg-muted p-4 text-sm text-foreground",
          className
        )}
        {...props}
      />
    ),
    table: ({ className, node: _node, ...props }) => (
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    ),
    th: ({ className, node: _node, ...props }) => (
      <th
        className={cn("border bg-muted px-3 py-2 text-left font-medium", className)}
        {...props}
      />
    ),
    td: ({ className, node: _node, ...props }) => (
      <td className={cn("border px-3 py-2 align-top", className)} {...props} />
    ),
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  )
}

export function MarkdownGuide({ content }: MarkdownGuideProps) {
  return (
    <article
      data-guide-article
      className="max-w-none space-y-5 rounded-lg border bg-card p-5 shadow-sm md:p-7"
    >
      <MarkdownGuideContent content={content} />
    </article>
  )
}
