// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { UploadIcon } from '@/components/animate-ui/icons/upload';
import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { messageService } from '@/services/message';
import { procurementService } from '@/services/procurement';
import type { ProcurementWarning, UnifiedImportResult } from '@/types/procurement';

/** Must match MAX_IMPORT_BYTES in routes/procurement.ts, which documents why. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function importedSummary(result: UnifiedImportResult): string {
  const rows = result.rowCount.toLocaleString();
  const parts: string[] = [];
  if (result.warehouse) {
    parts.push(`${result.warehouse.orderCount} warehouse order${result.warehouse.orderCount === 1 ? '' : 's'}`);
  }
  if (result.freshAlliance) {
    const pickups = `${result.freshAlliance.pickupCount} pickup${result.freshAlliance.pickupCount === 1 ? '' : 's'}`;
    // Superseding is the part staff would otherwise have to reason about, so
    // the confirmation says plainly that weight was not counted twice.
    const superseded = result.freshAlliance.supersededEventCount > 0
      ? `, replacing ${result.freshAlliance.supersededEventCount} matching Completed Orders receipt${result.freshAlliance.supersededEventCount === 1 ? '' : 's'} so weight is counted once`
      : '';
    parts.push(`${pickups} with donor detail${superseded}`);
  }
  return `Imported ${rows} rows across ${parts.join(' and ')}`;
}

/** Both `ProcurementImport` rows a unified import produces -- Warehouse and
 *  Fresh Alliance are permanently separate source namespaces -- so they can
 *  be undone together with one click. */
export function importIds(result: UnifiedImportResult): number[] {
  return [result.warehouse?.importId, result.freshAlliance?.importId]
    .filter((id): id is number => typeof id === 'number');
}

export function warningCount(result: UnifiedImportResult): number {
  return (result.warehouse?.warningCount ?? 0) + (result.freshAlliance?.warningCount ?? 0);
}

export function combinedWarnings(result: UnifiedImportResult): ProcurementWarning[] {
  return [...(result.warehouse?.warnings ?? []), ...(result.freshAlliance?.warnings ?? [])];
}

interface OfbImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (result: UnifiedImportResult) => Promise<void> | void;
}

export function OfbImportDialog({
  open,
  onOpenChange,
  onImported,
}: OfbImportDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [result, setResult] = React.useState<UnifiedImportResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setIsDragging(false);
      setIsImporting(false);
      setElapsedSeconds(0);
      setResult(null);
    }
  }, [open]);

  // A real elapsed counter rather than a simulated percentage. The server does
  // the whole import in one atomic transaction and reports nothing until it
  // returns, so any progress bar here would be invented. Counting actual
  // seconds is honest, and it is what distinguishes "still working" from
  // "hung" for someone watching a spinner.
  React.useEffect(() => {
    if (!isImporting) return;
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isImporting]);

  const selectFile = (selected: File | undefined) => {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.csv')) {
      messageService.error('Choose a CSV created by the standardized OFB exporter.');
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      messageService.error('Choose an OFB CSV smaller than 10 MB.');
      return;
    }
    setResult(null);
    setFile(selected);
  };

  const importFile = async () => {
    if (!file) return;
    try {
      setIsImporting(true);
      const imported = await procurementService.importOfbExport(file);
      await onImported(imported);
      if (imported.outcome === 'duplicate') {
        messageService.info(
          'This OFB export is already current. No changes were made.'
        );
        onOpenChange(false);
        return;
      }
      if (warningCount(imported) === 0) {
        const undoIds = importIds(imported);
        messageService.success(
          `${importedSummary(imported)}.`,
          undoIds.length === 0 ? undefined : {
            action: {
              label: 'Undo Import',
              onClick: () => {
                void procurementService.rollbackImports(undoIds)
                  .then(async () => {
                    await onImported(imported);
                    messageService.success('The import was rolled back.');
                  })
                  .catch((error) => ErrorHandlerService.handleError(
                    error,
                    'procurementRollbackImport'
                  ));
              },
            },
          }
        );
        onOpenChange(false);
        return;
      }
      setResult(imported);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'procurementImportOfb');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isImporting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Import OFB Data</DialogTitle>
          <DialogDescription>
            Import the unified OFB export from Order History in{' '}
            <a
              href="https://ofb.primarius.app/PWW/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Primarius
            </a>
            .
            <span className="mt-2 block">
              Required: Download the{' '}
              <a
                href="/downloads/OFB-Order-CSV-Exporter-v2.0.0.zip"
                download
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                OFB Order CSV Exporter Chrome Extension and installation guide
              </a>
              .
            </span>
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <Alert variant="warning" className="items-start">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <AlertTitle>Imported with source warnings</AlertTitle>
                <AlertDescription>
                  {importedSummary(result)} and preserved {warningCount(result)} note{warningCount(result) === 1 ? '' : 's'} for review.
                </AlertDescription>
              </div>
            </Alert>
            <ScrollArea className="h-56 rounded-md border">
              <ul className="space-y-3 p-4 text-sm">
                {combinedWarnings(result).map((warning, index) => (
                  <li key={`${warning.code}-${warning.deliveryDate}-${index}`}>
                    <p className="font-medium">{warning.deliveryDate}</p>
                    <p className="text-muted-foreground">{warning.message}</p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        ) : isImporting ? (
          /* Progress state, following the Translate & Download PDF pattern:
             a spinning Loader2 with a status label. Deliberately indeterminate
             — see the elapsed-seconds effect above for why a percentage here
             would be fabricated. */
          <div className="space-y-4 py-6" role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="font-medium">Importing {file?.name ?? 'your file'}…</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {elapsedSeconds < 1
                    ? 'Reading the file…'
                    : `Working — ${elapsedSeconds} second${elapsedSeconds === 1 ? '' : 's'} elapsed`}
                </p>
              </div>
            </div>
            <div className="rounded-md border translation-options-column p-3 text-sm text-muted-foreground">
              <p>
                A large export can take up to about 30 seconds. Please keep this
                window open.
              </p>
              {/* The reassurance that matters most: the import is one atomic
                  transaction, so waiting cannot leave the data half-written. */}
              <p className="mt-2">
                Your existing data is unchanged until the import finishes. If it
                fails, nothing is partly imported.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div
              className={cn(
                'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
                isDragging ? 'border-primary bg-primary/5' : 'border-border'
              )}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget === event.target) setIsDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                selectFile(event.dataTransfer.files[0]);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => selectFile(event.target.files?.[0])}
              />
              <FileText className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 font-medium">
                {isDragging ? 'Drop the OFB CSV here' : 'Drag and drop an OFB CSV'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">or choose one from this device</p>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                disabled={isImporting}
                onClick={() => inputRef.current?.click()}
              >
                Choose CSV
              </Button>
            </div>

            {file && (
              <div className="flex items-start gap-3 rounded-md border translation-options-column p-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB · discarded after import
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
                Cancel
              </Button>
              <AnimateIcon asChild animateOnHover animateOnTap>
                <Button onClick={() => void importFile()} disabled={!file || isImporting}>
                  <UploadIcon size={16} />
                  {isImporting ? 'Importing…' : 'Import Data'}
                </Button>
              </AnimateIcon>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
