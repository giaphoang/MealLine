# PrintFooter Component Technical Documentation

> **Legacy print-system note:** This component belongs to the older print path.
> The active Shopping List Builder roadmap includes 2×2, 2×3, and 2×4 grids for
> v1.7.0. `grid-2x2` is not added to the legacy prop type below by documentation
> alone; the new Builder must define its own footer/cut behavior when that layout
> is implemented.

## Component Overview

The `PrintFooter` component is a unified footer solution for the shopping list print system that ensures consistent footer rendering across different layout types and media (screen vs print).

## Component API

### Props Interface

```typescript
interface PrintFooterProps {
  layoutType: 'full-page' | 'split-page' | 'grid-2x3' | 'grid-2x4';
  pageNumber?: number;        // For standard layouts
  totalPages?: number;         // For standard layouts
  physicalPageNumber?: number; // For split-page layouts
  totalPhysicalPages?: number; // For split-page layouts
  className?: string;          // Additional CSS classes
}
```

### Usage Examples

#### Standard Page Layout
```tsx
<PrintFooter
  layoutType="full-page"
  pageNumber={1}
  totalPages={5}
/>
```

#### Split-Page Layout
```tsx
<PrintFooter
  layoutType="split-page"
  physicalPageNumber={1}
  totalPhysicalPages={3}
/>
```

#### Grid Layouts (No Footer)
```tsx
<PrintFooter layoutType="grid-2x3" />
// Returns null - grid layouts don't display footers
```

## Implementation Details

### Layout Type Behaviors

1. **Grid Layouts (`grid-2x3`, `grid-2x4`)**
   - Returns `null` immediately
   - No footer rendered as pages are cut into identical pieces

2. **Split-Page Layout**
   - Uses `physicalPageNumber` and `totalPhysicalPages` props
   - Renders with `printFooterSplit` CSS class
   - Spans both columns using `grid-column: span 2`
   - Designed for vertical paper cutting

3. **Standard Layout (`full-page`)**
   - Uses `pageNumber` and `totalPages` props
   - Renders with `printFooterStandard` CSS class
   - Uses flexbox positioning with `margin-top: auto`

### CSS Module Architecture

The component uses CSS Modules (`PrintFooter.module.css`) for style encapsulation:

```css
.printFooterStandard {
  composes: printFooter;
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid #d1d5db;
  font-size: 11px;
  color: #6b7280;
}

.printFooterSplit {
  composes: printFooter;
  grid-column: span 2;
  /* Similar styling */
}
```

### Helper Function: `printFooterContainerStyles`

Provides container styling based on layout type:

```typescript
export const printFooterContainerStyles = (layoutType: string): string
```

Returns appropriate container classes:
- **split-page**: Grid container with column layout
- **grid layouts**: Empty string (no special container needed)
- **full-page**: Flexbox container for standard layouts

## Integration Guide

### 1. Import the Component

```tsx
import { PrintFooter, printFooterContainerStyles } from '@/components/shopping-lists/print-view/components';
```

### 2. Apply Container Styles

```tsx
<div className={printFooterContainerStyles(layoutType)}>
  {/* Page content */}
  <PrintFooter layoutType={layoutType} {...otherProps} />
</div>
```

### 3. Pass Appropriate Props

For standard layouts:
```tsx
<PrintFooter
  layoutType="full-page"
  pageNumber={currentPage}
  totalPages={totalPageCount}
/>
```

For split layouts:
```tsx
<PrintFooter
  layoutType="split-page"
  physicalPageNumber={physicalPageIndex + 1}
  totalPhysicalPages={Math.ceil(pages.length / 2)}
/>
```

## Print Media Handling

### Viewport Styles
- Clean, modern appearance
- Subtle borders and typography
- Proper spacing for visual hierarchy

### Print Styles
- Forced positioning with `!important` flags
- Exact measurements (0.25in padding)
- Color adjustments for print output
- Page break prevention

## Testing Considerations

### Unit Tests
```typescript
describe('PrintFooter', () => {
  it('should render null for grid layouts', () => {
    const { container } = render(
      <PrintFooter layoutType="grid-2x3" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render footer for standard layout', () => {
    const { getByText } = render(
      <PrintFooter 
        layoutType="full-page" 
        pageNumber={1} 
        totalPages={3} 
      />
    );
    expect(getByText('Page 1 of 3')).toBeInTheDocument();
  });
});
```

### Visual Regression Tests
- Capture footer appearance in different layouts
- Verify consistent positioning
- Check print preview rendering

### Print Tests
- Manual verification of actual print output
- Check footer positioning on physical paper
- Verify cutting alignment for split layouts

## Common Issues and Solutions

### Issue: Footer Floating Mid-Page
**Solution**: 
1. Ensure parent container uses proper flex/grid layout from `printFooterContainerStyles`
2. Verify CSS Module classes are applied (`styles.printPage`, `styles.fullPage`, etc.)
3. Check that print-specific CSS rules are being applied

### Issue: Footer Cut Off in Print
**Solution**: 
1. Check that page height calculations account for footer space
2. Ensure `min-height` and `max-height` are set for print pages
3. Verify `flex-shrink: 0` is applied to footer

### Issue: Inconsistent Footer Styling
**Solution**: 
1. Verify CSS Module is properly imported and classes are applied
2. Check print media queries are properly defined
3. Ensure footer component receives correct props

### Issue: Footer Position Varies Between Pages in PDF
**Solution**:
1. Apply explicit height constraints to page container (`height: 11in`, `min-height: 11in`, `max-height: 11in`)
2. Use CSS Module classes for consistent flexbox behavior
3. Set `flex: 1 1 auto` on content area with `min-height: 0`
4. Apply `flex-shrink: 0` to footer to prevent compression
5. Ensure print media queries override screen styles properly

## Performance Considerations

- Component is lightweight with minimal re-renders
- CSS Modules ensure style isolation
- No heavy computations or side effects
- Proper memoization not needed due to simple props

## Migration Guide

### From Inline Footer Implementation

Before:
```tsx
<div style={{
  gridColumn: 'span 2',
  marginTop: 'auto',
  paddingTop: '0.25in',
  borderTop: '1px solid #d1d5db'
}}>
  <span>Footer content</span>
</div>
```

After:
```tsx
<PrintFooter
  layoutType="split-page"
  physicalPageNumber={1}
  totalPhysicalPages={2}
/>
```

### Benefits of Migration
1. Consistent styling across all footers
2. Centralized print media queries
3. Easier maintenance and updates
4. Type safety with TypeScript props
5. Automatic layout-specific behavior

## Future Enhancements

### Planned Features
1. **Customizable Content**: Allow custom footer text
2. **Multiple Styles**: Different footer designs
3. **Dynamic Height**: Adjust based on content
4. **Internationalization**: Multi-language support

### Extension Points
- `footerContent` prop for custom content
- `variant` prop for different styles
- `height` prop for custom sizing
- `locale` prop for translations
