# Table State Preservation

Updated: April 29, 2026

## Purpose

Shared FEED tables should let staff work through paged and filtered rows without losing their place after a row-level action refreshes backend data.

## Current Behavior

`EnhancedDataTable` and `DataList` preserve the current page by default when their `data` array is replaced after an action. The shared `useTableFeatures` hook disables TanStack Table's automatic page reset for these refreshed data sets and clamps the page index back to the last valid page when rows are removed and the current page no longer exists.

This applies to the current shared table pages:

- Food Items
- Categories
- Translation Management
- Shopping Lists
- Document Translator
- AI Configuration

Callers can still pass `preservePageOnDataChange={false}` when a table needs the older reset-to-first-page behavior.

## Implementation Notes

- `packages/frontend/src/components/ui/enhanced-data-table/index.tsx` owns the shared default.
- `packages/frontend/src/components/shared/data-list/DataList.tsx` passes the behavior through to the table.
- `packages/frontend/src/components/ui/enhanced-data-table/hooks/useTableFeatures.ts` owns TanStack Table setup and invalid-page clamping.
- Legacy direct table wrappers that call `useTableFeatures` should set `autoResetPageIndex: false` when they need the same behavior.

## Validation

- `npm test -- enhanced-data-table-pagination.test.tsx --run`
- `npm test -- --run`
- `npm run build`
