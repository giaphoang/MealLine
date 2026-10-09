import { describe, expect, test, vi } from 'vitest';
import {
  getProcurementAnalytics,
  getProcurementDataStatus,
  importOfbCsv,
  OFB_HEADERS,
  parseOfbCsv,
  ProcurementImportError,
} from '../../../src/services/procurement';
import { DEFAULT_OPERATING_HOURS } from '../../../src/services/operating-hours';

const csv = (...rows: string[]) => Buffer.from([
  OFB_HEADERS.join(','),
  ...rows,
].join('\r\n'));

const emptyCoverage = () => ({
  _min: { deliveryDate: null },
  _max: { deliveryDate: null },
  _count: { _all: 0 },
});

describe('OFB procurement import normalization', () => {
  test('preserves observed product identifiers and groups observations by source order', () => {
    const parsed = parseOfbCsv(csv(
      '6/15/26,6-Jun,806667,00070,"Bread, Buns",DONATED,1.00,206.00,$0.00,$0.00,$0.00,$0.00',
      '6/15/26,6-Jun,806667,606194,Peanut Butter,PURCH-DON,2.00,20.00,$14.15,$28.30,$0.00,$0.00',
      '6/15/26,6-Jun,806668AGPCKUP,40000,Fresh Alliance Bread,DONATED,5.00,50.00,$0.00,$0.00,$0.00,$0.00',
      '6/22/26,6-Jun,806900,8060,Rice,GOVERNMENT,1.00,195.50,$0.00,$0.00,$0.00,$0.00'
    ));

    expect(parsed.rowCount).toBe(4);
    expect(parsed.rangeStart).toBe('2026-06-15');
    expect(parsed.rangeEnd).toBe('2026-06-22');
    expect(parsed.orders).toHaveLength(3);
    expect(parsed.orders[0]).toMatchObject({
      sourceOrderReference: '806667',
      eventKind: 'ofb_warehouse_order',
    });
    expect(parsed.orders[0].lines[0].productCode).toBe('00070');
    expect(parsed.orders[0].lines[1]).toMatchObject({
      productCode: '606194',
      procurementChannel: 'ofb_warehouse',
      quantityHundredths: 200,
      weightHundredths: 2000,
      unitPriceCents: 1415,
      sourcePriceTotalCents: 2830,
      calculatedPriceTotalCents: 2830,
      priceTotalMatches: true,
    });
    expect(parsed.orders[1]).toMatchObject({ eventKind: 'fresh_alliance_receipt' });
    expect(parsed.orders[1].lines[0]).toMatchObject({
      productCode: '40000',
      procurementChannel: 'fresh_alliance',
      acquisitionClass: 'DONATED',
    });
    expect(parsed.orders[2].lines[0].productCode).toBe('8060');
    expect(parsed.warnings).toEqual([]);
  });

  test('imports reconcilable source anomalies with explicit warnings', () => {
    const parsed = parseOfbCsv(csv(
      '6/15/26,5-May,100,90001,Tuna,PURCHASED,14.00,140.00,$14.15,$98.10,$0.00,$0.00',
      '6/15/26,6-Jun,101,90002,Rice,PURCHASED,3.00,30.00,$30.00,$90.00,$0.00,$0.00'
    ));

    expect(parsed.orders).toHaveLength(2);
    expect(parsed.orders[0].lines[0]).toMatchObject({
      sourcePriceTotalCents: 9810,
      calculatedPriceTotalCents: 19810,
      priceTotalMatches: false,
    });
    expect(parsed.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        'PERIOD_MISMATCH',
        'PRICE_TOTAL_MISMATCH',
      ])
    );
  });

  test('retains deprecated supplier codes with a calm provenance warning', () => {
    const parsed = parseOfbCsv(csv(
      `5/22/23,5-May,679748,41040,"[DON'T USE] Dairy, Milk ( Case )",DONATED,14.00,252.00,$0.00,$0.00,$0.00,$0.00`
    ));

    expect(parsed.orders[0]).toMatchObject({
      sourceOrderReference: '679748',
      eventKind: 'ofb_warehouse_order',
    });
    expect(parsed.orders[0].lines[0]).toMatchObject({
      productCode: '41040',
      procurementChannel: 'ofb_warehouse',
      weightHundredths: 25200,
    });
    expect(parsed.warnings).toEqual([
      expect.objectContaining({
        code: 'DEPRECATED_PRODUCT_CODE',
        rowNumbers: [2],
      }),
    ]);
  });

  test('rejects structural mismatches rather than guessing', () => {
    expect(() => parseOfbCsv(Buffer.from('Date,Product #\n6/15/26,00070')))
      .toThrowError(ProcurementImportError);
    expect(() => parseOfbCsv(csv(
      '6/15/26,6-Jun,806667,700,Bread,DONATED,1.00,10.00,$0.00,$0.00,$0.00,$0.00'
    ))).toThrow(/four-to-six-digit/i);
    expect(() => parseOfbCsv(csv(
      '6/15/26,6-Jun,806667,90001,Tuna,DONATED,1.00,10.00,$0.00,$0.00,$0.00,$0.00'
    ))).toThrow(/acquisition class/i);
    expect(() => parseOfbCsv(Buffer.from([0xff, 0xfe, 0xfd])))
      .toThrow(/UTF-8/i);
  });

  test('rejects one source order appearing on multiple dates in one snapshot', () => {
    expect(() => parseOfbCsv(csv(
      '6/15/26,6-Jun,806667,00070,Bread,DONATED,1.00,10.00,$0.00,$0.00,$0.00,$0.00',
      '6/22/26,6-Jun,806667,00070,Bread,DONATED,1.00,10.00,$0.00,$0.00,$0.00,$0.00'
    ))).toThrow(/multiple delivery dates/i);
  });

  test('uses the source reference—not product-code prefix—to classify the event and every line', () => {
    const parsed = parseOfbCsv(csv(
      '6/15/26,6-Jun,806667,00070,Bread,DONATED,1.00,10.00,$0.00,$0.00,$0.00,$0.00',
      '6/15/26,6-Jun,806667,40000,Fresh Alliance Bread,DONATED,5.00,50.00,$0.00,$0.00,$0.00,$0.00'
    ));
    expect(parsed.orders[0]).toMatchObject({
      sourceOrderReference: '806667',
      eventKind: 'ofb_warehouse_order',
    });
    expect(parsed.orders[0].lines.map((line) => line.procurementChannel)).toEqual([
      'ofb_warehouse',
      'ofb_warehouse',
    ]);
  });

  test('uses a strict greater-than-30-calendar-day stale boundary', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ deliveryDate: '2026-06-14' })
      .mockResolvedValueOnce({
        id: 1,
        effectiveDate: '1970-01-01',
        timezone: 'America/Los_Angeles',
        hours: DEFAULT_OPERATING_HOURS,
        recordedAt: new Date('2026-01-01T00:00:00Z'),
      });
    const client = {
      procurementDataRule: { findMany: vi.fn(async () => []) },
      procurementOrderRevision: { findFirst, aggregate: vi.fn(async () => emptyCoverage()) },
      operatingHoursRevision: { findFirst },
    } as never;

    const atThirtyDays = await getProcurementDataStatus(
      new Date('2026-07-15T06:00:00Z'),
      client
    );
    expect(atThirtyDays.daysSinceLatestDelivery).toBe(30);
    expect(atThirtyDays.isStale).toBe(false);

    findFirst
      .mockResolvedValueOnce({ deliveryDate: '2026-06-14' })
      .mockResolvedValueOnce({
        id: 1,
        effectiveDate: '1970-01-01',
        timezone: 'America/Los_Angeles',
        hours: DEFAULT_OPERATING_HOURS,
        recordedAt: new Date('2026-01-01T00:00:00Z'),
      });
    const atThirtyOneDays = await getProcurementDataStatus(
      new Date('2026-07-16T06:00:00Z'),
      client
    );
    expect(atThirtyOneDays.daysSinceLatestDelivery).toBe(31);
    expect(atThirtyOneDays.isStale).toBe(true);
  });

  test('keeps order, receiving-date, channel, cost, and zero-inbound semantics distinct', async () => {
    const lines = [
      {
        acquisitionClass: 'PURCHASED',
        procurementChannel: 'ofb_warehouse',
        quantityHundredths: 100,
        weightHundredths: 1000,
        calculatedPriceTotalCents: 500,
        sourcePriceTotalCents: 500,
        serviceFeeCents: 10,
        grantsAppliedCents: 100,
        priceTotalMatches: true,
        sourceDescription: 'Rice',
        product: { productCode: '90001' },
      },
      {
        acquisitionClass: 'DONATED',
        procurementChannel: 'ofb_warehouse',
        quantityHundredths: 0,
        weightHundredths: 0,
        calculatedPriceTotalCents: 0,
        sourcePriceTotalCents: 0,
        serviceFeeCents: 0,
        grantsAppliedCents: 0,
        priceTotalMatches: true,
        sourceDescription: 'Unfilled Soup',
        product: { productCode: '00070' },
      },
    ];
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ deliveryDate: '2026-01-05' }])
      .mockResolvedValueOnce([
        {
          sourceOrderReference: '100',
          eventKind: 'ofb_warehouse_order',
          deliveryDate: '2026-01-05',
          lines,
        },
        {
          sourceOrderReference: '101AGPCKUP',
          eventKind: 'fresh_alliance_receipt',
          deliveryDate: '2026-01-05',
          lines: [{
            acquisitionClass: 'DONATED',
            procurementChannel: 'fresh_alliance',
            quantityHundredths: 100,
            weightHundredths: 200,
            calculatedPriceTotalCents: 0,
            sourcePriceTotalCents: 0,
            serviceFeeCents: 0,
            grantsAppliedCents: 0,
            priceTotalMatches: true,
            sourceDescription: 'Fresh Alliance Bread',
            product: { productCode: '40000' },
          }],
        },
      ]);
    const client = {
      procurementDataRule: { findMany: vi.fn(async () => []) },
      procurementOrderRevision: {
        findMany,
        findFirst: vi.fn().mockResolvedValue({ deliveryDate: '2026-01-05' }),
        aggregate: vi.fn(async () => emptyCoverage()),
      },
      operatingHoursRevision: {
        findFirst: vi.fn().mockResolvedValue({
          id: 1,
          effectiveDate: '1970-01-01',
          timezone: 'America/Los_Angeles',
          hours: DEFAULT_OPERATING_HOURS,
          recordedAt: new Date('2026-01-01T00:00:00Z'),
        }),
      },
    } as never;

    const result = await getProcurementAnalytics(
      {},
      new Date('2026-01-06T20:00:00Z'),
      client
    );

    expect(result.summary).toMatchObject({
      totalWeightHundredths: 1200,
      sourceEventCount: 2,
      warehouseOrderCount: 1,
      freshAllianceReceiptCount: 1,
      receivingDateCount: 1,
      medianReceivingGapDays: null,
      warehouseProductCodes: 1,
      freshAllianceCategoryCodes: 1,
      zeroInboundLineCount: 1,
      calculatedGrossProductChargesCents: 500,
      costAdjustmentsAttributable: true,
      serviceFeesCents: 10,
      grantsAppliedCents: 100,
      netRecordedCostCents: 410,
    });
    expect(result.channelMix).toEqual([
      { channel: 'ofb_warehouse', weightHundredths: 1000 },
      { channel: 'fresh_alliance', weightHundredths: 200 },
    ]);
    // Seasonal weight keeps channels apart in addition to the combined series,
    // so Seasonal Inbound Weight can offer a per-channel breakdown without a
    // second query.
    expect(result.seasonalWeight).toEqual([
      { year: '2026', month: 1, weightHundredths: 1200 },
    ]);
    // Sorted by the composite key "year-month|channel", so fresh_alliance
    // sorts before ofb_warehouse within the same month.
    expect(result.seasonalChannelWeight).toEqual([
      { year: '2026', month: 1, channel: 'fresh_alliance', weightHundredths: 200 },
      { year: '2026', month: 1, channel: 'ofb_warehouse', weightHundredths: 1000 },
    ]);
    expect(result.warehouseProducts.map((product) => product.productCode)).toEqual([
      '90001',
    ]);
    expect(result.paidProducts).toEqual([
      expect.objectContaining({
        productCode: '90001',
        description: 'Rice',
        receiptDateCount: 1,
        totalSpendCents: 500,
        paidWeightHundredths: 1000,
        costPerPaidPoundCents: 50,
      }),
    ]);
    expect(result.warehouseProducts[0]).toMatchObject({
      receiptDateCount: 1,
      totalWeightHundredths: 1000,
      averageWeightPerReceiptHundredths: 1000,
    });
    expect(result.freshAllianceCategories).toEqual([
      expect.objectContaining({
        productCode: '40000',
        receiptEventCount: 1,
        receivingDateCount: 1,
        totalWeightHundredths: 200,
      }),
    ]);
    expect(findMany.mock.calls[1][0].where.deliveryDate).toEqual({
      gte: '2026-01-05',
      lte: '2026-01-06',
    });

    const filteredFindMany = vi.fn()
      .mockResolvedValueOnce([
        { deliveryDate: '2025-12-01' },
        { deliveryDate: '2026-01-05' },
      ])
      .mockResolvedValueOnce([
        {
          sourceOrderReference: '100',
          eventKind: 'ofb_warehouse_order',
          deliveryDate: '2026-01-05',
          lines: [lines[0]],
        },
      ]);
    const filteredClient = {
      procurementDataRule: { findMany: vi.fn(async () => []) },
      procurementOrderRevision: {
        findMany: filteredFindMany,
        findFirst: vi.fn().mockResolvedValue({ deliveryDate: '2026-01-05' }),
        aggregate: vi.fn(async () => emptyCoverage()),
      },
      operatingHoursRevision: {
        findFirst: vi.fn().mockResolvedValue({
          id: 1,
          effectiveDate: '1970-01-01',
          timezone: 'America/Los_Angeles',
          hours: DEFAULT_OPERATING_HOURS,
          recordedAt: new Date('2026-01-01T00:00:00Z'),
        }),
      },
    } as never;
    const filtered = await getProcurementAnalytics(
      { channel: 'ofb_warehouse' },
      new Date('2026-01-06T20:00:00Z'),
      filteredClient
    );
    expect(filtered.summary).toMatchObject({
      calculatedGrossProductChargesCents: 500,
      costAdjustmentsAttributable: true,
      serviceFeesCents: 10,
      grantsAppliedCents: 100,
      netRecordedCostCents: 410,
    });
    expect(filtered.warehouseProducts[0]).toMatchObject({
      receiptDateCount: 1,
      totalWeightHundredths: 1000,
    });
    expect(filteredFindMany.mock.calls[1][0]).toMatchObject({
      where: {
        lines: { some: { procurementChannel: 'ofb_warehouse' } },
      },
      include: {
        lines: { where: { procurementChannel: 'ofb_warehouse' } },
      },
    });
  });

  test('splits Fresh Alliance categories by donor while keeping the category-only view intact', async () => {
    const line = (donorLine: Partial<{ weightHundredths: number }>) => ({
      acquisitionClass: 'DONATED',
      procurementChannel: 'fresh_alliance',
      quantityHundredths: 100,
      weightHundredths: 200,
      calculatedPriceTotalCents: 0,
      sourcePriceTotalCents: 0,
      serviceFeeCents: 0,
      grantsAppliedCents: 0,
      priceTotalMatches: true,
      sourceDescription: 'Produce (Fresh Alliance)',
      product: { productCode: '41000' },
      ...donorLine,
    });
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ deliveryDate: '2026-01-05' }])
      .mockResolvedValueOnce([
        {
          sourceOrderReference: '1AGPCKUP',
          eventKind: 'fresh_alliance_receipt',
          deliveryDate: '2026-01-05',
          donorCode: 'RTJ146',
          donorName: "Trader Joe's - Northwest",
          lines: [line({})],
        },
        {
          sourceOrderReference: '2AGPCKUP',
          eventKind: 'fresh_alliance_receipt',
          deliveryDate: '2026-01-06',
          donorCode: 'RAZ100',
          donorName: 'Amazon - NW Industrial (Prime Now)',
          lines: [line({ weightHundredths: 500 })],
        },
        // No donor on file -- a partially superseded window is a real
        // possibility, and this must be reported honestly, not guessed.
        {
          sourceOrderReference: '3AGPCKUP',
          eventKind: 'fresh_alliance_receipt',
          deliveryDate: '2026-01-07',
          donorCode: null,
          donorName: null,
          lines: [line({ weightHundredths: 100 })],
        },
      ]);
    const client = {
      procurementDataRule: { findMany: vi.fn(async () => []) },
      procurementOrderRevision: {
        findMany,
        findFirst: vi.fn().mockResolvedValue({ deliveryDate: '2026-01-07' }),
        aggregate: vi.fn(async () => emptyCoverage()),
      },
      operatingHoursRevision: {
        findFirst: vi.fn().mockResolvedValue({
          id: 1,
          effectiveDate: '1970-01-01',
          timezone: 'America/Los_Angeles',
          hours: DEFAULT_OPERATING_HOURS,
          recordedAt: new Date('2026-01-01T00:00:00Z'),
        }),
      },
    } as never;

    const result = await getProcurementAnalytics(
      {},
      new Date('2026-01-08T20:00:00Z'),
      client
    );

    expect(result.freshAllianceCategories).toEqual([
      expect.objectContaining({ productCode: '41000', totalWeightHundredths: 800 }),
    ]);

    expect(result.freshAllianceDonorCategories).toHaveLength(3);
    const byDonor = new Map(
      result.freshAllianceDonorCategories.map((row) => [row.donorCode, row])
    );
    expect(byDonor.get('RAZ100')).toMatchObject({
      donorName: 'Amazon - NW Industrial (Prime Now)',
      productCode: '41000',
      totalWeightHundredths: 500,
      receiptEventCount: 1,
    });
    expect(byDonor.get('RTJ146')).toMatchObject({
      donorName: "Trader Joe's - Northwest",
      totalWeightHundredths: 200,
    });
    expect(byDonor.get(null)).toMatchObject({
      donorName: 'Not Reported',
      totalWeightHundredths: 100,
    });

    // The per-donor split must reconcile back to the category-only total --
    // it is a further breakdown of the same lines, not a separate count.
    const donorTotal = result.freshAllianceDonorCategories
      .reduce((sum, row) => sum + row.totalWeightHundredths, 0);
    expect(donorTotal).toBe(result.freshAllianceCategories[0].totalWeightHundredths);
  });

  test('counts pending Fresh Alliance weight in every total (D15: Confirmed is an audit sign-off, not a data-quality gate)', async () => {
    const line = (weightHundredths: number, description: string) => ({
      acquisitionClass: 'DONATED',
      procurementChannel: 'fresh_alliance',
      quantityHundredths: weightHundredths,
      weightHundredths,
      calculatedPriceTotalCents: 0,
      sourcePriceTotalCents: 0,
      serviceFeeCents: 0,
      grantsAppliedCents: 0,
      priceTotalMatches: true,
      sourceDescription: description,
      product: { productCode: '40000' },
    });
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ deliveryDate: '2026-01-05' }])
      .mockResolvedValueOnce([
        {
          sourceOrderReference: '100AGPCKUP',
          eventKind: 'fresh_alliance_receipt',
          deliveryDate: '2026-01-05',
          isConfirmed: true,
          lines: [line(500, 'Confirmed pickup')],
        },
        {
          sourceOrderReference: '101AGPCKUP',
          eventKind: 'fresh_alliance_receipt',
          deliveryDate: '2026-01-06',
          isConfirmed: false,
          lines: [line(200, 'Pending pickup A')],
        },
        {
          sourceOrderReference: '102AGPCKUP',
          eventKind: 'fresh_alliance_receipt',
          deliveryDate: '2026-01-08',
          isConfirmed: false,
          lines: [line(100, 'Pending pickup B')],
        },
      ]);
    const client = {
      procurementDataRule: { findMany: vi.fn(async () => []) },
      procurementOrderRevision: {
        findMany,
        findFirst: vi.fn().mockResolvedValue({ deliveryDate: '2026-01-08' }),
        aggregate: vi.fn(async () => emptyCoverage()),
      },
      operatingHoursRevision: {
        findFirst: vi.fn().mockResolvedValue({
          id: 1,
          effectiveDate: '1970-01-01',
          timezone: 'America/Los_Angeles',
          hours: DEFAULT_OPERATING_HOURS,
          recordedAt: new Date('2026-01-01T00:00:00Z'),
        }),
      },
    } as never;

    const result = await getProcurementAnalytics(
      {},
      new Date('2026-01-09T20:00:00Z'),
      client
    );

    // Pending weight (300) is not walled off -- it's already in the same
    // total as confirmed weight (500), because that's the point of D15.
    expect(result.summary.totalWeightHundredths).toBe(800);
    expect(result.channelMix.find((row) => row.channel === 'fresh_alliance'))
      .toMatchObject({ weightHundredths: 800 });

    // The pending summary describes the same weight a second time, not a
    // separate figure to reconcile against.
    expect(result.summary.freshAlliancePending).toEqual({
      weightHundredths: 300,
      eventCount: 2,
      earliestDeliveryDate: '2026-01-06',
      latestDeliveryDate: '2026-01-08',
    });
  });

  test('reports no pending summary when nothing in range is unconfirmed', async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ deliveryDate: '2026-01-05' }])
      .mockResolvedValueOnce([
        {
          sourceOrderReference: '100AGPCKUP',
          eventKind: 'fresh_alliance_receipt',
          deliveryDate: '2026-01-05',
          isConfirmed: true,
          lines: [{
            acquisitionClass: 'DONATED',
            procurementChannel: 'fresh_alliance',
            quantityHundredths: 500,
            weightHundredths: 500,
            calculatedPriceTotalCents: 0,
            sourcePriceTotalCents: 0,
            serviceFeeCents: 0,
            grantsAppliedCents: 0,
            priceTotalMatches: true,
            sourceDescription: 'Confirmed pickup',
            product: { productCode: '40000' },
          }],
        },
      ]);
    const client = {
      procurementDataRule: { findMany: vi.fn(async () => []) },
      procurementOrderRevision: {
        findMany,
        findFirst: vi.fn().mockResolvedValue({ deliveryDate: '2026-01-05' }),
        aggregate: vi.fn(async () => emptyCoverage()),
      },
      operatingHoursRevision: {
        findFirst: vi.fn().mockResolvedValue({
          id: 1,
          effectiveDate: '1970-01-01',
          timezone: 'America/Los_Angeles',
          hours: DEFAULT_OPERATING_HOURS,
          recordedAt: new Date('2026-01-06T20:00:00Z'),
        }),
      },
    } as never;

    const result = await getProcurementAnalytics(
      {},
      new Date('2026-01-06T20:00:00Z'),
      client
    );

    expect(result.summary.freshAlliancePending).toBeNull();
  });
});
describe('Analytics honors the agency\'s data rules (D19/D21)', () => {
  // Two Fresh Alliance receipts on the same day: one from a donor the agency
  // couriers onward, one it keeps.
  const analyticsClient = (rules: unknown[]) => ({
    procurementDataRule: { findMany: vi.fn(async () => rules) },
    procurementOrderRevision: {
      findMany: vi.fn()
        .mockResolvedValueOnce([{ deliveryDate: '2026-01-05' }])
        .mockResolvedValueOnce([
          {
            id: 1,
            source: 'ofb_pickup',
            sourceOrderReference: 'P1',
            eventKind: 'fresh_alliance_receipt',
            deliveryDate: '2026-01-05',
            donorCode: 'RNS16',
            donorName: 'New Seasons - Slabtown',
            lines: [{
              acquisitionClass: 'DONATED',
              procurementChannel: 'fresh_alliance',
              quantityHundredths: 100,
              weightHundredths: 300,
              calculatedPriceTotalCents: 0,
              sourcePriceTotalCents: 0,
              serviceFeeCents: 0,
              grantsAppliedCents: 0,
              priceTotalMatches: true,
              sourceDescription: 'Produce',
              product: { productCode: '41000' },
            }],
          },
          {
            id: 2,
            source: 'ofb_pickup',
            sourceOrderReference: 'P2',
            eventKind: 'fresh_alliance_receipt',
            deliveryDate: '2026-01-05',
            donorCode: 'RAZ100',
            donorName: 'Amazon - NW Industrial (Prime Now)',
            lines: [{
              acquisitionClass: 'DONATED',
              procurementChannel: 'fresh_alliance',
              quantityHundredths: 100,
              weightHundredths: 700,
              calculatedPriceTotalCents: 0,
              sourcePriceTotalCents: 0,
              serviceFeeCents: 0,
              grantsAppliedCents: 0,
              priceTotalMatches: true,
              sourceDescription: 'Produce',
              product: { productCode: '41000' },
            }],
          },
        ]),
      findFirst: vi.fn().mockResolvedValue({ deliveryDate: '2026-01-05' }),
      aggregate: vi.fn(async () => emptyCoverage()),
    },
    operatingHoursRevision: {
      findFirst: vi.fn().mockResolvedValue({
        id: 1,
        effectiveDate: '1970-01-01',
        timezone: 'America/Los_Angeles',
        hours: DEFAULT_OPERATING_HOURS,
        recordedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    },
  } as never);

  test('with no rules, retained weight equals everything received', async () => {
    const result = await getProcurementAnalytics({}, new Date('2026-01-06T20:00:00Z'), analyticsClient([]));

    expect(result.summary.totalWeightHundredths).toBe(1000);
    expect(result.dataShaping.excludedWeightHundredths).toBe(0);
    expect(result.dataShaping.retainedWeightHundredths).toBe(1000);
    expect(result.dataShaping.flags).toEqual([]);
  });

  test('a pass-through rule separates what was received from what was retained', async () => {
    const result = await getProcurementAnalytics(
      {},
      new Date('2026-01-06T20:00:00Z'),
      analyticsClient([
        { id: 1, flag: 'pass_through', scope: 'donor', donorName: 'New Seasons - Slabtown', enabled: true },
      ])
    );

    // The donation really happened, so "received" is untouched...
    expect(result.summary.totalWeightHundredths).toBe(1000);
    // ...but the pantry only ever distributed Amazon's 700.
    expect(result.dataShaping.retainedWeightHundredths).toBe(700);
    expect(result.dataShaping.excludedWeightHundredths).toBe(300);
    expect(result.dataShaping.flags).toEqual([
      { flag: 'pass_through', family: 'exclusion', weightHundredths: 300, eventCount: 1 },
    ]);
  });

  test('a rule keyed on donor code reaches the same events', async () => {
    const result = await getProcurementAnalytics(
      {},
      new Date('2026-01-06T20:00:00Z'),
      analyticsClient([
        { id: 1, flag: 'pass_through', scope: 'donor', donorCode: 'RNS16', enabled: true },
      ])
    );

    expect(result.dataShaping.retainedWeightHundredths).toBe(700);
  });

  test('an annotation is measured but never subtracted', async () => {
    const result = await getProcurementAnalytics(
      {},
      new Date('2026-01-06T20:00:00Z'),
      analyticsClient([
        { id: 1, flag: 'at_risk', scope: 'donor', donorName: 'Amazon - NW Industrial (Prime Now)', enabled: true },
      ])
    );

    // Naming Amazon fragile makes the dependence legible; it must not quietly
    // move a number the agency already reported.
    expect(result.dataShaping.retainedWeightHundredths).toBe(1000);
    expect(result.dataShaping.excludedWeightHundredths).toBe(0);
    expect(result.dataShaping.flags).toEqual([
      { flag: 'at_risk', family: 'annotation', weightHundredths: 700, eventCount: 1 },
    ]);
  });

  test('weight excluded by two overlapping rules is subtracted once', async () => {
    const result = await getProcurementAnalytics(
      {},
      new Date('2026-01-06T20:00:00Z'),
      analyticsClient([
        { id: 1, flag: 'pass_through', scope: 'donor', donorName: 'New Seasons - Slabtown', enabled: true },
        { id: 2, flag: 'other_exclusion', scope: 'event', orderRevisionId: 1, note: 'Also spoiled.', enabled: true },
      ])
    );

    expect(result.dataShaping.excludedWeightHundredths).toBe(300);
    expect(result.dataShaping.retainedWeightHundredths).toBe(700);
    // Both reasons are still reported; only the subtraction is deduplicated.
    expect(result.dataShaping.flags.map((entry) => entry.flag).sort()).toEqual([
      'other_exclusion', 'pass_through',
    ]);
  });
});
