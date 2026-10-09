// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { PrismaClient } from '@prisma/client';
import prisma from '../../db';

export type ImportHistoryDomain = 'procurement' | 'service';
export type ImportHistoryStatus = 'active' | 'rolled_back';

export interface ImportHistoryProcurementWarning {
  code: string;
  message: string;
  deliveryDate: string;
  rowNumbers: number[];
}

export interface ImportHistoryOrder {
  id: number;
  sourceOrderReference: string;
  eventKind: string;
  deliveryDate: string;
  revision: number;
  donorCode: string | null;
  donorName: string | null;
  warningCodes: string[];
  isCurrent: boolean;
  lineCount: number;
}

export interface ImportHistoryQualityGroup {
  code: string;
  severity: string;
  count: number;
}

interface ImportHistoryBase {
  key: string;
  id: number;
  domain: ImportHistoryDomain;
  source: string;
  datasetKind: string;
  status: ImportHistoryStatus;
  schemaVersion: number;
  sourceRowCount: number;
  recordCount: number;
  recordUnit: 'events' | 'visits' | 'observations' | 'profiles' | 'records';
  warningCount: number;
  rangeStart: string | null;
  rangeEnd: string | null;
  importedAt: string;
  rolledBackAt: string | null;
  restoredAt: string | null;
}

export interface ProcurementImportHistoryRecord extends ImportHistoryBase {
  domain: 'procurement';
  datasetKind: 'orders';
  relatedUploadKey: string | null;
  details: {
    kind: 'procurement';
    warnings: ImportHistoryProcurementWarning[];
    orders: ImportHistoryOrder[];
  };
}

export interface ServiceImportHistoryRecord extends ImportHistoryBase {
  domain: 'service';
  relatedUploadKey: null;
  details: {
    kind: 'service';
    encounterRevisionCount: number;
    clientProfileRevisionCount: number;
    personProfileRevisionCount: number;
    metricObservationRevisionCount: number;
    lottoSessionRevisionCount: number;
    qualityIssueCount: number;
    qualityGroups: ImportHistoryQualityGroup[];
  };
}

export type ImportHistoryRecord = ProcurementImportHistoryRecord | ServiceImportHistoryRecord;

export interface DataManagementCoverageWindow {
  recordCount: number;
  rangeStart: string | null;
  rangeEnd: string | null;
}

export interface DataManagementCoverage {
  link2feedVisits: DataManagementCoverageWindow;
  simcVisits: DataManagementCoverageWindow;
  lottoQueueSessions: DataManagementCoverageWindow;
}

const FORMAL_VISIT_KINDS = [
  'identified_household_encounter',
  'identity_unavailable_encounter',
] as const;

/**
 * Current active coverage for the Data Management summary.
 *
 * Import-history row counts describe immutable revisions written by each
 * import, so adding them would overstate coverage after an overlapping import.
 * These aggregates count only the current active facts instead.
 */
export async function getDataManagementCoverage(
  client: PrismaClient = prisma,
): Promise<DataManagementCoverage> {
  const visitCoverage = async (source: 'link2feed' | 'simc') => {
    const result = await client.serviceEncounterRevision.aggregate({
      where: {
        source,
        isCurrent: true,
        recordKind: { in: [...FORMAL_VISIT_KINDS] },
        import: { status: 'active' },
      },
      _count: { _all: true },
      _min: { serviceDate: true },
      _max: { serviceDate: true },
    });
    return {
      recordCount: result._count._all,
      rangeStart: result._min.serviceDate,
      rangeEnd: result._max.serviceDate,
    };
  };

  const [link2feedVisits, simcVisits, lottoResult] = await Promise.all([
    visitCoverage('link2feed'),
    visitCoverage('simc'),
    client.lottoQueueSessionRevision.aggregate({
      where: {
        isCurrent: true,
        OR: [
          { importId: null },
          { import: { status: 'active' } },
        ],
      },
      _count: { _all: true },
      _min: { serviceDate: true },
      _max: { serviceDate: true },
    }),
  ]);

  return {
    link2feedVisits,
    simcVisits,
    lottoQueueSessions: {
      recordCount: lottoResult._count._all,
      rangeStart: lottoResult._min.serviceDate,
      rangeEnd: lottoResult._max.serviceDate,
    },
  };
}

const safeProcurementWarnings = (value: unknown): ImportHistoryProcurementWarning[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((warning): warning is ImportHistoryProcurementWarning => {
    if (!warning || typeof warning !== 'object') return false;
    const candidate = warning as Record<string, unknown>;
    return typeof candidate.code === 'string'
      && typeof candidate.message === 'string'
      && typeof candidate.deliveryDate === 'string'
      && Array.isArray(candidate.rowNumbers);
  });
};

const safeStringArray = (value: unknown): string[] => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
);

const serviceRecordSummary = (counts: {
  encounters: number;
  clientProfiles: number;
  personProfiles: number;
  metricObservations: number;
  lottoSessions: number;
}): Pick<ImportHistoryBase, 'recordCount' | 'recordUnit'> => {
  if (counts.encounters > 0) return { recordCount: counts.encounters, recordUnit: 'visits' };
  if (counts.lottoSessions > 0) return { recordCount: counts.lottoSessions, recordUnit: 'records' };
  if (counts.metricObservations > 0) {
    return { recordCount: counts.metricObservations, recordUnit: 'observations' };
  }
  const profiles = counts.personProfiles || counts.clientProfiles;
  if (profiles > 0) return { recordCount: profiles, recordUnit: 'profiles' };
  return { recordCount: 0, recordUnit: 'records' };
};

/**
 * Read-only projection for the organization-wide Data Management history.
 * Procurement and Service retain their own fact models and lifecycle rules;
 * only their durable provenance is normalized for this list.
 */
export async function listImportHistory(client: PrismaClient = prisma): Promise<ImportHistoryRecord[]> {
  const [procurementImports, serviceImports] = await Promise.all([
    client.procurementImport.findMany({
      where: { status: { in: ['active', 'rolled_back'] } },
      orderBy: [{ importedAt: 'desc' }, { id: 'desc' }],
      include: {
        orders: {
          select: {
            id: true,
            sourceOrderReference: true,
            eventKind: true,
            deliveryDate: true,
            revision: true,
            donorCode: true,
            donorName: true,
            warningCodes: true,
            isCurrent: true,
            _count: { select: { lines: true } },
          },
          orderBy: { deliveryDate: 'asc' },
        },
      },
    }),
    client.serviceImport.findMany({
      where: { status: { in: ['active', 'rolled_back'] } },
      orderBy: [{ importedAt: 'desc' }, { id: 'desc' }],
      include: {
        _count: {
          select: {
            encounters: true,
            clientProfiles: true,
            personProfiles: true,
            metricObservations: true,
            qualityIssues: true,
            lottoSessions: true,
          },
        },
        qualityIssues: {
          select: { code: true, severity: true },
        },
        lottoSessions: {
          select: { qualityIssues: { select: { code: true, severity: true } } },
        },
      },
    }),
  ]);

  const procurement: ProcurementImportHistoryRecord[] = procurementImports.map((record) => ({
    key: `procurement:${record.id}`,
    id: record.id,
    domain: 'procurement',
    source: record.source,
    datasetKind: 'orders',
    status: record.status as ImportHistoryStatus,
    schemaVersion: record.schemaVersion,
    sourceRowCount: record.rowCount,
    recordCount: record.orderCount,
    recordUnit: 'events',
    warningCount: record.warningCount,
    rangeStart: record.rangeStart,
    rangeEnd: record.rangeEnd,
    importedAt: record.importedAt.toISOString(),
    rolledBackAt: record.rolledBackAt?.toISOString() ?? null,
    restoredAt: record.restoredAt?.toISOString() ?? null,
    relatedUploadKey: record.unifiedFileHash,
    details: {
      kind: 'procurement',
      warnings: safeProcurementWarnings(record.warnings),
      orders: record.orders.map((order) => ({
        id: order.id,
        sourceOrderReference: order.sourceOrderReference,
        eventKind: order.eventKind,
        deliveryDate: order.deliveryDate,
        revision: order.revision,
        donorCode: order.donorCode,
        donorName: order.donorName,
        warningCodes: safeStringArray(order.warningCodes),
        isCurrent: order.isCurrent,
        lineCount: order._count.lines,
      })),
    },
  }));

  const service: ServiceImportHistoryRecord[] = serviceImports.map((record) => {
    const groups = new Map<string, ImportHistoryQualityGroup>();
    for (const issue of record.qualityIssues) {
      const key = JSON.stringify([issue.code, issue.severity]);
      const held = groups.get(key);
      groups.set(key, {
        code: issue.code,
        severity: issue.severity,
        count: (held?.count ?? 0) + 1,
      });
    }
    const lottoSessions = record.lottoSessions ?? [];
    for (const session of lottoSessions) {
      for (const issue of session.qualityIssues) {
        const key = JSON.stringify([issue.code, issue.severity]);
        const held = groups.get(key);
        groups.set(key, { code: issue.code, severity: issue.severity, count: (held?.count ?? 0) + 1 });
      }
    }
    const summary = serviceRecordSummary(record._count);
    return {
      key: `service:${record.id}`,
      id: record.id,
      domain: 'service',
      source: record.source,
      datasetKind: record.datasetKind,
      status: record.status as ImportHistoryStatus,
      schemaVersion: record.schemaVersion,
      sourceRowCount: record.rowCount,
      ...summary,
      warningCount: record.warningCount,
      rangeStart: record.rangeStart,
      rangeEnd: record.rangeEnd,
      importedAt: record.importedAt.toISOString(),
      rolledBackAt: record.rolledBackAt?.toISOString() ?? null,
      restoredAt: record.restoredAt?.toISOString() ?? null,
      relatedUploadKey: null,
      details: {
        kind: 'service' as const,
        encounterRevisionCount: record._count.encounters,
        clientProfileRevisionCount: record._count.clientProfiles,
        personProfileRevisionCount: record._count.personProfiles,
        metricObservationRevisionCount: record._count.metricObservations,
        lottoSessionRevisionCount: record._count.lottoSessions ?? 0,
        qualityIssueCount: record._count.qualityIssues
          + lottoSessions.reduce((sum, session) => sum + session.qualityIssues.length, 0),
        qualityGroups: [...groups.values()].sort((left, right) => (
          right.count - left.count || left.code.localeCompare(right.code)
        )),
      },
    };
  });

  return [...procurement, ...service].sort((left, right) => (
    right.importedAt.localeCompare(left.importedAt)
      || right.id - left.id
      || left.domain.localeCompare(right.domain)
  ));
}
