# State Management Documentation

This document explains the state management patterns used in the FEED application.

## Table of Contents

- [Overview](#overview)
- [Context API Patterns](#context-api-patterns)
- [State Management Layers](#state-management-layers)
- [Global vs Local State](#global-vs-local-state)
- [Data Flow](#data-flow)
- [Best Practices](#best-practices)

## Overview

FEED uses a combination of React Context API and local component state to manage application state. This approach provides a good balance between simplicity and scalability without the complexity of state management libraries like Redux.

Key principles:
- Context API for global state shared across components
- Local state for component-specific concerns
- Consistent patterns for state updates
- Clear separation of concerns

## Context API Patterns

### Context Structure

Each context in the application follows a consistent pattern:

```tsx
// 1. Define the context type
interface CategoryContextType {
  categories: Category[];
  isLoading: boolean;
  error: Error | null;
  refreshCategories: () => Promise<void>;
  createCategory: (data: CategoryFormData) => Promise<Category>;
  updateCategory: (data: CategoryUpdateData) => Promise<Category>;
  deleteCategory: (id: number) => Promise<void>;
  // Other methods...
}

// 2. Create the context
const CategoryContext = createContext<CategoryContextType | undefined>(undefined);

// 3. Create a provider component
export function CategoryProvider({ children }: { children: React.ReactNode }) {
  // State and methods implementation
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Implementation of methods that update state
  
  // Context value
  const value = {
    categories,
    isLoading,
    error,
    refreshCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    // Other methods...
  };
  
  return (
    <CategoryContext.Provider value={value}>
      {children}
    </CategoryContext.Provider>
  );
}

// 4. Create a hook for using the context
export function useCategoryContext() {
  const context = useContext(CategoryContext);
  if (context === undefined) {
    throw new Error('useCategoryContext must be used within a CategoryProvider');
  }
  return context;
}
```

### Available Contexts

The application includes the following contexts:

| Context | Purpose | Key State | Key Methods |
|---------|---------|-----------|-------------|
| `AuthContext` | Authentication state | `isAuthenticated`, `user` | `login`, `logout` |
| `CategoryContext` | Category management | `categories`, `isLoading` | `refreshCategories`, `createCategory`, etc. |
| `FoodItemContext` | Food item management | `foodItems`, `isLoading` | `refreshFoodItems`, `createFoodItem`, etc. |
| `LanguageContext` | Language management | `languages`, `enabledLanguages` | `enableLanguage`, `disableLanguage` |
| `ToastContext` | Toast notifications | `toasts` | `showToast`, `removeToast` |

## State Management Layers

The application state is organized in layers:

### 1. Service Layer

The service layer handles API communication and data transformation:

```tsx
// CategoryService.ts
export class CategoryService {
  async getCategories(): Promise<Category[]> {
    const response = await fetch('/api/categories');
    const data = await response.json();
    return data.categories;
  }
  
  async createCategory(data: CategoryFormData): Promise<Category> {
    const response = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create category');
    }
    
    const result = await response.json();
    return result.category;
  }
  
  // Other methods...
}
```

### 2. Context Layer

The context layer connects services to the React component tree:

```tsx
// Within CategoryProvider
const categoryService = new CategoryService();

const refreshCategories = async () => {
  setIsLoading(true);
  setError(null);
  
  try {
    const data = await categoryService.getCategories();
    setCategories(data);
  } catch (err) {
    setError(err instanceof Error ? err : new Error('Failed to fetch categories'));
  } finally {
    setIsLoading(false);
  }
};
```

### 3. Hook Layer

Custom hooks abstract state logic from components:

```tsx
// useCategoryData.ts
export function useCategoryData() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const categoryService = new CategoryService();
  
  const refreshCategories = async () => {
    // Implementation...
  };
  
  // Other methods...
  
  return {
    categories,
    isLoading,
    error,
    refreshCategories,
    createCategory,
    updateCategory,
    deleteCategory
  };
}
```

### 4. Component Layer

Components consume state and trigger state changes:

```tsx
// CategoryList.tsx
function CategoryList() {
  const { categories, isLoading, error, refreshCategories } = useCategoryContext();
  
  useEffect(() => {
    refreshCategories();
  }, []);
  
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;
  
  return (
    <div>
      {categories.map(category => (
        <CategoryItem key={category.id} category={category} />
      ))}
    </div>
  );
}
```

## Global vs Local State

### When to Use Global State (Context)

Use context for state that:
- Is required by multiple components across the application
- Changes infrequently
- Needs to persist beyond component unmounting
- Represents shared domain entities or configuration

Examples:
- Authentication state
- User preferences
- Domain entities like categories and food items
- Application configuration

### When to Use Local State

Use local state for:
- UI state that only affects a single component
- Temporary data that doesn't need to persist
- Form state before submission
- Component-specific visibility toggles

Examples:
- Form input values
- Dialog open/closed state
- Loading indicators for component-specific actions
- Hover/focus states

## Data Flow

Data flows through the application in a predictable pattern:

1. **User Action** → Component event handler is triggered
2. **Component** → Calls a method from a context or local state update
3. **Context Method** → Updates global state and/or calls service methods
4. **Service** → Communicates with API and returns results
5. **Context Update** → State is updated with results
6. **Component Re-render** → UI reflects the new state

This unidirectional flow makes the application predictable and easier to debug.

## Best Practices

### State Updates

#### Optimistic Updates

For better user experience, update UI optimistically before API call completes:

```tsx
const deleteCategory = async (id: number) => {
  // 1. Create a backup of the current state
  const previousCategories = [...categories];
  
  // 2. Update state optimistically
  setCategories(categories.filter(c => c.id !== id));
  
  try {
    // 3. Call the API
    await categoryService.deleteCategory(id);
    // Success - state is already updated
  } catch (err) {
    // 4. Revert on failure
    setCategories(previousCategories);
    setError(err instanceof Error ? err : new Error('Failed to delete category'));
  }
};
```

#### Batch Updates

Group related state updates to avoid multiple re-renders:

```typescript
// Bad - triggers multiple renders
setIsLoading(true);
setError(null);
setData(newData);

// Good - uses functional updates
setFormState(prev => ({
  ...prev,
  isLoading: true,
  error: null,
  data: newData
}));
```

### Error Handling

Consistent error handling patterns:

```tsx
const createCategory = async (data: CategoryFormData) => {
  setIsLoading(true);
  setError(null);
  
  try {
    const newCategory = await categoryService.createCategory(data);
    setCategories([...categories, newCategory]);
    showSuccess('Category created successfully');
    return newCategory;
  } catch (err) {
    const errorMessage = err instanceof Error 
      ? err.message 
      : 'Failed to create category';
    
    setError(new Error(errorMessage));
    showError(errorMessage);
    throw err; // Re-throw to allow component-level handling
  } finally {
    setIsLoading(false);
  }
};
```

### Context Composition

For complex applications, compose multiple contexts:

```tsx
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <LanguageProvider>
          <CategoryProvider>
            <FoodItemProvider>
              {children}
            </FoodItemProvider>
          </CategoryProvider>
        </LanguageProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
```

### Performance Considerations

1. **Memoization**:
   - Use `useMemo` for expensive computations
   - Use `useCallback` for function references passed as props

2. **Context Splitting**:
   - Split large contexts into smaller ones to avoid unnecessary re-renders
   - Group related state and actions

3. **State Locality**:
   - Keep state as close as possible to where it's used
   - Avoid lifting state higher than necessary