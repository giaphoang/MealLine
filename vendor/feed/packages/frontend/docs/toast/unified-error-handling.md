# Unified Error Handling Documentation

## Overview

The BaseApiService has been enhanced with comprehensive error handling to ensure consistent error message parsing and display across all API services. This addresses the issue where backend error messages were not properly displayed to users.

## Problem Resolved

Previously, when document uploads failed due to conflicts (409 status), the backend returned a proper JSON error message like:
```json
{ "error": "A document named 'X' already exists. Please choose a different name." }
```

However, the frontend error handling was not parsing this correctly, resulting in generic error messages like:
```
Upload failed: 409 Conflict
```

## Solution Implemented

### Enhanced BaseApiService Error Parsing

The `parseErrorResponse` method in `BaseApiService` now handles:

1. **Content-Type Detection**: Checks response headers to determine if the response is JSON or plain text
2. **Flexible Error Structure**: Supports multiple backend error response formats:
   - `{ error: "message" }` (string)
   - `{ error: { message: "message" } }` (object)
   - `{ message: "message" }` (fallback)
3. **Non-JSON Response Handling**: Gracefully handles text/HTML error responses
4. **Robust Fallback**: Provides meaningful fallbacks when parsing fails

### Updated Request Method

The main `request` method now uses the enhanced error parsing, ensuring all API calls benefit from improved error handling.

### DocumentApiService Updates

Methods using direct `fetch` calls (upload, download, delete) have been updated to:
- Use the enhanced `parseErrorResponse` method
- Maintain consistent 401 handling for authentication
- Remove redundant error parsing logic

## API Error Response Formats Supported

### Backend Standard Format
```json
{ "error": "Human-readable error message" }
```

### Legacy Format
```json
{ "message": "Human-readable error message" }
```

### Nested Error Format
```json
{ 
  "error": { 
    "message": "Human-readable error message" 
  } 
}
```

## Benefits

1. **Consistent Error Display**: All services now display backend error messages properly
2. **Better User Experience**: Users see meaningful error messages instead of generic HTTP status codes
3. **Maintainable Code**: Centralized error handling reduces duplication
4. **Robust Fallbacks**: System gracefully handles unexpected response formats

## Testing

The error handling can be tested by:
1. Uploading a file with a duplicate name (409 conflict)
2. Making requests with invalid data (400 errors)
3. Testing with network connectivity issues
4. Verifying proper authentication error handling (401)

## Implementation Details

### BaseApiService Changes
- Enhanced `parseErrorResponse` method with content-type detection
- Streamlined `request` method to use centralized error parsing
- Maintained backward compatibility with existing error handling

### DocumentApiService Changes
- Updated `upload`, `download`, and `delete` methods
- Removed duplicate error parsing logic
- Consistent 401 authentication handling

All changes maintain existing API contracts and behavior while improving error message reliability.
