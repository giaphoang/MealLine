# Category Chart: Ensured Right-Side Value Labels Remain Visible

Date: 2025-09-01

## Summary
- Fixed clipping of the numeric value labels on the "Categories — Distribution by category" bar chart by adding adaptive X-axis domain padding.
- The chart now automatically scales to include headroom, so the longest bar does not push the right-side labels outside the plotting area.

## Context
The Category Chart uses a vertical `BarChart` with labels shown to the right of each bar via `LabelList position="right"`.
Previously, the chart had a small right margin and no explicit X-axis `domain`, allowing the longest bar to reach the chart boundary. This caused the value label for the longest bar to render outside the chart area and become invisible.

## Change Details
- File: `packages/frontend/src/components/dashboard/category-chart.tsx`
- Component: `CategoryChart`
- Update:
  - Compute `maxItems` from the dataset
  - Set an adaptive `XAxis` `domain` to add headroom while keeping the axis hidden:
    - `maxItems === 0` → `[0, 1]`
    - `maxItems < 5` → `[0, 5]`
    - Otherwise → `[0, Math.ceil(maxItems * 1.1)]`

## Before
- The longest bar could reach the right boundary.
- The numeric value label for that bar was clipped and not visible.

## After
- The X-axis includes a buffer beyond the maximum data value.
- All right-side numeric labels remain inside the chart area and visible.

## Rationale
- Aligns with established patterns (e.g., `translation-metrics.tsx`) where charts adapt their domain based on data.
- Minimal UI change; maintains label placement pattern and Shadcn/Recharts conventions.

## Testing Notes
- Verified with small and large values (including zeros) that labels remain visible.
- Axis remains hidden; visual layout is unchanged except for the added headroom.

