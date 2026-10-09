// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';
import { AlertCircle, CheckCircle2, Languages, Loader2 } from "@/components/ui/icons";

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useLanguageContext } from '@/contexts/LanguageContext';
import { useMessage } from '@/hooks/message/useMessage';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { shoppingListBuilderService } from '@/services/shopping-list-builder';
import {
  SavedBuilderTemplate,
  ShoppingListBuilderTemplate,
} from '@/components/shopping-lists/builder/types';
import {
  ExportSettings,
  buildExportFilename,
} from '@/components/shopping-lists/builder/export-filename';

/**
 * Bulk Translate & Download PDFs modal for one saved shopping-list template.
 *
 * Patterned after the Document Translator's "Advanced" Translate dialog
 * (`packages/frontend/src/components/document-translator/dialogs/translate-dialog.tsx`):
 * staff pick one or more languages with Select All / individual checkboxes,
 * then a single click runs preflight → fill missing translations → render
 * PDF → trigger browser download for each language sequentially. The
 * Document Translator pattern uses sequential per-file downloads (no zip);
 * this modal does the same so each PDF lands in the user's Downloads
 * folder under a stable filename.
 *
 * The "Export single-page lists two-sided" switch (default ON) sends
 * `printMode: 'two-sided-when-single-page'` to the preview-pdf route, which
 * duplicates the rendered output only when the planner produced exactly
 * one page -- multi-page outputs already paginate cleanly for two-sided
 * printing and pass through unchanged.
 */

const triggerPdfDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

// Browsers throttle very-rapid sequential file downloads (Chrome shows the
// "this site is downloading multiple files" prompt and silently swallows
// later requests). Spacing them out by ~250ms keeps every PDF landing in
// the Downloads folder while still feeling like a single click.
const downloadGapMs = 250;
const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

interface PerLanguageState {
  language: string;
  status: 'pending' | 'preflight' | 'translating' | 'generating' | 'done' | 'failed';
  error?: string;
}

type Step = 'setup' | 'progress' | 'done';

interface TranslateAndGenerateDialogProps {
  /** Saved template whose PDF(s) will be generated. */
  template: SavedBuilderTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** B1 — org-wide shared export filename configuration. */
  exportSettings: ExportSettings;
}

export function TranslateAndGenerateDialog({
  template,
  open,
  onOpenChange,
  exportSettings,
}: TranslateAndGenerateDialogProps) {
  const { showMessage } = useMessage();
  const { languages, isLoading: isLoadingLanguages } = useLanguageContext();

  const enabledNonEnglishLanguages = React.useMemo(
    () => languages.filter((lang) => lang.isEnabled && lang.name !== 'English'),
    [languages],
  );

  // B2: English is always an export target (the source language). Selecting it
  // skips the translation pipeline and renders the document as-is, so staff can
  // get every language — including English — from one modal. Pinned first.
  const exportTargets = React.useMemo(
    () => [
      { name: 'English', isEnglish: true },
      ...enabledNonEnglishLanguages.map((lang) => ({ name: lang.name, isEnglish: false })),
    ],
    [enabledNonEnglishLanguages],
  );

  const [step, setStep] = React.useState<Step>('setup');
  const [selectedLanguages, setSelectedLanguages] = React.useState<Set<string>>(new Set());
  const [singlePageDuplicate, setSinglePageDuplicate] = React.useState(true);
  const [perLanguage, setPerLanguage] = React.useState<PerLanguageState[]>([]);

  // Reset state every time the dialog opens. An in-flight bulk export is
  // not interrupted when the dialog is closed mid-progress; per-language
  // state for that batch is simply replaced when the dialog reopens.
  React.useEffect(() => {
    if (open) {
      setStep('setup');
      setSelectedLanguages(new Set());
      setSinglePageDuplicate(true);
      setPerLanguage([]);
    }
  }, [open]);

  const allSelected = exportTargets.length > 0
    && exportTargets.every((target) => selectedLanguages.has(target.name));
  const someSelected = exportTargets.some((target) => selectedLanguages.has(target.name));

  const toggleLanguage = (name: string, checked: boolean) => {
    setSelectedLanguages((current) => {
      const next = new Set(current);
      if (checked) next.add(name); else next.delete(name);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLanguages(new Set(exportTargets.map((target) => target.name)));
    } else {
      setSelectedLanguages(new Set());
    }
  };

  const updateLanguageState = (language: string, patch: Partial<PerLanguageState>) => {
    setPerLanguage((current) => current.map((entry) => (
      entry.language === language ? { ...entry, ...patch } : entry
    )));
  };

  const exportLanguage = async (language: string): Promise<boolean> => {
    const templateData = template.templateData as ShoppingListBuilderTemplate;
    // B2: English is the source language — skip preflight/translation entirely
    // and render with no targetLanguage (the backend's English path).
    const isEnglish = language === 'English';
    try {
      if (!isEnglish) {
        // Preflight to know which strings need translation. Empty templates
        // return totalStrings: 0 and we skip straight to PDF render.
        updateLanguageState(language, { status: 'preflight' });
        const preflight = await shoppingListBuilderService.translationPreflight(templateData, language);

        if (preflight.missingStrings.length > 0) {
          updateLanguageState(language, { status: 'translating' });
          await shoppingListBuilderService.translateMissingStrings(preflight.missingStrings, language);
        }
      }

      updateLanguageState(language, { status: 'generating' });
      const blob = await shoppingListBuilderService.createPreviewPdf(templateData, {
        targetLanguage: isEnglish ? undefined : language,
        printMode: singlePageDuplicate ? 'two-sided-when-single-page' : undefined,
      });
      triggerPdfDownload(blob, buildExportFilename(exportSettings, {
        kind: 'translated',
        templateName: template.name,
        language,
      }));
      updateLanguageState(language, { status: 'done' });
      return true;
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderBulkTranslateAndExport');
      // The row shows the reason inline, so it goes through the same screen
      // the toast does. `error.message` raw is what printed a Cloudflare 502
      // HTML page into this dialog in production (ISSUES.md #80).
      updateLanguageState(language, {
        status: 'failed',
        error: ErrorHandlerService.toUserMessage(error),
      });
      return false;
    }
  };

  const handleStart = async () => {
    const selected = exportTargets
      .filter((target) => selectedLanguages.has(target.name))
      .map((target) => target.name);
    if (selected.length === 0) {
      showMessage('Pick at least one language to continue.', 'warning');
      return;
    }
    setPerLanguage(selected.map<PerLanguageState>((language) => ({ language, status: 'pending' })));
    setStep('progress');

    let successes = 0;
    let failures = 0;
    for (let i = 0; i < selected.length; i += 1) {
      const ok = await exportLanguage(selected[i]);
      if (ok) successes += 1; else failures += 1;
      // Brief gap between sequential downloads so Chrome's multi-download
      // protection does not swallow later files.
      if (i < selected.length - 1) await wait(downloadGapMs);
    }
    setStep('done');

    if (failures === 0) {
      showMessage(`Downloaded ${successes} translated PDF${successes === 1 ? '' : 's'}.`, 'success');
    } else if (successes === 0) {
      showMessage(`All ${failures} download${failures === 1 ? '' : 's'} failed.`, 'error');
    } else {
      showMessage(
        `Downloaded ${successes} of ${successes + failures} PDFs (${failures} failed).`,
        'warning',
      );
    }
  };

  const renderLanguageRow = (entry: PerLanguageState) => {
    const labelByStatus: Record<PerLanguageState['status'], string> = {
      pending: 'Waiting…',
      preflight: 'Checking translation cache…',
      translating: 'Translating missing strings…',
      generating: 'Rendering PDF…',
      done: 'Downloaded',
      failed: entry.error ? `Failed: ${entry.error}` : 'Failed',
    };
    const Icon = entry.status === 'done'
      ? CheckCircle2
      : entry.status === 'failed'
        ? AlertCircle
        : entry.status === 'pending'
          ? null
          : Loader2;
    const iconClass = entry.status === 'done'
      ? 'text-green-600'
      : entry.status === 'failed'
        ? 'text-destructive'
        : 'text-muted-foreground';
    return (
      <div key={entry.language} className="flex items-start gap-2 text-sm">
        <div className="mt-0.5 w-4 shrink-0">
          {Icon ? (
            <Icon
              className={`h-4 w-4 ${iconClass} ${(entry.status === 'preflight' || entry.status === 'translating' || entry.status === 'generating') ? 'animate-spin' : ''}`}
            />
          ) : (
            <span className="block h-4 w-4 rounded-full border border-muted-foreground/30" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{entry.language}</div>
          <div className={`text-xs ${entry.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {labelByStatus[entry.status]}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Translate &amp; Download PDFs
          </DialogTitle>
          <DialogDescription>
            Pick the languages to export. Each selection downloads a separate
            PDF into your Downloads folder, named per your Export Settings.
          </DialogDescription>
        </DialogHeader>

        {step === 'setup' && (
          <div className="space-y-4 py-2">
            {isLoadingLanguages ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading languages…
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">Languages</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSelectAll(!allSelected)}
                  >
                    {allSelected ? 'Clear' : 'Select all'}
                  </Button>
                </div>
                <div className="max-h-48 overflow-hidden rounded-md border">
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-2 gap-2 p-3">
                      {exportTargets.map((target) => {
                        const id = `bulk-translate-lang-${target.name}`;
                        return (
                          <div key={target.name} className="flex items-center gap-2">
                            <Checkbox
                              id={id}
                              checked={selectedLanguages.has(target.name)}
                              onCheckedChange={(checked) => toggleLanguage(target.name, checked === true)}
                            />
                            <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                              {target.isEnglish ? 'English (no translation)' : target.name}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
                {enabledNonEnglishLanguages.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Only English is available. Enable languages in Language
                    Settings to export translated lists.
                  </p>
                )}
                {someSelected && (
                  <p className="text-xs text-muted-foreground">
                    {selectedLanguages.size} of {exportTargets.length} selected.
                  </p>
                )}

                <div className="flex items-start justify-between gap-3 rounded-md border translation-options-column p-3">
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="bulk-translate-two-sided" className="text-sm font-medium">
                      Export single-page lists two-sided
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Single-page PDFs are duplicated so they print on both sides
                      of one sheet. Multi-page PDFs already paginate for two-sided
                      printing and pass through unchanged.
                    </p>
                  </div>
                  <Switch
                    id="bulk-translate-two-sided"
                    checked={singlePageDuplicate}
                    onCheckedChange={setSinglePageDuplicate}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {(step === 'progress' || step === 'done') && (
          <div className="space-y-2 py-2">
            {/* Native max-h grow-to-fit is intentional (shadcn-exception, per
                AGENTS.md / ISSUES.md #32): this lists one row per selected
                language (commonly 1–3), so a fixed-height ScrollArea would show
                a large empty box. It grows to the rows and scrolls only past
                the cap. (Supersedes the #29a note; the box stays native here.) */}
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <div className="space-y-3 p-3">
                {perLanguage.map(renderLanguageRow)}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'setup' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleStart}
                disabled={selectedLanguages.size === 0}
              >
                Generate &amp; download
                {selectedLanguages.size > 0 && ` (${selectedLanguages.size})`}
              </Button>
            </>
          )}

          {step === 'progress' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}

          {step === 'done' && (
            <Button onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
