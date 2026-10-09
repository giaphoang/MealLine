// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import {
  ARTIFACT_KIND,
  INCLUDED_TABLES,
  TABLE_CONTRACT_VERSION,
} from '../backup/table-contract';
import { checksumOf, type BackupManifest } from '../backup/sanitized-backup';
import { RESTORE_UNITS, type UnitId } from './restore-units';

/**
 * Validate an uploaded artifact **before** anything touches disk.
 *
 * Everything here is pure: parse, check, report. The restore contract requires
 * validating "artifact type, manifest, checksums, FEED/schema version, and
 * table contract before touching live data", and keeping that as a function of
 * a string makes it cheap to test exhaustively and impossible to half-apply.
 *
 * ## Version contract
 *
 * `tableContractVersion` is the gate; `schemaVersion` is provenance. Most
 * migrations do not touch exported tables, so refusing on a migration-name
 * mismatch would reject valid artifacts and teach people to bypass the check.
 * A newer contract than this build understands is refused, naming the problem.
 * An older one is adapted by a reader for that version.
 */

/** Contract versions this build can read. Add a reader before adding a number. */
export const SUPPORTED_CONTRACT_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

export interface ArtifactProblem {
  code:
    | 'NOT_JSON'
    | 'NOT_A_FEED_BACKUP'
    | 'CONTRACT_TOO_NEW'
    | 'CONTRACT_UNSUPPORTED'
    | 'CHECKSUM_MISMATCH'
    | 'ROW_COUNT_MISMATCH'
    | 'MALFORMED_DATA';
  message: string;
}

export interface ArtifactSummary {
  manifest: BackupManifest;
  /** Units this artifact can actually supply, given the tables it carries. */
  availableUnits: UnitId[];
  /** Per-unit row totals, so the confirmation can say what is coming. */
  rowsByUnit: Record<string, number>;
  /** Tables present in the file but unknown to this build — reported, not fatal. */
  unknownTables: string[];
  /** Notes worth surfacing that are not refusals (e.g. schemaVersion drift). */
  notes: string[];
}

export type ReadResult =
  | { ok: true; artifact: { manifest: BackupManifest; data: Record<string, unknown[]> }; summary: ArtifactSummary }
  | { ok: false; problem: ArtifactProblem };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Adapt an older contract version onto the current shape.
 *
 * Per the design: do not migrate the artifact on disk — ship a reader per
 * contract version, with defaults for columns added since living in the reader,
 * where somebody looking for them would think to look.
 *
 * v1 → v2: v1 excluded `AIConfiguration` wholesale. There is nothing to
 * back-fill; the table is simply absent, and a restore from a v1 file leaves AI
 * configuration untouched rather than clearing it.
 *
 * v2 → v3: v2 predates Service tables. Missing Service sections likewise mean
 * that Service is unavailable as a restore unit; existing Service data is not
 * cleared by selecting another unit from the older artifact.
 *
 * v3 → v4: v3 contains the first Service fact family but predates capacity
 * plans and persistent quality evidence. Those absent sections stay absent;
 * no policy or operator decision is inferred during restore.
 *
 * v4 → v5: v4 Service encounters predate `clientVisitStatus`. Prisma applies
 * the schema default `unknown` when those rows are restored; a reader must not
 * infer first/returning status from any other field.
 *
 * v5 → v6: v5 predates SIMC person identities, person profiles, and encounter
 * membership. Those sections remain unavailable in older artifacts; FEED does
 * not derive people from household counts during restore.
 *
 * v6 → v7: v6 operational observations predate optional source metric labels
 * and workbook-cell provenance. Prisma leaves those nullable fields empty for
 * older artifacts; FEED never invents workbook provenance during restore.
 *
 * v7 → v8: v7 operational observations predate intentional clear revisions.
 * Prisma applies the schema default `recorded` to restored older rows; FEED
 * does not reinterpret any historical value as a clear.
 *
 * v8 → v9: v8 Service metric revisions predate user-selected icons. Prisma
 * applies the neutral `package` default; FEED does not infer semantics while
 * restoring an older organization-data artifact.
 *
 * v10 → v11: v10 predates the authority-neutralized staff roster and LOTTO
 * synchronization-run provenance. Their absence leaves those restore units
 * unavailable; no account or run is manufactured from older artifacts.
 *
 * v11 → v12: v11 predates organization branding and database-backed brand
 * assets. Their absent sections are preserved in the destination rather than
 * being interpreted as an instruction to remove the destination identity.
 */
const adapt = (
  version: number,
  data: Record<string, unknown[]>
): Record<string, unknown[]> => {
  if (version >= 2) return data;
  return { ...data };
};

export const readArtifact = (raw: string): ReadResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      problem: {
        code: 'NOT_JSON',
        message:
          'That file is not valid JSON. Upload the .json file FEED produced ' +
          'from Data Management → Database → Download Backup.',
      },
    };
  }

  if (!isRecord(parsed) || !isRecord(parsed.manifest) || !isRecord(parsed.data)) {
    return {
      ok: false,
      problem: {
        code: 'NOT_A_FEED_BACKUP',
        message:
          'That file is JSON, but not a FEED backup — it has no manifest and data. ' +
          'Upload the file FEED produced from Download Backup.',
      },
    };
  }

  const manifest = parsed.manifest as unknown as BackupManifest;

  if (manifest.artifact !== ARTIFACT_KIND) {
    return {
      ok: false,
      problem: {
        code: 'NOT_A_FEED_BACKUP',
        message:
          `That file declares itself as "${String(manifest.artifact)}", not a FEED backup. ` +
          'Upload the file FEED produced from Download Backup.',
      },
    };
  }

  const version = Number(manifest.tableContractVersion);

  if (!Number.isFinite(version)) {
    return {
      ok: false,
      problem: {
        code: 'CONTRACT_UNSUPPORTED',
        message: 'That backup does not declare a table contract version, so it cannot be read safely.',
      },
    };
  }

  if (version > TABLE_CONTRACT_VERSION) {
    return {
      ok: false,
      problem: {
        code: 'CONTRACT_TOO_NEW',
        message:
          `That backup was made by a newer version of FEED (backup format ${version}; ` +
          `this version reads up to ${TABLE_CONTRACT_VERSION}). ` +
          `Update FEED to at least the version that wrote it — the file says ${manifest.feedVersion ?? 'unknown'} — then try again.`,
      },
    };
  }

  if (!SUPPORTED_CONTRACT_VERSIONS.includes(version as typeof SUPPORTED_CONTRACT_VERSIONS[number])) {
    return {
      ok: false,
      problem: {
        code: 'CONTRACT_UNSUPPORTED',
        message: `This version of FEED has no reader for backup format ${version}.`,
      },
    };
  }

  const rawData = parsed.data as Record<string, unknown>;

  for (const [table, rows] of Object.entries(rawData)) {
    if (!Array.isArray(rows)) {
      return {
        ok: false,
        problem: {
          code: 'MALFORMED_DATA',
          message: `The backup's "${table}" section is not a list of records, so the file is damaged.`,
        },
      };
    }
  }

  const data = adapt(version, rawData as Record<string, unknown[]>);

  // Checksum before row counts: a mismatch here means the file changed after
  // FEED wrote it, which makes every other check untrustworthy.
  if (manifest.checksum && checksumOf(data) !== manifest.checksum) {
    return {
      ok: false,
      problem: {
        code: 'CHECKSUM_MISMATCH',
        message:
          'That backup has been altered since FEED created it — its contents no longer match ' +
          'its own checksum. Restoring it could corrupt your data, so it has been refused. ' +
          'Use an unmodified backup file.',
      },
    };
  }

  const mismatched: string[] = [];
  for (const [table, expected] of Object.entries(manifest.rowCounts ?? {})) {
    const actual = data[table]?.length ?? 0;
    if (actual !== expected) mismatched.push(`${table} (expected ${expected}, found ${actual})`);
  }
  if (mismatched.length) {
    return {
      ok: false,
      problem: {
        code: 'ROW_COUNT_MISMATCH',
        message: `That backup is internally inconsistent: ${mismatched.join('; ')}.`,
      },
    };
  }

  const known = new Set<string>(INCLUDED_TABLES);
  const unknownTables = Object.keys(data).filter(table => !known.has(table));

  const availableUnits: UnitId[] = [];
  const rowsByUnit: Record<string, number> = {};
  for (const unit of RESTORE_UNITS) {
    const present = unit.tables.filter(table => table in data);
    if (!present.length) continue;
    availableUnits.push(unit.id);
    rowsByUnit[unit.id] = present.reduce((sum, table) => sum + (data[table]?.length ?? 0), 0);
  }

  const notes: string[] = [];
  if (version < TABLE_CONTRACT_VERSION) {
    notes.push(
      `This backup uses format ${version}; the current format is ${TABLE_CONTRACT_VERSION}. ` +
        'It will be read with the older reader.'
    );
  }
  if (unknownTables.length) {
    notes.push(
      `Ignoring ${unknownTables.length} section(s) this version does not recognise: ${unknownTables.join(', ')}.`
    );
  }

  return {
    ok: true,
    artifact: { manifest, data },
    summary: { manifest, availableUnits, rowsByUnit, unknownTables, notes },
  };
};
