// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DateRangeControl } from '@/components/shared/date-range-control';
import { DEFAULT_ANALYTICS_RANGE, type AnalyticsDateRange } from '@/types/analytics';
import { analyticsReportsService } from '@/services/analytics-reports';
import { messageService } from '@/services/message';
import {
  cardAvailability,
  outputsLabel,
  scopeLabel,
  type AnalyticsTemplateSpec,
} from './template-spec';

/**
 * Runs a saved template.
 *
 * The template supplies everything except the period: cards, their order, the
 * filters, and the PDF/CSV choices are all fixed by whoever saved it. All that
 * is asked here is *when* — which is why this dialog is a date picker with a
 * summary above it rather than a second copy of the Analytics modal.
 *
 * The same range control the Analytics page uses is reused deliberately. A
 * report generated from a template must mean the same thing as one generated
 * from the screen, and two pickers with two notions of "last 90 days" is the
 * obvious way for that to stop being true.
 *
 * Cards can be removed from the registry between saving and running. That is
 * checked here, on open, so the user is told before they wait for a download —
 * the server would otherwise report it in a response header, after the file has
 * already landed.
 */

export interface RunTemplateTarget {
  id: number;
  name: string;
  spec: AnalyticsTemplateSpec;
}

export function RunTemplateDialog({
  target,
  onOpenChange,
  /** Card id → current title, from the server's registry. Null while unknown. */
  cardTitles,
}: {
  target: RunTemplateTarget | null;
  onOpenChange: (open: boolean) => void;
  cardTitles: Record<string, string> | null;
}) {
  const [range, setRange] = React.useState<AnalyticsDateRange>(DEFAULT_ANALYTICS_RANGE);
  const [isGenerating, setIsGenerating] = React.useState(false);

  // Each run starts from the default period rather than inheriting the last
  // one: a template is run for a new month, and a stale range carried over
  // silently is the mistake this whole flow exists to avoid.
  React.useEffect(() => {
    if (target) setRange(DEFAULT_ANALYTICS_RANGE);
  }, [target]);

  const spec = target?.spec;
  const { available, missing } = spec
    ? cardAvailability(spec, cardTitles)
    : { available: [], missing: [] };

  const canGenerate = Boolean(target) && available.length > 0 && !isGenerating;

  const handleGenerate = async () => {
    if (!target || !spec || !canGenerate) return;
    setIsGenerating(true);
    try {
      // Only the cards that still exist are requested, so what is asked for is
      // exactly what the dialog said would be produced.
      await analyticsReportsService.downloadReport({
        cardIds: available,
        title: target.name,
        includePdf: spec.includePdf,
        includeCsv: spec.includeCsv,
        csvGrain: spec.csvGrain,
        cardOptions: spec.cardOptions,
        preset: range.preset,
        startDate: range.startDate,
        endDate: range.endDate,
        channel: spec.channel,
        acquisitionClass: spec.acquisitionClass,
      });
      messageService.success(`"${target.name}" downloaded.`);
      onOpenChange(false);
    } catch {
      messageService.error(
        'Unable to generate the report. Check your connection and try again.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={next => !isGenerating && onOpenChange(next)}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Run "{target?.name}"</DialogTitle>
          <DialogDescription>
            Choose the period. Everything else comes from the saved template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <DateRangeControl value={range} onChange={setRange} />

          {missing.length > 0 && (
            // Said before the Generate button, not after the download. The
            // report is still worth running without them, so this warns rather
            // than blocks — unless nothing is left.
            <div className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="font-medium">
                  {missing.length === 1 ? 'A card in this template is' : `${missing.length} cards in this template are`}{' '}
                  no longer available
                </p>
                <p className="text-muted-foreground">
                  {available.length > 0
                    ? `The report will be generated with the remaining ${available.length} card${available.length === 1 ? '' : 's'}. Save a new template from Analytics to replace it.`
                    : 'Nothing is left to generate. Save a new template from Analytics and delete this one.'}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2 text-sm">
            <p className="font-medium">Included cards, in order</p>
            <ol className="space-y-1">
              {spec?.cardIds.map((cardId, index) => {
                const isMissing = cardTitles !== null && cardTitles[cardId] === undefined;
                return (
                  <li
                    key={cardId}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                      isMissing ? 'border-dashed text-muted-foreground' : 'bg-background'
                    }`}
                  >
                    <span className="w-5 shrink-0 tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {cardTitles?.[cardId] ?? cardId}
                    </span>
                    {isMissing && (
                      <span className="shrink-0 text-xs uppercase tracking-wide">
                        Unavailable
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Filters</dt>
            <dd>{spec ? scopeLabel(spec) : '—'}</dd>
            <dt className="text-muted-foreground">Includes</dt>
            <dd>{spec ? outputsLabel(spec) : '—'}</dd>
          </dl>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          <Button onClick={() => void handleGenerate()} disabled={!canGenerate}>
            {isGenerating ? 'Generating…' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
