// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { PrismaClient } from '@prisma/client';
import prisma from '../../db';
import {
  DATA_IMPORT_BACKGROUND_STATUSES,
  transitionDataImportJob,
  type DataImportJobStatus,
} from './jobs';
import { cleanupPendingServiceImport } from './pending-service';
import { dataImportStagingService, DataImportStagingService } from './staging';

// Why import work runs detached from its HTTP request
// -----------------------------------------------------
// Measured on the production Pi, 2026-08-14: a 25 MB / 79,308-row Link2Feed
// export takes 167.8s to parse and stage. Production is served through
// Cloudflare Tunnel, and the Cloudflare edge returns 524 at ~100s regardless of
// origin configuration — so that import could never return a response, however
// fast the pipeline became. Even a 2x speedup lands at ~84s against a 100s
// ceiling, which is not a margin worth shipping.
//
// So the request stages the file (0.2s, measured) and returns immediately; the
// long work runs here and reports through the job's existing progress and event
// records, which the client polls. This also makes the progress data reachable:
// the server always knew "45,000 of 79,308", it simply had no way to say so
// while holding the connection that would have carried the answer.
//
// This is deliberately NOT a queue, a worker process, or a scheduler. One
// backend serves one organization, imports are rare and administrator-driven,
// and the job record is already the durable state. Adding infrastructure would
// buy nothing the job table does not already provide. See ISSUES.md #67.

const running = new Map<string, Promise<void>>();

export interface DataImportBackgroundTaskOptions {
  /** Reported if the task throws something that is not already job-safe. */
  fallbackErrorCode: string;
  fallbackMessage: string;
  onError?: (error: unknown) => void;
}

const defaultOnError = (jobId: string) => (error: unknown): void => {
  console.error(`Data import background task failed for job ${jobId}`, error);
};

/**
 * Runs `task` detached from the caller and resolves immediately.
 *
 * The task is responsible for its own job transitions — every current caller
 * already transitions to `failed` with a specific, user-safe code in its own
 * catch block. This wrapper is the backstop for anything that escapes that,
 * so a crashed task can never leave a job stuck in a background status with no
 * explanation.
 */
export function startDataImportBackgroundTask(
  jobId: string,
  task: () => Promise<unknown>,
  options: DataImportBackgroundTaskOptions,
  client: PrismaClient = prisma,
): void {
  const onError = options.onError ?? defaultOnError(jobId);
  const run = (async () => {
    try {
      await task();
      // A task that returns without moving the job out of a background status
      // has left it stranded: nothing else will ever advance it, so the client
      // polls a counter that never stops and every subsequent action is
      // rejected. That is a defect in the task, but it must not present to the
      // user as an import that runs forever — fail it visibly instead.
      //
      // This is not hypothetical. Detaching preparation moved the initial
      // status from `awaiting_review` to `preparing`, and the Link2Feed branch
      // that ends with unresolved review issues was still only recording
      // progress rather than transitioning, so it stranded every import that
      // raised a question. See ISSUES.md #71.
      const settled = await client.dataImportJob.findUnique({ where: { id: jobId } });
      if (settled && DATA_IMPORT_BACKGROUND_STATUSES.includes(settled.status as DataImportJobStatus)) {
        onError(new Error(
          `Import job ${jobId} finished its background task still in status "${settled.status}".`,
        ));
        await transitionDataImportJob(jobId, {
          status: 'failed',
          errorCode: 'DATA_IMPORT_DID_NOT_SETTLE',
          errorMessage: 'FEED finished preparing this import but could not record the result. No data was imported. Upload the file again.',
          safeMessage: 'FEED finished preparing this import but could not record the result. No data was imported. Upload the file again.',
        }, client);
      }
    } catch (error) {
      onError(error);
      // The task's own handler has almost certainly already recorded a precise
      // failure. Only step in when the job is still sitting in a background
      // status, which means nothing did.
      try {
        const job = await client.dataImportJob.findUnique({ where: { id: jobId } });
        if (job && DATA_IMPORT_BACKGROUND_STATUSES.includes(job.status as DataImportJobStatus)) {
          await transitionDataImportJob(jobId, {
            status: 'failed',
            stagedFileKey: null,
            errorCode: options.fallbackErrorCode,
            errorMessage: options.fallbackMessage,
            safeMessage: options.fallbackMessage,
          }, client);
        }
      } catch (recoveryError) {
        onError(recoveryError);
      }
    } finally {
      running.delete(jobId);
    }
  })();
  running.set(jobId, run);
}

/** Resolves once no background import task is in flight. Exposed for tests. */
export async function whenDataImportBackgroundTasksSettle(): Promise<void> {
  while (running.size > 0) {
    await Promise.allSettled([...running.values()]);
  }
}

/**
 * Fails jobs left in a background status by a process that stopped mid-run.
 *
 * Nothing else will ever move them: the task that owned them died with its
 * process. Left alone they would sit in `preparing` forever, and a polling
 * client would wait on progress that is never coming. Failing them loudly, with
 * a message that says a restart interrupted the import, is the honest outcome —
 * the user can upload again, and no partial data is visible either way because
 * activation is the only step that makes anything visible.
 */
export async function failOrphanedDataImportJobs(
  client: PrismaClient = prisma,
  staging: DataImportStagingService = dataImportStagingService,
): Promise<{ failed: number }> {
  const orphaned = await client.dataImportJob.findMany({
    where: { status: { in: [...DATA_IMPORT_BACKGROUND_STATUSES] } },
    select: { id: true, source: true, stagedFileKey: true, pendingServiceImportId: true },
  });
  let failed = 0;
  for (const job of orphaned) {
    try {
      // Release the job's transient data as the normal failure paths do. An
      // interrupted import can leave tens of thousands of staging rows behind,
      // and the job is dead — nothing can resume it — so waiting for the
      // 24-hour expiry sweep to notice would keep that source-derived data on
      // disk far longer than it should be.
      if (job.pendingServiceImportId && job.source) {
        await cleanupPendingServiceImport(job.pendingServiceImportId, job.source, client)
          .catch(() => undefined);
      }
      await client.$transaction(async (tx) => {
        await tx.dataImportReviewIssue.deleteMany({ where: { jobId: job.id } });
        await tx.simcEncounterPersonStagingRow.deleteMany({ where: { jobId: job.id } });
        await tx.simcPersonStagingRow.deleteMany({ where: { jobId: job.id } });
        await tx.simcVisitStagingRow.deleteMany({ where: { jobId: job.id } });
        await tx.wthTrackingStagingRow.deleteMany({ where: { jobId: job.id } });
        await tx.link2FeedVisitStagingRow.deleteMany({ where: { jobId: job.id } });
        await tx.dataImportJob.update({
          where: { id: job.id },
          data: { pendingServiceImportId: null },
        });
      }).catch(() => undefined);
      await staging.delete(job.stagedFileKey).catch(() => undefined);
      await transitionDataImportJob(job.id, {
        status: 'failed',
        stagedFileKey: null,
        errorCode: 'DATA_IMPORT_INTERRUPTED',
        errorMessage: 'FEED restarted while this import was being prepared. No data was imported. Upload the file again.',
        safeMessage: 'FEED restarted while this import was being prepared. No data was imported. Upload the file again.',
      }, client);
      failed += 1;
    } catch {
      // A job that cannot be transitioned is left for the expiry sweep rather
      // than retried here; cleanup must never take down startup.
    }
  }
  return { failed };
}

/**
 * The job a returning administrator should be offered, if any.
 *
 * An import survives its browser tab — the Pi keeps working after a 524, a
 * refresh, or a closed laptop — but until now nothing could reach the result.
 * A single most-recent non-terminal job is enough: imports are administrator-
 * driven and rare, so there is no realistic case of several at once, and
 * offering a list would imply a concurrency this workflow does not have.
 */
export async function findResumableDataImportJob(
  client: PrismaClient = prisma,
): Promise<{ id: string; status: string } | null> {
  const job = await client.dataImportJob.findFirst({
    where: {
      status: { in: ['preparing', 'awaiting_review', 'ready', 'activating'] },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true },
  });
  return job;
}
