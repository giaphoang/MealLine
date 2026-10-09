# Standard Page Layout

Every route in FEED presents the same way: an icon, a title, a one-line
description, then content. This document fixes the container that produces that
result, because it has drifted once already — the Admin page shipped in
1.5.0-beta.4 double-padded and inset further right than every other route
(ISSUES.md #56).

## The contract

Padding is split between the shell and the page. Neither owns all of it.

| Owner | Supplies |
| --- | --- |
| `RootLayout`'s `<main>` | horizontal padding (`px-4 sm:px-6`) and bottom padding (`pb-6`) |
| the page component | top padding (`pt-6`) and vertical rhythm (`space-y-6`) |

A page that adds its own horizontal padding gets it twice. That is precisely
what `p-6` does, and it is the mistake to watch for.

## The canonical page

```tsx
export function ThingPage() {
  return (
    <div className="space-y-6 min-w-0 w-full pt-6">
      <SectionHeader
        title="Thing"
        description="One line, sentence case, explaining what a staff member does here."
        icon={ThingIcon}
      />

      {/* content */}
    </div>
  );
}
```

`min-w-0 w-full` is not decoration. `<main>` is a flex column, and without
`min-w-0` a wide child — a table, a long email address, a code block — refuses
to shrink and pushes the whole page into horizontal overflow.

## Rules

1. **Page root is exactly `space-y-6 min-w-0 w-full pt-6`.** No `p-6`, no
   `px-*`, no `py-*`. If a page needs different internal rhythm, change it on an
   inner container, not the root.
2. **`SectionHeader` is the first child**, and it is the only place a page title
   lives. Do not hand-roll an `<h1>`/`<h2>` heading block.
3. **The header icon follows the page-title animation pattern.** Use an
   imperative-ref icon from `@/components/ui` through `createPageTitleIcon`, as
   Categories and Food Items do. It plays once on mount and replays when the
   icon itself is hovered. The wrapper supplies the established 28px internal
   SVG inside SectionHeader's `h-6 w-6 mt-1` slot. Do not substitute a direct
   24px Lucide SVG; it renders perceptibly smaller. The matching *sidebar*
   entry uses a native animate-ui variant and responds to the full link's hover
   and tap without animating on initial sidebar render. See the narrow
   page-title exception in `docs/motion/ICON_ANIMATIONS.md` Rule 4.
4. **`description` is one sentence**, sentence case, no trailing period
   ambiguity — it wraps under the title at any width and should still read as a
   single thought on a narrow viewport.
5. **Do not wrap `SectionHeader` in an extra `<div>`.** The page root already
   carries `min-w-0 w-full`, so a `<div className="w-full min-w-0">` around the
   header repeats it to no effect. `settings/index.tsx` and
   `shared/data-list/DataList.tsx` carried one until 1.5.0-beta.4; every page
   is now consistent.

## Conforming routes

`analytics`, `reports-management`, `settings`, `data-management`, `admin`,
`language-management`, and the shared `shared/data-list/DataList` — which in
turn supplies the standard container to Categories, Food Items, Translations,
and AI Configuration. Those four pages delegate rather than declaring the
wrapper themselves, which is compliant; their outer `space-y-8` is spacing
around the delegated `DataList`, not a competing page container.

## Verifying

The cheapest check is measurement, not eye. With the app running, compare the
route against a known-good one:

```js
(() => { const h = document.querySelector('main h2'); const r = h.getBoundingClientRect();
  return { title: h.textContent.trim(), titleLeft: Math.round(r.left), titleTop: Math.round(r.top) }; })()
```

At the desktop breakpoint every conforming route reports the same numbers —
icon at x=24, title at x=64, header top at y=88. A page that reports a larger
`titleLeft` is almost certainly double-padded.

## Deliberate exceptions

- **Shopping List Builder canvas** renders paper, not app chrome. It owns its
  own geometry and is exempt from this document; see the builder sections of
  `AGENTS.md`.
- **Login and logout** render outside `RootLayout` entirely, so no `<main>`
  padding exists to complement.
- **Print surfaces** (`.print-theme`, `.shopping-list-print-page`) are exempt
  for the same reason as the canvas.
