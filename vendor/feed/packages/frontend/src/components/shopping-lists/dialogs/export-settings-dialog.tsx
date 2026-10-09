// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useEffect, useState } from 'react';
import { useMessage } from '@/hooks/message/useMessage';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { shoppingListBuilderService } from '@/services/shopping-list-builder';
import {
  DEFAULT_EXPORT_SETTINGS,
  EXPORT_BASE_NAME_MAX,
  ExportSettings,
  buildExportFilename,
} from '../builder/export-filename';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ExportSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * B1 — Export Settings modal. Configures the org-wide shared filename
 * convention for exported shopping-list PDFs (single download + Translate &
 * Generate). Persistence is a single shared row (no per-user state), in line
 * with the shared-environment principle (#31). A live preview of the
 * resulting filenames is shown using a sample template name + language.
 */
export function ExportSettingsDialog({ open, onOpenChange }: ExportSettingsDialogProps) {
  const { showMessage } = useMessage();
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        const loaded = await shoppingListBuilderService.getExportSettings();
        if (!cancelled) setSettings(loaded);
      } catch (error) {
        ErrorHandlerService.handleError(error, 'shoppingListBuilderLoadExportSettings');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const update = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const saved = await shoppingListBuilderService.updateExportSettings(settings);
      setSettings(saved);
      showMessage('Export settings saved', 'success');
      onOpenChange(false);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'shoppingListBuilderSaveExportSettings');
    } finally {
      setIsSaving(false);
    }
  };

  const previewExample = buildExportFilename(settings, {
    kind: 'preview',
    templateName: 'Weekly Pantry',
    language: 'English',
  });
  const translatedExample = buildExportFilename(settings, {
    kind: 'translated',
    templateName: 'Weekly Pantry',
    language: 'Spanish',
  });

  const disabled = isLoading || isSaving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Settings</DialogTitle>
          <DialogDescription>
            Configure how downloaded shopping-list PDFs are named. These settings are shared by
            everyone using FEED.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="export-preview-base">Base name — single PDF downloads</Label>
            <Input
              id="export-preview-base"
              value={settings.previewBaseName}
              maxLength={EXPORT_BASE_NAME_MAX}
              disabled={disabled}
              onChange={(event) => update('previewBaseName', event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="export-translated-base">Base name — translated PDF downloads</Label>
            <Input
              id="export-translated-base"
              value={settings.translatedBaseName}
              maxLength={EXPORT_BASE_NAME_MAX}
              disabled={disabled}
              onChange={(event) => update('translatedBaseName', event.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="export-include-template" className="cursor-pointer">
              Include template name
            </Label>
            <Switch
              id="export-include-template"
              checked={settings.includeTemplateName}
              disabled={disabled}
              onCheckedChange={(value) => update('includeTemplateName', value)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="export-include-language" className="cursor-pointer">
              Include language name
            </Label>
            <Switch
              id="export-include-language"
              checked={settings.includeLanguage}
              disabled={disabled}
              onCheckedChange={(value) => update('includeLanguage', value)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="export-include-date" className="cursor-pointer">
              Include date stamp
            </Label>
            <Switch
              id="export-include-date"
              checked={settings.includeDate}
              disabled={disabled}
              onCheckedChange={(value) => update('includeDate', value)}
            />
          </div>

          {settings.includeDate && (
            <div className="space-y-2">
              <Label htmlFor="export-date-position">Date position</Label>
              <Select
                value={settings.datePosition}
                disabled={disabled}
                onValueChange={(value) => update('datePosition', value === 'start' ? 'start' : 'end')}
              >
                <SelectTrigger id="export-date-position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">At the start</SelectItem>
                  <SelectItem value="end">At the end</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-md border bg-muted/40 p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            <p className="text-sm font-mono break-all">{previewExample}</p>
            <p className="text-sm font-mono break-all">{translatedExample}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={disabled} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={disabled}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
