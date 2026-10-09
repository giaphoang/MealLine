# Bulk Download Feature - Technical Documentation

## Overview
This document outlines the technical approach for implementing bulk download functionality in the Document Translator module.

## Current State Analysis

### Frontend Architecture
- **Selection System**: Already implemented via `EnhancedDataTable` with multi-selection capability
- **Bulk Actions**: Framework exists with `TableBulkAction<Document>[]` supporting bulk delete
- **Download Handler**: Single document download via `handleDownload` in `DocumentTranslator/index.tsx`

### Backend Architecture
- **Download Endpoints**:
  - `/api/documents/:id/download` - Downloads original document
  - `/api/documents/:id/translations/:language/download` - Downloads translated document
- **No bulk download endpoint currently exists**

### Key Components

#### Frontend
1. **DocumentList Component** (`DocumentList/index.tsx`)
   - Manages bulk actions array
   - Handles selection state
   - Currently implements bulk delete

2. **Document Service** (`services/document-translator/index.ts`)
   - `downloadDocument(id)` - Downloads original document
   - `downloadTranslation(parentId, language)` - Downloads translation
   - Both trigger browser download via blob URL

#### Backend
1. **Document Routes** (`routes/documents.ts`)
   - Single file download endpoints
   - Returns file content with appropriate headers

2. **Document Service** (`services/document/index.ts`)
   - `getDocumentContent(id)` - Retrieves file buffer from storage

## Implementation Approach

### Option 1: Client-Side Sequential Downloads (Recommended)
**Pros:**
- No backend changes required
- Reuses existing download infrastructure
- Simple implementation
- Progressive feedback to user

**Cons:**
- Multiple HTTP requests
- Browser may throttle concurrent downloads

**Implementation:**
```typescript
// Add to bulkActions array in DocumentList
{
  label: 'Download Selected',
  icon: Download,
  action: async (selected: Document[]) => {
    for (const doc of selected) {
      await handleDownload(doc);
      // Small delay to prevent browser throttling
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  },
  variant: 'default'
}
```

### Option 2: Server-Side Zip Archive
**Pros:**
- Single download request
- Professional approach
- Better for large selections

**Cons:**
- Requires new backend endpoint
- Memory intensive for large files
- Additional dependency (archiver)

**Implementation Requirements:**
1. New backend endpoint: `POST /api/documents/bulk-download`
2. Install `archiver` package
3. Create zip stream with selected documents
4. Handle mixed original/translated documents

### Option 3: Hybrid Approach
- Use sequential downloads for <5 files
- Switch to zip archive for larger selections
- Provides best user experience

## Recommended Implementation Plan

### Phase 1: Client-Side Sequential (Quick Win)
1. Add bulk download action to `DocumentList` component
2. Implement progress indicator during downloads
3. Handle download failures gracefully
4. Add download count limit warning (e.g., >10 files)

### Phase 2: Server-Side Zip (Future Enhancement)
1. Create bulk download endpoint
2. Implement file streaming to avoid memory issues
3. Add progress tracking via WebSocket/SSE
4. Support mixed document types in single archive

## User Experience (Implemented)

### Selection Feedback
- ✅ Action available when items selected
- ✅ Warning dialog for >10 files
- ✅ Selection cleared after download completion

### Progress Indication
- ✅ Initial notification: "Starting download of X file(s)..."
- ✅ Aggregate progress updates: "Downloaded X of Y files..." (count-based)
- ✅ Summary notification with success/failure counts
- ✅ Enhanced toast stacking for multiple notifications

### Error Handling
- ✅ Continues with remaining files on individual failure
- ✅ Summary shows successful/failed download counts
- ✅ Console logging for debugging failed downloads

## Toast System Enhancement

### Problem Addressed
- Toast messages were rapidly generated during bulk downloads
- Users could only see the most recent message (TOAST_LIMIT = 1)
- Previous progress updates were buried and unreadable
- **Duplicate toast messages** in Food Item Management system due to dual messaging

### Solution Implemented
- **Increased Toast Limit**: TOAST_LIMIT changed from 1 to 5 in `hooks/use-toast.ts`
- **Enhanced Stacking**: Improved gap spacing from `gap-2` to `gap-3` in toast viewport
- **Progress Toast Utility**: New progress toast method in message service
- **Hybrid Approach**: Uses progress toast for ongoing updates + separate summary toast
- **Silent Download Parameters**: Added optional `silent` flag to suppress individual download messages during bulk operations
- **Accessibility-Compliant Timing**: Increased durations to meet WCAG standards (6-8 seconds)
- **Reduced Update Frequency**: Slowed progress updates from 100ms to 500ms intervals

### Technical Changes
1. **Toast Configuration** (`hooks/use-toast.ts`)
   - Increased TOAST_LIMIT to support multiple visible toasts
   - Benefits all bulk operations across the application

2. **Toast Viewport** (`components/ui/toast.tsx`)
   - Enhanced vertical spacing for better visual separation
   - Improved stacking behavior for multiple toasts
   - Fixed CSS conflict: removed `sm:flex-col` that overrode `flex-col-reverse`

3. **Message Service** (`services/message/index.ts`)
   - Added `progress()` method for updatable toast notifications
   - Returns object with `update()` and `dismiss()` methods
   - Longer duration (30s) for progress toasts

4. **Silent Download Parameters** (Component & Hook Updates)
   - **useDocuments Hook** (`hooks/document-translator/useDocuments.ts`):
     - Added optional `silent?: boolean` parameter to `downloadDocument(id, silent?)`
     - Added optional `silent?: boolean` parameter to `downloadTranslation(id, language, silent?)`
     - Suppresses success/error toast messages when `silent = true`
   - **Main Component** (`components/document-translator/index.tsx`):
     - Added optional `isBulk?: boolean` parameter to `handleDownload(document, isBulk?)`
     - Passes `isBulk` flag as `silent` parameter to download functions
     - Suppresses integrity warnings and "Download started" messages during bulk operations
   - **DocumentList Component** (`components/document-translator/DocumentList/index.tsx`):
     - Updated interface: `onDownload: (document: Document, isBulk?: boolean) => void`
     - Calls `onDownload(doc, true)` during bulk downloads to enable silent mode
     - Maintains aggregate progress tracking without individual file notifications

5. **useMessage Hook** (`hooks/message/useMessage.ts`)
   - Added `showProgress()` function for component access
   - Maintains consistency with existing message patterns

6. **Bulk Download Implementation**
   - Uses progress toast for real-time aggregate count updates
   - Dismisses progress toast before showing final summary
   - Maintains separate toast for completion status
   - Progress format: "Downloaded X of Y files..." (count-based)
   - Removes individual filename updates for cleaner UX

### Benefits
- Users can track download progress in real-time
- Multiple toast messages remain visible simultaneously
- Enhanced user feedback for all bulk operations
- Consistent across food items, categories, translations, and documents

## Duplicate Message Resolution

### Food Item Management Fix
**Problem**: Food item operations (create, update, delete) showed duplicate success messages due to toast calls in both the data hook (`useFoodItemData`) and UI components.

**Root Cause**: 
- `useFoodItemData.createFoodItem()` → `showSuccess('Food item created successfully')`
- `FoodItemContent.handleCreateFoodItem()` → `showMessage('Food item created successfully', 'success')`

**Solution Applied**: Removed all toast message calls from `useFoodItemData` hook, following the established pattern from Category Management:
- **Data hooks**: Handle business logic, throw errors, return results
- **UI components**: Handle user feedback messaging
- **Single source of truth**: No duplicate messaging paths

**Changes Made**:
1. Removed `useMessage` import from `useFoodItemData.ts`
2. Removed all `showSuccess`, `showError`, `showWarning` calls from hook methods
3. Simplified timeout/warning logic in delete operations (moved to UI layer)
4. Maintained error throwing for proper UI error handling
5. Updated useCallback dependencies to remove toast function references

**Result**: Clean separation of concerns matching Category Management pattern, eliminating duplicate messages for all food item operations.

## Security Considerations
- Validate user has access to all selected documents
- Rate limiting to prevent abuse
- File size limits for zip approach

## Testing Strategy
1. Unit tests for bulk action handler
2. Integration tests for download sequence
3. Manual testing with various file sizes/counts
4. Browser compatibility testing
5. Toast behavior testing with multiple concurrent operations
6. Progress toast update functionality verification

## Migration Path
No database changes required. Feature can be deployed without migrations.

## Performance Metrics
- Track average download time per file
- Monitor concurrent download limits
- Measure user engagement with feature

## Alternative UX Patterns
1. **Download Queue**: Show pending downloads in sidebar
2. **Background Downloads**: Continue in background, notify on completion
3. **Download Manager**: Full-featured modal with pause/resume

## Single Row Translation Downloads (Fixed & Implemented)

### Feature Description
Added "Download (x) Translations" action to the row actions menu for original documents that have associated translations.

### Implementation Approach
**Approach 3: Dedicated Translation Download Handler**
- Created `handleDownloadAllTranslations` in main DocumentTranslator component
- Provides clear progress feedback and error handling
- Uses bulk mode flag to prevent individual download toasts
- Consistent with existing patterns while optimized for the use case

### Technical Implementation

#### 1. Main Component Handler (`index.tsx`)
```typescript
const handleDownloadAllTranslations = useCallback(async (document: Document) => {
  try {
    const translations = await getTranslations(document.id);
    
    if (translations.length === 0) {
      showMessage("No translations available for this document", "info");
      return;
    }
    
    showMessage(`Downloading ${translations.length} translation${translations.length > 1 ? 's' : ''}...`, "info");
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const translation of translations) {
      try {
        await downloadTranslation(document.id, translation.language, true); // true for bulk mode
        successCount++;
      } catch (error) {
        console.error(`Failed to download ${translation.language} translation:`, error);
        failureCount++;
      }
    }
    
    if (failureCount === 0) {
      showMessage(`Successfully downloaded ${successCount} translation${successCount > 1 ? 's' : ''}`, "success");
    } else {
      showMessage(`Downloaded ${successCount} translation${successCount > 1 ? 's' : ''}, ${failureCount} failed`, "warning");
    }
  } catch (error) {
    showMessage("Failed to fetch translations", "error");
  }
}, [getTranslations, downloadTranslation, showMessage]);
```

#### 2. Props Threading
- Added handler to DocumentList props interface
- Passed through to columns function
- Updated column actions to include the new handler

#### 3. Column Action Integration (`columns.tsx`)
```typescript
// Add Download All Translations action if translations exist
if (document.translationsCount && document.translationsCount > 0) {
  actions.push({
    label: `Download (${document.translationsCount}) Translation${document.translationsCount > 1 ? 's' : ''}`,
    icon: Download,
    onClick: () => onDownloadAllTranslations(document)
  })
}
```

#### 4. Translation Count Population
- Updated `useDocuments` hook to include `translationsCount` in document objects
- Applied during both initial fetch and language updates
- Ensures count is available for display in actions menu

### User Experience
- Action only appears for original documents with translations
- Shows exact count in menu label: "Download (3) Translations"
- Provides initial info toast showing download is starting
- Final toast shows success/failure counts
- Uses bulk mode to prevent individual file toasts
- Handles edge cases (no translations, all failures)

### Benefits
- Complements existing bulk download feature
- One-click download of all translations for a document
- Clear feedback about progress and results
- Consistent with application patterns
- No backend changes required
