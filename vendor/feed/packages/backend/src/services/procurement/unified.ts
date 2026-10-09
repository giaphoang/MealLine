// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

// Normalizes the OFB Order CSV Exporter v2.0.0 unified export.
//
// v2.0.0 replaced the two separate exports (Completed Orders, Agency Pickups)
// with one sparse 26-column CSV covering Warehouse Completed orders plus
// Fresh Alliance Pending and Completed pickups for one date range. Full
// rationale in the extension's own repository:
// `OFB Data Fetch Plugin/docs/unified-export-design.md`, and in
// docs/data-management/procurement-unification-plan.md (D13) and
// fresh-alliance-pending-pickups.md here.
//
// This module does not re-implement row validation. It splits unified rows by
// `Record Type`, reconstructs synthetic CSVs matching the two existing,
// already-tested contracts exactly, and delegates to the existing parsers --
// so a fix to a validation rule in either legacy parser benefits the unified
// path automatically, and there is no risk of a second implementation
// silently disagreeing with the first about what a field means. Row numbers
// in any thrown error or returned warning are translated back to their
// position in the original unified file before reaching the caller.

import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import prisma from '../../db';
import {
  FRESH_ALLIANCE_HEADERS,
  FreshAllianceImportResult,
  ParsedFreshAllianceImport,
  importFreshAllianceCsv,
  parseFreshAllianceCsv,
} from './fresh-alliance';
import {
  OFB_HEADERS,
  ParsedOfbImport,
  ProcurementImportResult,
  importOfbCsv,
  parseOfbCsv,
} from './index';
import { ProcurementImportError, invalidRow, toCsvLine } from './parsing';
import { UNIFIED_HEADERS } from './contracts';

export { UNIFIED_HEADERS } from './contracts';

export const UNIFIED_SCHEMA_VERSION = '2.0';

const RECORD_TYPES = ['warehouse_order', 'agency_pickup'] as const;
type RecordType = typeof RECORD_TYPES[number];

const ERROR_CODE = 'INVALID_UNIFIED_OFB_CSV';

export interface UnifiedImportResult {
  /** `'imported'` if either channel produced a new revision; `'duplicate'` only when both present channels were already current. */
  outcome: 'imported' | 'duplicate';
  rowCount: number;
  rangeStart: string;
  rangeEnd: string;
  /** `null` when the file contained no `warehouse_order` rows at all. */
  warehouse: ProcurementImportResult | null;
  /** `null` when the file contained no `agency_pickup` rows at all. */
  freshAlliance: FreshAllianceImportResult | null;
}

function headerMismatch(actual: string[]): ProcurementImportError {
  return new ProcurementImportError(
    'This file does not match the standardized unified OFB export. Export the range again from Order History and retry the import.',
    'INVALID_UNIFIED_OFB_HEADERS',
    400,
    { expected: UNIFIED_HEADERS, actual }
  );
}

interface SplitRows {
  fileHash: string;
  rowCount: number;
  warehouseBuffer: Buffer | null;
  warehouseRowMap: number[];
  pickupBuffer: Buffer | null;
  pickupRowMap: number[];
  confirmedByReference: Map<string, boolean>;
}

function splitUnifiedCsv(buffer: Buffer): SplitRows {
  if (buffer.length === 0) {
    throw new ProcurementImportError(
      'The selected CSV is empty. Export the OFB range again and retry.',
      'EMPTY_UNIFIED_OFB_CSV'
    );
  }
  if (buffer.toString('utf8').includes('�')) {
    throw new ProcurementImportError(
      'FEED could not read this file as UTF-8. Export the OFB range again and retry.',
      'INVALID_UNIFIED_OFB_ENCODING'
    );
  }

  let records: Record<string, string>[];
  try {
    records = parse(buffer, {
      bom: true,
      columns: (headers: string[]) => {
        if (
          headers.length !== UNIFIED_HEADERS.length ||
          headers.some((header, index) => header !== UNIFIED_HEADERS[index])
        ) {
          throw headerMismatch(headers);
        }
        return headers;
      },
      skip_empty_lines: true,
      relax_column_count: false,
      trim: false,
    });
  } catch (error) {
    if (error instanceof ProcurementImportError) throw error;
    throw new ProcurementImportError(
      'FEED could not read this CSV. Export the OFB range again and retry.',
      'MALFORMED_UNIFIED_OFB_CSV',
      400,
      error instanceof Error ? error.message : undefined
    );
  }

  if (records.length === 0) {
    throw new ProcurementImportError(
      'The selected CSV contains no order or pickup lines. Choose a unified OFB export with data.',
      'EMPTY_UNIFIED_OFB_CSV'
    );
  }

  const warehouseLines: string[] = [toCsvLine([...OFB_HEADERS])];
  const warehouseRowMap: number[] = [];
  const pickupLines: string[] = [toCsvLine([...FRESH_ALLIANCE_HEADERS])];
  const pickupRowMap: number[] = [];
  const confirmedByReference = new Map<string, boolean>();

  records.forEach((record, index) => {
    const rowNumber = index + 2;

    if (record['Schema Version'] !== UNIFIED_SCHEMA_VERSION) {
      throw new ProcurementImportError(
        `Row ${rowNumber} reports export schema version "${record['Schema Version']}", which this version of FEED does not understand. Update FEED, or re-export with a compatible version of the OFB extension.`,
        'UNSUPPORTED_UNIFIED_SCHEMA_VERSION',
        400,
        { rowNumber, schemaVersion: record['Schema Version'] }
      );
    }

    const recordType = record['Record Type'];
    if (!(RECORD_TYPES as readonly string[]).includes(recordType)) {
      invalidRow(rowNumber, 'Record Type', 'Use the standardized unified OFB CSV exporter.', ERROR_CODE);
    }

    const confirmedRaw = record.Confirmed;
    if (confirmedRaw !== 'Yes' && confirmedRaw !== 'No') {
      invalidRow(rowNumber, 'Confirmed', 'Use the standardized unified OFB CSV exporter.', ERROR_CODE);
    }
    const confirmed = confirmedRaw === 'Yes';
    const sourceReference = record['Source Reference'];

    if (recordType === 'warehouse_order') {
      // Warehouse only ever exports Completed data -- see
      // procurement-unification-plan.md (D13). A warehouse row reporting
      // anything else means this file does not match what the exporter is
      // supposed to produce; importing it as though it were a real
      // observation would be exactly the request/observation conflation
      // that decision exists to prevent.
      if (!confirmed) {
        throw new ProcurementImportError(
          `Row ${rowNumber} is a Warehouse order marked unconfirmed. Warehouse orders are only ever exported once confirmed; this file may not be a standard unified export. Export the range again and retry.`,
          'UNCONFIRMED_WAREHOUSE_ORDER',
          400,
          { rowNumber, sourceReference }
        );
      }
      warehouseLines.push(toCsvLine([
        record.Date, record.Period, sourceReference, record['Product #'],
        record['Product Description'], record.Category, record.Qty, record.Weight,
        record['Unit Price'], record['Price Total'], record['Service Fee'], record['Grants Applied'],
      ]));
      warehouseRowMap.push(rowNumber);
    } else {
      confirmedByReference.set(sourceReference, confirmed);
      pickupLines.push(toCsvLine([
        record.Date, record.Period, record['Pickup Time'], record['Pickup ID'],
        sourceReference, record['Pickup Line ID'], record['Donor Code'], record['Donor Name'],
        record['Product #'], record['Product Description'], record.Category,
        record['Fresh Alliance Category'], record.Qty, record.Weight,
        record['Received Qty'], record['Received Weight'], record.Temperature,
        record['Submitted Date/Time'], record['Donor Value Per Pound'],
      ]));
      pickupRowMap.push(rowNumber);
    }
  });

  return {
    fileHash: createHash('sha256').update(buffer).digest('hex'),
    rowCount: records.length,
    warehouseBuffer: warehouseRowMap.length > 0
      ? Buffer.from(warehouseLines.join('\r\n'), 'utf8')
      : null,
    warehouseRowMap,
    pickupBuffer: pickupRowMap.length > 0
      ? Buffer.from(pickupLines.join('\r\n'), 'utf8')
      : null,
    pickupRowMap,
    confirmedByReference,
  };
}

/** Maps a reconstructed sub-CSV's data-row number back to its row in the original unified file. */
function translateRowNumber(rowNumber: number, rowMap: number[]): number {
  return rowMap[rowNumber - 2] ?? rowNumber;
}

const ROW_PATTERN = /\bRow (\d+)\b/g;
const ROWS_PAIR_PATTERN = /\brows (\d+) and (\d+)\b/g;

function translateMessage(message: string, rowMap: number[]): string {
  return message
    .replace(ROW_PATTERN, (_match, digits: string) => `Row ${translateRowNumber(Number(digits), rowMap)}`)
    .replace(
      ROWS_PAIR_PATTERN,
      (_match, first: string, second: string) =>
        `rows ${translateRowNumber(Number(first), rowMap)} and ${translateRowNumber(Number(second), rowMap)}`
    );
}

function translateWarnings<W extends { message: string; rowNumbers: number[] }>(
  warnings: W[],
  rowMap: number[]
): W[] {
  return warnings.map((warning) => ({
    ...warning,
    message: translateMessage(warning.message, rowMap),
    rowNumbers: warning.rowNumbers.map((rowNumber) => translateRowNumber(rowNumber, rowMap)),
  }));
}

function translateErrorDetails(details: unknown, rowMap: number[]): unknown {
  if (!details || typeof details !== 'object') return details;
  const copy: Record<string, unknown> = { ...(details as Record<string, unknown>) };
  if (typeof copy.rowNumber === 'number') {
    copy.rowNumber = translateRowNumber(copy.rowNumber, rowMap);
  }
  if (Array.isArray(copy.rowNumbers)) {
    copy.rowNumbers = (copy.rowNumbers as unknown[]).map((value) =>
      typeof value === 'number' ? translateRowNumber(value, rowMap) : value
    );
  }
  return copy;
}

/**
 * Runs a delegated sub-parse or sub-import and rewrites every row number it
 * reports -- in thrown errors and in returned warnings alike -- from the
 * reconstructed sub-CSV's row positions back to the caller's original unified
 * file. Without this, a validation message would point at the wrong line of
 * the file the uploader is actually looking at. `run` may be sync (the pure
 * parsers) or async (the persisting importers); `await` on a non-Promise
 * value resolves immediately, so one helper covers both.
 */
async function runTranslated<W extends { message: string; rowNumbers: number[] }, T extends { warnings: W[] }>(
  run: () => T | Promise<T>,
  rowMap: number[]
): Promise<T> {
  try {
    const result = await run();
    return { ...result, warnings: translateWarnings(result.warnings, rowMap) };
  } catch (error) {
    if (error instanceof ProcurementImportError) {
      throw new ProcurementImportError(
        translateMessage(error.message, rowMap),
        error.code,
        error.statusCode,
        translateErrorDetails(error.details, rowMap)
      );
    }
    throw error;
  }
}

export interface ParsedUnifiedImport {
  fileHash: string;
  rowCount: number;
  rangeStart: string;
  rangeEnd: string;
  /** `null` when the file contained no `warehouse_order` rows at all. */
  warehouse: ParsedOfbImport | null;
  /** `null` when the file contained no `agency_pickup` rows at all. */
  freshAlliance: ParsedFreshAllianceImport | null;
}

function rangeAcross(
  warehouse: { rangeStart: string; rangeEnd: string } | null,
  freshAlliance: { rangeStart: string; rangeEnd: string } | null
): { rangeStart: string; rangeEnd: string } {
  // At least one argument is non-null: splitUnifiedCsv rejects a file with
  // zero rows, and every row is either warehouse_order or agency_pickup.
  const starts = [warehouse?.rangeStart, freshAlliance?.rangeStart].filter((value): value is string => Boolean(value));
  const ends = [warehouse?.rangeEnd, freshAlliance?.rangeEnd].filter((value): value is string => Boolean(value));
  return {
    rangeStart: starts.reduce((earliest, value) => (value < earliest ? value : earliest)),
    rangeEnd: ends.reduce((latest, value) => (value > latest ? value : latest)),
  };
}

/** Pure normalization, no persistence -- the unified-format counterpart to `parseOfbCsv`/`parseFreshAllianceCsv`. */
export function parseUnifiedOfbCsv(buffer: Buffer): ParsedUnifiedImport {
  const split = splitUnifiedCsv(buffer);

  const warehouse = split.warehouseBuffer
    ? translateParsedSync(() => parseOfbCsv(split.warehouseBuffer!), split.warehouseRowMap)
    : null;
  const freshAlliance = split.pickupBuffer
    ? translateParsedSync(
        () => parseFreshAllianceCsv(split.pickupBuffer!, { confirmedByReference: split.confirmedByReference }),
        split.pickupRowMap
      )
    : null;

  return {
    fileHash: split.fileHash,
    rowCount: split.rowCount,
    ...rangeAcross(warehouse, freshAlliance),
    warehouse,
    freshAlliance,
  };
}

/** Synchronous counterpart to `runTranslated`, for the pure parsers. */
function translateParsedSync<W extends { message: string; rowNumbers: number[] }, T extends { warnings: W[] }>(
  run: () => T,
  rowMap: number[]
): T {
  try {
    const result = run();
    return { ...result, warnings: translateWarnings(result.warnings, rowMap) };
  } catch (error) {
    if (error instanceof ProcurementImportError) {
      throw new ProcurementImportError(
        translateMessage(error.message, rowMap),
        error.code,
        error.statusCode,
        translateErrorDetails(error.details, rowMap)
      );
    }
    throw error;
  }
}

export async function importUnifiedOfbCsv(
  buffer: Buffer,
  importedBy?: string,
  client = prisma
): Promise<UnifiedImportResult> {
  const split = splitUnifiedCsv(buffer);

  // Both resulting ProcurementImport rows carry the same hash of the
  // original unified file (not the reconstructed sub-buffers, which differ
  // from each other), so the two permanently-separate source namespaces
  // (D3) that one upload produces can be traced back to that one upload.
  const warehouse = split.warehouseBuffer
    ? await runTranslated(
        () => importOfbCsv(split.warehouseBuffer!, importedBy, client, { unifiedFileHash: split.fileHash }),
        split.warehouseRowMap
      )
    : null;
  const freshAlliance = split.pickupBuffer
    ? await runTranslated(
        () => importFreshAllianceCsv(
          split.pickupBuffer!,
          importedBy,
          client,
          { confirmedByReference: split.confirmedByReference },
          { unifiedFileHash: split.fileHash }
        ),
        split.pickupRowMap
      )
    : null;

  const outcome: 'imported' | 'duplicate' =
    warehouse?.outcome === 'imported' || freshAlliance?.outcome === 'imported'
      ? 'imported'
      : 'duplicate';

  return {
    outcome,
    rowCount: split.rowCount,
    ...rangeAcross(warehouse, freshAlliance),
    warehouse,
    freshAlliance,
  };
}
