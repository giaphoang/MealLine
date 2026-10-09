# Error Messages Technical Guide

## Overview

This document outlines the approach to error messages throughout the application, following the ASK model (Actionable, Specific, Kind). This model ensures all error messages provide a positive user experience while effectively communicating when things go wrong.

## ASK Model Principles

### Actionable
- Every error message should tell users what they can do to resolve the issue
- Include clear steps to fix the problem when possible
- For system errors, provide appropriate escalation paths (refresh, try later, contact)

### Specific
- Clearly explain what went wrong in plain language
- Avoid technical jargon and error codes in user-facing messages
- Include just enough technical detail to identify the source of the problem

### Kind
- Use a friendly, helpful tone
- Avoid blaming the user
- Express empathy for the user's situation

## Implementation

### Error Response Structure

All error responses follow a standard JSON format:

```json
{
  "error": {
    "message": "The user-friendly error message",
    "timestamp": "ISO timestamp",
    "code": "INTERNAL_CODE" // Optional, primarily for logging
  }
}
```

### Global Error Handling

The application uses a multi-layered approach to error handling:

1. **Route-specific handling**: Customized error messages for known business logic errors
2. **Service-level handling**: Categorization and friendly messaging for expected technical errors
3. **Global middleware**: Catch-all for unexpected errors, providing appropriate fallbacks

#### Middleware Configuration

The global error handler (`/packages/backend/src/middleware/error-handler.ts`) handles:
- HTTP status code mapping
- Prisma database errors
- File upload/validation errors
- Generic fallback messages

### Frontend Error Presentation

Error messages are displayed through:
1. **Toast notifications**: For non-blocking errors
2. **Error banners**: For form validation or submission errors
3. **Dialog boxes**: For critical errors requiring acknowledgment

## System Status Validation

### Startup vs Error Detection

The SystemStatusService distinguishes between legitimate startup conditions and actual system errors:

- **Startup Condition**: Foundational data exists (categories, food items, languages) but usage data is empty
- **Error Condition**: Foundational data is missing or inaccessible
- **Operational State**: Both foundational and usage data exist

### Implementation Pattern

Usage hooks check startup status before displaying errors:

```typescript
try {
  return await service.getData();
} catch (err) {
  const startupStatus = await systemStatusService.getStartupStatus();
  if (startupStatus.isStartupCondition) {
    return null; // No error displayed
  }
  showError('Failed to load data');
  throw err;
}
```

### UI States

- **Startup State**: "Usage statistics will appear after AI operations begin"
- **Error State**: "Failed to load usage data"
- **Operational State**: Normal data display

## Error Categories and Examples

### Authentication Errors
- "Please log in to access this feature. If you need assistance, contact the administrator at github.com/MattGeiger"
- "The username or password you entered is incorrect. Please try again or contact the administrator at github.com/MattGeiger"

### Validation Errors
- "Please enter at least 3 characters for your custom text."
- "Please upload a DOCX file. Other file formats are not supported at this time."

### Network/System Errors
- "We couldn't retrieve your translations. Please refresh your browser or try again later."
- "We couldn't save your changes to this translation. Please try again or contact support at github.com/MattGeiger"

### Startup Conditions
- "Usage statistics will appear after AI operations begin. Configure AI services in settings to start tracking metrics."
- "System initialized with base data. Usage statistics will appear after AI operations begin."

### Conflict Errors
- "This custom text is already saved. Please use a different text."
- "A document with this name already exists. Please choose a different name."

### Document Management Errors
- **Upload Operations**: "Please upload a DOCX file. Other file formats are not supported at this time."
- **File Size Limits**: "Please upload a smaller file. The maximum size allowed is 5MB."
- **Document Access**: "The requested document could not be found. It may have been deleted or moved."
- **Content Validation**: "This document has no content available. The file may be missing or corrupted."
- **Translation Management**: "The requested translation could not be found. It may have been deleted."
- **Language Validation**: "Please use the full language name instead of a language code."
- **File Integrity**: "File integrity issue detected. The file may be missing or corrupted."
- **Processing Issues**: "No translatable text found in document. The document may be empty or contain only non-text elements."

### Resource Not Found
- "The requested item could not be found. It may have been deleted or moved."

### Translation Retries
- "Failed to retry translation for '[first 15 characters of original text]...'. Please check your AI Configuration and try again"

## Contact Information

For unresolvable errors, users are directed to the project maintainer at github.com/MattGeiger.

## Testing Error Messages

When implementing new features, ensure that error conditions:
1. Are tested via unit and integration tests
2. Return user-friendly error messages following the ASK model
3. Include appropriate error logging for debugging
4. Provide recovery paths when possible

## Maintenance Guidelines

When adding new error messages:
1. Follow the ASK model principles
2. Avoid exposing internal details or stack traces
3. Include appropriate logging for troubleshooting
4. Consider both expected and unexpected error cases
5. Include contact information for critical errors
