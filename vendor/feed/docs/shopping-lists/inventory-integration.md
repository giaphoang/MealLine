# Shopping List Inventory Integration

This document outlines the implementation of real inventory data integration with the shopping list feature.

## Overview

The shopping list feature now pulls real inventory data (categories and food items) from the database instead of using mock data. This integration allows for more accurate and up-to-date shopping lists based on current inventory.

## Components

### Types

- Created type definitions in `types/shopping-list/index.ts`:
  - `ShoppingList` - Main shopping list entity
  - `ShoppingListTemplate` - Saved template structure
  - `ShoppingListSection` - Section within a shopping list (maps to categories)
  - `ShoppingListItem` - Individual item within a section (maps to food items)
  - Utility mappings for category icons

### Hooks

- `useShoppingListInventory` in `hooks/shopping-list/useShoppingListInventory.ts`:
  - Leverages existing `useCategoryData` and `useFoodItemData` hooks
  - Transforms database entities into shopping list format
  - Provides loading and error states
  - Maps category names to appropriate icons
  - Filters items based on inventory status (only in-stock items)

### UI Integration

Updated `ShoppingListConfigDialog` component to:
- Fetch data using the new hook
- Display loading indicators during data retrieval
- Show error messages when data fetch fails
- Transform string-based icon identifiers to React components
- Enable all inventory-based sections by default

## Data Flow

1. `useShoppingListInventory` hook fetches categories and food items from the database
2. Data is transformed into the shopping list section format
3. Each section receives an appropriate icon based on category name
4. UI displays loading state while data is being fetched
5. Once loaded, sections are displayed with real inventory data
6. User can customize which sections and items to include

## Benefits

- Shopping lists now reflect actual inventory data
- Changes to food items and categories are immediately reflected in shopping lists
- Consistent UI experience with proper loading and error states
- Strong typing improves code maintainability

## Architectural Integration with Decisions ✅

### Minimum Viable Implementation Strategy

#### Template-Instance Model Implementation
- **Current Hook**: `useShoppingListInventory` provides foundation for category section generation
- **Template Storage**: Database schema will store template configurations with three section types
- **Instance Generation**: Hook data transformed into printable instances
- **Live Data**: Hook ensures category sections always use current inventory status

#### Three Section Types Integration

**Category Sections** (Current Hook Integration)
- **Current Implementation**: Hook respects `individualLimit` from FoodItem
- **Enhancement Needed**: Add Global Limit fallback for "No Limit" items
- **Implementation Strategy**: Pull all in-stock items dynamically (Option A)
- **Limits Logic**: Handle interaction between GlobalLimit/Category.limit/FoodItem.limit

**Form Sections** (New Implementation Needed)
- **Purpose**: Configurable form elements for data collection
- **Current Use Case**: Client information (name, household size, allergies, bag capacity)
- **Configuration**: JSON field storing form field definitions
- **Future Flexibility**: Any type of form data collection

**Custom Text Sections** (New Implementation Needed)
- **Purpose**: User-defined text blocks insertable anywhere in document
- **Configuration**: JSON field storing text content, style, and alignment
- **Use Cases**: Instructions, disclaimers, custom messaging

### Implementation Dependencies

#### Existing Hook Enhancement
```typescript
// Current: useShoppingListInventory
// Enhancement needed:
- Add Global Limit fallback logic
- Handle Category.limit constraints
- Support section ordering and configuration
```

## Future Enhancements

### Minimum Viable Implementation Completed
- ✅ Database schema decisions finalized (3 tables: templates, sections, instances)
- ✅ API endpoint structure defined (templates, instances, generation)
- ✅ Export strategy: Server-side React‑PDF (HTML print removed)
- ✅ Section types defined (custom-text, form, category)
- ✅ Category implementation strategy (Option A - dynamic loading)

### Next Implementation Steps
1. **Enhance existing hook** for Global Limit fallback logic
2. **Add section type support** beyond just category sections
3. **Implement template configuration** JSON handling
4. **Create instance generation** pipeline from template + live data

### Future Phase Enhancements (Post-MVP)
1. **Bilingual Rendering Capability**
   - Modify hook to support bilingual item display
   - Add template settings for bilingual mode
   - Integrate with existing Translation table
   
2. **Advanced Category Filtering**
   - Dietary restriction filters (vegan, gluten-free, etc.)
   - Item status filters (clearance, limited, etc.)
   - Custom item selection within categories
   
3. **Enhanced Form Configuration**
   - Custom form field types beyond basic client info
   - Conditional field display logic
   - Form validation and data persistence

## Limit Hierarchy and Display (April 2026 update)

Pantry limits exist on three levels and must be surfaced separately rather than collapsed into a single per-row number:

1. **Global limit** (`GlobalLimit.value`) - the cap that applies when nothing more specific is set. Prevents a client from ordering an arbitrary quantity of an item with no per-item or per-category control. Displayed only as a fallback during PDF generation, not in the Shopping List Builder UI.
2. **Category limit** (`Category.limit`, `Category.limitType`) - applies to the entire section. Displayed as a dedicated tag beneath the category name in the section-table title row. Household tags use compact wording such as "Choose one", "Choose two", or "Choose up to X"; per-person tags stay explicit as "Choose up to X per person".
3. **Food Item limit** (`FoodItem.limit`, `FoodItem.isLimited`, `FoodItem.limitType`) - applies only to a specific item. Higher than the category limit is allowed at the model level but should be flagged at the modal because it usually represents a configuration mistake.

The Shopping List Builder treats `100` as the "no limit" sentinel (matching the Categories and Food Items dialogs). When `FoodItem.limit === 100` or `FoodItem.isLimited === false`, the row contributes no row-level limit text. When `Category.limit === 100`, the section-level "Choose X" tag is hidden. The previous behavior where missing food-item limits silently inherited the category number into every row is intentionally retired because it misrepresented the policy as per-item.

## Inventory Editing in the Builder (April 2026 update)

To save the round-trip to the Categories and Food Items pages, the Shopping List Builder exposes inventory edits inline:

- **Per-row Action menu** (replaces the legacy Trash icon): Edit, Mark Out of Stock, Mark Clearance, Change Category, Delete.
  - Edit opens the same Food Item edit dialog used on `/food-items`.
  - Mark Out of Stock / Mark Clearance toggle the corresponding `FoodItem` status flags via the existing food-item update endpoint.
  - Change Category opens a small dialog with a category select.
  - Delete confirms via AlertDialog and deletes the food item.
- **+ Add row dropdown** (inventory-backed tables only): "Add existing item" lists out-of-stock items in the same category and marks them in-stock when chosen; "Add new item" opens the Add Food Item dialog with the current category pre-selected.
- **Edit Category** button in Properties → Content (inventory-backed tables only) opens the Categories edit dialog with the current category preloaded.

After any inventory mutation triggered from the builder, the canvas component is refreshed via `POST /api/shopping-list-builder/refresh-inventory`, the global Inventory Sections list is re-fetched, and the cached `Category` / `FoodItem` contexts invalidate.

The `ShoppingListBuilderPage` is wrapped in `CategoryProvider` and `FoodItemProvider` so the existing dialogs (`category-management/edit-dialog.tsx`, `food-item-management/edit-dialog.tsx`, `food-item-management/add-dialog.tsx`) can be reused without duplicating state.
