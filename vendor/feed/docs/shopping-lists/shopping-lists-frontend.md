# Shopping Lists Frontend Implementation

## Overview

The Shopping Lists feature allows users to create, manage, and track shopping lists based on inventory needs. This document outlines the implementation standards and UI patterns for the Shopping Lists feature within the frontend application.

## UI Structure and Standards

### Navigation

Shopping Lists will be added to the sidebar navigation under the "Tools" section:

```typescript
{
  title: "Tools",
  href: "#",
  icon: Settings,
  items: [
    {
      title: "Shopping Lists",
      href: "/shopping-lists",
      icon: ShoppingCart
    },
    {
      title: "Document Translator",
      href: "/document-translator",
      icon: FileText
    }
  ]
}
```

### Component Structure

Following project patterns, the Shopping Lists feature will use this structure:

1. **Main Container Component** (`/components/shopping-lists/index.tsx`)
   - Acts as the entry point and handles state management
   - Implements error boundary pattern seen in other features
   - Handles API data fetching and operations

2. **List Component** (`/components/shopping-lists/ShoppingListList/index.tsx`)
   - Displays the list of shopping lists
   - Implements bulk operations similar to other list components
   - Uses the shared DataList component

3. **Data Table** (`/components/shopping-lists/data-table/`)
   - Contains columns configuration, data table component
   - Follows EnhancedDataTable pattern used throughout the application

4. **Dialog Components**
   - Add dialog (`add-dialog.tsx`)
   - Edit dialog (`edit-dialog.tsx`)
   - Delete dialog (`delete-dialog.tsx`)
   - Bulk operation dialogs (as needed)

5. **Form Components** (`/components/shopping-lists/form/`)
   - ShoppingListForm for add/edit operations

### Implementation Standards

Follow these established patterns:

1. **Data Handling**
   - Use React hooks for data management (`useShoppingListData.ts`)
   - Implement context if needed (`ShoppingListContext.tsx`)
   - Create service for API interactions (`services/shopping-list/index.ts`)

2. **UI Components**
   - Use the shadcn/ui component library for UI elements
   - Maintain accessibility standards (aria attributes, focus management)
   - Implement responsive design with mobile considerations

3. **Error Handling**
   - Use error boundaries around main components
   - Implement toast messages for operation feedback
   - Provide clear error messages and recovery options

4. **State Management**
   - Use the useDialogState pattern for modal management
   - Implement appropriate loading states
   - Handle optimistic updates where appropriate

5. **Testing**
   - Create unit tests for hooks and services
   - Implement component tests for key UI elements
   - Add integration tests for critical user flows

## Backend Integration

## Architectural Decisions Impact on Frontend ✅

### Minimum Viable Implementation Focus

#### Template-Instance Model
- **Template Management UI**: CRUD operations for reusable template configurations
- **Instance Management UI**: View and reprint previously generated shopping lists
- **Generation Flow**: Template selection → Live data population → Instance creation
- **Three Section Types**: Support custom-text, form, and category sections

#### Section Type Management

**Custom Text Sections**
- **Configuration UI**: Text editor with style options (title, body, instruction)
- **Positioning**: Drag-and-drop placement anywhere in template
- **Styling Controls**: Alignment and formatting options

**Form Sections**
- **Configuration UI**: Form builder for data collection fields
- **Current Implementation**: Client info (name, household size, allergies, bag capacity)
- **Field Configuration**: Field type, label, and validation options only
- **Future Flexibility**: Configurable field types and layouts

**Category Sections**
- **Configuration UI**: Category selection with basic display options
- **Implementation**: Dynamic loading of all in-stock items (Option A)
- **Display Controls**: Show/hide limits and quantity columns
- **Live Data**: Always reflects current inventory status

#### Limits Display Logic (Category Sections)
- **Complex Calculation**: Frontend must handle interaction of multiple limit types
- **Individual Limits**: Display FoodItem.limit when set
- **Category Limits**: Show category-level constraints (e.g., "Dairy: max 3 items")
- **Global Limit Fallback**: Display Global Limit for "No Limit" items
- **Override Indicators**: Visual cues when individual limits exceed Global Limit

#### Export Strategy
- **Server-side PDF (React‑PDF)**: Deterministic export with Split Page layout; browser print preview removed
- **Layout Options**: Multiple layouts remain supported at data level; export focuses on server-side PDF
- **Instance Storage**: Save generated lists for reprinting capability

## Backend Integration

The frontend will connect to the following backend endpoints:

**Template Management:**
- `GET /api/shopping-lists/templates` - Retrieve all templates
- `GET /api/shopping-lists/templates/:id` - Get a specific template
- `POST /api/shopping-lists/templates` - Create a new template
- `PUT /api/shopping-lists/templates/:id` - Update a template
- `DELETE /api/shopping-lists/templates/:id` - Delete a template

**List Generation & Instance Management:**
- `GET /api/shopping-lists/generate/:templateId` - Generate new list from template
- `POST /api/shopping-lists/instances` - Save generated list instance
- `GET /api/shopping-lists/instances` - Retrieve saved instances
- `GET /api/shopping-lists/instances/:id` - Get specific instance
- `DELETE /api/shopping-lists/instances/:id` - Delete instance

**Export:**
- `GET /api/shopping-lists/instances/:id/pdf-react?layout=split-page` - Server‑side PDF (React‑PDF)

## Template Configuration

The shopping list feature supports multiple template types and advanced configuration options:

1. **Template Types**
   - Full Page - Traditional 8.5" x 11" layout with multiple sections
   - Split Page - Narrow 4.25" x 11" layout for printing two lists per page
   - Custom Grid - Multiple identical mini-lists per page in 2x2, 2x3, or 2x4 grid

2. **Section Management (Updated for Three Section Types)**
   - **Custom Text Sections**: Text editor with style options, drag-and-drop placement
   - **Form Sections**: Form builder starting with client information fields
   - **Category Sections**: Category selection with display controls
   - Drag and drop reordering of all section types using react-beautiful-dnd
   - Visual feedback during drag operations
   - Toggle sections on/off
   - Section-specific configuration dialogs

3. **Layout Options**
   - Paper size selection
   - Layout type selection (full-page, split-page, grid layouts)

## Implementation Status & Critical Issues

### ✅ Multi-Step Template Creation Implementation
**Status**: Fully functional multi-step template creation system
- AI Configuration pattern adapted for shopping list templates
- Complete backend integration with template CRUD operations
- Real-time validation and step-by-step guidance
- Integration with existing Category and FoodItem data systems
- Fixed scroll area layout: sections list scrolls independently from modal
- Guided section creation workflow: dedicated steps for each section type
- **Icon Display Integration**: Food Categories step now uses established IconDisplay component for consistent category icon rendering

**Architecture**:
1. BaseTemplateDialog - Main multi-step controller
2. Step components - Individual configuration stages
3. Template service methods - Backend communication
4. Type-safe data flow - Consistent validation throughout

**Layout Architecture**:
- Fixed header (add section buttons)
- Scrollable middle (drag-and-drop sections list)
- Fixed footer (section editor)

**Guided Section Creation Workflow**:
- Step 3: Custom Text Title (required)
  - Title Text input field (required)
  - Subtitle Text input field (optional, single-line)
  - Title Style selection (title, body, instruction)
  - Text Alignment selection (left, center, right)
  - Database fields: title, subtitle, configuration.textStyle, configuration.alignment
- Step 4: Form Fields Setup (optional)
  - Direct field management without toggle interface
  - Section title optional for maximum flexibility
  - Create form section automatically when first field added
  - Empty state guides users to "Add Field" button
- Step 5: Food Categories Selection (optional)
- Step 6: Additional Custom Text (optional)
- Step 7: Section Ordering (drag-drop only)
- Eliminates cognitive overload through single-focus steps
- Provides mandatory guidance for title creation
- Separates complex configuration from simple ordering

### Implementation Phases

1. **Phase 1: Basic Structure** ✅
   - Create component skeleton
   - Implement navigation
   - Set up service and hook structure

2. **Phase 2: Core Functionality** ✅
   - Implement template selection
   - Build configuration dialog
   - Create drag and drop section management
   - Implement preview functionality

3. **Phase 3: Multi-Step Template Creation** ✅ **COMPLETED**
   - Implemented AI Configuration pattern for template creation
   - 5-step workflow: Template Layout → Details → Section Configuration → Items & Settings → Preview
   - Real-time validation and step navigation
   - Backend integration with template CRUD operations
   - Support for three section types (custom-text, form, category)

4. **Phase 4: Enhanced Section Management** ✅
   - Drag-and-drop section ordering with react-beautiful-dnd
   - Real-time category data integration via useCategoryData hook
   - Section-specific configuration editors
   - Form field management for client information collection

5. **Preview Step Optimization** ✅ **COMPLETED**
   - Removed redundant "Configured Sections" card (exceeded modal height constraints)
   - Eliminated duplicate information display (SectionOrderingStep provides comprehensive section preview)
   - Repositioned Preview button to CardFooter with right alignment following established UX patterns
   - Resolved modal overflow issue within BaseTemplateDialog fixed height constraints

6. **Phase 5: Future Features** (Post-MVP)
   - Add bilingual rendering capability
   - Implement advanced category filtering (dietary restrictions, etc.)
   - Enhanced form field configuration
   - Template versioning and history

6. **Phase 6: Validation and Testing** ✅ **COMPLETED**
   - Add comprehensive testing
   - Implement validation rules
   - Document component usage
   - Optimize for mobile devices

7. **Phase 6.1: Messaging Architecture Alignment** ✅ **COMPLETED**
   - Align with AI Configuration messaging patterns for consistent user experience
   - Remove all `showMessage()` calls from ShoppingListList component following established patterns
   - Centralize user feedback in main component confirmation handlers
   - Delegate error handling to parent components instead of showing messages in list component
   - Add success messages to confirmation handlers for template operations
   - Enhance bulk operation messages with action-specific feedback
   - Implement comprehensive testing suites validating messaging architecture
   - Achieve complete architectural consistency across all messaging layers
   - Eliminate duplicate messages ensuring single, clear feedback per operation
