# Language Deactivation System

## Overview

The Language Deactivation system provides users with improved control over how the application handles translations when languages are deactivated. This document explains the design decisions, architecture, and user experience of this feature.

## User Experience

When a user attempts to deactivate one or more languages in the Language Management section, a confirmation dialog appears with three options:

1. **Cancel**: Abort the deactivation and maintain the current language settings.
2. **Deactivate Language(s)**: Disable the selected language(s) but preserve all existing translations.
3. **Deactivate and Delete Translations**: Disable the selected language(s) and delete all translations for those languages.

If the user selects "Deactivate and Delete Translations," a second confirmation dialog appears, showing the number of translations that would be deleted and warning that this action cannot be undone.

## Architecture

### Frontend Components

- **LanguageDeactivationDialog**: The primary UI component that displays the confirmation options when deactivating languages.
- **LanguageContext**: Extended to support preserving translations when deactivating languages.
- **LanguageService**: Enhanced to handle the new API endpoint for counting translations and the updated bulkUpdateLanguages method.

### Backend Services

- **Translation Auditor**: Modified to check the `preserveTranslations` flag before deleting translations for disabled languages.
- **Language Route**: Added `/translation-count` endpoint to count translations for specific languages.

## Data Flow

1. User deselects one or more active languages in the Language Selection Form.
2. The form identifies which languages are being deactivated and fetches the translation count for those languages.
3. The deactivation dialog appears, showing the affected languages and providing the three options.
4. Based on the user's choice:
   - If "Cancel" is selected, the form resets to the current state.
   - If "Deactivate Language(s)" is selected, the languages are updated with `preserveTranslations: true`.
   - If "Deactivate and Delete Translations" is selected, a second confirmation appears.
5. If confirmed, the backend updates the language states and either preserves or deletes the corresponding translations.

## Implementation Notes

### Enhanced BulkUpdateLanguageState

The `BulkUpdateLanguageState` type was enhanced to include an optional `preserveTranslations` flag:

```typescript
export interface BulkUpdateLanguageState {
  code: string;
  isEnabled: boolean;
  preserveTranslations?: boolean;
}
```

### Backend Translation Handling

The backend now checks the `preserveTranslations` flag before processing disabled languages:

```typescript
// Handle disabled languages
for (const update of updates.filter(u => !u.isEnabled)) {
  if (update.preserveTranslations) {
    // Just mark the language as disabled, keep translations
    console.log(`Language ${update.code} disabled but translations preserved`);
  } else {
    // Delete translations for this language
    await translationAuditor.handleLanguageDisabled(update.code);
  }
}
```

## Benefits

- **Improved User Control**: Users now have more granular control over translation management.
- **Data Preservation**: Valuable translations can be retained even when a language is temporarily disabled.
- **Clear Confirmation**: The system provides clear warnings and confirmation counts before destructive actions.
- **Streamlined Workflow**: The interface guides users through the decision process with clear options.

## Future Enhancements

- Add ability to re-enable languages and automatically reactive their preserved translations.
- Implement an archive system for translations of disabled languages.
- Add analytics to track language usage patterns.
- Implement batch translation operations for enabled/disabled languages.
