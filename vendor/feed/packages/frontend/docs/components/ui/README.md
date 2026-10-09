# UI Components

This documentation covers the Shadcn UI components used in the FEED application.

## Table of Contents

- [Overview](#overview)
- [Component List](#component-list)
- [Usage Guidelines](#usage-guidelines)
- [Customization](#customization)

## Overview

FEED uses [Shadcn UI](https://ui.shadcn.com/) for its component library. These components are built on [Radix UI](https://www.radix-ui.com/) primitives and styled with Tailwind CSS.

Key benefits:
- Accessible by default
- Fully customizable
- Type-safe with TypeScript
- Consistent theming across light and dark modes

## Component List

### Layout Components

| Component | Description | Usage |
|-----------|-------------|-------|
| `Card` | Container with border and shadow | Grouping related content |
| `ScrollArea` | Scrollable container with custom scrollbars | When content might overflow |
| `Separator` | Horizontal or vertical divider | Separating content sections |
| `Sheet` | Slide-in panel | Side panels and mobile navigation |

### Form Components

| Component | Description | Usage |
|-----------|-------------|-------|
| `Button` | Interactive button element | User actions |
| `Checkbox` | Selectable checkbox input | Boolean selections |
| `Form` | Form wrapper with validation | Data entry forms |
| `Input` | Text input field | Short text entry |
| `Label` | Form field label | Labeling inputs |
| `Select` | Dropdown selection | Choosing from a list |
| `Switch` | Toggle switch | Boolean settings |
| `Textarea` | Multi-line text input | Longer text entry |

### Feedback Components

| Component | Description | Usage |
|-----------|-------------|-------|
| `Alert` | Colored alert box | Important messages |
| `Progress` | Progress indicator | Showing completion status |
| `Skeleton` | Loading placeholder | Content loading states |
| `Toast` | Brief notification | Temporary feedback |

### Interactive Components

| Component | Description | Usage |
|-----------|-------------|-------|
| `AlertDialog` | Modal confirmation dialog | Destructive actions |
| `Dialog` | Modal window | Focused interactions |
| `DropdownMenu` | Contextual menu | Multiple related actions |
| `Popover` | Floating content | Rich tooltips and menus |
| `Tabs` | Tabbed interface | Organizing related content |
| `Tooltip` | Floating label | Additional information |

### Data Components

| Component | Description | Usage |
|-----------|-------------|-------|
| `Table` | Data table | Structured data display |
| `Badge` | Small status indicator | Showing item state |
| `Avatar` | User or item image | Visual identification |

## Usage Guidelines

### Importing Components

Components are imported from the `@/components/ui` path:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
```

### Basic Example

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  return (
    <form>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" placeholder="Enter username" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="Enter password" />
        </div>
        <Button type="submit">Login</Button>
      </div>
    </form>
  );
}
```

### Button Variants

```tsx
<Button>Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>
<Button variant="destructive">Destructive</Button>
```

### Loading State

```tsx
<Button disabled>Disabled</Button>
<Button disabled className="opacity-50 cursor-not-allowed">
  <span className="mr-2">
    <Spinner size="sm" />
  </span>
  Loading
</Button>
```

## Customization

### Modifying Components

The UI components can be customized by modifying their source files in `src/components/ui`.

Example (`button.tsx`):
```tsx
import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors...",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // Add custom variants here
        custom: "bg-purple-500 text-white hover:bg-purple-600",
      },
      // ...other variants
    },
  }
);
```

### Adding New Components

When adding new UI components:

1. Install the component from Shadcn UI:
```bash
npx shadcn-ui add [component-name]
```

2. Customize as needed for the application design system

3. Document the component usage in this guide