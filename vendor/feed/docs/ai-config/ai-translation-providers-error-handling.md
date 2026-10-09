# AI Translation Providers Error Handling

## Overview

The AI Translation Providers (OpenAI, Anthropic, Google AI) have been refactored to use centralized error handling, ensuring consistent error messaging and following the established architecture pattern used throughout the application.

## Architecture

### Centralized Error Handling Pattern

Following the same pattern established in versions 0.10.86-0.10.94 for frontend components, the backend AI translation providers now implement:

1. **Frontend Error Mapping**: AI provider-specific error mappings in `ErrorHandlerService.errorMessageMap`
2. **Backend Consistency**: All providers use base class `AITranslationService.handleServiceError()` method
3. **ASK Messaging**: Error messages are Actionable, Specific, and Kind
4. **No Duplication**: Removed custom error handling methods to prevent inconsistency

### Error Flow

```
AI Provider Error → Base Class handleServiceError() → Frontend ErrorHandlerService → User Toast
```

## Error Message Mappings

### AI Provider Configuration Errors
- `'OpenAI API configuration required'` → "OpenAI API not configured. Please set up your API key in Tools → AI Configuration."
- `'Anthropic API configuration required'` → "Anthropic API not configured. Please set up your API key in Tools → AI Configuration."
- `'Google AI API configuration required'` → "Google AI API not configured. Please set up your API key in Tools → AI Configuration."

### Authentication & Authorization Errors
- `'Translation service not configured - authentication failed'` → "AI service authentication failed. Please check your API key in Tools → AI Configuration."
- `'Classification service not configured - authentication failed'` → "AI service authentication failed. Please check your API key in Tools → AI Configuration."

### Rate Limiting & Quota Errors
- `'Rate limit exceeded - please try again later'` → "API rate limit reached. Please wait a moment and try again."
- `'Translation limit exceeded'` → "Translation quota exceeded. Please check your usage limits or try again later."

### Service Availability Errors
- `'OpenAI service error - please try again later'` → "OpenAI service is temporarily unavailable. Please try again in a few minutes."
- `'Anthropic service error - please try again later'` → "Anthropic service is temporarily unavailable. Please try again in a few minutes."
- `'Google AI service error - please try again later'` → "Google AI service is temporarily unavailable. Please try again in a few minutes."

### Language & Content Errors
- `'Unsupported language'` → "This language is not supported by the selected AI service. Please choose a different language."
- `'Translation response was truncated due to length'` → "Text is too long for translation. Please try with shorter text or split into sections."
- `'Translation was halted by content filter'` → "Translation blocked by content filter. Please check your text and try again."
- `'Classification was halted by content filter'` → "Classification blocked by content filter. Please check your text and try again."

### Response Format Errors
- `'Invalid response format from translation service'` → "Translation service returned invalid data. Please try again."
- `'Invalid response format from classification service'` → "Classification service returned invalid data. Please try again."

### Operation-Specific Errors
- `'Failed to translate text - unexpected error'` → "Translation failed due to an unexpected error. Please try again."
- `'Failed to translate batch - unexpected error'` → "Batch translation failed due to an unexpected error. Please try again."
- `'Failed to classify segments - unexpected error'` → "Text classification failed due to an unexpected error. Please try again."

### Client Connection Errors
- `'OpenAI client not initialized'` → "OpenAI connection failed. Please check your configuration and try again."
- `'Anthropic client not initialized'` → "Anthropic connection failed. Please check your configuration and try again."
- `'Google client not initialized'` → "Google AI connection failed. Please check your configuration and try again."

## Implementation Details

### Before Refactoring

Each AI provider had custom error handling methods:

**OpenAI Service:**
```typescript
private handleBatchTranslationError(error: any): never { /* custom logic */ }
private handleClassificationError(error: any, request: ClassificationRequest): never { /* custom logic */ }
```

**Anthropic Service:**
```typescript
private handleBatchTranslationError(error: any): never { /* custom logic */ }
private handleClassificationError(error: any, request: ClassificationRequest): never { /* custom logic */ }
```

**Google Service:**
```typescript
// Already used this.handleServiceError() consistently
```

### After Refactoring

All providers now use the base class method consistently:

```typescript
// All providers now use:
catch (error) {
  this.handleServiceError(error, 'translation');
}

catch (error) {
  this.handleServiceError(error, 'batch translation');
}

catch (error) {
  this.handleServiceError(error, 'classification');
}

catch (error) {
  this.handleServiceError(error, 'batch classification');
}
```

### Base Class Implementation

The `AITranslationService.handleServiceError()` method provides consistent error formatting:

```typescript
protected handleServiceError(error: any, operation: string): never {
  if (error.message) {
    throw new Error(`${this.serviceType} ${operation} error: ${error.message}`);
  }
  throw new Error(`${this.serviceType} ${operation} failed with unexpected error`);
}
```

## Benefits

### Consistency
- **Unified Error Messages**: All AI providers now throw consistent error messages
- **Predictable Format**: Error messages follow the same pattern across all services
- **Centralized Mapping**: All error-to-user-message mapping happens in one place

### Maintainability
- **Reduced Code Duplication**: Removed ~150 lines of duplicate error handling code
- **Single Source of Truth**: Error handling logic centralized in base class
- **Easier Updates**: Changes to error handling affect all providers uniformly

### User Experience
- **ASK Messaging**: All error messages are Actionable, Specific, and Kind
- **Helpful Guidance**: Error messages direct users to specific solutions
- **Consistent Tone**: Error messages maintain consistent voice across all AI providers

### Developer Experience
- **Standardized Pattern**: Follows the same pattern used throughout the application
- **Easier Debugging**: Consistent error context provided for troubleshooting
- **Reduced Complexity**: Simplified provider implementations

## Testing Considerations

### Error Scenarios to Test
1. **API Key Validation**: Invalid/missing API keys for each provider
2. **Rate Limiting**: Rate limit responses from each AI service
3. **Service Availability**: 500/503 errors from AI services
4. **Content Filtering**: Content filter blocks from providers
5. **Response Format**: Malformed JSON responses
6. **Network Issues**: Connection failures and timeouts

### Validation Points
1. **Error Message Mapping**: Verify frontend receives expected user messages
2. **Context Preservation**: Ensure error context is properly passed through
3. **No Duplication**: Confirm no duplicate error messages appear
4. **Fallback Behavior**: Test unknown error handling

## Future Enhancements

### Potential Improvements
1. **Enhanced Context**: Include more specific operation context in error messages
2. **Retry Logic**: Centralized retry logic in base class
3. **Error Analytics**: Track common error patterns for system improvement
4. **Graceful Degradation**: Fallback to alternative providers on errors

### Monitoring
1. **Error Frequency**: Track most common error types per provider
2. **User Impact**: Monitor error rates and user experience metrics
3. **Service Health**: Provider-specific availability monitoring

## Migration Notes

### Breaking Changes
- **None**: This refactoring maintains the same public API
- **Error Messages**: Some error message text may have changed slightly
- **Error Codes**: Error handling now goes through centralized mapping

### Backwards Compatibility
- **API Compatibility**: All public methods maintain same signatures
- **Error Handling**: Errors still bubble up to frontend as before
- **Functionality**: All translation and classification features unchanged

## Related Documentation

- [Frontend Error Handling](../frontend-services/message-system.md)
- [AI Configuration Overview](./ai-configuration-section-overview.md)
- [Translation System](../translation-system/technical-decisions.md)

This centralized error handling implementation completes the application-wide error handling standardization initiative, ensuring AI translation providers follow the same ASK (Actionable, Specific, Kind) messaging principles established throughout the rest of the system.
