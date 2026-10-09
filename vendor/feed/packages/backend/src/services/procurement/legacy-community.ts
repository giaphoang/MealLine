// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

/**
 * Legacy community-donation import (D16, D17, D22).
 *
 * A permanent single-agency sidecar. It ingests one curated CSV — a ledger the
 * agency authored from its own pre-Primarius records — and it deliberately
 * teaches FEED nothing general: there is no format detection, no schema
 * negotiation, and no path by which a bespoke spreadsheet reaches this code.
 * FEED's analytics foundation remains the OFB export (D22).
 *
 * What makes it honest rather than a backfill:
 *
 * - **Monthly grain stays monthly.** Each row is one month's total from one
 *   source. The persisted `deliveryDate` is the first of that month — a
 *   placeholder for "sometime this month", never an observed delivery day, in
 *   the same spirit as D8's `12:00 AM`. Nothing downstream may render it as a
 *   day.
 * - **No product detail is invented.** These records carry no product code and
 *   no category, so legacy lines are attached to a single obvious sentinel
 *   product and are excluded from every product- and category-level view.
 *   Absence is honest where a fabricated category would lie (D17).
 * - **Donor identity is the curated canonical name** the agency authored, with
 *   no OFB donor code, because OFB never saw these donations. That is also what
 *   lets one donor rule reach both legacy and live rows.
 */

import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import prisma from '../../db';
import {
  ImportOptions,
  LEGACY_COMMUNITY_SOURCE,
  ProcurementImportError,
} from './parsing';
import { LEGACY_LEDGER_HEADERS } from './contracts';

export { LEGACY_LEDGER_HEADERS } from './contracts';

/** The exact contract of the curated ledger. Anything else is rejected. */
/**
 * Attached to every legacy line. Not a product code and not meant to look like
 * one: these records have no product detail, and this makes that visible rather
 * than dressing it up as a category.
 */
export const LEGACY_SENTINEL_PRODUCT_CODE = 'LEGACY-MONTHLY';
export const LEGACY_COMMUNITY_CUTOFF_DATE = '2023-06-01';

export interface NormalizedLegacyMonth {
  /** `YYYY-MM|Canonical Source` — stable, so re-importing supersedes rather than duplicates. */
  sourceOrderReference: string;
  /** First of the month. A placeholder for the month, never an observed day. */
  deliveryDate: string;
  month: string;
  donorName: string;
  weightHundredths: number;
  disposition: string;
  sourceAsWritten: string;
  fiscalYear: string;
  caveat: string;
  snapshotHash: string;
}

export interface ParsedLegacyLedger {
  fileHash: string;
  rowCount: number;
  rangeStart: string;
  rangeEnd: string;
  months: NormalizedLegacyMonth[];
}

export interface LegacyImportResult {
  outcome: 'imported' | 'duplicate';
  importId: number | null;
  rowCount: number;
  monthCount: number;
  skippedMonthCount: number;
  totalWeightHundredths: number;
  rangeStart: string;
  rangeEnd: string;
  sourceCount: number;
}

function invalid(rowNumber: number, column: string, remedy: string): never {
  throw new ProcurementImportError(
    `Row ${rowNumber} has an unusable ${column}. ${remedy}`,
    'INVALID_LEGACY_ROW',
    400,
    { rowNumber, column }
  );
}

export function parseLegacyLedgerCsv(buffer: Buffer): ParsedLegacyLedger {
  if (buffer.length === 0) {
    throw new ProcurementImportError(
      'The selected ledger is empty.',
      'EMPTY_LEGACY_CSV'
    );
  }

  let records: Record<string, string>[];
  try {
    records = parse(buffer, {
      bom: true,
      columns: (headers: string[]) => {
        if (
          headers.length !== LEGACY_LEDGER_HEADERS.length ||
          headers.some((header, index) => header !== LEGACY_LEDGER_HEADERS[index])
        ) {
          throw new ProcurementImportError(
            'This file is not the curated community-donation ledger. Regenerate it and retry.',
            'INVALID_LEGACY_HEADERS',
            400,
            { expected: LEGACY_LEDGER_HEADERS, actual: headers }
          );
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
      'FEED could not read this ledger as CSV.',
      'MALFORMED_LEGACY_CSV',
      400,
      error instanceof Error ? error.message : undefined
    );
  }

  if (records.length === 0) {
    throw new ProcurementImportError(
      'The ledger contains no rows.',
      'EMPTY_LEGACY_CSV'
    );
  }

  // One row per (month, source). Two rows for the same pair are summed rather
  // than treated as a conflict -- the curated ledger keeps a separate row per
  // written label, and several labels can map to one canonical source.
  const byEvent = new Map<string, NormalizedLegacyMonth>();

  records.forEach((record, index) => {
    const rowNumber = index + 2;

    const year = Number(record.calendar_year);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      invalid(rowNumber, 'calendar_year', 'Expected a four-digit year.');
    }
    const monthNumber = Number(record.month_num);
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      invalid(rowNumber, 'month_num', 'Expected 1 through 12.');
    }
    const donorName = record.source_canonical.trim();
    if (!donorName) invalid(rowNumber, 'source_canonical', 'Every row needs a source.');

    // The ledger omits untracked months entirely rather than writing zeros, so
    // a blank weight here is a malformed row, not a "nothing received" signal.
    const rawWeight = record.weight_pounds.trim();
    if (rawWeight === '') invalid(rowNumber, 'weight_pounds', 'Blank months are omitted, not zeroed.');
    const pounds = Number(rawWeight);
    if (!Number.isFinite(pounds) || pounds < 0) {
      invalid(rowNumber, 'weight_pounds', 'Expected a non-negative number of pounds.');
    }

    const month = `${year}-${String(monthNumber).padStart(2, '0')}`;
    const deliveryDate = `${month}-01`;
    if (deliveryDate >= LEGACY_COMMUNITY_CUTOFF_DATE) {
      invalid(
        rowNumber,
        'calendar_year/month_num',
        'Legacy community history must end before June 2023, when the OFB Fresh Alliance record begins.'
      );
    }
    const reference = `${month}|${donorName}`;
    const weightHundredths = Math.round(pounds * 100);

    const existing = byEvent.get(reference);
    if (existing) {
      existing.weightHundredths += weightHundredths;
      if (!existing.caveat && record.caveat.trim()) existing.caveat = record.caveat.trim();
      return;
    }

    byEvent.set(reference, {
      sourceOrderReference: reference,
      deliveryDate,
      month,
      donorName,
      weightHundredths,
      disposition: record.disposition.trim(),
      sourceAsWritten: record.source_as_written.trim(),
      fiscalYear: record.fiscal_year.trim(),
      caveat: record.caveat.trim(),
      snapshotHash: '',
    });
  });

  const months = [...byEvent.values()].sort((left, right) =>
    left.deliveryDate.localeCompare(right.deliveryDate)
    || left.donorName.localeCompare(right.donorName)
  );

  // Hash the settled totals, so a re-import with identical content is a no-op
  // and one with a corrected weight becomes a new revision of the same month.
  for (const event of months) {
    event.snapshotHash = createHash('sha256')
      .update(JSON.stringify([event.sourceOrderReference, event.weightHundredths]))
      .digest('hex');
  }

  return {
    fileHash: createHash('sha256').update(buffer).digest('hex'),
    rowCount: records.length,
    rangeStart: months[0].deliveryDate,
    rangeEnd: months[months.length - 1].deliveryDate,
    months,
  };
}

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function importLegacyLedgerCsv(
  buffer: Buffer,
  importedBy?: string,
  client = prisma,
  _importOptions: ImportOptions = {}
): Promise<LegacyImportResult> {
  const parsed = parseLegacyLedgerCsv(buffer);

  return client.$transaction(async (tx: TransactionClient) => {
    const currentSnapshots = await tx.procurementOrderRevision.findMany({
      where: {
        source: LEGACY_COMMUNITY_SOURCE,
        sourceOrderReference: { in: parsed.months.map((month) => month.sourceOrderReference) },
        isCurrent: true,
        import: { status: 'active' },
      },
      select: { sourceOrderReference: true, snapshotHash: true },
    });
    const currentByReference = new Map(
      currentSnapshots.map((snapshot) => [snapshot.sourceOrderReference, snapshot.snapshotHash])
    );
    const changed = parsed.months.filter(
      (month) => currentByReference.get(month.sourceOrderReference) !== month.snapshotHash
    );

    if (changed.length === 0) {
      return {
        outcome: 'duplicate' as const,
        importId: null,
        rowCount: parsed.rowCount,
        monthCount: 0,
        skippedMonthCount: parsed.months.length,
        totalWeightHundredths: 0,
        rangeStart: parsed.rangeStart,
        rangeEnd: parsed.rangeEnd,
        sourceCount: 0,
      };
    }

    const record = await tx.procurementImport.create({
      data: {
        source: LEGACY_COMMUNITY_SOURCE,
        fileHash: parsed.fileHash,
        schemaVersion: 1,
        rowCount: parsed.rowCount,
        orderCount: changed.length,
        warningCount: 0,
        warnings: [],
        rangeStart: parsed.rangeStart,
        rangeEnd: parsed.rangeEnd,
        importedBy: importedBy ?? null,
      },
    });

    // One sentinel product for the whole namespace. These records have no
    // product detail; this stands in for that absence rather than inventing a
    // category, and analytics keeps the legacy source out of every product view.
    const product = await tx.procurementProduct.upsert({
      where: {
        source_productCode: {
          source: LEGACY_COMMUNITY_SOURCE,
          productCode: LEGACY_SENTINEL_PRODUCT_CODE,
        },
      },
      update: {},
      create: {
        source: LEGACY_COMMUNITY_SOURCE,
        productCode: LEGACY_SENTINEL_PRODUCT_CODE,
        acquisitionClass: 'DONATED',
      },
    });

    let totalWeightHundredths = 0;
    for (const month of changed) {
      const previous = await tx.procurementOrderRevision.findFirst({
        where: {
          source: LEGACY_COMMUNITY_SOURCE,
          sourceOrderReference: month.sourceOrderReference,
        },
        orderBy: { revision: 'desc' },
        select: { revision: true },
      });

      await tx.procurementOrderRevision.updateMany({
        where: {
          source: LEGACY_COMMUNITY_SOURCE,
          sourceOrderReference: month.sourceOrderReference,
          isCurrent: true,
        },
        data: { isCurrent: false },
      });

      const revision = await tx.procurementOrderRevision.create({
        data: {
          importId: record.id,
          source: LEGACY_COMMUNITY_SOURCE,
          sourceOrderReference: month.sourceOrderReference,
          eventKind: 'community_donation_month',
          deliveryDate: month.deliveryDate,
          revision: (previous?.revision ?? 0) + 1,
          snapshotHash: month.snapshotHash,
          warningCodes: [],
          isCurrent: true,
          // The curated canonical name, with no OFB code -- OFB never saw these
          // donations. A donor rule keyed on the name reaches them; one keyed on
          // an OFB code correctly does not.
          donorName: month.donorName,
          donorCode: null,
        },
      });

      totalWeightHundredths += month.weightHundredths;
      await tx.procurementLine.create({
        data: {
          orderRevisionId: revision.id,
          productId: product.id,
          sourceRowNumber: 1,
          sourceOrderReference: month.sourceOrderReference,
          sourcePeriod: month.month,
          sourceDescription: month.donorName,
          acquisitionClass: 'DONATED',
          procurementChannel: 'community_donation',
          // Quantity is genuinely unknown at this grain; only weight was kept.
          quantityHundredths: 0,
          weightHundredths: month.weightHundredths,
          unitPriceCents: 0,
          sourcePriceTotalCents: 0,
          calculatedPriceTotalCents: 0,
          priceTotalMatches: true,
          serviceFeeCents: 0,
          grantsAppliedCents: 0,
        },
      });
    }

    return {
      outcome: 'imported' as const,
      importId: record.id,
      rowCount: parsed.rowCount,
      monthCount: changed.length,
      skippedMonthCount: parsed.months.length - changed.length,
      totalWeightHundredths,
      rangeStart: parsed.rangeStart,
      rangeEnd: parsed.rangeEnd,
      sourceCount: new Set(changed.map((month) => month.donorName)).size,
    };
  });
}
