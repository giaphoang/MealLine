// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

// Primitives shared by every OFB export parser. Both the Completed Orders
// ledger and the Agency Pickups export are produced by the same exporter and
// therefore share date, numeric, and product-family contracts. Keeping these in
// one place prevents the two parsers from drifting apart — a drift whose
// failure mode is silently wrong normalization rather than a loud error.

export const ACQUISITION_CLASSES = ['DONATED', 'PURCH-DON', 'GOVERNMENT', 'PURCHASED'] as const;
export type AcquisitionClass = typeof ACQUISITION_CLASSES[number];

// The OFB portal publishes the same supply through two exports. Each persists
// under its own source namespace so references can never collide and each has
// an independent revision lineage. Both are the same source *system*, so they
// share one supplier product catalog under `OFB_SOURCE`.
export const OFB_SOURCE = 'ofb';
export const FRESH_ALLIANCE_SOURCE = 'ofb_pickup';

// Pre-Primarius community donation history, curated by the agency from its own
// records (D16). Its own namespace for the same reason the two OFB exports have
// theirs -- independent lineage and rollback, no reference collision -- and so
// it can never be mistaken for something OFB reported. Monthly grain: these
// events carry a month and a weight and nothing finer (D17).
export const LEGACY_COMMUNITY_SOURCE = 'legacy_community';

export const PROCUREMENT_SOURCES = [
  OFB_SOURCE,
  FRESH_ALLIANCE_SOURCE,
  LEGACY_COMMUNITY_SOURCE,
] as const;

/** Persistence-level options shared by both importers, distinct from
 *  parse-level options -- these only matter once a ProcurementImport row is
 *  actually created. */
export interface ImportOptions {
  /** Hash of the original unified export file, shared by the Warehouse and
   *  Fresh Alliance rows one unified upload produces. Absent for callers that
   *  aren't the unified importer. */
  unifiedFileHash?: string;
}

export class ProcurementImportError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(message: string, code: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'ProcurementImportError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const monthNames = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const acquisitionClassByPrefix: Record<string, AcquisitionClass> = {
  '0': 'DONATED',
  '1': 'DONATED',
  '2': 'DONATED',
  '3': 'DONATED',
  '6': 'PURCH-DON',
  '7': 'PURCH-DON',
  '8': 'GOVERNMENT',
  '9': 'PURCHASED',
};

// `4xxxx` is the supplier's Fresh Alliance catalog family. It constrains the
// acquisition class only; it never classifies an event's procurement channel.
export function expectedAcquisitionClass(productCode: string): AcquisitionClass | null {
  if (/^4\d{4}$/.test(productCode)) return 'DONATED';
  return acquisitionClassByPrefix[productCode[0]] ?? null;
}

export function invalidRow(
  rowNumber: number,
  field: string,
  instruction: string,
  code = 'INVALID_OFB_CSV'
): never {
  throw new ProcurementImportError(
    `Row ${rowNumber} has an invalid ${field}. ${instruction}`,
    code,
    400,
    { rowNumber, field }
  );
}

/** Parses the exporter's `M/D/YY` receiving date. */
export function parseSourceDate(
  value: string,
  rowNumber: number,
  code = 'INVALID_OFB_CSV'
): { iso: string; month: number } {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) invalidRow(rowNumber, 'Date', 'Export the range again and retry the import.', code);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = 2000 + Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 || month > 12 || day < 1 ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    invalidRow(rowNumber, 'Date', 'Export the range again and retry the import.', code);
  }
  return { iso: candidate.toISOString().slice(0, 10), month };
}

/** Quantities and weights are integer hundredths to match the exporter contract. */
export function parseHundredths(
  value: string,
  rowNumber: number,
  field: string,
  code = 'INVALID_OFB_CSV'
): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? '').trim());
  if (!match) invalidRow(rowNumber, field, 'Use the standardized OFB CSV exporter.', code);
  const amount = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(amount)) {
    invalidRow(rowNumber, field, 'The value is too large to import safely.', code);
  }
  return amount;
}

/** Monetary values are integer cents. */
export function parseCents(
  value: string,
  rowNumber: number,
  field: string,
  code = 'INVALID_OFB_CSV'
): number {
  const match = /^\$?(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) invalidRow(rowNumber, field, 'Use the standardized OFB CSV exporter.', code);
  const amount = Number(match[1].replace(/,/g, '')) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(amount)) {
    invalidRow(rowNumber, field, 'The value is too large to import safely.', code);
  }
  return amount;
}

/**
 * Minimal RFC 4180 field/line serialization, the write-side counterpart to the
 * csv-parse defaults every OFB parser reads with. Used by the unified-export
 * parser to reconstruct synthetic per-channel CSVs from a subset of rows, so
 * the existing, already-tested Completed Orders and Agency Pickups parsers can
 * read them unchanged rather than a third parser re-implementing every
 * validation rule.
 */
export function toCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsvLine(fields: string[]): string {
  return fields.map(toCsvField).join(',');
}

/**
 * Source references may contain an alphabetic suffix, so they are preserved as
 * bounded strings rather than parsed as numbers.
 */
export function assertSafeReference(
  value: string,
  rowNumber: number,
  field: string,
  code = 'INVALID_OFB_CSV'
): string {
  const reference = String(value ?? '').trim();
  if (
    reference.length === 0 ||
    reference.length > 64 ||
    /[\u0000-\u001F\u007F]/.test(reference)
  ) {
    invalidRow(rowNumber, field, 'Export the range again and retry the import.', code);
  }
  return reference;
}
