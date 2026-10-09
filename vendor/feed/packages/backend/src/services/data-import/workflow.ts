// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Prisma, PrismaClient } from '@prisma/client';
import { Readable } from 'stream';
import prisma from '../../db';
import {
  activateDataImportJobAtomically,
  clearDataImportJobStagingKey,
  createDataImportJob,
  DataImportJobError,
  transitionDataImportJob,
  type AtomicActivationResult,
} from './jobs';
import {
  dataImportStagingService,
  DataImportStagingError,
  DataImportStagingService,
} from './staging';
import { cleanupPendingServiceImport } from './pending-service';

export async function stageRecognizedDataImport(
  input: Readable,
  createdBy?: string,
  client: PrismaClient = prisma,
  staging: DataImportStagingService = dataImportStagingService,
) {
  const job = await createDataImportJob(createdBy, client);
  let stagedFileKey: string | null = null;
  try {
    const artifact = await staging.stageRecognizedCsv(input);
    stagedFileKey = artifact.stagedFileKey;
    if (artifact.inspection.status !== 'detected') {
      throw new DataImportJobError('Data source was not detected.', 'UNKNOWN_DATA_IMPORT_CONTRACT');
    }
    await transitionDataImportJob(job.id, {
      status: 'inspecting',
      stagedFileKey: artifact.stagedFileKey,
      fileHash: artifact.fileHash,
      fileSizeBytes: artifact.fileSizeBytes,
      safeMessage: 'Inspecting the staged data source.',
    }, client);
    // The staged bytes are on disk and the source is identified, so the request
    // that carried the upload has nothing left to wait for. The job moves to
    // `preparing` and the caller detaches the long work.
    const reviewJob = await transitionDataImportJob(job.id, {
      status: 'preparing',
      contractId: artifact.inspection.contract.id,
      domain: artifact.inspection.contract.domain,
      source: artifact.inspection.contract.source,
      datasetKind: artifact.inspection.contract.datasetKind,
      recognizedFieldCount: artifact.inspection.recognizedFieldCount,
      ignoredFieldCount: artifact.inspection.ignoredFieldCount,
      safeMessage: 'Source detected. Validating the data.',
    }, client);
    return { job: reviewJob, inspection: artifact.inspection };
  } catch (error) {
    await staging.delete(stagedFileKey).catch(() => undefined);
    const safe = error instanceof DataImportStagingError || error instanceof DataImportJobError
      ? error
      : new DataImportJobError(
        'FEED could not stage this data file. No data was imported.',
        'DATA_IMPORT_STAGING_FAILED',
      );
    await transitionDataImportJob(job.id, {
      status: 'failed',
      stagedFileKey: null,
      errorCode: safe.code,
      errorMessage: safe.message,
      safeMessage: safe.message,
    }, client).catch(() => undefined);
    throw error;
  }
}

export async function cancelDataImportJob(
  jobId: string,
  client: PrismaClient = prisma,
  staging: DataImportStagingService = dataImportStagingService,
): Promise<void> {
  const job = await client.dataImportJob.findUnique({ where: { id: jobId } });
  if (!job) throw new DataImportJobError('Import job was not found.', 'DATA_IMPORT_JOB_NOT_FOUND');
  await staging.delete(job.stagedFileKey);
  if (job.pendingServiceImportId && job.source) {
    await cleanupPendingServiceImport(job.pendingServiceImportId, job.source, client);
    await client.dataImportJob.update({
      where: { id: jobId },
      data: { pendingServiceImportId: null },
    });
  }
  await client.$transaction(async (tx) => {
    // Adapter staging is transient by contract. Clearing it here keeps a
    // cancelled review from retaining allowlisted client/profile values after
    // the uploaded artifact itself has been deleted.
    await tx.dataImportReviewIssue.deleteMany({ where: { jobId } });
    await tx.simcEncounterPersonStagingRow.deleteMany({ where: { jobId } });
    await tx.simcPersonStagingRow.deleteMany({ where: { jobId } });
    await tx.simcVisitStagingRow.deleteMany({ where: { jobId } });
    await tx.wthTrackingStagingRow.deleteMany({ where: { jobId } });
    await tx.link2FeedVisitStagingRow.deleteMany({ where: { jobId } });
  });
  await transitionDataImportJob(jobId, {
    status: 'cancelled',
    stagedFileKey: null,
    safeMessage: 'Import cancelled. Temporary source data was deleted.',
  }, client);
}

// Adapters parse and validate before this call, writing only normalized pending
// rows that Analytics excludes. The callback is therefore deliberately an
// activation callback—not a parser—and should only flip the prepared domain
// snapshot into active state and refresh affected current projections.
export async function activateReviewedDataImport<T>(
  jobId: string,
  activate: (tx: Prisma.TransactionClient) => Promise<AtomicActivationResult<T>>,
  client: PrismaClient = prisma,
  staging: DataImportStagingService = dataImportStagingService,
): Promise<AtomicActivationResult<T>> {
  const job = await client.dataImportJob.findUnique({ where: { id: jobId } });
  if (
    !job
    || job.status !== 'ready'
    || !job.stagedFileKey
    || !job.fileHash
    || !job.contractId
  ) {
    throw new DataImportJobError(
      'Import job is not ready for activation.',
      'DATA_IMPORT_JOB_NOT_READY',
    );
  }

  try {
    await staging.verifyCsv(job.stagedFileKey, job.fileHash, job.contractId);
    return await activateDataImportJobAtomically(jobId, activate, client);
  } catch (error) {
    const failedJob = await client.dataImportJob.findUnique({ where: { id: jobId } });
    if (failedJob?.pendingServiceImportId && failedJob.source) {
      await cleanupPendingServiceImport(
        failedJob.pendingServiceImportId,
        failedJob.source,
        client,
      ).catch(() => undefined);
      await client.dataImportJob.update({
        where: { id: jobId },
        data: { pendingServiceImportId: null },
      }).catch(() => undefined);
    }
    if (error instanceof DataImportStagingError) {
      await transitionDataImportJob(jobId, {
        status: 'failed',
        errorCode: error.code,
        errorMessage: error.message,
        safeMessage: error.message,
      }, client).catch(() => undefined);
    }
    throw error;
  } finally {
    await staging.delete(job.stagedFileKey).catch(() => undefined);
    await clearDataImportJobStagingKey(jobId, client).catch(() => undefined);
  }
}

export async function deleteExpiredDataImportStaging(
  now = new Date(),
  client: PrismaClient = prisma,
  staging: DataImportStagingService = dataImportStagingService,
): Promise<{ deleted: number }> {
  const expired = await client.dataImportJob.findMany({
    where: { expiresAt: { lte: now }, stagedFileKey: { not: null } },
    select: {
      id: true,
      status: true,
      source: true,
      stagedFileKey: true,
      pendingServiceImportId: true,
    },
  });
  let deleted = 0;
  for (const job of expired) {
    try {
      await staging.delete(job.stagedFileKey);
      if (job.pendingServiceImportId && job.source) {
        await cleanupPendingServiceImport(job.pendingServiceImportId, job.source, client);
        await client.dataImportJob.update({
          where: { id: job.id },
          data: { pendingServiceImportId: null },
        });
      }
      await client.$transaction(async (tx) => {
        await tx.dataImportReviewIssue.deleteMany({ where: { jobId: job.id } });
        await tx.simcEncounterPersonStagingRow.deleteMany({ where: { jobId: job.id } });
        await tx.simcPersonStagingRow.deleteMany({ where: { jobId: job.id } });
        await tx.simcVisitStagingRow.deleteMany({ where: { jobId: job.id } });
        await tx.wthTrackingStagingRow.deleteMany({ where: { jobId: job.id } });
        await tx.link2FeedVisitStagingRow.deleteMany({ where: { jobId: job.id } });
      });
      if (['staging', 'inspecting', 'awaiting_review', 'ready'].includes(job.status)) {
        await transitionDataImportJob(job.id, {
          status: 'cancelled',
          stagedFileKey: null,
          safeMessage: 'Import expired. Temporary source data was deleted.',
        }, client);
      } else {
        await clearDataImportJobStagingKey(job.id, client);
      }
      deleted += 1;
    } catch {
      // Leave the key in place so a later cleanup pass can retry. Cleanup is
      // best-effort and must never disguise a retained staging artifact.
    }
  }
  return { deleted };
}
