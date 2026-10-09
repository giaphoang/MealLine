// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../db';
import { DATA_IMPORT_STAGING_TTL_MS } from './staging';

export const DATA_IMPORT_JOB_STATUSES = [
  'staging',
  'inspecting',
  // Background work is running and no one is waiting on an HTTP response for
  // it. `preparing` exists because `awaiting_review` previously meant two
  // different things — "the server is still parsing" and "the server is
  // waiting for you" — which a progress indicator cannot tell apart. Both the
  // initial parse and the post-review materialization report through it.
  'preparing',
  'awaiting_review',
  'ready',
  'activating',
  'completed',
  'failed',
  'cancelled',
] as const;
export const DATA_IMPORT_ACTIVATION_OUTCOMES = ['imported', 'no_op'] as const;

export type DataImportJobStatus = typeof DATA_IMPORT_JOB_STATUSES[number];
export type DataImportActivationOutcome = typeof DATA_IMPORT_ACTIVATION_OUTCOMES[number];

const TERMINAL_STATUSES = new Set<DataImportJobStatus>(['completed', 'failed', 'cancelled']);
// Statuses where a background task owns the job. Nothing outside that task will
// advance them, so a process that dies mid-run leaves them stranded — see
// `failOrphanedDataImportJobs`.
export const DATA_IMPORT_BACKGROUND_STATUSES: readonly DataImportJobStatus[] = ['preparing', 'activating'];
const TRANSITIONS: Record<DataImportJobStatus, readonly DataImportJobStatus[]> = {
  staging: ['inspecting', 'failed', 'cancelled'],
  inspecting: ['preparing', 'awaiting_review', 'ready', 'failed', 'cancelled'],
  // Preparation ends in questions for the user, readiness, or failure.
  preparing: ['awaiting_review', 'ready', 'failed', 'cancelled'],
  // Resolving the last review issue sends the job back into `preparing` while
  // materialization runs.
  awaiting_review: ['preparing', 'ready', 'failed', 'cancelled'],
  ready: ['activating', 'failed', 'cancelled'],
  activating: ['completed', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
};

export interface DataImportJobState {
  status: string;
  processedRows: number;
  totalRows: number | null;
  warningCount: number;
  unresolvedIssueCount: number;
}

export interface DataImportJobTransitionDraft {
  status: DataImportJobStatus;
  contractId?: string;
  domain?: 'procurement' | 'service';
  source?: string;
  datasetKind?: string;
  stagedFileKey?: string | null;
  fileHash?: string;
  fileSizeBytes?: number;
  recognizedFieldCount?: number;
  ignoredFieldCount?: number;
  processedRows?: number;
  totalRows?: number | null;
  warningCount?: number;
  unresolvedIssueCount?: number;
  reviewSummary?: Prisma.InputJsonValue;
  activationOutcome?: DataImportActivationOutcome;
  errorCode?: string;
  errorMessage?: string;
  safeMessage?: string;
}

export class DataImportJobError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'DataImportJobError';
  }
}

const assertWholeNumber = (label: string, value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DataImportJobError(`${label} must be a non-negative whole number.`, 'INVALID_DATA_IMPORT_PROGRESS');
  }
};

const validateSafeMessage = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const message = value.trim().replace(/\s+/g, ' ');
  if (!message || message.length > 240 || /[\u0000-\u001f\u007f]/.test(message)) {
    throw new DataImportJobError(
      'Import progress message must be between 1 and 240 printable characters.',
      'INVALID_DATA_IMPORT_MESSAGE',
    );
  }
  return message;
};

export function validateDataImportJobTransition(
  current: DataImportJobState,
  draft: DataImportJobTransitionDraft,
): DataImportJobTransitionDraft {
  if (!DATA_IMPORT_JOB_STATUSES.includes(current.status as DataImportJobStatus)) {
    throw new DataImportJobError('Import job has an unknown status.', 'INVALID_DATA_IMPORT_JOB_STATUS');
  }
  const currentStatus = current.status as DataImportJobStatus;
  if (!TRANSITIONS[currentStatus].includes(draft.status)) {
    throw new DataImportJobError(
      `Import job cannot move from ${currentStatus} to ${draft.status}.`,
      'INVALID_DATA_IMPORT_JOB_TRANSITION',
    );
  }

  const processedRows = draft.processedRows ?? current.processedRows;
  const totalRows = draft.totalRows === undefined ? current.totalRows : draft.totalRows;
  const warningCount = draft.warningCount ?? current.warningCount;
  const unresolvedIssueCount = draft.unresolvedIssueCount ?? current.unresolvedIssueCount;
  assertWholeNumber('Processed row count', processedRows);
  assertWholeNumber('Warning count', warningCount);
  assertWholeNumber('Unresolved issue count', unresolvedIssueCount);
  if (totalRows !== null) {
    assertWholeNumber('Total row count', totalRows);
    if (processedRows > totalRows) {
      throw new DataImportJobError(
        'Processed row count cannot exceed total row count.',
        'INVALID_DATA_IMPORT_PROGRESS',
      );
    }
  }
  if (processedRows < current.processedRows) {
    throw new DataImportJobError(
      'Import progress cannot move backwards.',
      'INVALID_DATA_IMPORT_PROGRESS',
    );
  }

  if (draft.status === 'inspecting') {
    if (!draft.fileHash || !/^[a-f0-9]{64}$/.test(draft.fileHash)) {
      throw new DataImportJobError('Inspection requires a SHA-256 file hash.', 'INVALID_DATA_IMPORT_HASH');
    }
    if (!draft.stagedFileKey || draft.fileSizeBytes === undefined) {
      throw new DataImportJobError('Inspection requires a staged artifact.', 'MISSING_STAGED_DATA_IMPORT');
    }
    assertWholeNumber('Data file size', draft.fileSizeBytes);
  }
  if (['preparing', 'awaiting_review', 'ready', 'activating', 'completed'].includes(draft.status)) {
    if (!draft.contractId && currentStatus === 'inspecting') {
      throw new DataImportJobError(
        'A detected source contract is required before review.',
        'MISSING_DATA_IMPORT_CONTRACT',
      );
    }
  }
  if (draft.status === 'completed' && !draft.activationOutcome) {
    throw new DataImportJobError(
      'A completed import job requires an activation outcome.',
      'MISSING_DATA_IMPORT_OUTCOME',
    );
  }
  if (draft.status === 'failed') {
    if (!draft.errorCode || !/^[A-Z][A-Z0-9_]{2,95}$/.test(draft.errorCode)) {
      throw new DataImportJobError('A failed import job requires a safe error code.', 'INVALID_DATA_IMPORT_ERROR');
    }
    validateSafeMessage(draft.errorMessage);
  }

  return {
    ...draft,
    processedRows,
    totalRows,
    warningCount,
    unresolvedIssueCount,
    safeMessage: validateSafeMessage(draft.safeMessage),
    errorMessage: validateSafeMessage(draft.errorMessage),
  };
}

export async function createDataImportJob(
  createdBy?: string,
  client: PrismaClient = prisma,
) {
  const expiresAt = new Date(Date.now() + DATA_IMPORT_STAGING_TTL_MS);
  return client.dataImportJob.create({
    data: {
      createdBy,
      expiresAt,
      events: {
        create: {
          sequence: 1,
          status: 'staging',
          safeMessage: 'Receiving data file.',
        },
      },
    },
    include: { events: true },
  });
}

export async function transitionDataImportJob(
  jobId: string,
  draft: DataImportJobTransitionDraft,
  client: PrismaClient = prisma,
) {
  return client.$transaction(async (tx) => {
    const job = await tx.dataImportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new DataImportJobError('Import job was not found.', 'DATA_IMPORT_JOB_NOT_FOUND');
    const validated = validateDataImportJobTransition(job, draft);
    const lastEvent = await tx.dataImportJobEvent.findFirst({
      where: { jobId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const terminal = TERMINAL_STATUSES.has(validated.status);
    const updated = await tx.dataImportJob.update({
      where: { id: jobId },
      data: {
        status: validated.status,
        contractId: validated.contractId,
        domain: validated.domain,
        source: validated.source,
        datasetKind: validated.datasetKind,
        stagedFileKey: validated.stagedFileKey,
        fileHash: validated.fileHash,
        fileSizeBytes: validated.fileSizeBytes,
        recognizedFieldCount: validated.recognizedFieldCount,
        ignoredFieldCount: validated.ignoredFieldCount,
        processedRows: validated.processedRows,
        totalRows: validated.totalRows,
        warningCount: validated.warningCount,
        unresolvedIssueCount: validated.unresolvedIssueCount,
        reviewSummary: validated.reviewSummary,
        activationOutcome: validated.activationOutcome,
        errorCode: validated.errorCode,
        errorMessage: validated.errorMessage,
        completedAt: terminal ? new Date() : undefined,
      },
    });
    await tx.dataImportJobEvent.create({
      data: {
        jobId,
        sequence: (lastEvent?.sequence ?? 0) + 1,
        status: validated.status,
        processedRows: validated.processedRows,
        totalRows: validated.totalRows,
        warningCount: validated.warningCount,
        safeMessage: validated.safeMessage,
      },
    });
    return updated;
  });
}

export async function recordDataImportJobProgress(
  jobId: string,
  progress: {
    processedRows: number;
    totalRows?: number | null;
    warningCount?: number;
    unresolvedIssueCount?: number;
    reviewSummary?: Prisma.InputJsonValue;
    safeMessage?: string;
  },
  client: PrismaClient = prisma,
) {
  return client.$transaction(async (tx) => {
    const job = await tx.dataImportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new DataImportJobError('Import job was not found.', 'DATA_IMPORT_JOB_NOT_FOUND');
    if (TERMINAL_STATUSES.has(job.status as DataImportJobStatus)) {
      throw new DataImportJobError(
        'A completed import job cannot report more progress.',
        'DATA_IMPORT_JOB_ALREADY_FINISHED',
      );
    }
    assertWholeNumber('Processed row count', progress.processedRows);
    if (progress.processedRows < job.processedRows) {
      throw new DataImportJobError('Import progress cannot move backwards.', 'INVALID_DATA_IMPORT_PROGRESS');
    }
    const totalRows = progress.totalRows === undefined ? job.totalRows : progress.totalRows;
    if (totalRows !== null) {
      assertWholeNumber('Total row count', totalRows);
      if (progress.processedRows > totalRows) {
        throw new DataImportJobError(
          'Processed row count cannot exceed total row count.',
          'INVALID_DATA_IMPORT_PROGRESS',
        );
      }
    }
    const warningCount = progress.warningCount ?? job.warningCount;
    assertWholeNumber('Warning count', warningCount);
    const unresolvedIssueCount = progress.unresolvedIssueCount ?? job.unresolvedIssueCount;
    assertWholeNumber('Unresolved issue count', unresolvedIssueCount);
    const safeMessage = validateSafeMessage(progress.safeMessage);
    const lastEvent = await tx.dataImportJobEvent.findFirst({
      where: { jobId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const updated = await tx.dataImportJob.update({
      where: { id: jobId },
      data: {
        processedRows: progress.processedRows,
        totalRows,
        warningCount,
        unresolvedIssueCount,
        reviewSummary: progress.reviewSummary,
      },
    });
    await tx.dataImportJobEvent.create({
      data: {
        jobId,
        sequence: (lastEvent?.sequence ?? 0) + 1,
        status: job.status,
        processedRows: progress.processedRows,
        totalRows,
        warningCount,
        safeMessage,
      },
    });
    return updated;
  });
}

export interface AtomicActivationResult<T> {
  outcome: DataImportActivationOutcome;
  value: T;
}

// All writes that can become visible to Analytics must use the transaction
// client supplied here. The job enters `activating` first, then its active facts
// and completed status commit together. A thrown adapter error rolls the whole
// activation transaction back before the job is marked failed separately.
export async function activateDataImportJobAtomically<T>(
  jobId: string,
  activate: (tx: Prisma.TransactionClient) => Promise<AtomicActivationResult<T>>,
  client: PrismaClient = prisma,
): Promise<AtomicActivationResult<T>> {
  await transitionDataImportJob(jobId, {
    status: 'activating',
    safeMessage: 'Activating reviewed data.',
  }, client);

  try {
    return await client.$transaction(async (tx) => {
      const job = await tx.dataImportJob.findUnique({ where: { id: jobId } });
      if (!job || job.status !== 'activating') {
        throw new DataImportJobError(
          'Import job is no longer ready for activation.',
          'DATA_IMPORT_JOB_NOT_ACTIVATING',
        );
      }
      const result = await activate(tx);
      if (!DATA_IMPORT_ACTIVATION_OUTCOMES.includes(result.outcome)) {
        throw new DataImportJobError(
          'Import adapter returned an unknown activation outcome.',
          'INVALID_DATA_IMPORT_OUTCOME',
        );
      }
      const lastEvent = await tx.dataImportJobEvent.findFirst({
        where: { jobId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      await tx.dataImportJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          activationOutcome: result.outcome,
          // Activation no longer answers the request that started it, so the
          // per-adapter counts are persisted for a polling client to read.
          activationSummary: (result.value ?? null) as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      await tx.dataImportJobEvent.create({
        data: {
          jobId,
          sequence: (lastEvent?.sequence ?? 0) + 1,
          status: 'completed',
          processedRows: job.processedRows,
          totalRows: job.totalRows,
          warningCount: job.warningCount,
          safeMessage: result.outcome === 'no_op'
            ? 'No changes were found; active data was left unchanged.'
            : 'Reviewed data is active.',
        },
      });
      return result;
    });
  } catch (error) {
    const safe = error instanceof DataImportJobError
      ? error
      : new DataImportJobError(
        'FEED could not activate the reviewed data. No partial data was applied.',
        'DATA_IMPORT_ACTIVATION_FAILED',
      );
    await transitionDataImportJob(jobId, {
      status: 'failed',
      errorCode: safe.code,
      errorMessage: safe.message,
      safeMessage: safe.message,
    }, client).catch(() => undefined);
    throw error;
  }
}

export function changedSnapshotKeys(
  incoming: ReadonlyMap<string, string>,
  current: ReadonlyMap<string, string>,
): string[] {
  return [...incoming]
    .filter(([key, hash]) => current.get(key) !== hash)
    .map(([key]) => key);
}

export async function clearDataImportJobStagingKey(
  jobId: string,
  client: PrismaClient = prisma,
): Promise<void> {
  await client.dataImportJob.update({ where: { id: jobId }, data: { stagedFileKey: null } });
}
