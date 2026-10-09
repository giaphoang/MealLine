// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';
import { requireAdmin } from '../middleware/auth/require-admin';
import { rateLimiter } from '../middleware/rate-limiter';
import {
  cancelDataImportJob,
  DataImportJobError,
  DataImportStagingError,
  findResumableDataImportJob,
  getDataManagementCoverage,
  inspectCsvHeader,
  listImportHistory,
  stageRecognizedDataImport,
  startDataImportBackgroundTask,
} from '../services/data-import';
import {
  activateLink2FeedVisitImport,
  LINK2FEED_REVIEW_ACTIONS,
  LINK2FEED_VISIT_CONTRACT_ID,
  Link2FeedVisitImportError,
  Link2FeedVisitWorkflowError,
  prepareLink2FeedVisitImport,
  activateSimcServiceVisitImport,
  prepareSimcServiceVisitImport,
  resolveLink2FeedVisitReviewIssue,
  SIMC_SERVICE_VISIT_CONTRACT_ID,
  SimcServiceVisitImportError,
  SimcServiceVisitWorkflowError,
  activateWthTrackingImport,
  prepareWthTrackingImport,
  WTH_TRACKING_CONTRACT_ID,
  WthTrackingImportError,
  WthTrackingWorkflowError,
  restoreServiceImports,
  rollbackServiceImports,
} from '../services/service';
import {
  restoreProcurementImports,
  rollbackProcurementImports,
} from '../services/procurement';

const router = Router();

// Import history is organization-wide operational context. Every authenticated
// staff member can read it, just as they could read procurement history before
// Add Data was unified. Mutating any import lifecycle remains administrator-only.
router.get('/history', rateLimiter, async (_req, res, next) => {
  try {
    return res.json({ imports: await listImportHistory() });
  } catch (error) {
    return next(error);
  }
});

router.get('/coverage', rateLimiter, async (_req, res, next) => {
  try {
    return res.json({ coverage: await getDataManagementCoverage() });
  } catch (error) {
    return next(error);
  }
});

router.use(requireAdmin);

const historyLifecycleSchema = z.object({
  mode: z.enum(['rollback', 'restore']),
  imports: z.array(z.object({
    domain: z.enum(['procurement', 'service']),
    id: z.number().int().positive(),
  }).strict()).min(1).max(100),
}).strict();

router.post('/history/lifecycle', rateLimiter, async (req, res, next) => {
  try {
    const input = historyLifecycleSchema.parse(req.body);
    const procurementIds = input.imports
      .filter((record) => record.domain === 'procurement')
      .map((record) => record.id);
    const serviceIds = input.imports
      .filter((record) => record.domain === 'service')
      .map((record) => record.id);
    const actor = req.auth?.userId;
    let updated = 0;
    if (procurementIds.length > 0) {
      const result = input.mode === 'rollback'
        ? await rollbackProcurementImports(procurementIds, actor)
        : await restoreProcurementImports(procurementIds, actor);
      updated += result.updated;
    }
    if (serviceIds.length > 0) {
      const result = input.mode === 'rollback'
        ? await rollbackServiceImports(serviceIds, actor)
        : await restoreServiceImports(serviceIds, actor);
      updated += result.updated;
    }
    return res.json({ result: { updated } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'INVALID_IMPORT_LIFECYCLE_REQUEST',
          message: 'Select valid import records and try again.',
          details: error.issues,
        },
      });
    }
    return next(error);
  }
});

// Header inspection is intentionally a small JSON request. The browser reads
// only the first CSV record, so original Link2Feed PII values never cross this
// endpoint. Every eventual importer must re-detect and validate the staged
// artifact before activation; this response never authorizes a parser by itself.
const inspectionSchema = z.object({
  container: z.literal('csv'),
  headerText: z.string().min(1).max(256 * 1024),
}).strict();

router.post('/inspect-header', rateLimiter, (req, res, next) => {
  try {
    const { headerText } = inspectionSchema.parse(req.body);
    if (headerText.includes('\uFFFD')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATA_HEADER_ENCODING',
          message: 'FEED could not read this CSV header as UTF-8. Export the data again and retry.',
        },
      });
    }
    return res.json({ inspection: inspectCsvHeader(headerText) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATA_HEADER',
          message: 'Send one UTF-8 CSV header row for inspection.',
          details: error.issues,
        },
      });
    }
    return next(error);
  }
});

const jobIdSchema = z.string().cuid();
const issueIdSchema = z.coerce.number().int().positive();
const decisionSchema = z.object({
  action: z.enum(LINK2FEED_REVIEW_ACTIONS),
  reason: z.string().trim().min(1).max(500),
  eventLabel: z.string().trim().min(1).max(120).optional(),
}).strict();

const sendImportError = (res: Parameters<Parameters<typeof router.post>[1]>[1], error: unknown) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: {
        code: 'INVALID_DATA_IMPORT_REQUEST',
        message: 'Check the import review fields and try again.',
        details: error.issues,
      },
    });
  }
  if (error instanceof Link2FeedVisitImportError) {
    return res.status(400).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.rowNumber ? { details: { rowNumber: error.rowNumber } } : {}),
      },
    });
  }
  if (error instanceof SimcServiceVisitImportError) {
    return res.status(400).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.rowNumber ? { details: { rowNumber: error.rowNumber } } : {}),
      },
    });
  }
  if (error instanceof WthTrackingImportError) {
    return res.status(400).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.rowNumber ? { details: { rowNumber: error.rowNumber } } : {}),
      },
    });
  }
  if (error instanceof DataImportStagingError) {
    return res.status(400).json({ error: { code: error.code, message: error.message } });
  }
  if (error instanceof Link2FeedVisitWorkflowError
    || error instanceof SimcServiceVisitWorkflowError
    || error instanceof WthTrackingWorkflowError
    || error instanceof DataImportJobError) {
    const notFound = error.code.endsWith('_NOT_FOUND');
    return res.status(notFound ? 404 : 409).json({
      error: { code: error.code, message: error.message },
    });
  }
  return null;
};

const safeJobReview = async (jobId: string) => prisma.dataImportJob.findUnique({
  where: { id: jobId },
  select: {
    id: true,
    contractId: true,
    domain: true,
    source: true,
    datasetKind: true,
    status: true,
    fileSizeBytes: true,
    recognizedFieldCount: true,
    ignoredFieldCount: true,
    totalRows: true,
    processedRows: true,
    warningCount: true,
    unresolvedIssueCount: true,
    reviewSummary: true,
    activationOutcome: true,
    activationSummary: true,
    errorCode: true,
    errorMessage: true,
    expiresAt: true,
    createdAt: true,
    updatedAt: true,
    completedAt: true,
    events: {
      orderBy: { sequence: 'asc' },
      select: {
        sequence: true,
        status: true,
        processedRows: true,
        totalRows: true,
        warningCount: true,
        safeMessage: true,
        createdAt: true,
      },
    },
    reviewIssues: {
      orderBy: [{ severity: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        code: true,
        severity: true,
        requiresDecision: true,
        field: true,
        safeDetails: true,
        createdAt: true,
        decisions: {
          orderBy: { revision: 'asc' },
          select: {
            revision: true,
            action: true,
            recordKind: true,
            reportedHouseholdCount: true,
            reportedPeopleCount: true,
            eventLabel: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    },
  },
});

// One global Add Data entry. The server classifier—not a user-selected source
// switch—decides which adapter receives the artifact. New adapters extend this
// dispatch table without changing the modal's entry point.
router.post('/jobs', rateLimiter, async (req, res, next) => {
  try {
    const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
    if (!['text/csv', 'application/csv', 'application/vnd.ms-excel'].includes(contentType)) {
      return res.status(415).json({
        error: {
          code: 'INVALID_DATA_IMPORT_MEDIA_TYPE',
          message: 'Choose a CSV data export and try again.',
        },
      });
    }
    const staged = await stageRecognizedDataImport(req, req.auth?.userId);
    const preparers: Record<string, (jobId: string) => Promise<unknown>> = {
      [LINK2FEED_VISIT_CONTRACT_ID]: prepareLink2FeedVisitImport,
      [SIMC_SERVICE_VISIT_CONTRACT_ID]: prepareSimcServiceVisitImport,
      [WTH_TRACKING_CONTRACT_ID]: prepareWthTrackingImport,
    };
    const prepare = preparers[staged.inspection.contract.id];
    if (!prepare) {
      await cancelDataImportJob(staged.job.id);
      throw new Link2FeedVisitWorkflowError(
        'FEED recognized this file, but its persistent Add Data adapter is not available in this release.',
        'DATA_IMPORT_ADAPTER_NOT_AVAILABLE',
      );
    }
    // 202, not 201: the artifact is staged and identified, but validation has
    // only started. Holding this response until preparation finished is what
    // made a real Link2Feed export impossible to import — 167.8s of work behind
    // a ~100s Cloudflare edge timeout. The client polls GET /jobs/:jobId.
    startDataImportBackgroundTask(staged.job.id, () => prepare(staged.job.id), {
      fallbackErrorCode: 'DATA_IMPORT_PREPARATION_FAILED',
      fallbackMessage: 'FEED could not validate this data file. No data was imported.',
    });
    return res.status(202).json({ job: await safeJobReview(staged.job.id) });
  } catch (error) {
    if (sendImportError(res, error)) return;
    return next(error);
  }
});

// An import outlives the browser tab that started it — a 524, a refresh, or a
// closed laptop leaves the Pi still working with no way for the user to get
// back to the result. This is that way back. Declared before `/jobs/:jobId` so
// `active` is not captured as a job id.
router.get('/jobs/active', rateLimiter, async (_req, res, next) => {
  try {
    const active = await findResumableDataImportJob();
    if (!active) return res.json({ job: null });
    return res.json({ job: await safeJobReview(active.id) });
  } catch (error) {
    if (sendImportError(res, error)) return;
    return next(error);
  }
});

router.get('/jobs/:jobId', rateLimiter, async (req, res, next) => {
  try {
    const jobId = jobIdSchema.parse(req.params.jobId);
    const job = await safeJobReview(jobId);
    if (!job) {
      return res.status(404).json({
        error: { code: 'DATA_IMPORT_JOB_NOT_FOUND', message: 'Import job was not found.' },
      });
    }
    return res.json({ job });
  } catch (error) {
    if (sendImportError(res, error)) return;
    return next(error);
  }
});

router.post('/jobs/:jobId/issues/:issueId/decision', rateLimiter, async (req, res, next) => {
  try {
    const jobId = jobIdSchema.parse(req.params.jobId);
    const issueId = issueIdSchema.parse(req.params.issueId);
    const decision = decisionSchema.parse(req.body);
    await resolveLink2FeedVisitReviewIssue(
      jobId,
      issueId,
      decision,
      req.auth?.userId ?? null,
    );
    return res.json({ job: await safeJobReview(jobId) });
  } catch (error) {
    if (sendImportError(res, error)) return;
    return next(error);
  }
});

router.post('/jobs/:jobId/activate', rateLimiter, async (req, res, next) => {
  try {
    const jobId = jobIdSchema.parse(req.params.jobId);
    const job = await prisma.dataImportJob.findUnique({ where: { id: jobId }, select: { contractId: true } });
    if (!job) {
      throw new DataImportJobError('Import job was not found.', 'DATA_IMPORT_JOB_NOT_FOUND');
    }
    const activator = job.contractId === SIMC_SERVICE_VISIT_CONTRACT_ID
      ? () => activateSimcServiceVisitImport(jobId)
      : job.contractId === WTH_TRACKING_CONTRACT_ID
        ? () => activateWthTrackingImport(jobId)
        : job.contractId === LINK2FEED_VISIT_CONTRACT_ID
          ? () => activateLink2FeedVisitImport(jobId, req.auth?.userId ?? null)
          : null;
    if (!activator) {
      throw new DataImportJobError(
        'This detected data source does not have an activation workflow yet. No data was imported.',
        'DATA_IMPORT_ADAPTER_NOT_AVAILABLE',
      );
    }
    // Activation is the other request that can outlast the edge timeout, so it
    // detaches the same way. The job reaches `completed` with an
    // `activationOutcome` the client reads by polling; the atomicity guarantee
    // is unchanged, because the transaction itself is untouched.
    startDataImportBackgroundTask(jobId, activator, {
      fallbackErrorCode: 'DATA_IMPORT_ACTIVATION_FAILED',
      fallbackMessage: 'FEED could not activate this reviewed import. No partial data was applied.',
    });
    return res.status(202).json({ job: await safeJobReview(jobId) });
  } catch (error) {
    if (sendImportError(res, error)) return;
    return next(error);
  }
});

router.delete('/jobs/:jobId', rateLimiter, async (req, res, next) => {
  try {
    const jobId = jobIdSchema.parse(req.params.jobId);
    await cancelDataImportJob(jobId);
    return res.status(204).send();
  } catch (error) {
    if (sendImportError(res, error)) return;
    return next(error);
  }
});

export default router;
