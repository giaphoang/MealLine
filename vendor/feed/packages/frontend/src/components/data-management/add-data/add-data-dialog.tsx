// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { FileSpreadsheetIcon } from '@/components/animate-ui/icons/file-spreadsheet';
import { UploadIcon } from '@/components/animate-ui/icons/upload';
import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, FileText, Loader2, ShieldCheck } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { formatDate, formatDateRange } from '@/lib/formatting/date';
import {
  dataImportService,
  type DataImportActivationResult,
  type DataImportJobReview,
  type Link2FeedReviewAction,
  type Link2FeedReviewSummary,
  type WthTrackingReviewSummary,
} from '@/services/data-import';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { messageService } from '@/services/message';
import { procurementService } from '@/services/procurement';
import { serviceApi, type LottoQueueImportResult } from '@/services/service';
import type { LegacyImportResult, ProcurementWarning, UnifiedImportResult } from '@/types/procurement';
import { format, parseISO } from 'date-fns';
import { ImportProgressPanel } from './import-progress-panel';
import { detectCsvSource, type DetectedSource } from './source-contracts';

type PrototypeStep = 'select' | 'review' | 'complete';
type ProcurementResult =
  | { kind: 'ofb'; value: UnifiedImportResult }
  | { kind: 'legacy'; value: LegacyImportResult };

const MAX_HEADER_BYTES = 256 * 1024;
const SERVICE_CONTRACT_IDS = new Set([
  'link2feed_visits_v1',
  'simc_service_visits_v1',
  'wth_service_tracking_v1',
]);

const readBlobAsText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(reader.error ?? new Error('Unable to read file'));
  reader.readAsText(blob, 'utf-8');
});

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const warningCount = (result: UnifiedImportResult) =>
  (result.warehouse?.warningCount ?? 0) + (result.freshAlliance?.warningCount ?? 0);

const combinedWarnings = (result: UnifiedImportResult): ProcurementWarning[] => [
  ...(result.warehouse?.warnings ?? []),
  ...(result.freshAlliance?.warnings ?? []),
];

const ofbImportIds = (result: UnifiedImportResult) => [
  result.warehouse?.importId,
  result.freshAlliance?.importId,
].filter((id): id is number => typeof id === 'number');

const ofbEventSummary = (result: UnifiedImportResult) => {
  const warehouse = result.warehouse?.orderCount ?? 0;
  const pickups = result.freshAlliance?.pickupCount ?? 0;
  return `${warehouse.toLocaleString()} warehouse order${warehouse === 1 ? '' : 's'} · ${pickups.toLocaleString()} pickup${pickups === 1 ? '' : 's'}`;
};

const pounds = (hundredths: number) =>
  `${(hundredths / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} lb`;

interface AddDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdministrator?: boolean;
  onImported?: () => Promise<void> | void;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
}

/**
 * One source-neutral entry point. Browser preflight reads only the header;
 * operational contracts then enter their server-side review branch.
 */
export function AddDataDialog({
  open,
  onOpenChange,
  isAdministrator = true,
  onImported,
  returnFocusRef,
}: AddDataDialogProps) {
  const [step, setStep] = React.useState<PrototypeStep>('select');
  const [file, setFile] = React.useState<File | null>(null);
  const [detection, setDetection] = React.useState<DetectedSource | null>(null);
  const [isInspecting, setIsInspecting] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [job, setJob] = React.useState<DataImportJobReview | null>(null);
  const [result, setResult] = React.useState<DataImportActivationResult | null>(null);
  const [procurementResult, setProcurementResult] = React.useState<ProcurementResult | null>(null);
  const [lottoResult, setLottoResult] = React.useState<LottoQueueImportResult | null>(null);
  const [isWorking, setIsWorking] = React.useState(false);
  const [decisionAction, setDecisionAction] = React.useState<Link2FeedReviewAction>('keep_source_interpretation');
  const [decisionReason, setDecisionReason] = React.useState('');
  const [eventLabel, setEventLabel] = React.useState('');
  const [resumable, setResumable] = React.useState<DataImportJobReview | null>(null);
  // Set the moment activation is requested. POST /activate answers 202 with the
  // job as it stands at that instant, and the ready→activating transition
  // happens inside the background task — so the response almost always still
  // reads `ready`. Keying the poll on status alone therefore never started it,
  // and a finished activation was never picked up: the server reported
  // `completed` while the dialog still offered "Activate Data".
  const [activationRequested, setActivationRequested] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // The server owns the work; these two statuses mean it is still running it.
  const isBackgroundRunning = job?.status === 'preparing' || job?.status === 'activating';
  const isTerminal = job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled';
  const shouldPoll = Boolean(job) && (isBackgroundRunning || (activationRequested && !isTerminal));
  const showProgress = Boolean(job) && (isBackgroundRunning || isWorking
    || (activationRequested && !isTerminal));

  const reset = React.useCallback(() => {
    setStep('select');
    setFile(null);
    setDetection(null);
    setIsInspecting(false);
    setIsDragging(false);
    setError(null);
    setJob(null);
    setResult(null);
    setProcurementResult(null);
    setLottoResult(null);
    setIsWorking(false);
    setDecisionAction('keep_source_interpretation');
    setDecisionReason('');
    setEventLabel('');
    setResumable(null);
    setActivationRequested(false);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  // Poll while the server is working. The import outlives this dialog either
  // way — closing the browser does not stop it — so this only decides whether
  // the user can watch, not whether the work completes.
  React.useEffect(() => {
    if (!open || !job || !shouldPoll) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const next = await dataImportService.getJob(job.id);
          if (!cancelled) setJob(next);
        } catch {
          // A dropped poll is not a failed import. Stay quiet and try again on
          // the next tick rather than reporting an error the server never sent.
        }
      })();
    }, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [open, job, shouldPoll]);

  // An import that lost its browser tab is still running on the server. Offer
  // the way back to it rather than letting the user start a second one.
  React.useEffect(() => {
    if (!open || job || !isAdministrator) return;
    let cancelled = false;
    void (async () => {
      try {
        const active = await dataImportService.getActiveJob();
        if (!cancelled) setResumable(active);
      } catch {
        // Resume is an offer, not a requirement; a failed lookup stays silent.
      }
    })();
    return () => { cancelled = true; };
  }, [open, job, isAdministrator]);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const inspectFile = async (selected: File | undefined) => {
    if (!selected) return;
    setError(null);
    setDetection(null);
    setFile(selected);

    if (!selected.name.toLocaleLowerCase('en-US').endsWith('.csv')) {
      setError(
        'Choose a CSV data export. Convert the WTH Tracking workbook with FEED’s versioned exporter before adding it.'
      );
      return;
    }
    if (selected.size === 0) {
      setError('This file is empty. Choose an export that contains a header row and data.');
      return;
    }

    try {
      setIsInspecting(true);
      const headerText = await readBlobAsText(selected.slice(0, MAX_HEADER_BYTES));
      const result = detectCsvSource(headerText);
      if (result.status === 'unknown') {
        setError(
          'FEED could not identify this CSV. Choose an OFB, Link2Feed, SIMC, or FEED-formatted WTH service-tracking export.'
        );
        return;
      }
      if (result.status === 'ambiguous') {
        setError(
          'This CSV matches more than one data contract. No data was changed; review the export and try again.'
        );
        return;
      }
      setDetection(result);
    } catch {
      setError('FEED could not read this file. Export it as UTF-8 CSV and try again.');
    } finally {
      setIsInspecting(false);
    }
  };

  const close = async () => {
    // Cancelling a job that a background task is mid-way through would delete
    // the staging rows out from under it — and there is no server-side abort to
    // stop the task itself. So closing during `preparing`/`activating` leaves
    // the import running and simply stops watching it; the resume offer is how
    // the user gets back. A job that is genuinely waiting on the user is still
    // cancelled, which is what discards its staged source data.
    const abandonable = job
      && !['completed', 'failed', 'cancelled', 'preparing', 'activating'].includes(job.status);
    if (abandonable && job) {
      setIsWorking(true);
      await dataImportService.cancel(job.id).catch(() => undefined);
      setIsWorking(false);
    }
    onOpenChange(false);
  };

  const refreshAfterImport = React.useCallback(async () => {
    try {
      await onImported?.();
    } catch (caught) {
      ErrorHandlerService.handleError(caught, 'procurementImportHistory');
    }
  }, [onImported]);

  const beginImport = async () => {
    if (!file || !detection) return;

    if (detection.contract.status !== 'operational') {
      setError(detection.contract.nextStep);
      return;
    }
    if (detection.contract.domain === 'service'
      && detection.contract.id !== 'lotto_queue_history_v1'
      && !isAdministrator) {
      setError('Administrator access is required to import Service data. Ask an administrator to add this file.');
      return;
    }
    if (detection.contract.id === 'ofb_completed_orders_v1' || detection.contract.id === 'ofb_agency_pickups_v1') {
      setError('This older OFB file is recognized but is no longer accepted. Export the unified OFB file and try again.');
      return;
    }

    try {
      setError(null);
      setIsWorking(true);

      if (detection.contract.id === 'lotto_queue_history_v1') {
        const imported = await serviceApi.importLottoHistory(file);
        setLottoResult(imported);
        setStep('complete');
        await refreshAfterImport();
        messageService[imported.outcome === 'no_op' ? 'info' : 'success'](
          imported.outcome === 'no_op'
            ? 'This LOTTO history is already current. No changes were made.'
            : `LOTTO history imported. ${imported.review} session${imported.review === 1 ? '' : 's'} await staff review.`,
        );
        return;
      }

      if (detection.contract.id === 'ofb_unified_v2') {
        const imported = await procurementService.importOfbExport(file);
        setProcurementResult({ kind: 'ofb', value: imported });
        setStep('complete');
        await refreshAfterImport();

        if (imported.outcome === 'duplicate') {
          messageService.info('This OFB export is already current. No changes were made.');
        } else if (warningCount(imported) === 0) {
          const importIds = ofbImportIds(imported);
          messageService.success('OFB data imported.', importIds.length === 0 ? undefined : {
            action: {
              label: 'Undo Import',
              onClick: () => {
                void procurementService.rollbackImports(importIds)
                  .then(async () => {
                    await refreshAfterImport();
                    messageService.success('The import was rolled back.');
                  })
                  .catch((caught) => ErrorHandlerService.handleError(caught, 'procurementRollbackImport'));
              },
            },
          });
        }
        return;
      }

      if (detection.contract.id === 'wth_legacy_procurement_v1') {
        const imported = await procurementService.importLegacyLedger(file);
        setProcurementResult({ kind: 'legacy', value: imported });
        setStep('complete');
        await refreshAfterImport();
        messageService[imported.outcome === 'duplicate' ? 'info' : 'success'](
          imported.outcome === 'duplicate'
            ? 'That historical ledger is already current. No changes were made.'
            : 'Historical community donations imported.'
        );
        return;
      }

      if (!SERVICE_CONTRACT_IDS.has(detection.contract.id)) {
        setError('FEED recognizes this file, but its import adapter is not available yet.');
        return;
      }

      // Returns once the file is staged and identified, not once it is
      // validated — the polling effect above takes it from here.
      setJob(await dataImportService.upload(file));
      setStep('complete');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'FEED could not validate this data file. Try again.');
    } finally {
      setIsWorking(false);
    }
  };

  const unresolvedIssues = job?.reviewIssues.filter((issue) => (
    issue.requiresDecision && issue.decisions.length === 0
  )) ?? [];
  const unresolvedIssue = unresolvedIssues.find((issue) => issue.severity === 'blocking')
    ?? unresolvedIssues[0];
  const resolvableOutlier = unresolvedIssue?.code === 'UNUSUALLY_LARGE_REPORTED_PEOPLE_COUNT';
  const trackingSummary = job?.reviewSummary && 'formalReconciliation' in job.reviewSummary
    ? job.reviewSummary as WthTrackingReviewSummary
    : null;
  const simcSummary = job?.reviewSummary && 'visitCount' in job.reviewSummary
    ? job.reviewSummary
    : null;
  const link2FeedSummary = job?.reviewSummary && 'rowCount' in job.reviewSummary && !trackingSummary
    ? job.reviewSummary as Link2FeedReviewSummary
    : null;

  const submitDecision = async () => {
    if (!job || !unresolvedIssue) return;
    try {
      setError(null);
      setIsWorking(true);
      const updated = await dataImportService.decide(job.id, unresolvedIssue.id, {
        action: decisionAction,
        reason: decisionReason,
        ...(decisionAction === 'apply_source_resolution' ? { eventLabel } : {}),
      });
      setJob(updated);
      // The action, label, and reason carry forward as editable defaults. A
      // historical archive raises the same kind of question repeatedly — WTH's
      // first import had 13 special-event aggregates — and retyping identical
      // text 13 times is friction, not diligence. Each issue still requires its
      // own explicit Save, and the fields stay visible and editable, so this
      // removes typing without ever applying one row's answer to another. Bulk
      // "apply to all" is deliberately NOT offered: a resolution is evidence
      // about one observation, and two rows that merely look alike are not the
      // same fact.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'FEED could not save this review decision. Try again.');
    } finally {
      setIsWorking(false);
    }
  };

  const activate = async () => {
    if (!job) return;
    try {
      setError(null);
      setIsWorking(true);
      setActivationRequested(true);
      // Accepted, not finished. The job reaches `completed` in the background
      // and the polling effect picks up the outcome and its counts.
      setJob(await dataImportService.activate(job.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'FEED could not activate this data. No partial data was applied.');
    } finally {
      setIsWorking(false);
    }
  };

  // Activation finishing is a background event, so the inventory refresh and
  // the success state are driven by the polled job rather than by a response.
  React.useEffect(() => {
    if (job?.status !== 'completed' || !job.activationOutcome || result) return;
    setResult({ outcome: job.activationOutcome, value: job.activationSummary ?? {
      importId: null,
      encounterRevisionCount: 0,
      profileRevisionCount: 0,
      qualityIssueCount: 0,
    } });
    void refreshAfterImport();
  }, [job, result, refreshAfterImport]);
  const serviceAccessBlocked = Boolean(
    detection?.contract.domain === 'service'
      && detection.contract.id !== 'lotto_queue_history_v1'
      && !isAdministrator
  );
  const legacyOfbContract = detection?.contract.id === 'ofb_completed_orders_v1'
    || detection?.contract.id === 'ofb_agency_pickups_v1';
  const adapterUnavailable = Boolean(
    detection && detection.contract.status !== 'operational' && !legacyOfbContract
  );
  const canStartImport = Boolean(
    detection && !serviceAccessBlocked && !legacyOfbContract && !adapterUnavailable
  );
  const dialogDescription = step === 'select'
    ? 'Choose a CSV. FEED identifies the source automatically.'
    : step === 'review'
      ? 'Confirm the file before FEED continues.'
      : procurementResult || lottoResult || result
        ? 'Your import is complete.'
        : 'Review the detected records before activation.';

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next && !isInspecting && !isWorking) void close();
    }}>
      <DialogContent
        className="sm:max-w-[700px]"
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Add Data</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-4">
            {/* An import keeps running after its browser tab goes away. Without
                this the work, and any questions it raised, are unreachable until
                the job expires — and the user's instinct is to upload again,
                which duplicates minutes of work. */}
            {/* Not an `Alert`: this project's Alert is deliberately a single
                centred row (icon, title, text on one line), so a heading plus a
                sentence plus an action lays out sideways in it. This mirrors the
                progress panel below instead, which is the same kind of object —
                a status panel with a state and an action. */}
            {resumable && (() => {
              const stillRunning = resumable.status === 'preparing' || resumable.status === 'activating';
              return (
                <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
                  {stillRunning
                    ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                    : <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm font-medium leading-none">An import is already in progress</p>
                    <p className="text-sm text-muted-foreground">
                      {resumable.status === 'awaiting_review'
                        ? `FEED finished reading ${resumable.processedRows.toLocaleString()} records and needs ${resumable.unresolvedIssueCount.toLocaleString()} decision${resumable.unresolvedIssueCount === 1 ? '' : 's'} from you.`
                        : resumable.status === 'ready'
                          ? 'A reviewed import is prepared and ready to activate.'
                          : `FEED is still working — ${resumable.processedRows.toLocaleString()} records so far.`}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setJob(resumable);
                        setResumable(null);
                        setStep('complete');
                      }}
                    >
                      Reopen that import
                    </Button>
                  </div>
                </div>
              );
            })()}

            <AnimateIcon asChild animateOnView animateOnViewOnce animateOnHover animateOnTap>
              <div
                className={`rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  void inspectFile(event.dataTransfer.files?.[0]);
                }}
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <FileSpreadsheetIcon
                    className="h-7 w-7 text-muted-foreground"
                    aria-hidden="true"
                    data-testid="add-data-file-spreadsheet-icon"
                  />
                </div>
                <p className="mt-4 font-medium">Drop a CSV here</p>
                <p className="mt-1 text-sm text-muted-foreground">or choose a file from this device</p>
                <Input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  aria-label="Choose data file"
                  onChange={(event) => void inspectFile(event.target.files?.[0])}
                />
                <AnimateIcon asChild animateOnView animateOnViewOnce animateOnHover animateOnTap>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    disabled={isInspecting}
                    onClick={() => inputRef.current?.click()}
                  >
                    <UploadIcon className="h-4 w-4" />
                    {isInspecting ? 'Inspecting…' : 'Choose File'}
                  </Button>
                </AnimateIcon>
                <p className="mt-4 text-xs text-muted-foreground">
                  Need an OFB export?{' '}
                  <a
                    href="/downloads/OFB-Order-CSV-Exporter-v2.0.0.zip"
                    download
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Download the exporter
                  </a>
                </p>
              </div>
            </AnimateIcon>

            {detection && (
              <div className="flex items-start gap-3 rounded-md border p-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{detection.contract.label}</p>
                    <span className="text-sm text-muted-foreground">{file ? formatBytes(file.size) : null}</span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{file?.name}</p>
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'review' && detection && file && (
          <div className="space-y-4">
            <div className="py-2 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <h3 className="mt-3 font-semibold">{detection.contract.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{detection.contract.datasetLabel}</p>
            </div>

            <div className="flex items-start gap-3 rounded-md border p-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatBytes(file.size)} · {detection.contract.sourceLabel}
                </p>
              </div>
            </div>

            {detection.ignoredHeaders.length > 0 && (
              <Alert>
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>
                  {detection.ignoredHeaders.length} unrecognized column{detection.ignoredHeaders.length === 1 ? '' : 's'} will be ignored.
                </AlertDescription>
              </Alert>
            )}

            {serviceAccessBlocked && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>
                  Administrator access is required to import Service data. Ask an administrator to add this file.
                </AlertDescription>
              </Alert>
            )}

            {legacyOfbContract && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>
                  This older OFB file is no longer accepted. Export the unified OFB file and try again.
                </AlertDescription>
              </Alert>
            )}

            {adapterUnavailable && (
              <Alert>
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{detection.contract.nextStep}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'complete' && procurementResult && (
          <div className="space-y-4">
            <div className="py-2 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <h3 className="mt-3 font-semibold">
                {procurementResult.value.outcome === 'duplicate'
                  ? 'No changes found'
                  : procurementResult.kind === 'ofb'
                    ? 'OFB data imported'
                    : 'Historical donations imported'}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {procurementResult.value.outcome === 'duplicate'
                  ? 'This file already matches the active data.'
                  : procurementResult.kind === 'ofb'
                    ? `${procurementResult.value.rowCount.toLocaleString()} row${procurementResult.value.rowCount === 1 ? '' : 's'} · ${ofbEventSummary(procurementResult.value)}`
                    : `${procurementResult.value.monthCount.toLocaleString()} month${procurementResult.value.monthCount === 1 ? '' : 's'} · ${pounds(procurementResult.value.totalWeightHundredths)}`}
              </p>
            </div>

            {procurementResult.kind === 'legacy' && (
              <div className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Sources</p>
                  <p className="font-medium">{procurementResult.value.sourceCount.toLocaleString()}</p>
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <p className="text-muted-foreground">Covering</p>
                  <p className="font-medium">
                    {format(parseISO(procurementResult.value.rangeStart), 'MMM yyyy')} –{' '}
                    {format(parseISO(procurementResult.value.rangeEnd), 'MMM yyyy')}
                  </p>
                </div>
              </div>
            )}

            {procurementResult.kind === 'ofb' && warningCount(procurementResult.value) > 0 && (
              <>
                <Alert variant="warning">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  <AlertDescription>
                    Imported with {warningCount(procurementResult.value).toLocaleString()} source warning{warningCount(procurementResult.value) === 1 ? '' : 's'}.
                  </AlertDescription>
                </Alert>
                <ScrollArea className="h-52 rounded-md border">
                  <div className="space-y-3 p-4 text-sm">
                    {combinedWarnings(procurementResult.value).map((warning, index) => (
                      <div key={`${warning.code}-${warning.deliveryDate}-${index}`}>
                        <p className="font-medium">{warning.deliveryDate}</p>
                        <p className="text-muted-foreground">{warning.message}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        )}

        {step === 'complete' && lottoResult && (
          <div className="space-y-4 py-2 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
            <div>
              <h3 className="font-semibold">
                {lottoResult.outcome === 'no_op' ? 'No changes found' : 'LOTTO history imported'}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {lottoResult.outcome === 'no_op'
                  ? 'This history file was already imported.'
                  : `${lottoResult.inserted.toLocaleString()} session${lottoResult.inserted === 1 ? '' : 's'} synchronized; ${lottoResult.review.toLocaleString()} await staff review.`}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Sessions awaiting review are preserved but withheld from Service Analytics.
              </p>
            </div>
          </div>
        )}

        {/* Deliberately outside the review-summary block below: while the job
            is preparing there is no summary yet, and gating progress on one is
            what leaves the user staring at an empty dialog for minutes. */}
        {step === 'complete' && job && showProgress && !result && (
          <ImportProgressPanel job={job} pending={activationRequested && !isTerminal} />
        )}

        {/* A failed job has no result and no review summary, so every other
            block below renders nothing and the dialog goes blank — the exact
            shape of ISSUES.md #75. The server's message names the offending
            record and says what to do about it; it is the most useful thing on
            the screen and it was being dropped. */}
        {step === 'complete' && job?.status === 'failed' && (
          <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium leading-none">This file was not imported</p>
              <p className="text-sm text-muted-foreground">
                {job.errorMessage || 'The import stopped before any data was changed.'}
              </p>
              <p className="text-xs text-muted-foreground">
                Nothing was changed. Correct the file and add it again
                {job.errorCode ? ` (${job.errorCode})` : ''}.
              </p>
            </div>
          </div>
        )}

        {step === 'complete' && job?.reviewSummary && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Service dates</p>
                <p className="mt-1 text-sm font-medium">
                  {formatDateRange(parseISO(job.reviewSummary.rangeStart), parseISO(job.reviewSummary.rangeEnd))}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{trackingSummary ? 'Metric observations' : 'Visit records'}</p>
                <p className="mt-1 font-medium">
                  {(trackingSummary?.rowCount ?? simcSummary?.visitCount ?? link2FeedSummary?.rowCount ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Ignored columns</p>
                <p className="mt-1 font-medium">{job.ignoredFieldCount.toLocaleString()}</p>
              </div>
            </div>

            <ScrollArea className="h-[390px] rounded-md border">
              <div className="space-y-5 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Reconciliation preview</h3>
                  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                    <div className="rounded-md bg-muted/50 p-2">
                      <span className="text-muted-foreground">New {trackingSummary ? 'observations' : 'visits'}</span>
                      <p className="font-medium">{(trackingSummary?.reconciliation.observations.new ?? (!trackingSummary && 'encounters' in job.reviewSummary.reconciliation ? job.reviewSummary.reconciliation.encounters.new : 0)).toLocaleString()}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <span className="text-muted-foreground">Revised {trackingSummary ? 'observations' : 'visits'}</span>
                      <p className="font-medium">{(trackingSummary?.reconciliation.observations.revised ?? (!trackingSummary && 'encounters' in job.reviewSummary.reconciliation ? job.reviewSummary.reconciliation.encounters.revised : 0)).toLocaleString()}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <span className="text-muted-foreground">Unchanged {trackingSummary ? 'observations' : 'visits'}</span>
                      <p className="font-medium">{(trackingSummary?.reconciliation.observations.unchanged ?? (!trackingSummary && 'encounters' in job.reviewSummary.reconciliation ? job.reviewSummary.reconciliation.encounters.unchanged : 0)).toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {trackingSummary
                      ? `${trackingSummary.regularHouseholdCount.toLocaleString()} regular-method households · ${trackingSummary.emergencyBagCount.toLocaleString()} Emergency Bags · ${trackingSummary.operationalHouseholdCount.toLocaleString()} operational services`
                      : simcSummary
                      ? `${simcSummary.identifiedHouseholdCount.toLocaleString()} household${simcSummary.identifiedHouseholdCount === 1 ? '' : 's'} · ${simcSummary.identifiedPersonCount.toLocaleString()} identified ${simcSummary.identifiedPersonCount === 1 ? 'person' : 'people'} · ${simcSummary.reportedPeopleCount.toLocaleString()} people represented`
                      : `${link2FeedSummary?.uniqueIdentifiedClientCount.toLocaleString()} identified clients · ${link2FeedSummary?.identityUnavailableEncounterCount.toLocaleString()} identity-unavailable visits · ${link2FeedSummary?.reportedPeopleCount.toLocaleString()} people reported`}
                  </p>
                </div>

                {simcSummary && (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">Household-member coverage</p>
                    <p className="mt-1 text-muted-foreground">
                      {simcSummary.rawRowCount.toLocaleString()} source rows represent{' '}
                      {simcSummary.memberCoveragePercent.toLocaleString()}% of the people reported by household size.{' '}
                      {simcSummary.visitsWithMemberCountMismatch.toLocaleString()} visit{simcSummary.visitsWithMemberCountMismatch === 1 ? '' : 's'} have a member-row difference; formal people totals remain unchanged.
                    </p>
                    {simcSummary.householdDatePairsWithMultipleVisits > 0 && (
                      <p className="mt-2 text-muted-foreground">
                        {simcSummary.householdDatePairsWithMultipleVisits.toLocaleString()} household/date pair{simcSummary.householdDatePairsWithMultipleVisits === 1 ? '' : 's'} contain multiple Visit IDs. FEED preserves the distinct formal visits and reports the pattern for review.
                      </p>
                    )}
                  </div>
                )}

                {trackingSummary && (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">Formal household comparison</p>
                    {trackingSummary.formalReconciliation.overlapDateCount > 0 ? (
                      <p className="mt-1 text-muted-foreground">
                        {trackingSummary.formalReconciliation.overlapDateCount.toLocaleString()} service date{trackingSummary.formalReconciliation.overlapDateCount === 1 ? '' : 's'} overlap active Link2Feed or SIMC data. Regular methods are {Math.abs(trackingSummary.formalReconciliation.regularDifference).toLocaleString()} {trackingSummary.formalReconciliation.regularDifference >= 0 ? 'higher' : 'lower'} overall, with a mean absolute daily difference of {trackingSummary.formalReconciliation.meanAbsoluteDailyRegularDifference.toLocaleString()}.
                      </p>
                    ) : (
                      <p className="mt-1 text-muted-foreground">
                        No active formal visit data overlaps this export yet. Tracking observations remain operational detail and do not become formal household totals.
                      </p>
                    )}
                    <p className="mt-2 text-muted-foreground">
                      Tracking values remain operational detail and are never added to formal Link2Feed or SIMC totals.
                    </p>
                    {trackingSummary.formalReconciliation.incompleteRegularMethodDateCount > 0 && (
                      <p className="mt-2 text-muted-foreground">
                        {trackingSummary.formalReconciliation.incompleteRegularMethodDateCount.toLocaleString()} date{trackingSummary.formalReconciliation.incompleteRegularMethodDateCount === 1 ? '' : 's'} with incomplete regular-method entries were excluded from this comparison; blank cells were not treated as zero.
                      </p>
                    )}
                    <p className="mt-2 text-muted-foreground">
                      Spreadsheet Total formulas were excluded. Blank cells remain unrecorded; {trackingSummary.explicitZeroCount.toLocaleString()} explicit zero{trackingSummary.explicitZeroCount === 1 ? '' : 'es'} remain recorded observations.
                    </p>
                  </div>
                )}

                {link2FeedSummary && link2FeedSummary.autoResolvedIssueCount > 0 && (
                  <Alert>
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    <div>
                      <AlertTitle>Known WTH historical event recognized</AlertTitle>
                      <AlertDescription>
                        The November 24, 2025 outdoor-market clicker tally is classified as 264 people served, with no household count.
                      </AlertDescription>
                    </div>
                  </Alert>
                )}

                {unresolvedIssue && !resolvableOutlier && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    <div>
                      <AlertTitle>Correct the source export before importing</AlertTitle>
                      <AlertDescription>
                        This file contains duplicate Link2Feed visit identities. FEED will not choose a row order or activate either interpretation. Correct or re-export the source data, then cancel this review and upload the new file.
                      </AlertDescription>
                    </div>
                  </Alert>
                )}

                {unresolvedIssue && resolvableOutlier && (
                  <div className="space-y-4 rounded-md border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">Review unusually large people count</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {unresolvedIssue.safeDetails.observedCount?.toLocaleString() ?? 'Unknown'} people on{' '}
                          {unresolvedIssue.safeDetails.serviceDate
                            ? formatDate(parseISO(unresolvedIssue.safeDetails.serviceDate))
                            : 'an unknown date'}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {job.unresolvedIssueCount} remaining
                      </Badge>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant={decisionAction === 'keep_source_interpretation' ? 'default' : 'outline'}
                        onClick={() => setDecisionAction('keep_source_interpretation')}
                      >
                        Keep as household visit
                      </Button>
                      <Button
                        type="button"
                        variant={decisionAction === 'apply_source_resolution' ? 'default' : 'outline'}
                        onClick={() => setDecisionAction('apply_source_resolution')}
                      >
                        Treat as event people tally
                      </Button>
                    </div>

                    {decisionAction === 'apply_source_resolution' && (
                      <div className="space-y-2">
                        <label htmlFor="service-event-label" className="text-sm font-medium">Event label</label>
                        <Input
                          id="service-event-label"
                          value={eventLabel}
                          maxLength={120}
                          onChange={(event) => setEventLabel(event.target.value)}
                          placeholder="Example: Holiday outdoor market"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label htmlFor="service-review-reason" className="text-sm font-medium">Decision reason</label>
                      <Textarea
                        id="service-review-reason"
                        value={decisionReason}
                        maxLength={500}
                        onChange={(event) => setDecisionReason(event.target.value)}
                        placeholder="Record the operational evidence for this interpretation."
                      />
                    </div>

                    <Button
                      type="button"
                      onClick={() => void submitDecision()}
                      disabled={isWorking || !decisionReason.trim() || (
                        decisionAction === 'apply_source_resolution' && !eventLabel.trim()
                      )}
                    >
                      Save Decision
                    </Button>
                  </div>
                )}

                {!unresolvedIssue && job.status === 'ready' && !result && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <div>
                      <AlertTitle>Ready to activate</AlertTitle>
                      <AlertDescription>
                        Every required interpretation is resolved. Activation will make the reviewed revisions available to Service Analytics.
                      </AlertDescription>
                    </div>
                  </Alert>
                )}

                {result && (
                  <div className="space-y-3 py-4 text-center">
                    <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
                    <div>
                      <h3 className="font-semibold">
                        {result.outcome === 'no_op'
                          ? 'No changes found'
                          : job.contractId === 'wth_service_tracking_v1'
                            ? 'WTH Tracking data activated'
                            : job.contractId === 'simc_service_visits_v1' ? 'SIMC data activated' : 'Link2Feed data activated'}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {result.outcome === 'no_op'
                          ? trackingSummary ? 'Every reviewed metric observation already matched the active data.' : 'Every reviewed visit and profile already matched the active data.'
                          : job.contractId === 'wth_service_tracking_v1'
                            ? `${(result.value.metricObservationRevisionCount ?? 0).toLocaleString()} historical metric observation revision${result.value.metricObservationRevisionCount === 1 ? '' : 's'} ${result.value.metricObservationRevisionCount === 1 ? 'is' : 'are'} now active.`
                          : job.contractId === 'simc_service_visits_v1'
                            ? `${result.value.encounterRevisionCount.toLocaleString()} visit revision${result.value.encounterRevisionCount === 1 ? '' : 's'}, ${result.value.profileRevisionCount.toLocaleString()} household profile${result.value.profileRevisionCount === 1 ? '' : 's'}, and ${(result.value.personProfileRevisionCount ?? 0).toLocaleString()} person profile${result.value.personProfileRevisionCount === 1 ? '' : 's'} are now active.`
                            : `${result.value.encounterRevisionCount.toLocaleString()} encounter revision${result.value.encounterRevisionCount === 1 ? '' : 's'} and ${result.value.profileRevisionCount.toLocaleString()} client profile${result.value.profileRevisionCount === 1 ? '' : 's'} are now active.`}
                      </p>
                    </div>
                  </div>
                )}

                {job.warningCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    FEED retained {job.warningCount.toLocaleString()} structured quality warning{job.warningCount === 1 ? '' : 's'} with the import. Raw Notes and ignored-column values were discarded.
                  </p>
                )}
              </div>
            </ScrollArea>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'review' && error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {step === 'select' && (
            <>
              <Button type="button" variant="outline" onClick={() => void close()} disabled={isInspecting || isWorking}>Cancel</Button>
              <Button type="button" onClick={() => setStep('review')} disabled={!detection || isInspecting}>Continue</Button>
            </>
          )}
          {step === 'review' && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep('select')} disabled={isWorking}>Back</Button>
              <Button type="button" onClick={() => void beginImport()} disabled={isWorking || !canStartImport}>
                {isWorking
                  ? 'Importing…'
                  : detection?.contract.domain === 'service' && detection.contract.id !== 'lotto_queue_history_v1'
                    ? 'Validate and Review'
                    : 'Import Data'}
              </Button>
            </>
          )}
          {step === 'complete' && (
            <>
              {/* While the server is working there is no honest cancel: there is
                  no server-side abort, so a button here could only drop the poll
                  while the import carried on. "Close" says what it does — the
                  work continues and the resume offer brings the user back. */}
              {job && !result && (
                <Button type="button" variant="outline" onClick={() => void close()} disabled={isWorking}>
                  {/* "Cancel Import" on a job that already failed offers to
                      cancel something that is not running. There is nothing
                      left to abandon, and the word implies the user is
                      discarding work rather than acknowledging a rejection. */}
                  {isBackgroundRunning ? 'Close' : job.status === 'failed' ? 'Close' : 'Cancel Import'}
                </Button>
              )}
              {job?.status === 'failed' && !result && (
                <Button type="button" onClick={reset} disabled={isWorking}>
                  Try Another File
                </Button>
              )}
              {job?.status === 'ready' && !result && (
                <Button type="button" onClick={() => void activate()} disabled={isWorking}>
                  Activate Data
                </Button>
              )}
              {(procurementResult || lottoResult || result) && <Button type="button" onClick={() => void close()} disabled={isWorking}>Done</Button>}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
