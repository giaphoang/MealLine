# Shopping List Templates

The Shopping List Templates feature in FEED allows staff to create customizable shopping lists for clients, making food distribution more efficient and personalized.

## Overview

Shopping list templates provide:
- Configurable layouts for different use cases
- Categorized sections for better organization
- Ability to save and reuse templates
- Print-ready formatting
- Support for custom text sections

## Key Components

### Template Types

The system supports multiple template formats:
- **Full Page**: Complete inventory list with sections
- **Split Page**: Compact design for limited selections
- **Custom**: User-defined custom layout

### Section Types

Templates contain various section types:
- **Category Sections**: Groups of food items from a category
- **Title Text**: Custom headings and section titles
- **Regular Text**: Explanatory text, instructions, or notes
- **Client Info**: Space for client information

### Custom Text

The system allows saving reusable text blocks:
- **Title Text**: Larger, emphasized text for headings
- **Regular Text**: Standard text for instructions and notes

## Creating Templates

### Basic Template Creation

1. Navigate to the Shopping Lists section
2. Click "Create New Template"
3. Enter a template name
4. Select a template type (Full Page, Split Page, or Custom)
5. Add sections as needed
6. Save the template

### Section Management

Each section can be customized:
- **Title**: Section heading
- **Description**: Optional subtext
- **Icon**: Visual indicator for section
- **Visibility**: Toggle section display
- **Content**: Food items or custom text

### Section Ordering

Sections can be reordered using drag-and-drop:
- Drag sections to change their order
- Visual indicators show valid drop positions
- Changes are automatically saved

### Item Selection

For category-based sections:
- Select which items to include from each category
- Set quantity limits for each item
- Configure display options for items

## Using Templates

### Generating Shopping Lists

1. Select a template
2. Customize as needed for specific client
3. Preview the shopping list
4. Print or save the list

### Printing

The system provides comprehensive print-ready functionality:
- Dedicated print button in the shopping list interface
- Print-specific CSS with appropriate media queries
- Proper page breaks based on content sections
- Theme-independent printing (works in light/dark mode)
- Preservation of icons, formatting, and SVG elements in print view
- Print preview support
- Direct browser printing capability
- Consistent appearance across different browsers
- Mobile-friendly print layouts

### Saving Changes

Templates can be:
- Saved as new templates
- Updated to replace existing templates
- Duplicated and modified


## Template Customization

### Visual Customization

Templates can be visually customized:
- Section icons from a library of food-related icons
- Visibility toggles for section titles
- Custom text formatting

### Layout Options

Layout options include:
- Grid configurations
- Section spacing
- Print layout settings

## Integration with Inventory

Shopping list templates integrate with the inventory system:
- Automatically includes available items
- Updates when inventory changes
- Reflects real-time item status (in stock, limited, etc.)

## Best Practices

1. **Consistent Naming**: Use clear, consistent names for templates
2. **Logical Organization**: Group related items in sections
3. **Clear Instructions**: Include usage instructions in custom text
4. **Print Testing**: Test printed output on target printers
5. **Regular Updates**: Review templates as inventory changes

## Implementation Status

The shopping list templates feature has been implemented:

### Completed Components
- Complete UI with drag-and-drop functionality
- Template customization interface
- Section management with CRUD operations
- Visual icon selector with categorized icons
- Print functionality with browser printing support
- Backend persistence for templates, sections, and instances
- Full database integration with a 3-table architecture
- API endpoints for all CRUD operations
- Real-time data fetching, replacing mock data
