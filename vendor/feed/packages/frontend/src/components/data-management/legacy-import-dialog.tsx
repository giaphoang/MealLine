// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
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
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { messageService } from '@/services/message';
import { procurementService } from '@/services/procurement';
import type { LegacyImportResult } from '@/types/procurement';

const pounds = (hundredths: number) =>
  `${(hundredths / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} lb`;

interface LegacyImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void | Promise<void>;
}

/**
 * The legacy sidecar (D22). Deliberately plain and deliberately narrow: it
 * accepts one curated ledger this agency authored from its own pre-Primarius
 * records, and it teaches FEED nothing general about spreadsheets.
 */
export function LegacyImportDialog({ open, onOpenChange, onImported }: LegacyImportDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const [result, setResult] = React.useState<LegacyImportResult | null>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setResult(null);
    }
  }, [open]);

  const runImport = async () => {
    if (!file) return;
    try {
      setIsImporting(true);
      const imported = await procurementService.importLegacyLedger(file);
      setResult(imported);
      if (imported.outcome === 'duplicate') {
        messageService.info('That ledger is already loaded; nothing changed.');
      } else {
        messageService.success(
          `Loaded ${imported.monthCount.toLocaleString()} months of community donation history.`
        );
      }
      await onImported();
    } catch (error) {
      ErrorHandlerService.handleError(error, 'procurementLegacyImport');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Import historical community donations</DialogTitle>
          <DialogDescription>
            For the curated ledger of donations this agency received directly, before Primarius
            records begin. This is not the OFB import — use “Import OFB Data” for exports from the
            OFB portal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            These records are <strong>monthly totals</strong> — a source and a weight for each
            month, with no delivery dates, product codes, or categories. FEED counts them toward
            inbound weight over time and keeps them out of every product and category view, because
            there is nothing there to show.
          </div>

          <div className="space-y-2">
            <Label htmlFor="legacy-file">Curated ledger (CSV)</Label>
            <Input
              id="legacy-file"
              type="file"
              accept=".csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
          </div>

          {result && (
            <dl className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Months</dt>
                <dd className="font-medium">{result.monthCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sources</dt>
                <dd className="font-medium">{result.sourceCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Weight</dt>
                <dd className="font-medium">{pounds(result.totalWeightHundredths)}</dd>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-muted-foreground">Covering</dt>
                <dd className="font-medium">
                  {format(parseISO(result.rangeStart), 'MMM yyyy')} –{' '}
                  {format(parseISO(result.rangeEnd), 'MMM yyyy')}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          <Button onClick={runImport} disabled={!file || isImporting}>
            {isImporting ? 'Importing…' : 'Import Ledger'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
