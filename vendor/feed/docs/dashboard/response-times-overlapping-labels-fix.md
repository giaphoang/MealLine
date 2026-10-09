# Response Times Chart: Removed Overlapping Language Labels

Date: 2025-08-30

## Summary
- Fixed overlapping labels in the Dashboard card "Response Times — Average by language".
- Removed the in-bar language `LabelList` so languages are shown only once on the Y axis.

## Context
In the Translation Metrics dashboard, the vertical bar chart rendered the language name twice:
- As Y-axis tick labels (left of the chart)
- As an in-bar `LabelList` positioned inside the bars

This caused visual overlap and reduced readability.

## Change Details
- File: `packages/frontend/src/components/dashboard/translation-metrics.tsx`
- Component: Response Times bar chart within `TranslationMetrics`
- Update: Removed the in-bar `LabelList` that displayed `language` with `position="insideLeft"`.
- Kept the numeric time `LabelList` on the right side of bars for clarity.

## Before
- Language labels appeared both on the Y axis and inside each bar.

## After
- Language labels appear only on the Y axis.
- Bars retain right-side numeric time labels (e.g., `0.2s`).

## Rationale
- Avoid duplicated labels to reduce clutter and ensure consistent readability across varied data sets.
- Keeps chart semantics intact with categorical labels on the axis and values adjacent to bars.

## Testing Notes
- Verified with multiple language counts: scrolling works for longer lists, labels remain readable.
- Confirmed that responsive layout and existing margins (`YAxis.width=100`) provide sufficient space for axis labels without in-bar text.

