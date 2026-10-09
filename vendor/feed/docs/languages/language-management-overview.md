# Language Management Overview

This document explains the architecture and workflow of the Language Management feature. The system allows administrators to enable or disable translation languages and controls what happens to existing translations when a language is deactivated.

## Purpose

Language Management provides fine‑grained control over the languages supported throughout the application. Administrators can:

- Enable or disable any of the 60+ languages shipped with the system
- Preserve or delete translations when disabling languages
- Monitor how many translations exist for a language before removal
- Ensure newly enabled languages automatically receive translations for existing content

## Frontend Architecture

The React components live in `packages/frontend/src/components/language-management/` and rely on a dedicated context for state.

- **`LanguageManagement/index.tsx`** – Page wrapper that places `LanguageProvider` around the main form
- **`LanguageSelectionForm.tsx`** – Renders the searchable list of language checkboxes and handles form submission
- **`LanguageFilter.tsx`** – Search input for filtering the list client‑side
- **`LanguageWarningDialog.tsx`** – Appears when the user selects ten or more languages to warn about performance impacts
- **`LanguageDeactivationDialog.tsx`** – Offers options to deactivate only or deactivate and delete translations
- **`LanguageContext.tsx`** – Provides `languages`, loading state, and actions like `updateLanguages` and `getTranslationCount`
- **`LanguageService`** – Wrapper around the backend API with input validation
- **`ErrorHandlerService`** – Centralized error handling for consistent user-friendly error messages

The form uses `react-hook-form` with a Zod schema to ensure at least English is selected. When languages are updated, the context sends a bulk update request and refreshes its state.

## Backend API

Routes are defined in `packages/backend/src/routes/languages.ts` and use Prisma for database access.

- `GET /api/languages` – Return all languages with enabled status
- `GET /api/languages/enabled` – Return only enabled languages
- `POST /api/languages/translation-count` – Return how many translations exist for the specified languages
- `PUT /api/languages/bulk` – Update multiple language states with optional `preserveTranslations` flag

The bulk route processes updates in a transaction, then uses the `translationAuditor` service to handle newly enabled or disabled languages. When a language is disabled without `preserveTranslations`, all related translations are deleted.

## Translation Integration

When new languages are enabled, the translation auditor queues translations for all existing categories, food items, and custom texts that lack a translation. It also cleans up duplicates after processing. Disabled languages may retain translations if `preserveTranslations` is set, otherwise the auditor removes them.

The `translation-trigger` service determines which languages are enabled when queuing translations for content updates.

## Default Languages

A seed script ensures that **English** and **Russian** are enabled by default for new installations. To change the defaults, modify the seed file and create a migration as described in `docs/translation-system/language-initialization.md`.

## Known Issues

- The search filter only matches language names; there is no fuzzy matching or multi‑field search.
- Bulk enabling a large number of languages can overload translation queues, so the warning dialog appears when selecting ten or more.

## Future Improvements

- Add pagination or virtual scrolling for extremely long language lists
- Provide analytics on translation counts and usage per language
- Allow restoring deleted translations if a language is re‑enabled
