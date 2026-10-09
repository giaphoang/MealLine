# Category Management Overview

This document summarizes the implementation and architecture of the Category Management feature. It includes the main frontend components, backend routes, and interactions with the translation system.

## Purpose

Category Management allows administrators to create, edit, and delete food categories. Categories include a limit (per person or household) and an optional icon. When a category name changes, translations are updated for all enabled languages.

## Frontend Architecture

Located in `packages/frontend/src/components/category-management/`, this feature follows a modular component structure:

- **`CategoryManagement/index.tsx`** – Top‑level component that coordinates dialogs and data operations.
- **`CategoryList`** – Displays categories in a data table with bulk actions.
- **Form dialogs** – `add-dialog.tsx`, `edit-dialog.tsx`, and `delete-dialog.tsx` provide CRUD dialogs. `CategoryList/bulk-delete-dialog.tsx` handles multi‑delete confirmation.
- **Data table** – `data-table/` defines the columns and table component used by `CategoryList`.
- **Hooks** – `useCategoryData` in `src/hooks/category` manages API interaction, caching, and optimistic updates.
- **Service layer** – `src/services/category` wraps API requests and performs client‑side validation.

### State Management

`useCategoryData` caches category data for five minutes. It exposes methods to refresh categories, create, update, delete, and bulk delete. Optimistic updates are used for create/update/delete operations to keep the UI responsive.

**Error Handling**: As of v0.10.91, the category management system uses the centralized `ErrorHandlerService` for consistent, user-friendly error messaging. This provides standardized "Actionable, Specific, Kind" (ASK) error messages across all category operations. As of v0.10.92, duplicate error handling has been eliminated - the `ErrorHandlerService` now includes category-specific error mappings and redundant manual error handling has been removed from components.

### Bulk Operations

The data table supports multi‑selection. `CategoryList` calls `bulkDeleteCategories` from the service to send IDs to the backend. Results are reported via toast notifications.

The shared table preserves pagination when row or bulk actions refresh category data, so staff stay on the current page while working through long category lists.

## Backend API

The Express router in `packages/backend/src/routes/categories.ts` provides REST endpoints:

- `GET /api/categories` – List categories.
- `GET /api/categories/:id` – Retrieve a single category.
- `POST /api/categories` – Create a category.
- `PUT /api/categories/:id` – Update a category. Accepts a `keepTranslations` flag to preserve existing translations.
- `PUT /api/categories/bulk` – Update multiple categories.
- `DELETE /api/categories/:id` – Delete a category. Fails with status 409 if food items are assigned.
- `DELETE /api/categories/bulk` – Bulk delete. Returns a `207 Multi‑Status` response when some deletions fail because items are attached.
- `GET /api/categories/distribution` – Returns counts of food items per category for dashboard charts.

Validation errors return `400` with explanatory messages. Unique name conflicts return `400` with a friendly error. All routes use Prisma transactions for consistency.

## Translation Integration

The translation-trigger service queues translations when categories are created or when a name changes. The service batches queued categories by language, translates them asynchronously using the configured AI provider, and stores results in the `translation` table. Failed translations generate alerts but do not block category operations.

## Known Issues

- Archived tests for this feature are located in `/archived_tests/packages/frontend/src/__tests__/components/category-management`. Test restoration instructions are in `/archived_tests/README.md`.
- Category icons rely on a fixed set of assets; adding new icons requires a frontend build.

## Future Improvements

- Add more granular permissions around category management operations.
- Consider real‑time updates via WebSockets to remove the refresh requirement after bulk operations.
