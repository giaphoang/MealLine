// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { messageService } from '@/services/message';
import { procurementService } from '@/services/procurement';
import { cn } from '@/lib/utils';
import type {
  DataShapingCatalogEntry,
  DataShapingFlag,
  DataShapingRule,
  DataShapingRuleInput,
  RuleScope,
} from '@/types/procurement';

const SCOPE_LABELS: Record<RuleScope, string> = {
  donor: 'A donor',
  category: 'A product category',
  date_range: 'A date range',
  event: 'A single event',
};

const SCOPE_HELP: Record<RuleScope, string> = {
  donor: 'Applies to every observation from this donor, including future imports.',
  category: 'Applies to lines carrying this product code.',
  date_range: 'Applies to everything received in the window, whatever the donor.',
  event: 'Applies to one specific event revision only.',
};

const SOURCE_OPTIONS = [
  { value: 'any', label: 'Every source' },
  { value: 'ofb', label: 'OFB Completed Orders' },
  { value: 'ofb_pickup', label: 'OFB Agency Pickups' },
  { value: 'legacy_community', label: 'Legacy community records' },
] as const;

export interface RuleDialogSeed {
  rule?: DataShapingRule;
  scope?: RuleScope;
  donorName?: string | null;
  donorCode?: string | null;
  source?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

interface DataShapingRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: DataShapingCatalogEntry[];
  seed: RuleDialogSeed | null;
  /** Donor names present in the data, offered so staff need not retype them. */
  donorSuggestions?: Array<{ name: string; code: string | null }>;
  onSaved: () => void | Promise<void>;
}

export function DataShapingRuleDialog({
  open,
  onOpenChange,
  catalog,
  seed,
  donorSuggestions = [],
  onSaved,
}: DataShapingRuleDialogProps) {
  const editing = seed?.rule ?? null;
  const [flag, setFlag] = React.useState<DataShapingFlag>('pass_through');
  const [scope, setScope] = React.useState<RuleScope>('donor');
  const [donorName, setDonorName] = React.useState('');
  const [donorCode, setDonorCode] = React.useState('');
  const [productCode, setProductCode] = React.useState('');
  const [source, setSource] = React.useState('any');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [note, setNote] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [donorPickerOpen, setDonorPickerOpen] = React.useState(false);

  // Reset from the seed each time the dialog opens so a prefilled rule (from an
  // import row, say) never leaks into the next one.
  React.useEffect(() => {
    if (!open) return;
    const base = seed?.rule;
    setFlag(base?.flag ?? 'pass_through');
    setScope(base?.scope ?? seed?.scope ?? 'donor');
    setDonorName(base?.donorName ?? seed?.donorName ?? '');
    setDonorCode(base?.donorCode ?? seed?.donorCode ?? '');
    setProductCode(base?.productCode ?? '');
    setSource(base?.source ?? seed?.source ?? 'any');
    setStartDate(base?.startDate ?? seed?.startDate ?? '');
    setEndDate(base?.endDate ?? seed?.endDate ?? '');
    setNote(base?.note ?? '');
  }, [open, seed]);

  const selected = catalog.find((entry) => entry.flag === flag);
  const exclusions = catalog.filter((entry) => entry.family === 'exclusion');
  const annotations = catalog.filter((entry) => entry.family === 'annotation');
  const noteRequired = flag === 'other_exclusion';

  const problems: string[] = [];
  if (scope === 'donor' && !donorName.trim() && !donorCode.trim()) {
    problems.push('Name a donor, a donor code, or both.');
  }
  if (scope === 'category' && !productCode.trim()) problems.push('Enter a product code.');
  if (scope === 'date_range' && !startDate && !endDate) problems.push('Choose a start or end date.');
  if (startDate && endDate && startDate > endDate) problems.push('The start date is after the end date.');
  if (noteRequired && !note.trim()) {
    problems.push('An "other exclusion" needs a note explaining what is excluded and why.');
  }

  const save = async () => {
    const input: DataShapingRuleInput = {
      flag,
      scope,
      donorName: scope === 'donor' ? donorName.trim() || null : null,
      donorCode: scope === 'donor' ? donorCode.trim() || null : null,
      productCode: scope === 'category' ? productCode.trim() || null : null,
      orderRevisionId: editing?.orderRevisionId ?? null,
      source: source === 'any' ? null : source,
      startDate: startDate || null,
      endDate: endDate || null,
      note: note.trim() || null,
    };
    try {
      setIsSaving(true);
      if (editing) {
        await procurementService.updateRule(editing.id, input);
        messageService.success('Rule updated.');
      } else {
        await procurementService.createRule(input);
        messageService.success('Rule saved. It applies to existing and future imports.');
      }
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      ErrorHandlerService.handleError(error, 'procurementSaveDataRule');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit data rule' : 'Add data rule'}</DialogTitle>
          <DialogDescription>
            Rules never change or delete imported data. They record how your agency reads it, and
            Analytics decides which flags to honor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rule-flag">Flag</Label>
            <Select value={flag} onValueChange={(value) => setFlag(value as DataShapingFlag)}>
              <SelectTrigger id="rule-flag"><SelectValue /></SelectTrigger>
              <SelectContent>
                {exclusions.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      Excludes weight from supply totals
                    </div>
                    {exclusions.map((entry) => (
                      <SelectItem key={entry.flag} value={entry.flag}>
                        {flagLabel(entry.flag)}
                      </SelectItem>
                    ))}
                  </>
                )}
                {annotations.length > 0 && (
                  <>
                    <div className="mt-1 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      Adds context, never changes a total
                    </div>
                    {annotations.map((entry) => (
                      <SelectItem key={entry.flag} value={entry.flag}>
                        {flagLabel(entry.flag)}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            {selected && <p className="text-xs text-muted-foreground">{selected.description}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-scope">Applies to</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as RuleScope)}>
              <SelectTrigger id="rule-scope"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SCOPE_LABELS) as RuleScope[])
                  .filter((value) => value !== 'event' || editing?.scope === 'event')
                  .map((value) => (
                    <SelectItem key={value} value={value}>{SCOPE_LABELS[value]}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{SCOPE_HELP[scope]}</p>
          </div>

          {scope === 'donor' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rule-donor-name">Donor name</Label>
                <Popover open={donorPickerOpen} onOpenChange={setDonorPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="rule-donor-name"
                      variant="outline"
                      role="combobox"
                      aria-expanded={donorPickerOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className={cn('truncate', !donorName && 'text-muted-foreground')}>
                        {donorName || 'Choose or enter a donor'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-(--radix-popover-trigger-width) p-0"
                  >
                    <Command shouldFilter>
                      <CommandInput
                        value={donorName}
                        onValueChange={setDonorName}
                        placeholder="Search or enter a donor..."
                      />
                      <CommandList>
                        <CommandEmpty>
                          Keep typing to use this donor name.
                        </CommandEmpty>
                        <CommandGroup>
                          {donorSuggestions.map((donor) => (
                            <CommandItem
                              key={`${donor.code ?? 'name'}:${donor.name}`}
                              value={donor.name}
                              onSelect={() => {
                                setDonorName(donor.name);
                                if (donor.code) setDonorCode(donor.code);
                                setDonorPickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  donorName === donor.name ? 'opacity-100' : 'opacity-0'
                                )}
                                aria-hidden="true"
                              />
                              <span className="truncate">{donor.name}</span>
                              {donor.code && (
                                <span className="ml-auto pl-2 text-xs text-muted-foreground">
                                  {donor.code}
                                </span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-donor-code">Donor code</Label>
                <Input
                  id="rule-donor-code"
                  value={donorCode}
                  placeholder="RNS300"
                  onChange={(event) => setDonorCode(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Either identifier is enough. Codes survive renames.
                </p>
              </div>
            </div>
          )}

          {scope === 'category' && (
            <div className="space-y-2">
              <Label htmlFor="rule-product-code">Product code</Label>
              <Input
                id="rule-product-code"
                value={productCode}
                placeholder="41000"
                onChange={(event) => setProductCode(event.target.value)}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="rule-source">Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id="rule-source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-start">From</Label>
              <Input
                id="rule-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-end">Until</Label>
              <Input
                id="rule-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-note">
              Note{noteRequired ? '' : ' (optional)'}
            </Label>
            <Textarea
              id="rule-note"
              value={note}
              rows={2}
              placeholder="Why this rule exists — the knowledge the data cannot carry."
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {problems.length > 0 && (
            <ul className="space-y-1 text-sm text-destructive">
              {problems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isSaving || problems.length > 0}>
            {editing ? 'Save changes' : 'Add rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function flagLabel(flag: DataShapingFlag): string {
  switch (flag) {
    case 'pass_through': return 'Pass-through (relayed to another agency)';
    case 'other_exclusion': return 'Other exclusion';
    case 'at_risk': return 'At risk';
    case 'estimated': return 'Estimated';
    case 'program_bound': return 'Program-bound';
    default: return flag;
  }
}
