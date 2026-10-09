// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../db';

type TransactionClient = Prisma.TransactionClient;
type RevisionIdentity = { id: number; source: string; key: string; revision: number };
type MetricRevisionIdentity = {
  id: number;
  metricId: number;
  serviceDate: string;
  source: string;
  revision: number;
};

const chunk = <T>(values: readonly T[], size = 400): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
};

const identityKey = (source: string, key: string): string => JSON.stringify([source, key]);

export function selectCurrentServiceRevisionIds(
  candidates: readonly RevisionIdentity[],
): number[] {
  const winners = new Map<string, RevisionIdentity>();
  for (const candidate of candidates) {
    const key = identityKey(candidate.source, candidate.key);
    const held = winners.get(key);
    if (!held || candidate.revision > held.revision) winners.set(key, candidate);
  }
  return [...winners.values()].map((candidate) => candidate.id);
}

export function selectCurrentMetricObservationRevisionIds(
  candidates: readonly MetricRevisionIdentity[],
): number[] {
  const winners = new Map<string, MetricRevisionIdentity>();
  const sourcePriority = (source: string) => source === 'feed_service_log' ? 1 : 0;
  for (const candidate of candidates) {
    const key = JSON.stringify([candidate.metricId, candidate.serviceDate]);
    const held = winners.get(key);
    if (
      !held
      || sourcePriority(candidate.source) > sourcePriority(held.source)
      || (
        sourcePriority(candidate.source) === sourcePriority(held.source)
        && (
          candidate.revision > held.revision
          || (candidate.revision === held.revision && candidate.id > held.id)
        )
      )
    ) winners.set(key, candidate);
  }
  return [...winners.values()].map((candidate) => candidate.id);
}

const groupBySource = (identities: readonly { source: string; key: string }[]) => {
  const grouped = new Map<string, Set<string>>();
  for (const identity of identities) {
    const keys = grouped.get(identity.source) ?? new Set<string>();
    keys.add(identity.key);
    grouped.set(identity.source, keys);
  }
  return grouped;
};

async function refreshCurrentEncounters(
  tx: TransactionClient,
  affected: readonly { source: string; key: string }[],
): Promise<void> {
  const groups = groupBySource(affected);
  const candidates: RevisionIdentity[] = [];
  for (const [source, keys] of groups) {
    for (const keyBatch of chunk([...keys])) {
      await tx.serviceEncounterRevision.updateMany({
        where: { source, sourceRecordKey: { in: keyBatch } },
        data: { isCurrent: false },
      });
      const rows = await tx.serviceEncounterRevision.findMany({
        where: {
          source,
          sourceRecordKey: { in: keyBatch },
          import: { status: 'active' },
        },
        select: { id: true, source: true, sourceRecordKey: true, revision: true },
      });
      candidates.push(...rows.map((row) => ({ ...row, key: row.sourceRecordKey })));
    }
  }
  for (const idBatch of chunk(selectCurrentServiceRevisionIds(candidates))) {
    await tx.serviceEncounterRevision.updateMany({ where: { id: { in: idBatch } }, data: { isCurrent: true } });
  }
}

async function refreshCurrentProfiles(
  tx: TransactionClient,
  affected: readonly { source: string; key: string }[],
): Promise<void> {
  const groups = groupBySource(affected);
  const candidates: RevisionIdentity[] = [];
  for (const [source, keys] of groups) {
    for (const keyBatch of chunk([...keys])) {
      await tx.serviceClientProfileRevision.updateMany({
        where: { source, sourceProfileKey: { in: keyBatch } },
        data: { isCurrent: false },
      });
      const rows = await tx.serviceClientProfileRevision.findMany({
        where: {
          source,
          sourceProfileKey: { in: keyBatch },
          import: { status: 'active' },
        },
        select: { id: true, source: true, sourceProfileKey: true, revision: true },
      });
      candidates.push(...rows.map((row) => ({ ...row, key: row.sourceProfileKey })));
    }
  }
  for (const idBatch of chunk(selectCurrentServiceRevisionIds(candidates))) {
    await tx.serviceClientProfileRevision.updateMany({ where: { id: { in: idBatch } }, data: { isCurrent: true } });
  }
}

async function refreshCurrentPersonProfiles(
  tx: TransactionClient,
  affected: readonly { source: string; key: string }[],
): Promise<void> {
  const groups = groupBySource(affected);
  const candidates: RevisionIdentity[] = [];
  for (const [source, keys] of groups) {
    for (const keyBatch of chunk([...keys])) {
      await tx.servicePersonProfileRevision.updateMany({
        where: { source, sourceProfileKey: { in: keyBatch } },
        data: { isCurrent: false },
      });
      const rows = await tx.servicePersonProfileRevision.findMany({
        where: {
          source,
          sourceProfileKey: { in: keyBatch },
          import: { status: 'active' },
        },
        select: { id: true, source: true, sourceProfileKey: true, revision: true },
      });
      candidates.push(...rows.map((row) => ({ ...row, key: row.sourceProfileKey })));
    }
  }
  for (const idBatch of chunk(selectCurrentServiceRevisionIds(candidates))) {
    await tx.servicePersonProfileRevision.updateMany({ where: { id: { in: idBatch } }, data: { isCurrent: true } });
  }
}

export async function refreshCurrentMetricObservations(
  tx: TransactionClient,
  affected: readonly { source: string; key: string }[],
): Promise<void> {
  const groups = groupBySource(affected);
  const identityMap = new Map<string, { metricId: number; serviceDate: string }>();
  for (const [source, keys] of groups) {
    for (const keyBatch of chunk([...keys])) {
      const rows = await tx.serviceMetricObservationRevision.findMany({
        where: { source, sourceRecordKey: { in: keyBatch } },
        select: { metricId: true, serviceDate: true },
      });
      for (const row of rows) {
        identityMap.set(
          JSON.stringify([row.metricId, row.serviceDate]),
          { metricId: row.metricId, serviceDate: row.serviceDate },
        );
      }
    }
  }

  const candidates: MetricRevisionIdentity[] = [];
  for (const identityBatch of chunk([...identityMap.values()], 200)) {
    const identityWhere = identityBatch.map(({ metricId, serviceDate }) => ({ metricId, serviceDate }));
    await tx.serviceMetricObservationRevision.updateMany({
      where: { OR: identityWhere },
      data: { isCurrent: false },
    });
    const rows = await tx.serviceMetricObservationRevision.findMany({
      where: {
        AND: [
          { OR: identityWhere },
          { OR: [{ importId: null }, { import: { status: 'active' } }] },
        ],
      },
      select: { id: true, metricId: true, serviceDate: true, source: true, revision: true },
    });
    candidates.push(...rows);
  }
  for (const idBatch of chunk(selectCurrentMetricObservationRevisionIds(candidates))) {
    await tx.serviceMetricObservationRevision.updateMany({ where: { id: { in: idBatch } }, data: { isCurrent: true } });
  }
}

async function changeServiceImportStatus(
  ids: readonly number[],
  fromStatus: 'active' | 'rolled_back',
  toStatus: 'active' | 'rolled_back',
  actor: string | undefined,
  client: PrismaClient,
): Promise<{ updated: number }> {
  const uniqueIds = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (uniqueIds.length === 0) return { updated: 0 };

  return client.$transaction(async (tx) => {
    const imports = await tx.serviceImport.findMany({
      where: { id: { in: uniqueIds }, status: fromStatus },
      include: {
        encounters: { select: { source: true, sourceRecordKey: true } },
        clientProfiles: { select: { source: true, sourceProfileKey: true } },
        personProfiles: { select: { source: true, sourceProfileKey: true } },
        metricObservations: { select: { source: true, sourceRecordKey: true } },
      },
    });
    if (imports.length === 0) return { updated: 0 };
    const now = new Date();
    await tx.serviceImport.updateMany({
      where: { id: { in: imports.map((record) => record.id) } },
      data: toStatus === 'rolled_back'
        ? { status: toStatus, rolledBackAt: now, rolledBackBy: actor }
        : { status: toStatus, restoredAt: now, restoredBy: actor },
    });

    await refreshCurrentEncounters(tx, imports.flatMap((record) => (
      record.encounters.map((item) => ({ source: item.source, key: item.sourceRecordKey }))
    )));
    await refreshCurrentProfiles(tx, imports.flatMap((record) => (
      record.clientProfiles.map((item) => ({ source: item.source, key: item.sourceProfileKey }))
    )));
    await refreshCurrentPersonProfiles(tx, imports.flatMap((record) => (
      record.personProfiles.map((item) => ({ source: item.source, key: item.sourceProfileKey }))
    )));
    await refreshCurrentMetricObservations(tx, imports.flatMap((record) => (
      record.metricObservations.map((item) => ({ source: item.source, key: item.sourceRecordKey }))
    )));
    return { updated: imports.length };
  });
}

export async function rollbackServiceImports(
  ids: readonly number[],
  actor?: string,
  client: PrismaClient = prisma,
): Promise<{ updated: number }> {
  return changeServiceImportStatus(ids, 'active', 'rolled_back', actor, client);
}

export async function restoreServiceImports(
  ids: readonly number[],
  actor?: string,
  client: PrismaClient = prisma,
): Promise<{ updated: number }> {
  return changeServiceImportStatus(ids, 'rolled_back', 'active', actor, client);
}

export async function findIdenticalActiveServiceImport(
  source: string,
  datasetKind: string,
  fileHash: string,
  client: PrismaClient | TransactionClient = prisma,
) {
  return client.serviceImport.findFirst({
    where: { source, datasetKind, fileHash, status: 'active' },
    select: { id: true, importedAt: true, rowCount: true },
    orderBy: [{ importedAt: 'desc' }, { id: 'desc' }],
  });
}
