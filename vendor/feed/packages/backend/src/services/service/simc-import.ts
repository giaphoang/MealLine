// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../db';
import { recordDataImportJobProgress, transitionDataImportJob } from '../data-import/jobs';
import { cleanupPendingServiceImport } from '../data-import/pending-service';
import { dataImportStagingService, DataImportStagingService } from '../data-import/staging';
import { activateReviewedDataImport } from '../data-import/workflow';
import {
  parseSimcServiceVisitCsv,
  SIMC_SERVICE_VISIT_ADAPTER_VERSION,
  SIMC_SERVICE_VISIT_CONTRACT_ID,
  SIMC_SOURCE,
  SimcServiceVisitImportError,
  type SimcServiceVisitParseSummary,
} from './adapters/simc-service-visits';
import { validateServiceQualityIssue } from './quality';

export interface SimcReconciliationSummary {
  encounters: { new: number; revised: number; unchanged: number };
  householdProfiles: { new: number; revised: number; unchanged: number; unavailable: number };
  personProfiles: { new: number; revised: number; unchanged: number };
}

export interface SimcServiceVisitReviewSummary extends SimcServiceVisitParseSummary {
  reconciliation: SimcReconciliationSummary;
  unresolvedIssueCount: number;
}

export interface SimcServiceVisitActivationSummary {
  importId: number | null;
  encounterRevisionCount: number;
  profileRevisionCount: number;
  personProfileRevisionCount: number;
  encounterPersonCount: number;
  qualityIssueCount: number;
}

export class SimcServiceVisitWorkflowError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SimcServiceVisitWorkflowError';
  }
}

const reconcileHash = (
  current: Map<string, string>,
  key: string,
  hash: string,
  bucket: { new: number; revised: number; unchanged: number },
) => {
  const held = current.get(key);
  if (!held) bucket.new += 1;
  else if (held === hash) bucket.unchanged += 1;
  else bucket.revised += 1;
};

async function reconcileSimc(jobId: string, client: PrismaClient): Promise<SimcReconciliationSummary> {
  const [visits, people] = await Promise.all([
    client.simcVisitStagingRow.findMany({ where: { jobId } }),
    client.simcPersonStagingRow.findMany({ where: { jobId } }),
  ]);
  const encounterKeys = visits.map((row) => row.sourceRecordKey);
  const householdProfileKeys = visits.flatMap((row) => row.sourceProfileKey ? [row.sourceProfileKey] : []);
  const personProfileKeys = people.map((row) => row.sourceProfileKey);
  const [encounters, householdProfiles, personProfiles] = await Promise.all([
    client.serviceEncounterRevision.findMany({
      where: { source: SIMC_SOURCE, sourceRecordKey: { in: encounterKeys }, isCurrent: true, import: { status: 'active' } },
      select: { sourceRecordKey: true, snapshotHash: true },
    }),
    client.serviceClientProfileRevision.findMany({
      where: { source: SIMC_SOURCE, sourceProfileKey: { in: householdProfileKeys }, isCurrent: true, import: { status: 'active' } },
      select: { sourceProfileKey: true, snapshotHash: true },
    }),
    client.servicePersonProfileRevision.findMany({
      where: { source: SIMC_SOURCE, sourceProfileKey: { in: personProfileKeys }, isCurrent: true, import: { status: 'active' } },
      select: { sourceProfileKey: true, snapshotHash: true },
    }),
  ]);
  const summary: SimcReconciliationSummary = {
    encounters: { new: 0, revised: 0, unchanged: 0 },
    householdProfiles: { new: 0, revised: 0, unchanged: 0, unavailable: 0 },
    personProfiles: { new: 0, revised: 0, unchanged: 0 },
  };
  const encounterMap = new Map(encounters.map((row) => [row.sourceRecordKey, row.snapshotHash]));
  const householdMap = new Map(householdProfiles.map((row) => [row.sourceProfileKey, row.snapshotHash]));
  const personMap = new Map(personProfiles.map((row) => [row.sourceProfileKey, row.snapshotHash]));
  for (const row of visits) {
    reconcileHash(encounterMap, row.sourceRecordKey, row.encounterSnapshotHash, summary.encounters);
    if (!row.sourceProfileKey || !row.profileSnapshotHash) summary.householdProfiles.unavailable += 1;
    else reconcileHash(householdMap, row.sourceProfileKey, row.profileSnapshotHash, summary.householdProfiles);
  }
  for (const row of people) reconcileHash(personMap, row.sourceProfileKey, row.profileSnapshotHash, summary.personProfiles);
  return summary;
}

const readSummary = (value: Prisma.JsonValue | null): SimcServiceVisitReviewSummary => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SimcServiceVisitWorkflowError(
      'This SIMC review summary is unavailable. Cancel the import and upload the file again.',
      'SIMC_REVIEW_SUMMARY_MISSING',
    );
  }
  return value as unknown as SimcServiceVisitReviewSummary;
};

async function materializeSimcPendingImport(
  jobId: string,
  actor: string | null,
  client: PrismaClient,
): Promise<number | null> {
  const job = await client.dataImportJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'preparing' || !job.fileHash) {
    throw new SimcServiceVisitWorkflowError('This SIMC review is not ready.', 'SIMC_REVIEW_INCOMPLETE');
  }
  if (job.pendingServiceImportId) return job.pendingServiceImportId;
  const review = readSummary(job.reviewSummary);
  const changes = review.reconciliation.encounters.new + review.reconciliation.encounters.revised
    + review.reconciliation.householdProfiles.new + review.reconciliation.householdProfiles.revised
    + review.reconciliation.personProfiles.new + review.reconciliation.personProfiles.revised;
  if (changes === 0) return null;

  const imported = await client.serviceImport.create({
    data: {
      source: SIMC_SOURCE,
      datasetKind: 'visits',
      fileHash: job.fileHash,
      schemaVersion: SIMC_SERVICE_VISIT_ADAPTER_VERSION,
      status: 'pending',
      rowCount: review.rawRowCount,
      warningCount: review.warningCount,
      warnings: [],
      rangeStart: review.rangeStart,
      rangeEnd: review.rangeEnd,
      importedBy: actor,
    },
  });

  try {
    await client.$executeRaw`
      INSERT INTO "ServiceClient" ("source", "sourceClientId", "createdAt")
      SELECT DISTINCT ${SIMC_SOURCE}, staged."sourceHouseholdId", CURRENT_TIMESTAMP
      FROM "SimcVisitStagingRow" staged
      WHERE staged."jobId" = ${jobId} AND staged."sourceHouseholdId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "ServiceClient" client
          WHERE client."source" = ${SIMC_SOURCE}
            AND client."sourceClientId" = staged."sourceHouseholdId"
        )`;
    await client.$executeRaw`
      INSERT INTO "ServicePerson" ("source", "sourcePersonId", "createdAt")
      SELECT DISTINCT ${SIMC_SOURCE}, staged."sourcePersonId", CURRENT_TIMESTAMP
      FROM "SimcPersonStagingRow" staged
      WHERE staged."jobId" = ${jobId}
        AND NOT EXISTS (
          SELECT 1 FROM "ServicePerson" person
          WHERE person."source" = ${SIMC_SOURCE}
            AND person."sourcePersonId" = staged."sourcePersonId"
        )`;
    await client.$executeRaw`
      INSERT INTO "ServiceEncounterRevision" (
        "importId", "clientId", "source", "sourceRecordKey", "serviceDate",
        "revision", "snapshotHash", "recordKind", "clientVisitStatus",
        "reportedHouseholdCount", "reportedPeopleCount", "sourceEventId",
        "sourceRecordedAt", "numberAdults", "numberChildren", "numberSeniors",
        "numberUnknownAge", "warningCodes", "isCurrent", "createdAt"
      )
      SELECT ${imported.id}, client."id", ${SIMC_SOURCE}, staged."sourceRecordKey",
        staged."serviceDate",
        COALESCE((SELECT MAX(prior."revision") FROM "ServiceEncounterRevision" prior
          WHERE prior."source" = ${SIMC_SOURCE} AND prior."sourceRecordKey" = staged."sourceRecordKey"), 0) + 1,
        staged."encounterSnapshotHash", staged."recordKind", 'unknown',
        staged."reportedHouseholdCount", staged."reportedPeopleCount", staged."sourceEventId",
        staged."sourceRecordedAt", staged."numberAdults", staged."numberChildren",
        staged."numberSeniors", staged."numberUnknownAge", staged."warningCodes", 0, CURRENT_TIMESTAMP
      FROM "SimcVisitStagingRow" staged
      LEFT JOIN "ServiceClient" client ON client."source" = ${SIMC_SOURCE}
        AND client."sourceClientId" = staged."sourceHouseholdId"
      WHERE staged."jobId" = ${jobId}
        AND NOT EXISTS (
          SELECT 1 FROM "ServiceEncounterRevision" currentEncounter
          JOIN "ServiceImport" currentImport ON currentImport."id" = currentEncounter."importId"
          WHERE currentEncounter."source" = ${SIMC_SOURCE}
            AND currentEncounter."sourceRecordKey" = staged."sourceRecordKey"
            AND currentEncounter."isCurrent" = 1 AND currentImport."status" = 'active'
            AND currentEncounter."snapshotHash" = staged."encounterSnapshotHash"
        )`;
    await client.$executeRaw`
      INSERT INTO "ServiceClientProfileRevision" (
        "importId", "clientId", "encounterRevisionId", "source", "sourceProfileKey",
        "observedDate", "revision", "snapshotHash", "birthYear", "birthYearEstimated",
        "birthYearResponseStatus", "isCurrent", "createdAt"
      )
      SELECT ${imported.id}, client."id", encounter."id", ${SIMC_SOURCE}, staged."sourceProfileKey",
        staged."serviceDate",
        COALESCE((SELECT MAX(prior."revision") FROM "ServiceClientProfileRevision" prior
          WHERE prior."source" = ${SIMC_SOURCE} AND prior."sourceProfileKey" = staged."sourceProfileKey"), 0) + 1,
        staged."profileSnapshotHash", NULL, NULL, 'not_provided', 0, CURRENT_TIMESTAMP
      FROM "SimcVisitStagingRow" staged
      JOIN "ServiceClient" client ON client."source" = ${SIMC_SOURCE}
        AND client."sourceClientId" = staged."sourceHouseholdId"
      LEFT JOIN "ServiceEncounterRevision" encounter ON encounter."importId" = ${imported.id}
        AND encounter."sourceRecordKey" = staged."sourceRecordKey"
      WHERE staged."jobId" = ${jobId} AND staged."profileSnapshotHash" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "ServiceClientProfileRevision" currentProfile
          JOIN "ServiceImport" currentImport ON currentImport."id" = currentProfile."importId"
          WHERE currentProfile."source" = ${SIMC_SOURCE}
            AND currentProfile."sourceProfileKey" = staged."sourceProfileKey"
            AND currentProfile."isCurrent" = 1 AND currentImport."status" = 'active'
            AND currentProfile."snapshotHash" = staged."profileSnapshotHash"
        )`;
    await client.$executeRaw`
      INSERT INTO "ServiceClientProfileResponse" ("profileRevisionId", "dimension", "responseStatus", "values")
      SELECT profile."id", json_extract(response.value, '$.dimension'),
        json_extract(response.value, '$.responseStatus'), json_extract(response.value, '$.values')
      FROM "ServiceClientProfileRevision" profile
      JOIN "SimcVisitStagingRow" staged ON staged."sourceProfileKey" = profile."sourceProfileKey"
      JOIN json_each(staged."profileResponses") response
      WHERE profile."importId" = ${imported.id} AND staged."jobId" = ${jobId}`;
    await client.$executeRaw`
      INSERT INTO "ServicePersonProfileRevision" (
        "importId", "personId", "source", "sourceProfileKey", "observedDate",
        "revision", "snapshotHash", "birthYear", "birthYearEstimated",
        "birthYearResponseStatus", "isCurrent", "createdAt"
      )
      SELECT ${imported.id}, person."id", ${SIMC_SOURCE}, staged."sourceProfileKey",
        staged."observedDate",
        COALESCE((SELECT MAX(prior."revision") FROM "ServicePersonProfileRevision" prior
          WHERE prior."source" = ${SIMC_SOURCE} AND prior."sourceProfileKey" = staged."sourceProfileKey"), 0) + 1,
        staged."profileSnapshotHash", staged."birthYear", staged."birthYearEstimated",
        staged."birthYearResponseStatus", 0, CURRENT_TIMESTAMP
      FROM "SimcPersonStagingRow" staged
      JOIN "ServicePerson" person ON person."source" = ${SIMC_SOURCE}
        AND person."sourcePersonId" = staged."sourcePersonId"
      WHERE staged."jobId" = ${jobId}
        AND NOT EXISTS (
          SELECT 1 FROM "ServicePersonProfileRevision" currentProfile
          JOIN "ServiceImport" currentImport ON currentImport."id" = currentProfile."importId"
          WHERE currentProfile."source" = ${SIMC_SOURCE}
            AND currentProfile."sourceProfileKey" = staged."sourceProfileKey"
            AND currentProfile."isCurrent" = 1 AND currentImport."status" = 'active'
            AND currentProfile."snapshotHash" = staged."profileSnapshotHash"
        )`;
    await client.$executeRaw`
      INSERT INTO "ServicePersonProfileResponse" ("profileRevisionId", "dimension", "responseStatus", "values")
      SELECT profile."id", json_extract(response.value, '$.dimension'),
        json_extract(response.value, '$.responseStatus'), json_extract(response.value, '$.values')
      FROM "ServicePersonProfileRevision" profile
      JOIN "SimcPersonStagingRow" staged ON staged."sourceProfileKey" = profile."sourceProfileKey"
      JOIN json_each(staged."profileResponses") response
      WHERE profile."importId" = ${imported.id} AND staged."jobId" = ${jobId}`;
    await client.$executeRaw`
      INSERT INTO "ServiceEncounterPerson" ("encounterRevisionId", "personId", "isHeadOfHousehold")
      SELECT encounter."id", person."id", staged."isHeadOfHousehold"
      FROM "SimcEncounterPersonStagingRow" staged
      JOIN "ServiceEncounterRevision" encounter ON encounter."importId" = ${imported.id}
        AND encounter."sourceRecordKey" = staged."sourceRecordKey"
      JOIN "ServicePerson" person ON person."source" = ${SIMC_SOURCE}
        AND person."sourcePersonId" = staged."sourcePersonId"
      WHERE staged."jobId" = ${jobId}`;
    await client.$executeRaw`
      INSERT INTO "ServiceQualityIssue" (
        "importId", "source", "sourceRecordKey", "code", "severity", "field", "safeDetails", "detectedAt"
      )
      SELECT ${imported.id}, ${SIMC_SOURCE}, issue."sourceRecordKey", issue."code",
        issue."severity", issue."field", issue."safeDetails", issue."createdAt"
      FROM "DataImportReviewIssue" issue WHERE issue."jobId" = ${jobId}`;
    await client.dataImportJob.update({ where: { id: jobId }, data: { pendingServiceImportId: imported.id } });
    return imported.id;
  } catch (error) {
    await cleanupPendingServiceImport(imported.id, SIMC_SOURCE, client).catch(() => undefined);
    throw error;
  }
}

export async function prepareSimcServiceVisitImport(
  jobId: string,
  client: PrismaClient = prisma,
  staging: DataImportStagingService = dataImportStagingService,
): Promise<SimcServiceVisitReviewSummary> {
  const job = await client.dataImportJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'preparing' || job.contractId !== SIMC_SERVICE_VISIT_CONTRACT_ID
    || !job.stagedFileKey || !job.fileHash) {
    throw new SimcServiceVisitWorkflowError(
      'This import job is not a staged SIMC service export.',
      'SIMC_SERVICE_VISIT_JOB_NOT_READY',
    );
  }
  await staging.verifyCsv(job.stagedFileKey, job.fileHash, SIMC_SERVICE_VISIT_CONTRACT_ID);
  await client.$transaction(async (tx) => {
    await tx.dataImportReviewIssue.deleteMany({ where: { jobId } });
    await tx.simcEncounterPersonStagingRow.deleteMany({ where: { jobId } });
    await tx.simcPersonStagingRow.deleteMany({ where: { jobId } });
    await tx.simcVisitStagingRow.deleteMany({ where: { jobId } });
  });
  try {
    const parsed = await parseSimcServiceVisitCsv(staging.createReadStream(job.stagedFileKey), {
      onVisits: async (rows) => {
        for (let index = 0; index < rows.length; index += 500) {
          await client.simcVisitStagingRow.createMany({
            data: rows.slice(index, index + 500).map((row) => ({
              jobId, ...row,
              profileResponses: row.profileResponses as unknown as Prisma.InputJsonValue,
              warningCodes: row.warningCodes as unknown as Prisma.InputJsonValue,
            })),
          });
        }
      },
      onPeople: async (rows) => {
        for (let index = 0; index < rows.length; index += 500) {
          await client.simcPersonStagingRow.createMany({
            data: rows.slice(index, index + 500).map((row) => ({
              jobId, ...row, profileResponses: row.profileResponses as unknown as Prisma.InputJsonValue,
            })),
          });
        }
      },
      onMemberships: async (rows) => {
        for (let index = 0; index < rows.length; index += 500) {
          await client.simcEncounterPersonStagingRow.createMany({ data: rows.slice(index, index + 500).map((row) => ({ jobId, ...row })) });
        }
      },
      onIssues: async (issues) => {
        for (const issue of issues) validateServiceQualityIssue({
          source: SIMC_SOURCE,
          sourceRecordKey: issue.sourceRecordKey,
          code: issue.code,
          severity: issue.severity,
          field: issue.field,
          safeDetails: issue.safeDetails,
        });
        await client.dataImportReviewIssue.createMany({ data: issues.map((issue) => ({
          jobId, ...issue, safeDetails: issue.safeDetails as Prisma.InputJsonValue,
        })) });
      },
      onProgress: async (processedRows) => recordDataImportJobProgress(jobId, {
        processedRows,
        safeMessage: `Validated ${processedRows.toLocaleString('en-US')} SIMC member rows.`,
      }, client).then(() => undefined),
    });
    const reconciliation = await reconcileSimc(jobId, client);
    const review: SimcServiceVisitReviewSummary = { ...parsed, reconciliation, unresolvedIssueCount: 0 };
    const transition = {
      processedRows: parsed.rawRowCount,
      totalRows: parsed.rawRowCount,
      warningCount: parsed.warningCount,
      unresolvedIssueCount: 0,
      reviewSummary: review as unknown as Prisma.InputJsonValue,
      safeMessage: 'SIMC review is complete and ready for activation.',
    };
    await recordDataImportJobProgress(jobId, transition, client);
    await materializeSimcPendingImport(jobId, job.createdBy, client);
    await transitionDataImportJob(jobId, { status: 'ready', ...transition }, client);
    return review;
  } catch (error) {
    const failed = await client.dataImportJob.findUnique({ where: { id: jobId } }).catch(() => null);
    if (failed?.pendingServiceImportId) await cleanupPendingServiceImport(failed.pendingServiceImportId, SIMC_SOURCE, client).catch(() => undefined);
    await client.$transaction(async (tx) => {
      await tx.dataImportReviewIssue.deleteMany({ where: { jobId } });
      await tx.simcEncounterPersonStagingRow.deleteMany({ where: { jobId } });
      await tx.simcPersonStagingRow.deleteMany({ where: { jobId } });
      await tx.simcVisitStagingRow.deleteMany({ where: { jobId } });
      await tx.dataImportJob.update({ where: { id: jobId }, data: { pendingServiceImportId: null } });
    }).catch(() => undefined);
    await staging.delete(job.stagedFileKey).catch(() => undefined);
    const safe = error instanceof SimcServiceVisitImportError || error instanceof SimcServiceVisitWorkflowError
      ? error
      : new SimcServiceVisitWorkflowError(
        'FEED could not validate this SIMC export. No data was imported.',
        'SIMC_SERVICE_VISIT_PREPARATION_FAILED',
      );
    await transitionDataImportJob(jobId, {
      status: 'failed', stagedFileKey: null, errorCode: safe.code,
      errorMessage: safe.message, safeMessage: safe.message,
    }, client).catch(() => undefined);
    throw safe;
  }
}

export async function activateSimcServiceVisitImport(
  jobId: string,
  client: PrismaClient = prisma,
  staging: DataImportStagingService = dataImportStagingService,
) {
  return activateReviewedDataImport<SimcServiceVisitActivationSummary>(jobId, async (tx) => {
    const job = await tx.dataImportJob.findUnique({ where: { id: jobId } });
    if (!job || job.contractId !== SIMC_SERVICE_VISIT_CONTRACT_ID) {
      throw new SimcServiceVisitWorkflowError('This SIMC review cannot be activated.', 'SIMC_REVIEW_INCOMPLETE');
    }
    if (!job.pendingServiceImportId) {
      await tx.dataImportReviewIssue.deleteMany({ where: { jobId } });
      await tx.simcEncounterPersonStagingRow.deleteMany({ where: { jobId } });
      await tx.simcPersonStagingRow.deleteMany({ where: { jobId } });
      await tx.simcVisitStagingRow.deleteMany({ where: { jobId } });
      return { outcome: 'no_op' as const, value: {
        importId: null, encounterRevisionCount: 0, profileRevisionCount: 0,
        personProfileRevisionCount: 0, encounterPersonCount: 0, qualityIssueCount: 0,
      } };
    }
    const importId = job.pendingServiceImportId;
    const pending = await tx.serviceImport.findFirst({ where: { id: importId, status: 'pending' } });
    if (!pending) throw new SimcServiceVisitWorkflowError(
      'Prepared SIMC data is unavailable. Cancel the import and upload the file again.',
      'SIMC_PENDING_IMPORT_MISSING',
    );
    await tx.$executeRaw`
      UPDATE "ServiceEncounterRevision" AS currentRow SET "isCurrent" = 0
      WHERE currentRow."source" = ${SIMC_SOURCE} AND currentRow."isCurrent" = 1
        AND currentRow."importId" <> ${importId}
        AND EXISTS (SELECT 1 FROM "ServiceEncounterRevision" pendingRow
          WHERE pendingRow."importId" = ${importId}
            AND pendingRow."sourceRecordKey" = currentRow."sourceRecordKey")`;
    await tx.$executeRaw`
      UPDATE "ServiceClientProfileRevision" AS currentRow SET "isCurrent" = 0
      WHERE currentRow."source" = ${SIMC_SOURCE} AND currentRow."isCurrent" = 1
        AND currentRow."importId" <> ${importId}
        AND EXISTS (SELECT 1 FROM "ServiceClientProfileRevision" pendingRow
          WHERE pendingRow."importId" = ${importId}
            AND pendingRow."sourceProfileKey" = currentRow."sourceProfileKey")`;
    await tx.$executeRaw`
      UPDATE "ServicePersonProfileRevision" AS currentRow SET "isCurrent" = 0
      WHERE currentRow."source" = ${SIMC_SOURCE} AND currentRow."isCurrent" = 1
        AND currentRow."importId" <> ${importId}
        AND EXISTS (SELECT 1 FROM "ServicePersonProfileRevision" pendingRow
          WHERE pendingRow."importId" = ${importId}
            AND pendingRow."sourceProfileKey" = currentRow."sourceProfileKey")`;
    const [encounterRevisionCount, profileRevisionCount, personProfileRevisionCount, encounterPersonCount, qualityIssueCount] = await Promise.all([
      tx.serviceEncounterRevision.count({ where: { importId } }),
      tx.serviceClientProfileRevision.count({ where: { importId } }),
      tx.servicePersonProfileRevision.count({ where: { importId } }),
      tx.serviceEncounterPerson.count({ where: { encounter: { importId } } }),
      tx.serviceQualityIssue.count({ where: { importId } }),
    ]);
    await tx.serviceEncounterRevision.updateMany({ where: { importId }, data: { isCurrent: true } });
    await tx.serviceClientProfileRevision.updateMany({ where: { importId }, data: { isCurrent: true } });
    await tx.servicePersonProfileRevision.updateMany({ where: { importId }, data: { isCurrent: true } });
    await tx.serviceImport.update({ where: { id: importId }, data: { status: 'active' } });
    await tx.dataImportJob.update({ where: { id: jobId }, data: { pendingServiceImportId: null } });
    await tx.dataImportReviewIssue.deleteMany({ where: { jobId } });
    await tx.simcEncounterPersonStagingRow.deleteMany({ where: { jobId } });
    await tx.simcPersonStagingRow.deleteMany({ where: { jobId } });
    await tx.simcVisitStagingRow.deleteMany({ where: { jobId } });
    return { outcome: 'imported' as const, value: {
      importId, encounterRevisionCount, profileRevisionCount,
      personProfileRevisionCount, encounterPersonCount, qualityIssueCount,
    } };
  }, client, staging);
}

export async function clearSimcVisitReview(
  jobId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  await client.dataImportReviewIssue.deleteMany({ where: { jobId } });
  await client.simcEncounterPersonStagingRow.deleteMany({ where: { jobId } });
  await client.simcPersonStagingRow.deleteMany({ where: { jobId } });
  await client.simcVisitStagingRow.deleteMany({ where: { jobId } });
}
