# Developer Maintenance Guide

## Project Overview
Food Pantry Management System - A comprehensive web application for managing food pantry operations, including inventory, categories, and distribution policies.

## Current Version
v0.8.99 (as of February 03, 2025)

## Key Technical Decisions

### 1. State Management
The application uses a context-based state management approach:
- CategoryContext for category operations
- FoodItemContext for food item management
- Toast context for notifications
- Future: Translation context planned

### 2. UI Component Library & Layout
- Base: shadcn/ui components
- Styling: Tailwind CSS
- Custom components extend shadcn/ui patterns
- No arbitrary Tailwind values (must use core utility classes)
- Persistent sidebar state management via cookies
  - Cookie name: 'sidebarState'
  - Values: 'true' (expanded) or 'false' (collapsed)
  - Maintains state across navigation
  - Auto-restores user preferences

### Table Responsiveness Guidelines
1. Column Visibility:
   - Essential columns should always be visible
   - Secondary columns should auto-hide on mobile
   - Use `enableHiding: true` for optional columns
   - Implement through EnhancedDataTable props

2. Common Patterns:
   ```tsx
   // Column definition with mobile support
   {
     id: "secondaryInfo",
     enableHiding: true,
     // ... other props
   }

   // DataTable component setup
   <EnhancedDataTable
     initialState={{
       columnVisibility: {
         secondaryInfo: !isMobile,
       }
     }}
   />
   ```

3. Standard Mobile Hiding:
   - Last Updated columns
   - ID reference columns
   - Detailed flag columns
   - Secondary information columns
   - Maintain essential data visibility

### 3. Data Flow Patterns
```
Context Provider
└── Data Hook
    └── Service Layer
        ├── Utility Layer (Validation & Transformation)
        └── API Calls
```

### 4. Backend Architecture
The backend follows a layered architecture with centralized utilities:
- Route handlers for endpoint logic
- Shared utility modules for common operations
- Centralized error handling
- Standardized response formatting
- Type-safe data transformations

## Development Guidelines

### Component Development
1. Follow consistent layout patterns:
   ```tsx
   // Parent component structure
   <div className="space-y-6">
     <SectionHeader
       title="Section Title"
       description="Section description"
       icon={Icon}
     />
     <div className="w-full">
       <MainContent />
     </div>
   </div>
   ```

2. Use shared components for consistency:
   ```tsx
   // Use SectionHeader for page headers
   <SectionHeader
     title="Section Title"
     description="Section description"
     icon={Icon}
   />
   ```

2. Always maintain provider hierarchy:
   ```
   CategoryProvider
   └── FoodItemProvider
   ```

2. Toast messages:
   - Use useMessage hook
   - Include success/error states
   - Keep messages concise
   - Support i18n (planned)

### State Management Rules
1. Context Updates:
   - Use appropriate context hooks
   - Handle loading states
   - Implement error boundaries
   - Maintain provider order

2. Data Fetching:
   - Categories have auto-polling
   - Implement manual refresh triggers
   - Handle visibility state changes
   - Use optimistic updates carefully

### Error Handling
1. Toast Messages:
   - User-friendly messages
   - Technical details in console
   - Consistent error patterns
   - Action-based recovery

2. Form Validation:
   - Client-side validation first
   - Server validation handling
   - Clear error messages
   - Field-level feedback

## Common Maintenance Tasks

### Adding New Components
1. Follow shadcn/ui installation pattern:
   ```bash
   npx shadcn@latest add [component-name]
   ```
2. Check for existing implementations
3. Update documentation
4. Test mobile responsiveness

### Modifying Providers
1. Update interface definitions
2. Maintain backward compatibility
3. Update dependent components
4. Add migration documentation

### Updating Data Models
1. Update type definitions
2. Modify context providers
3. Update form validations
4. Test bulk operations

## Troubleshooting Guide

### Common Issues
1. Context Provider Errors:
   - Check provider hierarchy
   - Verify hook usage location
   - Check for circular dependencies

2. State Update Issues:
   - Verify update triggers
   - Check refresh mechanisms
   - Validate data flow
   - Review optimistic updates

3. Component Rendering:
   - Check provider wrapping
   - Verify data availability
   - Review loading states
   - Check error boundaries

### Debug Procedures
1. Component Issues:
   - Check React DevTools
   - Verify context values
   - Review component tree
   - Check props drilling

2. Data Flow Issues:
   - Monitor network calls
   - Check state updates
   - Review error logs
   - Validate data transforms

## Future Considerations

### Planned Features
1. Language Management:
   - ✅ Implemented with 60+ language support
   - ✅ Form-based management with Zod validation
   - ✅ Responsive grid layout (2-6 columns)
   - ✅ Toast notifications integration
   - ✅ Performance warning dialog for 10+ languages
   - Future enhancements:
     - Backend integration
     - State persistence
     - Performance optimizations

2. Translation System:
   - Enhanced text handling implementation:
     - ViewTextDialog component for expandable text
     - 2,000 character limit with validation
     - Tooltip-enhanced expand buttons
     - Proper whitespace and scroll handling
     - Accessibility-compliant expansion
   - Data model improvements:
     - Migrated to originalText/translatedText structure
     - Enhanced form validation with new model
     - Updated table presentation
     - Improved state management
   - Next steps:
     - Backend integration
     - Search implementation
     - Performance optimization

3. Shopping List:
   - Print layout
   - Mobile optimization
   - Data export

### Recently Completed Features
1. Language Management Search:
   - Command component integration ✅
   - Table pattern width matching ✅
   - Real-time filter behavior ✅
   - Fixed border rendering ✅

1. Test Suite:
   - Currently archived
   - Restoration process documented
   - Migration path planned

2. Component Library:
   - Regular updates needed
   - Breaking change reviews
   - Dependency management

## Contact & Support
- Project Repository: [Link to repo]
- Documentation: /docs directory
- Issue Tracking: [Link to issue tracker]