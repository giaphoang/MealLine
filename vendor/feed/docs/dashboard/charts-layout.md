# Dashboard Layout and Charts

## Overview
The dashboard provides a comprehensive overview of the food pantry system using Shadcn UI components and Recharts for data visualization. All charts are integrated with backend data sources through custom hooks and provide loading states with skeleton UI and error handling with fallbacks.

## Layout Structure

```
Dashboard/
├── Stats Cards (Row)
│   ├── Total Categories
│   ├── Food Items
│   ├── Languages
│   └── Translations
├── Distribution Charts (Grid)
│   ├── Inventory Distribution (1 column mobile, 1/2 desktop)
│   └── Category Chart (1 column mobile, 1/2 desktop)
├── Usage Analytics (Grid)
│   ├── Cost Forecast (1 column mobile, 1/2 desktop)
│   └── Usage Summary (1 column mobile, 1/2 desktop)
└── Translation Performance (Full Width)
    ├── Success Rate Metrics
    └── Response Time Analysis
```

## Components

### 1. Stats Cards
- Responsive grid layout (1 column mobile, 4 columns desktop)
- Each card contains:
  - Icon indicator
  - Current value
  - Description
  - Trend indicator (if applicable)
- Icons match sidebar navigation:
  - Categories: Shapes icon
  - Food Items: Apple icon
  - Languages: Languages icon
  - Translations: Sparkles icon

### 2. Inventory Distribution Chart
- Donut chart showing distribution by status
- Center shows total item count
- Color-coded segments:
  - In Stock
  - Limited Supply
  - Clearance
- Interactive tooltips with item counts
- Trend indicator in footer

### 3. Category Chart
- Horizontal bar chart
- Shows items per category
- Interactive tooltips with counts
- Labels integrated into bars
- Request counts in parentheses
- Ascending/descending sort option

### 4. Translation Metrics
#### Success Rate Gauge
- Radial gauge showing success percentage
- Color indicates performance level
- Center shows exact percentage
- Trend indicator in footer

### 5. Translation Performance Chart
- Interactive bar chart with metric selection
- Switchable views:
  - Response Time with millisecond precision
  - Cost with microcost precision
- Features:
  - Selectable metrics with totals display
  - Proper Y-axis scaling for each metric
  - Detailed tooltips with units
  - Consistent color scheme with theme
  - Mobile-responsive design

## Theme Integration
Charts use the application's theme system for consistent styling:

```css
:root {
  /* Primary theme colors */
  --background: 194 100% 95%;
  --foreground: 194 5% 0%;
  --primary: 194 50.7% 44.5%;
  
  /* Chart-specific colors */
  --chart-primary: var(--primary);
  --chart-success: 142 71% 45%;
  --chart-warning: 38 92% 50%;
  --chart-danger: 0 84% 60%;
  --chart-info: var(--primary);
  --chart-muted: var(--muted);
}
```

Dark mode support is automatically handled through the theme system:
```css
.dark {
  --background: 194 50% 5%;
  --foreground: 194 5% 90%;
  --primary: 194 50.7% 44.5%;
  
  /* Chart colors adapt automatically */
  --chart-success: 142 71% 50%;
  --chart-warning: 38 92% 55%;
  --chart-danger: 0 84% 65%;
}
```

Charts use these variables through Tailwind's theme system:

## Responsiveness
- Consistent grid system across all sections:
  - 1 column on mobile (full width)
  - 2 columns on desktop (equal width split)
- Charts use flex-based responsive containers
- Consistent spacing using gap-4 between elements
- Uniform padding with container classes
- Loading states with skeleton placeholders
- Touch-friendly interaction areas
- Font sizes adjust for readability
- Charts maintain aspect ratio

## Recent Updates

### Cost Forecast Y-Axis Label Fix (September 2025)
- **FIXED**: Cost Forecast chart y-axis labels no longer cut off when displaying very small monetary values
- Replaced local `formatCurrency()` function with established `formatServiceCost()` utility from service-utils.ts
- Small values now display as "< $0.001" instead of "$0.000000" preventing layout overflow
- Added left margin (20px) to AreaChart to accommodate the "< $0.001" text format
- Maintains consistency with other cost displays throughout the application
- Follows established project pattern of centralized utility functions for formatting

## Previous Updates

### Translation Performance Time Range Filtering (July 2025)
- **COMPLETED**: Implemented backend time range query parameters for Translation Performance card
- Fixed time range filtering to work with backend data instead of frontend-only filtering
- Added `timeRange` parameter to `/api/projections/multi-service-metrics` endpoint
- Updated UsageRecordService calls to use time-range-aware historical data
- Enhanced frontend service to pass timeRange parameters to backend
- All time range options now function correctly: Today (1d), This Week (7d), This Month (30d), This Year (365d)
- Data consistency between Period dropdown selection and chart display

### Service Layer Refactoring (January 2025)
- **COMPLETED**: Systematic removal of mock data dependencies
- Fixed Cost Forecast chart tooltip ordering (upper → projected → lower)
- Eliminated fallback calculations in ProjectionsService
- Removed unused mock functions from useProjections hook
- Moved utilities to dedicated service-utils.ts file
- Removed multi-service-mock-data.ts mock generators
- All components now consume authentic backend data exclusively

### Service-Specific Performance Metrics (January 2025)
- **COMPLETED**: Fixed dashboard performance consistency issue
- Cost Comparison component now uses real backend data instead of mock calculations
- Eliminates discrepancy between Usage Summary (real: Google 977ms, OpenAI 2.8s, Anthropic 4.8s) and Cost Comparison (mock: Google 650ms, OpenAI 850ms, Anthropic 1200ms)
- Backend provides service-specific performance data via `performanceByService` field
- Frontend components prioritize service-specific metrics over aggregated data
- Backward compatibility maintained with fallback to mock data when real data unavailable

## Future Enhancements
- Date range selection for metrics
- Export capabilities for charts
- Additional performance metrics
- Custom alert thresholds
- Real-time updates
