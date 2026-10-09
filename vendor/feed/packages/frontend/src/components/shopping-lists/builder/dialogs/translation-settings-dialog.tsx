// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';
import { AlertCircle, Languages, Loader2 } from "@/components/ui/icons";

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useLanguageContext } from '@/contexts/LanguageContext';
import { useMessage } from '@/hooks/message/useMessage';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { shoppingListBuilderService } from '@/services/shopping-list-builder';
import {
  BuilderTranslationMode,
  DEFAULT_BUILDER_TRANSLATION_MODE,
  TextBuilderComponent,
} from '@/components/shopping-lists/builder/types';
import { renderTextBody } from '@/components/shopping-lists/builder/translation-render';

/**
 * Per-component translation settings for a Shopping List Builder text
 * component. Opened from the Properties panel's "Translation Settings"
 * button. Lets staff:
 *
 *   1. Choose a translation mode for this component (skip / translate /
 *      translate-with-original).
 *   2. Pick a preview language and see the rendered output live in the
 *      modal -- the same JSX rendering logic the canvas uses for body
 *      text, with the mode applied on top.
 *   3. (When a preview language has no cached translation) trigger a
 *      one-shot "Translate now" call to fill the cache via the existing
 *      AI translation primitive.
 *
 * The mode is persisted by the caller via `onSave`. Persistence happens
 * as part of the saved-template JSON; no schema migration required.
 *
 * Inline tag font for the 'translate-with-original' mode is locked at
 * 8pt bold so canvas preview, modal preview, and Chromium PDF render
 * identical output. See `textComponentHtml` in
 * `packages/backend/src/routes/shopping-list-builder.ts` for the matching
 * backend rendering.
 */

interface TranslationSettingsDialogProps {
  component: TextBuilderComponent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (mode: BuilderTranslationMode) => void;
}

const MODE_OPTIONS: Array<{
  value: BuilderTranslationMode;
  title: string;
  description: string;
}> = [
  {
    value: 'skip',
    title: 'Do not translate',
    description: 'Always render the original English text in the PDF, no matter which language is requested at generate time.',
  },
  {
    value: 'translate',
    title: 'Translate',
    description: 'Swap the English text for the cached translation when generating a translated PDF. Falls back to English if no translation exists yet.',
  },
  {
    value: 'translate-with-original',
    title: 'Include English',
    description: 'Render the translation followed by an inline 8pt bold tag with the original English (e.g. "У нас яиц нет We have no eggs"). Useful for bilingual households.',
  },
];

export function TranslationSettingsDialog({
  component,
  open,
  onOpenChange,
  onSave,
}: TranslationSettingsDialogProps) {
  const { showMessage } = useMessage();
  const { languages, isLoading: isLoadingLanguages } = useLanguageContext();

  const enabledNonEnglishLanguages = React.useMemo(
    () => languages.filter((lang) => lang.isEnabled && lang.name !== 'English'),
    [languages],
  );

  // Working copy of the mode. Resets when the dialog opens so staff can
  // cancel out of an in-progress edit without losing the persisted value.
  const [mode, setMode] = React.useState<BuilderTranslationMode>(
    component.translationMode ?? DEFAULT_BUILDER_TRANSLATION_MODE,
  );
  const [previewLanguage, setPreviewLanguage] = React.useState<string>('');
  const [cachedTranslation, setCachedTranslation] = React.useState<string | null>(null);
  const [isFetching, setIsFetching] = React.useState(false);
  const [isTranslating, setIsTranslating] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string>('');

  React.useEffect(() => {
    if (open) {
      setMode(component.translationMode ?? DEFAULT_BUILDER_TRANSLATION_MODE);
      setPreviewLanguage('');
      setCachedTranslation(null);
      setErrorMessage('');
    }
  }, [open, component.id, component.translationMode]);

  // When the user picks a preview language, look up the cached translation
  // for this component's content. We re-use the existing preflight endpoint
  // by passing a one-component template so the result is constrained to
  // just this string and we share the cache-hit semantics with the larger
  // Translate & Generate flow.
  React.useEffect(() => {
    if (!open || !previewLanguage || !component.content.trim()) {
      setCachedTranslation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setIsFetching(true);
        setErrorMessage('');
        // Preflight now returns the cached translation map alongside the
        // counts, so a single call gives us everything we need for the
        // modal's preview without triggering any AI work. The "Translate
        // now" button below is the only path that hits the AI provider.
        const preflight = await shoppingListBuilderService.translationPreflight(
          {
            paper: { size: 'letter', width: 612, height: 792, unit: 'pt' },
            components: [component],
          } as never,
          previewLanguage,
        );
        if (cancelled) return;
        setCachedTranslation(preflight.cached[component.content] ?? null);
      } catch (error) {
        if (cancelled) return;
        ErrorHandlerService.handleError(error, 'translationSettingsPreviewLookup');
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load preview.');
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, previewLanguage, component]);

  const handleTranslateNow = async () => {
    if (!previewLanguage || !component.content.trim()) return;
    try {
      setIsTranslating(true);
      setErrorMessage('');
      const result = await shoppingListBuilderService.translateMissingStrings(
        [component.content],
        previewLanguage,
      );
      setCachedTranslation(result.translations[component.content] ?? null);
      showMessage(`Translated to ${previewLanguage}.`, 'success');
    } catch (error) {
      ErrorHandlerService.handleError(error, 'translationSettingsTranslateNow');
      setErrorMessage(error instanceof Error ? error.message : 'Translation failed.');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSave = () => {
    onSave(mode);
    onOpenChange(false);
  };

  const previewBody = React.useMemo(
    () => renderTextBody(component.content, cachedTranslation, mode),
    [component.content, cachedTranslation, mode],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Translation Settings
          </DialogTitle>
          <DialogDescription>
            Choose how this text component is treated when the template is
            rendered into a non-English language. Use the preview to test
            multiple languages before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview language picker */}
          <div className="space-y-2">
            <Label htmlFor="translation-settings-preview-language" className="text-sm font-medium">
              Preview language
            </Label>
            {isLoadingLanguages ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading languages...
              </div>
            ) : enabledNonEnglishLanguages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No translation languages are enabled. Enable at least one
                non-English language in Language Settings to preview.
              </p>
            ) : (
              <Select value={previewLanguage} onValueChange={setPreviewLanguage}>
                <SelectTrigger id="translation-settings-preview-language">
                  <SelectValue placeholder="Pick a language to preview" />
                </SelectTrigger>
                <SelectContent>
                  {enabledNonEnglishLanguages.map((lang) => (
                    <SelectItem key={lang.name} value={lang.name}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Preview window */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Preview</Label>
            <div
              data-testid="translation-settings-preview"
              className="min-h-[64px] rounded-md border bg-background p-3"
              style={{
                fontSize: component.fontSize,
                fontWeight: component.fontWeight === 'bold' ? 700 : 400,
                lineHeight: component.lineHeight,
                textAlign: component.align,
                whiteSpace: 'pre-line',
              }}
              dir="auto"
            >
              {isFetching || isTranslating ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground" style={{ fontWeight: 400 }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isTranslating ? 'Translating...' : 'Loading translation...'}
                </span>
              ) : (
                previewBody
              )}
            </div>
            {previewLanguage && !cachedTranslation && !isFetching && !isTranslating && mode !== 'skip' && (
              <div className="flex items-start justify-between gap-3 rounded-md border border-dashed translation-options-column p-2 text-xs">
                <span className="text-muted-foreground">
                  No cached translation to {previewLanguage} yet. Skip mode is
                  unaffected; translate and Include English fall back to
                  English in the PDF until a translation exists.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTranslateNow}
                  disabled={isTranslating}
                >
                  Translate now
                </Button>
              </div>
            )}
            {errorMessage && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Mode picker. Native radios are used here to avoid pulling in
              shadcn's radio-group primitive (which isn't installed in this
              project today). The behaviour and accessibility are equivalent. */}
          <div
            className="space-y-2"
            role="radiogroup"
            aria-label="Translation mode"
          >
            <Label className="text-sm font-medium">Translation mode</Label>
            <div className="space-y-2">
              {MODE_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-start gap-3 rounded-md border p-2">
                  <input
                    type="radio"
                    id={`translation-mode-${option.value}`}
                    name="translation-mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setMode(option.value);
                      }
                    }}
                    className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                  />
                  <Label
                    htmlFor={`translation-mode-${option.value}`}
                    className="flex-1 cursor-pointer space-y-1"
                  >
                    <span className="block text-sm font-medium">{option.title}</span>
                    <span className="block text-xs text-muted-foreground">{option.description}</span>
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isTranslating}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isTranslating}>
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
