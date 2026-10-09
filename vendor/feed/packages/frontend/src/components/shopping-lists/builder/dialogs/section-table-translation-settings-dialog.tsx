// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';
import { Languages } from "@/components/ui/icons";

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BuilderTranslationMode,
  SectionTableBuilderComponent,
  SectionTableTranslationSettings,
  resolveSectionTableTranslationSettings,
} from '@/components/shopping-lists/builder/types';

interface SectionTableTranslationSettingsDialogProps {
  component: SectionTableBuilderComponent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (settings: SectionTableTranslationSettings) => void;
}

type ModeOption = {
  value: BuilderTranslationMode;
  title: string;
  description: string;
};

// Headers and Tags are short single words ("Limit", "Want", category names),
// so they expose the three base modes only.
const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'skip',
    title: 'Do not translate',
    description: 'Always render the English source text for this part of the table.',
  },
  {
    value: 'translate',
    title: 'Translate',
    description: 'Render the available translation and fall back to English when the cache is missing.',
  },
  {
    value: 'translate-with-original',
    title: 'Include English',
    description: 'Render the translation followed by the English source text.',
  },
];

// Row item names can be long enough to wrap, so the Rows tab also offers the
// two placement variants of "Include English".
const ROW_MODE_OPTIONS: ModeOption[] = [
  ...MODE_OPTIONS,
  {
    value: 'translate-with-original-block',
    title: 'Include English (with line break)',
    description: 'Render the translation, then the English source text on its own line beneath it.',
  },
  {
    value: 'translate-with-original-adaptive',
    title: 'Include English (adaptive)',
    description: 'Render the translation followed by the English source text -- inline when it fits, otherwise dropped whole onto the next line.',
  },
];

const normalizeSettings = (
  settings: SectionTableTranslationSettings | undefined,
): Required<SectionTableTranslationSettings> => resolveSectionTableTranslationSettings(settings);

function ModePicker({
  label,
  value,
  onChange,
  options = MODE_OPTIONS,
}: {
  label: string;
  value: BuilderTranslationMode;
  onChange: (value: BuilderTranslationMode) => void;
  options?: ModeOption[];
}) {
  return (
    <div className="space-y-2" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <div key={option.value} className="flex items-start gap-3 rounded-md border p-2">
          <input
            type="radio"
            id={`${label}-${option.value}`}
            name={label}
            value={option.value}
            checked={value === option.value}
            onChange={(event) => {
              if (event.target.checked) onChange(option.value);
            }}
            className="mt-1 h-4 w-4 cursor-pointer accent-primary"
          />
          <Label htmlFor={`${label}-${option.value}`} className="flex-1 cursor-pointer space-y-1">
            <span className="block text-sm font-medium">{option.title}</span>
            <span className="block text-xs text-muted-foreground">{option.description}</span>
          </Label>
        </div>
      ))}
    </div>
  );
}

export function SectionTableTranslationSettingsDialog({
  component,
  open,
  onOpenChange,
  onSave,
}: SectionTableTranslationSettingsDialogProps) {
  const [settings, setSettings] = React.useState<Required<SectionTableTranslationSettings>>(
    normalizeSettings(component.translationSettings),
  );

  React.useEffect(() => {
    if (open) {
      setSettings(normalizeSettings(component.translationSettings));
    }
  }, [component.id, component.translationSettings, open]);

  const updateSetting = (
    key: keyof Required<SectionTableTranslationSettings>,
    value: BuilderTranslationMode,
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Translation Settings
          </DialogTitle>
          <DialogDescription>
            Configure how this section table renders in language previews and translated PDFs.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="headers" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="headers">Headers</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="rows">Rows</TabsTrigger>
          </TabsList>
          <TabsContents>
          <TabsContent value="headers">
            <ModePicker
              label="section-table-headers-translation"
              value={settings.headers}
              onChange={(value) => updateSetting('headers', value)}
            />
          </TabsContent>
          <TabsContent value="tags">
            <ModePicker
              label="section-table-tags-translation"
              value={settings.tags}
              onChange={(value) => updateSetting('tags', value)}
            />
          </TabsContent>
          <TabsContent value="rows">
            <ModePicker
              label="section-table-rows-translation"
              value={settings.rows}
              onChange={(value) => updateSetting('rows', value)}
              options={ROW_MODE_OPTIONS}
            />
          </TabsContent>
          </TabsContents>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(settings);
              onOpenChange(false);
            }}
          >
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
