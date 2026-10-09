# Document Translator Error Handling Improvements

## Overview
Comprehensive error handling improvements for the document translator system, including retry logic with exponential backoff for translation failures and centralized ASK-compliant error messaging for all document operations.

## Recent Update: Comprehensive Error Message Mapping (January 2025)
### Problem Statement
The Document Translator was displaying generic "An unexpected error occurred. Please try again." messages for well-defined error conditions, violating the ASK (Actionable, Specific, Kind) principle. Investigation revealed:

1. **Backend services** correctly generated ASK-compliant error messages
2. **Centralized ErrorHandlerService** had zero mappings for document operations (despite 80+ mappings for other modules)
3. **Users received unhelpful generic messages** instead of specific, actionable guidance

### Solution: Comprehensive Document Error Mapping
Added 40+ comprehensive error mappings to `ErrorHandlerService.errorMessageMap` covering all document operation categories:

#### Upload Operations
- Document name conflicts and validation
- File type restrictions (DOCX only)
- File size limits (5MB maximum)
- Storage system errors

#### Document Management
- Document not found scenarios
- Content availability issues
- Invalid document identifiers
- Required field validation

#### Translation Operations
- Translation not found errors
- Language validation failures
- Empty document handling
- Processing failures

#### Storage and File System
- File integrity issues
- Storage path errors
- File corruption detection
- Storage system failures

#### Download Operations
- File retrieval failures
- Missing file detection
- Integrity issue warnings
- Storage path resolution

### Implementation Details
All error mappings follow the established ASK principles:
- **Actionable**: Tell users what they can do to resolve the issue
- **Specific**: Clearly explain what went wrong in plain language
- **Kind**: Use a friendly, helpful tone without blaming the user

**Example transformation:**
- **Before**: "An unexpected error occurred. Please try again."
- **After**: "A document with this name already exists. Please choose a different name."

### Previous Implementation: AI Translation Retry Logic
## Problem Statement
When AI API calls failed (e.g., invalid model access), the system would:
1. Silently substitute original text for translations
2. Report success despite failures
3. Mislead users into thinking translations completed

## Solution: Retry with Exponential Backoff

### Implementation Details

#### Retry Logic
- **Max Attempts**: 3 retries per batch
- **Backoff Strategy**: Exponential (1s, 2s, 4s delays)
- **Retryable Errors**: 
  - Rate limits
  - Timeouts
  - Server errors (500, 502, 503)
  - Network issues
- **Non-retryable Errors**:
  - Invalid API key
  - Model access denied
  - Authentication failures

#### Error Tracking
- Failed segments tracked separately
- Detailed error messages preserved
- Progress status reflects partial failures
- Clear distinction between total and partial failures

#### Failure Handling

**Total Failure**: When all translation attempts fail with no cached content
- Error thrown to processLanguage
- Progress marked as 'failed'
- User sees clear error message
- Alert created for failure

**Partial Failure**: When some segments fail but others succeed
- Translation continues with fallback text
- Progress shows warning about failed segments
- Document saved with partial translations
- User informed of partial success

### Code Changes

1. **translateBatch method**: 
   - Added retry loop with exponential backoff
   - Returns failedSegments array on failures
   - Distinguishes retryable vs non-retryable errors

2. **processSegments method**:
   - Tracks all failed segments across batches
   - Returns hasFailures flag and failureDetails
   - No longer catches/hides errors

3. **processLanguage method**:
   - Handles total vs partial failures
   - Updates progress with failure stats
   - Throws error for total failures

4. **Progress Type Definition**:
   - Added `failed` field to stats
   - Updated message for partial failures

## Benefits

1. **Transparency**: Users see actual translation status
2. **Resilience**: Transient errors handled automatically
3. **Actionable Errors**: Clear messages guide user actions
4. **Partial Recovery**: Successful segments preserved

## Testing Scenarios

### Scenario 1: Invalid API Key
- Configure invalid OpenAI key
- Attempt translation
- Verify error message about API configuration

### Scenario 2: Rate Limit
- Trigger rate limit error
- Verify retry attempts occur
- Check exponential backoff timing

### Scenario 3: Partial Success
- Mock failure for specific batch
- Verify other batches continue
- Check progress shows partial failure

### Scenario 4: Total Failure
- Mock all batches failing
- Verify translation marked as failed
- Check error propagation to UI

## Error Messages

### User-Facing Messages
- **Invalid API Key**: "Invalid API key configuration. Please check your AI settings in Tools → AI Configuration"
- **Model Access**: "Your organization must be verified to use model [model-name]"
- **Partial Success**: "Translation completed with X segments using fallback text"
- **Total Failure**: Shows specific API error message

### Console Logging
- Retry attempts logged with attempt number
- Non-retryable errors identified
- Backoff delays shown
- Failure summaries provided

## Phase 2: Frontend Error Display (Complete)

### Implementation Details

#### Progress Polling Enhancement
- Track failed languages and partial failures separately
- Display specific error messages for each language
- Show summary messages for total/partial failures
- Success messages only shown when no failures

#### Visual Indicators
- **Red background**: Complete translation failure
- **Amber background**: Partial failure with fallback text
- **Warning icon (⚠)**: Indicates partial success
- **Error icon (✗)**: Indicates complete failure

##### Dark Mode Support (Updated)
- Visual indicators now use CSS custom properties from the centralized theme
- Status colors adapt automatically to light/dark mode:
  - **Danger status**: Uses `--status-danger-bg/border/text` variables
  - **Warning status**: Uses `--status-warning-bg/border/text` variables
- Ensures consistent appearance across all theme settings
- Follows established project patterns for theme-aware styling

#### User Messaging
- **Complete failure**: "Translation to [language] failed: [specific error]"
- **Partial failure**: "Translation completed with X segments using fallback text"
- **Multiple failures**: "Translation failed for: [languages]. Please check your AI configuration"
- **Timeout warning**: "Translation is taking longer than expected"

#### Download Buttons
- Partial success shown with amber border and warning icon
- Failed translations disabled with red styling
- Tooltips explain failure reasons
- Progress percentage shown during processing

### User Experience Improvements

1. **Real-time Status**: Users see live updates during translation
2. **Clear Failure Indication**: Visual and textual cues for problems
3. **Actionable Messages**: Error messages guide users to solutions
4. **Partial Success Handling**: Users can download partial translations
5. **Detailed Progress Stats**: Shows cache usage, new translations, and failures

## Recent Update: Upload Dialog Error Handling (January 2025)

### Problem Statement
When users uploaded a document with a duplicate name, the upload dialog would close immediately upon error, forcing users to:
1. Reopen the upload dialog
2. Re-select the file
3. Re-enter the filename
4. Attempt upload again

Additionally, after implementing dialog persistence, the FileUpload component would reset to its initial state, losing the file selection and filename field.

### Solution: Error Communication & State Preservation
Implemented a two-part solution following established patterns:

#### Part 1: Conditional Dialog Closure
- Dialog only closes on successful upload
- Dialog remains open on error, allowing immediate correction
- Follows the exact pattern from AddCategoryDialog, EditDialog, and AddFoodItemDialog

#### Part 2: Error State Management
- Parent component throws error to signal failure to FileUpload
- FileUpload catches error and preserves all component state
- Follows validation pattern from Category and Food Item forms:
  - Toast notification shows error message (via ErrorHandlerService)
  - Input field gets red border for visual feedback
  - No inline error divs (avoiding duplicate messages)
  - Error state clears when user modifies input

### Implementation Details

**Parent Component (index.tsx):**
```typescript
onUpload={async (file, name) => {
  const newDocument = await handleUpload(file, name);
  if (newDocument) {
    setUploadDialogOpen(false);  // Close on success
  } else {
    throw new Error('Upload failed');  // Signal failure to FileUpload
  }
}}
```

**FileUpload Component:**
```typescript
// State management
const [hasUploadError, setHasUploadError] = useState(false);

// Error handling in upload
try {
  await onUpload(file, filename.trim());
  // Reset on success...
} catch (error) {
  setHasUploadError(true);  // Set error state for visual feedback
  // Error message shown via toast from ErrorHandlerService
}

// Input field with error styling
<Input
  onChange={(e) => {
    handleFilenameChange(e);
    if (hasUploadError) setHasUploadError(false);  // Clear on user input
  }}
  className={(showValidation && validationError) || hasUploadError ? 'border-destructive' : ''}
/>
```

### Pattern Alignment
This implementation follows established patterns:

1. **Dialog Management**: Matches AddCategoryDialog, EditDialog patterns
2. **Error Display**: Follows Category/Food Item validation patterns:
   - Centralized toast notifications
   - Visual feedback via input borders
   - No duplicate inline error messages
3. **State Preservation**: Component maintains all state on error
4. **User Recovery**: Immediate correction without re-entering data

### Benefits
1. **Consistent UX**: Matches all other form validation in the app
2. **State Preservation**: File selection and filename remain intact
3. **Clear Feedback**: Red border indicates error, toast provides details
4. **Immediate Recovery**: User can correct error without repeating steps
5. **No Duplicate Messages**: Single error message via toast system

### Testing Scenarios
1. **Duplicate Name Error Flow**:
   - Upload file with existing name
   - Dialog stays open ✓
   - File remains selected ✓
   - Filename field visible with red border ✓
   - Toast shows specific error message ✓
   - User can modify filename and retry ✓
   
2. **Success Flow**:
   - Upload with unique name
   - Dialog closes automatically ✓
   - Translation dialog opens ✓
   - No error indicators shown ✓

## Recent Update: Upload to Translation Flow Fix (January 2025)

### Problem Statement
After implementing error handling improvements, a regression was introduced where the Upload Dialog remained open after successful document upload and throughout the translation process. This occurred because:
1. The `handleUpload` function didn't return the `newDocument` value
2. The upload dialog's close logic depended on receiving a truthy value
3. Without the return value, the dialog never received the signal to close

### Root Cause
The `handleUpload` callback was missing return statements:
- On success: Should return `newDocument` to signal successful upload
- On failure: Should return `null` to maintain error state

### Solution: Fix Return Values
Added proper return statements to `handleUpload` following established patterns:

```typescript
const handleUpload = useCallback(async (file: File, name: string) => {
  const newDocument = await uploadDocument(file, name);
  
  if (newDocument) {
    showMessage("Document uploaded successfully", "success");
    await handleTranslate({...newDocument, type: 'original'});
    refreshDocuments();
    
    return newDocument; // Signal success to close dialog
  }
  
  return null; // Signal failure to keep dialog open
}, [...]);
```

### Pattern Compliance
This fix works **WITHIN established patterns**:
- Handlers return values to signal success/failure
- Dialog closure controlled by parent component
- Error handling flow remains unchanged
- Consistent with AI Configuration and Shopping List dialogs

### User Experience
1. **Success Flow**: Upload → Dialog closes → Translation dialog opens
2. **Error Flow**: Upload fails → Dialog stays open → User can retry
3. **Translation Completion**: "Done" closes all dialogs properly

## Future Enhancements

### Phase 3: Enhanced Recovery
- Retry only failed segments
- Store partial translations for recovery
- Add retry button for failed translations
- Provide batch recovery options
