import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, test, vi } from 'vitest';
import {
  FRESH_ALLIANCE_HEADERS,
  importFreshAllianceCsv,
  parseFreshAllianceCsv,
} from '../../../src/services/procurement/fresh-alliance';
import {
  FRESH_ALLIANCE_SOURCE,
  OFB_HEADERS,
  OFB_SOURCE,
  ProcurementImportError,
  getProcurementDataStatus,
  importOfbCsv,
  rollbackProcurementImports,
  restoreProcurementImports,
} from '../../../src/services/procurement';

const csv = (...rows: string[]) => Buffer.from([
  FRESH_ALLIANCE_HEADERS.join(','),
  ...rows,
].join('\r\n'));

// Date,Period,Pickup Time,Pickup ID,Pickup Reference,Pickup Line ID,Donor Code,
// Donor Name,Product #,Product Description,Category,Fresh Alliance Category,Qty,
// Weight,Received Qty,Received Weight,Temperature,Submitted Date/Time,
// Donor Value Per Pound
const row = (overrides: Partial<Record<string, string>> = {}) => {
  const fields: Record<string, string> = {
    date: '1/6/26',
    period: '1-Jan',
    pickupTime: '9:00 AM',
    pickupId: '445624',
    pickupReference: '1155954AGPCKUP',
    pickupLineId: '1847707',
    donorCode: 'RTJ146',
    donorName: "Trader Joe's - Northwest",
    productCode: '40000',
    description: 'Bread & Bakery (Fresh Alliance)',
    category: 'DONATED',
    faCategory: 'e Retail-Wholesale',
    qty: '20.00',
    weight: '20.00',
    receivedQty: '20.00',
    receivedWeight: '20.00',
    temperature: '',
    submitted: '1/6/2026 2:33 PM',
    donorValue: '1.45',
    ...overrides,
  };
  return [
    fields.date, fields.period, fields.pickupTime, fields.pickupId,
    fields.pickupReference, fields.pickupLineId, fields.donorCode,
    `"${fields.donorName}"`, fields.productCode, `"${fields.description}"`,
    fields.category, fields.faCategory, fields.qty, fields.weight,
    fields.receivedQty, fields.receivedWeight, fields.temperature,
    fields.submitted, fields.donorValue,
  ].join(',');
};

describe('Fresh Alliance pickup import normalization', () => {
  test('normalizes donor identity and groups observations by pickup reference', () => {
    const parsed = parseFreshAllianceCsv(csv(
      row(),
      row({ pickupLineId: '1847708', productCode: '41000', description: 'Produce (Fresh Alliance)', qty: '391.00', weight: '391.00', receivedQty: '391.00', receivedWeight: '391.00' }),
      row({ date: '1/13/26', pickupReference: '1156880AGPCKUP', pickupId: '445700', pickupLineId: '1847900', donorCode: 'RAZ100', donorName: 'Amazon - NW Industrial (Prime Now)', submitted: '1/13/2026 1:12 PM' })
    ));

    expect(parsed.rowCount).toBe(3);
    expect(parsed.pickups).toHaveLength(2);
    expect(parsed.rangeStart).toBe('2026-01-06');
    expect(parsed.rangeEnd).toBe('2026-01-13');
    expect(parsed.warnings).toEqual([]);

    expect(parsed.pickups[0]).toMatchObject({
      sourcePickupReference: '1155954AGPCKUP',
      sourcePickupId: '445624',
      eventKind: 'fresh_alliance_receipt',
      deliveryDate: '2026-01-06',
      pickupTime: '09:00',
      submittedAt: '2026-01-06T14:33',
      donorCode: 'RTJ146',
      donorName: "Trader Joe's - Northwest",
      // Today's 19-column contract can only carry OFB-confirmed pickups; see
      // fresh-alliance-pending-pickups.md.
      isConfirmed: true,
    });
    expect(parsed.pickups[0].lines).toHaveLength(2);
    expect(parsed.pickups[0].lines[0]).toMatchObject({
      productCode: '40000',
      acquisitionClass: 'DONATED',
      freshAllianceCategory: 'e Retail-Wholesale',
      quantityHundredths: 2000,
      weightHundredths: 2000,
      receivedQuantityHundredths: 2000,
      receivedWeightHundredths: 2000,
      receivedMatchesRequested: true,
      donorValuePerPoundCents: 145,
      hasDonorValuation: true,
    });
    expect(parsed.pickups[1]).toMatchObject({
      donorName: 'Amazon - NW Industrial (Prime Now)',
      pickupTime: '09:00',
    });
  });

  test('classifies every event as a Fresh Alliance receipt regardless of reference suffix', () => {
    // The export itself is the channel classifier. Reference suffixes and
    // product-code prefixes are never consulted.
    const parsed = parseFreshAllianceCsv(csv(row({ pickupReference: '9001234' })));
    expect(parsed.pickups[0].eventKind).toBe('fresh_alliance_receipt');
    expect(parsed.pickups[0].sourcePickupReference).toBe('9001234');
  });

  test('treats the 12:00 AM placeholder as an unknown pickup time', () => {
    const parsed = parseFreshAllianceCsv(csv(row({ pickupTime: '12:00 AM' })));
    expect(parsed.pickups[0].pickupTime).toBeNull();
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toMatchObject({ code: 'UNKNOWN_PICKUP_TIME', deliveryDate: '2026-01-06' });
    expect(parsed.pickups[0].warningCodes).toContain('UNKNOWN_PICKUP_TIME');
  });

  test('keeps midday and midnight conversions distinct', () => {
    expect(parseFreshAllianceCsv(csv(row({ pickupTime: '12:30 AM' }))).pickups[0].pickupTime).toBe('00:30');
    expect(parseFreshAllianceCsv(csv(row({ pickupTime: '12:00 PM' }))).pickups[0].pickupTime).toBe('12:00');
    expect(parseFreshAllianceCsv(csv(row({ pickupTime: '1:05 PM' }))).pickups[0].pickupTime).toBe('13:05');
  });

  test('records a missing donor valuation without discarding the weight', () => {
    const parsed = parseFreshAllianceCsv(csv(row({ donorValue: '0.00' })));
    expect(parsed.pickups[0].lines[0]).toMatchObject({
      weightHundredths: 2000,
      donorValuePerPoundCents: 0,
      hasDonorValuation: false,
    });
    expect(parsed.warnings[0].code).toBe('MISSING_DONOR_VALUATION');
  });

  test('retains both requested and received values when they disagree', () => {
    const parsed = parseFreshAllianceCsv(csv(row({ receivedWeight: '18.00' })));
    expect(parsed.pickups[0].lines[0]).toMatchObject({
      weightHundredths: 2000,
      receivedWeightHundredths: 1800,
      receivedMatchesRequested: false,
    });
    expect(parsed.warnings[0].code).toBe('RECEIVED_VARIANCE');
  });

  test('accepts a blank received value as an absence rather than a malformed row', () => {
    const parsed = parseFreshAllianceCsv(csv(row({ receivedQty: '', receivedWeight: '' })));
    expect(parsed.pickups[0].lines[0]).toMatchObject({
      receivedQuantityHundredths: null,
      receivedWeightHundredths: null,
      receivedMatchesRequested: false,
    });
  });

  test('validates temperature when present but never persists it', () => {
    const parsed = parseFreshAllianceCsv(csv(row({ temperature: '38.5' })));
    expect(parsed.pickups[0].lines[0]).not.toHaveProperty('temperature');
    expect(parsed.warnings).toEqual([]);
    expect(() => parseFreshAllianceCsv(csv(row({ temperature: 'cold' }))))
      .toThrowError(ProcurementImportError);
  });

  test('produces a stable snapshot hash that ignores source row order', () => {
    const a = row({ pickupLineId: '1', productCode: '40000' });
    const b = row({ pickupLineId: '2', productCode: '41000', description: 'Produce (Fresh Alliance)' });
    const forward = parseFreshAllianceCsv(csv(a, b)).pickups[0].snapshotHash;
    const reversed = parseFreshAllianceCsv(csv(b, a)).pickups[0].snapshotHash;
    expect(forward).toBe(reversed);
  });

  test('changes the snapshot hash when the donor changes', () => {
    const base = parseFreshAllianceCsv(csv(row())).pickups[0].snapshotHash;
    const moved = parseFreshAllianceCsv(csv(row({ donorCode: 'RFM360', donorName: 'Fred Meyer - Stadium' })))
      .pickups[0].snapshotHash;
    expect(moved).not.toBe(base);
  });

  test('summarizes repeated notes into one entry per code', () => {
    const parsed = parseFreshAllianceCsv(csv(
      row({ donorValue: '0.00' }),
      row({ pickupLineId: '1847708', productCode: '41000', description: 'Produce (Fresh Alliance)', donorValue: '0.00' })
    ));

    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toMatchObject({
      code: 'MISSING_DONOR_VALUATION',
      rowNumbers: [2, 3],
      deliveryDate: '2026-01-06',
    });
    expect(parsed.warnings[0].message).toContain('2 rows');
    // The pickup still knows which codes touched it.
    expect(parsed.pickups[0].warningCodes).toEqual(['MISSING_DONOR_VALUATION']);
  });

  test('rejects structural mismatches rather than guessing', () => {
    expect(() => parseFreshAllianceCsv(Buffer.from('Date,Period,Order #\r\n1/6/26,1-Jan,1')))
      .toThrowError(ProcurementImportError);
    expect(() => parseFreshAllianceCsv(Buffer.from(''))).toThrowError(ProcurementImportError);
    expect(() => parseFreshAllianceCsv(csv(row({ productCode: '400' })))).toThrowError(ProcurementImportError);
    expect(() => parseFreshAllianceCsv(csv(row({ category: 'PURCHASED' })))).toThrowError(ProcurementImportError);
    expect(() => parseFreshAllianceCsv(csv(row({ donorName: '' })))).toThrowError(ProcurementImportError);
  });

  test('rejects a duplicate pickup line ID', () => {
    expect(() => parseFreshAllianceCsv(csv(row(), row({ productCode: '41000' }))))
      .toThrowError(/Pickup line 1847707 appears on rows 2 and 3/);
  });

  test('rejects one pickup reference reporting two donors or two dates', () => {
    expect(() => parseFreshAllianceCsv(csv(
      row(),
      row({ pickupLineId: '1847708', donorCode: 'RFM360', donorName: 'Fred Meyer - Stadium' })
    ))).toThrowError(/reports more than one Donor Code/);

    expect(() => parseFreshAllianceCsv(csv(
      row(),
      row({ pickupLineId: '1847708', date: '1/7/26' })
    ))).toThrowError(/reports more than one Date/);
  });
});

// The authoritative corpus is private agency data kept outside this repository.
// Authorized developers can opt in with FEED_PRIVATE_DATA_DIR; everyone else
// runs the synthetic regression suite above. Expected values come from
// docs/data-management/fresh-alliance-coverage-verification.md.
const privateDataRoot = process.env.FEED_PRIVATE_DATA_DIR;
const corpusPath = privateDataRoot
  ? path.resolve(
      privateDataRoot,
      'FreshFoodData/OFB_Fresh_Alliance_Pickups_2009-01-01_to_2026-07-20.csv'
    )
  : '';

describe.skipIf(!corpusPath || !existsSync(corpusPath))('Fresh Alliance authoritative corpus', () => {
  test('normalizes the complete pickup history without structural failure', () => {
    const parsed = parseFreshAllianceCsv(readFileSync(corpusPath));

    expect(parsed.rowCount).toBe(3933);
    expect(parsed.pickups).toHaveLength(826);
    expect(parsed.rangeStart).toBe('2023-06-01');
    expect(parsed.rangeEnd).toBe('2026-06-30');

    const lines = parsed.pickups.flatMap((pickup) => pickup.lines);
    expect(lines).toHaveLength(3933);

    // 569,969 lb, matching the verified parity figure against the AGPCKUP subset.
    const weight = lines.reduce((total, line) => total + line.weightHundredths, 0);
    const received = lines.reduce((total, line) => total + (line.receivedWeightHundredths ?? 0), 0);
    expect(weight).toBe(56996900);
    expect(received).toBe(56996900);

    // Received equals requested on every historical row.
    expect(lines.filter((line) => !line.receivedMatchesRequested)).toHaveLength(0);

    // 29% of poundage carries no recorded valuation; it must survive as weight.
    expect(lines.filter((line) => !line.hasDonorValuation)).toHaveLength(1108);

    expect(parsed.pickups.filter((pickup) => pickup.pickupTime === null)).toHaveLength(62);

    const donors = new Set(parsed.pickups.map((pickup) => pickup.donorCode));
    expect(donors.size).toBe(7);

    // The real corpus is entirely OFB-confirmed history; every pickup parses
    // as confirmed until the extension can emit an unconfirmed row.
    expect(parsed.pickups.every((pickup) => pickup.isConfirmed === true)).toBe(true);

    const codes = new Set(parsed.warnings.map((warning) => warning.code));
    expect([...codes].sort()).toEqual(['MISSING_DONOR_VALUATION', 'UNKNOWN_PICKUP_TIME']);

    // Per-row notes are summarized, so a full-history import returns two
    // entries rather than 1,170. Every affected row is still addressable.
    expect(parsed.warnings).toHaveLength(2);
    const byCode = new Map(parsed.warnings.map((warning) => [warning.code, warning]));
    expect(byCode.get('MISSING_DONOR_VALUATION')!.rowNumbers).toHaveLength(1108);
    expect(byCode.get('UNKNOWN_PICKUP_TIME')!.rowNumbers).toHaveLength(62);
    expect(byCode.get('MISSING_DONOR_VALUATION')!.message).toBe(
      '1,108 rows record no donor value per pound. FEED retained their weight and excluded them from in-kind value.'
    );
  });
});

describe('Fresh Alliance persistence and supersede lifecycle', () => {
  const singlePickup = () => csv(row());

  /**
   * Minimal transaction double shaped like the Prisma client the service uses.
   *
   * The warehouse import writes in bulk (one `createMany` for a whole batch,
   * then a read-back for the generated ids, since SQLite cannot return them),
   * so the product and revision doubles carry just enough state to honour that
   * round-trip. A double that returned a fixed `[]` would let the service
   * "succeed" while silently associating every line with no revision.
   */
  const makeTx = (overrides: Record<string, unknown> = {}) => {
    const productsByCode = new Map<
      string,
      { id: number; productCode: string; acquisitionClass: string }
    >();
    const createdRevisions: { id: number; sourceOrderReference: string }[] = [];
    let nextProductId = 3;
    let nextRevisionId = 55;

    const base = {
      procurementOrderRevision: {
        // Two callers: the pre-import snapshot probe (no `importId` filter)
        // and the read-back of rows just written (filtered by `importId`).
        findMany: vi.fn(async (args: { where?: { importId?: number } } = {}) =>
          args?.where?.importId === undefined ? [] : createdRevisions
        ),
        findFirst: vi.fn().mockResolvedValue(null),
        groupBy: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn(async () => ({ id: nextRevisionId++ })),
        createMany: vi.fn(async (args: { data: { sourceOrderReference: string }[] }) => {
          for (const row of args.data) {
            createdRevisions.push({
              id: nextRevisionId++,
              sourceOrderReference: row.sourceOrderReference,
            });
          }
          return { count: args.data.length };
        }),
      },
      procurementImport: {
        create: vi.fn().mockResolvedValue({ id: 7 }),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      procurementProduct: {
        upsert: vi.fn().mockResolvedValue({ id: 3 }),
        findMany: vi.fn(async (args: { where?: { productCode?: { in?: string[] } } } = {}) =>
          (args?.where?.productCode?.in ?? [])
            .map((code) => productsByCode.get(code))
            .filter((row): row is NonNullable<typeof row> => row !== undefined)
        ),
        createMany: vi.fn(async (args: {
          data: { productCode: string; acquisitionClass: string }[];
        }) => {
          for (const row of args.data) {
            productsByCode.set(row.productCode, {
              id: nextProductId++,
              productCode: row.productCode,
              acquisitionClass: row.acquisitionClass,
            });
          }
          return { count: args.data.length };
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      procurementLine: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };

    // Merge per model rather than replacing it, so a test overriding one
    // method keeps the rest of that model's double intact.
    const merged: Record<string, unknown> = { ...base };
    for (const [model, methods] of Object.entries(overrides)) {
      merged[model] = { ...(base as Record<string, unknown>)[model] as object, ...(methods as object) };
    }
    return merged as typeof base;
  };

  const asClient = (tx: ReturnType<typeof makeTx>) => ({
    $transaction: vi.fn(async (operation: (value: typeof tx) => unknown) => operation(tx)),
  } as never);

  test('persists donor identity and pickup provenance on the revision', async () => {
    const tx = makeTx();
    await importFreshAllianceCsv(singlePickup(), 'staff@example.org', asClient(tx));

    // Revisions are written in one batched `createMany`, so the provenance
    // fields are asserted on the row inside that batch rather than on a
    // per-pickup `create`.
    expect(tx.procurementOrderRevision.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            source: FRESH_ALLIANCE_SOURCE,
            sourceOrderReference: '1155954AGPCKUP',
            eventKind: 'fresh_alliance_receipt',
            deliveryDate: '2026-01-06',
            donorCode: 'RTJ146',
            donorName: "Trader Joe's - Northwest",
            sourcePickupId: '445624',
            pickupTime: '09:00',
            submittedAt: '2026-01-06T14:33',
            isConfirmed: true,
          }),
        ]),
      })
    );
  });

  test('records donated lines with factual zero cost and full received detail', async () => {
    const tx = makeTx();
    await importFreshAllianceCsv(singlePickup(), undefined, asClient(tx));

    const [{ data }] = tx.procurementLine.createMany.mock.calls[0] as [{ data: Record<string, unknown>[] }];
    expect(data[0]).toMatchObject({
      procurementChannel: 'fresh_alliance',
      weightHundredths: 2000,
      receivedWeightHundredths: 2000,
      receivedMatchesRequested: true,
      donorValuePerPoundCents: 145,
      hasDonorValuation: true,
      unitPriceCents: 0,
      calculatedPriceTotalCents: 0,
      serviceFeeCents: 0,
      grantsAppliedCents: 0,
    });
  });

  test('supersedes only Completed Orders Fresh Alliance events inside the imported window', async () => {
    const tx = makeTx();
    await importFreshAllianceCsv(singlePickup(), undefined, asClient(tx));

    const supersedeCall = tx.procurementOrderRevision.updateMany.mock.calls.find(
      ([arg]) => (arg as { data?: Record<string, unknown> }).data?.supersededByImportId === 7
    );
    expect(supersedeCall).toBeDefined();
    expect(supersedeCall![0]).toMatchObject({
      where: {
        source: OFB_SOURCE,
        eventKind: 'fresh_alliance_receipt',
        deliveryDate: { gte: '2026-01-06', lte: '2026-01-06' },
        // Only unclaimed events, so overlapping imports stay deterministic.
        supersededByImportId: null,
      },
    });
  });

  test('an unchanged re-import is a no-op that supersedes nothing', async () => {
    const parsed = parseFreshAllianceCsv(singlePickup());
    const tx = makeTx({
      procurementOrderRevision: {
        findMany: vi.fn().mockResolvedValue([{
          sourceOrderReference: '1155954AGPCKUP',
          snapshotHash: parsed.pickups[0].snapshotHash,
        }]),
        findFirst: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn(),
        create: vi.fn(),
      },
    });

    await expect(importFreshAllianceCsv(singlePickup(), undefined, asClient(tx)))
      .resolves.toMatchObject({
        outcome: 'duplicate',
        pickupCount: 0,
        skippedPickupCount: 1,
        supersededEventCount: 0,
      });
    expect(tx.procurementImport.create).not.toHaveBeenCalled();
    expect(tx.procurementOrderRevision.updateMany).not.toHaveBeenCalled();
  });

  test('rolling back a Fresh Alliance import releases exactly what it claimed', async () => {
    const tx = makeTx({
      procurementImport: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{
          id: 7,
          source: FRESH_ALLIANCE_SOURCE,
          rangeStart: '2026-01-06',
          rangeEnd: '2026-01-06',
          orders: [{ source: FRESH_ALLIANCE_SOURCE, sourceOrderReference: '1155954AGPCKUP' }],
        }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });

    await rollbackProcurementImports([7], 'staff@example.org', asClient(tx));

    expect(tx.procurementOrderRevision.updateMany).toHaveBeenCalledWith({
      where: { supersededByImportId: 7 },
      data: { supersededByImportId: null },
    });
  });

  test('restoring a Fresh Alliance import reclaims its recorded window', async () => {
    const tx = makeTx({
      procurementImport: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{
          id: 7,
          source: FRESH_ALLIANCE_SOURCE,
          rangeStart: '2023-06-01',
          rangeEnd: '2026-06-30',
          orders: [{ source: FRESH_ALLIANCE_SOURCE, sourceOrderReference: '1155954AGPCKUP' }],
        }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });

    await restoreProcurementImports([7], undefined, asClient(tx));

    expect(tx.procurementOrderRevision.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: OFB_SOURCE,
          eventKind: 'fresh_alliance_receipt',
          deliveryDate: { gte: '2023-06-01', lte: '2026-06-30' },
          supersededByImportId: null,
        }),
        data: { supersededByImportId: 7 },
      })
    );
  });

  test('re-importing Completed Orders cannot reintroduce double counting', async () => {
    // Fresh AGPCKUP revisions land unclaimed, so every active Fresh Alliance
    // import must reassert its window after the orders import writes.
    const tx = makeTx({
      procurementImport: {
        create: vi.fn().mockResolvedValue({ id: 9 }),
        findMany: vi.fn().mockResolvedValue([
          { id: 7, rangeStart: '2023-06-01', rangeEnd: '2026-06-30' },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });

    const ofbCsv = Buffer.from([
      OFB_HEADERS.join(','),
      '1/6/26,1-Jan,790541AGPCKUP,40000,Fresh Alliance Bread,DONATED,20.00,20.00,$0.00,$0.00,$0.00,$0.00',
    ].join('\r\n'));

    await importOfbCsv(ofbCsv, undefined, asClient(tx));

    expect(tx.procurementImport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { source: FRESH_ALLIANCE_SOURCE, status: 'active' } })
    );
    expect(tx.procurementOrderRevision.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deliveryDate: { gte: '2023-06-01', lte: '2026-06-30' },
          supersededByImportId: null,
        }),
        data: { supersededByImportId: 7 },
      })
    );
  });
});

describe('Per-channel coverage reporting', () => {
  const coverageClient = (
    warehouse: { min: string | null; max: string | null; count: number },
    fresh: { min: string | null; max: string | null; count: number }
  ) => {
    const aggregate = vi.fn(async ({ where }: { where: { eventKind?: string } }) => {
      const source = where.eventKind === 'fresh_alliance_receipt' ? fresh : warehouse;
      return {
        _min: { deliveryDate: source.min },
        _max: { deliveryDate: source.max },
        _count: { _all: source.count },
      };
    });
    return {
      client: {
        procurementOrderRevision: {
          findFirst: vi.fn().mockResolvedValue({ deliveryDate: '2026-07-13' }),
          aggregate,
        },
      } as never,
      aggregate,
    };
  };

  test('reports each channel window separately rather than assuming they match', async () => {
    // The real corpus behaves exactly this way: warehouse orders reach
    // 2026-07-13 while Fresh Alliance entry lags at 2026-06-30.
    const { client } = coverageClient(
      { min: '2009-01-05', max: '2026-07-13', count: 2100 },
      { min: '2023-06-01', max: '2026-06-30', count: 826 }
    );

    const status = await getProcurementDataStatus(
      new Date('2026-07-20T18:00:00Z'),
      client,
      'America/Los_Angeles'
    );

    expect(status.coverage).toEqual({
      warehouse: {
        eventCount: 2100,
        earliestDeliveryDate: '2009-01-05',
        latestDeliveryDate: '2026-07-13',
      },
      freshAlliance: {
        eventCount: 826,
        earliestDeliveryDate: '2023-06-01',
        latestDeliveryDate: '2026-06-30',
      },
    });
  });

  test('a lagging channel does not make the corpus stale', async () => {
    // Staleness follows the newest observation FEED holds. A Fresh Alliance
    // entry backlog is not evidence that procurement data needs refreshing,
    // and must never read as a performance signal.
    const { client } = coverageClient(
      { min: '2009-01-05', max: '2026-07-13', count: 2100 },
      { min: '2023-06-01', max: '2026-06-30', count: 826 }
    );

    const status = await getProcurementDataStatus(
      new Date('2026-07-20T18:00:00Z'),
      client,
      'America/Los_Angeles'
    );

    expect(status.latestDeliveryDate).toBe('2026-07-13');
    expect(status.daysSinceLatestDelivery).toBe(7);
    expect(status.isStale).toBe(false);
  });

  test('reports an empty window for a channel with no observations', async () => {
    const { client } = coverageClient(
      { min: '2009-01-05', max: '2026-07-13', count: 2100 },
      { min: null, max: null, count: 0 }
    );

    const status = await getProcurementDataStatus(
      new Date('2026-07-20T18:00:00Z'),
      client,
      'America/Los_Angeles'
    );

    expect(status.coverage.freshAlliance).toEqual({
      eventCount: 0,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
    });
  });

  test('excludes superseded and inactive observations from every window', async () => {
    const { client, aggregate } = coverageClient(
      { min: '2009-01-05', max: '2026-07-13', count: 2100 },
      { min: '2023-06-01', max: '2026-06-30', count: 826 }
    );

    await getProcurementDataStatus(
      new Date('2026-07-20T18:00:00Z'),
      client,
      'America/Los_Angeles'
    );

    for (const [call] of aggregate.mock.calls as [{ where: Record<string, unknown> }][]) {
      expect(call.where).toMatchObject({
        isCurrent: true,
        supersededByImportId: null,
        import: { status: 'active' },
      });
    }
  });
});
