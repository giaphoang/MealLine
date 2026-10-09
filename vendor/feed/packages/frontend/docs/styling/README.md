# Theme and Styling Documentation

This document outlines the styling system used in the FEED application.

## Table of Contents

- [Overview](#overview)
- [Theme System](#theme-system)
- [Tailwind CSS](#tailwind-css)
- [Color System](#color-system)
- [Component Styling](#component-styling)
- [Responsive Design](#responsive-design)
- [Dark Mode](#dark-mode)
- [Best Practices](#best-practices)
  - [Form Control Fill](#form-control-fill)

## Overview

The FEED application uses a combination of:
- Tailwind CSS for utility-based styling
- CSS variables for theme values
- Shadcn UI for component styling
- CSS modules for complex component styles
- Built-in dark mode support

## Theme System

### Theme Provider

The application uses `next-themes` for theme management:

```tsx
// src/components/theme-provider.tsx
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children, ...props }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
```

### Theme Switching

The header control is deliberately a two-state light/dark toggle. The explicit
three-way Light, Dark, and Follow this device choice lives in Settings →
Appearance and is stored only in that browser. See
`docs/frontend-services/theme-control.md` for the complete contract.

## Tailwind CSS

### Configuration

Tailwind v4 reads the `@theme inline` block in `src/index.css`; there is no
runtime Tailwind configuration object. Each semantic color maps directly to a
complete CSS color value, for example:

```css
@theme inline {
  --color-border: var(--border);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
}
```

### Utility Classes

The application uses Tailwind utility classes for most styling:

```tsx
<button className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
  Click Me
</button>
```

## Branding and Color System

The compiled, fail-closed color scheme is William Temple House. An active
organization configuration can replace the brand-owned tokens at runtime; the
status, success/destructive, geometry, and print-layout contracts stay fixed.
The app-shell gradients and glows are expressed as `color-mix()` relationships
between those semantic tokens, so they follow the active brand without adding a
second configurable palette.

### Color Variables

Brand-owned tokens are complete OKLCH values. The authored fallback in
`src/index.css` and the public `/api/brand/theme.css` response are generated from
the same Tailwind-family stop map:

```css
/* Light mode */
:root {
  /* Core brand colors */
  --background: oklch(1 0 0);
  --foreground: oklch(0.129 0.042 264.7);
  --primary: oklch(0.443 0.11 240.8);
  --primary-foreground: oklch(1 0 0);
  
  /* Secondary palette */
  --secondary: oklch(0.929 0.013 255.5);
  --secondary-foreground: oklch(0.208 0.042 265.8);
  --accent: oklch(0.953 0.051 180.8);
  --accent-foreground: oklch(0.386 0.063 188.4);
  
  /* Status colors */
  --color-inStock: hsl(141, 53%, 53%);
  --color-limited: hsl(39, 100%, 50%);
  --color-clearance: hsl(3, 87%, 63%);
  --color-outOfStock: hsl(0, 0%, 50%);
}

/* Dark mode */
.dark {
  --background: oklch(0.129 0.042 264.7);
  --foreground: oklch(0.984 0.003 247.9);
  --primary: oklch(0.879 0.169 91.6);
  --primary-foreground: oklch(0.129 0.042 264.7);
  
  /* Status colors (dark mode variants) */
  --color-inStock: hsl(141, 53%, 40%);
  --color-limited: hsl(39, 100%, 45%);
  --color-clearance: hsl(3, 87%, 55%);
  --color-outOfStock: hsl(0, 0%, 50%);
}
```

### William Temple House Theme

The color theme is based on William Temple House's brand colors:
- **Light mode**: Blue primary color with white background
- **Dark mode**: Gold primary color with dark background

Status colors remain consistent with their meaning across both themes but are adjusted for appropriate contrast.

### Customization for Other Organizations

Do not edit `index.css` for an organization deployment. Administrators use
Settings → Appearance → Organization customization. The backend validates the
small color story, snaps each role to the nearest allowed Tailwind family,
derives both scopes, and delivers it before React mounts. Invalid data and
storage failures return the compiled WTH configuration.

The renderer supports three CSS states and every surface must work in all of
them: no class (system), `.light`, and `.dark`. Alpha over a semantic color uses
`color-mix(in oklch, var(--token) N%, transparent)`; never place an OKLCH token
inside `hsl(var(--token))`.

### Chart Colors

Colors for charts and visualizations:

```typescript
// src/lib/chart-colors.ts
export const chartPresets = {
  primary: { theme: { light: 'var(--chart-primary)', dark: 'var(--chart-primary)' } },
  success: { theme: { light: 'var(--chart-success)', dark: 'var(--chart-success)' } },
  warning: { theme: { light: 'var(--chart-warning)', dark: 'var(--chart-warning)' } },
};
```

Categorical series keep FEED's contrast-tested Carbon values. Brand resolution
rotates their order by hue distance; it does not generate replacement colors.

## Component Styling

### Component Variants

The application uses the `cva` (Class Variance Authority) library for component variants:

```tsx
// src/components/ui/button.tsx
import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors...",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "underline-offset-4 hover:underline text-primary",
      },
      size: {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-11 px-8 rounded-md",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
```

### Custom Component Styling

For components with complex styling needs, a mix of Tailwind and CSS modules is used:

```tsx
// MyComponent.module.css
.container {
  position: relative;
  overflow: hidden;
}

.animated {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

// MyComponent.tsx
import styles from './MyComponent.module.css';
import { cn } from '@/lib/utils';

export function MyComponent({ className, animated, ...props }) {
  return (
    <div
      className={cn(
        styles.container,
        animated && styles.animated,
        'p-4 bg-background rounded-lg shadow-sm',
        className
      )}
      {...props}
    >
      {/* Component content */}
    </div>
  );
}
```

## Responsive Design

### Breakpoints

The application uses standard Tailwind breakpoints:

```css
/* Tailwind default breakpoints */
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

### Responsive Components

Components adapt to different screen sizes:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => (
    <Card key={item.id} className="p-4">
      {/* Card content */}
    </Card>
  ))}
</div>
```

### Media Query Hook

For complex responsive logic, the application uses a custom `useMediaQuery` hook:

```tsx
import { useMediaQuery } from '@/hooks/use-media-query';

function ResponsiveComponent() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  return (
    <div>
      {isMobile ? (
        <MobileLayout />
      ) : (
        <DesktopLayout />
      )}
    </div>
  );
}
```

## Dark Mode

### Implementation

Dark mode is implemented using:
- `next-themes` for theme switching
- Tailwind's `dark:` modifier for dark-specific styles
- CSS variables for theme-aware colors
- A View Transitions reveal in `src/lib/theme-transition.ts`, with reduced-motion fallback

### Usage

```tsx
<div className="bg-background text-foreground dark:bg-slate-900 dark:text-slate-50">
  <h1 className="text-2xl font-bold">Title</h1>
  <p className="text-muted-foreground dark:text-slate-400">
    This text adapts to dark mode
  </p>
</div>
```

### Context-Aware Components

Components check the current theme:

```tsx
import { useTheme } from 'next-themes';

function ThemedIcon() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  return <Icon color={isDark ? '#ffffff' : '#000000'} />;
}
```

## Best Practices

### App Shell Surfaces

Write `-webkit-backdrop-filter` **before** `backdrop-filter` in authored shell
CSS, including print resets. Tailwind's production optimizer retains only the
prefixed property when it comes last, so Safari renders the frost while Chrome
loses it. Development CSS is unaffected: verify optimized assets on localhost,
not just Vite dev mode. `src/test/shell-backdrop-build.test.ts` exercises the
actual optimizer to protect both declarations (ISSUES.md #85, v1.8.1).

Authenticated app screens use centralized shell atmosphere tokens in `src/index.css`.
The fixed backdrop is owned by `RootLayout`, and reusable surface treatments are opt-in:

```tsx
<Card data-feed-card-surface="soft" data-feed-card-interactive="true">
  ...
</Card>
```

Use these treatments for dashboard/status/configuration cards where subtle elevation helps scanning. Do not apply them to dense data tables, dialogs nested inside other cards, or Shopping List Builder printable surfaces. Print and PDF preview areas must remain flat and theme-independent.

### Form Control Fill

**Every text-entry and select control carries a solid fill.** `Input`,
`Textarea`, and `SelectTrigger` default to `bg-background` in
`src/components/ui/`. They previously defaulted to `bg-transparent`, which let
whatever sat behind them — the app-shell atmosphere gradient, a `Card`, a
tinted panel — show through, so the same filter field read as a different
colour on every page and had almost no edge contrast against the shell.

The set is `Input`, `Textarea`, `SelectTrigger`, and `InputOTPSlot`. The OTP
slot was missed in the original pass and reported later from the login screen —
worth remembering that the standard lives in the *primitives*, so auditing call
sites will not find a transparent control whose primitive never had a fill.

The fill is a **primitive default, not a call-site class.** Do not write
`bg-background` on an `<Input>`, `<Textarea>`, or `<SelectTrigger>` — it is
already there, and a redundant override is one more place the standard can
drift. Two such overrides existed (Operating Hours time inputs, the shared date
range control) and were removed when the default landed.

Deviations are deliberate and rare. `bg-muted` marks a field that is populated
but not editable (AI Configuration's Service and API Key review steps). Do not
introduce a transparent form control; if a surface makes the standard fill look
wrong, fix the surface.

Reference appearance: the `Columns` dropdown trigger in any
`EnhancedDataTable` feature bar, and the Operating Hours time inputs in
Settings. A filter or search field sitting beside the `Columns` button should be
indistinguishable from it in fill.

### Consistent Color Usage

Use semantic color variables instead of hardcoded values:

```tsx
// Bad
<div className="text-blue-500">Blue text</div>

// Good
<div className="text-primary">Primary text</div>
```

### Component Composition

Build complex UIs through component composition:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Content goes here</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Responsive Design Guidelines

1. Design for mobile first
2. Use responsive utility classes
3. Test all components on multiple screen sizes
4. Use Grid and Flexbox for layout
5. Consider touch targets on mobile (min 44px)

### Class Name Organization

Follow a consistent order for class names:

1. Layout (position, display, width, height)
2. Spacing (margin, padding)
3. Typography (font, text)
4. Visual (colors, borders, shadows)
5. Interactivity (hover, focus, active)
6. Media queries (responsive classes)

```tsx
<div className="
  absolute top-0 left-0 w-full h-12
  px-4 py-2
  text-sm font-medium
  bg-primary text-white rounded-md shadow-sm
  hover:bg-primary/90 focus:outline-none focus:ring-2
  md:relative md:w-auto
">
  Button
</div>
```

### Theme Toggle Best Practices

- Remember user preferences with localStorage
- Respect system preferences by default
- Provide visual feedback when changing themes
- Ensure all components support both themes
- Test color contrast in both modes
