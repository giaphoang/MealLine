# Shopping Lists Pagination System Documentation

## Overview

The pagination system divides shopping list content across multiple printed pages while maintaining proper layout and avoiding content overflow. It uses intelligent height estimation and content distribution algorithms to ensure optimal page breaks.

## Core Components

### Height Estimation System

The pagination algorithm uses pixel-based height estimates (96 DPI) for different section types:

- **Category sections**: Header (60px) + items (30px each) + optional empty rows
- **Form sections**: Header (60px) + fields (60-120px based on type)
- **Custom text sections**: Header (60px) + base (40px) + text lines (24px each)
- **Section spacing**: 16px between sections
- **Footer allowance**: 60px reserved for page footer

### Page Content Distribution

#### Standard Layout (full-page)

The `paginateSections()` function distributes content across 8.5" x 11" pages:

1. **Initialization**: Starts with `currentHeight = 0` (no phantom space)
2. **Section addition**: Adds sections while tracking cumulative height
3. **Page breaks**: Creates new page when content + footer exceeds max height
4. **Content grouping**: Keeps related sections together (e.g., titles with following content)
5. **Orphan prevention**: Avoids single sections on pages when possible

#### Split-Page Layout

The `paginateSectionsForSplitPage()` function handles narrow column layouts:

1. **No header/footer space**: Columns start at height 0
2. **Compact estimates**: Uses reduced heights for narrow column width
3. **Flexible grouping**: Less conservative about keeping sections together
4. **Column balancing**: Optimizes content distribution between columns

## Key Algorithm Features

### Keep-Together Rules

Sections that should stay with the next section:

- Title sections (first custom-text) with following content
- Instruction text with following forms or categories
- Small form sections (1-2 fields) with next section
- Small category sections (1-2 items) when space permits

### Page Break Intelligence

The algorithm considers several factors:

```javascript
// Check if section fits on current page
if (currentHeight + sectionHeight + footerHeight > maxHeightPerPage) {
  // Create page break
}

// Orphan prevention
if (currentPage.length === 1 && canFitWithSqueeze) {
  // Keep section on current page to avoid orphaning
}
```

### Height Calculation Fix (v0.11.96)

**Previous Issue**: Page 1 initialized with phantom header/instructions height:
```javascript
// OLD - Added 200px phantom space
let currentHeight = SECTION_HEIGHT_ESTIMATES.header + SECTION_HEIGHT_ESTIMATES.instructions;
```

**Current Implementation**: Page 1 starts with actual content only:
```javascript
// NEW - No phantom space
let currentHeight = 0;
```

This ensures consistent footer positioning across all pages by allowing equal content distribution.

## Optimization Strategies

### Content Balancing

The `optimizePageDistribution()` function refines page layouts:

1. **Single-section pages**: Moves orphaned sections to adjacent pages
2. **Sparse last pages**: Redistributes content from previous pages
3. **Height balancing**: Ensures pages use 25-75% of available space
4. **Preserve groupings**: Respects keep-together rules during optimization

### Split-Page Specific Optimization

The `optimizeSplitPageDistribution()` function:

- Less aggressive about moving content (15% threshold vs 25%)
- Maintains column balance for cutting alignment
- Preserves narrow column readability

## Usage Example

```javascript
import { paginateSections, optimizePageDistribution } from './utils/pagination';

// Standard layout pagination
const pages = useMemo(() => {
  if (!sections) return [];
  
  const enabledSections = sections.filter(s => s.isEnabled);
  
  // Paginate sections
  const paginatedPages = paginateSections(enabledSections, maxHeight);
  
  // Optimize distribution
  return optimizePageDistribution(paginatedPages, maxHeight);
}, [sections, maxHeight]);
```

## Configuration

### Maximum Height Calculation

Based on layout type and paper dimensions:

- **Full page**: 9.5 inches (11" - 1" margins - 0.5" footer)
- **Split page**: 9.5 inches (same height, narrower width)
- **Grid layouts**: Proportionally smaller based on grid cells

### Height Tolerance

The algorithm allows small overflow tolerances:

- **Standard layouts**: 50px overflow tolerance for orphan prevention
- **Split-page layouts**: 30px overflow tolerance (narrower columns)

## Debugging

### Common Issues and Solutions

1. **Footer positioning inconsistency**
   - Check: Initial currentHeight value (should be 0)
   - Verify: No phantom space added to first page

2. **Content overflow**
   - Check: Section height estimates match actual rendering
   - Verify: Footer height properly reserved

3. **Poor page breaks**
   - Review: Keep-together rules
   - Adjust: Overflow tolerance values

### Debug Logging

Enable debug output to trace pagination decisions:

```javascript
console.log('[Pagination] Page', pageNumber, 'height:', currentHeight);
console.log('[Pagination] Section', section.title, 'height:', sectionHeight);
```

## Future Enhancements

Potential improvements to consider:

1. **Dynamic height calculation**: Measure actual DOM elements
2. **User-configurable breaks**: Allow manual page break hints
3. **Widow control**: Prevent single lines at page top
4. **Smart table splitting**: Break long tables across pages
5. **Performance optimization**: Cache height calculations

## Related Documentation

- [Print Footer System](./print-footer.md)
- [Print View Components](./README.md)
- [Shopping List Architecture](../README.md)
