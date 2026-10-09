# Unified Error Handling Architecture

## Core Principles

Error messages follow the ASK principle:
- **Actionable**: Tell users what to do
- **Specific**: Identify the exact problem  
- **Kind**: Use supportive language

## Central Message System

All error and status messages flow through the centralized Toast system located at `packages/frontend/src/contexts/ToastContext.tsx`.

### Message Types

```typescript
interface ToastMessage {
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}
```

## Error States vs System States

### True Error Conditions
- Database connection failures
- API endpoint unavailability
- Data corruption
- Authentication failures
- Network timeouts

### System Startup States
Conditions that indicate normal operation but empty datasets:
- Empty usage statistics with valid configurations present
- Fresh database with no user-generated content
- Missing cache data on first run

### Detection Logic

Startup conditions are identified by:
```typescript
const isStartupCondition = 
  hasValidLanguages && 
  hasValidCategories && 
  hasValidFoodItems && 
  hasValidConfigurations &&
  !hasUsageData;
```

## Error Message Patterns

### Avoid These Patterns
```typescript
// WRONG - Vague and unhelpful
"An error occurred"
"Something went wrong"  
"Failed to load data"
```

### Use These Patterns
```typescript
// CORRECT - Specific and actionable
"Unable to connect to database. Check your connection and try again."
"Food item name must be between 3-36 characters. Please shorten your entry."
"Category 'Dairy' cannot be deleted because 5 items are assigned. Reassign or delete the items first."
```

## Implementation Guidelines

### Backend Error Responses
```typescript
// Custom error classes with statusCode
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.statusCode = 400;
  }
}
```

### Frontend Error Handling
```typescript
// Use centralized message hook
const { showError, showSuccess } = useMessage();

try {
  await apiCall();
  showSuccess('Operation completed successfully');
} catch (error) {
  showError(error.message || 'Operation failed');
}
```

### Validation vs. Warning (ASK-aligned)

For inputs like API keys, prefer non-blocking warnings when the value looks unusual but not definitively invalid:

```typescript
const { showMessage } = useMessage()
const result = validateApiKeyForService(apiKey, serviceType)
if (result.warning) {
  showMessage(result.warning, 'warning')
}
```

Only block on clearly invalid states (e.g., empty required field). This keeps users unblocked while still guiding them to correct issues.

### Telling a user to report something

One sentence does this, written once per package:
`SUPPORT_CONTACT_SENTENCE` in `packages/backend/src/lib/support.ts` and its
byte-identical mirror in `packages/frontend/src/lib/support.ts`. Never write
the destination inline.

```typescript
throw createRouteError(`Unable to save your file. Please try again. ${SUPPORT_CONTACT_SENTENCE}`, 500);
```

Two things about it are load-bearing:

- **It carries a full `https://` URL.** The toast renderer turns real URLs
  into links (`services/message/linkify.ts`) and can do nothing with a bare
  host. The messages that used to say `contact support at github.com/MattGeiger`
  were unclickable, and pointed at a personal profile rather than the project's
  issue tracker.
- **It says a free GitHub account is needed to post.** The destination is not a
  contact form. A reader without an account can read the issues and cannot open
  one, and learning that after following the link is worse than being told
  before.

The URL stays visible as text rather than hiding behind link text, because the
same message is also rendered *without* linkification — inline in a dialog row,
in server logs, in a PDF. "Report it at" followed by nothing is worse than a
long URL.

Linkification happens in `messageService` only, on the rendered description.
The de-duplication key and the length-aware duration still use the plain
string, so linking changes what is shown and nothing about how a toast
behaves. **Known limit:** toast dismissal is a hard timer that hover does not
pause (ISSUES.md #44), capped at 12s — a user gets that long to click.

### Never answer 502 or 504

Production is served through Cloudflare Tunnel, and Cloudflare replaces an
origin **502** or **504** with its own branded HTML error page — the JSON body
the route composed never reaches the browser. A dependency failure that FEED
itself survives must answer **503**, which Cloudflare passes through
untouched, and which is the honest status anyway: FEED is up, the thing it
depends on is not. See ISSUES.md #80.

### An explicit status code is the author's signature

`errorHandler` forwards `err.message` to the client only when the error
carries an explicit `statusCode`. That is the whole test — **not** the 4xx
range. A route that sets `statusCode = 503` and writes a sentence has made a
deliberate choice, and that sentence must survive. Errors that arrive with no
`statusCode` (Prisma faults, `TypeError`s, driver errors) are logged in full
and replaced with `INTERNAL_FAILURE_MESSAGE`.

When testing a route's error copy, mount the **real** `errorHandler`. A stub
that forwards `error.message` verbatim proves nothing about what ships.

### Only the application writes prose

A failure body is trustworthy only when it came from a layer that writes
sentences. Every FEED route answers a failure with
`{ error: { message, code } }` (`packages/backend/src/middleware/error-handler.ts`),
so a **non-JSON error body did not come from FEED** — it came from Cloudflare
Tunnel or the Nginx container, and it is an HTML document, not a message.

`BaseApiService` enforces this. A non-JSON body is logged (development only)
and discarded; the message comes from `httpStatusMessage(status, statusText)`
in `packages/frontend/src/services/base/index.ts`, which is the single place
that turns a bare status into ASK copy. Do not reintroduce
`await response.text()` as an error message: that is what put a full
Cloudflare 502 page onto a dialog row in production (ISSUES.md #80).

### Rendering an error somewhere other than a toast

`ErrorHandlerService.handleError` raises a toast. When a surface reports an
error **inline** — a per-row status in a batch dialog, an empty-state panel —
call `ErrorHandlerService.toUserMessage(error)` for the same sentence without
the toast:

```typescript
updateLanguageState(language, {
  status: 'failed',
  error: ErrorHandlerService.toUserMessage(error),
});
```

Reading `error.message` directly walks past `isUserPresentableMessage` and
every other screen below it.

### Service Layer Error Propagation
```typescript
// Services should throw descriptive errors
export class CategoryService {
  async deleteCategory(id: number) {
    try {
      const result = await api.delete(`/categories/${id}`);
      return result;
    } catch (error) {
      if (error.status === 409) {
        throw new Error('Category cannot be deleted because food items are still assigned');
      }
      throw new Error('Failed to delete category. Please try again.');
    }
  }
}
```

## Dashboard Specific Handling

Dashboard metrics distinguish between:

### Missing Usage Data (Normal)
- Display zero values
- Show "No usage data yet" states
- Provide helpful context about new installations

### System Failures (Error)
- API connection issues
- Database unavailability  
- Configuration corruption

## Testing Error States

Error handling tests should verify:
- Correct error message content
- Appropriate error codes
- Toast message appearance
- User-facing corrective actions
- Recovery mechanisms
