# Language Initialization System

## Overview

The Language Initialization System ensures that specific languages are enabled by default in every fresh installation of the application. This document explains how the system works and how to modify default language settings.

## Default Languages

The following languages are enabled by default:
- **English** (en): The primary language that cannot be disabled
- **Russian** (ru): The default secondary language

## How Default Languages Are Set

The system uses multiple mechanisms to ensure these defaults are properly set:

### 1. Database Seeding

When Prisma initializes a new database, it runs the seed script defined in `package.json`:

```json
"prisma": {
  "seed": "ts-node scripts/seed-languages.ts"
}
```

The seed script (`scripts/seed-languages.ts`) contains logic to enable specific languages:

```typescript
isEnabled: language.code === 'en' || language.code === 'ru'
```

This ensures that both English and Russian are enabled when the database is first created.

### 2. Database Migration

A permanent migration (`20250226235959_default_russian_enabled`) contains SQL that explicitly enables Russian:

```sql
UPDATE "Language" SET "isEnabled" = true WHERE "code" = 'ru';
```

This migration runs automatically when the database is migrated, ensuring Russian is enabled even if the seed script has not run.

### 3. Manual Enablement Script

For existing installations, a standalone script is provided to enable Russian:

```bash
cd packages/backend
node enable-russian.js
```

This script checks if Russian exists and is enabled, and enables it if necessary.

## Modifying Default Languages

To change which languages are enabled by default:

### Adding a Default Language

1. Update the seed script in `packages/backend/scripts/seed-languages.ts`:
   ```typescript
   isEnabled: language.code === 'en' || language.code === 'ru' || language.code === 'YOUR_LANGUAGE_CODE'
   ```

2. Create a new migration:
   ```bash
   npx prisma migrate dev --name enable_your_language
   ```

3. Add the SQL to the new migration file:
   ```sql
   UPDATE "Language" SET "isEnabled" = true WHERE "code" = 'YOUR_LANGUAGE_CODE';
   ```

### Removing a Default Language

1. Update the seed script to remove the language from the default enabled list
2. Create a migration that disables it by default

## Testing Language Initialization

To verify that language initialization works correctly:

1. Reset the database:
   ```bash
   rm packages/backend/dev.db
   npx prisma migrate deploy
   ```

2. Check that Russian is enabled:
   ```bash
   node packages/backend/scripts/enable-russian.ts
   ```

3. Verify in the UI that both English and Russian are enabled by default

## Notes

- English is a special case and cannot be disabled through the UI
- The order of language display is determined by the `sortOrder` field
- Migrations will always run in order, ensuring consistent results
