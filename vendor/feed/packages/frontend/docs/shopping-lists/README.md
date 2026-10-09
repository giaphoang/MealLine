# Shopping Lists Print System Documentation

> **Legacy print-system note:** This document describes the older `PrintView`
> path. The active Shopping List Builder roadmap will add 2×2, 2×3, and 2×4
> grids in v1.7.0. The legacy implementation documented below has only 2×3 and
> 2×4; do not treat that omission as the active Builder contract.

## Overview

The shopping lists print system provides a comprehensive solution for generating and printing shopping lists with multiple layout options. The system ensures consistent rendering between viewport preview and actual printed output.

## Architecture

### Core Components

#### PrintView (`/src/components/shopping-lists/print-view/PrintView.tsx`)
The main component that handles shopping list rendering for print. It:
- Fetches shopping list instance data
- Handles pagination based on layout type
- Manages different layout rendering strategies
- Ensures proper theme forcing for print consistency

#### PrintPage (`/src/components/shopping-lists/print-view/components/PrintPage.tsx`)
Container component representing a single physical page with:
- Dynamic dimensions based on layout type
- Proper page break control
- Integration with unified footer system
- WYSIWYP (What You See Is What You Print) compliance

#### PrintFooter (`/src/components/shopping-lists/print-view/components/PrintFooter.tsx`)
Unified footer component that handles all footer rendering needs:
- Layout-specific footer behaviors
- Consistent styling across viewport and print
- Proper positioning for each layout type

## Layout Types

### 1. Full Page Layout (`full-page`)
- **Dimensions**: 8.5" x 11" 
- **Padding**: 0.5"
- **Footer**: Standard footer at bottom of each page
- **Use Case**: Traditional shopping lists

### 2. Split Page Layout (`split-page`)
- **Dimensions**: Two 4.25" x 11" columns
- **Padding**: 0.375" per column
- **Footer**: Spans both columns for vertical cutting
- **Use Case**: Lists that need to be cut in half vertically

### 3. Grid Layouts (`grid-2x3`, `grid-2x4`)
- **Grid 2x3**: 6 mini-lists per page (2 columns x 3 rows)
- **Grid 2x4**: 8 mini-lists per page (2 columns x 4 rows)
- **Footer**: None (pages cut into identical pieces)
- **Use Case**: Multiple identical shopping lists

## Footer Implementation

### Design Principles

The footer system follows these key principles:

1. **Layout-Specific Behavior**: Each layout type has unique footer requirements
2. **Consistent Rendering**: Footer appears identically in viewport and print
3. **Proper Positioning**: Uses flexbox/grid for reliable positioning
4. **Print Optimization**: Specific print media queries ensure proper output

### Footer Behavior by Layout

#### Standard Layouts (full-page)
```tsx
<PrintFooter
  layoutType="full-page"
  pageNumber={1}
  totalPages={3}
/>
```
- Positioned at page bottom using flexbox
- Shows page numbers and system branding
- Maintains consistent spacing from content

#### Split-Page Layouts
```tsx
<PrintFooter
  layoutType="split-page"
  physicalPageNumber={1}
  totalPhysicalPages={2}
/>
```
- Spans both columns using CSS Grid
- Appears once per physical page
- Designed for vertical paper cutting
- Uses physical page numbers (not column numbers)

#### Grid Layouts
```tsx
// No footer rendered for grid layouts
<PrintFooter layoutType="grid-2x3" /> // Returns null
```
- No footer displayed
- Each grid cell is identical
- Designed for cutting into multiple pieces

### CSS Architecture

The footer system uses CSS Modules for encapsulation:

```css
/* PrintFooter.module.css */
.printFooterStandard {
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid #d1d5db;
  font-size: 11px;
  color: #6b7280;
}

.printFooterSplit {
  grid-column: span 2;
  /* Similar styling to standard */
}
```

Print-specific overrides ensure consistency:
```css
@media print {
  .printFooterStandard,
  .printFooterSplit {
    margin-top: auto !important;
    padding-top: 0.25in !important;
    /* Ensures exact print positioning */
  }
}
```

## Container Helpers

The `printFooterContainerStyles` function provides proper container styling:

```tsx
// For standard layouts - uses flexbox
const containerClass = printFooterContainerStyles('full-page');
// Returns: 'pageContainerFlex'

// For split layouts - uses CSS Grid
const containerClass = printFooterContainerStyles('split-page');
// Returns: 'pageContainerGrid grid grid-cols-2 gap-[0.25in]'
```

## Print Media Considerations

### Page Setup
```css
@page {
  size: letter;
  margin: 0;
}
```

### Color Accuracy
```css
* {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  color-adjust: exact;
}
```

### Page Breaks
- Standard pages: `page-break-after: always`
- Last page: `page-break-after: auto`
- Sections: `page-break-inside: avoid`

## Testing Checklist

When testing footer behavior, verify:

1. **Viewport Preview**
   - [ ] Footer appears at bottom of content
   - [ ] Footer styling matches design
   - [ ] Page numbers are correct
   - [ ] Split-page footer spans both columns

2. **Print Output**
   - [ ] Footer position matches preview
   - [ ] No footer overlap with content
   - [ ] Correct footer on each page type
   - [ ] Grid layouts have no footers

3. **Edge Cases**
   - [ ] Long content doesn't push footer off page
   - [ ] Short content keeps footer at bottom
   - [ ] Multi-page lists maintain footer consistency
   - [ ] Split-page cutting lines align properly

## Troubleshooting

### Common Issues

#### Footer Not at Bottom
- Check container has proper height constraints
- Ensure flexbox/grid container styles are applied
- Verify `margin-top: auto` is set on footer

#### Footer Cut Off in Print
- Check page dimensions match paper size
- Verify padding accounts for footer space
- Ensure `usePageHeight` calculation includes footer

#### Inconsistent Footer Between Pages
- **Fixed in v0.11.96**: Removed phantom header/instructions height from page 1
- Ensure pagination starts with `currentHeight = 0` (no phantom space)
- Verify all pages use same footer component
- Check print media queries are applied
- Ensure page break rules don't conflict

## Future Enhancements

Potential improvements to consider:

1. **Custom Footer Content**: Allow user-defined footer text
2. **Footer Templates**: Multiple footer styles to choose from
3. **Dynamic Footer Height**: Adjust based on content
4. **Watermarks**: Add organizational watermarks
5. **QR Codes**: Include scannable codes for digital versions

## Related Documentation

- [Print View Components](./components.md)
- [Pagination System](./pagination.md) - **Updated with v0.11.96 fix**
- [Layout Types Guide](./layouts.md)
- [Print Styles Architecture](./print-styles.md)
