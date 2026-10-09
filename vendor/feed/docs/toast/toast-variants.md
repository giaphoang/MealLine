# Toast Variants

## Available Variants

### `default`
- Background: White (light) / Dark slate (dark)
- Text: Dark slate (light) / Light slate (dark)
- Border: Default border color
- Usage: Success, info messages

### `destructive`
- Background: Red
- Text: White
- Border: Red
- Usage: Error messages

### `warning`
- Background: Light orange (light) / Dark orange (dark)
- Text: Orange
- Border: Orange
- Usage: Warning messages, API key validation alerts

## CSS Variables

Warning variant uses status color variables from `index.css`:

```css
--status-warning-bg: 38 100% 92%;    /* Light mode background */
--status-warning-border: 38 92% 50%; /* Border color */
--status-warning-text: 38 100% 50%;  /* Text color */

/* Dark mode variants */
--status-warning-bg: 38 80% 8%;      /* Dark mode background */
--status-warning-border: 24.6 95% 53.1%; /* Dark border */
--status-warning-text: 38 100% 50%;  /* Dark text */
```

## Implementation

```typescript
// Service layer usage
showMessage('Warning text', 'warning')

// Direct toast usage
toast({
  title: 'Warning',
  description: 'Message content',
  variant: 'warning'
})
```

### API Key Soft Validation Pattern

Use the centralized message system to display a non-blocking warning when an API key format appears unusual for the selected provider:

```typescript
// In a blur handler (multi-step dialog)
const result = validateApiKeyForService(apiKey, serviceType)
if (result.warning) {
  showMessage(result.warning, 'warning')
}
```

This pattern follows the ASK principle and does not block the user from proceeding.

## Message Type Mappings

- `success` → `default`
- `error` → `destructive`
- `info` → `default`
- `warning` → `warning`
