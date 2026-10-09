# Shopping Lists Information Architecture

## Analysis of Current Shopping List Format

Based on the provided shopping list samples (English and Chinese versions), the following information architecture emerges:

### Document Structure

#### Header Section
- **Document Title**: "(Week of [DATE]) Pantry Shopping List"
- **List Number**: Sequential identifier (#___)
- **Language-specific formatting**: Title translates but maintains structure

#### Client Information Section
- **Client Name**: Text field
- **Household Size**: "# of People in Household" / "家庭人数"
- **Dietary Restrictions**: "Allergies or Diet Restrictions" / "过敏或饮食限制"
- **Bag Capacity**: "# of Bags you can carry" / "您能拿多少袋"

#### Inventory Sections
Each section contains:
- **Section Header**: Category name (translated)
- **Column Headers**: "Quantity" / "数量", "Limit" / "限额"
- **Items List**: Food items with limits

**Observed Categories:**
1. **Canned Goods** / **罐头食品**
2. **Beans** / **豆类** 
3. **Dry Goods** / **干货**
4. **Meats** / **肉类**
5. **Produce** / **农产品**
6. **Frozen** / **冷冻**
7. **Dairy** / **乳制品**

#### Footer Section
- **Special Requests**: "If you are looking for something specific, please write here:"
- **Page Navigation**: "Please turn paper over →" / "请翻转纸张→"

### Translation Complexity Analysis

#### Three Translation Levels Identified:

1. **UI Text Translation**
   - Headers, instructions, column labels
   - Complete replacement of English with target language
   - Static content that changes per language

2. **Category Translation**
   - Food category names
   - Complete translation (e.g., "Canned Goods" → "罐头食品")

3. **Food Item Translation**
   - **Bilingual Format**: Chinese name + English in parentheses
   - Examples: "羽衣甘蓝 (Collard Greens)", "番茄丁 (Diced Tomatoes)"
   - **Monolingual Format**: English only in English version
   - **Complex Items**: Some items have descriptors (e.g., "limited", "shelf stable", "precooked")

### Data Architecture Requirements

#### Core Entities Needed

#### Core Entities Needed (Minimum Viable Implementation)

##### 1. ShoppingListTemplate
```typescript
{
  id: string
  name: string
  description?: string
  language: string // 'en', 'zh', 'es', etc. (for future bilingual support)
  layoutType: 'full-page' | 'split-page' | 'grid-2x2' | 'grid-2x3' | 'grid-2x4'
  isActive: boolean
  sections: ShoppingListSection[]
  createdAt: Date
  updatedAt: Date
}
```

##### 2. ShoppingListSection
```typescript
{
  id: string
  templateId: string
  sectionType: 'custom-text' | 'form' | 'category'
  categoryId?: string // Foreign key to existing Category table (nullable)
  displayOrder: number
  isEnabled: boolean
  title?: string // Override default section title
  configuration: JSON // Section-specific settings
}
```

##### 3. ShoppingListInstance
```typescript
{
  id: string
  templateId: string // Foreign key to source template
  generatedData: JSON // Complete rendered shopping list
  title: string // Descriptive name for the instance
  generatedAt: Date
  generatedBy?: string // User who generated the list
}
```

#### Section Type Specifications

##### Custom Text Sections
- **Purpose**: User-defined text blocks insertable anywhere in document
- **Configuration**: `{ text: string, style: 'title' | 'body' | 'instruction', alignment: 'left' | 'center' | 'right' }`
- **Use Cases**: Instructions, disclaimers, custom messaging

##### Form Sections  
- **Purpose**: Configurable form elements for data collection
- **Configuration**: `{ fields: FormField[], layout: 'vertical' | 'horizontal' }`
- **Current Use Case**: Client information (name, household size, allergies, bag capacity)
- **Future Flexibility**: Any type of form data collection

##### Category Sections
- **Purpose**: Display food items from a specific category
- **Configuration**: `{ showLimits: boolean, showQuantityColumn: boolean }`
- **Implementation**: Pull all in-stock FoodItems dynamically via categoryId
- **Future Enhancement**: Add filtering rules for dietary restrictions

#### Translation Strategy ✅ **DECIDED (Future Implementation)**

**Selected Approach: Extend Existing Translation System**
- Leverage existing `Translation` table for categories and food items
- Add UI text translations for shopping list interface
- Use existing language management system
- **Bilingual Rendering**: Handle bilingual display (e.g., "Яйца (Eggs)") at render time
- **Boolean Control**: Template setting controls whether to show English alongside translation
- **Rendering Logic**: Original English shown beneath translated text in smaller type

**Note**: Bilingual support is deferred to post-MVP phase for implementation simplicity

#### Database Schema Considerations ✅ **DECIDED**

##### Foreign Key Strategy: Live References with Safeguards
**Decision**: Use direct foreign key references for dynamic, current data

```sql
-- Primary relationships (RECOMMENDED APPROACH)
ShoppingListSection.categoryId → Category.id
Category.id → Translation.entityId (where entityType = 'category')
FoodItem.categoryId → Category.id
FoodItem.id → Translation.entityId (where entityType = 'food_item')
```

**Rationale**: 
- Shopping lists must reflect current inventory status and limits
- Templates are configurations, not frozen snapshots
- Live data ensures operational accuracy

**Safeguards**:
- Add `isActive` flags to prevent accidental deletion of referenced categories
- Implement template validation for missing references
- Create graceful fallbacks for missing data
- Add template versioning for major changes

##### New Translation Keys Needed
```typescript
// UI Text translations needed
const SHOPPING_LIST_UI_KEYS = [
  'shopping_list.title_prefix', // "(Week of {date}) Pantry"
  'shopping_list.title_suffix', // "Shopping List"
  'shopping_list.client_name',
  'shopping_list.household_size',
  'shopping_list.allergies',
  'shopping_list.bag_capacity',
  'shopping_list.quantity_column',
  'shopping_list.limit_column',
  'shopping_list.special_requests',
  'shopping_list.turn_page',
  'shopping_list.please_choose_two_meats'
]
```

### Critical Architecture Decisions ✅ **ALL DECIDED**

#### 1. Translation Approach ✅ **DECIDED**
**Decision**: Generate bilingual text programmatically at render time

**Implementation**:
- Template boolean setting controls bilingual display
- Render translated text with English in smaller type below
- Use existing Translation table with rendering adjustments
- Example output: "Яйца (Eggs)" or "Яйца" with "Eggs" below

#### 2. Template vs Instance Model ✅ **DECIDED**
**Decision**: Store both templates and generated instances

**Implementation**:
- **Templates**: Reusable configurations for generating lists
- **Instances**: Print-ready documents for reprinting capability
- Track which template generated each instance
- Use server-side React‑PDF for deterministic PDF export (HTML print removed)

#### 3. Dynamic vs Static Categories ✅ **DECIDED**
**Decision**: Use live category data with foreign key references

**Implementation**:
- Templates reference current inventory and category data
- Ensure shopping lists reflect real-time availability
- Add safeguards to prevent template breakage from data changes

#### 4. Limits and Quantities ✅ **DECIDED**
**Decision**: Complex limit system with Global Limit as fallback

**Limit Logic**:
1. **Individual Item Limits**: `FoodItem.individualLimit` (highest priority when set)
2. **Category Limits**: Apply to category as whole (e.g., Dairy = 3 items max)
3. **"No Limit" Items**: Use Global Limit as practical constraint (e.g., 20)
4. **Special Cases**: Individual items can exceed Global Limit if explicitly set

**Example Scenarios**:
- Dairy category limit = 3, Milk individual limit = 1 → Client gets max 1 milk within 3 dairy items
- Milk set to "No Limit", Global Limit = 20 → Milk shows limit of 20
- Milk explicitly set to limit 30 → Milk shows limit of 30 (overrides Global Limit)

**Key Principle**: Global Limit only constrains items marked "No Limit" in database

### Performance Considerations

#### Rendering Large Lists
- Shopping lists may contain 50+ items across 7+ categories
- Translation lookup for every item during generation
- Need efficient caching strategy for translated content

#### Multi-language Support Scale
- Current system supports 59+ languages
- Shopping lists need subset of commonly used languages
- Consider template pre-generation vs real-time translation

### Integration Points

#### Existing System Dependencies
1. **Category Management System**: For section organization
2. **Food Item Management**: For inventory content
3. **Translation Management**: For multi-language support
4. **Language Management**: For enabled languages
5. **Document System**: For PDF generation and storage

#### API Requirements (Minimum Viable Implementation)
```typescript
// Template Management
GET /api/shopping-lists/templates        // List all templates
POST /api/shopping-lists/templates       // Create new template
GET /api/shopping-lists/templates/:id    // Get specific template
PUT /api/shopping-lists/templates/:id    // Update template
DELETE /api/shopping-lists/templates/:id // Delete template

// List Generation & Instance Management
POST /api/shopping-lists/generate        // Generate list from template
POST /api/shopping-lists/instances       // Save generated list instance
GET /api/shopping-lists/instances        // List saved instances
GET /api/shopping-lists/instances/:id    // Get specific instance
DELETE /api/shopping-lists/instances/:id // Delete instance

// Export Options
GET /api/shopping-lists/instances/:id/pdf-react?layout=split-page // Server-side PDF (React‑PDF)
```

#### Minimum Viable Implementation Scope

**Included in MVP:**
- Template CRUD operations with three section types
- Dynamic category section loading (all in-stock items)
- Instance generation and storage for reprinting
- Basic limits calculation using existing schema
- Server-side PDF export via React‑PDF (Split Page)

**Deferred to Future Phases:**
- Bilingual rendering and translation integration
- Advanced category filtering (dietary restrictions, etc.)
- Custom form field configuration beyond basic client info
- Template versioning and history
- Attachment filename behavior and download UX

### Remaining Questions for Resolution

1. **User Permissions**: Who can create/edit templates vs generate lists?
2. **Archive Strategy**: How long do we keep generated shopping list instances?
3. **Instance Metadata**: What additional data should we store with instances?
4. **Form Field Configuration**: How flexible should form sections be initially?
5. **Template Validation**: What validation rules should prevent invalid templates?

### Questions Resolved ✅

1. ✅ **Translation Approach**: Extend existing system, deferred to post-MVP
2. ✅ **Template vs Instance Model**: Store both for reusability and reprinting
3. ✅ **Foreign Key Strategy**: Use live references with safeguards
4. ✅ **Limits Logic**: Complex system with Global Limit fallback
5. ✅ **Export Integration**: Server-side React‑PDF is the primary export path
6. ✅ **Section Types**: Three types - custom-text, form, category
7. ✅ **Category Implementation**: Option A - dynamic loading of all in-stock items
8. ✅ **Schema Approach**: Remove experimental tables, create 3 clean tables
9. ✅ **MVP Scope**: Focus on core functionality, defer advanced features

---

*This document will be updated as architectural decisions are finalized.*
