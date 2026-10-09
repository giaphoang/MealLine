# Translation Recovery Migration Guide

## Overview

The Translation Recovery System introduced in version 0.9.43 requires a database migration to add a `metadata` field to the Translation table. This guide explains how to apply the migration and re-enable the full functionality of the recovery system.

## Migration Status

As of version 0.9.44, the recovery system has been patched to work without requiring the migration to be applied immediately. This was done to ensure the system remains functional during the transition period. However, for full functionality (including proper tracking of retried translations), the migration should be applied.

## Applying the Migration

### Option 1: Using Prisma CLI (Recommended)

1. Navigate to the backend directory:
   ```bash
   cd packages/backend
   ```

2. Run the Prisma migration:
   ```bash
   npx prisma migrate dev --name add_translation_metadata
   ```

3. This will:
   - Apply the migration to your database
   - Generate an updated Prisma client
   - Update your prisma/schema.prisma file if needed

### Option 2: Manual SQL Execution

If you prefer to apply the migration manually, you can execute the SQL directly:

1. For SQLite (current database):
   ```sql
   ALTER TABLE "Translation" ADD COLUMN "metadata" TEXT;
   ```

2. For PostgreSQL (if migrating in the future):
   ```sql
   ALTER TABLE "Translation" ADD COLUMN "metadata" JSONB;
   ```

3. For MySQL/MariaDB (if migrating in the future):
   ```sql
   ALTER TABLE `Translation` ADD COLUMN `metadata` JSON;
   ```

## Verifying the Migration

After applying the migration, you can verify it was successful by:

1. Checking the database structure:
   ```bash
   npx prisma db pull
   ```

2. Inspecting the schema:
   ```bash
   npx prisma introspect
   ```

3. Testing the recovery system by activating a new language and monitoring the logs.

## Re-enabling Full Functionality

Once the migration has been successfully applied, you should re-enable the full functionality in the Recovery Service by:

1. Uncommenting the metadata-related code in `src/services/translation-recovery.ts`
2. Ensuring the schema.prisma file includes the metadata field as Json?
3. Running a production build to update the Prisma client

## Rollback Plan

If issues are encountered with the migration, the temporary implementation in version 0.9.44 will continue to function without the metadata field. This provides a safe fallback while the migration issues are resolved.
