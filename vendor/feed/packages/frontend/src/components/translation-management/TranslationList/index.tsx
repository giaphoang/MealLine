// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useCallback, useState, useRef, useMemo, useEffect } from "react"
import { Translation, BulkOperationResult, TranslationType, TranslationCapabilities } from "@/types/translation"
import { columns } from "../data-table/columns"
import { DataList } from "@/components/shared/data-list/DataList"
import type { TypeFilterOption } from "@/components/ui/type-filter"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TableBulkAction } from "@/types/table"
import { useMessage } from "@/hooks/message/useMessage"
import { Trash2, RefreshCw, Languages } from "@/components/ui/icons";
import { PlusIcon } from "@/components/animate-ui/icons/plus";
import { SearchCheckIcon } from "@/components/animate-ui/icons/search-check";
import { LanguagesIcon } from "@/components/ui/languages";
import { createPageTitleIcon } from "@/components/layout/page-title-icon";

// Page-title icon: animates on mount (page load) + hover. Mirrors the
// AI Configuration title pattern.
const PageTitleLanguagesIcon = createPageTitleIcon(LanguagesIcon);
import { TranslationService } from "@/services/translation"
import { BulkDeleteDialog } from "./bulk-delete-dialog"

interface TranslationListProps {
  translations: Translation[]
  isLoading: boolean
  onEdit: (translation: Translation) => void
  onDelete: (translation: Translation) => void
  onRetry: (translation: Translation) => void
  bulkDelete: (translations: Translation[]) => Promise<BulkOperationResult>
  bulkRetry: (translations: Translation[]) => Promise<BulkOperationResult>
  bulkIncludeOriginal?: (translations: Translation[]) => Promise<BulkOperationResult>
  bulkRemoveOriginal?: (translations: Translation[]) => Promise<BulkOperationResult>
  // DEPRECATED (2025-09-01): Skip/Enable Translation actions removed
  // bulkSkipTranslation?: (translations: Translation[]) => Promise<BulkOperationResult>
  // bulkEnableTranslation?: (translations: Translation[]) => Promise<BulkOperationResult>
  onAddTranslation?: () => void
  onFindMissingTranslations?: () => void
}

// 'Generated (List)' added for the Shopping List Builder's render-time
// translation cache. Same UX as 'Generated' / 'Custom' rows -- staff can
// curate / edit / delete via this list.
//
// Every type here must have a checkbox in TRANSLATION_TYPE_OPTIONS below: this
// is the initial selection, and the filter's empty-selection fallback restores
// the *options*, so a type present here but absent there disappears the first
// time someone unticks everything.
const TRANSLATION_TYPES: TranslationType[] = ['Category', 'FoodItem', 'Custom', 'Generated', 'Generated (List)']

/**
 * The filter's checkboxes — one per type this page can hold.
 *
 * These were the four hardcoded inside the shared `TypeFilter`, carried over
 * unchanged when that list moved out here, so that a fix to AI Configuration's
 * dropdown would not quietly alter this page. That caution has served its
 * purpose and the omission is now the bug: `TRANSLATION_TYPES` above declares
 * five, and its comment says staff should be able to curate, edit and delete
 * Shopping List rows from this list.
 *
 * Missing the fifth did more than hide a checkbox. `toggleType` restores
 * `options.map(o => o.value)` when the last box is unticked, so a full untick
 * reset the selection to these four and dropped every 'Generated (List)' row —
 * 170 of them in a local database, the second-largest type — with no control
 * left on screen to bring them back.
 *
 * The label is the one the Find Missing dialog and the backend's own message
 * already use. The Type column still prints the raw `Generated (List)`,
 * because `columns.tsx` maps only `FoodItem` and `Generated`; that is a
 * separate inconsistency, not this page's to fix here.
 */
export const TRANSLATION_TYPE_OPTIONS: readonly TypeFilterOption<TranslationType>[] = [
  { value: 'Category', label: 'Category' },
  { value: 'FoodItem', label: 'Food Item' },
  { value: 'Custom', label: 'Custom' },
  { value: 'Generated', label: 'Generated (Document)' },
  { value: 'Generated (List)', label: 'Generated (Shopping List)' }
]

export function TranslationList({
  translations,
  isLoading,
  onEdit,
  onDelete,
  onRetry,
  bulkDelete,
  bulkRetry,
  bulkIncludeOriginal,
  bulkRemoveOriginal,
  onAddTranslation,
  onFindMissingTranslations,
}: TranslationListProps) {
  const { showSuccess, showError } = useMessage()
  const [selectedForBulkDelete, setSelectedForBulkDelete] = useState<Translation[]>([])
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState<string>("")
  const [selectedTypes, setSelectedTypes] = useState<TranslationType[]>(TRANSLATION_TYPES)
  const dataListRef = useRef<{ clearSelection: () => void } | null>(null)
  const translationService = useMemo(() => new TranslationService(), []);
  const [capabilities, setCapabilities] = useState<TranslationCapabilities | null>(null)

  // Load capabilities from backend
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const caps = await translationService.getCapabilities();
      if (isMounted) setCapabilities(caps);
    })();
    return () => { isMounted = false; };
  }, [translationService]);

  // Extract unique languages from translations
  const availableLanguages = useMemo(() => {
    if (!translations || !Array.isArray(translations)) return [];
    
    const languageSet = new Set<string>();
    translations.forEach(translation => {
      if (translation && translation.language) {
        languageSet.add(translation.language);
      }
    });
    
    return Array.from(languageSet).sort();
  }, [translations]);
  
  const filteredTranslations = useMemo(() => {
    if (!translations || !Array.isArray(translations)) return [];
    
    return translations.filter(translation => {
      if (!translation) return false;
      
      // Direct comparison by language name
      const languageMatch = !selectedLanguage || selectedLanguage === translation.language;
      const typeMatch = selectedTypes.includes(translation.type);
      
      return languageMatch && typeMatch;
    });
  }, [translations, selectedLanguage, selectedTypes]);

  const handleBulkDelete = useCallback(async (selected: Translation[]) => {
    setSelectedForBulkDelete(selected);
    setBulkDeleteDialogOpen(true);
  }, [])

  const handleBulkRetry = useCallback(async (selected: Translation[]) => {
    try {
      const result = await bulkRetry(selected);

      if (dataListRef.current?.clearSelection) {
        dataListRef.current.clearSelection();
      }

      if (result && typeof result === 'object') {
        if (result.errors?.length > 0) {
          showError(result.errors[0], {
            duration: 8000
          });
        } else {
          showSuccess(`Successfully queued ${result.success} ${result.success === 1 ? 'translation' : 'translations'} for retry`);
        }
      }
    } catch (error) {
      console.error('TranslationList: Bulk retry error:', error);
      if (error instanceof Error) {
        showError(`Bulk retry operation failed: ${error.message}`, {
          duration: 8000
        });
      }
    }
  }, [bulkRetry, showSuccess, showError])

  const handleBulkIncludeOriginal = useCallback(async (selected: Translation[]) => {
    try {
      if (!bulkIncludeOriginal) {
        showError('Include Original Text functionality is not available');
        return;
      }

      // Gate by capabilities: only allow Custom and Generated
      const allowed = (capabilities
        ? selected.filter(t => capabilities[t.type]?.includes('includeOriginal'))
        : selected.filter(t => t.type === 'Custom' || t.type === 'Generated'));

      if (allowed.length === 0) {
        showError('Include English is not available for Food Items or Categories. Please select Custom or Generated translations.');
        return;
      }

      if (allowed.length < selected.length) {
        showError('Some selected items are not eligible (Food Items/Categories) and were skipped.');
      }

      const result = await bulkIncludeOriginal(allowed);

      if (dataListRef.current?.clearSelection) {
        dataListRef.current.clearSelection();
      }

      if (result && typeof result === 'object') {
        if (result.errors?.length > 0) {
        showError(result.errors[0], {
        duration: 8000
        });
        } else {
        // Create a more informative message based on what actually happened
          if (result.changed && result.skipped) {
              showSuccess(`Successfully added original text to ${result.changed} translation${result.changed === 1 ? '' : 's'} (${result.skipped} unchanged)`);
            } else if (result.changed) {
              showSuccess(`Successfully added original text to ${result.changed} translation${result.changed === 1 ? '' : 's'}`);
            } else if (result.skipped) {
              showSuccess(`No changes needed for ${result.skipped} translation${result.skipped === 1 ? '' : 's'} - English text already present`);
            } else {
              showSuccess(`Operation completed successfully for ${result.success} translation${result.success === 1 ? '' : 's'}`);
            }
          }
      }
    } catch (error) {
      console.error('TranslationList: Bulk include original error:', error);
      if (error instanceof Error) {
        showError(`Failed to add original text: ${error.message}`, {
          duration: 8000
        });
      }
    }
  }, [bulkIncludeOriginal, showSuccess, showError])

  const handleBulkRemoveOriginal = useCallback(async (selected: Translation[]) => {
    try {
      if (!bulkRemoveOriginal) {
        showError('Remove Original Text functionality is not available');
        return;
      }

      // Gate by capabilities: only allow Custom and Generated
      const allowed = (capabilities
        ? selected.filter(t => capabilities[t.type]?.includes('removeOriginal'))
        : selected.filter(t => t.type === 'Custom' || t.type === 'Generated'));

      if (allowed.length === 0) {
        showError('Remove English is not available for Food Items or Categories. Please select Custom or Generated translations.');
        return;
      }

      if (allowed.length < selected.length) {
        showError('Some selected items are not eligible (Food Items/Categories) and were skipped.');
      }

      const result = await bulkRemoveOriginal(allowed);

      if (dataListRef.current?.clearSelection) {
        dataListRef.current.clearSelection();
      }

      if (result && typeof result === 'object') {
        if (result.errors?.length > 0) {
        showError(result.errors[0], {
        duration: 8000
        });
        } else {
        // Create a more informative message based on what actually happened
          if (result.changed && result.skipped) {
              showSuccess(`Successfully removed original text from ${result.changed} translation${result.changed === 1 ? '' : 's'} (${result.skipped} unchanged)`);
            } else if (result.changed) {
              showSuccess(`Successfully removed original text from ${result.changed} translation${result.changed === 1 ? '' : 's'}`);
            } else if (result.skipped) {
              showSuccess(`No changes needed for ${result.skipped} translation${result.skipped === 1 ? '' : 's'} - English text not found`);
            } else {
              showSuccess(`Operation completed successfully for ${result.success} translation${result.success === 1 ? '' : 's'}`);
            }
          }
      }
    } catch (error) {
      console.error('TranslationList: Bulk remove original error:', error);
      if (error instanceof Error) {
        showError(`Failed to remove original text: ${error.message}`, {
          duration: 8000
        });
      }
    }
  }, [bulkRemoveOriginal, showSuccess, showError])

  const handleLanguageChange = useCallback((language: string) => {
    setSelectedLanguage(language);
    if (dataListRef.current?.clearSelection) {
      dataListRef.current.clearSelection();
    }
  }, []);

  const handleTypeChange = useCallback((types: TranslationType[]) => {
    setSelectedTypes(types);
    if (dataListRef.current?.clearSelection) {
      dataListRef.current.clearSelection();
    }
  }, []);

  const handleConfirmBulkDelete = useCallback(async (translationsToDelete: Translation[]) => {
    try {
      const result = await bulkDelete(translationsToDelete);

      setBulkDeleteDialogOpen(false);
      setSelectedForBulkDelete([]);
      
      if (dataListRef.current?.clearSelection) {
        dataListRef.current.clearSelection();
      }

      if (result && typeof result === 'object') {
        if (result.errors?.length > 0) {
          showError(result.errors[0], {
            duration: 8000
          });
        } else {
          showSuccess(`Successfully deleted ${result.success} ${result.success === 1 ? 'translation' : 'translations'}`);
        }
      }
    } catch (error) {
      console.error('TranslationList: Bulk delete error:', error);
      if (error instanceof Error) {
        showError(`Bulk delete operation failed: ${error.message}`, {
          duration: 8000
        });
      }
    }
  }, [bulkDelete, showSuccess, showError])

  const handleError = useCallback((error: Error) => {
    showError(error.message, {
      duration: 8000
    });
  }, [showError])

  const handleToggleOriginal = useCallback(async (translation: Translation) => {
    try {
      const hasEnglish = translationService.hasOriginalTextIncluded(translation);
      const result = await translationService.toggleOriginalText(translation);

      if (result && typeof result === 'object') {
        if (result.errors?.length > 0) {
          showError(result.errors[0], {
            duration: 8000
          });
        } else {
          if (hasEnglish) {
            showSuccess(`Successfully removed original English text from translation`);
          } else {
            showSuccess(`Successfully added original English text to translation`);
          }
        }
      }
    } catch (error) {
      console.error('Error toggling original text:', error);
      if (error instanceof Error) {
        showError(`Failed to update translation: ${error.message}`, {
          duration: 8000
        });
      }
    }
  }, [translationService, showSuccess, showError])

  /*
   * DEPRECATED (2025-09-01): Skip/Enable Translation bulk actions removed.
   * Handlers preserved above as comments in git history.
   */

  // DEPRECATED (2025-09-01): Row-level Skip/Enable toggle removed from UI

  const handleDataListRef = useCallback((dataList: { clearSelection: () => void } | null) => {
    dataListRef.current = dataList;
  }, []);

  const toolbarActions = [
    {
      label: 'Add New Translation',
      icon: PlusIcon,
      variant: 'default' as const,
      action: () => onAddTranslation?.()
    },
    {
      label: 'Find Missing Translations',
      icon: SearchCheckIcon,
      variant: 'outline' as const,
      action: () => onFindMissingTranslations?.()
    }
  ]

  const bulkActions: TableBulkAction<Translation>[] = [
    {
      label: 'Retry Selected',
      icon: RefreshCw,
      action: handleBulkRetry,
      variant: 'default'
    },
    {
      label: 'Include English',
      icon: Languages,
      action: handleBulkIncludeOriginal,
      variant: 'default'
    },
    {
      label: 'Remove English',
      icon: Languages,
      action: handleBulkRemoveOriginal,
      variant: 'default'
    },
    {
      label: 'Delete Selected',
      icon: Trash2,
      action: handleBulkDelete,
      variant: 'destructive'
    }
  ]

  return (
    <TooltipProvider>
      <DataList
        ref={handleDataListRef}
        title="Translation Management"
        description="Manage translations for all supported languages."
        items={filteredTranslations}
        columns={columns({ onEdit, onDelete, onRetry, onToggleOriginal: handleToggleOriginal, capabilities: capabilities || undefined })}
        isLoading={isLoading}
        bulkActions={bulkActions}
        filterColumn="originalText"
        filterPlaceholder="Filter original text..."
        enableColumnVisibility={true}
        enableLanguageFilter={true}
        enableTypeFilter={true}
        selectedLanguage={selectedLanguage}
        selectedTypes={selectedTypes}
        typeOptions={TRANSLATION_TYPE_OPTIONS}
        availableLanguages={availableLanguages}
        onLanguageChange={handleLanguageChange}
        onTypeChange={handleTypeChange}
        onError={handleError}
        toolbarActions={toolbarActions}
        toolbarIcon={PageTitleLanguagesIcon}
      />

      <BulkDeleteDialog
        translations={selectedForBulkDelete}
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        onConfirm={handleConfirmBulkDelete}
        onError={handleError}
        isLoading={isLoading}
      />
    </TooltipProvider>
  )
}
