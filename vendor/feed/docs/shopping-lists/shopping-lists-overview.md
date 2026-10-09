# Shopping Lists Overview

## Business Purpose

The Shopping Lists feature enables William Temple House food Social Services staff to generate standardized, multilingual shopping lists for clients based on current inventory data. This system replaces manual list creation with automated, consistent, and culturally accessible documentation.

## Core Value Propositions

### 1. **Operational Efficiency**
- **Automated List Generation**: Transform inventory data into formatted shopping lists instantly
- **Template Reusability**: Create once, generate repeatedly with current inventory
- **Reduced Manual Work**: Eliminate handwritten or manually formatted lists
- **Consistent Formatting**: Standardized layout across all generated lists

### 2. **Cultural Accessibility**
- **Multilingual Support**: Generate lists in client's preferred language
- **Bilingual Options**: Show both translated and English names for food items
- **Cultural Food Names**: Use familiar terminology for diverse client populations
- **Reduced Language Barriers**: Improve client understanding and food selection

### 3. **Inventory Integration**
- **Real-time Data**: Lists reflect current food availability and limits
- **Automatic Updates**: Changes to inventory immediately reflected in new lists
- **Limit Enforcement**: Display maximum quantities per item or category
- **Status Awareness**: Only show items currently in stock

### 4. **Client Experience Enhancement**
- **Clear Instructions**: Translated headers and guidance text
- **Organized Layout**: Items grouped by food category for easier navigation
- **Limit Transparency**: Clear quantity limits prevent misunderstandings
- **Special Requests**: Space for client-specific needs and preferences

## User Workflows

### Primary Users
- **Food Social Services Staff**: Create templates, generate lists, print documents
- **Volunteers**: Generate lists for client appointments
- **Administrative Staff**: Manage templates and system configuration

### Core User Journeys

#### 1. Template Creation Workflow
```
Staff Member → Create New Template → 
Configure Section Types → Set Layout Options → 
Save Template → Template Available for Generation
```

#### 2. List Generation Workflow
```
Client Appointment → Select Template → 
Generate Current List → Review Items → 
Print/Export → Provide to Client
```

#### 3. Template Management Workflow
```
Review Templates → Update Sections → 
Modify Section Configuration → Adjust Settings → 
Save Changes → Templates Updated for Future Use
```

The Shopping Lists saved-template table now keeps pagination in place after row actions refresh data. Rows display section chips for each section-table component so staff can scan template contents before opening a template. Selected rows support bulk Download, Duplicate, and Delete actions; bulk Delete opens a confirmation before permanently removing saved templates.

## Feature Scope

### Phase 1: Core Functionality (Minimum Viable Implementation) ✅
- Basic template creation and management
- Three section types: custom-text, form, category
- Inventory data integration with dynamic loading
- Standard print formatting (HTML-based)

### Phase 2: Backend Integration 🆙 **IN PROGRESS**
- Database schema implementation (3 tables)
- API endpoints for templates and instances
- Template-to-instance generation pipeline
- Instance storage for reprinting capability

### Phase 3: Advanced Section Features 📅
- Enhanced form field configuration
- Category filtering (dietary restrictions, item status)
- Custom text styling and formatting options
- Advanced template validation

### Phase 4: Multilingual Support 📅
- Template translation system with existing Translation table integration
- Bilingual food item display (render-time generation)
- UI text localization using existing infrastructure
- Template language settings and bilingual mode controls

### Phase 5: Advanced Features 📅
- PDF export capabilities (alternative to HTML print)
- Email/digital delivery options
- Client preference tracking
- Historical list analytics
- Bulk template operations

### Phase 6: Integration Enhancements 📅
- Client management system integration
- Appointment scheduling coordination
- Inventory forecasting insights
- Staff workflow optimization

## Architectural Decisions ✅ **FINALIZED**

### Core Design Principles

#### Template-Instance Model
- **Templates**: Reusable configurations that reference live inventory data
- **Instances**: Point-in-time generated lists stored for reprinting capability
- **Live Data**: Templates use foreign keys to current categories and food items
- **Safeguards**: Protection against data changes breaking existing templates

#### Section Type Architecture
- **Custom Text Sections**: User-defined text blocks insertable anywhere in document
- **Form Sections**: Configurable form elements for data collection (starting with client info)
- **Category Sections**: Dynamic loading of all in-stock items from selected categories

#### Translation Strategy (Deferred to Phase 4)
- **Extend Existing System**: Leverage current Translation table infrastructure
- **Bilingual Rendering**: Generate bilingual display at render time, not storage
- **Template Control**: Boolean setting enables/disables English alongside translations
- **Format**: Translated text with English in smaller type below (e.g., "Яйца" with "Eggs" below)

#### Limits Logic
- **Not Hierarchical**: Complex interaction between multiple limit types
- **Individual Item Limits**: FoodItem.limit takes highest priority when set
- **Category Limits**: Apply to category as whole (e.g., "Dairy = 3 items max")
- **Global Limit**: Fallback for "No Limit" items (practical constraint, e.g., 20)
- **Override Capability**: Individual items can exceed Global Limit when explicitly set

#### Export Strategy
- **HTML Print Preferred**: Avoid PDF complexity, use print stylesheets
- **Instance Storage**: Save generated lists for reprinting and historical access
- **Template Preservation**: Maintain templates separately for ongoing use

## System Requirements

### Functional Requirements
1. **Template Management**
   - Create, edit, delete shopping list templates
   - Configure three section types with specific options
   - Support multiple layout formats
   - Template validation and integrity checks

2. **List Generation**
   - Generate lists from templates using current inventory
   - Apply item availability and limit rules
   - Format output for printing
   - Instance storage for reprinting

3. **Inventory Integration**
   - Pull real-time food item data for category sections
   - Respect item limits and availability status
   - Group items by food categories
   - Handle out-of-stock scenarios gracefully

4. **Section Management**
   - Custom text sections with style and positioning controls
   - Form sections with configurable field layouts
   - Category sections with dynamic item loading

### Non-Functional Requirements
1. **Performance**
   - Generate lists in under 3 seconds
   - Handle 100+ items per list efficiently
   - Support concurrent list generation

2. **Usability**
   - Intuitive template creation interface
   - One-click list generation
   - Print-optimized layouts
   - Mobile-friendly administration

3. **Reliability**
   - Graceful handling of missing data
   - Error recovery for template configuration issues
   - Fallback mechanisms for broken references

## Business Rules

### Item Selection Rules
1. **Availability**: Only include items marked as "In Stock"
2. **Limits**: Display individual item limits or category maximums
3. **Categories**: Group items by their assigned food category
4. **Dynamic Loading**: Category sections pull all available items automatically

### Section Configuration Rules
1. **Custom Text**: User controls content, style, and positioning
2. **Form Sections**: Configurable fields with validation options
3. **Category Sections**: Reference live inventory data via foreign keys
4. **Section Ordering**: User-controlled drag-and-drop arrangement

### Template Rules
1. **Flexibility**: Templates adapt to current inventory automatically
2. **Instance Tracking**: Generated lists maintain relationship to source template
3. **Access Control**: Only authorized staff can modify templates
4. **Validation**: System prevents invalid template configurations

## Success Metrics

### Operational Metrics
- **List Generation Time**: < 3 seconds per list
- **Template Usage**: Average templates used per week
- **Print Volume**: Number of lists printed daily
- **Error Rate**: < 1% failed generations

### User Experience Metrics
- **Staff Adoption**: Percentage of staff using digital lists vs manual
- **Template Reusability**: Average instances generated per template
- **Configuration Time**: Time to create new templates
- **Print Quality**: Feedback on formatted output

### System Health Metrics
- **Data Accuracy**: Lists match current inventory status
- **Template Maintenance**: Frequency of template updates needed
- **System Uptime**: Availability during operating hours
- **Performance**: Average list generation time

## Seed Data Structure

The database seeding system populates baseline food items and categories derived from William Temple House's physical shopping list. The seed data ensures functional system state from fresh installations.

### Category Structure (8 categories)
- **Canned Goods**: limit 10
- **Beans**: limit 10  
- **Produce**: limit 100
- **Meats**: limit 1 (household)
- **Frozen**: limit 10
- **Dry Goods**: limit 10
- **Dairy**: limit 10
- **Hygiene Items**: limit 5

### Food Item Data (67 items)
All seed food items include complete dietary flag specifications:
- `vegan`, `vegetarian`, `glutenFree`, `organic`, `halal`, `kosher`, `readyToEat`
- Accurate limit values matching shopping list constraints
- Proper category assignments via foreign key references
- Realistic dietary classifications based on food composition

### Data Consistency
Seed objects maintain uniform property structures to prevent TypeScript compilation errors. All dietary flags explicitly declared on every food item object rather than relying on backend nullish coalescing.

## Integration Dependencies

### Internal Systems
- **Category Management**: Food categories for section organization
- **Food Item Management**: Inventory data and item limits
- **Global Limit Management**: Fallback constraints for "No Limit" items
- **User Authentication**: Staff access control

### Future Integration (Post-MVP)
- **Translation Management**: Multilingual content support
- **Language Management**: Enabled language configuration
- **Document Storage**: Generated list archival
- **Backup Systems**: Template and configuration backup

## Risk Considerations

### Technical Risks
- **Data Synchronization**: Inventory changes during list generation
- **Print Formatting**: Layout issues across different printers
- **Performance Degradation**: Large inventories may slow generation
- **Template Corruption**: Invalid configurations breaking list generation

### Operational Risks
- **Staff Training**: Learning curve for new template system
- **Template Maintenance**: Outdated templates with incorrect information
- **Dependency Failures**: System unavailable during critical times
- **Data Loss**: Template or instance data corruption

### Mitigation Strategies
- **Manual Review**: Staff review of generated lists before distribution
- **Fallback Procedures**: Paper-based backup process for system outages
- **Regular Testing**: Automated testing of list generation accuracy
- **User Training**: Comprehensive staff training on system usage
- **Data Backup**: Regular template and configuration backups

---

*This overview provides the foundational understanding for shopping list feature development and will guide implementation decisions.*
