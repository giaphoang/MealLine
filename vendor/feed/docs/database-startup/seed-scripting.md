# Database Seed Scripting

## Overview

The seed-all.ts script provides comprehensive database initialization for fresh installations. Populates essential data structures required for application functionality.

## Script Location
`packages/backend/scripts/seed-all.ts`

## Execution
```bash
cd packages/backend
npx ts-node scripts/seed-all.ts
```

## Docker Compose (Container Deployments)

When using Docker images, run the seed script via the `seed` service profile:

```bash
# Local (uses .env.local overrides)
docker compose -f /Users/russbook/wth_app_clean/docker-compose.yml \
  -f /Users/russbook/wth_app_clean/docker-compose.local.yml \
  --profile seed run --rm seed

# Production (Pi)
docker compose --profile seed run --rm seed
```

## Data Population Sequence

### 1. Global Limit
Creates default limit value of 10 for "No Limit" items.

### 2. Languages (59 languages)
- English and Russian enabled by default
- All others disabled by default
- Sorted by global usage priority

### 3. System Prompts
- Shopping List Auto-Format (Classification)
- DOCX Low Temperature (Batch Translation)

### 4. Categories (8 categories)
Based on William Temple House shopping list structure:
- Canned Goods (limit: 10)
- Beans (limit: 10)
- Produce (limit: 100)
- Meats (limit: 1, household)
- Frozen (limit: 10)
- Dry Goods (limit: 10)
- Dairy (limit: 10)
- Hygiene Items (limit: 5)

### 5. Food Items (67 items)
Complete inventory matching actual shopping list with accurate limits, dietary flags, and category assignments.

## Data Integrity

### Upsert Pattern
All seeding operations use upsert to prevent duplicates and allow re-running scripts safely.

### Normalization
- Names trimmed and space-normalized
- Search fields lowercased for consistency
- Icon assignments standardized

### Dependency Management
Categories created before food items to satisfy foreign key constraints.

## Verification Output

Script provides detailed logging:
- Individual item creation confirmation
- Category-wise item counts
- Final database summary with totals
- Error reporting for any failures

## Customization Points

### Modifying Categories
Update `categories` array with desired names, limits, and icons.

### Modifying Food Items
Update `foodItems` array with:
- Accurate names from shopping lists
- Proper limit values
- Correct dietary flags (vegan, vegetarian, glutenFree, etc.)
- Category name references

### Adding New Data Types
Follow established pattern:
1. Add data array
2. Create seeding function
3. Add to main() execution sequence
4. Include in final summary

## Testing

Run script against empty database to verify:
- All expected records created
- No constraint violations
- Proper category-item relationships
- Accurate counts in summary output

## Maintenance

Update script when shopping list changes occur. Maintain data accuracy through regular reconciliation with actual pantry operations.
