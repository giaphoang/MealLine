# Color System Documentation

## Overview
The FEED application uses a semantic color system based on Tailwind CSS and CSS custom properties. This system ensures consistent theming across light and dark modes while maintaining accessibility and visual hierarchy.

## Color Tokens

### Base Colors
These are the fundamental semantic color tokens used throughout the application:

```css
--background: Base background color
--foreground: Primary text color
--card: Card and elevated surface color
--card-foreground: Text color for cards
--popover: Popover and modal background
--popover-foreground: Text color for popovers
--primary: Primary brand color
--primary-foreground: Text color on primary backgrounds
--secondary: Secondary/supporting color
--secondary-foreground: Text color on secondary backgrounds
--muted: Muted/subtle background
--muted-foreground: Text color for muted elements
--accent: Accent/highlight color
--accent-foreground: Text color on accent backgrounds
--destructive: Error/warning color
--destructive-foreground: Text color on destructive backgrounds
--border: Border color
--input: Input field borders
--ring: Focus ring color
```

### Status Flag Colors
Colors for status indicators and badges:
```css
/* Light Mode */
--status-success-bg: Success background color
--status-success-border: Success border color
--status-success-text: Success text color
--status-warning-bg: Warning background color
--status-warning-border: Warning border color
--status-warning-text: Warning text color
--status-danger-bg: Danger/error background color
--status-danger-border: Danger/error border color
--status-danger-text: Danger/error text color
--status-neutral-bg: Neutral/disabled background color
--status-neutral-border: Neutral/disabled border color
--status-neutral-text: Neutral/disabled text color

/* Dark Mode variants provide appropriate contrast */
```

### Chart Colors
Specific colors for data visualization:
```css
--chart-primary: Primary chart elements
--chart-success: Positive trends
--chart-warning: Warning indicators
--chart-danger: Negative trends
--chart-info: Informational elements
--chart-muted: Background elements
```

## Usage Guidelines

### 1. Semantic Color Classes
Always use semantic color classes instead of direct color values:

✅ Correct:
```tsx
<div className="bg-background text-foreground">
<div className="text-muted-foreground">
<div className="border-border">
```

❌ Incorrect:
```tsx
<div className="bg-white text-gray-900">
<div className="text-gray-500">
<div className="border-gray-200">
```

### 2. Component Hierarchy
Follow this hierarchy for component styling:

1. Container/Layout
```tsx
<div className="bg-background">
  <main className="text-foreground">
```

2. Cards/Elevated Surfaces
```tsx
<Card className="bg-card">
  <CardHeader className="text-card-foreground">
```

3. Interactive Elements
```tsx
<Button className="bg-primary text-primary-foreground hover:bg-primary/90">
```

4. Supporting Elements
```tsx
<div className="text-muted-foreground">
<div className="bg-accent">
```

### 3. Status Indicators
Use semantic status classes with proper background, border, and text colors:

```tsx
// Success/In Stock Status
<span className="bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-text)] border rounded-full px-2 py-1">
  In Stock
</span>

// Warning/Limited Status
<span className="bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning-text)] border rounded-full px-2 py-1">
  Limited
</span>

// Danger/Clearance Status
<span className="bg-[var(--status-danger-bg)] border-[var(--status-danger-border)] text-[var(--status-danger-text)] border rounded-full px-2 py-1">
  Clearance
</span>

// Neutral/Out of Stock Status
<span className="bg-[var(--status-neutral-bg)] border-[var(--status-neutral-border)] text-[var(--status-neutral-text)] border rounded-full px-2 py-1">
  Out of Stock
</span>
```

### 4. Charts and Data Visualization
Use chart-specific colors for consistency:

```tsx
<LineChart
  stroke="var(--chart-primary)"
  fill="var(--chart-muted)"
/>
```

## Theme Integration

### Component Requirements
All components must:
1. Use semantic color tokens
2. Support both light and dark modes
3. Maintain WCAG 2.1 AA contrast ratios
4. Use hover/focus states consistently

### Testing Checklist
- [ ] Component renders correctly in light mode
- [ ] Component renders correctly in dark mode
- [ ] All interactive states are themed
- [ ] Color contrast meets accessibility standards
- [ ] Transitions are smooth between modes
- [ ] No hard-coded color values

## Implementation Notes

### shadcn/ui Components
These components are pre-configured for theming and should be used whenever possible:
- Card, CardHeader, CardContent
- Button
- Input, Select
- Dialog
- DropdownMenu

### Custom Components
When creating custom components:
1. Extend shadcn/ui where possible
2. Use semantic class names
3. Implement proper dark mode support
4. Test all interactive states

### Theme Provider
All components must be wrapped in the ThemeProvider:
```tsx
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
>
  <App />
</ThemeProvider>
```

## Migration Strategy
When updating existing components:
1. Audit current color usage
2. Replace direct color values with semantic tokens
3. Test in both light and dark modes
4. Verify accessibility
5. Document any custom implementations
