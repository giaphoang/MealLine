# Icon Animation Standards

This document defines the standards, patterns, and requirements for animated icons in the FEED System frontend. All animated icons must follow these conventions.

---

## Design Intent

Icons animate to signify interaction — motion is a signal, not decoration. These rules govern when and how animations apply.

### Rules

**1. Animation signals interactivity.**
An icon animates only when it is part of an interactive element. Animation is the visual confirmation that something is clickable, actionable, or linked.

**2. Interactive parent elements trigger animation on hover and on click.**
If an icon's parent — button, linked card, menu action, nav item, etc. — is clickable, the icon must animate on both hover and click/tap of that parent. The Sidebar nav icons are the canonical example of this pattern in the project.

**3. Icons also animate on initial render, with one exception.**
Interactive elements outside the Sidebar should also animate their icons on initial render — on page load, or when a menu or dialog first opens. This draws attention to actionable areas as they appear.

The Sidebar icons intentionally do not animate on page load. The sidebar is persistent UI; animating its icons on every page load would be repetitive and distracting. This exception is by design and should not be changed.

**4. Non-interactive elements use static Lucide icons, except page titles.**
If a parent element is not clickable and not linked to any action, its icon must
normally be a static Lucide variant. The one established exception is the
`SectionHeader` page-identity icon: Categories, Food Items, and equivalent
management pages use `createPageTitleIcon` to play one entrance animation on
mount and replay on direct icon hover. This is page-arrival orientation, not an
action affordance. New page-title icons must match that wrapper's 28px internal
SVG, standard `h-6 w-6 mt-1` slot, placement, and timing rather than rendering a
24px Lucide SVG directly.

**5. Shopping List Builder canvas and templates use only static icons.**
The Shopping List Builder's template canvas renders content for print. Printed output cannot animate, and the Preview Canvas should faithfully represent the printed page. No animated icons are used on template components or within the canvas. Standard UI chrome surrounding the builder (toolbar buttons, panel controls) may use animated icons where interactive.

---

## Two Icon Systems

The project uses two distinct animated icon systems that serve different use cases.

### 1. animate-ui Icons (`@/components/animate-ui/icons/`)

Motion/React-based icons that use Framer Motion variants. They are driven by an `AnimateIconContext` and can be triggered by a parent `<AnimateIcon>` wrapper or by trigger props handled internally via `IconWrapper`.

**Examples:** `UndoIcon`, `CopyIcon`, `Trash2Icon`, `SquarePenIcon`, `XIcon`, `TagIcon`, `ArrowLeftRightIcon`, `SunIcon`, `MoonIcon`, `SunMoonIcon`, `GaugeIcon`, `BotIcon`, `PlusIcon`, `FileDownIcon`, `SettingsIcon`

**Hand-rolled here** (no upstream registry version; Lucide geometry verbatim): `UploadIcon`, `SearchCheckIcon`, `FolderCheckIcon`, `GlobeLockIcon`, `FileChartPieIcon`, `ClipboardPenIcon`, `UsersRoundIcon`, `ShieldUserIcon`, `LogOutIcon`, `PanelLeftCloseIcon`, `BellIcon`

**File location:** `packages/frontend/src/components/animate-ui/icons/`

### 2. Imperative-Ref Icons (`@/components/ui/`)

Lucide-animated-style icons that expose `startAnimation` / `stopAnimation` methods via `React.forwardRef`. They manage their own internal Framer Motion controls.

**Examples:** `ShapesIcon`, `AppleIcon`, `GlobeIcon`, `LanguagesIcon`, `FileTextIcon`, `ClipboardListIcon`, `BellDotIcon`, `FunnelIcon`, `SearchIcon`

**File location:** `packages/frontend/src/components/ui/`

---

## Triggering Animations

### animate-ui Icons — use `<AnimateIcon>` wrapper

Always wrap animate-ui icons with `<AnimateIcon>` and set trigger props on the **wrapper**, not on the icon itself.

**Critical: wrap the interactive parent, not the icon.** The `asChild` prop on `AnimateIcon` uses a `Slot` that attaches its hover / tap event handlers to the direct child element. If the child is the icon, only hovering the icon's bounding box fires the animation. For a button with text + icon, hovering the text portion never triggers — which violates Rule 2 ("parent hover triggers icon animation").

```tsx
// WRONG — handlers attach to the icon, button-text hover doesn't fire
<Button onClick={save}>
  <AnimateIcon asChild animateOnHover animateOnTap>
    <SaveIcon size={16} />
  </AnimateIcon>
  Save Template
</Button>

// CORRECT — handlers attach to the Button; icon reads AnimateIconContext
<AnimateIcon asChild animateOnHover animateOnTap>
  <Button onClick={save}>
    <SaveIcon size={16} />
    Save Template
  </Button>
</AnimateIcon>
```

The same applies to `DropdownMenuItem`, `SelectTrigger`, `PopoverTrigger`, and any clickable parent — wrap the parent, put the icon inside. The icon consumes the outer `AnimateIconContext` via `useAnimateIconContext()` and animates whenever the parent fires `onMouseEnter` / `onPointerDown` / receives `animate={true}` from menu-open state. This is exactly how `TableActionMenu` does it for action-row icons.

When a Radix component (Button, DropdownMenuTrigger, etc.) is already inside an `asChild` Slot, you can nest: the outer `AnimateIcon asChild` Slot composes cleanly with the inner Radix Slot.

Nesting the other way round — a Radix `asChild` trigger wrapping `AnimateIcon`, as the sidebar's `<TooltipTrigger asChild><AnimateIcon asChild>` does — used to log "Function components cannot be given refs" on every page load and silently drop the trigger's ref. See [React 18 and refs](#react-18-and-refs) below; both `AnimateIcon` and the animate-ui `Slot` now forward refs, so either nesting order is safe.

```tsx
// Correct — triggers on the wrapper's hover/tap zone
<AnimateIcon animateOnHover animateOnTap>
  <SunIcon size={16} className="text-muted-foreground" />
</AnimateIcon>

// Correct — named animation variant on hover
<AnimateIcon animateOnHover="balancing" animateOnTap>
  <MoonIcon size={16} className="text-muted-foreground" />
</AnimateIcon>

// Correct — animate on view (once, when element enters viewport)
<AnimateIcon animateOnView animateOnViewOnce>
  <GaugeIcon size={16} />
</AnimateIcon>

// Correct — controlled by parent state
<AnimateIcon animate={isActive}>
  <ClipboardListIcon size={16} />
</AnimateIcon>
```

**Prefer wrapping the parent over passing trigger props to the icon:**

```tsx
// Discouraged — the trigger zone is only the icon's own bounding box
<SunIcon size={16} animateOnHover animateOnTap />
```

This makes `IconWrapper` render `<AnimateIcon asChild>` around the icon, so only
hovering the glyph itself fires the animation — the Rule 2 problem described
above. Wrap the interactive parent instead.

It no longer *breaks*: every generated `IconComponent` is wrapped in
`forwardRef` and puts the ref on its root `motion.svg`, so the `Slot` has
somewhere to put it. Until that change this pattern also logged "Function
components cannot be given refs" and dropped the ref — see
[React 18 and refs](#react-18-and-refs).

### React 18 and refs

Upstream animate-ui targets React 19, where `ref` is an ordinary prop that any
function component receives. **This project is on React 18.2**, where React
intercepts `ref`, keeps it off `props`, and refuses to hand it to a function
component that is not wrapped in `forwardRef`.

These places carried the React 19 assumption and were corrected:

| Component | Was | Now |
| --- | --- | --- |
| `AnimateIcon` | plain function; a Radix `asChild` trigger could not give it a ref | `forwardRef`, merged with its in-view ref |
| `Slot` (`primitives/animate/slot`) | read `ref` out of props, and read `children.props.ref` | `forwardRef`; reads the child's ref from `children.ref` |
| `Switch` (`primitives/radix/switch`) | spread Radix control props onto the DOM button | spreads only what the button takes |
| All 69 generated icons | `function IconComponent(...)` | `React.forwardRef<SVGSVGElement, …>`, ref on the root `motion.svg` |

**If you add or regenerate an icon**, apply the same shape — the generator emits
the React 19 form:

```tsx
const IconComponent = React.forwardRef<SVGSVGElement, FooProps>(
  function IconComponent({ size, ...props }, ref) {
    return <motion.svg ref={ref} …>
  },
);
IconComponent.displayName = 'IconComponent';
```

The failures were quiet ones. A dropped ref logs a warning but otherwise just
leaves a consumer holding `null` — `TabsTrigger` registers `localRef.current`
with the tab indicator so it can measure the active trigger, and it was
registering nothing.

If you port more animate-ui components, assume they were written for React 19
and check every `ref` before trusting it.

### Imperative-Ref Icons — call `startAnimation` / `stopAnimation` via ref

Use `React.useRef` and call the imperative API directly. This is the correct pattern when the trigger zone is larger than the icon (e.g., a whole card).

```tsx
const iconRef = React.useRef<{ startAnimation: () => void; stopAnimation: () => void }>(null)

// Animate on mount
React.useEffect(() => {
  iconRef.current?.startAnimation()
}, [])

// Animate on container hover
<Card
  onMouseEnter={() => iconRef.current?.startAnimation()}
  onMouseLeave={() => iconRef.current?.stopAnimation()}
>
  <ShapesIcon ref={iconRef} size={16} className="text-muted-foreground" />
</Card>
```

### Bridging Imperative-Ref Icons into an animate-ui Context

When an imperative-ref icon needs to respond to a parent `<AnimateIcon>` context (e.g., a sidebar nav item), use `BridgedAnimatedIcon` from `@/components/animate-ui/bridge`.

```tsx
// Inside a parent <AnimateIcon> context
<AnimateIcon animateOnHover>
  <BridgedAnimatedIcon icon={ShapesIcon} size={16} className="text-muted-foreground" />
</AnimateIcon>
```

`BridgedAnimatedIcon` reads `active` from `AnimateIconContext` and calls `startAnimation` / `stopAnimation` on the icon's ref accordingly.

**Critical limitation — `BridgedAnimatedIcon` only works reliably for `animateOnTap`.**

The bridge relies on a `useEffect` that reads `active` from context and calls the imperative ref. This async two-effect chain (parent effect sets `active: true` → re-render → child effect fires → `startAnimation()`) has two failure modes:

- **`animateOnHover` does not fire reliably.** The imperative-ref icon has an extra `<div>` wrapper with its own `onMouseEnter`/`onMouseLeave` handlers. These compete with the parent `AnimateIcon`'s `motion.span` handlers, and the async effect chain misses the event.
- **`animate` (mount/open) does not fire reliably.** React's child-before-parent effect ordering means the bridge effect runs before the parent's `animate` effect sets `active: true`, then the second pass fires correctly — but timing depends on batching and can miss the window.

`animateOnTap` uses pointer events (`onPointerDown`/`onPointerUp`), which are more robust and survive the async chain reliably.

**Rule: if an icon needs `animate` or `animateOnHover` to work, do not use `BridgedAnimatedIcon` — convert it to a native animate-ui icon instead.** The bridge is acceptable only for tap-only use cases where the icon lives in a context you cannot refactor (e.g., third-party nav components).

---

## Available Trigger Props (`AnimateIcon`)

| Prop | Type | Description |
|------|------|-------------|
| `animateOnHover` | `boolean \| string` | Trigger on mouseenter; string value selects a named animation variant |
| `animateOnTap` | `boolean \| string` | Trigger on pointerdown |
| `animateOnView` | `boolean \| string` | Trigger when element enters viewport (intersection observer) |
| `animateOnViewOnce` | `boolean` | If `true`, `animateOnView` only fires once (default: `true`) |
| `animate` | `boolean \| string` | Controlled trigger; pass `true`/`false` to start/stop from parent state |
| `animation` | `string` | Default animation variant name (default: `"default"`) |
| `loop` | `boolean` | Loop the animation continuously |
| `loopDelay` | `number` | Milliseconds to wait between loop iterations |
| `delay` | `number` | Milliseconds to delay before starting |
| `asChild` | `boolean` | Merge event handlers into the direct child element instead of a wrapping `motion.span` |

---

## Adding a New animate-ui Icon

Follow this exact file structure. All fields are required.

```tsx
'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  IconWrapper,
  useAnimateIconContext,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type MyIconProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    element: {
      initial: { /* resting state */ },
      animate: {
        /* animated state */
        transition: { duration: 0.4, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: MyIconProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"      // Must be "0 0 24 24" — registry icons ship with "0 24" (typo); patch immediately after install
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.path d="..." variants={variants.element} initial="initial" animate={controls} />
    </motion.svg>
  );
}

function MyIcon(props: MyIconProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  MyIcon,
  MyIcon as MyIconIcon,
  type MyIconProps,
  type MyIconProps as MyIconIconProps,
};
```

**`viewBox` trap:** Every icon installed from `@animate-ui` or `@lucide-animated` via `npx shadcn@latest add` ships with `viewBox="0 24"` (missing the two `0` values). This renders the icon invisible. Always check and correct to `viewBox="0 0 24 24"` immediately after install.

**SVG path truncation:** Both registries also ship icons with truncated SVG `d` attributes. Arc commands lose their middle flags (`a rx ry x-rot [large-arc] [sweep] dx dy` becomes `a rx ry x-rot dx dy`), and line commands lose their endpoint coordinates (`m4.9 4.9 1.4` instead of `m4.9 4.9 1.4 1.4`). The icon will render but look unrecognizable. After install, visually compare each path against the official Lucide source for that icon name and patch any truncated values.

### The `motion.svg` root animation silent failure trap

**Never put `animate={controls}` directly on the `motion.svg` root element.** Doing so causes a silent failure that is extremely difficult to diagnose:

```tsx
// WRONG — animation controls on the svg root
<motion.svg
  variants={variants.group}
  initial="initial"
  animate={controls}   // ← this is the problem
  {...props}
>
  <motion.path variants={variants.path1} d="..." />  // empty variants: {} cause silent error
  <motion.path variants={variants.path2} d="..." />
</motion.svg>
```

When `controls.start("animate")` fires, Framer Motion's animation Promise rejects or resolves immediately because child `motion.path` elements with empty variant objects (`path1: {}`) have nothing to animate. `AnimateIcon`'s internal `startAnim` function wraps `controls.start()` in a `try/catch { return }` — the rejection is swallowed silently. The icon renders correctly in its resting state, nothing in the console indicates a problem, and hover/open triggers appear to fire but produce no movement.

**The correct pattern** is to always animate child elements, never the SVG root:

```tsx
// CORRECT — controls on a motion.g child; svg root is plain motion.svg with no variants
<motion.svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" {...props}>
  <motion.g
    variants={variants.group}
    initial="initial"
    animate={controls}
    style={{ transformOrigin: 'center' }}
  >
    <path d="..." />
    <path d="..." />
  </motion.g>
</motion.svg>
```

Do not add empty variant entries (`path1: {}`, `path2: {}`) for paths that do not animate — simply omit those entries entirely.

### Animating a group of paths together (rotation, scale, etc.)

When an animation variant needs to apply a transform to multiple paths as a unit, wrap them in `<motion.g>` and bind the same `controls` and `variants`:

```tsx
<motion.g variants={variants.mainPath} initial="initial" animate={controls}>
  <path d="..." />
  <path d="..." />
</motion.g>
```

This is the correct approach for rotation effects (e.g., `RotateCcwIcon`, `RefreshCwIcon`). Do not apply `rotate` variants to individual `motion.path` elements when the intent is to rotate the group as a whole — path-level rotation applies relative to each path's own origin.

### Multiple animation variants

Add additional named keys to `animations` alongside `"default"`:

```tsx
const animations = {
  default: { path: { initial: {...}, animate: {...} } } satisfies Record<string, Variants>,
  spin:    { path: { initial: {...}, animate: {...} } } satisfies Record<string, Variants>,
} as const;
```

Select a variant via `<AnimateIcon animateOnHover="spin">`.

---

## Adding a New Imperative-Ref Icon

```tsx
"use client";

import { motion, useAnimation, type Variants } from "motion/react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface MyIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface MyIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const VARIANTS: Variants = {
  normal: { /* resting state */ },
  animate: { /* animated state */, transition: { duration: 0.4, ease: "easeOut" } },
};

const MyIcon = forwardRef<MyIconHandle, MyIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation:  () => controls.start("normal"),
      };
    });

    const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) onMouseEnter?.(e);
      else controls.start("animate");
    }, [controls, onMouseEnter]);

    const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) onMouseLeave?.(e);
      else controls.start("normal");
    }, [controls, onMouseLeave]);

    return (
      <div className={cn(className)} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
        <svg fill="none" height={size} width={size} stroke="currentColor" strokeLinecap="round"
             strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <motion.path animate={controls} initial="normal" variants={VARIANTS} d="..." />
        </svg>
      </div>
    );
  }
);

MyIcon.displayName = "MyIcon";
export { MyIcon };
```

The `isControlledRef` flag is the key pattern: when a parent holds the ref and calls `startAnimation`/`stopAnimation`, the icon's own hover handlers are suppressed. When used standalone (no ref), it self-animates on hover.

### Hand-rolling an animated variant of a Lucide icon

When you need an animated icon that has **no upstream animate-ui version**
(neither registry ships it), it is a sound and supported approach to
hand-roll one. You do **not** need to wait for, or force, a registry icon.

**Pick the system by trigger zone (this is the part that bites):**

- **Animates on a parent's hover** — e.g. it lives inside a `<Button>`, a
  toolbar, or any `<AnimateIcon animateOnHover>` context, and should react to
  the *whole control* lighting up — then **author it as a native animate-ui
  icon** (see "Adding a New animate-ui Icon" above). Only a native icon reads
  the parent `AnimateIcon` context; an imperative-ref icon placed in that
  context will **only self-animate on direct icon hover**, which looks broken
  next to native siblings that animate on full-button hover. The bridge does
  **not** rescue this (`BridgedAnimatedIcon` is tap-only — see above).
- **Self-animates on its own hover, or is ref-driven by a parent** (e.g. a
  card that calls `startAnimation()` via the icon's ref) — then the
  imperative-ref pattern is fine.

Recipe (same motion ideas either way — only the host framework differs):

1. **Copy the geometry verbatim from Lucide** so the icon is visually
   identical to the static version at rest. Pull the exact paths from
   `node_modules/lucide-react/dist/esm/icons/<name>.js` (`__iconNode`) — do
   not eyeball or redraw them.
2. **Borrow motion ideas from existing animated icons** rather than inventing
   new ones. Two reliable, composable primitives already in the codebase:
   - **Line tracing** (draw-on): animate `pathLength` / `pathOffset` /
     `opacity` on `motion.path` / `motion.circle`. Good for outlines,
     meridians, strokes. (See the Dribbble-style globe lines.)
   - **Transform loop** (bob / tip / pulse): animate `y` / `rotate` / `scale`
     on a `motion.g` wrapping a sub-group, with `style={{ transformOrigin }}`
     set to that group's center in viewBox units, and
     `repeat: Number.POSITIVE_INFINITY` to loop while hovered. (See the
     Folder-Lock-style lock.)
3. **Compose them.** In a native icon, give each independent motion its own
   keyed entry under `animations.default` (e.g. `lines`, `lock`) and bind each
   `motion` element to `animate={controls}` with `variants={variants.<key>}`
   and `initial="initial"` (never put `animate` on the `motion.svg` root — see
   the silent-failure trap above). In an imperative icon, use one
   `useAnimation()` control per motion and start/stop them together.

**Worked example in the codebase:** `components/animate-ui/icons/globe-lock.tsx`
— a **native** animated variant of Lucide `globe-lock` whose globe lines trace
in (Dribbble idea) while the lock bobs and tips (Folder-Lock idea). It is used
by the **Global Limit Settings** toolbar button on the Shopping Lists page,
where `TableFeatureBar` wraps each button in `<AnimateIcon animateOnHover
animateOnTap>` — so it animates on full-button hover, exactly like its native
`Plus` and `FileDown` siblings. (It was first written as an imperative-ref
icon and only animated on direct icon hover; that's the bug this section
exists to prevent.)

> **Sizing in generic slots is free with a native icon.** Generic consumers
> (e.g. `TableFeatureBar`) render icons as `<Icon className="h-4 w-4 mr-2" />`
> and expect that `className` to size and space the **glyph**. Native
> animate-ui icons already apply `className` to the `<svg>` via `IconWrapper`,
> so CSS width/height beats the `width`/`height` attributes and the icon sizes
> correctly. (An imperative-ref icon puts `className` on its wrapper `<div>`,
> leaving the inner `<svg>` at `size` (28px) — another reason to prefer the
> native framework for icons that drop into shared slots.)

---

## Action Menu Icons (TableActionMenu)

The `TableActionMenu` component provides three animation triggers for all icons in a row:

- **`animate`** — fires once when the dropdown opens (initial render of each item)
- **`animateOnHover`** — fires when the user hovers anywhere over the menu row
- **`animateOnTap`** — fires on pointer down

**All icons used in `TableActionMenu` must be native animate-ui icons.** Imperative-ref icons appear to work (they self-animate on icon hover) but fail two of the three triggers:

1. They do not respond to the `AnimateIconContext` provided by the `AnimateIcon` wrapper, so they ignore the `animate` and `animateOnHover` triggers.
2. Their own `<div>` with `onMouseEnter`/`onMouseLeave` only fires when hovering the icon area itself — not the full row width. This creates an inconsistent UX where the user must hover precisely over the icon rather than anywhere in the row.

**When adding a new icon to any action menu:** if the icon does not exist yet as a native animate-ui icon in `@/components/animate-ui/icons/`, create it there following the template. Do not use `@/components/ui/` (imperative-ref) icons in action menus.

### The `animate` prop stuck-state pitfall

**Do not use a static `animate` boolean on `AnimateIcon`.** Using `<AnimateIcon animate animateOnHover>` causes a subtle bug: after the mount animation completes, `AnimateIcon`'s internal `localAnimate` remains `true`. When the user then hovers, `startAnimation()` calls `setLocalAnimate(true)` — the value is unchanged, React skips the re-render, and no animation plays. Only after the first mouse-leave (which sets `localAnimate = false`) does hover start working.

**The correct pattern** is to drive `animate` from a state variable tied to `DropdownMenu.onOpenChange`, then reset it after the mount animations complete:

```tsx
const ANIMATE_RESET_DELAY_MS = 800  // > longest icon animation duration

const [animateMount, setAnimateMount] = React.useState(false)
const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

const handleOpenChange = React.useCallback((isOpen: boolean) => {
  if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  if (isOpen) {
    setAnimateMount(true)
    timerRef.current = setTimeout(() => { setAnimateMount(false); timerRef.current = null }, ANIMATE_RESET_DELAY_MS)
  } else {
    setAnimateMount(false)
  }
}, [])

// <AnimateIcon asChild animate={animateMount} animateOnHover animateOnTap>
```

**Why this works:** when `animate` prop transitions `true → false`, `AnimateIcon`'s prop-change effect calls `stopAnimation()`, which sets `localAnimate = false`. From that point every hover cycles `false → true`, replaying the animation reliably. The visual reset is invisible because all action-menu icon animations end at their initial visual values (keyframes return to 0/1 at the end of each sequence).

**The timeout value** must exceed the longest animation in the set. The safe minimum is the longest `delay + duration` across all icons in the menu. If you add new icons with longer animations, increase `ANIMATE_RESET_DELAY_MS` accordingly.

---

## Sidebar Nav Icons

Sidebar nav icons follow a different rule from action menus and must **never** use the `animate` prop.

### Why `animate` is forbidden on sidebar icons

The sidebar is persistent UI — it is visible on every page. Animating its icons on each page load or navigation would be repetitive and distracting (see Rule 3). More critically, `animate` causes the `localAnimate` stuck-state bug: after the initial animation, `localAnimate` remains `true`, and the first hover does nothing. The user must hover and un-hover once before subsequent hovers animate. This is the same root cause documented in "The `animate` prop stuck-state pitfall" above.

Unlike `TableActionMenu`, the correct fix for sidebar icons is **not** to cycle `animate` via a state + timer — it is to remove `animate` entirely. With no initial animation wanted, there is no need to drive it from state at all.

### Correct pattern

```tsx
// Correct — no animate prop; hover and tap work from the very first interaction
<AnimateIcon asChild animateOnHover animateOnTap>
  <Link to={item.href}>
    <item.icon className="h-4 w-4 shrink-0" />
  </Link>
</AnimateIcon>
```

```tsx
// Wrong — animate prop causes stuck localAnimate + violates no-page-load rule
<AnimateIcon asChild animate animateOnHover animateOnTap>
  <Link to={item.href}>
    <item.icon className="h-4 w-4 shrink-0" />
  </Link>
</AnimateIcon>
```

**Summary:** for any nav item in `app-sidebar.tsx` or `navigation-section.tsx`, use `animateOnHover animateOnTap` only. Never add `animate`.

---

## Choosing the Right Icon Type

| Situation | Use |
|-----------|-----|
| Icon in `TableActionMenu` or any `<AnimateIcon asChild>` row | **Native animate-ui icon** (imperative-ref will fail `animate` + `animateOnHover`) |
| Icon animates when its direct parent is hovered/clicked | animate-ui icon + `<AnimateIcon animateOnHover>` wrapper |
| Icon animates when a larger container is hovered (e.g., a card) | Imperative-ref icon + `useRef` + container `onMouseEnter`/`onMouseLeave` |
| `SectionHeader` / DataList page-title identity | Imperative-ref icon + `createPageTitleIcon` (28px internal SVG; mount + direct-hover animation) |
| Icon needs `animate` (mount) or `animateOnHover` inside a parent context | **Convert to a native animate-ui icon** — do not use `BridgedAnimatedIcon` |
| Icon only needs `animateOnTap` inside a parent context (acceptable bridge use) | Imperative-ref icon + `BridgedAnimatedIcon` |
| Animation is purely decorative, plays on page load/scroll-into-view | animate-ui icon + `<AnimateIcon animateOnView animateOnViewOnce>` |
| Icon must support multiple named animation variants (e.g., "balancing" for Moon) | animate-ui icon with named variant keys in `animations` |

---

## Before Installing from the Registry — Check First

**Always check whether an animated version of the icon already exists in this project before installing from any registry.**

This project has icons in two locations:

| Location | Pattern | When used |
|----------|---------|-----------|
| `@/components/animate-ui/icons/` | Native animate-ui (context-driven, works in `TableActionMenu`) | All action menus, `AnimateIcon`-wrapped buttons |
| `@/components/ui/` | Imperative-ref (self-animating div, `forwardRef` + ref API) | Sidebar nav icons, large hover zones (cards, feature panels) |

**Pre-install checklist:**

1. `ls src/components/animate-ui/icons/ | grep <name>` — look for an existing native icon.
2. `ls src/components/ui/ | grep <name>` — look for an existing imperative-ref icon.
3. Check whether the use case is an action menu row (needs `animate-ui/icons/`) or a sidebar/card zone (needs `ui/`).

If an icon already exists in one location and you need it in the other, **create a parallel file — do not overwrite the existing one.** The two variants have different APIs and serve different contexts; both need to coexist.

> **Regression warning:** `npx shadcn@latest add` with `--overwrite` will silently replace any file at the destination path. If a working icon lives at `src/components/ui/languages.tsx` and you run `npx shadcn@latest add "https://lucide-animated.com/r/languages.json" --overwrite`, that file is destroyed. Use `--overwrite` only when you intend to replace a file and have confirmed there are no other consumers of the current version.

---

## Installing from the Registry

```bash
npx shadcn@latest add @animate-ui/icons-<name>
```

After install, always:
1. Open the generated file in `src/components/animate-ui/icons/`
2. Fix `viewBox="0 24"` → `viewBox="0 0 24 24"`
3. Compare every `d="..."` attribute against the official Lucide source for that icon and patch any truncated arc or line values
4. Verify the file structure matches the template above
5. Run `npx tsc --noEmit` to confirm no TypeScript errors
6. Render the icon in the browser and visually confirm it looks correct before committing

The registry install may also silently modify `icon.tsx`. Review any changes to that file before committing.
