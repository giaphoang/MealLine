# Custom React Hooks

This directory contains custom React hooks used throughout the application. Each hook is designed to be reusable, well-documented, and focused on a specific concern.

## Table of Contents

- [Message Management](#message-management)
- [Dialog Management](#dialog-management)
- [Data Fetching](#data-fetching)
- [Form Management](#form-management)
- [UI State](#ui-state)

## Message Management

### `useMessage`
A hook for displaying toast notifications with consistent styling and behavior.

```typescript
const { showSuccess, showError, showInfo, showWarning } = useMessage()

// Show different types of messages
showSuccess('Operation completed successfully')
showError('Failed to save changes')
showInfo('Processing your request...')
showWarning('Running low on storage space')

// With custom options
showSuccess('Saved!', { duration: 2000 })
showError('Connection failed', {
  persist: true,
  action: {
    label: 'Retry',
    onClick: handleRetry
  }
})
```

**Features:**
- Type-safe message display
- Consistent styling across app
- Configurable durations
- Support for action buttons
- Automatic cleanup
- Toast queuing

## Dialog Management

### `useDialogState<T>`
A hook for managing dialog/modal state with associated data.

```typescript
interface DialogData {
  id: number;
  name: string;
}

const { isOpen, setIsOpen, data, setData, open, close } = useDialogState<DialogData>();

// Open dialog with data
open({ id: 1, name: 'Item' });

// Close dialog
close();

// Check if dialog is open
if (isOpen) {
  // Access dialog data
  console.log(data?.name);
}
```

**Features:**
- Generic type for dialog data
- Open/close functionality
- Data association with dialog state
- Reset data on close

## Data Fetching

### `useCategoryData`
A hook for fetching and managing category data.

```typescript
const {
  categories,
  isLoading,
  error,
  refreshCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  bulkDeleteCategories
} = useCategoryData();

// Fetch categories
await refreshCategories();

// Create a new category
const newCategory = await createCategory({ name: 'Fruits', limit: 10 });

// Update an existing category
await updateCategory({ id: 1, name: 'Vegetables', limit: 5 });

// Delete a category
await deleteCategory(1);

// Delete multiple categories
await bulkDeleteCategories([1, 2, 3]);
```

**Features:**
- Data fetching with loading states
- Error handling
- CRUD operations
- Optimistic updates
- Automatic data validation

### `useFoodData`
A hook for fetching and managing food item data.

```typescript
const {
  foodItems,
  isLoading,
  error,
  refreshFoodItems,
  createFoodItem,
  updateFoodItem,
  deleteFoodItem,
  bulkUpdateFoodItems,
  bulkDeleteFoodItems
} = useFoodData();
```

**Features:**
- Similar to useCategoryData but for food items
- Supports bulk operations
- Handles complex food item states (in stock, limited, etc.)

### `useTranslationData`
A hook for managing translation data.

```typescript
const {
  translations,
  isLoading,
  refreshTranslations,
  createTranslation,
  updateTranslation,
  deleteTranslation,
  retryTranslation,
  bulkRetryTranslations
} = useTranslationData();
```

**Features:**
- Fetches translations with filtering
- Handles translation statuses
- Supports retry operations
- Error handling for translation failures

## Form Management

### `useCategoryForm`
A hook for managing category form state and validation.

```typescript
const {
  form,
  isSubmitting,
  handleSubmit,
  resetForm,
  errors,
  isDirty,
  isValid
} = useCategoryForm({ 
  defaultValues: { name: '', limit: 10 },
  onSubmit: async (data) => {
    await createCategory(data);
  }
});
```

**Features:**
- Form validation
- Submission handling
- Error tracking
- Default values
- Form state management

### `useFoodForm`
A hook for managing food item form state with complex validation.

```typescript
const {
  form,
  isSubmitting,
  handleSubmit,
  resetForm,
  errors
} = useFoodForm({
  defaultValues,
  onSubmit
});
```

**Features:**
- Complex validation rules
- Multiple form sections
- Status flags management
- Dietary flags management

## UI State

### `useTableSelection`
A hook for managing multi-row selection in tables.

```typescript
const {
  selectedItems,
  toggleSelection,
  toggleAll,
  isSelected,
  isAllSelected,
  clearSelection
} = useTableSelection<Item>(items);
```

**Features:**
- Generic type support
- Select all/none functionality
- Individual item selection
- Selection state tracking

### `useMediaQuery`
A hook for responsive design based on media queries.

```typescript
const isMobile = useMediaQuery('(max-width: 768px)');

return (
  <div>
    {isMobile ? <MobileView /> : <DesktopView />}
  </div>
);
```

**Features:**
- Responsive design support
- Window resize handling
- Breakpoint detection

### `useDebounce`
A hook for debouncing values (commonly used for search inputs).

```typescript
const [searchTerm, setSearchTerm] = useState('');
const debouncedSearchTerm = useDebounce(searchTerm, 300);

// Effect only runs after debounce
useEffect(() => {
  searchApi(debouncedSearchTerm);
}, [debouncedSearchTerm]);
```

**Features:**
- Prevents excessive function calls
- Configurable delay
- Type-safe implementation