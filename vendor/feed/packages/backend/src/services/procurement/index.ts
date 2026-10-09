// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import prisma from '../../db';
import {
  AnalyticsRangePreset,
  isValidLocalDate,
  localDateOf,
  resolveRange,
} from '../inventory-analytics/timezone';
import { getOperatingHoursSettings } from '../operating-hours';
import { granularityForRange, bucketKeyFor } from '../analytics-granularity';
import {
  DataShapingFlag,
  DataShapingRule,
  FLAG_FAMILY,
  RuleScope,
  resolveFlags,
  validateRule,
} from './data-shaping';
import { clearSupersede, reapplySupersede } from './fresh-alliance';
import { chunk } from './bulk';
import { OFB_HEADERS } from './contracts';
import {
  ACQUISITION_CLASSES,
  AcquisitionClass,
  FRESH_ALLIANCE_SOURCE,
  LEGACY_COMMUNITY_SOURCE,
  ImportOptions,
  OFB_SOURCE,
  PROCUREMENT_SOURCES,
  ProcurementImportError,
  expectedAcquisitionClass,
  invalidRow,
  monthNames,
  parseCents,
  parseHundredths,
  parseSourceDate,
} from './parsing';

// Parsing primitives are shared with the Agency Pickups parser so the two
// cannot drift. Re-exported here because this module is the established import
// site for procurement consumers.
export {
  ACQUISITION_CLASSES,
  FRESH_ALLIANCE_SOURCE,
  LEGACY_COMMUNITY_SOURCE,
  OFB_SOURCE,
  PROCUREMENT_SOURCES,
  ProcurementImportError,
} from './parsing';
export type { AcquisitionClass } from './parsing';
export { OFB_HEADERS } from './contracts';

export const OFB_IMPORT_SCHEMA_VERSION = 4;
export const PROCUREMENT_STALE_AFTER_DAYS = 30;

// `community_donation` is the legacy channel (D16). It is a third channel
// rather than a flavor of Fresh Alliance because it is a different reporting
// relationship entirely -- donations the agency received directly, which never
// passed through OFB -- and because giving it its own channel is what lets it
// carry its own line, color, and legend entry on the weight-over-time chart
// instead of silently merging into an OFB series.
export const PROCUREMENT_CHANNELS = [
  'ofb_warehouse',
  'fresh_alliance',
  'community_donation',
] as const;
export const PROCUREMENT_EVENT_KINDS = [
  'ofb_warehouse_order',
  'fresh_alliance_receipt',
  'community_donation_month',
] as const;
export type ProcurementChannel = typeof PROCUREMENT_CHANNELS[number];
export type ProcurementEventKind = typeof PROCUREMENT_EVENT_KINDS[number];

export type ProcurementWarningCode =
  | 'PRICE_TOTAL_MISMATCH'
  | 'PERIOD_MISMATCH'
  | 'DEPRECATED_PRODUCT_CODE';

export interface ProcurementWarning {
  code: ProcurementWarningCode;
  message: string;
  deliveryDate: string;
  rowNumbers: number[];
}

export interface NormalizedOfbLine {
  sourceRowNumber: number;
  deliveryDate: string;
  sourcePeriod: string;
  sourceOrderReference: string;
  productCode: string;
  sourceDescription: string;
  acquisitionClass: AcquisitionClass;
  procurementChannel: ProcurementChannel;
  quantityHundredths: number;
  weightHundredths: number;
  unitPriceCents: number;
  sourcePriceTotalCents: number;
  calculatedPriceTotalCents: number;
  priceTotalMatches: boolean;
  serviceFeeCents: number;
  grantsAppliedCents: number;
}

export interface NormalizedOfbOrder {
  sourceOrderReference: string;
  eventKind: ProcurementEventKind;
  deliveryDate: string;
  snapshotHash: string;
  warningCodes: ProcurementWarningCode[];
  lines: NormalizedOfbLine[];
}

export interface ParsedOfbImport {
  fileHash: string;
  rowCount: number;
  rangeStart: string;
  rangeEnd: string;
  warnings: ProcurementWarning[];
  orders: NormalizedOfbOrder[];
}

function procurementChannel(sourceOrderReference: string): ProcurementChannel {
  return /AGPCKUP$/i.test(sourceOrderReference) ? 'fresh_alliance' : 'ofb_warehouse';
}

function headerMismatch(actual: string[]): ProcurementImportError {
  return new ProcurementImportError(
    'This file does not match the standardized OFB export. Export the order again and retry the import.',
    'INVALID_OFB_HEADERS',
    400,
    { expected: OFB_HEADERS, actual }
  );
}

function orderSnapshotHash(lines: NormalizedOfbLine[]): string {
  const canonical = lines
    .map(({ sourceRowNumber: _row, ...line }) => line)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function parseOfbCsv(buffer: Buffer): ParsedOfbImport {
  if (buffer.length === 0) {
    throw new ProcurementImportError(
      'The selected CSV is empty. Export the OFB order again and retry.',
      'EMPTY_OFB_CSV'
    );
  }
  if (buffer.toString('utf8').includes('\uFFFD')) {
    throw new ProcurementImportError(
      'FEED could not read this file as UTF-8. Export the OFB order again and retry.',
      'INVALID_OFB_ENCODING'
    );
  }

  let records: Record<string, string>[];
  try {
    records = parse(buffer, {
      bom: true,
      columns: (headers: string[]) => {
        if (
          headers.length !== OFB_HEADERS.length ||
          headers.some((header, index) => header !== OFB_HEADERS[index])
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
      'FEED could not read this CSV. Export the OFB order again and retry.',
      'MALFORMED_OFB_CSV',
      400,
      error instanceof Error ? error.message : undefined
    );
  }

  if (records.length === 0) {
    throw new ProcurementImportError(
      'The selected CSV contains no order lines. Choose an OFB export with order data.',
      'EMPTY_OFB_CSV'
    );
  }

  const warnings: ProcurementWarning[] = [];
  const lines: NormalizedOfbLine[] = records.map((record, index) => {
    const rowNumber = index + 2;
    const parsedDate = parseSourceDate(record.Date, rowNumber);
    const sourcePeriod = record.Period.trim();
    const expectedPeriod = `${parsedDate.month}-${monthNames[parsedDate.month]}`;
    if (sourcePeriod !== expectedPeriod) {
      warnings.push({
        code: 'PERIOD_MISMATCH',
        message: `Row ${rowNumber} uses period ${sourcePeriod}; the delivery date belongs to ${expectedPeriod}.`,
        deliveryDate: parsedDate.iso,
        rowNumbers: [rowNumber],
      });
    }

    const sourceOrderReference = record['Order #'].trim();
    if (
      sourceOrderReference.length === 0 ||
      sourceOrderReference.length > 64 ||
      /[\u0000-\u001F\u007F]/.test(sourceOrderReference)
    ) {
      invalidRow(rowNumber, 'Order #', 'Export the order again and retry the import.');
    }
    const productCode = record['Product #'].trim();
    if (!/^\d{4,6}$/.test(productCode)) {
      invalidRow(rowNumber, 'Product #', 'Use the standardized OFB CSV exporter so the four-to-six-digit identifier is preserved.');
    }
    const sourceDescription = record['Product Description'].trim();
    if (!sourceDescription) invalidRow(rowNumber, 'Product Description', 'Export the order again and retry.');
    if (/\b(?:DO NOT USE|DON'T USE)\b/i.test(sourceDescription)) {
      warnings.push({
        code: 'DEPRECATED_PRODUCT_CODE',
        message: `Row ${rowNumber} uses supplier product code ${productCode}, which the source description marks as deprecated. FEED retained the historical observation.`,
        deliveryDate: parsedDate.iso,
        rowNumbers: [rowNumber],
      });
    }
    const acquisitionClass = record.Category.trim() as AcquisitionClass;
    const expectedClass = expectedAcquisitionClass(productCode);
    if (!expectedClass || acquisitionClass !== expectedClass) {
      invalidRow(rowNumber, 'Category', 'The acquisition class does not match the OFB product-number family.');
    }

    const quantityHundredths = parseHundredths(record.Qty, rowNumber, 'Qty');
    const weightHundredths = parseHundredths(record.Weight, rowNumber, 'Weight');
    const unitPriceCents = parseCents(record['Unit Price'], rowNumber, 'Unit Price');
    const sourcePriceTotalCents = parseCents(record['Price Total'], rowNumber, 'Price Total');
    const calculatedPriceTotalCents = Math.round(
      quantityHundredths * unitPriceCents / 100
    );
    const priceTotalMatches = sourcePriceTotalCents === calculatedPriceTotalCents;
    if (!priceTotalMatches) {
      warnings.push({
        code: 'PRICE_TOTAL_MISMATCH',
        message: `Row ${rowNumber} reports a different Price Total than Qty × Unit Price. FEED retained both values.`,
        deliveryDate: parsedDate.iso,
        rowNumbers: [rowNumber],
      });
    }

    return {
      sourceRowNumber: rowNumber,
      deliveryDate: parsedDate.iso,
      sourcePeriod,
      sourceOrderReference,
      productCode,
      sourceDescription,
      acquisitionClass,
      procurementChannel: procurementChannel(sourceOrderReference),
      quantityHundredths,
      weightHundredths,
      unitPriceCents,
      sourcePriceTotalCents,
      calculatedPriceTotalCents,
      priceTotalMatches,
      serviceFeeCents: parseCents(record['Service Fee'], rowNumber, 'Service Fee'),
      grantsAppliedCents: parseCents(record['Grants Applied'], rowNumber, 'Grants Applied'),
    };
  });

  const datesByOrderReference = new Map<string, Set<string>>();
  for (const line of lines) {
    const dates = datesByOrderReference.get(line.sourceOrderReference) ?? new Set<string>();
    dates.add(line.deliveryDate);
    datesByOrderReference.set(line.sourceOrderReference, dates);
  }
  const conflictingOrder = [...datesByOrderReference].find(([, dates]) => dates.size > 1);
  if (conflictingOrder) {
    const [sourceOrderReference, dates] = conflictingOrder;
    throw new ProcurementImportError(
      `Order ${sourceOrderReference} appears on multiple delivery dates in this export. Export the range again and retry.`,
      'OFB_ORDER_DATE_CONFLICT',
      400,
      { sourceOrderReference, deliveryDates: [...dates].sort() }
    );
  }

  const byOrder = new Map<string, NormalizedOfbLine[]>();
  for (const line of lines) {
    const orderLines = byOrder.get(line.sourceOrderReference) ?? [];
    orderLines.push(line);
    byOrder.set(line.sourceOrderReference, orderLines);
  }

  const orders = [...byOrder.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceOrderReference, orderLines]): NormalizedOfbOrder => {
      const deliveryDate = orderLines[0].deliveryDate;
      const eventKind: ProcurementEventKind = procurementChannel(sourceOrderReference) === 'fresh_alliance'
        ? 'fresh_alliance_receipt'
        : 'ofb_warehouse_order';
      const orderRowNumbers = new Set(orderLines.map((line) => line.sourceRowNumber));
      const warningCodes = [...new Set(
        warnings
          .filter((warning) => warning.rowNumbers.some((rowNumber) => orderRowNumbers.has(rowNumber)))
          .map((warning) => warning.code)
      )];
      return {
        sourceOrderReference,
        eventKind,
        deliveryDate,
        snapshotHash: orderSnapshotHash(orderLines),
        warningCodes,
        lines: orderLines,
      };
    });

  return {
    fileHash: createHash('sha256').update(buffer).digest('hex'),
    rowCount: lines.length,
    rangeStart: orders.reduce((earliest, order) => order.deliveryDate < earliest ? order.deliveryDate : earliest, orders[0].deliveryDate),
    rangeEnd: orders.reduce((latest, order) => order.deliveryDate > latest ? order.deliveryDate : latest, orders[0].deliveryDate),
    warnings,
    orders,
  };
}

type TransactionClient = Prisma.TransactionClient;

export interface ProcurementImportResult {
  outcome: 'imported' | 'duplicate';
  importId: number | null;
  rowCount: number;
  orderCount: number;
  skippedOrderCount: number;
  warningCount: number;
  rangeStart: string;
  rangeEnd: string;
  warnings: ProcurementWarning[];
}

export async function importOfbCsv(
  buffer: Buffer,
  importedBy?: string,
  client = prisma,
  options: ImportOptions = {}
): Promise<ProcurementImportResult> {
  const parsed = parseOfbCsv(buffer);

  return client.$transaction(async (tx: TransactionClient) => {
    const currentSnapshots = await tx.procurementOrderRevision.findMany({
      where: {
        source: OFB_SOURCE,
        sourceOrderReference: { in: parsed.orders.map((order) => order.sourceOrderReference) },
        isCurrent: true,
        import: { status: 'active' },
      },
      select: { sourceOrderReference: true, snapshotHash: true },
    });
    const currentByOrder = new Map(
      currentSnapshots.map((snapshot) => [snapshot.sourceOrderReference, snapshot.snapshotHash])
    );
    const changedOrders = parsed.orders.filter((order) => {
      const currentHash = currentByOrder.get(order.sourceOrderReference);
      return currentHash !== order.snapshotHash;
    });

    if (changedOrders.length === 0) {
      return {
        outcome: 'duplicate' as const,
        importId: null,
        rowCount: parsed.rowCount,
        orderCount: 0,
        skippedOrderCount: parsed.orders.length,
        warningCount: parsed.warnings.length,
        rangeStart: parsed.rangeStart,
        rangeEnd: parsed.rangeEnd,
        warnings: parsed.warnings,
      };
    }

    const importRecord = await tx.procurementImport.create({
      data: {
        source: OFB_SOURCE,
        fileHash: parsed.fileHash,
        schemaVersion: OFB_IMPORT_SCHEMA_VERSION,
        status: 'active',
        rowCount: parsed.rowCount,
        orderCount: changedOrders.length,
        warningCount: parsed.warnings.length,
        warnings: parsed.warnings as unknown as Prisma.InputJsonValue,
        rangeStart: parsed.rangeStart,
        rangeEnd: parsed.rangeEnd,
        importedBy,
        unifiedFileHash: options.unifiedFileHash,
      },
    });

    const productIds = new Map<string, number>();
    const products = new Map<string, string>();
    for (const order of changedOrders) {
      for (const line of order.lines) {
        products.set(line.productCode, line.acquisitionClass);
      }
    }

    // Set-based rather than one upsert per product. A decade-long export
    // carries ~900 distinct products; issuing a round-trip each put the
    // transaction over its 20s ceiling on the production Pi while finishing
    // comfortably on a developer SSD. Query count is the portable cost —
    // latency is whatever the disk happens to be.
    // Prisma types `skipDuplicates` as `never` on SQLite, so existing rows are
    // read first and only genuinely new products are inserted.
    const productCodes = [...products.keys()];
    const productRows: { id: number; productCode: string; acquisitionClass: string }[] = [];
    for (const batch of chunk(productCodes)) {
      productRows.push(...await tx.procurementProduct.findMany({
        where: { source: OFB_SOURCE, productCode: { in: batch } },
        select: { id: true, productCode: true, acquisitionClass: true },
      }));
    }

    const known = new Set(productRows.map((row) => row.productCode));
    const missingCodes = productCodes.filter((code) => !known.has(code));
    for (const batch of chunk(missingCodes)) {
      await tx.procurementProduct.createMany({
        data: batch.map((productCode) => ({
          source: OFB_SOURCE,
          productCode,
          acquisitionClass: products.get(productCode)!,
        })),
      });
    }
    for (const batch of chunk(missingCodes)) {
      productRows.push(...await tx.procurementProduct.findMany({
        where: { source: OFB_SOURCE, productCode: { in: batch } },
        select: { id: true, productCode: true, acquisitionClass: true },
      }));
    }
    for (const row of productRows) productIds.set(row.productCode, row.id);

    // `skipDuplicates` leaves pre-existing rows untouched, but the upsert this
    // replaced also refreshed `acquisitionClass` when a product's class
    // changed. Preserve that, grouped by target class so the cost is one
    // statement per distinct class (a handful) instead of one per product.
    const reclassify = new Map<string, string[]>();
    for (const row of productRows) {
      const desired = products.get(row.productCode);
      if (desired && desired !== row.acquisitionClass) {
        const codes = reclassify.get(desired) ?? [];
        codes.push(row.productCode);
        reclassify.set(desired, codes);
      }
    }
    for (const [acquisitionClass, codes] of reclassify) {
      for (const batch of chunk(codes)) {
        await tx.procurementProduct.updateMany({
          where: { source: OFB_SOURCE, productCode: { in: batch } },
          data: { acquisitionClass },
        });
      }
    }

    // The per-order shape of this block was four round-trips each (previous
    // revision, clear `isCurrent`, create revision, create lines). Each is now
    // one set-based statement over the whole batch, which is what keeps a
    // ten-year import inside a single atomic transaction on slow storage.
    const changedRefs = changedOrders.map((order) => order.sourceOrderReference);

    const priorRevisions = new Map<string, number>();
    for (const batch of chunk(changedRefs)) {
      const grouped = await tx.procurementOrderRevision.groupBy({
        by: ['sourceOrderReference'],
        where: { source: OFB_SOURCE, sourceOrderReference: { in: batch } },
        _max: { revision: true },
      });
      for (const row of grouped) {
        priorRevisions.set(row.sourceOrderReference, row._max.revision ?? 0);
      }
    }

    for (const batch of chunk(changedRefs)) {
      await tx.procurementOrderRevision.updateMany({
        where: { source: OFB_SOURCE, sourceOrderReference: { in: batch }, isCurrent: true },
        data: { isCurrent: false },
      });
    }

    for (const batch of chunk(changedOrders)) {
      await tx.procurementOrderRevision.createMany({
        data: batch.map((order) => ({
          importId: importRecord.id,
          source: OFB_SOURCE,
          sourceOrderReference: order.sourceOrderReference,
          eventKind: order.eventKind,
          deliveryDate: order.deliveryDate,
          revision: (priorRevisions.get(order.sourceOrderReference) ?? 0) + 1,
          snapshotHash: order.snapshotHash,
          warningCodes: order.warningCodes,
          isCurrent: true,
        })),
      });
    }

    // SQLite cannot return generated ids from `createMany`, so the new
    // revisions are read back. Scoping to this import's id is exact: every
    // revision just written carries it, and no other row can.
    const createdRevisions = await tx.procurementOrderRevision.findMany({
      where: { importId: importRecord.id },
      select: { id: true, sourceOrderReference: true },
    });
    const revisionIds = new Map(
      createdRevisions.map((revision) => [revision.sourceOrderReference, revision.id])
    );

    const allLines = changedOrders.flatMap((order) => {
      const orderRevisionId = revisionIds.get(order.sourceOrderReference)!;
      return order.lines.map((line) => ({
        orderRevisionId,
        productId: productIds.get(line.productCode)!,
        sourceRowNumber: line.sourceRowNumber,
        sourceOrderReference: line.sourceOrderReference,
        sourcePeriod: line.sourcePeriod,
        sourceDescription: line.sourceDescription,
        acquisitionClass: line.acquisitionClass,
        procurementChannel: line.procurementChannel,
        quantityHundredths: line.quantityHundredths,
        weightHundredths: line.weightHundredths,
        unitPriceCents: line.unitPriceCents,
        sourcePriceTotalCents: line.sourcePriceTotalCents,
        calculatedPriceTotalCents: line.calculatedPriceTotalCents,
        priceTotalMatches: line.priceTotalMatches,
        serviceFeeCents: line.serviceFeeCents,
        grantsAppliedCents: line.grantsAppliedCents,
      }));
    });
    for (const batch of chunk(allLines)) {
      await tx.procurementLine.createMany({ data: batch });
    }

    // A Completed Orders import re-lands AGPCKUP events that an existing Fresh
    // Alliance import already covers. Without this, those fresh revisions would
    // arrive unclaimed and Fresh Alliance weight would double again. Each
    // active Fresh Alliance import reasserts its own recorded window.
    const activeFreshAllianceImports = await tx.procurementImport.findMany({
      where: { source: FRESH_ALLIANCE_SOURCE, status: 'active' },
      select: { id: true, rangeStart: true, rangeEnd: true },
    });
    for (const freshImport of activeFreshAllianceImports) {
      await reapplySupersede(tx, freshImport.id, freshImport.rangeStart, freshImport.rangeEnd);
    }

    return {
      outcome: 'imported' as const,
      importId: importRecord.id,
      rowCount: parsed.rowCount,
      orderCount: changedOrders.length,
      skippedOrderCount: parsed.orders.length - changedOrders.length,
      warningCount: parsed.warnings.length,
      rangeStart: parsed.rangeStart,
      rangeEnd: parsed.rangeEnd,
      warnings: parsed.warnings,
    };
  });
}

/**
 * Re-points `isCurrent` at the newest still-active revision of each affected
 * order, after a rollback or restore has changed which imports count.
 *
 * Set-based for the same reason as the import paths: this runs over every
 * order an import touched, so rolling back a decade-long import took three
 * round-trips per order — thousands of queries for one "Undo Import" click.
 * The winner per order is decided in memory from a single read rather than by
 * asking the database once per order.
 */
async function refreshCurrentOrders(
  tx: TransactionClient,
  events: { source: string; sourceOrderReference: string }[]
): Promise<void> {
  const unique = new Map(
    events.map((event) => [JSON.stringify([event.source, event.sourceOrderReference]), event])
  );
  if (unique.size === 0) return;

  // Group by source so each statement is one source and a batch of
  // references; the two procurement sources are permanently separate
  // namespaces, so a reference is only meaningful alongside its source.
  const refsBySource = new Map<string, string[]>();
  for (const { source, sourceOrderReference } of unique.values()) {
    const refs = refsBySource.get(source) ?? [];
    refs.push(sourceOrderReference);
    refsBySource.set(source, refs);
  }

  for (const [source, refs] of refsBySource) {
    for (const batch of chunk(refs)) {
      await tx.procurementOrderRevision.updateMany({
        where: { source, sourceOrderReference: { in: batch } },
        data: { isCurrent: false },
      });
    }
  }

  // One read of every candidate revision, then pick the highest revision per
  // order locally. `findFirst` with `orderBy` per order gave the same answer
  // at one query each.
  const winners = new Map<string, { id: number; revision: number }>();
  for (const [source, refs] of refsBySource) {
    for (const batch of chunk(refs)) {
      const candidates = await tx.procurementOrderRevision.findMany({
        where: {
          source,
          sourceOrderReference: { in: batch },
          import: { status: 'active' },
        },
        select: { id: true, sourceOrderReference: true, revision: true },
      });
      for (const candidate of candidates) {
        const key = JSON.stringify([source, candidate.sourceOrderReference]);
        const held = winners.get(key);
        if (!held || candidate.revision > held.revision) {
          winners.set(key, { id: candidate.id, revision: candidate.revision });
        }
      }
    }
  }

  const winningIds = [...winners.values()].map((winner) => winner.id);
  for (const batch of chunk(winningIds)) {
    await tx.procurementOrderRevision.updateMany({
      where: { id: { in: batch } },
      data: { isCurrent: true },
    });
  }
}

export async function rollbackProcurementImports(
  ids: number[],
  actor?: string,
  client = prisma
): Promise<{ updated: number }> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return { updated: 0 };
  return client.$transaction(async (tx: TransactionClient) => {
    const imports = await tx.procurementImport.findMany({
      where: { id: { in: uniqueIds }, status: 'active' },
      include: { orders: { select: { source: true, sourceOrderReference: true } } },
    });
    if (imports.length === 0) return { updated: 0 };
    const now = new Date();
    await tx.procurementImport.updateMany({
      where: { id: { in: imports.map((record) => record.id) } },
      data: { status: 'rolled_back', rolledBackAt: now, rolledBackBy: actor },
    });
    // Rolling back a Fresh Alliance import releases the Completed Orders
    // events it superseded, so their observations return to analytics rather
    // than leaving a hole where the donor-attributed data used to be.
    for (const record of imports) {
      await clearSupersede(tx, record.id);
    }
    await refreshCurrentOrders(tx, imports.flatMap((record) => record.orders));
    return { updated: imports.length };
  });
}

export async function restoreProcurementImports(
  ids: number[],
  actor?: string,
  client = prisma
): Promise<{ updated: number }> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return { updated: 0 };
  return client.$transaction(async (tx: TransactionClient) => {
    const imports = await tx.procurementImport.findMany({
      where: { id: { in: uniqueIds }, status: 'rolled_back' },
      include: { orders: { select: { source: true, sourceOrderReference: true } } },
    });
    if (imports.length === 0) return { updated: 0 };
    const now = new Date();
    await tx.procurementImport.updateMany({
      where: { id: { in: imports.map((record) => record.id) } },
      data: { status: 'active', restoredAt: now, restoredBy: actor },
    });
    // A restored Fresh Alliance import reclaims the window it recorded. The
    // claim is recomputed rather than remembered, and the "unclaimed only"
    // guard means an import that took over in the meantime keeps its rows.
    for (const record of imports) {
      if (record.source === FRESH_ALLIANCE_SOURCE) {
        await reapplySupersede(tx, record.id, record.rangeStart, record.rangeEnd);
      }
    }
    await refreshCurrentOrders(tx, imports.flatMap((record) => record.orders));
    return { updated: imports.length };
  });
}

export async function listProcurementImports(client = prisma) {
  const records = await client.procurementImport.findMany({
    orderBy: [{ importedAt: 'desc' }, { id: 'desc' }],
    include: {
      orders: {
        select: {
          id: true,
          sourceOrderReference: true,
          eventKind: true,
          deliveryDate: true,
          revision: true,
          warningCodes: true,
          isCurrent: true,
          // Donor identity travels with the summary so Data Management can
          // inspect an import and offer rules for the donors it actually
          // contains, rather than making staff type names from memory (D20).
          donorCode: true,
          donorName: true,
          _count: { select: { lines: true } },
        },
        orderBy: { deliveryDate: 'asc' },
      },
    },
  });
  return records.map((record) => ({
    id: record.id,
    source: record.source,
    status: record.status,
    schemaVersion: record.schemaVersion,
    rowCount: record.rowCount,
    orderCount: record.orderCount,
    warningCount: record.warningCount,
    warnings: record.warnings,
    rangeStart: record.rangeStart,
    rangeEnd: record.rangeEnd,
    importedAt: record.importedAt.toISOString(),
    rolledBackAt: record.rolledBackAt?.toISOString() ?? null,
    restoredAt: record.restoredAt?.toISOString() ?? null,
    unifiedFileHash: record.unifiedFileHash,
    orders: record.orders.map((order) => ({
      id: order.id,
      sourceOrderReference: order.sourceOrderReference,
      eventKind: order.eventKind,
      deliveryDate: order.deliveryDate,
      revision: order.revision,
      donorCode: order.donorCode,
      donorName: order.donorName,
      warningCodes: order.warningCodes,
      isCurrent: order.isCurrent,
      lineCount: order._count.lines,
    })),
  }));
}

function calendarDayDifference(earlier: string, later: string): number {
  const start = Date.parse(`${earlier}T00:00:00.000Z`);
  const end = Date.parse(`${later}T00:00:00.000Z`);
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export async function getProcurementDataStatus(
  now = new Date(),
  client = prisma,
  resolvedTimeZone?: string
) {
  const activeCorpus = {
    source: { in: [...PROCUREMENT_SOURCES] },
    isCurrent: true,
    supersededByImportId: null,
    import: { status: 'active' as const },
  };
  const [latest, warehouseCoverage, freshAllianceCoverage, settings] = await Promise.all([
    client.procurementOrderRevision.findFirst({
      where: activeCorpus,
      orderBy: { deliveryDate: 'desc' },
      select: { deliveryDate: true },
    }),
    // Each channel is reported on its own schedule, so their windows are read
    // separately and never assumed equal. See procurement-unification-plan.md
    // (D12): this describes what FEED can currently see, not how anyone is
    // performing.
    client.procurementOrderRevision.aggregate({
      where: { ...activeCorpus, eventKind: 'ofb_warehouse_order' },
      _min: { deliveryDate: true },
      _max: { deliveryDate: true },
      _count: { _all: true },
    }),
    client.procurementOrderRevision.aggregate({
      where: { ...activeCorpus, eventKind: 'fresh_alliance_receipt' },
      _min: { deliveryDate: true },
      _max: { deliveryDate: true },
      _count: { _all: true },
    }),
    resolvedTimeZone
      ? Promise.resolve(null)
      : getOperatingHoursSettings(client as never),
  ]);
  const coverage = {
    warehouse: {
      eventCount: warehouseCoverage._count._all,
      earliestDeliveryDate: warehouseCoverage._min.deliveryDate,
      latestDeliveryDate: warehouseCoverage._max.deliveryDate,
    },
    freshAlliance: {
      eventCount: freshAllianceCoverage._count._all,
      earliestDeliveryDate: freshAllianceCoverage._min.deliveryDate,
      latestDeliveryDate: freshAllianceCoverage._max.deliveryDate,
    },
  };

  if (!latest) {
    return {
      hasData: false,
      latestDeliveryDate: null,
      daysSinceLatestDelivery: null,
      isStale: false,
      staleAfterDays: PROCUREMENT_STALE_AFTER_DAYS,
      coverage,
    };
  }
  const today = localDateOf(now, resolvedTimeZone ?? settings!.timezone);
  const daysSinceLatestDelivery = calendarDayDifference(latest.deliveryDate, today);
  return {
    hasData: true,
    latestDeliveryDate: latest.deliveryDate,
    daysSinceLatestDelivery,
    isStale: daysSinceLatestDelivery > PROCUREMENT_STALE_AFTER_DAYS,
    staleAfterDays: PROCUREMENT_STALE_AFTER_DAYS,
    coverage,
  };
}

function quantile(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, sorted.length - 1);
  const fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

export interface ProcurementAnalyticsFilters {
  preset?: AnalyticsRangePreset;
  startDate?: string;
  endDate?: string;
  channel?: ProcurementChannel;
  acquisitionClass?: AcquisitionClass;
}

interface ProductObservation {
  productCode: string;
  latestDescription: string;
  acquisitionClass: AcquisitionClass;
  procurementChannel: ProcurementChannel;
  receiptDates: Set<string>;
  totalWeightHundredths: number;
  // Charges live on the same warehouse lines, so the product history table can
  // carry cost alongside weight (a product is either purchased or donated, so
  // the paid-products table was just this subset). Donated products keep 0/0.
  totalSpendCents: number;
  paidWeightHundredths: number;
  firstReceivedDate: string;
  lastReceivedDate: string;
}

interface DonorObservation {
  donorCode: string;
  donorName: string;
  pickupCount: number;
  weightHundredths: number;
  receivingDates: Set<string>;
  firstReceivedDate: string;
  lastReceivedDate: string;
  valuedWeightHundredths: number;
  unvaluedWeightHundredths: number;
  recordedValueCents: number;
  categories: Map<string, { description: string; weightHundredths: number }>;
}

// The legacy community stream, aggregated by curated canonical source. This is
// a "received" view -- a history of donations as an activity -- so it honors no
// exclusion flags (D21): New Seasons' relayed pounds are a real gift here even
// though the pass_through rule removes them from retained supply elsewhere.
interface CommunitySourceObservation {
  sourceName: string;
  isFreshAlliancePartner: boolean;
  weightHundredths: number;
  monthCount: number;
  firstReceivedDate: string;
  lastReceivedDate: string;
}

interface FreshAllianceCategoryObservation {
  productCode: string;
  latestDescription: string;
  receiptReferences: Set<string>;
  receiptDates: Set<string>;
  totalWeightHundredths: number;
  firstReceivedDate: string;
  lastReceivedDate: string;
}

// Reports are honest about what OFB did not tell FEED: a receipt without a
// donor on file is bucketed under this sentinel rather than guessed. In the
// current corpus every fresh_alliance event has a donor because the Fresh
// Alliance import supersedes the AGPCKUP events that would otherwise lack
// one, but a partially superseded window is a real possibility this must
// not silently misrepresent.
const DONOR_NOT_REPORTED = '__not_reported__';

interface FreshAllianceDonorCategoryObservation {
  donorCode: string;
  donorName: string;
  productCode: string;
  latestDescription: string;
  receiptReferences: Set<string>;
  receiptDates: Set<string>;
  totalWeightHundredths: number;
  firstReceivedDate: string;
  lastReceivedDate: string;
}

interface PaidProductObservation {
  productCode: string;
  latestDescription: string;
  receiptDates: Set<string>;
  totalSpendCents: number;
  paidWeightHundredths: number;
  firstReceivedDate: string;
  lastReceivedDate: string;
}

export async function getProcurementAnalytics(
  filters: ProcurementAnalyticsFilters = {},
  now = new Date(),
  client = prisma
) {
  const lineWhere: Prisma.ProcurementLineWhereInput = {
    ...(filters.channel ? { procurementChannel: filters.channel } : {}),
    ...(filters.acquisitionClass ? { acquisitionClass: filters.acquisitionClass } : {}),
  };
  // Both OFB exports contribute. A Completed Orders Fresh Alliance event whose
  // date is covered by a Fresh Alliance import is excluded here so the
  // donor-attributed observation of the same event replaces it rather than
  // adding to it. Excluding the superseded row and including its replacement is
  // one operation; doing only half of it would move headline weight.
  const corpusWhere: Prisma.ProcurementOrderRevisionWhereInput = {
    source: { in: [...PROCUREMENT_SOURCES] },
    isCurrent: true,
    supersededByImportId: null,
    import: { status: 'active' },
  };
  const baseWhere: Prisma.ProcurementOrderRevisionWhereInput = {
    ...corpusWhere,
  };

  const [allOrderDates, settings] = await Promise.all([
    client.procurementOrderRevision.findMany({
      where: corpusWhere,
      select: { deliveryDate: true },
    }),
    getOperatingHoursSettings(client as never),
  ]);
  const preset = filters.preset ?? 'all';
  const custom = preset === 'custom' && filters.startDate && filters.endDate
    ? { startDate: filters.startDate, endDate: filters.endDate }
    : undefined;
  if (preset === 'custom' && (
    !custom || !isValidLocalDate(custom.startDate) || !isValidLocalDate(custom.endDate)
  )) {
    throw new ProcurementImportError(
      'Choose valid start and end dates for the custom analytics range.',
      'INVALID_PROCUREMENT_RANGE'
    );
  }
  if (custom && custom.endDate > localDateOf(now, settings.timezone)) {
    throw new ProcurementImportError(
      'Choose an end date that is not in the future.',
      'INVALID_PROCUREMENT_RANGE'
    );
  }
  const earliestDeliveryDate = allOrderDates.reduce<string | undefined>(
    (earliest, order) => !earliest || order.deliveryDate < earliest
      ? order.deliveryDate
      : earliest,
    undefined
  );
  const range = resolveRange(
    preset,
    settings.timezone,
    now,
    custom,
    earliestDeliveryDate
  );

  /**
   * Delivery is an event on a date, so short ranges plot the deliveries
   * themselves rather than a month's sum — which on a 30-day range collapsed
   * four charts to one or two points. Past a quarter the full span is 1,710
   * delivery dates across seventeen years, which is a smear rather than a
   * shape, so it aggregates by month. Same rule as the Service lens, shared
   * rather than restated.
   *
   * Seasonal Inbound Weight is deliberately *not* on this grain: it compares
   * calendar months across years, so its buckets are months by definition.
   */
  const bucketGranularity = granularityForRange(preset, range.startDate, range.endDate);
  const bucketFor = (deliveryDate: string) => bucketKeyFor(bucketGranularity, deliveryDate);

  const [orders, status, shapingRules] = await Promise.all([
    client.procurementOrderRevision.findMany({
      where: {
        ...baseWhere,
        deliveryDate: { gte: range.startDate, lte: range.endDate },
        lines: { some: lineWhere },
      },
      orderBy: [{ deliveryDate: 'asc' }, { sourceOrderReference: 'asc' }],
      include: {
        lines: {
          where: lineWhere,
          include: { product: { select: { productCode: true } } },
        },
      },
    }),
    getProcurementDataStatus(now, client, settings.timezone),
    // Resolved at read time against every enabled rule, never bound to an
    // import (D20). A rule saved today therefore reshapes data imported years
    // ago, and removing it restores those observations to every total.
    client.procurementDataRule.findMany({ where: { enabled: true } }),
  ]);
  const activeRules = shapingRules as DataShapingRule[];

  const eventWeights = orders.map((order) =>
    order.lines.reduce((sum, line) => sum + line.weightHundredths, 0)
  );
  const receivingDates = new Set(orders.map((order) => order.deliveryDate));
  const orderedReceivingDates = [...receivingDates].sort();
  const receivingDateGaps = orderedReceivingDates.slice(1).map((date, index) =>
    calendarDayDifference(orderedReceivingDates[index], date)
  );
  const acquisitionWeights = new Map<AcquisitionClass, number>();
  const channelWeights = new Map<ProcurementChannel, number>();
  const monthly = new Map<string, Record<string, number>>();
  /**
   * Recorded spend by delivery month.
   *
   * Kept beside the weight map rather than derived from it: weight and money
   * do not move together — a heavy donated load costs nothing, and a light
   * purchased one can be the month's largest charge. Fees and grants follow
   * the same attributability rule the totals use, so a filter that divides an
   * order leaves them out here too rather than assigning them to a month
   * arbitrarily.
   */
  const monthlySpend = new Map<string, {
    productChargesCents: number;
    serviceFeesCents: number;
    grantsAppliedCents: number;
  }>();
  const seasonal = new Map<string, number>();
  // Keyed by year-month and channel so the seasonal view can separate OFB
  // Warehouse orders from Fresh Food Alliance receipts without a second query.
  const seasonalByChannel = new Map<string, number>();
  const products = new Map<string, ProductObservation>();
  const freshAllianceCategories = new Map<string, FreshAllianceCategoryObservation>();
  // Same shape as freshAllianceCategories, split further by donor. Kept
  // separate rather than replacing the category-only map: the Fresh Food
  // Alliance Category Mix chart is legitimately still a donor-agnostic view,
  // and reconciling two derived maps against the same source lines is safer
  // than reshaping one map's meaning mid-stream.
  const freshAllianceDonorCategories = new Map<string, FreshAllianceDonorCategoryObservation>();

  // Donor observations come only from the Agency Pickups export, which is the
  // sole source that reports partner identity. FEED never infers a donor for a
  // Completed Orders receipt, so those events contribute weight without ever
  // being attributed to a partner.
  const donors = new Map<string, DonorObservation>();
  const donorMonthly = new Map<string, number>();
  // Legacy community donations, keyed by canonical source name (these rows
  // carry no OFB donor code, so the name is the identity -- D18).
  const communitySources = new Map<string, CommunitySourceObservation>();
  const communityMonthly = new Map<string, number>();
  // A legacy community source is a "Fresh Alliance partner" when its curated
  // canonical name matches a donor the live Fresh Alliance record reports. That
  // match lets its pre-Primarius history join the Fresh Alliance views (channel
  // stack, donations-over-time toggle) instead of the community cards. The map
  // is donorName -> donorCode so legacy months can be keyed by the live code.
  const normalizeDonorName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
  const freshAllianceCodeByName = new Map<string, string>();
  for (const order of orders) {
    if (order.source === FRESH_ALLIANCE_SOURCE && order.donorName && order.donorCode) {
      freshAllianceCodeByName.set(normalizeDonorName(order.donorName), order.donorCode);
    }
  }
  const freshAlliancePartnerNames = new Set<string>();
  // FFA-partner legacy weight, kept out of the community totals so the two
  // never double-count when the frontend stacks it onto the Fresh Alliance bar.
  let freshAllianceLegacyWeightHundredths = 0;
  const freshAllianceLegacyMonthly = new Map<string, number>();
  const paidProducts = new Map<string, PaidProductObservation>();
  let totalWeightHundredths = 0;
  let calculatedGrossProductChargesCents = 0;
  let sourceReportedProductChargesCents = 0;
  let serviceFeesCents = 0;
  let grantsAppliedCents = 0;
  let priceMismatchLineCount = 0;
  let zeroInboundLineCount = 0;
  const costAdjustmentsAttributable = !filters.acquisitionClass;

  // Pending weight is counted in every total above like any other observation
  // -- the agency already weighed it, and OFB's "Confirmed" checkbox is an
  // audit sign-off, not a data-quality gate (see procurement-unification-plan.md
  // D13/D15). This tracks the same weight a second time, unioned, purely so
  // Analytics can state in one sentence how much of what's already counted is
  // still awaiting that sign-off.
  // Weight the agency's own rules classify. Exclusions are subtracted from the
  // supply figure and stated outright -- an exclusion nobody can see is as
  // dishonest as an inflated total (D15 generalized, D19). Annotations are
  // measured the same way but never subtracted.
  let excludedWeightHundredths = 0;
  const flagWeights = new Map<DataShapingFlag, number>();
  const flagEvents = new Map<DataShapingFlag, Set<number>>();

  let freshAlliancePendingWeightHundredths = 0;
  let freshAlliancePendingEventCount = 0;
  let freshAlliancePendingEarliestDate: string | null = null;
  let freshAlliancePendingLatestDate: string | null = null;

  for (const order of orders) {
    const bucket = bucketFor(order.deliveryDate);
    const monthValues = monthly.get(bucket) ?? {
      donatedWeightHundredths: 0,
      purchDonWeightHundredths: 0,
      governmentWeightHundredths: 0,
      purchasedWeightHundredths: 0,
      ofbWarehouseWeightHundredths: 0,
      freshAllianceWeightHundredths: 0,
      communityDonationWeightHundredths: 0,
    };
    const donorCode = order.donorCode;
    const donorObservation = donorCode
      ? donors.get(donorCode) ?? {
        donorCode,
        donorName: order.donorName ?? donorCode,
        pickupCount: 0,
        weightHundredths: 0,
        receivingDates: new Set<string>(),
        firstReceivedDate: order.deliveryDate,
        lastReceivedDate: order.deliveryDate,
        valuedWeightHundredths: 0,
        unvaluedWeightHundredths: 0,
        recordedValueCents: 0,
        categories: new Map<string, { description: string; weightHundredths: number }>(),
      }
      : null;
    if (donorCode && donorObservation) {
      donorObservation.pickupCount += 1;
      donorObservation.receivingDates.add(order.deliveryDate);
      if (order.deliveryDate < donorObservation.firstReceivedDate) {
        donorObservation.firstReceivedDate = order.deliveryDate;
      }
      if (order.deliveryDate > donorObservation.lastReceivedDate) {
        donorObservation.lastReceivedDate = order.deliveryDate;
      }
      donors.set(donorCode, donorObservation);
    }

    // isConfirmed is null for OFB Warehouse (the concept doesn't apply there
    // -- Warehouse is Completed-only) and strictly false, never absent, for a
    // Fresh Alliance revision still awaiting OFB's review.
    if (order.isConfirmed === false) {
      freshAlliancePendingEventCount += 1;
      freshAlliancePendingWeightHundredths += order.lines.reduce(
        (sum, line) => sum + line.weightHundredths,
        0
      );
      if (!freshAlliancePendingEarliestDate || order.deliveryDate < freshAlliancePendingEarliestDate) {
        freshAlliancePendingEarliestDate = order.deliveryDate;
      }
      if (!freshAlliancePendingLatestDate || order.deliveryDate > freshAlliancePendingLatestDate) {
        freshAlliancePendingLatestDate = order.deliveryDate;
      }
    }

    for (const line of order.lines) {
      const acquisitionClass = line.acquisitionClass as AcquisitionClass;
      const channel = line.procurementChannel as ProcurementChannel;
      // Legacy months carry a source and a weight and nothing finer (D17), so
      // they contribute to weight, time, and source views but are absent from
      // every product- and category-level view below. Absence is honest;
      // a fabricated category would not be.
      const carriesProductDetail = order.source !== LEGACY_COMMUNITY_SOURCE;
      totalWeightHundredths += line.weightHundredths;

      // Flags resolve per line because weight lives on lines: a donor rule
      // reaches a line through its parent event, a category rule addresses the
      // line itself.
      if (activeRules.length > 0) {
        const flags = resolveFlags(activeRules, {
          orderRevisionId: order.id,
          source: order.source,
          deliveryDate: order.deliveryDate,
          donorName: order.donorName,
          donorCode: order.donorCode,
          productCode: line.product.productCode,
        });
        let lineExcluded = false;
        for (const flag of flags) {
          flagWeights.set(flag, (flagWeights.get(flag) ?? 0) + line.weightHundredths);
          const events = flagEvents.get(flag) ?? new Set<number>();
          events.add(order.id);
          flagEvents.set(flag, events);
          if (FLAG_FAMILY[flag] === 'exclusion') lineExcluded = true;
        }
        // Counted once however many exclusion rules happen to apply.
        if (lineExcluded) excludedWeightHundredths += line.weightHundredths;
      }
      calculatedGrossProductChargesCents += line.calculatedPriceTotalCents;
      sourceReportedProductChargesCents += line.sourcePriceTotalCents;
      const spendBucket = monthlySpend.get(bucket)
        ?? { productChargesCents: 0, serviceFeesCents: 0, grantsAppliedCents: 0 };
      spendBucket.productChargesCents += line.calculatedPriceTotalCents;
      // OFB exports place event-level fees and grants on individual source
      // rows. A channel filter retains whole source events; an acquisition
      // filter may divide one event, making its adjustments unattributable.
      if (costAdjustmentsAttributable) {
        serviceFeesCents += line.serviceFeeCents;
        grantsAppliedCents += line.grantsAppliedCents;
        spendBucket.serviceFeesCents += line.serviceFeeCents;
        spendBucket.grantsAppliedCents += line.grantsAppliedCents;
      }
      monthlySpend.set(bucket, spendBucket);
      if (!line.priceTotalMatches) priceMismatchLineCount += 1;
      // A zero-quantity line is a data-quality signal about an OFB export. A
      // legacy month legitimately has no quantity at all -- only a weight --
      // so counting it here would report a defect that does not exist.
      if (carriesProductDetail && (line.weightHundredths === 0 || line.quantityHundredths === 0)) {
        zeroInboundLineCount += 1;
      }
      acquisitionWeights.set(
        acquisitionClass,
        (acquisitionWeights.get(acquisitionClass) ?? 0) + line.weightHundredths
      );
      channelWeights.set(channel, (channelWeights.get(channel) ?? 0) + line.weightHundredths);
      const acquisitionKey = acquisitionClass === 'DONATED'
        ? 'donatedWeightHundredths'
        : acquisitionClass === 'PURCH-DON'
          ? 'purchDonWeightHundredths'
          : acquisitionClass === 'GOVERNMENT'
            ? 'governmentWeightHundredths'
            : 'purchasedWeightHundredths';
      const channelKey = channel === 'fresh_alliance'
        ? 'freshAllianceWeightHundredths'
        : channel === 'community_donation'
          ? 'communityDonationWeightHundredths'
          : 'ofbWarehouseWeightHundredths';
      monthValues[acquisitionKey] += line.weightHundredths;
      monthValues[channelKey] += line.weightHundredths;
      const yearMonth = `${order.deliveryDate.slice(0, 4)}-${order.deliveryDate.slice(5, 7)}`;
      seasonal.set(yearMonth, (seasonal.get(yearMonth) ?? 0) + line.weightHundredths);

      // Legacy community donations, aggregated by canonical source for the
      // community-history cards. Received weight, no exclusions honored here.
      if (channel === 'community_donation') {
        const sourceName = order.donorName ?? 'Unattributed';
        const partnerCode = order.donorName
          ? freshAllianceCodeByName.get(normalizeDonorName(order.donorName))
          : undefined;
        const isFreshAlliancePartner = partnerCode !== undefined;

        // Every legacy source appears in the community roster (mix card), FFA
        // partner or not -- the roster is "everyone who ever donated". The
        // isFreshAlliancePartner flag lets the frontend scope the community
        // *time-series* to non-partners, while the partner history feeds the
        // Fresh Alliance views instead.
        const community = communitySources.get(sourceName) ?? {
          sourceName,
          isFreshAlliancePartner,
          weightHundredths: 0,
          monthCount: 0,
          firstReceivedDate: order.deliveryDate,
          lastReceivedDate: order.deliveryDate,
        };
        community.weightHundredths += line.weightHundredths;
        community.monthCount += 1;
        if (order.deliveryDate < community.firstReceivedDate) community.firstReceivedDate = order.deliveryDate;
        if (order.deliveryDate > community.lastReceivedDate) community.lastReceivedDate = order.deliveryDate;
        communitySources.set(sourceName, community);
        const communityMonthKey = `${bucket}|${sourceName}`;
        communityMonthly.set(
          communityMonthKey,
          (communityMonthly.get(communityMonthKey) ?? 0) + line.weightHundredths
        );

        if (isFreshAlliancePartner) {
          freshAlliancePartnerNames.add(sourceName);
          freshAllianceLegacyWeightHundredths += line.weightHundredths;
          const legacyKey = `${bucket}|${partnerCode}`;
          freshAllianceLegacyMonthly.set(
            legacyKey,
            (freshAllianceLegacyMonthly.get(legacyKey) ?? 0) + line.weightHundredths
          );
        }
      }
      const seasonalChannelKey = `${yearMonth}|${channel}`;
      seasonalByChannel.set(
        seasonalChannelKey,
        (seasonalByChannel.get(seasonalChannelKey) ?? 0) + line.weightHundredths
      );

      if (donorObservation) {
        donorObservation.weightHundredths += line.weightHundredths;
        // Recorded in-kind value is deliberately partial: OFB leaves the rate
        // blank on a large share of historical rows. FEED sums only what the
        // source recorded and reports how much weight that covers. It never
        // imputes a rate onto unvalued weight.
        if (line.hasDonorValuation && line.donorValuePerPoundCents) {
          donorObservation.valuedWeightHundredths += line.weightHundredths;
          donorObservation.recordedValueCents += Math.round(
            line.weightHundredths * line.donorValuePerPoundCents / 100
          );
        } else {
          donorObservation.unvaluedWeightHundredths += line.weightHundredths;
        }
        const categoryCode = line.product.productCode;
        const category = donorObservation.categories.get(categoryCode)
          ?? { description: line.sourceDescription, weightHundredths: 0 };
        category.weightHundredths += line.weightHundredths;
        donorObservation.categories.set(categoryCode, category);
        const donorMonthKey = `${bucket}|${donorObservation.donorCode}`;
        donorMonthly.set(
          donorMonthKey,
          (donorMonthly.get(donorMonthKey) ?? 0) + line.weightHundredths
        );
      }

      // Paid-product analysis stays within exact OFB Warehouse product codes.
      // It does not infer a FEED category or claim that purchasing occurred
      // because donated supply was insufficient.
      if (channel === 'ofb_warehouse' && line.calculatedPriceTotalCents > 0) {
        const productCode = line.product.productCode;
        const existingPaidProduct = paidProducts.get(productCode);
        if (!existingPaidProduct) {
          paidProducts.set(productCode, {
            productCode,
            latestDescription: line.sourceDescription,
            receiptDates: new Set([order.deliveryDate]),
            totalSpendCents: line.calculatedPriceTotalCents,
            paidWeightHundredths: line.weightHundredths,
            firstReceivedDate: order.deliveryDate,
            lastReceivedDate: order.deliveryDate,
          });
        } else {
          existingPaidProduct.receiptDates.add(order.deliveryDate);
          existingPaidProduct.totalSpendCents += line.calculatedPriceTotalCents;
          existingPaidProduct.paidWeightHundredths += line.weightHundredths;
          if (order.deliveryDate >= existingPaidProduct.lastReceivedDate) {
            existingPaidProduct.lastReceivedDate = order.deliveryDate;
            existingPaidProduct.latestDescription = line.sourceDescription;
          }
          if (order.deliveryDate < existingPaidProduct.firstReceivedDate) {
            existingPaidProduct.firstReceivedDate = order.deliveryDate;
          }
        }
      }

      // Legacy months stop here: they have a source and a weight and no
      // product, so every view below -- warehouse products, Fresh Alliance
      // categories, the donor-category split -- correctly has nothing to show
      // for them (D17). Stated explicitly rather than left to the zero-quantity
      // guard, which would exclude them for the wrong reason.
      if (!carriesProductDetail) continue;

      // A completed source line with zero quantity/weight is retained for
      // provenance but is not evidence that supply was received.
      if (line.weightHundredths <= 0 || line.quantityHundredths <= 0) continue;
      const productCode = line.product.productCode;
      if (channel === 'fresh_alliance') {
        const existingCategory = freshAllianceCategories.get(productCode);
        if (!existingCategory) {
          freshAllianceCategories.set(productCode, {
            productCode,
            latestDescription: line.sourceDescription,
            receiptReferences: new Set([order.sourceOrderReference]),
            receiptDates: new Set([order.deliveryDate]),
            totalWeightHundredths: line.weightHundredths,
            firstReceivedDate: order.deliveryDate,
            lastReceivedDate: order.deliveryDate,
          });
        } else {
          existingCategory.receiptReferences.add(order.sourceOrderReference);
          existingCategory.receiptDates.add(order.deliveryDate);
          existingCategory.totalWeightHundredths += line.weightHundredths;
          if (order.deliveryDate >= existingCategory.lastReceivedDate) {
            existingCategory.lastReceivedDate = order.deliveryDate;
            existingCategory.latestDescription = line.sourceDescription;
          }
          if (order.deliveryDate < existingCategory.firstReceivedDate) {
            existingCategory.firstReceivedDate = order.deliveryDate;
          }
        }

        const donorKey = order.donorCode ?? DONOR_NOT_REPORTED;
        const donorCategoryKey = `${donorKey}|${productCode}`;
        const existingDonorCategory = freshAllianceDonorCategories.get(donorCategoryKey);
        if (!existingDonorCategory) {
          freshAllianceDonorCategories.set(donorCategoryKey, {
            donorCode: donorKey,
            donorName: order.donorName ?? donorKey,
            productCode,
            latestDescription: line.sourceDescription,
            receiptReferences: new Set([order.sourceOrderReference]),
            receiptDates: new Set([order.deliveryDate]),
            totalWeightHundredths: line.weightHundredths,
            firstReceivedDate: order.deliveryDate,
            lastReceivedDate: order.deliveryDate,
          });
        } else {
          existingDonorCategory.receiptReferences.add(order.sourceOrderReference);
          existingDonorCategory.receiptDates.add(order.deliveryDate);
          existingDonorCategory.totalWeightHundredths += line.weightHundredths;
          if (order.deliveryDate >= existingDonorCategory.lastReceivedDate) {
            existingDonorCategory.lastReceivedDate = order.deliveryDate;
            existingDonorCategory.latestDescription = line.sourceDescription;
          }
          if (order.deliveryDate < existingDonorCategory.firstReceivedDate) {
            existingDonorCategory.firstReceivedDate = order.deliveryDate;
          }
        }
        continue;
      }
      const existing = products.get(productCode);
      if (!existing) {
        products.set(productCode, {
          productCode,
          latestDescription: line.sourceDescription,
          acquisitionClass,
          procurementChannel: channel,
          receiptDates: new Set([order.deliveryDate]),
          totalWeightHundredths: line.weightHundredths,
          totalSpendCents: line.calculatedPriceTotalCents,
          paidWeightHundredths: line.calculatedPriceTotalCents > 0 ? line.weightHundredths : 0,
          firstReceivedDate: order.deliveryDate,
          lastReceivedDate: order.deliveryDate,
        });
      } else {
        existing.receiptDates.add(order.deliveryDate);
        existing.totalWeightHundredths += line.weightHundredths;
        existing.totalSpendCents += line.calculatedPriceTotalCents;
        if (line.calculatedPriceTotalCents > 0) existing.paidWeightHundredths += line.weightHundredths;
        if (order.deliveryDate >= existing.lastReceivedDate) {
          existing.lastReceivedDate = order.deliveryDate;
          existing.latestDescription = line.sourceDescription;
        }
        if (order.deliveryDate < existing.firstReceivedDate) {
          existing.firstReceivedDate = order.deliveryDate;
        }
      }
    }
    monthly.set(bucket, monthValues);
  }

  const warehouseProductSummary = [...products.values()].map((product) => {
    const receiptDates = [...product.receiptDates].sort();
    const gaps = receiptDates.slice(1).map((date, index) =>
      calendarDayDifference(receiptDates[index], date)
    );
    return {
      productCode: product.productCode,
      description: product.latestDescription,
      acquisitionClass: product.acquisitionClass,
      procurementChannel: product.procurementChannel,
      receiptDateCount: product.receiptDates.size,
      totalWeightHundredths: product.totalWeightHundredths,
      averageWeightPerReceiptHundredths: Math.round(
        product.totalWeightHundredths / product.receiptDates.size
      ),
      medianGapDays: quantile(gaps, 0.5),
      totalSpendCents: product.totalSpendCents,
      paidWeightHundredths: product.paidWeightHundredths,
      // Null for a product FEED never paid for, so the table shows "—" rather
      // than a fabricated $0.00/lb on donated supply.
      costPerPaidPoundCents: product.paidWeightHundredths > 0
        ? Math.round((product.totalSpendCents * 100) / product.paidWeightHundredths)
        : null,
      firstReceivedDate: product.firstReceivedDate,
      lastReceivedDate: product.lastReceivedDate,
    };
  }).sort((left, right) =>
    right.receiptDateCount - left.receiptDateCount ||
    right.totalWeightHundredths - left.totalWeightHundredths ||
    left.productCode.localeCompare(right.productCode)
  );
  const freshAllianceCategorySummary = [...freshAllianceCategories.values()]
    .map((category) => ({
      productCode: category.productCode,
      description: category.latestDescription,
      receiptEventCount: category.receiptReferences.size,
      receivingDateCount: category.receiptDates.size,
      totalWeightHundredths: category.totalWeightHundredths,
      firstReceivedDate: category.firstReceivedDate,
      lastReceivedDate: category.lastReceivedDate,
    }))
    .sort((left, right) =>
      right.totalWeightHundredths - left.totalWeightHundredths ||
      left.productCode.localeCompare(right.productCode)
    );
  const freshAllianceDonorCategorySummary = [...freshAllianceDonorCategories.values()]
    .map((entry) => ({
      donorCode: entry.donorCode === DONOR_NOT_REPORTED ? null : entry.donorCode,
      donorName: entry.donorCode === DONOR_NOT_REPORTED ? 'Not Reported' : entry.donorName,
      productCode: entry.productCode,
      description: entry.latestDescription,
      receiptEventCount: entry.receiptReferences.size,
      receivingDateCount: entry.receiptDates.size,
      totalWeightHundredths: entry.totalWeightHundredths,
      firstReceivedDate: entry.firstReceivedDate,
      lastReceivedDate: entry.lastReceivedDate,
    }))
    .sort((left, right) =>
      right.totalWeightHundredths - left.totalWeightHundredths ||
      left.donorName.localeCompare(right.donorName) ||
      left.productCode.localeCompare(right.productCode)
    );
  const paidProductSummary = [...paidProducts.values()]
    .map((product) => ({
      productCode: product.productCode,
      description: product.latestDescription,
      receiptDateCount: product.receiptDates.size,
      totalSpendCents: product.totalSpendCents,
      paidWeightHundredths: product.paidWeightHundredths,
      costPerPaidPoundCents: product.paidWeightHundredths > 0
        ? Math.round(product.totalSpendCents * 100 / product.paidWeightHundredths)
        : null,
      firstReceivedDate: product.firstReceivedDate,
      lastReceivedDate: product.lastReceivedDate,
    }))
    .sort((left, right) =>
      right.totalSpendCents - left.totalSpendCents ||
      left.productCode.localeCompare(right.productCode)
    );
  const warehouseOrderCount = orders.filter(
    (order) => order.eventKind === 'ofb_warehouse_order'
  ).length;
  const freshAllianceReceiptCount = orders.filter(
    (order) => order.eventKind === 'fresh_alliance_receipt'
  ).length;

  // Donor summaries are descriptive observations of what each partner
  // delivered. FEED does not rank partners, score them, or explain why a
  // partner's volume moved.
  const donorSummary = [...donors.values()]
    .map((donor) => ({
      donorCode: donor.donorCode,
      donorName: donor.donorName,
      pickupCount: donor.pickupCount,
      receivingDateCount: donor.receivingDates.size,
      weightHundredths: donor.weightHundredths,
      averageWeightPerPickupHundredths: donor.pickupCount === 0
        ? 0
        : Math.round(donor.weightHundredths / donor.pickupCount),
      valuedWeightHundredths: donor.valuedWeightHundredths,
      unvaluedWeightHundredths: donor.unvaluedWeightHundredths,
      recordedValueCents: donor.recordedValueCents,
      firstReceivedDate: donor.firstReceivedDate,
      lastReceivedDate: donor.lastReceivedDate,
      categories: [...donor.categories.entries()]
        .map(([productCode, category]) => ({
          productCode,
          description: category.description,
          weightHundredths: category.weightHundredths,
        }))
        .sort((left, right) => right.weightHundredths - left.weightHundredths),
    }))
    .sort((left, right) => right.weightHundredths - left.weightHundredths);

  const donorWeightHundredths = donorSummary
    .reduce((total, donor) => total + donor.weightHundredths, 0);
  const donorValuedWeightHundredths = donorSummary
    .reduce((total, donor) => total + donor.valuedWeightHundredths, 0);

  return {
    dataAsOf: now.toISOString(),
    status,
    range: {
      preset,
      startDate: range.startDate,
      endDate: range.endDate,
      timeZone: range.timeZone,
    },
    filters: {
      channel: filters.channel ?? null,
      acquisitionClass: filters.acquisitionClass ?? null,
    },
    availableYears: [...new Set(orders.map((order) => order.deliveryDate.slice(0, 4)))]
      .sort((left, right) => right.localeCompare(left)),
    summary: {
      totalWeightHundredths,
      sourceEventCount: orders.length,
      warehouseOrderCount,
      freshAllianceReceiptCount,
      receivingDateCount: receivingDates.size,
      medianReceivingGapDays: quantile(receivingDateGaps, 0.5),
      medianEventWeightHundredths: quantile(eventWeights, 0.5),
      lowerQuartileEventWeightHundredths: quantile(eventWeights, 0.25),
      upperQuartileEventWeightHundredths: quantile(eventWeights, 0.75),
      medianLinesPerEvent: quantile(orders.map((order) => order.lines.length), 0.5),
      warehouseProductCodes: products.size,
      freshAllianceCategoryCodes: freshAllianceCategorySummary.length,
      zeroInboundLineCount,
      calculatedGrossProductChargesCents,
      sourceReportedProductChargesCents,
      costAdjustmentsAttributable,
      serviceFeesCents: costAdjustmentsAttributable ? serviceFeesCents : null,
      grantsAppliedCents: costAdjustmentsAttributable ? grantsAppliedCents : null,
      netRecordedCostCents: costAdjustmentsAttributable
        ? calculatedGrossProductChargesCents + serviceFeesCents - grantsAppliedCents
        : null,
      priceMismatchLineCount,
      // Weight already counted in every total above; this is the same
      // observation viewed a second time, not a separate figure. null when
      // nothing in the current range/filters is pending -- e.g. a Warehouse-
      // only channel filter, or simply no unconfirmed receipts right now.
      freshAlliancePending: freshAlliancePendingEventCount === 0 ? null : {
        weightHundredths: freshAlliancePendingWeightHundredths,
        eventCount: freshAlliancePendingEventCount,
        earliestDeliveryDate: freshAlliancePendingEarliestDate,
        latestDeliveryDate: freshAlliancePendingLatestDate,
      },
      // Legacy weight from sources the live Fresh Alliance record also reports.
      // Already counted inside the community_donation channel; this names the
      // portion the frontend stacks onto the Fresh Alliance bar (and removes
      // from the legacy bar) so the two never double-count.
      freshAllianceLegacyWeightHundredths,
    },
    acquisitionMix: ACQUISITION_CLASSES.map((acquisitionClass) => ({
      acquisitionClass,
      weightHundredths: acquisitionWeights.get(acquisitionClass) ?? 0,
    })),
    // The two OFB channels are always reported, at zero if need be: FEED
    // imports both, so "none this range" is a real observation. The legacy
    // community channel appears only once it holds weight -- it is a
    // single-agency sidecar (D22), and a permanently-zero row would imply
    // every other agency has a source it will never have.
    channelMix: PROCUREMENT_CHANNELS
      .filter((channel) => channel !== 'community_donation'
        || (channelWeights.get(channel) ?? 0) > 0)
      .map((channel) => ({
        channel,
        weightHundredths: channelWeights.get(channel) ?? 0,
      })),
    bucketGranularity,
    monthlySpend: [...monthlySpend.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucket, values]) => ({
        bucket,
        ...values,
        netRecordedCostCents:
          values.productChargesCents + values.serviceFeesCents - values.grantsAppliedCents,
      })),
    monthlyWeight: [...monthly.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucket, values]) => ({ bucket, ...values })),
    seasonalWeight: [...seasonal.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([yearMonth, weightHundredths]) => ({
        year: yearMonth.slice(0, 4),
        month: Number(yearMonth.slice(5, 7)),
        weightHundredths,
      })),
    seasonalChannelWeight: [...seasonalByChannel.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, weightHundredths]) => {
        const [yearMonth, channel] = key.split('|');
        return {
          year: yearMonth.slice(0, 4),
          month: Number(yearMonth.slice(5, 7)),
          channel: channel as ProcurementChannel,
          weightHundredths,
        };
      }),
    warehouseProducts: warehouseProductSummary,
    paidProducts: paidProductSummary,
    freshAllianceCategories: freshAllianceCategorySummary,
    freshAllianceDonorCategories: freshAllianceDonorCategorySummary,
    donors: donorSummary,
    donorMonthlyWeight: [...donorMonthly.entries()]
      .map(([key, weightHundredths]) => {
        const [bucket, donorCode] = key.split('|');
        return { bucket, donorCode, weightHundredths };
      })
      .sort((left, right) => left.bucket.localeCompare(right.bucket)
        || left.donorCode.localeCompare(right.donorCode)),
    // Legacy community donation history, by canonical source and by source-month.
    // A "received" view of donations as an activity (D21), keyed on the curated
    // name because these rows carry no OFB code (D18). Sorted heaviest first so
    // the frontend's named-vs-"Other Community sources" split is a simple slice.
    communitySources: [...communitySources.values()]
      .map((source) => ({
        sourceName: source.sourceName,
        isFreshAlliancePartner: source.isFreshAlliancePartner,
        weightHundredths: source.weightHundredths,
        monthCount: source.monthCount,
        firstReceivedDate: source.firstReceivedDate,
        lastReceivedDate: source.lastReceivedDate,
      }))
      .sort((left, right) => right.weightHundredths - left.weightHundredths
        || left.sourceName.localeCompare(right.sourceName)),
    communityMonthlyWeight: [...communityMonthly.entries()]
      .map(([key, weightHundredths]) => {
        const separator = key.indexOf('|');
        return {
          bucket: key.slice(0, separator),
          sourceName: key.slice(separator + 1),
          weightHundredths,
        };
      })
      .sort((left, right) => left.bucket.localeCompare(right.bucket)
        || left.sourceName.localeCompare(right.sourceName)),
    // Fresh Alliance partners' pre-Primarius history, keyed by the live donor
    // code so the Donations-Over-Time chart can extend those partners' lines
    // back before 2023 when the "Show Legacy Data" toggle is on. Kept separate
    // from donorMonthlyWeight so it is opt-in, never silently merged.
    freshAllianceLegacyMonthlyWeight: [...freshAllianceLegacyMonthly.entries()]
      .map(([key, weightHundredths]) => {
        const separator = key.indexOf('|');
        return {
          bucket: key.slice(0, separator),
          donorCode: key.slice(separator + 1),
          weightHundredths,
        };
      })
      .sort((left, right) => left.bucket.localeCompare(right.bucket)
        || left.donorCode.localeCompare(right.donorCode)),
    // What the agency's own rules did to these numbers, stated plainly so an
    // exclusion is never invisible. `totalWeightHundredths` above remains
    // everything received; `retainedWeightHundredths` is what is left after
    // honoring exclusions -- two honest answers to two different questions
    // (D21), from the same untouched observations.
    dataShaping: {
      excludedWeightHundredths,
      retainedWeightHundredths: totalWeightHundredths - excludedWeightHundredths,
      flags: [...flagWeights.entries()]
        .map(([flag, weightHundredths]) => ({
          flag,
          family: FLAG_FAMILY[flag],
          weightHundredths,
          eventCount: flagEvents.get(flag)?.size ?? 0,
        }))
        .sort((left, right) => right.weightHundredths - left.weightHundredths),
    },
    donorValue: {
      // Stated with its coverage because OFB left the rate blank on a large
      // share of historical rows. Value is summed only where recorded, and the
      // uncovered weight is reported alongside it rather than imputed.
      recordedValueCents: donorSummary.reduce((total, donor) => total + donor.recordedValueCents, 0),
      valuedWeightHundredths: donorValuedWeightHundredths,
      totalWeightHundredths: donorWeightHundredths,
      unvaluedWeightHundredths: donorWeightHundredths - donorValuedWeightHundredths,
    },
  };
}

// ---------------------------------------------------------------------------
// Data-shaping rules (D19/D20)
//
// Persistence for the classification overlay. Rules are stored, never applied
// destructively: nothing here touches an observation. Analytics resolves the
// flags at read time, which is what lets a rule added or disabled today
// reshape data imported months ago without a re-import.
// ---------------------------------------------------------------------------

export type StoredDataShapingRule = DataShapingRule & {
  id: number;
  enabled: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toStoredRule(row: {
  id: number;
  flag: string;
  scope: string;
  donorName: string | null;
  donorCode: string | null;
  productCode: string | null;
  orderRevisionId: number | null;
  source: string | null;
  startDate: string | null;
  endDate: string | null;
  enabled: boolean;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): StoredDataShapingRule {
  return {
    ...row,
    flag: row.flag as DataShapingFlag,
    scope: row.scope as RuleScope,
  };
}

export async function listDataShapingRules(client = prisma): Promise<StoredDataShapingRule[]> {
  const rows = await client.procurementDataRule.findMany({
    orderBy: [{ scope: 'asc' }, { donorName: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toStoredRule);
}

/**
 * Rules that Analytics should evaluate. Disabled rules are excluded here rather
 * than filtered downstream, so a disabled rule cannot be honored by accident.
 */
export async function listActiveDataShapingRules(client = prisma): Promise<StoredDataShapingRule[]> {
  const rows = await client.procurementDataRule.findMany({ where: { enabled: true } });
  return rows.map(toStoredRule);
}

export async function createDataShapingRule(
  input: DataShapingRule,
  createdBy?: string,
  client = prisma
): Promise<StoredDataShapingRule> {
  const errors = validateRule(input);
  if (errors.length > 0) {
    throw new ProcurementImportError(errors[0], 'INVALID_DATA_RULE', 400, errors);
  }
  const created = await client.procurementDataRule.create({
    data: {
      flag: input.flag,
      scope: input.scope,
      donorName: input.donorName ?? null,
      donorCode: input.donorCode ?? null,
      productCode: input.productCode ?? null,
      orderRevisionId: input.orderRevisionId ?? null,
      source: input.source ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      enabled: input.enabled ?? true,
      note: input.note ?? null,
      createdBy: createdBy ?? null,
    },
  });
  return toStoredRule(created);
}

export async function updateDataShapingRule(
  id: number,
  input: Partial<DataShapingRule>,
  client = prisma
): Promise<StoredDataShapingRule> {
  const existing = await client.procurementDataRule.findUnique({ where: { id } });
  if (!existing) {
    throw new ProcurementImportError('That rule no longer exists.', 'DATA_RULE_NOT_FOUND', 404);
  }

  // Validate the rule as it will be, not just the fields that changed -- a
  // partial edit can otherwise leave a scope without its primary matcher.
  const merged = { ...toStoredRule(existing), ...input } as DataShapingRule;
  const errors = validateRule(merged);
  if (errors.length > 0) {
    throw new ProcurementImportError(errors[0], 'INVALID_DATA_RULE', 400, errors);
  }

  const updated = await client.procurementDataRule.update({
    where: { id },
    data: {
      flag: merged.flag,
      scope: merged.scope,
      donorName: merged.donorName ?? null,
      donorCode: merged.donorCode ?? null,
      productCode: merged.productCode ?? null,
      orderRevisionId: merged.orderRevisionId ?? null,
      source: merged.source ?? null,
      startDate: merged.startDate ?? null,
      endDate: merged.endDate ?? null,
      enabled: merged.enabled ?? true,
      note: merged.note ?? null,
    },
  });
  return toStoredRule(updated);
}

/**
 * Deleting a rule only removes an interpretation. Every observation it ever
 * touched is untouched and reappears in the metrics that had honored it.
 */
export async function deleteDataShapingRule(id: number, client = prisma): Promise<void> {
  const existing = await client.procurementDataRule.findUnique({ where: { id } });
  if (!existing) {
    throw new ProcurementImportError('That rule no longer exists.', 'DATA_RULE_NOT_FOUND', 404);
  }
  await client.procurementDataRule.delete({ where: { id } });
}
