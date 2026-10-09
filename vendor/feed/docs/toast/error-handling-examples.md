# Error Handling Implementation Examples

This document provides code examples showing how to implement user-friendly error messages throughout the application. These examples follow the ASK (Actionable, Specific, Kind) model.

## Backend Error Handlers

### Global Error Handler

The global error handler middleware serves as a safety net for all uncaught errors:

```typescript
// From /packages/backend/src/middleware/error-handler.ts
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error details for debugging
  logError('Request failed', {
    name: err.name,
    message: err.message,
    code: err.code,
    path: req.path,
    method: req.method
  });

  // Format timestamp
  const timestamp = new Date().toISOString();

  // Get actionable friendly message based on status code
  let friendlyMessage = err.message || 'Internal Server Error';
  
  // Map generic HTTP errors to user-friendly messages
  if (statusCode === 500 && (!err.message || err.message === 'Internal Server Error')) {
    friendlyMessage = 'Something went wrong on our end. Please try again later or contact support at github.com/MattGeiger';
  } else if (statusCode === 404 && (!err.message || err.message === 'Not Found')) {
    friendlyMessage = 'The requested resource could not be found. It may have been moved or deleted.';
  }
  
  // Format error response
  res.status(statusCode).json({
    error: {
      message: friendlyMessage,
      timestamp,
      code: err.code || 'INTERNAL_ERROR'
    }
  });
};
```

### Route-Specific Error Handling

Example from a route handler:

```typescript
// From /packages/backend/src/routes/custom-texts.ts
router.post('/', async (req, res) => {
  const { text, isTitle = true } = req.body;

  // Input validation with friendly message
  if (!text || !validateMinLength(text, 3)) {
    return res.status(400).json({ 
      error: 'Please enter at least 3 characters for your custom text.' 
    });
  }

  try {
    // Check for conflicts with friendly error message
    const existingText = await prisma.savedCustomText.findFirst({
      where: { text: text.trim() },
    });

    if (existingText) {
      return res.status(409).json({ 
        error: 'This custom text is already saved. Please use a different text.' 
      });
    }

    // Create the resource...
    
  } catch (error) {
    console.error('Error creating custom text:', error);
    res.status(500).json({ 
      error: 'We couldn\'t save your custom text. Please try again later or contact support at github.com/MattGeiger' 
    });
  }
});
```

## Frontend Error Handling

### Base API Service

The BaseApiService provides consistent error handling for all API calls:

```typescript
// From /packages/frontend/src/services/base/index.ts
protected getUserFriendlyErrorMessage(message: string): string {
  // Common error messages mapped to user-friendly versions
  const errorMap: Record<string, string> = {
    'Network Error': 'Unable to connect to the server. Please check your internet connection and try again.',
    'Failed to fetch': 'Unable to reach the server. Please check your connection and try again.',
    'Authentication required': 'Your session has expired. Please log in again to continue.',
    'Request failed with status code 404': 'The requested resource was not found. Please refresh the page and try again.',
    // Other mappings...
  };

  // Check for exact matches
  if (errorMap[message]) {
    return errorMap[message];
  }

  // Check for partial matches
  for (const [key, friendlyMessage] of Object.entries(errorMap)) {
    if (message.includes(key)) {
      return friendlyMessage;
    }
  }

  // Add contact info for critical errors
  if (message.toLowerCase().includes('error') || message.toLowerCase().includes('fail')) {
    return `${message}. If this problem persists, please contact the administrator at github.com/MattGeiger`;
  }

  return message;
}
```

### Error Response in Components

Example of error handling in a React component:

```typescript
// Example component error handling
const handleSubmit = async (values) => {
  setIsLoading(true);
  setError(null);
  
  try {
    await api.createItem(values);
    toast({
      title: "Success",
      description: "Your item was created successfully",
    });
    onClose();
  } catch (error) {
    // Get friendly error message
    const message = error.response?.data?.error || 
      "We couldn't create your item. Please try again.";
    
    setError(message);
    console.error('Create error:', error);
  } finally {
    setIsLoading(false);
  }
};
```

## System Status Validation

New system status validation prevents incorrect error messages during startup conditions:

```typescript
// Backend service for detecting startup vs error conditions
class SystemStatusService {
  static async getStartupStatus(): Promise<SystemStartupStatus> {
    const [categoriesCount, foodItemsCount, languagesCount] = await Promise.all([
      prisma.category.count(),
      prisma.foodItem.count(),
      prisma.language.count()
    ]);
    
    const hasFoundationalData = languagesCount > 0 && (categoriesCount > 0 || foodItemsCount > 0);
    const hasUsageData = await this.hasMinimumUsageData();
    const isStartupCondition = hasFoundationalData && !hasUsageData;
    
    return { isStartupCondition, hasFoundationalData, hasUsageData };
  }
}
```

### Frontend Hook Integration

```typescript
// Modified hook with startup validation
export function useTokenMetrics() {
  const { data, error } = useQuery({
    queryFn: async () => {
      try {
        return await tokenMetricsService.getTokenMetrics();
      } catch (err) {
        // Check startup condition before showing error
        const startupStatus = await systemStatusService.getStartupStatus();
        if (startupStatus.isStartupCondition) {
          return null; // No error shown for startup condition
        }
        throw err;
      }
    }
  });
}
```

### UI State Handling

```typescript
// Component shows appropriate message based on data availability
if (!multiServiceData || multiServiceData.configurations.length === 0) {
  return (
    <Alert>
      <AlertTitle>Getting Started</AlertTitle>
      <AlertDescription>
        Usage statistics will appear after AI operations begin. Configure AI services in settings to start tracking metrics.
      </AlertDescription>
    </Alert>
  );
}
```

## Error Message Categories

Here are examples of error messages for different situations:

### Authentication
- ✅ "Please log in to access this feature."
- ❌ "Authentication required (401)"

### Validation
- ✅ "Please enter a whole number for the limit."
- ❌ "Invalid input type"

### Network/System
- ✅ "We couldn't connect to the server. Please check your internet connection and try again."
- ❌ "Network error"

### Startup Conditions
- ✅ "Usage statistics will appear after AI operations begin."
- ❌ "Failed to load usage data"

### Resource Not Found
- ✅ "We couldn't find this translation. It may have been deleted or never existed."
- ❌ "Resource not found (404)"

### Conflict
- ✅ "A document with this name already exists. Please choose a different name."
- ❌ "Conflict error (409)"

### Translation Retries
- ✅ "Failed to retry translation for 'Please choose 1...'. Please check your AI Configuration and try again"
- ❌ "Failed to retry translation 316"

## Testing Error Messages

When implementing unit tests, validate that error messages meet the ASK criteria:

```typescript
// Example test for error handling
test('returns user-friendly error for duplicate item', async () => {
  // Setup and API mock...
  
  const response = await request(app)
    .post('/api/items')
    .send({ name: 'Duplicate Item' });
    
  expect(response.status).toBe(409);
  expect(response.body.error).toContain('already exists');
  expect(response.body.error).toContain('Please choose a different name');
});
```
