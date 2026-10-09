# Table Text Truncation Implementation

## Objective

Prevent word wrapping in table cells to maintain consistent row heights across screen sizes.

## Technical Approach

Column width enforcement through TanStack Table metadata and inline CSS styles.

## Implementation

### Core Utility

`/packages/frontend/src/lib/table/column-width-utils.ts`

- `calculateColumnWidths()`: Converts size values to percentage/pixel widths
- `extractColumnSizes()`: Extracts size configurations from column definitions
- `getColumnWidthStyle()`: Generates CSS style objects
- `getTruncationClasses()`: Returns truncation CSS classes

### Fixed Column Specifications

- Selection checkbox: 32px
- Actions menu: 75px
- All others: Percentage-based on size ratios

### Width Calculation Algorithm

```
Total flexible size = Sum of all non-fixed column sizes
Column percentage = (column size / total flexible size) × 100%
```

### Column Meta Integration

Each column definition receives calculated width via `meta.style`:

```typescript
col.meta = { 
  style: { 
    width: calculatedWidth,
    minWidth: calculatedWidth,
    maxWidth: calculatedWidth
  }
}
```

### CSS Application

Table components apply widths via inline styles:
```typescript
<TableHead style={header.column.columnDef.meta?.style}>
<TableCell style={cell.column.columnDef.meta?.style}>
```

### Truncation CSS

```css
.table-fixed-layout {
  table-layout: fixed;
  width: 100%;
}

.table-fixed-layout td,
.table-fixed-layout th {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
```

## Applying It To A Nested Cell

`text-overflow: ellipsis` only applies to a block's own inline content. A cell
that renders its text inside nested elements — an icon beside a name with a
description under it — is still clipped by the `td`'s `overflow: hidden`, but
gets no ellipsis, so the text stops mid-word with nothing to say it continued.

Apply `getTruncationClasses()` to the element that actually holds the text, and
give it a `title` so the full value is reachable on hover:

```tsx
<div className="min-w-0 flex-1">
  <div className={cn(getTruncationClasses(), 'font-medium')} title={name}>{name}</div>
  <div className={cn(getTruncationClasses(), 'text-xs')} title={description}>{description}</div>
</div>
```

`ResponsiveTruncatedText` does the same and adds an expand button and dialog.
Prefer it for a cell whose full text a user needs to read often; prefer the
classes above for a secondary line, where a button on every row costs more than
it returns. `service-metrics/columns.tsx` is the worked example.

## Modified Components

- `/packages/frontend/src/components/ui/responsive-truncated-text.tsx`
- `/packages/frontend/src/components/category-management/data-table/columns.tsx`
- `/packages/frontend/src/components/food-item-management/data-table/columns.tsx`
- `/packages/frontend/src/components/translation-management/data-table/columns.tsx`
- `/packages/frontend/src/components/document-translator/data-table/columns.tsx`
- `/packages/frontend/src/components/ui/enhanced-data-table/index.tsx`
- `/packages/frontend/src/components/category-management/data-table/data-table.tsx`
- `/packages/frontend/src/index.css`
- `/packages/frontend/src/components/service-metrics/columns.tsx`

## Result

Single-row table heights maintained. Text truncated at column boundaries. Responsive behavior preserved through percentage-based flexible columns.