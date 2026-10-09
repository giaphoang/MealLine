# Food Items Action Menu Unification

## Overview

This document describes the implementation of smart context-based actions for the Food Items Management table's single-row action menus, resolving the feature disparity between bulk actions and single-row actions.

## Problem Statement

The Food Items Management section had a significant UX inconsistency:
- **Bulk actions**: 6 operations (Mark In Stock, Mark Limited Supply, Mark Clearance, Mark Out of Stock, Change Category, Delete)
- **Single row actions**: Only 2 operations (Edit, Delete)

This forced users to select items in bulk to perform simple status changes on individual items, creating unnecessary friction.

## Solution: Smart Context-Based Actions

Implemented an intelligent action menu system that shows relevant actions based on the current item state.

### Implementation Details

#### 1. Context-Aware Status Actions

The action menu now dynamically adjusts based on the item's current status:

**When item is Out of Stock:**
- Edit
- Mark In Stock
- Change Category
- Delete

**When item is In Stock:**
- Edit
- Mark Out of Stock
- Mark Limited Supply (if not already limited)
- Mark Clearance (if not already on clearance)
- Change Category
- Delete

#### 2. Technical Architecture

##### Data Flow

1. **Direct Handler Pattern**: Actions call specific handlers passed directly to the columns function
2. **Handler Separation**: Added `onUpdateStatus` handler specifically for status changes
3. **Category Change**: Reuses the existing bulk category dialog for single items

##### Component Changes

**Modified Components:**
- `columns.tsx`: 
  - Added `onUpdateStatus` to the `FoodItemActions` interface
  - Context-aware action generation uses direct handlers instead of table meta
- `FoodItemList`: 
  - Created `handleUpdateStatus` wrapper for status updates
  - Passes handler directly to columns function
  - Maintains error handling consistency

#### 3. Action Implementation

```typescript
// Handler definition in FoodItemList
const handleUpdateStatus = useCallback(async (item: FoodItem, statusFlags: FoodItem['statusFlags']) => {
  try {
    await onUpdate({ ...item, statusFlags })
  } catch (error) {
    handleError(error as Error)
  }
}, [onUpdate, handleError])

// Usage in columns.tsx
{
  label: "Mark In Stock",
  icon: Package,
  onClick: async () => {
    if (onUpdateStatus) {
      await onUpdateStatus(item, {
        isInStock: true,
        isLimited: false,
        isClearance: false
      })
    }
  }
}
```

##### Why Direct Handler Pattern?

1. **Consistency**: Follows the established pattern in Translation Management
2. **Clarity**: Explicit data flow is easier to understand and debug
3. **Type Safety**: TypeScript can properly validate handler signatures
4. **Reliability**: No dependency on table internals that might change
5. **Testability**: Direct handlers are easier to mock in tests

### Benefits

1. **Improved UX**: Users can perform all operations on single items without bulk selection
2. **Intelligent Context**: Only relevant actions are shown, reducing cognitive load
3. **Consistency**: Maintains the same functionality as bulk operations
4. **Code Reuse**: Leverages existing handlers and dialogs
5. **Scalability**: Easy to add new status types or actions

### Design Decisions

1. **Context-Based vs. Full Parity**: Chose context-based to keep menus clean and focused
2. **Category Dialog Reuse**: Used existing bulk dialog for single items to maintain consistency
3. **Status Exclusivity**: Limited Supply and Clearance are mutually exclusive, simplifying the UI
4. **Action Order**: Maintained logical grouping (Edit → Status → Category → Delete)

### Error Handling

The implementation includes proper error handling at each level:
- **handleUpdateStatus**: Catches errors and passes them to the global error handler
- **Action handlers**: Check for handler existence before calling
- **Consistent messaging**: Uses the centralized message system for user feedback

### Future Considerations

1. **Performance**: Current implementation updates items individually; could batch updates
2. **Undo Support**: Could add undo functionality for status changes
3. **Keyboard Shortcuts**: Could add keyboard navigation for power users
4. **Custom Status Types**: Architecture supports easy addition of new status types

## Testing Recommendations

1. **Unit Tests**: Test action generation logic for different item states
2. **Integration Tests**: Verify update handlers work correctly
3. **E2E Tests**: Test complete user workflows for status changes
4. **Edge Cases**: Test rapid status changes and error scenarios

## Migration Notes

No database migration required. This is a UI-only enhancement that uses existing API endpoints and data structures.
