# Frontend Testing Documentation

## Important Notice (January 27, 2025)
All tests have been archived to reduce technical debt. The complete test suite can be found in:
- `/archived_tests/packages/frontend/` (preserved structure)
- `test-archive` branch (original locations)

Refer to `/archived_tests/README.md` for restoration instructions.

The following documentation is preserved for historical reference.


## Test Organization

### Directory Structure
```
__tests__/
  components/       # Component-specific tests
    global-limit/  # Global limit setting tests
    categories/    # Category management tests
    food-items/    # Food item management tests
  hooks/           # Custom hook tests
  services/        # Service layer tests
  shared/         # Shared test utilities
test/
  setup/          # Test setup and polyfills
    radix-ui.ts   # Radix UI test configuration
```

### Test Types

1. **Component Tests**
- Rendering behavior
- User interactions
- State management
- Error handling
- Loading states

2. **Hook Tests**
- State management
- Side effects
- Error handling
- Async operations

3. **Integration Tests**
- Component interactions
- Service integration
- Toast notifications
- Form submission flows

## Test Guidelines

### Component Testing
- Use appropriate setup files (e.g. import '@/test/setup/radix-ui' for UI components)
- Use userEvent over fireEvent for better interaction testing
- Always use waitFor with async operations
- Test loading states with waitFor
- Mock external dependencies (useMessage, fetch etc.)
- Test error scenarios exhaustively
- Validate toast message content and type
- Use proper role-based queries
- Test accessibility where applicable

### Async Testing
- Use proper waitFor patterns
- Test loading indicators
- Verify state transitions
- Test optimistic updates

### Toast Testing and Integration

##### Latest Toast Testing Patterns (Added 2024-01-26)

When testing toast notifications in components, follow these updated patterns:

```typescript
// 1. Mock Setup - Proper Hoisting
vi.mock('@/services/message', () => ({
  messageService: {
    show: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    retryableError: vi.fn(),
    systemError: vi.fn()
  }
}))

// Import after mock definition
import { messageService } from '@/services/message'

// 2. Test Structure
describe('Component Toast Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows success toast with correct message', async () => {
    const user = userEvent.setup()
    renderWithProviders(<YourComponent />)

    // Trigger action
    await user.click(screen.getByRole('button'))

    // Verify message
    await waitFor(() => {
      expect(messageService.show).toHaveBeenCalledWith(
        'Expected message',
        'success',
        undefined
      )
    })
  })
})
```

Key Updates:
- Mock definition must come before any imports
- Direct messageService import after mock setup
- Verify exact message text and type
- Don't expect options object if not used
- Use proper async/await patterns

### AlertDialog Testing
```typescript
describe('AlertDialog Testing', () => {
  it('handles confirmation flow', async () => {
    const user = userEvent.setup()
    renderWithProviders(<YourComponent />)

    // Open the dialog via trigger action
    await user.click(screen.getByRole('button', { name: /delete/i }))

    // Find AlertDialog using document query (Radix UI implementation detail)
    await waitFor(() => {
      const dialog = document.querySelector('[role="alertdialog"]')
      expect(dialog).toBeInTheDocument()
      return dialog
    })

    // Find and click confirm within AlertDialog context
    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement
    const confirmButton = within(dialog).getByRole('button', { name: /delete/i })
    await user.click(confirmButton)

    // Verify action performed
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled()
    })
  })

  it('maintains state on cancel', async () => {
    const user = userEvent.setup()
    renderWithProviders(<YourComponent />)

    // Open dialog
    await user.click(screen.getByRole('button', { name: /delete/i }))

    // Find and click cancel
    await waitFor(() => {
      const dialog = document.querySelector('[role="alertdialog"]')
      expect(dialog).toBeInTheDocument()
      const cancelButton = within(dialog as HTMLElement).getByRole('button', { name: /cancel/i })
      return user.click(cancelButton)
    })

    // Verify state maintained
    expect(someState).toBe(expectedValue)
  })
})
```

Key Points:
- Use document.querySelector for AlertDialog role
- Always wrap dialog interactions in waitFor
- Use within() for button interactions
- Test both confirm and cancel flows
- Verify state persistence
- Handle loading states appropriately#### Testing Toast Integration

```typescript
// Render helper for components that use toast
const renderWithToast = (ui: React.ReactElement) => {
  return render(
    <ToastProvider>
      {ui}
      <ToastViewport />
    </ToastProvider>
  )
}

// Testing strategy for finding toast content
describe('Toast Integration', () => {
  it('verifies toast content', async () => {
    renderWithToast(<YourComponent />)

    // Trigger toast
    await userEvent.click(screen.getByRole('button'))
    
    // Find notification region and list
    const region = await screen.findByRole('region', { name: /notifications/i })
    const list = within(region).getByRole('list')
    
    // Verify toast content
    const toast = within(list).getByText('Expected message')
    expect(toast).toBeInTheDocument()
    
    // Verify styling variants
    expect(toast.closest('[data-variant]')).toHaveAttribute('data-variant', 'destructive')
  })
})
```

Key testing points:
- Use `renderWithToast` helper to ensure proper provider setup
- Find notification region by role and name
- Use `within()` to navigate toast hierarchy
- Find toast content within the list
- Use closest() to find toast root for variant checking
- Consider waiting for animations if needed

### Controlled Component Testing
```typescript
describe('Controlled Input Testing', () => {
  it('handles input value changes', async () => {
    const user = userEvent.setup()
    renderWithProviders(<YourComponent />)

    // Find input
    const input = screen.getByPlaceholderText('placeholder text') as HTMLInputElement
    expect(input).toBeInTheDocument()

    // Use fireEvent for controlled inputs
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'New Value' } })
    fireEvent.blur(input)

    // Wait for state updates
    await waitFor(() => {
      expect(input.value).toBe('New Value')
    })

    // Submit form
    const submitButton = screen.getByRole('button', { name: /submit/i })
    await user.click(submitButton)

    // Verify submission
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'New Value' })
      )
    })
  })
})
```

Key Points:
- Use fireEvent for direct React controlled input manipulation
- Focus before change, blur after for proper event sequence
- Wait for state updates before assertions
- Verify final state and form submissions
- Handle validation flow properly

#### Architecture Overview
```
Component Layer (e.g., CategoryManagement)
    ↓ (uses)
Hook Layer (useMessage)
    - Exposes showMessage, showSuccess, showError, etc.
    - Memoizes message functions
    ↓ (calls)
Service Layer (messageService)
    - Handles message display logic
    - Manages message duration
    - Controls message persistence
    ↓ (uses)
UI Layer (Radix UI Toast)
    - ToastProvider context
    - Toast viewport management
    - Toast primitive components
```

#### Message Types and Options
```typescript
type MessageType = 'success' | 'error' | 'info' | 'warning'

interface MessageOptions {
  duration?: number      // Display duration in ms
  persist?: boolean      // Keep until dismissed
  action?: {
    label: string        // Action button text
    onClick: () => void  // Action callback
  }
}

// Default durations per type
const DEFAULT_DURATIONS = {
  success: 4000,
  error: 6000,
  info: 4000,
  warning: 5000
}
```

#### Testing Strategy

1. **Test Setup and Utilities**
```typescript
// Mock factory for message service
const createMessageServiceMock = () => ({
  show: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
})

// Mock factory for useMessage hook
const createUseMessageMock = (service: ReturnType<typeof createMessageServiceMock>) => {
  return {
    showMessage: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    showWarning: vi.fn(),
  }
}

// Enhanced render utility
const renderWithToast = (ui: React.ReactElement) => {
  return render(
    <ToastProvider>
      {ui}
      <ToastViewport />
    </ToastProvider>
  )
}
```

2. **Mock Implementation**
   - Define reusable mock factories
   - Use typed mock implementations
   - Maintain consistent mock interfaces
   - Create test-specific utilities

3. **Test Organization**

```typescript
describe('Toast Integration', () => {
  // Mock initialization
  const messageService = createMessageServiceMock()
  const useMessageHook = createUseMessageMock(messageService)

  // Test setup
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Component test with mocks
  it('shows success message on completion', async () => {
    const { getByRole } = renderWithToast(<TestComponent />)
    
    // Trigger action
    await userEvent.click(getByRole('button'))
    
    // Verify message flow
    expect(useMessageHook.showSuccess).toHaveBeenCalledWith(
      'Operation completed',
      expect.any(Object)
    )
  })

  // Error handling test
  it('shows error message on failure', async () => {
    // Setup error condition
    someService.mockRejectedValueOnce(new Error('Failed'))
    
    const { getByRole } = renderWithToast(<TestComponent />)
    
    // Trigger action
    await userEvent.click(getByRole('button'))
    
    // Verify error handling
    expect(useMessageHook.showError).toHaveBeenCalledWith(
      'Failed',
      expect.any(Object)
    )
  })
})

4. **Layer-Specific Testing Strategy**

```typescript
// Service Layer Tests
describe('messageService', () => {
  let service: MessageService;
  
  beforeEach(() => {
    vi.clearAllMocks();
    service = createMessageService();
  });

  // Basic functionality
  it('formats and displays messages correctly', () => {
    service.show('Test message', 'success');
    
    expect(mockToast).toHaveBeenCalledWith({
      title: undefined,
      description: 'Test message',
      variant: 'default',
      duration: 4000
    });
  });

  // Duration handling
  it('respects custom duration settings', () => {
    service.show('Test', 'success', { duration: 5000 });
    
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 5000 })
    );
  });

  // Action buttons
  it('handles action buttons correctly', () => {
    const onAction = vi.fn();
    service.show('Test', 'info', {
      action: { label: 'Click', onClick: onAction }
    });
    
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.any(Object)
      })
    );
  });
});

// Hook Layer Tests
describe('useMessage', () => {
  // Basic functionality
  it('provides message functions', () => {
    const { result } = renderHook(() => useMessage());
    expect(result.current.showMessage).toBeDefined();
    expect(result.current.showSuccess).toBeDefined();
    expect(result.current.showError).toBeDefined();
  });

  // Memoization
  it('memoizes message functions', () => {
    const { result, rerender } = renderHook(() => useMessage());
    const firstShowMessage = result.current.showMessage;
    
    rerender();
    expect(result.current.showMessage).toBe(firstShowMessage);
  });

  // Message type handling
  it('uses correct message type for each function', () => {
    const { result } = renderHook(() => useMessage());
    
    result.current.showSuccess('Success test');
    expect(mockMessageService.success).toHaveBeenCalled();
    
    result.current.showError('Error test');
    expect(mockMessageService.error).toHaveBeenCalled();
  });
});

// Component Integration Tests
describe('ComponentWithToast', () => {
  // Success path
  it('shows success toast on completion', async () => {
    const mockShowSuccess = vi.fn();
    vi.mocked(useMessage).mockReturnValue({
      showSuccess: mockShowSuccess
    } as any);

    const { getByRole } = renderWithToast(<ComponentWithToast />);
    await userEvent.click(getByRole('button'));
    
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Operation completed successfully'
    );
  });

  // Error path
  it('shows error toast on failure', async () => {
    const mockShowError = vi.fn();
    vi.mocked(useMessage).mockReturnValue({
      showError: mockShowError
    } as any);

    // Setup error condition
    mockApiCall.mockRejectedValueOnce(new Error('API Error'));

    const { getByRole } = renderWithToast(<ComponentWithToast />);
    await userEvent.click(getByRole('button'));
    
    expect(mockShowError).toHaveBeenCalledWith(
      'API Error'
    );
  });

  // Loading state
  it('prevents multiple submissions while loading', async () => {
    const mockShowMessage = vi.fn();
    vi.mocked(useMessage).mockReturnValue({
      showMessage: mockShowMessage
    } as any);

    const { getByRole } = renderWithToast(<ComponentWithToast />);
    const button = getByRole('button');
    
    await userEvent.click(button);
    expect(button).toBeDisabled();
    
    await userEvent.click(button);
    expect(mockShowMessage).toHaveBeenCalledTimes(1);
  });
});
```

5. **Verification Patterns**
   - Check message content and options
   - Verify toast configuration
   - Validate user interaction flow
   - Test edge cases and timing

#### Common Challenges & Solutions

1. **Hoisting Issues**
```typescript
// BAD - Will cause hoisting issues
const mockShow = vi.fn()
vi.mock('./messageService', () => ({
  show: mockShow
}))

// GOOD - Use factory function
vi.mock('./messageService', () => {
  return {
    messageService: {
      show: vi.fn(),
      success: vi.fn()
    }
  }
})
```

2. **Circular Dependencies**
```typescript
// BAD - Creates circular dependency
vi.mock('./useMessage', () => {
  const { messageService } = require('./messageService')
  return {
    useMessage: () => ({
      showMessage: messageService.show
    })
  }
})

// GOOD - Break dependency chain
const mockShowMessage = vi.fn()
vi.mock('./useMessage', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage
  })
}))
```

3. **Layer Testing**
```typescript
// Service Layer - Test in isolation
describe('messageService', () => {
  it('formats messages correctly', () => {
    const service = createMessageService()
    service.show('Test')
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Test'
      })
    )
  })
})

// Hook Layer - Test with mocked service
describe('useMessage', () => {
  it('provides message functions', () => {
    const { result } = renderHook(() => useMessage())
    expect(result.current.showMessage).toBeDefined()
  })
})

// Component Layer - Integration test
describe('ComponentWithToast', () => {
  it('shows toast on action', async () => {
    const { getByRole } = render(<ComponentWithToast />)
    await userEvent.click(getByRole('button'))
    expect(mockShowMessage).toHaveBeenCalled()
  })
})
```

### Dialog Testing

#### AlertDialog Testing Pattern
```typescript
// Finding and interacting with AlertDialog
describe('AlertDialog Testing', () => {
  it('handles confirmation flow', async () => {
    const user = userEvent.setup()
    renderWithProviders(<YourComponent />)

    // Trigger dialog
    await user.click(screen.getByRole('button', { name: /delete/i }))

    // Find dialog by alertdialog role
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()

    // Find and click confirm button
    const confirmButton = screen.getByRole('button', { name: /^delete/i, exact: false })
    await user.click(confirmButton)

    // Verify action was performed
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled()
    })
  })
})
```

Key Points:
- Use `alertdialog` role instead of `dialog` for confirmation dialogs
- Use non-exact name matching for buttons when appropriate
- Wait for async operations after confirmation
- Test both confirmation and cancellation flows
- Verify loading states during async operations

### General Dialog Testing
- Test dialog rendering and state
- Verify loading states
- Test confirmation flows
- Validate cancel actions
- Test error scenarios
- Check accessibility

### Form Testing
- Test validation rules
- Test submission flows
- Verify error messages
- Test field interactions
