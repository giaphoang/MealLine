# Document Translator Overview

This overview summarizes the Document Translator feature. The system provides staff with tools to upload DOCX files and generate translations in multiple languages while maintaining the original formatting.

## Purpose

Document Translator centralizes translation of documents such as intake forms or flyers. It preserves formatting and keeps a history of translated files. The feature aims to replace manual translation workflows with a controlled, auditable process.

## Frontend Architecture

All React components live in `packages/frontend/src/components/document-translator/`.

- **`index.tsx`** – Parent component that loads documents with `useDocuments` and coordinates dialog state.
- **`DocumentList`** – Displays documents in a table with bulk actions. Uses `EnhancedDataTable` for sorting, selection, and pagination preservation after row-level document actions refresh data.
- **`TranslateDialog`** – Modal with tabs for Basic and Advanced translation modes, including progress polling and classification.
- **`EditDialog`** and **`DeleteDialog`** – Manage renaming and deletion with confirmation flows.
- **`FileUpload`** – Handles drag‑and‑drop uploads and validation.

State is controlled at the top level to avoid modal persistence issues. Polling updates translation progress while keeping the UI responsive.

## Backend API

Routes in `packages/backend/src/routes/documents.ts` expose document services:

- `GET /api/documents` – List documents with metadata and translation counts.
- `POST /api/documents/upload` – Upload a DOCX file and store it on disk.
- `POST /api/documents/:id/translate` – Queue translations for the selected languages.
- `GET /api/documents/:id/translate/progress` – Poll progress for ongoing jobs.
- `DELETE /api/documents/:id` – Remove a document and, optionally, its translations.

Prisma models store document records and cached translations. A position‑based translation engine writes translations directly to the correct text runs.

Document-list reads verify stored source files without mutating healthy records.
Integrity metadata is transition-based: the first missing-file result marks and
reports the document, repeated checks preserve that state without another write
or log message, and a later successful check clears the warning. Explicit
administrator reconciliation remains available for investigation and repair.

## Translation Integration

The feature shares translation services with the rest of the application. Languages are filtered against the enabled list, and statistics are recorded in `UsageRecord` entries. Cached segments are reused across documents when possible to reduce cost.

## Known Issues

- Complex DOCX features like forms or custom shapes may fail to translate and will keep the original content.
- The “Bulk Download” feature currently relies on sequential client‑side downloads; a zip archive endpoint is planned.

## Request Deduplication (January 2025)

### Problem Statement
Users could rapidly click the "Advanced Translate" button before the modal step transition occurred, causing multiple identical translation requests to be sent to the backend. This resulted in:
- Duplicate API calls to AI services (cost implications)
- Wasted backend resources
- Potential race conditions in file system operations
- Inconsistent progress tracking
- Multiple success/error messages

### Solution: Frontend Request Deduplication
Implemented request deduplication logic in the frontend DocumentService layer following established architectural patterns.

#### Implementation Details
- **Location**: `packages/frontend/src/services/document-translator/index.ts`
- **Pattern**: Frontend service layer enhancement (follows existing architecture)
- **Approach**: Track active translation requests using unique keys

#### Key Features
1. **Unique Request Keys**: Combines document ID, sorted languages, and translation options
2. **In-Flight Tracking**: Maintains a Map of active translation promises
3. **Automatic Cleanup**: Removes tracking when requests complete or fail
4. **Promise Reuse**: Returns existing promise for duplicate requests
5. **Logging**: Console logs for debugging duplicate request detection

#### Technical Implementation
```typescript
class DocumentApiService extends BaseApiService {
  // Track active translation requests to prevent duplicates
  private activeTranslations = new Map<string, Promise<any>>();
  
  async translateDocument(id: number, languages: string[], options?) {
    // Create unique key from document ID, languages, and options
    const translationKey = `${id}-${sortedLanguages.join(',')}-${optionsKey}`;
    
    // Return existing promise if request is already in progress
    if (this.activeTranslations.has(translationKey)) {
      return this.activeTranslations.get(translationKey);
    }
    
    // Track new request and clean up when complete
    const promise = this.post(/* ... */).finally(() => {
      this.activeTranslations.delete(translationKey);
    });
    
    this.activeTranslations.set(translationKey, promise);
    return promise;
  }
}
```

#### Benefits
- **Cost Reduction**: Prevents duplicate AI API calls
- **Resource Efficiency**: Eliminates redundant backend processing
- **Consistent UX**: Single progress tracking per unique translation
- **Architectural Alignment**: Works within existing frontend service patterns
- **User-Friendly**: No disabled buttons or confusing error messages

#### Architecture Compliance
This implementation follows established project patterns:
- **Frontend Service Layer**: Enhances existing DocumentService without backend changes
- **Incremental Development**: Single focused change with minimal risk
- **Promise Management**: Uses standard JavaScript promise patterns
- **Logging Integration**: Follows existing console logging conventions

## Recent Bug Fixes (Phase 1 - Critical Issues)

### Bulk Download Fix (Fixed & Tested)
- **Issue**: "Download All Translations" action from single row menu failed with "Invalid document ID" error
- **Root Cause**: DocumentList component passed document ID instead of full Document object to columns function
- **Fix**: Updated `onDownloadAllTranslations` parameter in columns call to pass complete document object
- **Testing**: 6 test cases validate parameter passing and prevent regression
- **Impact**: Single-row "Download (x) Translations" action now works correctly

### Date Display Fix (Complete)
- **Issue**: "Last Updated" field showed dates one day behind actual upload date
- **Root Cause**: Naive date parsing (`split('T')[0]`) ignored timezone differences
- **Fix**: Replaced with `new Date().toLocaleDateString()` for proper timezone handling in both data processing locations
- **Scope**: Fixed in initial fetch AND language change re-processing logic
- **Testing**: 7 comprehensive test cases validate timezone handling and date consistency
- **Impact**: Dates now display correctly in user's local timezone for all document types

### Upload Modal Filename Wrapping (Complete)
- **Issue**: Long DOCX filenames pushed the green "Selected file" banner beyond the upload dialog bounds.
- **Root Cause**: The confirmation banner rendered as a single flex row, preventing natural line wrapping.
- **Fix**: Reflowed the banner contents into a stacked layout with `break-all` handling on the filename to respect modal width.
- **Impact**: Upload modal now contains long filenames without visual overflow while preserving the established Shadcn dialog styling.

### Duplicate Delete Toasts (Complete)
- **Issue**: Document deletion triggered two success toasts (“Translation deleted successfully” and a contextual variant) back-to-back.
- **Root Cause**: Both the `useDocuments` hook and the `DocumentTranslator` component fired success messages for the same action.
- **Fix**: Centralized the delete success toast within `useDocuments`, ensuring the hook emits the contextual message with the document or translation name while the component remains silent on success.
- **Impact**: Users now see a single success confirmation that matches established messaging patterns without redundant notifications.

### Phase 1 Completion ✅
- **Status**: Both critical bugs fixed and validated
- **Test Coverage**: 19/19 tests passing (7 date formatting + 6 bulk download + 6 integration)
- **Architecture**: Data flow and presentation improvements confirmed
- **Ready for**: Phase 2 (Error messaging improvements)

## Future Improvements

- Batch translation for multiple documents at once.
- Better document preview and versioning.
- Support for other file types such as PDF.
