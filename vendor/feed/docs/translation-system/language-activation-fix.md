# Translation System - Language Activation Fix

## Background

When adding support for a new language in the application, the system automatically queues translations for existing content. This ensures all content is accessible in the newly enabled language. However, an issue was identified where document-generated translations were also being queued, which was both unnecessary and resource-intensive.

## Issue Description

When a new language was enabled/activated in the system, all translation types (including 'Generated (Document)') were automatically queued for translation. This led to:

1. Unnecessary processing of document-related translations
2. Higher token usage and costs
3. Longer processing times when activating new languages
4. Potential server load issues with large numbers of document translations

## Fix Implementation

The fix modifies the language activation process to only queue translations for specific content types:

1. **Food Items** - Core inventory items that need translation
2. **Categories** - Classification groupings for food items
3. **Custom** - User-defined custom text content

Importantly, it now **excludes**:
- **Generated (Document)** - Text segments extracted from uploaded documents

This change ensures that document translations are only created when specifically requested through the document translation interface, not automatically when enabling a language.

## Technical Changes

The fix was implemented in `translation-auditor.ts` by:

1. Removing the query for 'Generated' type translations during language activation
2. Adding proper inclusion of 'Custom' type translations
3. Updating code comments to clarify the intentional exclusion of Generated translations

## Testing

The fix was tested by:

1. Enabling a new language in the system
2. Verifying that only Food Items, Categories, and Custom translations were queued
3. Confirming that no document-related translations were created
4. Ensuring that document translations could still be manually triggered through the document translator interface

## Results

The fix successfully prevents 'Generated (Document)' translations from being automatically queued when new languages are enabled, while maintaining proper translation functionality for core content types.

## References

- [CHANGELOG.md](/CHANGELOG.md) - See version 0.10.5
- [Translation Auditor](/packages/backend/src/services/translation-auditor.ts) - Key implementation file
