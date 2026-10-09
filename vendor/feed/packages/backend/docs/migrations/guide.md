# Migration Guide

This document provides comprehensive instructions for handling database migrations in the FEED application.

## Table of Contents

- [Overview](#overview)
- [Creating Migrations](#creating-migrations)
- [Running Migrations](#running-migrations)
- [Migration History](#migration-history)
- [Troubleshooting](#troubleshooting)

## Overview

The FEED application uses Prisma for database schema management and migrations. Since the application uses SQLite, certain limitations apply to the migration process.

Key points:
- SQLite doesn't support all schema changes (e.g., dropping columns)
- Some migrations may require custom SQL and data transformation
- Migration scripts are version-controlled and applied sequentially

## Creating Migrations

### Automatic Migrations

The simplest way to create migrations is to modify the `schema.prisma` file and let Prisma generate the migration:

1. Update the schema in `prisma/schema.prisma`
2. Generate the migration:

```bash
cd packages/backend
npx prisma migrate dev --name descriptive_migration_name
```

This command will:
- Detect changes between your current schema and the database
- Create a migration file in `prisma/migrations/YYYYMMDDHHMMSS_descriptive_migration_name`
- Apply the migration to your development database

### Manual Migrations

For complex changes that SQLite can't handle automatically:

1. Create a migration without applying it:

```bash
cd packages/backend
npx prisma migrate dev --name descriptive_migration_name --create-only
```

2. Edit the generated SQL file in `prisma/migrations/YYYYMMDDHHMMSS_descriptive_migration_name/migration.sql`
3. Apply the modified migration:

```bash
npx prisma migrate dev
```

### Adding Custom JavaScript Migrations

For complex data transformations, create a JavaScript migration script:

1. Create a script in the `scripts` directory:

```typescript
// scripts/migrate-your-feature.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function migrate() {
  console.log('Starting data migration...')
  
  try {
    // Your migration logic here
    // Example:
    const items = await prisma.yourModel.findMany()
    
    for (const item of items) {
      await prisma.yourModel.update({
        where: { id: item.id },
        data: {
          // Transform data here
        }
      })
    }
    
    console.log('Migration completed successfully')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

migrate()
```

2. Run the script after applying database schema migrations:

```bash
cd packages/backend
npx ts-node scripts/migrate-your-feature.ts
```

## Running Migrations

### Development Environment

To apply all pending migrations in development:

```bash
cd packages/backend
npx prisma migrate dev
```

To reset the database (⚠️ loses all data):

```bash
npx prisma migrate reset
```

### Production Environment

For production deployments:

```bash
cd packages/backend
npx prisma migrate deploy
```

This applies all pending migrations without prompting, making it suitable for CI/CD pipelines.

### Checking Migration Status

To see which migrations have been applied:

```bash
npx prisma migrate status
```

## Migration History

This section lists the major migrations in the project history:

### Initial Migration (20250313152835)

- Created base database schema with core models
- Added Category, FoodItem, and Translation models

### Document-to-Translation Relationship (20250317000000)

- Added relationship between Document and Translation models
- Enabled tracking cached translations associated with documents

### Language Code Field Renaming (20250317010000, 20250318032721)

- Renamed `languageCode` fields to `language` for consistency
- Updated all related foreign keys and constraints

### Category Icon Addition (20250329055153)

- Added icon field to categories
- Default: "package"

### Shopping List Title Text (20250415000000)

- Added title text support to shopping list sections
- Enhanced shopping list customization

### Saved Custom Text (20250416000000)

- Added SavedCustomText model for reusable text blocks
- Supports both title and regular text

## Troubleshooting

### Migration Failed: Column Already Exists

This usually happens when trying to add a column that was already added manually:

```
Migration `20250329055153_add_icon_to_categories` failed
Column `icon` already exists in table `Category`
```

**Solution:** Edit the migration SQL to check if the column exists before adding it:

```sql
-- Original:
ALTER TABLE "Category" ADD COLUMN "icon" TEXT DEFAULT 'package';

-- Fixed:
SELECT CASE 
  WHEN NOT EXISTS(SELECT 1 FROM pragma_table_info('Category') WHERE name = 'icon') 
  THEN 'ALTER TABLE "Category" ADD COLUMN "icon" TEXT DEFAULT "package"'
END
| sqlite3 dev.db
```

### Reset Failed: Database Is Locked

```
Error: Database `dev.db` is locked.
```

**Solution:** 
1. Ensure all database connections are closed
2. Check for running processes that might be using the database
3. If all else fails, create a backup, delete the database file, and restore from backup

### Migration Failed: Foreign Key Constraint

This happens when trying to change a field that has foreign key references.

**Solution:** Create a multi-step migration:
1. Create a new field
2. Create a script to copy data from old field to new field
3. Update references to use the new field
4. Drop the old field (if SQLite allows)