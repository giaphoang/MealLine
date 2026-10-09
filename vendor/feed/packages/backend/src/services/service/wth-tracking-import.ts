// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { createHash } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../db';
import { recordDataImportJobProgress, transitionDataImportJob } from '../data-import/jobs';
import { cleanupPendingServiceImport } from '../data-import/pending-service';
import { dataImportStagingService, DataImportStagingService } from '../data-import/staging';
import { activateReviewedDataImport } from '../data-import/workflow';
import {
  parseWthTrackingCsv,
  WTH_TRACKING_ADAPTER_VERSION,
  WTH_TRACKING_CONTRACT_ID,
  WTH_TRACKING_METRIC_CONTRACTS,
  WTH_TRACKING_SOURCE,
  WthTrackingImportError,
  type WthTrackingParseSummary,
  type WthTrackingStagingDraft,
} from './adapters/wth-tracking';
import { serviceMetricObservationSnapshotHash } from './metrics';
import { refreshCurrentMetricObservations } from './import-lifecycle';

interface ObservationReconciliation {
  new: number;
  revised: number;
  unchanged: number;
}

interface FormalReconciliation {
  overlapDateCount: number;
  incompleteRegularMethodDateCount: number;
  exactRegularMatchDateCount: number;
  formalHouseholdCount: number;
  regularOperationalHouseholdCount: number;
  allOperationalHouseholdCount: number;
  regularDifference: number;
  allOperationalDifference: number;
  meanAbsoluteDailyRegularDifference: number;
}

export interface WthTrackingReviewSummary extends WthTrackingParseSummary {
  reconciliation: { observations: ObservationReconciliation };
  formalReconciliation: FormalReconciliation;
  unresolvedIssueCount: number;
}

export interface WthTrackingActivationSummary {
  importId: number | null;
  metricObservationRevisionCount: number;
  qualityIssueCount: number;
}

export class WthTrackingWorkflowError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'WthTrackingWorkflowError';
  }
}

type MetricDefinition = Awaited<ReturnType<typeof loadWthMetricDefinitions>> extends Map<string, infer T> ? T : never;

interface EffectiveMetricRevision {
  id: number;
  revision: number;
  displayName: string;
  valueType: string;
  unit: string;
  semanticRole: string;
  isActive: boolean;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
}

async function loadWthMetricDefinitions(client: PrismaClient) {
  const metricKeys = Object.keys(WTH_TRACKING_METRIC_CONTRACTS);
  const definitions = await client.serviceMetricDefinition.findMany({
    where: { metricKey: { in: metricKeys } },
    include: { revisions: { orderBy: { revision: 'desc' } } },
  });
  const byKey = new Map(definitions.map((definition) => [definition.metricKey, definition]));
  const missing = metricKeys.filter((key) => !byKey.has(key));
  if (missing.length > 0) throw new WthTrackingWorkflowError(
    'Install the William Temple House defaults in Service Metrics, then upload this Tracking export again.',
    'WTH_TRACKING_CONFIGURATION_REQUIRED',
  );
  return byKey;
}

export const selectEffectiveWthMetricRevision = (
  revisions: readonly EffectiveMetricRevision[],
  row: Pick<WthTrackingStagingDraft, 'serviceDate' | 'metricKey' | 'sourceMetricLabel'>,
): EffectiveMetricRevision => {
  const revision = revisions.find((candidate) => (
    candidate.effectiveStartDate <= row.serviceDate
    && (candidate.effectiveEndDate === null || candidate.effectiveEndDate >= row.serviceDate)
  ));
  const contract = WTH_TRACKING_METRIC_CONTRACTS[row.metricKey];
  if (
    !revision
    || !revision.isActive
    || revision.valueType !== contract.valueType
    || revision.unit !== contract.unit
    || revision.semanticRole !== contract.semanticRole
  ) throw new WthTrackingWorkflowError(
    `${row.sourceMetricLabel} is not configured for ${row.serviceDate}. Review the WTH defaults in Service Metrics, then upload the export again.`,
    'WTH_TRACKING_CONFIGURATION_MISMATCH',
  );
  return revision;
};

const effectiveDefinition = (
  definition: MetricDefinition,
  row: WthTrackingStagingDraft,
) => selectEffectiveWthMetricRevision(definition.revisions, row);

const snapshotHash = (
  row: WthTrackingStagingDraft,
  definitionRevision: number,
): string => {
  const observationHash = serviceMetricObservationSnapshotHash({
    source: WTH_TRACKING_SOURCE,
    sourceRecordKey: row.sourceRecordKey,
    metricKey: row.metricKey,
    definitionRevision,
    serviceDate: row.serviceDate,
    valueType: row.valueType,
    countValue: row.countValue,
    booleanValue: row.booleanValue,
    timeValue: row.timeValue,
    entryState: 'finalized',
  });
  return createHash('sha256').update(JSON.stringify({
    observationHash,
    sourceMetricLabel: row.sourceMetricLabel,
    sourceSheet: row.sourceSheet,
    sourceCell: row.sourceCell,
  })).digest('hex');
};

async function reconcileObservations(
  jobId: string,
  client: PrismaClient,
): Promise<ObservationReconciliation> {
  const staged = await client.wthTrackingStagingRow.findMany({ where: { jobId } });
  const current = await client.serviceMetricObservationRevision.findMany({
    where: {
      source: WTH_TRACKING_SOURCE,
      sourceRecordKey: { in: staged.map((row) => row.sourceRecordKey) },
      import: { status: 'active' },
    },
    select: { sourceRecordKey: true, snapshotHash: true, revision: true },
    orderBy: [{ revision: 'desc' }, { id: 'desc' }],
  });
  const byKey = new Map<string, string>();
  for (const row of current) {
    if (!byKey.has(row.sourceRecordKey)) byKey.set(row.sourceRecordKey, row.snapshotHash);
  }
  const summary = { new: 0, revised: 0, unchanged: 0 };
  for (const row of staged) {
    const held = byKey.get(row.sourceRecordKey);
    if (!held) summary.new += 1;
    else if (held === row.snapshotHash) summary.unchanged += 1;
    else summary.revised += 1;
  }
  return summary;
}

export function calculateWthTrackingFormalReconciliation(
  staged: ReadonlyArray<Pick<WthTrackingStagingDraft, 'serviceDate' | 'metricKey' | 'countValue'>>,
  formal: ReadonlyArray<{
    source: string;
    serviceDate: string;
    reportedHouseholdCount: number | null;
  }>,
): FormalReconciliation {
  const operationalByDate = new Map<string, {
    regular: number;
    all: number;
    regularMetricKeys: Set<string>;
  }>();
  for (const row of staged) {
    const held = operationalByDate.get(row.serviceDate) ?? {
      regular: 0,
      all: 0,
      regularMetricKeys: new Set<string>(),
    };
    if (['shopping_visits', 'long_lists', 'premade_bags'].includes(row.metricKey)) {
      held.regular += row.countValue ?? 0;
      held.all += row.countValue ?? 0;
      held.regularMetricKeys.add(row.metricKey);
    } else if (row.metricKey === 'emergency_bags') held.all += row.countValue ?? 0;
    operationalByDate.set(row.serviceDate, held);
  }
  const formalBySourceDate = new Map<string, number>();
  for (const row of formal) {
    const key = `${row.source}:${row.serviceDate}`;
    formalBySourceDate.set(key, (formalBySourceDate.get(key) ?? 0) + (row.reportedHouseholdCount ?? 0));
  }
  const formalByDate = new Map<string, number>();
  let incompleteRegularMethodDateCount = 0;
  for (const [serviceDate, operational] of operationalByDate) {
    // Blank Tracking cells mean not recorded, never zero. A formal comparison
    // is defensible only when all three regular-method counts were entered.
    if (operational.regularMetricKeys.size !== 3) {
      incompleteRegularMethodDateCount += 1;
      continue;
    }
    const simc = formalBySourceDate.get(`simc:${serviceDate}`);
    const link2Feed = formalBySourceDate.get(`link2feed:${serviceDate}`);
    if (simc !== undefined) formalByDate.set(serviceDate, simc);
    else if (link2Feed !== undefined) formalByDate.set(serviceDate, link2Feed);
  }
  let exactRegularMatchDateCount = 0;
  let formalHouseholdCount = 0;
  let regularOperationalHouseholdCount = 0;
  let allOperationalHouseholdCount = 0;
  let absoluteDifference = 0;
  for (const [serviceDate, formalCount] of formalByDate) {
    const operational = operationalByDate.get(serviceDate)!;
    formalHouseholdCount += formalCount;
    regularOperationalHouseholdCount += operational.regular;
    allOperationalHouseholdCount += operational.all;
    absoluteDifference += Math.abs(operational.regular - formalCount);
    if (operational.regular === formalCount) exactRegularMatchDateCount += 1;
  }
  return {
    overlapDateCount: formalByDate.size,
    incompleteRegularMethodDateCount,
    exactRegularMatchDateCount,
    formalHouseholdCount,
    regularOperationalHouseholdCount,
    allOperationalHouseholdCount,
    regularDifference: regularOperationalHouseholdCount - formalHouseholdCount,
    allOperationalDifference: allOperationalHouseholdCount - formalHouseholdCount,
    meanAbsoluteDailyRegularDifference: formalByDate.size === 0
      ? 0
      : Number((absoluteDifference / formalByDate.size).toFixed(2)),
  };
}

async function formalReconciliation(
  jobId: string,
  rangeStart: string,
  rangeEnd: string,
  client: PrismaClient,
): Promise<FormalReconciliation> {
  const [staged, formal] = await Promise.all([
    client.wthTrackingStagingRow.findMany({ where: { jobId } }),
    client.serviceEncounterRevision.findMany({
      where: {
        source: { in: ['link2feed', 'simc'] },
        serviceDate: { gte: rangeStart, lte: rangeEnd },
        isCurrent: true,
        import: { status: 'active' },
        reportedHouseholdCount: { not: null },
      },
      select: { source: true, serviceDate: true, reportedHouseholdCount: true },
    }),
  ]);
  return calculateWthTrackingFormalReconciliation(staged, formal);
}

async function materializePendingImport(
  jobId: string,
  actor: string | null,
  client: PrismaClient,
): Promise<number | null> {
  const job = await client.dataImportJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'preparing' || !job.fileHash || !job.reviewSummary) {
    throw new WthTrackingWorkflowError('This WTH Tracking review is unavailable.', 'WTH_TRACKING_REVIEW_MISSING');
  }
  const review = job.reviewSummary as unknown as WthTrackingReviewSummary;
  if (review.reconciliation.observations.new + review.reconciliation.observations.revised === 0) return null;
  const staged = await client.wthTrackingStagingRow.findMany({ where: { jobId } });
  const imported = await client.serviceImport.create({
    data: {
      source: WTH_TRACKING_SOURCE,
      datasetKind: 'operational_metrics',
      fileHash: job.fileHash,
      schemaVersion: WTH_TRACKING_ADAPTER_VERSION,
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
    const prior = await client.serviceMetricObservationRevision.findMany({
      where: { source: WTH_TRACKING_SOURCE, sourceRecordKey: { in: staged.map((row) => row.sourceRecordKey) } },
      select: { sourceRecordKey: true, revision: true, snapshotHash: true, isCurrent: true, import: { select: { status: true } } },
      orderBy: { revision: 'desc' },
    });
    const latestRevision = new Map<string, number>();
    const currentHash = new Map<string, string>();
    for (const row of prior) {
      latestRevision.set(row.sourceRecordKey, Math.max(latestRevision.get(row.sourceRecordKey) ?? 0, row.revision));
      if (row.import?.status === 'active' && !currentHash.has(row.sourceRecordKey)) {
        currentHash.set(row.sourceRecordKey, row.snapshotHash);
      }
    }
    const changed = staged.filter((row) => currentHash.get(row.sourceRecordKey) !== row.snapshotHash);
    for (let index = 0; index < changed.length; index += 400) {
      await client.serviceMetricObservationRevision.createMany({
        data: changed.slice(index, index + 400).map((row) => ({
          metricId: row.metricId,
          definitionRevisionId: row.definitionRevisionId,
          importId: imported.id,
          source: WTH_TRACKING_SOURCE,
          sourceRecordKey: row.sourceRecordKey,
          serviceDate: row.serviceDate,
          revision: (latestRevision.get(row.sourceRecordKey) ?? 0) + 1,
          snapshotHash: row.snapshotHash,
          countValue: row.countValue,
          booleanValue: row.booleanValue,
          timeValue: row.timeValue,
          sourceMetricLabel: row.sourceMetricLabel,
          sourceSheet: row.sourceSheet,
          sourceCell: row.sourceCell,
          entryState: 'finalized',
          warningCodes: row.warningCodes as unknown as Prisma.InputJsonValue,
          isCurrent: false,
          recordedBy: actor,
        })),
      });
    }
    await client.dataImportJob.update({ where: { id: jobId }, data: { pendingServiceImportId: imported.id } });
    return imported.id;
  } catch (error) {
    await cleanupPendingServiceImport(imported.id, WTH_TRACKING_SOURCE, client).catch(() => undefined);
    throw error;
  }
}

export async function prepareWthTrackingImport(
  jobId: string,
  client: PrismaClient = prisma,
  staging: DataImportStagingService = dataImportStagingService,
): Promise<WthTrackingReviewSummary> {
  const job = await client.dataImportJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'preparing' || job.contractId !== WTH_TRACKING_CONTRACT_ID
    || !job.stagedFileKey || !job.fileHash) throw new WthTrackingWorkflowError(
    'This import job is not a staged WTH Tracking export.',
    'WTH_TRACKING_JOB_NOT_READY',
  );
  await staging.verifyCsv(job.stagedFileKey, job.fileHash, WTH_TRACKING_CONTRACT_ID);
  await client.wthTrackingStagingRow.deleteMany({ where: { jobId } });
  try {
    const definitions = await loadWthMetricDefinitions(client);
    const parsed = await parseWthTrackingCsv(staging.createReadStream(job.stagedFileKey), {
      onRows: async (rows) => {
        const data = rows.map((row) => {
          const definition = definitions.get(row.metricKey)!;
          const revision = effectiveDefinition(definition, row);
          return {
            jobId,
            ...row,
            metricId: definition.id,
            definitionRevisionId: revision.id,
            snapshotHash: snapshotHash(row, revision.revision),
            warningCodes: row.warningCodes as unknown as Prisma.InputJsonValue,
          };
        });
        await client.wthTrackingStagingRow.createMany({ data });
      },
      onProgress: async (processedRows) => recordDataImportJobProgress(jobId, {
        processedRows,
        safeMessage: `Validated ${processedRows.toLocaleString('en-US')} WTH metric observations.`,
      }, client).then(() => undefined),
    });
    const [observations, formal] = await Promise.all([
      reconcileObservations(jobId, client),
      formalReconciliation(jobId, parsed.rangeStart, parsed.rangeEnd, client),
    ]);
    const review: WthTrackingReviewSummary = {
      ...parsed,
      reconciliation: { observations },
      formalReconciliation: formal,
      unresolvedIssueCount: 0,
    };
    const transition = {
      processedRows: parsed.rowCount,
      totalRows: parsed.rowCount,
      warningCount: parsed.warningCount,
      unresolvedIssueCount: 0,
      reviewSummary: review as unknown as Prisma.InputJsonValue,
      safeMessage: 'WTH Tracking review is complete and ready for activation.',
    };
    await recordDataImportJobProgress(jobId, transition, client);
    await client.dataImportJob.update({ where: { id: jobId }, data: { reviewSummary: transition.reviewSummary } });
    await materializePendingImport(jobId, job.createdBy, client);
    await transitionDataImportJob(jobId, { status: 'ready', ...transition }, client);
    return review;
  } catch (error) {
    const failed = await client.dataImportJob.findUnique({ where: { id: jobId } }).catch(() => null);
    if (failed?.pendingServiceImportId) await cleanupPendingServiceImport(failed.pendingServiceImportId, WTH_TRACKING_SOURCE, client).catch(() => undefined);
    await client.wthTrackingStagingRow.deleteMany({ where: { jobId } }).catch(() => undefined);
    await staging.delete(job.stagedFileKey).catch(() => undefined);
    const safe = error instanceof WthTrackingImportError || error instanceof WthTrackingWorkflowError
      ? error
      : new WthTrackingWorkflowError(
        'FEED could not validate this WTH Tracking export. No data was imported.',
        'WTH_TRACKING_PREPARATION_FAILED',
      );
    await transitionDataImportJob(jobId, {
      status: 'failed', stagedFileKey: null, errorCode: safe.code,
      errorMessage: safe.message, safeMessage: safe.message,
    }, client).catch(() => undefined);
    throw safe;
  }
}

export async function activateWthTrackingImport(
  jobId: string,
  client: PrismaClient = prisma,
  staging: DataImportStagingService = dataImportStagingService,
) {
  return activateReviewedDataImport<WthTrackingActivationSummary>(jobId, async (tx) => {
    const job = await tx.dataImportJob.findUnique({ where: { id: jobId } });
    if (!job || job.contractId !== WTH_TRACKING_CONTRACT_ID) throw new WthTrackingWorkflowError(
      'This WTH Tracking review cannot be activated.',
      'WTH_TRACKING_REVIEW_INCOMPLETE',
    );
    if (!job.pendingServiceImportId) {
      await tx.wthTrackingStagingRow.deleteMany({ where: { jobId } });
      return { outcome: 'no_op' as const, value: {
        importId: null, metricObservationRevisionCount: 0, qualityIssueCount: 0,
      } };
    }
    const importId = job.pendingServiceImportId;
    const pending = await tx.serviceImport.findFirst({ where: { id: importId, status: 'pending' } });
    if (!pending) throw new WthTrackingWorkflowError(
      'Prepared WTH Tracking data is unavailable. Cancel the import and upload the file again.',
      'WTH_TRACKING_PENDING_IMPORT_MISSING',
    );
    const pendingRows = await tx.serviceMetricObservationRevision.findMany({
      where: { importId },
      select: { source: true, sourceRecordKey: true },
    });
    const metricObservationRevisionCount = pendingRows.length;
    await tx.serviceImport.update({ where: { id: importId }, data: { status: 'active' } });
    await refreshCurrentMetricObservations(tx, pendingRows.map((row) => ({
      source: row.source,
      key: row.sourceRecordKey,
    })));
    await tx.dataImportJob.update({ where: { id: jobId }, data: { pendingServiceImportId: null } });
    await tx.wthTrackingStagingRow.deleteMany({ where: { jobId } });
    return { outcome: 'imported' as const, value: {
      importId, metricObservationRevisionCount, qualityIssueCount: 0,
    } };
  }, client, staging);
}

export async function clearWthTrackingReview(
  jobId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  await client.wthTrackingStagingRow.deleteMany({ where: { jobId } });
}
