// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

/**
 * LOTTO is a rolling source while FEED is the long-term record. Restoring an
 * older Service backup must therefore never delete a session revision that is
 * already in FEED: LOTTO may have aged it out of its source window, making the
 * deletion permanent.
 *
 * This module merges the immutable LOTTO graph before the scratch database is
 * rewritten. It is deliberately pure so collision behavior is cheap to test.
 */

type Row = Record<string, unknown>;
type Data = Record<string, unknown[]>;

export const MONOTONIC_LOTTO_TABLES = [
  'LottoQueueSyncRun',
  'LottoQueueSessionRevision',
  'LottoQueueTicketObservation',
  'LottoQueueQualityIssue',
  'LottoQueueSessionResolution',
] as const;

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Row)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
};

const comparable = (row: Row, ignored: readonly string[] = []): string => {
  const copy = { ...row };
  for (const key of ignored) delete copy[key];
  return JSON.stringify(canonicalize(copy));
};

const keyPart = (row: Row, field: string): string => String(row[field] ?? '');

const naturalKeys = (table: string, row: Row): string[] => {
  switch (table) {
    case 'ServiceImport':
    case 'LottoQueueSyncRun':
      return [`id:${keyPart(row, 'id')}`];
    case 'LottoQueueSessionRevision':
      return [
        `id:${keyPart(row, 'id')}`,
        `summary:${keyPart(row, 'summaryId')}`,
        `revision:${keyPart(row, 'sessionId')}:${keyPart(row, 'revision')}`,
        `content:${keyPart(row, 'sessionId')}:${keyPart(row, 'contentHash')}`,
      ];
    case 'LottoQueueTicketObservation':
      return [
        `id:${keyPart(row, 'id')}`,
        `ticket:${keyPart(row, 'sessionRevisionId')}:${keyPart(row, 'sequence')}`,
      ];
    case 'LottoQueueQualityIssue':
      return [
        `id:${keyPart(row, 'id')}`,
        `issue:${keyPart(row, 'sessionRevisionId')}:${keyPart(row, 'code')}`,
      ];
    case 'LottoQueueSessionResolution':
      return [
        `id:${keyPart(row, 'id')}`,
        `resolution:${keyPart(row, 'sessionId')}:${keyPart(row, 'revision')}`,
      ];
    default:
      throw new Error(`No monotonic LOTTO identity contract exists for ${table}.`);
  }
};

const compatibleMutableRow = (table: string, left: Row, right: Row): boolean => {
  if (table === 'LottoQueueSyncRun') {
    return left.id === right.id
      && left.mode === right.mode
      && comparable({ startedAt: left.startedAt }) === comparable({ startedAt: right.startedAt });
  }
  if (table === 'ServiceImport') {
    return left.id === right.id
      && left.source === right.source
      && left.datasetKind === right.datasetKind
      && left.fileHash === right.fileHash
      && comparable({ importedAt: left.importedAt }) === comparable({ importedAt: right.importedAt });
  }
  return false;
};

const mergeTable = (table: string, backupRows: unknown[], liveRows: unknown[]): Row[] => {
  const merged = (backupRows as Row[]).map(row => ({ ...row }));
  const keyToIndex = new Map<string, number>();

  for (const [index, row] of merged.entries()) {
    for (const key of naturalKeys(table, row)) {
      if (keyToIndex.has(key)) {
        throw new Error(`LOTTO restore conflict in ${table}: backup contains duplicate ${key}.`);
      }
      keyToIndex.set(key, index);
    }
  }

  for (const live of liveRows as Row[]) {
    const matches = new Set(
      naturalKeys(table, live)
        .map(key => keyToIndex.get(key))
        .filter((index): index is number => index !== undefined)
    );

    if (matches.size === 0) {
      const index = merged.length;
      merged.push({ ...live });
      for (const key of naturalKeys(table, live)) keyToIndex.set(key, index);
      continue;
    }

    if (matches.size > 1) {
      throw new Error(
        `LOTTO restore conflict in ${table}: one live row matches multiple backup identities.`
      );
    }

    const index = [...matches][0];
    const backup = merged[index];
    const ignored = table === 'LottoQueueSessionRevision' ? ['isCurrent'] : [];
    const same = comparable(backup, ignored) === comparable(live, ignored);
    if (!same && !compatibleMutableRow(table, backup, live)) {
      throw new Error(
        `LOTTO restore conflict in ${table}: identity ${naturalKeys(table, live)[0]} has different content. ` +
          'The live database has not been touched.'
      );
    }

    // Live synchronization/import rows may have advanced from running to
    // completed or active to rolled back since the backup. The live row is the
    // later observation. Immutable rows only differ in the derived isCurrent
    // flag, which is recomputed below.
    merged[index] = { ...live };
  }

  return merged;
};
export const mergeMonotonicLottoHistory = (
  backupData: Data,
  liveData: Data
): Record<string, Row[]> => {
  const liveSessions = (liveData.LottoQueueSessionRevision ?? []) as Row[];
  const retainedImportIds = new Set(
    liveSessions
      .map(row => row.importId)
      .filter((id): id is number => typeof id === 'number')
  );
  const liveLottoImports = (liveData.ServiceImport ?? [])
    .filter(row => retainedImportIds.has((row as Row).id as number));

  const merged: Record<string, Row[]> = {
    ServiceImport: mergeTable(
      'ServiceImport',
      backupData.ServiceImport ?? [],
      liveLottoImports
    ),
  };

  for (const table of MONOTONIC_LOTTO_TABLES) {
    merged[table] = mergeTable(table, backupData[table] ?? [], liveData[table] ?? []);
  }

  const greatestRevision = new Map<string, number>();
  for (const row of merged.LottoQueueSessionRevision) {
    const sessionId = keyPart(row, 'sessionId');
    const revision = Number(row.revision);
    greatestRevision.set(sessionId, Math.max(greatestRevision.get(sessionId) ?? 0, revision));
  }
  merged.LottoQueueSessionRevision = merged.LottoQueueSessionRevision.map(row => ({
    ...row,
    isCurrent: Number(row.revision) === greatestRevision.get(keyPart(row, 'sessionId')),
  }));

  return merged;
};
