# Translation Retry Enhancement

## Overview

This enhancement improves the translation system by allowing users to restart translations regardless of their current status. Previously, the "Retry Translation" action was only available for translations with a "failed" status. With this update, users can retry translations that are in any state: pending, completed, or failed.

## Features

1. **Universal Retry Action**:
   - Translation retry is now available for all translations
   - Action appears in the table action menu for every translation entry
   - Different labels and icons based on status:
     - "Retry Translation" with refresh icon for pending/failed entries
     - "Restart Translation" with rotate icon for completed entries
   - Maintains consistent UX with other translation actions

2. **Confirmation Dialog**:
   - Added for completed and pending translations to prevent accidental retries
   - Different messaging based on current translation status:
     - For completed: warns about additional costs
     - For pending: suggests it can help unstick translations
     - For failed: confirms the retry action
   - Visual distinction for different operation types

3. **Backend Improvements**:
   - Modified retry endpoint to handle all translation states
   - Improved transaction handling during retry process
   - Better error handling and recovery mechanisms
   - Consistent status updates throughout retry process

4. **UX Improvements**:
   - Clear, status-specific user feedback messages:
     - "Translation restarted successfully" for completed translations
     - "Translation process reset successfully" for pending translations  
     - "Failed translation retry initiated" for failed translations
   - Context-sensitive tooltips explaining retry functionality 
   - Automatic refresh of translation list after retry
   - Consistent styling of action buttons and dialogs

## Implementation Details

### Frontend Changes

1. **Action Menu**: Modified to show retry option for all translations
2. **Retry Dialog**: Added confirmation dialog with status-specific messaging
3. **Status Types**: Enhanced type system with standardized translation status types
4. **Retry Handler**: Updated to conditionally show confirmation based on status

### Backend Changes

1. **Retry Endpoint**: Modified to support all translation statuses
2. **Transaction Handling**: Improved to ensure data consistency during retry
3. **Query Enhancement**: Updated to return all translations regardless of status
4. **Error Handling**: Enhanced error feedback for various failure scenarios

## Usage

1. In the Translation Management interface, find any translation entry
2. Click the action menu (three dots) on the right side of the row
3. Select one of the following options based on the translation status:
   - "Retry Translation" for failed translations
   - "Restart Translation" for completed translations
   - "Retry Translation" for pending translations
4. For completed or pending translations, confirm the action in the dialog
5. The translation will be reset to "pending" and the translation process will restart

## Technical Notes

- This change is backward compatible with existing translations
- No database schema changes were required
- The retry process uses the same token tracking and cost management as the original translation
- Performance impact is minimal as the changes only affect UI logic and API handling
- Interaction with Find Missing Translations:
  - For Food Items/Categories queued via the trigger service, you can still use Retry for failed items
  - For Custom texts processed inline, failed items remain eligible for Retry from the table

## Related Files

- `/packages/frontend/src/components/translation-management/data-table/columns.tsx`
- `/packages/frontend/src/components/translation-management/retry-dialog.tsx`
- `/packages/frontend/src/components/translation-management/index.tsx`
- `/packages/backend/src/routes/translations.ts`
- `/packages/frontend/src/types/translation.ts`
