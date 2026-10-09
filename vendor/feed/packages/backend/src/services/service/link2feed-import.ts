// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../db';
import {
  recordDataImportJobProgress,
  transitionDataImportJob,
} from '../data-import/jobs';
import {
  dataImportStagingService,
  DataImportStagingService,
} from '../data-import/staging';
import { cleanupPendingServiceImport } from '../data-import/pending-service';
import { startDataImportBackgroundTask } from '../data-import/background';
import { activateReviewedDataImport } from '../data-import/workflow';
import {
  serviceEncounterSnapshotHash,
  validateServiceEncounter,
} from './foundation';
import {
  validateServiceQualityDecision,
  validateServiceQualityIssue,
} from './quality';
import {
  detectLink2FeedTrailingFillerColumns,
  LINK2FEED_SOURCE,
  LINK2FEED_VISIT_ADAPTER_VERSION,
  LINK2FEED_VISIT_CONTRACT_ID,
  Link2FeedVisitImportError,
  parseLink2FeedVisitCsv,
  type Link2FeedVisitParseSummary,
} from './adapters/link2feed-visits';
import { WTH_LINK2FEED_RESOLUTION_PRESETS } from './wth-link2feed-resolutions';

export interface Link2FeedVisitReconciliationSummary {
  encounters: { new: number; revised: number; unchanged: number };
  profiles: { new: number; revised: number; unchanged: number; unavailable: number };
}

export interface Link2FeedVisitReviewSummary extends Link2FeedVisitParseSummary {
  reconciliation: Link2FeedVisitReconciliationSummary;
  autoResolvedIssueCount: number;
  unresolvedIssueCount: number;
}

export class Link2FeedVisitWorkflowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'Link2FeedVisitWorkflowError';
  }
}

export const LINK2FEED_REVIEW_ACTIONS = [
  'apply_source_resolution',
  'keep_source_interpretation',
] as const;
export type Link2FeedReviewAction = typeof LINK2FEED_REVIEW_ACTIONS[number];

export interface Link2FeedReviewDecisionInput {
  action: Link2FeedReviewAction;
  reason: string;
  eventLabel?: string;
}

export interface Link2FeedVisitActivationSummary {
  importId: number | null;
  encounterRevisionCount: number;
  profileRevisionCount: number;
  qualityIssueCount: number;
}

async function reconcileStagedLink2FeedVisits(
  jobId: string,
  client: PrismaClient,
): Promise<Link2FeedVisitReconciliationSummary> {
  const summary: Link2FeedVisitReconciliationSummary = {
    encounters: { new: 0, revised: 0, unchanged: 0 },
    profiles: { new: 0, revised: 0, unchanged: 0, unavailable: 0 },
  };
  let cursor: number | undefined;
  while (true) {
    const staged = await client.link2FeedVisitStagingRow.findMany({
      where: { jobId },
      orderBy: { id: 'asc' },
      take: 1_000,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        sourceRecordKey: true,
        sourceClientId: true,
        encounterSnapshotHash: true,
        sourceProfileKey: true,
        profileSnapshotHash: true,
      },
    });
    if (staged.length === 0) break;
    cursor = staged[staged.length - 1].id;
    const encounterKeys = staged.map((row) => row.sourceRecordKey);
    const profileKeys = staged
      .filter((row) => row.profileSnapshotHash !== null)
      .map((row) => row.sourceProfileKey!);
    const currentEncounters = await client.serviceEncounterRevision.findMany({
      where: {
        source: LINK2FEED_SOURCE,
        sourceRecordKey: { in: encounterKeys },
        isCurrent: true,
        import: { status: 'active' },
      },
      select: { sourceRecordKey: true, snapshotHash: true },
    });
    const currentProfiles = profileKeys.length === 0
      ? []
      : await client.serviceClientProfileRevision.findMany({
        where: {
          source: LINK2FEED_SOURCE,
          sourceProfileKey: { in: profileKeys },
          isCurrent: true,
          import: { status: 'active' },
        },
        select: { sourceProfileKey: true, snapshotHash: true },
      });
    const encounterHashes = new Map(
      currentEncounters.map((row) => [row.sourceRecordKey, row.snapshotHash]),
    );
    const profileHashes = new Map(
      currentProfiles.map((row) => [row.sourceProfileKey, row.snapshotHash]),
    );
    for (const row of staged) {
      const encounterHash = encounterHashes.get(row.sourceRecordKey);
      if (!encounterHash) summary.encounters.new += 1;
      else if (encounterHash === row.encounterSnapshotHash) summary.encounters.unchanged += 1;
      else summary.encounters.revised += 1;

      if (!row.profileSnapshotHash) {
        if (!row.sourceClientId) summary.profiles.unavailable += 1;
        continue;
      }
      const profileHash = profileHashes.get(row.sourceProfileKey!);
      if (!profileHash) summary.profiles.new += 1;
      else if (profileHash === row.profileSnapshotHash) summary.profiles.unchanged += 1;
      else summary.profiles.revised += 1;
    }
  }
  return summary;
}

async function applyWthResolutionPresets(
  jobId: string,
  actor: string | null,
  client: PrismaClient,
): Promise<number> {
  let applied = 0;
  for (const preset of WTH_LINK2FEED_RESOLUTION_PRESETS) {
    const issue = await client.dataImportReviewIssue.findUnique({
      where: {
        jobId_sourceRecordKey_code: {
          jobId,
          sourceRecordKey: preset.sourceRecordKey,
          code: preset.issueCode,
        },
      },
      include: { decisions: { orderBy: { revision: 'desc' }, take: 1 } },
    });
    if (!issue || issue.decisions.length > 0) continue;
    const staged = await client.link2FeedVisitStagingRow.findUnique({
      where: { jobId_sourceRecordKey: { jobId, sourceRecordKey: preset.sourceRecordKey } },
    });
    // A preset is evidence about one exact WTH observation, not permission to
    // reinterpret any future row that happens to reuse the same identity.
    if (
      !staged
      || staged.sourceClientId !== null
      || staged.reportedPeopleCount !== preset.reportedPeopleCount
    ) continue;
    const resolvedEncounter = validateServiceEncounter({
      source: LINK2FEED_SOURCE,
      sourceRecordKey: staged.sourceRecordKey,
      serviceDate: staged.serviceDate,
      sourceClientId: null,
      clientVisitStatus: 'unknown',
      recordKind: preset.recordKind,
      reportedHouseholdCount: preset.reportedHouseholdCount,
      reportedPeopleCount: preset.reportedPeopleCount,
    });
    await client.dataImportReviewDecision.create({
      data: {
        issueId: issue.id,
        revision: 1,
        action: preset.action,
        recordKind: preset.recordKind,
        reportedHouseholdCount: preset.reportedHouseholdCount,
        reportedPeopleCount: preset.reportedPeopleCount,
        eventLabel: preset.eventLabel,
        reason: preset.reason,
        createdBy: actor,
      },
    });
    await client.link2FeedVisitStagingRow.update({
      where: { id: staged.id },
      data: {
        recordKind: resolvedEncounter.recordKind,
        clientVisitStatus: resolvedEncounter.clientVisitStatus,
        reportedHouseholdCount: resolvedEncounter.reportedHouseholdCount,
        reportedPeopleCount: resolvedEncounter.reportedPeopleCount,
        encounterSnapshotHash: serviceEncounterSnapshotHash(resolvedEncounter),
      },
    });
    applied += 1;
  }
  return applied;
}

const normalizeDecisionText = (value: string, label: string, maximum: number): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > maximum) {
    throw new Link2FeedVisitWorkflowError(
      `${label} must be between 1 and ${maximum} characters.`,
      'INVALID_LINK2FEED_REVIEW_DECISION',
    );
  }
  return normalized;
};

const readReviewSummary = (
  value: Prisma.JsonValue | null,
): Link2FeedVisitReviewSummary => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Link2FeedVisitWorkflowError(
      'This Link2Feed review summary is unavailable. Cancel the import and upload the file again.',
      'LINK2FEED_REVIEW_SUMMARY_MISSING',
    );
  }
  return value as unknown as Link2FeedVisitReviewSummary;
};

export async function resolveLink2FeedVisitReviewIssue(
  jobId: string,
  issueId: number,
  input: Link2FeedReviewDecisionInput,
  actor: string | null,
  client: PrismaClient = prisma,
): Promise<Link2FeedVisitReviewSummary> {
  if (!LINK2FEED_REVIEW_ACTIONS.includes(input.action)) {
    throw new Link2FeedVisitWorkflowError(
      'This Link2Feed review action is not supported.',
      'INVALID_LINK2FEED_REVIEW_DECISION',
    );
  }
  const reason = normalizeDecisionText(input.reason, 'Decision reason', 500);
  await client.$transaction(async (tx) => {
    const job = await tx.dataImportJob.findUnique({ where: { id: jobId } });
    // A decision is only meaningful while the job is genuinely waiting on the
    // user — not while background preparation is still running.
    if (!job || job.status !== 'awaiting_review') {
      throw new Link2FeedVisitWorkflowError(
        'This Link2Feed import is no longer awaiting review.',
        'LINK2FEED_VISIT_JOB_NOT_REVIEWABLE',
      );
    }
    const issue = await tx.dataImportReviewIssue.findFirst({
      where: { id: issueId, jobId, requiresDecision: true },
      include: { decisions: { orderBy: { revision: 'desc' }, take: 1 } },
    });
    if (!issue || !issue.sourceRecordKey) {
      throw new Link2FeedVisitWorkflowError(
        'The selected Link2Feed review issue was not found.',
        'LINK2FEED_REVIEW_ISSUE_NOT_FOUND',
      );
    }
    if (issue.code !== 'UNUSUALLY_LARGE_REPORTED_PEOPLE_COUNT') {
      throw new Link2FeedVisitWorkflowError(
        'This blocking source issue cannot be resolved by changing its interpretation. Correct the export and retry.',
        'LINK2FEED_REVIEW_ISSUE_NOT_RESOLVABLE',
      );
    }
    const staged = await tx.link2FeedVisitStagingRow.findUnique({
      where: { jobId_sourceRecordKey: { jobId, sourceRecordKey: issue.sourceRecordKey } },
    });
    if (!staged) {
      throw new Link2FeedVisitWorkflowError(
        'The staged Link2Feed observation is unavailable. Cancel the import and upload the file again.',
        'LINK2FEED_STAGED_OBSERVATION_MISSING',
      );
    }

    const revision = (issue.decisions[0]?.revision ?? 0) + 1;
    if (input.action === 'apply_source_resolution') {
      if (staged.sourceClientId || !staged.reportedPeopleCount) {
        throw new Link2FeedVisitWorkflowError(
          'Only an identity-unavailable observation with a reported people count can become a special-event aggregate.',
          'INVALID_LINK2FEED_SOURCE_RESOLUTION',
        );
      }
      const eventLabel = normalizeDecisionText(input.eventLabel ?? '', 'Event label', 120);
      const encounter = validateServiceEncounter({
        source: LINK2FEED_SOURCE,
        sourceRecordKey: staged.sourceRecordKey,
        serviceDate: staged.serviceDate,
        sourceClientId: null,
        clientVisitStatus: 'unknown',
        recordKind: 'special_event_people_aggregate',
        reportedHouseholdCount: null,
        reportedPeopleCount: staged.reportedPeopleCount,
      });
      await tx.dataImportReviewDecision.create({
        data: {
          issueId,
          revision,
          action: input.action,
          recordKind: encounter.recordKind,
          reportedHouseholdCount: encounter.reportedHouseholdCount,
          reportedPeopleCount: encounter.reportedPeopleCount,
          eventLabel,
          reason,
          createdBy: actor,
        },
      });
      await tx.link2FeedVisitStagingRow.update({
        where: { id: staged.id },
        data: {
          recordKind: encounter.recordKind,
          clientVisitStatus: encounter.clientVisitStatus,
          reportedHouseholdCount: encounter.reportedHouseholdCount,
          reportedPeopleCount: encounter.reportedPeopleCount,
          encounterSnapshotHash: serviceEncounterSnapshotHash(encounter),
        },
      });
    } else {
      validateServiceQualityDecision({ revision, action: 'dismiss', reason });
      await tx.dataImportReviewDecision.create({
        data: {
          issueId,
          revision,
          action: input.action,
          reason,
          createdBy: actor,
        },
      });
    }
  });

  const unresolvedIssueCount = await unresolvedDecisionCount(jobId, client);
  const job = await client.dataImportJob.findUnique({ where: { id: jobId } });
  const review = readReviewSummary(job?.reviewSummary ?? null);
  const updated: Link2FeedVisitReviewSummary = {
    ...review,
    unresolvedIssueCount,
    reconciliation: unresolvedIssueCount === 0
      ? await reconcileStagedLink2FeedVisits(jobId, client)
      : review.reconciliation,
  };
  const progress = {
    processedRows: job?.processedRows ?? review.rowCount,
    totalRows: job?.totalRows ?? review.rowCount,
    warningCount: job?.warningCount ?? review.warningCount,
    unresolvedIssueCount,
    reviewSummary: updated as unknown as Prisma.InputJsonValue,
    safeMessage: unresolvedIssueCount === 0
      ? 'Link2Feed review is complete and ready for activation.'
      : `Review ${unresolvedIssueCount.toLocaleString('en-US')} service-data issue${unresolvedIssueCount === 1 ? '' : 's'} before activation.`,
  };
  await recordDataImportJobProgress(jobId, progress, client);
  if (unresolvedIssueCount === 0) {
    // Materializing 79,308 staged rows into pending revisions is six large
    // INSERT…SELECT statements — long enough on the Pi to outlive the request,
    // exactly like the initial parse. The decision itself is already committed
    // above, so the caller gets an immediate answer and polls for the rest.
    await transitionDataImportJob(jobId, {
      ...progress,
      status: 'preparing',
      safeMessage: 'Preparing the reviewed Link2Feed data for activation.',
    }, client);
    startDataImportBackgroundTask(
      jobId,
      () => finalizeReviewedLink2FeedVisitImport(jobId, actor, client),
      {
        fallbackErrorCode: 'LINK2FEED_VISIT_PREPARATION_FAILED',
        fallbackMessage: 'FEED could not prepare the reviewed Link2Feed revisions. No partial data was applied.',
      },
      client,
    );
  }
  return updated;
}

/**
 * Materializes reviewed staging rows into a pending import and marks the job
 * ready. Runs as a background task once the last review issue is resolved.
 *
 * The failure path is unchanged from when this ran inline: a partially
 * materialized pending import is cleaned up, staging is cleared, the staged
 * source bytes are deleted, and the job records a specific, user-safe code.
 * Nothing is visible to Analytics either way — only activation makes data
 * visible — so an interrupted finalize costs the user a re-upload, never
 * partial or misleading data.
 */
export async function finalizeReviewedLink2FeedVisitImport(
  jobId: string,
  actor: string | null,
  client: PrismaClient = prisma,
): Promise<void> {
  try {
    const job = await client.dataImportJob.findUnique({ where: { id: jobId } });
    const review = readReviewSummary(job?.reviewSummary ?? null);
    const progress = {
      processedRows: job?.processedRows ?? review.rowCount,
      totalRows: job?.totalRows ?? review.rowCount,
      warningCount: job?.warningCount ?? review.warningCount,
      unresolvedIssueCount: 0,
      reviewSummary: review as unknown as Prisma.InputJsonValue,
      safeMessage: 'Link2Feed review is complete and ready for activation.',
    };
    await materializeLink2FeedPendingImport(jobId, actor, client);
    await transitionDataImportJob(jobId, { status: 'ready', ...progress }, client);
  } catch (error) {
    const failedJob = await client.dataImportJob.findUnique({ where: { id: jobId } }).catch(() => null);
    if (failedJob?.pendingServiceImportId) {
      await cleanupPendingLink2FeedServiceImport(
        failedJob.pendingServiceImportId,
        client,
      ).catch(() => undefined);
    }
    await client.$transaction(async (tx) => {
      await tx.dataImportReviewIssue.deleteMany({ where: { jobId } });
      await tx.link2FeedVisitStagingRow.deleteMany({ where: { jobId } });
      await tx.dataImportJob.update({
        where: { id: jobId },
        data: { pendingServiceImportId: null },
      });
    }).catch(() => undefined);
    await dataImportStagingService.delete(failedJob?.stagedFileKey ?? null).catch(() => undefined);
    const safe = error instanceof Link2FeedVisitWorkflowError
      ? error
      : new Link2FeedVisitWorkflowError(
        'FEED could not prepare the reviewed Link2Feed revisions. No partial data was applied.',
        'LINK2FEED_VISIT_PREPARATION_FAILED',
      );
    await transitionDataImportJob(jobId, {
      status: 'failed',
      stagedFileKey: null,
      errorCode: safe.code,
      errorMessage: safe.message,
      safeMessage: safe.message,
    }, client).catch(() => undefined);
    throw safe;
  }
}

export async function cleanupPendingLink2FeedServiceImport(
  importId: number,
  client: PrismaClient = prisma,
): Promise<void> {
  await cleanupPendingServiceImport(importId, LINK2FEED_SOURCE, client);
}

async function materializeLink2FeedPendingImport(
  jobId: string,
  actor: string | null,
  client: PrismaClient,
): Promise<number | null> {
  const job = await client.dataImportJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'preparing' || job.unresolvedIssueCount !== 0 || !job.fileHash) {
    throw new Link2FeedVisitWorkflowError(
      'Resolve every required Link2Feed review issue before preparing activation.',
      'LINK2FEED_REVIEW_INCOMPLETE',
    );
  }
  if (job.pendingServiceImportId) return job.pendingServiceImportId;
  const review = readReviewSummary(job.reviewSummary);
  const changedEncounterCount = review.reconciliation.encounters.new
    + review.reconciliation.encounters.revised;
  const changedProfileCount = review.reconciliation.profiles.new
    + review.reconciliation.profiles.revised;
  if (changedEncounterCount === 0 && changedProfileCount === 0) return null;

  const imported = await client.serviceImport.create({
    data: {
      source: LINK2FEED_SOURCE,
      datasetKind: 'visits',
      fileHash: job.fileHash,
      schemaVersion: LINK2FEED_VISIT_ADAPTER_VERSION,
      status: 'pending',
      rowCount: review.rowCount,
      warningCount: review.warningCount,
      warnings: [],
      rangeStart: review.rangeStart,
      rangeEnd: review.rangeEnd,
      importedBy: actor,
    },
  });

  try {
    // Materialization is intentionally outside the visibility transaction.
    // Pending imports are excluded from Analytics and sanitized backups; the
    // later activation transaction only flips current pointers and status.
    await client.$executeRaw`
      INSERT INTO "ServiceClient" ("source", "sourceClientId", "createdAt")
      SELECT DISTINCT ${LINK2FEED_SOURCE}, staged."sourceClientId", CURRENT_TIMESTAMP
      FROM "Link2FeedVisitStagingRow" staged
      WHERE staged."jobId" = ${jobId}
        AND staged."sourceClientId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "ServiceClient" client
          WHERE client."source" = ${LINK2FEED_SOURCE}
            AND client."sourceClientId" = staged."sourceClientId"
        )`;

    await client.$executeRaw`
      INSERT INTO "ServiceEncounterRevision" (
        "importId", "clientId", "source", "sourceRecordKey", "serviceDate",
        "revision", "snapshotHash", "recordKind", "clientVisitStatus",
        "reportedHouseholdCount", "reportedPeopleCount", "warningCodes",
        "isCurrent", "createdAt"
      )
      SELECT
        ${imported.id}, client."id", ${LINK2FEED_SOURCE}, staged."sourceRecordKey",
        staged."serviceDate",
        COALESCE((
          SELECT MAX(prior."revision")
          FROM "ServiceEncounterRevision" prior
          WHERE prior."source" = ${LINK2FEED_SOURCE}
            AND prior."sourceRecordKey" = staged."sourceRecordKey"
        ), 0) + 1,
        staged."encounterSnapshotHash", staged."recordKind", staged."clientVisitStatus",
        staged."reportedHouseholdCount", staged."reportedPeopleCount",
        staged."warningCodes", 0, CURRENT_TIMESTAMP
      FROM "Link2FeedVisitStagingRow" staged
      LEFT JOIN "ServiceClient" client
        ON client."source" = ${LINK2FEED_SOURCE}
       AND client."sourceClientId" = staged."sourceClientId"
      WHERE staged."jobId" = ${jobId}
        AND NOT EXISTS (
          SELECT 1
          FROM "ServiceEncounterRevision" currentEncounter
          JOIN "ServiceImport" currentImport ON currentImport."id" = currentEncounter."importId"
          WHERE currentEncounter."source" = ${LINK2FEED_SOURCE}
            AND currentEncounter."sourceRecordKey" = staged."sourceRecordKey"
            AND currentEncounter."isCurrent" = 1
            AND currentImport."status" = 'active'
            AND currentEncounter."snapshotHash" = staged."encounterSnapshotHash"
        )`;

    await client.$executeRaw`
      INSERT INTO "ServiceClientProfileRevision" (
        "importId", "clientId", "encounterRevisionId", "source",
        "sourceProfileKey", "observedDate", "revision", "snapshotHash",
        "birthYear", "birthYearEstimated", "birthYearResponseStatus",
        "isCurrent", "createdAt"
      )
      SELECT
        ${imported.id}, client."id",
        (
          SELECT encounter."id"
          FROM "ServiceEncounterRevision" encounter
          JOIN "ServiceImport" encounterImport ON encounterImport."id" = encounter."importId"
          WHERE encounter."source" = ${LINK2FEED_SOURCE}
            AND encounter."sourceRecordKey" = staged."sourceRecordKey"
            AND (
              encounter."importId" = ${imported.id}
              OR (encounter."isCurrent" = 1 AND encounterImport."status" = 'active')
            )
          ORDER BY CASE WHEN encounter."importId" = ${imported.id} THEN 0 ELSE 1 END,
                   encounter."revision" DESC
          LIMIT 1
        ),
        ${LINK2FEED_SOURCE}, staged."sourceProfileKey",
        staged."serviceDate",
        COALESCE((
          SELECT MAX(prior."revision")
          FROM "ServiceClientProfileRevision" prior
          WHERE prior."source" = ${LINK2FEED_SOURCE}
            AND prior."sourceProfileKey" = staged."sourceProfileKey"
        ), 0) + 1,
        staged."profileSnapshotHash", staged."birthYear", staged."birthYearEstimated",
        staged."birthYearResponseStatus", 0, CURRENT_TIMESTAMP
      FROM "Link2FeedVisitStagingRow" staged
      JOIN "ServiceClient" client
        ON client."source" = ${LINK2FEED_SOURCE}
       AND client."sourceClientId" = staged."sourceClientId"
      WHERE staged."jobId" = ${jobId}
        AND staged."profileSnapshotHash" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "ServiceClientProfileRevision" currentProfile
          JOIN "ServiceImport" currentImport ON currentImport."id" = currentProfile."importId"
          WHERE currentProfile."source" = ${LINK2FEED_SOURCE}
            AND currentProfile."sourceProfileKey" = staged."sourceProfileKey"
            AND currentProfile."isCurrent" = 1
            AND currentImport."status" = 'active'
            AND currentProfile."snapshotHash" = staged."profileSnapshotHash"
        )`;

    await client.$executeRaw`
      INSERT INTO "ServiceClientProfileResponse" (
        "profileRevisionId", "dimension", "responseStatus", "values"
      )
      SELECT profile."id",
        json_extract(response.value, '$.dimension'),
        json_extract(response.value, '$.responseStatus'),
        json_extract(response.value, '$.values')
      FROM "ServiceClientProfileRevision" profile
      JOIN "Link2FeedVisitStagingRow" staged
        ON profile."sourceProfileKey" = staged."sourceProfileKey"
      JOIN json_each(staged."profileResponses") response
      WHERE profile."importId" = ${imported.id}
        AND staged."jobId" = ${jobId}`;

    await client.$executeRaw`
      INSERT INTO "ServiceQualityIssue" (
        "importId", "source", "sourceRecordKey", "code", "severity",
        "field", "safeDetails", "detectedAt"
      )
      SELECT ${imported.id}, ${LINK2FEED_SOURCE}, issue."sourceRecordKey",
        issue."code", issue."severity", issue."field", issue."safeDetails",
        issue."createdAt"
      FROM "DataImportReviewIssue" issue
      WHERE issue."jobId" = ${jobId}`;
    await client.$executeRaw`
      INSERT INTO "ServiceQualityIssueDecision" (
        "issueId", "revision", "action", "reason", "createdBy", "createdAt"
      )
      SELECT durable."id", decision."revision",
        CASE WHEN decision."action" = 'apply_source_resolution' THEN 'resolve' ELSE 'dismiss' END,
        decision."reason", decision."createdBy", decision."createdAt"
      FROM "DataImportReviewDecision" decision
      JOIN "DataImportReviewIssue" transient ON transient."id" = decision."issueId"
      JOIN "ServiceQualityIssue" durable
        ON durable."importId" = ${imported.id}
       AND durable."code" = transient."code"
       AND durable."sourceRecordKey" IS transient."sourceRecordKey"
      WHERE transient."jobId" = ${jobId}`;
    await client.dataImportJob.update({
      where: { id: jobId },
      data: { pendingServiceImportId: imported.id },
    });
    return imported.id;
  } catch (error) {
    await cleanupPendingLink2FeedServiceImport(imported.id, client).catch(() => undefined);
    throw error;
  }
}

export async function activateLink2FeedVisitImport(
  jobId: string,
  actor: string | null,
  client: PrismaClient = prisma,
  staging: DataImportStagingService = dataImportStagingService,
) {
  return activateReviewedDataImport<Link2FeedVisitActivationSummary>(jobId, async (tx) => {
    const job = await tx.dataImportJob.findUnique({ where: { id: jobId } });
    if (!job || job.unresolvedIssueCount !== 0) {
      throw new Link2FeedVisitWorkflowError(
        'Resolve every required Link2Feed review issue before activation.',
        'LINK2FEED_REVIEW_INCOMPLETE',
      );
    }
    if (!job.pendingServiceImportId) {
      await tx.dataImportReviewIssue.deleteMany({ where: { jobId } });
      await tx.link2FeedVisitStagingRow.deleteMany({ where: { jobId } });
      return {
        outcome: 'no_op' as const,
        value: {
          importId: null,
          encounterRevisionCount: 0,
          profileRevisionCount: 0,
          qualityIssueCount: 0,
        },
      };
    }

    const importId = job.pendingServiceImportId;
    const pending = await tx.serviceImport.findFirst({
      where: { id: importId, status: 'pending' },
    });
    if (!pending) {
      throw new Link2FeedVisitWorkflowError(
        'Prepared Link2Feed data is unavailable. Cancel the import and upload the file again.',
        'LINK2FEED_PENDING_IMPORT_MISSING',
      );
    }
    const decisions = await tx.dataImportReviewDecision.findMany({
      where: { issue: { jobId }, action: 'apply_source_resolution' },
      include: { issue: true },
      orderBy: { revision: 'asc' },
    });
    for (const decision of decisions) {
      if (!decision.issue.sourceRecordKey) continue;
      const durableIssue = await tx.serviceQualityIssue.findFirst({
        where: {
          importId,
          sourceRecordKey: decision.issue.sourceRecordKey,
          code: decision.issue.code,
        },
      });
      const previous = await tx.serviceSourceResolution.aggregate({
        where: { source: LINK2FEED_SOURCE, sourceRecordKey: decision.issue.sourceRecordKey },
        _max: { revision: true },
      });
      await tx.serviceSourceResolution.create({
        data: {
          source: LINK2FEED_SOURCE,
          sourceRecordKey: decision.issue.sourceRecordKey,
          revision: (previous._max.revision ?? 0) + 1,
          action: 'apply',
          recordKind: decision.recordKind,
          reportedHouseholdCount: decision.reportedHouseholdCount,
          reportedPeopleCount: decision.reportedPeopleCount,
          eventLabel: decision.eventLabel,
          reason: decision.reason,
          createdBy: decision.createdBy ?? actor,
          qualityIssueId: durableIssue?.id,
        },
      });
    }
    await tx.$executeRaw`
      UPDATE "ServiceEncounterRevision" AS currentEncounter
      SET "isCurrent" = 0
      WHERE currentEncounter."source" = ${LINK2FEED_SOURCE}
        AND currentEncounter."isCurrent" = 1
        AND currentEncounter."importId" <> ${importId}
        AND EXISTS (
          SELECT 1 FROM "ServiceEncounterRevision" pendingEncounter
          WHERE pendingEncounter."importId" = ${importId}
            AND pendingEncounter."sourceRecordKey" = currentEncounter."sourceRecordKey"
        )`;
    await tx.$executeRaw`
      UPDATE "ServiceClientProfileRevision" AS currentProfile
      SET "isCurrent" = 0
      WHERE currentProfile."source" = ${LINK2FEED_SOURCE}
        AND currentProfile."isCurrent" = 1
        AND currentProfile."importId" <> ${importId}
        AND EXISTS (
          SELECT 1 FROM "ServiceClientProfileRevision" pendingProfile
          WHERE pendingProfile."importId" = ${importId}
            AND pendingProfile."sourceProfileKey" = currentProfile."sourceProfileKey"
        )`;
    const [encounterRevisionCount, profileRevisionCount, qualityIssueCount] = await Promise.all([
      tx.serviceEncounterRevision.count({ where: { importId } }),
      tx.serviceClientProfileRevision.count({ where: { importId } }),
      tx.serviceQualityIssue.count({ where: { importId } }),
    ]);
    await tx.serviceEncounterRevision.updateMany({ where: { importId }, data: { isCurrent: true } });
    await tx.serviceClientProfileRevision.updateMany({ where: { importId }, data: { isCurrent: true } });
    await tx.serviceImport.update({ where: { id: importId }, data: { status: 'active' } });
    await tx.dataImportJob.update({ where: { id: jobId }, data: { pendingServiceImportId: null } });
    await tx.dataImportReviewIssue.deleteMany({ where: { jobId } });
    await tx.link2FeedVisitStagingRow.deleteMany({ where: { jobId } });
    return {
      outcome: 'imported' as const,
      value: { importId, encounterRevisionCount, profileRevisionCount, qualityIssueCount },
    };
  }, client, staging);
}

async function unresolvedDecisionCount(jobId: string, client: PrismaClient): Promise<number> {
  const issues = await client.dataImportReviewIssue.findMany({
    where: { jobId, requiresDecision: true },
    select: {
      decisions: {
        orderBy: { revision: 'desc' },
        take: 1,
        select: { action: true },
      },
    },
  });
  return issues.filter((issue) => (
    issue.decisions.length === 0 || issue.decisions[0].action === 'reopen'
  )).length;
}

export async function prepareLink2FeedVisitImport(
  jobId: string,
  client: PrismaClient = prisma,
  staging: DataImportStagingService = dataImportStagingService,
): Promise<Link2FeedVisitReviewSummary> {
  const job = await client.dataImportJob.findUnique({ where: { id: jobId } });
  if (
    !job
    || job.status !== 'preparing'
    || job.contractId !== LINK2FEED_VISIT_CONTRACT_ID
    || !job.stagedFileKey
    || !job.fileHash
  ) {
    throw new Link2FeedVisitWorkflowError(
      'This import job is not a staged Link2Feed visit export.',
      'LINK2FEED_VISIT_JOB_NOT_READY',
    );
  }
  await staging.verifyCsv(job.stagedFileKey, job.fileHash, LINK2FEED_VISIT_CONTRACT_ID);
  await client.$transaction(async (tx) => {
    await tx.dataImportReviewIssue.deleteMany({ where: { jobId } });
    await tx.link2FeedVisitStagingRow.deleteMany({ where: { jobId } });
  });

  try {
    // Measured from a short-lived stream over the first two records before the
    // full parse, so strict column counting can stay on for every row.
    const trailingFillerColumns = await detectLink2FeedTrailingFillerColumns(
      staging.createReadStream(job.stagedFileKey),
    );
    const parsed = await parseLink2FeedVisitCsv(staging.createReadStream(job.stagedFileKey), {
      maxPeoplePerHouseholdWithoutReview: 20,
      batchSize: 500,
      trailingFillerColumns,
      onRows: async (rows) => {
        await client.link2FeedVisitStagingRow.createMany({
          data: rows.map((row) => ({
            jobId,
            ...row,
            profileResponses: row.profileResponses as unknown as Prisma.InputJsonValue,
            warningCodes: row.warningCodes as unknown as Prisma.InputJsonValue,
          })),
        });
      },
      onIssues: async (issues) => {
        for (const issue of issues) {
          validateServiceQualityIssue({
            source: LINK2FEED_SOURCE,
            sourceRecordKey: issue.sourceRecordKey,
            code: issue.code,
            severity: issue.severity,
            field: issue.field,
            safeDetails: issue.safeDetails,
          });
        }
        await client.dataImportReviewIssue.createMany({
          data: issues.map((issue) => ({
            jobId,
            sourceRecordKey: issue.sourceRecordKey,
            code: issue.code,
            severity: issue.severity,
            requiresDecision: issue.requiresDecision,
            field: issue.field,
            safeDetails: issue.safeDetails as Prisma.InputJsonValue,
          })),
        });
      },
      onProgress: async (processedRows) => {
        await recordDataImportJobProgress(jobId, {
          processedRows,
          safeMessage: `Validated ${processedRows.toLocaleString('en-US')} Link2Feed visits.`,
        }, client);
      },
    });
    // Link2Feed repeats client attributes on every visit. Encounters remain at
    // visit grain, but a profile is a source-scoped client snapshot: retain the
    // latest observed row per client in this artifact, using the stable record
    // key as a deterministic same-day tie-break. This keeps response coverage
    // honest without manufacturing a near-duplicate profile for every visit.
    await client.$executeRaw`
      WITH ranked_profiles AS (
        SELECT candidate."id",
          ROW_NUMBER() OVER (
            PARTITION BY candidate."sourceClientId"
            ORDER BY candidate."serviceDate" DESC,
                     candidate."recordedAtSerial" DESC,
                     candidate."sourceRecordKey" DESC
          ) AS profile_rank
        FROM "Link2FeedVisitStagingRow" AS candidate
        WHERE candidate."jobId" = ${jobId}
          AND candidate."sourceClientId" IS NOT NULL
      )
      UPDATE "Link2FeedVisitStagingRow"
      SET "sourceProfileKey" = NULL,
          "profileSnapshotHash" = NULL,
          "birthYear" = NULL,
          "birthYearEstimated" = NULL,
          "birthYearResponseStatus" = NULL,
          "profileResponses" = '[]'
      WHERE "id" IN (
        SELECT "id" FROM ranked_profiles WHERE profile_rank > 1
      )`;
    const autoResolvedIssueCount = await applyWthResolutionPresets(jobId, job.createdBy, client);
    const reconciliation = await reconcileStagedLink2FeedVisits(jobId, client);
    const unresolvedIssueCount = await unresolvedDecisionCount(jobId, client);
    const review: Link2FeedVisitReviewSummary = {
      ...parsed,
      reconciliation,
      autoResolvedIssueCount,
      unresolvedIssueCount,
    };
    const transition = {
      processedRows: parsed.rowCount,
      totalRows: parsed.rowCount,
      warningCount: parsed.warningCount,
      unresolvedIssueCount,
      reviewSummary: review as unknown as Prisma.InputJsonValue,
      safeMessage: unresolvedIssueCount > 0
        ? `Review ${unresolvedIssueCount.toLocaleString('en-US')} service-data issue${unresolvedIssueCount === 1 ? '' : 's'} before activation.`
        : 'Link2Feed review is complete and ready for activation.',
    };
    if (unresolvedIssueCount > 0) {
      // The job must LEAVE `preparing` here. Before preparation was detached it
      // was already sitting in `awaiting_review`, so recording progress was
      // enough; now the status is what tells the client the server has stopped
      // working and started waiting. Without this transition the job stays in a
      // background status forever: the progress panel counts up with no end,
      // and every review decision is rejected as "no longer awaiting review".
      await transitionDataImportJob(jobId, { ...transition, status: 'awaiting_review' }, client);
    } else {
      await recordDataImportJobProgress(jobId, transition, client);
      await materializeLink2FeedPendingImport(jobId, job.createdBy, client);
      await transitionDataImportJob(jobId, { status: 'ready', ...transition }, client);
    }
    return review;
  } catch (error) {
    const failedJob = await client.dataImportJob.findUnique({ where: { id: jobId } }).catch(() => null);
    if (failedJob?.pendingServiceImportId) {
      await cleanupPendingLink2FeedServiceImport(
        failedJob.pendingServiceImportId,
        client,
      ).catch(() => undefined);
      await client.dataImportJob.update({
        where: { id: jobId },
        data: { pendingServiceImportId: null },
      }).catch(() => undefined);
    }
    await client.$transaction(async (tx) => {
      await tx.dataImportReviewIssue.deleteMany({ where: { jobId } });
      await tx.link2FeedVisitStagingRow.deleteMany({ where: { jobId } });
    }).catch(() => undefined);
    await staging.delete(job.stagedFileKey).catch(() => undefined);
    const safe = error instanceof Link2FeedVisitImportError
      || error instanceof Link2FeedVisitWorkflowError
      ? error
      : new Link2FeedVisitWorkflowError(
        'FEED could not validate this Link2Feed export. No data was imported.',
        'LINK2FEED_VISIT_PREPARATION_FAILED',
      );
    await transitionDataImportJob(jobId, {
      status: 'failed',
      stagedFileKey: null,
      errorCode: safe.code,
      errorMessage: safe.message,
      safeMessage: safe.message,
    }, client).catch(() => undefined);
    throw safe;
  }
}

export async function clearLink2FeedVisitReview(
  jobId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  await client.dataImportReviewIssue.deleteMany({ where: { jobId } });
  await client.link2FeedVisitStagingRow.deleteMany({ where: { jobId } });
}
