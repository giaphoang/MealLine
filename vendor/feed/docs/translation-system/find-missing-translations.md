# Find Missing Translations Feature

## Overview

The "Find Missing Translations" feature helps maintain complete translation coverage across the system by automatically identifying and queueing missing translations. This addresses situations where translations might have been deleted accidentally or weren't created when new content was added.

## Features

1. **System-Wide Scanning**:
   - Scans all Food Items for missing translations
   - Scans all Categories for missing translations
   - Scans all Custom texts that have at least one translation
   - Compares against all enabled languages

2. **Enhanced Interactive UI**:
   - "Find Missing Translations" button in the Translation Management interface
   - Tabbed interface with Overview, Details, and Languages tabs
   - Detailed breakdown of missing translations by content type
   - Visual indicators of progress with phased scanning
   - Language-specific statistics and charts
   - Clear success/error messages

3. **Efficient Processing**:
   - Dispatches processing per content type using established services
   - Skips translations that already exist or are completed
   - Handles Food Items and Categories via the Translation Trigger queue
   - Translation Trigger batches queued Food Items/Categories by language
   - Processes Custom texts inline in small batches
   - Excludes Generated (document) entries from this flow (handled by Docx service)

## Implementation Details

### Backend Components

1. **TranslationAuditor Service**:
   - `findMissingTranslations(process?: boolean, types?: string[])` scans all content types
   - Efficiently queries the database and identifies truly missing, failed, or stale-pending entries
   - When `process=false`, returns a detailed breakdown only
   - When `process=true`, dispatches by type:
    - FoodItem/Category: queues work via `translationTriggerService.queueContentTranslation`
      - Translation Trigger batches queued items per language for efficiency
    - Custom: creates/updates rows and translates inline in small batches using `AIServiceFactory`
    - Generated: excluded from this flow; handled by document translation service

2. **API Endpoint**:
   - Added `/api/translations/find-missing` endpoint
   - Scans and optionally dispatches processing as described above
   - Returns the count of dispatched/processed translations
   - Provides user-friendly result messages

### Frontend Components

1. **Enhanced UI Elements**:
   - Added "Find Missing Translations" button with SearchCheck icon
   - Created comprehensive tabbed dialog component with detailed visualization
   - Organized results by content type (Food Items, Categories, Custom Texts, Generated Documents)
   - Added sample item display for each content type
   - Enhanced TranslationList to include the new functionality
   - Added service and hook methods to call the backend API

2. **Advanced User Feedback**:
   - Phased progress indicators during scanning process
   - Visual cards showing count by translation type
   - Language-specific breakdown with percentage bars
   - Sample display of affected content
   - Comprehensive success/error messaging
   - Detailed guidance on next steps

## Usage

1. Navigate to the Translation Management section
2. Click the "Find Missing Translations" button in the toolbar
3. Review what the feature will do in the information dialog
4. Click "Find Missing Translations" to start scanning
5. Wait for the scanning process to complete
6. Review the results organized by content type and language in the tabbed interface
7. Select which types of translations you want to process using the checkboxes
8. Click "Process Selected" to process only the selected types
   - Food Items/Categories are queued and processed asynchronously
   - Custom texts are processed inline in small batches
   - Generated items are not processed here (see Document Translation)

## Technical Notes

- Works with all enabled languages (excluding English)
- Food Items/Categories are handled by the central Translation Trigger queue
- Translation Trigger batches queued items per language to reduce RPM usage
- Custom texts are processed inline; very large batches may take longer
- Generated (document) translations are managed by the Docx translation service
- Designed to prevent “stuck pending” states by using active processors per type

## Future Enhancements

Potential future improvements to this feature could include:

- Detailed reporting of which items had missing translations
- Option to selectively process only certain types of content
- Scheduling regular scans for missing translations
- Custom email notifications for large changes
