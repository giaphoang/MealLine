# Analysis of `languageCode` Usage and Migration Strategy

## Overview
The project has migrated from using ISO language codes (e.g., 'es', 'fr') to full language names (e.g., 'Spanish', 'French'). This analysis identifies remaining instances of `languageCode` and proposes strategies to eliminate them.

## Current Status
According to the database schema in `schema.prisma`, the database migration has been completed:
- The `Language` model no longer includes a `code` field
- The `TranslatedDocument` model has been updated to use `language` instead of `languageCode`

However, there are still references to `languageCode` in the codebase that need to be addressed.

## File-by-File Analysis

### 1. `/packages/frontend/src/services/translation/index.ts`

**Current usage:**
- `languageCode` appears in the `TranslationMetrics` interface in the `responseTimes` array
- It's used alongside `language` (full name) in metrics reporting

**Recommendation:**
- Remove `languageCode` field from the `TranslationMetrics` interface
- Update backend API to only return language names in metrics
- Update any frontend code consuming this field to use `language` instead

**Impact:**
- Medium. Requires backend API changes to stop returning `languageCode`

### 2. `/packages/frontend/src/services/template/index.ts`

**Current usage:**
- `languageCode` appears in multiple interfaces: `TranslationProgress`, `Translation`
- Used in API endpoints like `getTranslationProgress`, `downloadTranslation`, `deleteTranslation`

**Recommendation:**
- Rename all instances of `languageCode` to `language` in interfaces
- Update method parameters to use `language` instead of `languageCode`
- Update API endpoints to use `language` parameter

**Impact:**
- High. Required changes to multiple methods and API calls

### 3. `/packages/frontend/src/lib/utils.ts`

**Current usage:**
- Contains `normalizeLanguageCode` utility function
- This function normalizes language code strings by trimming and converting to lowercase

**Recommendation:**
- Rename function to `normalizeLanguage`
- Keep functionality but update JSDoc to indicate it's for language names
- Update all imports/usages of this function

**Impact:**
- Low. Simple rename with minimal impact

### 4. `/packages/frontend/src/hooks/dashboard/useTranslationMetricsData.ts`

**Current usage:**
- Similar to the translation service, contains `languageCode` in the `TranslationMetrics` interface
- The hook fetches metrics data including both `language` and `languageCode`

**Recommendation:**
- Remove `languageCode` field from the interface
- Update any component using this hook to only reference `language`

**Impact:**
- Low. Only requires interface change and consumer updates

### 5. `/packages/frontend/src/components/ui/language-filter/index.tsx`

**Current usage:**
- Uses `normalizeLanguageCode` utility
- Contains a `getLanguageName` function that tries to find a language by both name and code (for backward compatibility)

**Recommendation:**
- Update imports to use renamed `normalizeLanguage` function
- Simplify the `getLanguageName` function to only search by name
- Remove the code-based fallback search

**Impact:**
- Low. Simplification of existing code

### 6. `/packages/backend/src/services/storage/reconciliation.ts`

**Current usage:**
- Uses `languageCode` in reconciliation methods for translations
- Constructs keys like `${documentId}-${languageCode}` for identifying translations

**Recommendation:**
- Rename all parameters and variables from `languageCode` to `language`
- Ensure reconciliation process uses language names consistently

**Impact:**
- Medium. Multiple changes but straightforward replacements

### 7. `/packages/backend/src/services/docx/translation.ts`

**Current usage:**
- Similar to reconciliation service, uses `languageCode` in method parameters and local variables
- Also contains some documentation referring to language codes

**Recommendation:**
- Rename all parameters and variables from `languageCode` to `language`
- Update documentation to refer to language names
- Update any remaining language code references in error messages or logs

**Impact:**
- Medium. Straightforward replacements but several occurrences

### 8. `/packages/backend/scripts/migrate-translations-to-names.ts` and
### 9. `/packages/backend/scripts/complete-language-migration.ts`

**Current usage:**
- These are migration scripts that were part of the transition from codes to names
- They contain mappings from language codes to names and logic to update database records

**Recommendation:**
- No changes needed, as these are historical migration scripts
- Consider adding a comment at the top noting these are completed migrations
- Could be moved to an 'archived_migrations' folder if desired

**Impact:**
- None. These scripts have served their purpose

## Overall Strategy

1. Start with the simplest changes:
   - Rename the utility function in `utils.ts`
   - Update the language filter component

2. Update frontend interfaces and API calls:
   - Remove `languageCode` from metrics interfaces
   - Update template service to use `language` consistently

3. Update backend services:
   - Modify reconciliation and translation services to use `language` consistently

4. Test thoroughly:
   - Verify all language-related features work with full names only
   - Ensure no regressions in existing functionality

5. Document the completed migration:
   - Update relevant documentation to reflect the completed transition
   - Remove any remaining references to language codes in documentation

6. Consider archiving migration scripts:
   - Place completed migration scripts in an archive folder

This phased approach minimizes risk while systematically eliminating all remaining instances of `languageCode` from the codebase.