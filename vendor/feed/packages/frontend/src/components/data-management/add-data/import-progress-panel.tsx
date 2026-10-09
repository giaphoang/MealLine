// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { Check, Loader2 } from '@/components/ui/icons';
import { Progress } from '@/components/ui/progress';
import type { DataImportJobReview } from '@/services/data-import';

/**
 * An import moves through four stages, and the user is only involved in one of
 * them. Before this existed the dialog showed a single spinner and a row count,
 * which could not say which stage was running — so post-review materialization
 * reported "Validated 79,308 of 79,308 records" with a full progress bar while
 * it was still working, and the honest question that came back was "should I
 * click Close?". See ISSUES.md #72.
 */
export const IMPORT_STAGES = [
  { key: 'validate', label: 'Validate' },
  { key: 'review', label: 'Review' },
  { key: 'prepare', label: 'Prepare' },
  { key: 'activate', label: 'Activate' },
] as const;

export type ImportStageKey = typeof IMPORT_STAGES[number]['key'];

export interface ImportPhase {
  stage: ImportStageKey;
  /**
   * True when the job ended without importing anything.
   *
   * The panel draws a failure rather than a progress bar, and the dialog shows
   * the server's reason. Absent this, a failed job fell through to "Reading the
   * data file…" and the user watched a spinner for work that had already
   * stopped — see ISSUES.md #75.
   */
  failed?: boolean;
  /** What the server is doing right now, in the user's terms. */
  message: string;
  /** True while the server owns the job and no one is waiting on a response. */
  working: boolean;
  /**
   * Row counting only describes validation. Materialization and activation have
   * no countable unit, so they show an indeterminate bar rather than a full one
   * — a filled bar means finished, and asserting that while work continues is
   * what made the panel untrustworthy.
   */
  determinate: boolean;
}

/**
 * Derives the phase from the job alone.
 *
 * `preparing` covers two different pieces of work — the initial parse and the
 * post-review materialization — and they are told apart by whether a review
 * summary exists with nothing left to decide.
 */
export function importPhase(job: DataImportJobReview, pending = false): ImportPhase {
  // Terminal failures first. These used to fall through to the "still reading"
  // default at the bottom, which is how a rejected file presented as an empty
  // dialog with a Cancel button and no reason (ISSUES.md #75). The server
  // always knows why it stopped; the panel's job is to not lose that.
  if (job.status === 'failed') {
    return {
      stage: 'validate',
      message: job.errorMessage || 'The import stopped and no data was changed.',
      working: false,
      determinate: false,
      failed: true,
    };
  }
  if (job.status === 'cancelled') {
    return {
      stage: 'validate',
      message: 'This import was cancelled. No data was changed.',
      working: false,
      determinate: false,
      failed: true,
    };
  }
  if (job.status === 'activating') {
    return { stage: 'activate', message: 'Making the reviewed data available…', working: true, determinate: false };
  }
  if (job.status === 'completed') {
    return { stage: 'activate', message: 'Import complete.', working: false, determinate: false };
  }
  if (job.status === 'ready') {
    // `pending` closes a real gap: POST /activate answers 202 with the job as
    // it stands at that instant, and the ready→activating transition happens
    // inside the background task, so the response almost always still reads
    // `ready`. Without this the panel would report "ready to activate" while
    // activation was already under way.
    if (pending) {
      return { stage: 'activate', message: 'Making the reviewed data available…', working: true, determinate: false };
    }
    return { stage: 'activate', message: 'Reviewed and ready to activate.', working: false, determinate: false };
  }
  if (job.status === 'awaiting_review') {
    return { stage: 'review', message: 'Waiting for your review decisions.', working: false, determinate: false };
  }
  if (job.status === 'preparing') {
    const reviewed = Boolean(job.reviewSummary) && job.unresolvedIssueCount === 0;
    if (reviewed) {
      return {
        stage: 'prepare',
        message: 'Preparing the reviewed data for activation…',
        working: true,
        determinate: false,
      };
    }
    // Reading every row is not the end of validation — reconciliation against
    // existing records still follows, and took ~20s of a ~168s import on the
    // Pi. Holding a full bar through that says "finished" while the server is
    // still working, which is the same lie in a smaller window, so the counted
    // bar gives way to an indeterminate one at the moment counting stops.
    const allRowsRead = Boolean(job.totalRows && job.processedRows >= job.totalRows);
    if (allRowsRead) {
      return {
        stage: 'validate',
        message: `Read all ${job.processedRows.toLocaleString()} records. Checking them against existing data…`,
        working: true,
        determinate: false,
      };
    }
    return {
      stage: 'validate',
      message: job.processedRows > 0
        ? `Validated ${job.processedRows.toLocaleString()}${job.totalRows ? ` of ${job.totalRows.toLocaleString()}` : ''} record${job.processedRows === 1 ? '' : 's'}…`
        : 'Reading the data file…',
      working: true,
      determinate: Boolean(job.totalRows && job.totalRows > 0),
    };
  }
  return { stage: 'validate', message: 'Reading the data file…', working: true, determinate: false };
}

// A multi-year export legitimately runs for minutes, so raw seconds stop reading
// as progress past a point. Measured on the production Pi: 79,308 rows took
// between 2m18s and 3m42s across runs.
export const formatElapsed = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
};

const stageState = (stage: ImportStageKey, current: ImportStageKey): 'done' | 'current' | 'todo' => {
  const order = IMPORT_STAGES.map((entry) => entry.key);
  const at = order.indexOf(current);
  const index = order.indexOf(stage);
  if (index < at) return 'done';
  if (index === at) return 'current';
  return 'todo';
};

export function ImportStageIndicator({ current }: { current: ImportStageKey }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Import progress">
      {IMPORT_STAGES.map((stage, index) => {
        const state = stageState(stage.key, current);
        return (
          <li key={stage.key} className="flex items-center gap-1.5">
            <span
              className={`flex items-center gap-1 text-xs ${
                state === 'current'
                  ? 'font-medium text-foreground'
                  : state === 'done'
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground/50'
              }`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                  state === 'current'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : state === 'done'
                      ? 'border-muted-foreground/40 text-muted-foreground'
                      : 'border-muted-foreground/25 text-muted-foreground/50'
                }`}
              >
                {state === 'done' ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : index + 1}
              </span>
              {stage.label}
            </span>
            {index < IMPORT_STAGES.length - 1 && (
              <span aria-hidden="true" className="h-px w-3 bg-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export interface ImportProgressPanelProps {
  job: DataImportJobReview;
  /** A request is in flight from this client (e.g. activation was just sent). */
  pending?: boolean;
}

export function ImportProgressPanel({ job, pending = false }: ImportProgressPanelProps) {
  const phase = importPhase(job, pending);
  const [elapsed, setElapsed] = React.useState(0);

  // Elapsed time is measured PER STAGE. Counting from upload meant the figure
  // shown during materialization silently included however long the user spent
  // entering review decisions — a precise-looking number measuring the wrong
  // thing, which is worse than showing none.
  React.useEffect(() => {
    setElapsed(0);
    if (!phase.working && !pending) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase.stage, phase.working, pending]);

  const percent = phase.determinate && job.totalRows
    ? Math.min(100, Math.round((job.processedRows / job.totalRows) * 100))
    : null;

  return (
    <div className="space-y-2.5 rounded-md border bg-muted/40 p-3" aria-live="polite">
      <ImportStageIndicator current={phase.stage} />

      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        <span className="font-medium">{phase.message}</span>
        <span className="ml-auto shrink-0 tabular-nums text-xs text-muted-foreground">
          {formatElapsed(elapsed)}
        </span>
      </div>

      {percent === null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
        </div>
      ) : (
        <Progress value={percent} className="h-1.5" />
      )}

      <p className="text-xs text-muted-foreground">
        {phase.stage === 'prepare'
          ? 'This continues on the server. Existing data is unchanged until you activate.'
          : phase.stage === 'activate'
            ? 'This continues on the server. Closing this window will not interrupt it.'
            : 'This continues on the server. You can close this window and come back — FEED will offer to reopen the import. Existing data is unchanged until you activate.'}
      </p>
    </div>
  );
}
