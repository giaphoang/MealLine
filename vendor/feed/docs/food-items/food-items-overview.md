# Food Item Management Overview

This overview covers the architecture and key functionality of the Food Item Management module. It focuses on the frontend component hierarchy, backend API, and how translations are handled when item names change.

## Purpose

Food Item Management lets administrators track individual inventory items, their limits, status flags, and dietary information. Items can be created, edited, deleted, and updated in bulk. Inventory distribution data feeds dashboard charts and status badges across the application.

## Frontend Architecture

Located in `packages/frontend/src/components/food-item-management/`, this feature mirrors the Category Management structure:

- **`index.tsx`** – Top‑level component that loads food items via context and coordinates dialogs.
- **`FoodItemList`** – Data table with toolbar and bulk actions.
- **Form dialogs** – `add-dialog.tsx`, `edit-dialog.tsx`, and `delete-dialog.tsx` manage CRUD operations. `bulk-category-dialog.tsx` handles multi‑item category changes.
- **Data table** – `data-table/` defines column configuration and action menus.
- **Filters** – `filters.ts` owns the category/status filtering helpers used by the inventory update toolbar.
- **Hooks** – `useFoodItemData` in `src/hooks/food-item` provides caching, optimistic updates, and bulk helpers.
- **Context** – `FoodItemContext` wraps components and exposes actions from the hook.
- **Service layer** – `src/services/food-item` validates inputs and wraps API requests.

### Bulk Operations

`FoodItemList` supports multi‑selection for status changes, category updates, and deletions. Handlers forward actions to the context, which in turn calls the service. Toast messages report success or failure. The action menu shows context‑aware options for single items, as described in `docs/food-items/action-menu-unification.md`.

### Inventory Update Filters

The Food Item Management table includes two Shadcn dropdown filters above the table for inventory update workflows:

- **All Categories** is the default category state. Staff can select one or more categories to narrow the table.
- **All Status** is the default status state. Staff can select one or more of Out of Stock, In Stock, Clearance, and Limited Supply.

Filtering is client-side against the already-loaded `FoodItemContext` data. Empty selection means all items for that dimension, so clearing a dropdown restores the full inventory view without another API call.

## Backend API

The Express router in `packages/backend/src/routes/food-items.ts` exposes REST endpoints:

- `GET /api/food-items` – List items.
- `GET /api/food-items/:id` – Retrieve one item.
- `POST /api/food-items` – Create an item.
- `PUT /api/food-items/:id` – Update an item. Supports `keepTranslations` to preserve existing translations.
- `PUT /api/food-items/bulk` – Update multiple items.
- `DELETE /api/food-items/:id` – Delete an item.
- `DELETE /api/food-items/bulk` – Bulk delete items.
- `GET /api/food-items/distribution` – Inventory distribution counts for dashboard charts.

Validation uses helper functions in `utils/foodItemUtils.ts` and Prisma transactions for consistency. Name uniqueness violations return `400` with a user‑friendly message.

## Translation Integration

The translation-trigger service queues translations when items are created or when the name changes during updates. Queued items are grouped by language and processed in batches to reduce RPM pressure. Deletions asynchronously remove related translations. Translation failures are logged but do not block inventory operations.

## Known Issues

- Archived tests for this module are stored in `/archived_tests/packages/frontend/src/components/food-item-management` and `/archived_tests/packages/backend/__tests__/features/food-items`.
- Inventory counts require a page refresh after bulk updates; real‑time updates are not yet implemented.

## Future Improvements

- Add granular permissions for inventory actions.
- Implement WebSocket updates to push inventory changes live.
- Enhance dietary flag filtering and reporting across the app.
