# Frontend Component Documentation

This documentation describes the React components used throughout the FEED application.

## Table of Contents

- [Introduction](#introduction)
- [Component Categories](#component-categories)
- [Component Architecture](#component-architecture)
- [Best Practices](#best-practices)

## Introduction

The FEED application uses a modular component architecture built with React and TypeScript. Components are organized by feature and follow consistent patterns for state management, styling, and accessibility.

## Component Categories

Components are organized into the following categories:

### UI Components
[UI Components](./ui/README.md) - Shadcn UI-based components that form the foundation of the UI.

### Feature Components
- [Category Management](./category-management/README.md) - Components for managing food categories
- [Food Item Management](./food-item-management/README.md) - Components for managing food items
- [Translation Management](./translation-management/README.md) - Components for handling translations
- [Document Translator](./document-translator/README.md) - Components for document translation
- [Shopping Lists](./shopping-lists/README.md) - Components for shopping list management

### Layout Components
[Layout Components](./layout/README.md) - Page layout, navigation, and structural components

### Shared Components
[Shared Components](./shared/README.md) - Reusable components used across features

## Component Architecture

Each component follows these principles:

### Single Responsibility
Components are designed to do one thing well, with clear boundaries of responsibility.

### Composition
Complex UI is built by composing smaller components rather than creating monolithic components.

### Prop-Based Configuration
Components are configured through props with sensible defaults.

### Controlled vs. Uncontrolled
- **Controlled Components**: State is managed by parent components through props
- **Uncontrolled Components**: State is managed internally using hooks

### Loading and Error States
Components handle loading and error states gracefully with appropriate UI feedback.

## Best Practices

### Component Structure

```tsx
// Import statements
import React from 'react';
import { useHook } from '@/hooks/useHook';

// Component props interface
export interface ComponentProps {
  // Props with descriptive comments
  title: string;
  onAction: () => void;
  isLoading?: boolean;
}

// Component implementation
export function Component({ title, onAction, isLoading = false }: ComponentProps) {
  // Hooks
  const { data } = useHook();
  
  // Event handlers
  const handleClick = () => {
    onAction();
  };
  
  // Conditional rendering
  if (isLoading) {
    return <Skeleton />;
  }
  
  // JSX markup
  return (
    <div>
      <h2>{title}</h2>
      <button onClick={handleClick}>Click Me</button>
    </div>
  );
}
```

### File Organization

- One component per file (except for small related components)
- Use index.ts files for re-exporting components
- Group related components in feature directories

### Testing Components

Components should have corresponding test files that:
- Test rendering in different states
- Verify behavior when props change
- Test user interactions
- Mock dependencies appropriately

### Accessibility

All components should:
- Use semantic HTML elements
- Include proper ARIA attributes when needed
- Ensure keyboard navigation works
- Maintain appropriate color contrast
- Support screen readers