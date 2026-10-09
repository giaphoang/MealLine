// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { format, isValid, parseISO, startOfYear, subDays } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  DateRangePreset,
  DateRangeSelection,
} from '@/types/date-range';

const PRESETS: Array<{ preset: Exclude<DateRangePreset, 'custom'>; label: string }> = [
  { preset: 'last-7-days', label: '7d' },
  { preset: 'last-30-days', label: '30d' },
  { preset: 'last-90-days', label: '90d' },
  { preset: 'ytd', label: 'YTD' },
  { preset: 'all', label: 'All' },
];

const validDate = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value;
};

const dateRangeFromValue = (value: DateRangeSelection): DateRange | undefined => {
  if (value.preset === 'custom' && value.startDate && value.endDate) {
    return { from: parseISO(value.startDate), to: parseISO(value.endDate) };
  }
  const today = new Date();
  switch (value.preset) {
    case 'last-7-days':
      return { from: subDays(today, 6), to: today };
    case 'last-30-days':
      return { from: subDays(today, 29), to: today };
    case 'last-90-days':
      return { from: subDays(today, 89), to: today };
    case 'ytd':
      return { from: startOfYear(today), to: today };
    case 'all':
    case 'custom':
      return undefined;
  }
};

interface DateRangeControlProps {
  value: DateRangeSelection;
  onChange: (range: DateRangeSelection) => void;
}

const textOf = (date: Date | undefined) => (date ? format(date, 'yyyy-MM-dd') : '');

export function DateRangeControl({ value, onChange }: DateRangeControlProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>(
    dateRangeFromValue(value)
  );
  // Typed Start/End fields kept in sync with the calendar (the ZEV pattern):
  // the calendar and the inputs are two views of one draft range.
  const [draftText, setDraftText] = React.useState<{ from: string; to: string }>({
    from: textOf(dateRangeFromValue(value)?.from),
    to: textOf(dateRangeFromValue(value)?.to),
  });

  const handleOpenChange = (open: boolean) => {
    if (open) {
      const initial = dateRangeFromValue(value) ?? {
        from: subDays(new Date(), 89),
        to: new Date(),
      };
      setDraft(initial);
      setDraftText({ from: textOf(initial.from), to: textOf(initial.to) });
    }
    setIsOpen(open);
  };

  // Calendar → inputs.
  const handleSelect = (range: DateRange | undefined) => {
    setDraft(range);
    setDraftText({ from: textOf(range?.from), to: textOf(range?.to) });
  };

  // Inputs → calendar. Only a fully valid date moves the draft; partial typing
  // updates the text without snapping the calendar around.
  const handleTextChange = (field: 'from' | 'to', text: string) => {
    setDraftText((current) => ({ ...current, [field]: text }));
    if (!validDate(text)) return;
    const parsed = parseISO(text);
    const other = field === 'from' ? draft?.to : draft?.from;
    const inverted = other
      && (field === 'from' ? parsed > other : parsed < other);

    if (inverted) {
      // A valid date that crosses the opposite boundary starts a new one-day
      // range. Keep both text fields and the calendar on that same truth.
      setDraft({ from: parsed, to: parsed });
      setDraftText({ from: text, to: text });
      return;
    }

    setDraft((current) => ({
      from: field === 'from' ? parsed : current?.from,
      to: field === 'to' ? parsed : current?.to,
    }));
  };

  const handleTextBlur = (field: 'from' | 'to') => {
    if (validDate(draftText[field])) return;
    setDraftText((current) => ({
      ...current,
      [field]: textOf(field === 'from' ? draft?.from : draft?.to),
    }));
  };

  const customLabel = value.preset === 'custom' && value.startDate && value.endDate
    ? `${format(parseISO(value.startDate), 'MMM d')} – ${format(parseISO(value.endDate), 'MMM d, yyyy')}`
    : 'Custom range';

  const isDraftComplete = validDate(draftText.from)
    && validDate(draftText.to)
    && draftText.from <= draftText.to;

  const applyCustomRange = () => {
    if (!isDraftComplete) return;
    onChange({
      preset: 'custom',
      startDate: draftText.from,
      endDate: draftText.to,
    });
    setIsOpen(false);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium">Date Range</span>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Tabs
          value={value.preset}
          onValueChange={(preset) => onChange({ preset: preset as DateRangePreset })}
          className="w-full sm:w-auto"
        >
          <TabsList aria-label="Date range presets" className="grid h-auto w-full grid-cols-5 sm:flex sm:w-auto">
            {PRESETS.map((option) => (
              <TabsTrigger key={option.preset} value={option.preset}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Popover open={isOpen} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              aria-pressed={value.preset === 'custom'}
              className={value.preset === 'custom'
                ? 'w-full border-primary bg-accent justify-start sm:w-auto'
                : 'w-full justify-start sm:w-auto'}
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              {customLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[262px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-border/70 bg-background/80 p-0 shadow-xl backdrop-blur-[14px] backdrop-saturate-150 supports-backdrop-filter:bg-background/90"
            align="end"
          >
            {/* One month with clickable month/year dropdown captions, matching
                the ZEV picker pattern. */}
            <Calendar
              className="mx-auto"
              mode="range"
              captionLayout="dropdown"
              selected={draft}
              onSelect={handleSelect}
              numberOfMonths={1}
              defaultMonth={draft?.from}
              startMonth={new Date(2000, 0, 1)}
              endMonth={new Date()}
              disabled={{ after: new Date() }}
              initialFocus
            />
            <Separator />
            <form
              className="space-y-3 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                applyCustomRange();
              }}
            >
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="range-start" className="text-xs text-muted-foreground">Start</Label>
                  <Input
                    id="range-start"
                    inputMode="numeric"
                    placeholder="YYYY-MM-DD"
                    value={draftText.from}
                    aria-invalid={draftText.from !== '' && !validDate(draftText.from)}
                    onChange={(event) => handleTextChange('from', event.target.value)}
                    onBlur={() => handleTextBlur('from')}
                    className="h-8 px-2 py-0.5 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="range-end" className="text-xs text-muted-foreground">End</Label>
                  <Input
                    id="range-end"
                    inputMode="numeric"
                    placeholder="YYYY-MM-DD"
                    value={draftText.to}
                    aria-invalid={draftText.to !== '' && !validDate(draftText.to)}
                    onChange={(event) => handleTextChange('to', event.target.value)}
                    onBlur={() => handleTextBlur('to')}
                    className="h-8 px-2 py-0.5 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Dates use the organization timezone configured in Settings.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!isDraftComplete}>
                  Apply
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
