# Dashboard Translation Success Card – Data Source and Semantics

Last updated: 2025-08-30

## Summary

The "Translation Success" gauge on the Dashboard reflects the current state of the Translation table, not historical usage. It shows the percentage of translations with status `completed` out of all translations, aligning with what users see in the Translation Management UI.

To preserve performance and cost insights, the endpoint continues to read timing and cost metrics from `UsageRecord`.

## Endpoint

`GET /api/projections/translation-metrics`

## Data Sourcing (Hybrid)

- Success and Total: Translation table
  - Total = `COUNT(*) FROM Translation [timeRange filter]`
  - Completed = `COUNT(*) FROM Translation WHERE status = 'completed' [timeRange]`
  - Success Rate = `completed / total`, rounded to 1 decimal

- Performance and Cost: UsageRecord
  - Average response time (ms) = `_avg(duration)`
  - Total cost (USD) = `_sum(totalCost)`
  - Language breakdown, provider breakdown, and trends remain driven by `UsageRecord`

## Rationale

- Users expect the gauge to match the real-time status they see in Translation Management (pending/failed/completed).
- `UsageRecord` is ideal for telemetry (timing/cost), but it can miss failed/pending translation states and therefore overstate success when used directly for success rate.
- The hybrid approach balances correctness (current state) with rich performance analytics.

## Frontend

- Dashboard component: `packages/frontend/src/components/dashboard/translation-metrics.tsx`
- Hook: `packages/frontend/src/hooks/dashboard/useTranslationMetricsData.ts`
- The hook keeps using `/api/projections/translation-metrics` and maps `data.successRate` to the gauge, and displays `statusCounts` for Pending and Failed.

## Status Breakdown

The projections endpoint now includes:

```
statusCounts: {
  completed: number,
  pending: number,
  failed: number
}
```

The gauge shows three wedges stacked to 100%:

- Success (Completed %): green `--chart-success`
- Pending (%): orange `--chart-warning`
- Failed (%): red `--chart-danger`

The footer displays exact counts for completed, pending, and failed. All colors are referenced from centralized CSS variables; no hardcoded colors.

## Notes

- This change is consistent with the existing `OverviewAggregator` which already derives translation success from the `Translation` table.
- Time range behavior: translations use `createdAt`; usage records use `timestamp`.
