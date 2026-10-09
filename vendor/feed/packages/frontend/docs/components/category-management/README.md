# Category Management Components

This documentation covers the components used for managing food categories in the FEED application.

## Component Overview

The category management system consists of multiple interconnected components:

```
CategoryManagement/
├── index.tsx                 # Main component that orchestrates others
├── CategoryList/             # List view of categories
│   ├── index.tsx             # Container component
│   └── bulk-delete-dialog.tsx # Bulk deletion confirmation
├── data-table/               # Table display for categories
│   ├── columns.tsx           # Column definitions
│   ├── data-table.tsx        # Table implementation
│   └── index.ts              # Export file
├── form/                     # Form components
│   ├── CategoryForm.tsx      # Form for adding/editing categories
│   ├── IconSelector.tsx      # Compatibility export for the shared picker
│   └── SimpleIconSelector.tsx # Simplified icon selector
├── add-dialog.tsx            # Dialog for adding new categories
├── delete-dialog.tsx         # Confirmation dialog for deletion
├── edit-dialog.tsx           # Dialog for editing categories
└── icon-display.tsx          # Component to display category icons
```

## Main Components

### CategoryManagement

The root component that organizes the category management interface.

**Props:**
None - uses CategoryContext for data

**Usage:**
```tsx
<CategoryManagement />
```

**Features:**
- Renders the category list with CRUD operations
- Handles state transitions between different views
- Integrates with toast notifications

### CategoryList

Displays a list of categories with actions.

**Props:**
```tsx
interface CategoryListProps {
  enableBulkActions?: boolean;
  enableRefresh?: boolean;
  showLoading?: boolean;
}
```

**Usage:**
```tsx
<CategoryList 
  enableBulkActions={true}
  enableRefresh={true} 
/>
```

### CategoryForm

Form component for adding or editing categories.

**Props:**
```tsx
interface CategoryFormProps {
  defaultValues?: Partial<CategoryFormData>;
  onSubmit: (data: CategoryFormData) => void;
  isSubmitting?: boolean;
}

interface CategoryFormData {
  name: string;
  limit: number;
  limitType: 'person' | 'household';
  icon?: string;
  keepTranslations?: boolean;
}
```

**Usage:**
```tsx
<CategoryForm
  defaultValues={{ name: "Canned Goods", limit: 10, icon: "can" }}
  onSubmit={handleSubmit}
  isSubmitting={isLoading}
/>
```

**Validation Rules:**
- Name: 3-36 characters, required
- Limit: 1-100, required
- LimitType: Either 'person' or 'household', required
- Icon: Optional
- KeepTranslations: Optional boolean flag to preserve translations when updating

## Dialog Components

### AddCategoryDialog

Dialog for adding a new category.

**Props:**
```tsx
interface AddCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoryAdded?: (category: Category) => void;
}
```

**Usage:**
```tsx
const [open, setOpen] = useState(false);

<AddCategoryDialog
  open={open}
  onOpenChange={setOpen}
  onCategoryAdded={handleCategoryAdded}
/>

<Button onClick={() => setOpen(true)}>Add Category</Button>
```

### EditCategoryDialog

Dialog for editing an existing category.

**Props:**
```tsx
interface EditCategoryDialogProps {
  category: Category;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoryUpdated?: (category: Category) => void;
}
```

**Usage:**
```tsx
<EditCategoryDialog
  category={selectedCategory}
  open={editDialogOpen}
  onOpenChange={setEditDialogOpen}
  onCategoryUpdated={handleCategoryUpdated}
/>
```

### DeleteCategoryDialog

Confirmation dialog for deleting a category.

**Props:**
```tsx
interface DeleteCategoryDialogProps {
  category: Category;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoryDeleted?: () => void;
}
```

**Usage:**
```tsx
<DeleteCategoryDialog
  category={categoryToDelete}
  open={deleteDialogOpen}
  onOpenChange={setDeleteDialogOpen}
  onCategoryDeleted={handleCategoryDeleted}
/>
```

### BulkDeleteDialog

Dialog for confirming deletion of multiple categories.

**Props:**
```tsx
interface BulkDeleteDialogProps {
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoriesDeleted?: () => void;
}
```

**Usage:**
```tsx
<BulkDeleteDialog
  categories={selectedCategories}
  open={bulkDeleteDialogOpen}
  onOpenChange={setBulkDeleteDialogOpen}
  onCategoriesDeleted={handleCategoriesDeleted}
/>
```

## Data Table

### CategoryDataTable

Table display for categories with sorting and selection.

**Props:**
```tsx
interface CategoryDataTableProps {
  data: Category[];
  isLoading?: boolean;
  onEdit?: (category: Category) => void;
  onDelete?: (category: Category) => void;
  enableSelection?: boolean;
  onSelectionChange?: (categories: Category[]) => void;
}
```

**Usage:**
```tsx
<CategoryDataTable
  data={categories}
  isLoading={isLoading}
  onEdit={handleEdit}
  onDelete={handleDelete}
  enableSelection={true}
  onSelectionChange={setSelectedCategories}
/>
```

### Column Configuration

Table columns defined in `columns.tsx`:

```tsx
const columns: ColumnDef<Category>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "icon",
    header: "Icon",
    cell: ({ row }) => <IconDisplay icon={row.getValue("icon")} />,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <div>{row.getValue("name")}</div>,
  },
  {
    accessorKey: "limit",
    header: "Limit",
    cell: ({ row }) => <div>{row.getValue("limit")}</div>,
  },
  {
    id: "actions",
    cell: ({ row }) => <ActionMenu category={row.original} />,
  },
];
```

## Icon Components

### IconSelector

Compatibility export for FEED's shared searchable icon picker. The implementation
lives in `src/components/shared/icon-selector.tsx` so Categories and Service
Metrics select from one registry without drifting.

**Props:**
```tsx
interface IconSelectorProps {
  value?: string;
  onChange: (value: string) => void;
}
```

**Usage:**
```tsx
const [selectedIcon, setSelectedIcon] = useState("can");

<IconSelector
  value={selectedIcon}
  onChange={setSelectedIcon}
/>
```

### SimpleIconSelector

The Category-facing name for the same shared selector used by Service Metrics.
It renders an inline searchable grid rather than a popover, so the icon choices
remain visible while the surrounding form is completed.

**Props:**
```tsx
interface SimpleIconSelectorProps {
  value?: string;
  onChange: (value: string) => void;
}
```

**Features:**
- Grid layout with 137 curated food pantry, operational, and general-purpose icons
- Categorized icons (Food, Drink, Health, Household, Clothing, Animals & Pets,
  Shapes & Symbols, Outdoors, and Other)
- Visual selection with active state indicators
- Searchable interface for quick icon finding
- Definite-height Shadcn `ScrollArea` for reliable keyboard, wheel, and touch
  navigation inside the icon grid
- Responsive design that works on all device sizes

### Shared icon registry

`src/lib/food-icons.ts` remains the canonical registry for historical Shopping
List PDF parity, while `src/lib/icon-library.ts` is the neutral import boundary
for new features. The library now includes:

- **Shapes & Symbols:** ellipse, circle, square, triangle, astroid, small circle,
  diamond, hexagon, pentagon, cuboid, pyramid, cone, concave lens, star, heart,
  spade, club, prohibited, accessibility, heart pulse, music, parking, and
  radiation.
- **Outdoors:** campsite, tent, kindling, caravan, backpack, rose, stone, flower,
  bug, bike, flashlight, fuel, and water.
- **Other additions:** paper bag, luggage, shopping bag, scroll text, receipt,
  to-do list, calculator, pointer, eclipse, and clipboard minus.

Registry values are stable kebab-case identifiers. Category and Service Metric
records store only those identifiers. Static record icons do not animate; icons
on interactive controls continue to follow `docs/motion/ICON_ANIMATIONS.md`.

The Shopping List Builder's Chromium PDF renderer uses generated raw SVG paths
from `packages/backend/src/lib/icon-svgs.ts`. After changing this registry or
the pinned Lucide version, run:

```bash
node packages/backend/src/lib/generate-icon-svgs.cjs
```

Commit the regenerated file with the registry change so canvas and PDF output
remain visually equivalent.

### IconDisplay

Component to display a category icon with consistent styling.

**Props:**
```tsx
interface IconDisplayProps {
  icon?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}
```

**Usage:**
```tsx
<IconDisplay icon="can" size="md" />
```

## State Management

The category management components use a combination of:
- **Global State**: CategoryContext for shared category data
- **Local State**: Component-level state for UI interactions
- **Form State**: React Hook Form for form validation and submission

## Bulk Operations

The category management system supports bulk operations with advanced features:

### Bulk Deletion

Allows deleting multiple categories at once with safeguards:

- Multi-selection interface for choosing categories
- Confirmation dialog with clear warnings
- Transaction-based operations that report partial success/failure
- Detailed error reporting for failed operations
- Status feedback via toast notifications

**Implementation:**
```tsx
// Handling bulk deletion with error reporting
const handleBulkDelete = async (categoriesToDelete: Category[]) => {
  try {
    const result = await bulkDeleteCategories(categoriesToDelete);
    
    if (result.failed > 0) {
      showMessage(result.errors[0], "error");
    } else {
      showMessage(`Successfully deleted ${result.success} categories`, "success");
    }
  } catch (err) {
    showMessage(err.message, "error");
  }
};
```

## Translation Integration

Category management integrates with the translation system:

- Category updates trigger translation updates for all enabled languages
- When editing a category name, you can choose to preserve existing translations
- The `keepTranslations` flag controls whether translations are preserved or regenerated
- Changes to category icon or limit don't trigger translation updates

## Error Handling

Components handle errors through:
- Toast notifications for API errors
- Form validation feedback for user input errors
- Error boundaries for unexpected exceptions
- Detailed error reporting for bulk operations

## Loading States

Each component handles loading states:
- Skeleton loaders for initial data loading
- Disabled buttons during form submission
- Loading spinners for asynchronous operations
