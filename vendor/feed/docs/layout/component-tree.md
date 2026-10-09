# Component Tree Analysis

## Current Structure

```
App
├── GlobalLimitSetting
│   └── Form
├── CategoryProvider
│   ├── CategoryManagement
│   │   ├── CategoryForm
│   │   ├── CategoryList
│   │   │   ├── DataTable
│   │   │   └── BulkDeleteDialog
│   │   ├── EditDialog
│   │   └── DeleteDialog
│   └── FoodItemProvider
│       └── FoodItemManagement
│           ├── FoodItemList
│           │   ├── DataTable
│           │   │   ├── TableFeatureBar
│           │   │   │   ├── LanguageFilter
│           │   │   │   └── TypeFilter
│           │   └── BulkDeleteDialog
│           ├── EditDialog
│           │   └── Form
│           │       ├── DietaryFlagsGroup
│           │       └── StatusFlagsGroup
│           └── DeleteDialog
└── Toaster

```

## Planned Structure

```
App (with Router)
├── SidebarProvider
│   ├── Layout
│   │   ├── Sidebar
│   │   │   ├── Navigation
│   │   │   └── Footer
│   │   └── Main
│   │       ├── Header
│   │       │   ├── Breadcrumbs
│   │       │   └── Actions
│   │       └── Content
│   │           ├── CategoryProvider
│   │           │   ├── CategoryManagement
│   │           │   └── FoodItemProvider
│   │           │       └── FoodItemManagement
│   │           ├── GlobalLimitSetting
│   │           ├── LanguageManagement
│   │           │   ├── LanguageWarningDialog
│           │   ├── LanguageProvider
│           │   │   └── LanguageSelectionForm
│   │           ├── TranslationManagement
│           │   ├── TranslationList
│           │   │   ├── DataTable
│           │   │   ├── ViewTextDialog
│           │   │   └── BulkDeleteDialog
│           │   ├── EditDialog
│           │   │   ├── CustomTypeForm
│           │   │   └── StaticTypeForm
│           │   ├── DeleteDialog
│           │   └── AddTranslationDialog
│           │       └── TextEntryForm (2,000 char limit)
│   │           └── ShoppingListGenerator (future)
│   └── Toaster
```

## Key Changes

### Provider Wrapping
```tsx
// Current
<App>
  <CategoryProvider>
    <FoodItemProvider>
      {/* Components */}
    </FoodItemProvider>
  </CategoryProvider>
</App>

// Planned
<App>
  <SidebarProvider>
    <Layout>
      <CategoryProvider>
        <FoodItemProvider>
          {/* Route-based component rendering */}
        </FoodItemProvider>
      </CategoryProvider>
    </Layout>
  </SidebarProvider>
</App>
```

### Component Mounting
- Current: All components mounted simultaneously
- Planned: Route-based mounting
- Benefits:
  - Better performance
  - Reduced initial load
  - Cleaner state management

### State Flow
```
Layout State
└── Sidebar state
    └── Route state
        └── Component state
            └── Dialog state
```

## Implementation Considerations

### Shared Components
- SectionHeader component for consistent page headers
- DataTable configurations
- Dialog implementations
- Form layouts
- Toast notifications

### State Management
- Route parameters
- Filter states
- Selection states
- Form states

### Layout Patterns
- Card layouts
- Grid systems
- Spacing standards
- Responsive behaviors