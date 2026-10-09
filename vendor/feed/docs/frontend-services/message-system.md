# Message System

## Overview
The message system provides a centralized way to handle status messages, notifications, and user feedback throughout the application. It supports various message types with configurable durations and styling.

## Type System

### Message Types
The system supports four primary message types:
- `success`: For successful operations
- `error`: For error notifications
- `info`: For general information
- `warning`: For warning messages

### Configuration Options
Messages can be configured with:
```typescript
interface MessageOptions {
  duration?: number;      // Display duration in milliseconds
  action?: {             // Optional action button
    label: string;
    onClick: () => void;
  };
  persist?: boolean;     // Whether message should persist until dismissed
}
```

### Default Configurations

#### Duration Defaults
- Success: 4000ms
- Error: 6000ms
- Info: 4000ms
- Warning: 5000ms

#### Visual Styling
Messages use a consistent styling system:
- Success: Default variant
- Error: Destructive variant
- Info: Default variant
- Warning: Default variant

## Usage Examples

### Basic Usage
```typescript
import { useMessage } from '@/hooks/message';

function MyComponent() {
  const message = useMessage();
  
  const handleSuccess = () => {
    message.show('Operation completed', 'success');
  };
}
```

### With Action Button
```typescript
message.show('Changes saved', 'success', {
  action: {
    label: 'Undo',
    onClick: handleUndo
  }
});
```

### Persistent Error
```typescript
message.show('Connection lost', 'error', {
  persist: true
});
```

## Best Practices

1. Message Duration
   - Use default durations when possible
   - Increase duration for complex messages
   - Use persist for critical errors

2. Message Content
   - Keep messages concise and clear
   - Include specific details when helpful
   - Use consistent terminology

3. Action Buttons
   - Keep labels short and clear
   - Use for immediate, relevant actions
   - Avoid multiple actions per message

## Centralized Error Handling

To ensure consistency and provide a better user experience, a centralized `ErrorHandlerService` has been implemented. This service is responsible for catching all API errors and displaying standardized, user-friendly toast notifications.

### `ErrorHandlerService`

The `ErrorHandlerService` provides a `handleError` method that takes an error object and an optional context string. It intelligently parses the error to extract detailed messages from API responses and maps known technical errors to more actionable and kind messages for the user.

**Example Usage:**

```typescript
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';

async function someApiCall() {
  try {
    // Make API call
  } catch (error) {
    ErrorHandlerService.handleError(error, 'MyComponent');
  }
}
```

The service also includes a `withErrorHandling` wrapper to simplify API calls:

```typescript
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';

async function anotherApiCall() {
  return await ErrorHandlerService.withErrorHandling(
    () => MyApiService.getData(),
    'MyComponent'
  );
}
```

### Best Practices for Error Handling

1.  **Use the Centralized Service:** Always use the `ErrorHandlerService` for handling API errors to maintain consistency.
2.  **Provide Context:** When calling `handleError` or `withErrorHandling`, provide a context string (e.g., the component or service name) to aid in debugging.
3.  **Avoid Custom Messages:** Do not create one-off error messages in components. If a new error case is needed, add it to the `errorMessageMap` in the `ErrorHandlerService`.

## Testing
When testing components that use the message system:

1. Verify Message Display
   ```typescript
   it('shows success message on completion', () => {
     // Test implementation
   });
   ```

2. Test Action Handlers
   ```typescript
   it('handles action button click', () => {
     // Test implementation
   });
   ```

3. Test Duration Behavior
   ```typescript
   it('respects custom duration', () => {
     // Test implementation
   });
   ```
