import { describe, expect, test, vi } from 'vitest';
import {
  LEGACY_LEDGER_HEADERS,
  LEGACY_SENTINEL_PRODUCT_CODE,
  parseLegacyLedgerCsv,
} from '../../../src/services/procurement/legacy-community';
import { getProcurementAnalytics, ProcurementImportError } from '../../../src/services/procurement';
import { DEFAULT_OPERATING_HOURS } from '../../../src/services/operating-hours';

const ledger = (...rows: string[]) =>
  Buffer.from([LEGACY_LEDGER_HEADERS.join(','), ...rows].join('\n'), 'utf8');

// calendar_year,month_num,month,source_canonical,disposition,in_ofb,weight_pounds,
// source_as_written,fiscal_year,source_file,caveat
const row = (
  year: number,
  monthNum: number,
  source: string,
  pounds: string,
  extras: { caveat?: string; written?: string } = {}
) => [
  year, monthNum, 'October', source, 'retained', 'no', pounds,
  extras.written ?? source, `FY${year}-${String(year + 1).slice(2)}`,
  'In-Kind Donations.xlsx', extras.caveat ?? '',
].join(',');

describe('curated community-donation ledger', () => {
  test('normalizes one event per month and source, at monthly grain', () => {
    const parsed = parseLegacyLedgerCsv(ledger(
      row(2019, 11, 'Trader Joe\'s - Northwest', '2400.5'),
      row(2019, 11, 'Coava (coffee roaster)', '18')
    ));

    expect(parsed.months).toHaveLength(2);
    const traderJoes = parsed.months.find((month) => month.donorName.startsWith('Trader'))!;
    expect(traderJoes.weightHundredths).toBe(240050);
    // The day is a placeholder for "sometime in November", never an observed
    // delivery date -- nothing may render it as a day.
    expect(traderJoes.deliveryDate).toBe('2019-11-01');
    expect(traderJoes.sourceOrderReference).toBe("2019-11|Trader Joe's - Northwest");
  });

  test('sums several written labels that map to one canonical source', () => {
    // The ledger keeps a row per verbatim label; "Amazon - OUR1" and
    // "Amazon - OUR2" are one donor once canonicalized.
    const parsed = parseLegacyLedgerCsv(ledger(
      row(2021, 10, 'Amazon - NW Industrial (Prime Now)', '3467', { written: 'Amazon - OUR1' }),
      row(2021, 10, 'Amazon - NW Industrial (Prime Now)', '13829', { written: 'Amazon - OUR2' })
    ));

    expect(parsed.months).toHaveLength(1);
    expect(parsed.months[0].weightHundredths).toBe(1729600);
  });

  test('rejects a file that is not the curated ledger rather than guessing', () => {
    expect(() => parseLegacyLedgerCsv(Buffer.from('Date,Order #,Weight\n2026-01-01,1,10', 'utf8')))
      .toThrow(ProcurementImportError);
  });

  test('rejects a blank weight, because the ledger omits untracked months', () => {
    // Blank means "not tracked" upstream and is dropped there; a blank reaching
    // this parser is a malformed row, not a zero.
    expect(() => parseLegacyLedgerCsv(ledger(row(2019, 11, 'Coava', '')))).toThrow(/weight_pounds/);
  });

  test('rejects an impossible month instead of coercing it', () => {
    expect(() => parseLegacyLedgerCsv(ledger(row(2019, 13, 'Coava', '10')))).toThrow(/month_num/);
  });

  test('rejects months at or beyond the June 2023 source-system seam', () => {
    expect(() => parseLegacyLedgerCsv(ledger(row(2023, 6, 'Coava', '10'))))
      .toThrow(/must end before June 2023/);
    expect(parseLegacyLedgerCsv(ledger(row(2023, 5, 'Coava', '10'))).rangeEnd)
      .toBe('2023-05-01');
  });

  test('hashes settled monthly totals, so an unchanged re-import is a no-op', () => {
    const first = parseLegacyLedgerCsv(ledger(row(2019, 11, 'Coava', '18')));
    const same = parseLegacyLedgerCsv(ledger(row(2019, 11, 'Coava', '18')));
    const corrected = parseLegacyLedgerCsv(ledger(row(2019, 11, 'Coava', '19')));

    expect(same.months[0].snapshotHash).toBe(first.months[0].snapshotHash);
    // A corrected weight becomes a new revision of the same month, not a new event.
    expect(corrected.months[0].snapshotHash).not.toBe(first.months[0].snapshotHash);
    expect(corrected.months[0].sourceOrderReference).toBe(first.months[0].sourceOrderReference);
  });

  test('carries the merged-month caveat through', () => {
    const parsed = parseLegacyLedgerCsv(
      ledger(row(2022, 12, 'Amazon', '9100', { caveat: 'merged/estimated month' }))
    );
    expect(parsed.months[0].caveat).toBe('merged/estimated month');
  });
});

describe('legacy months in Analytics (D17: weight yes, product detail no)', () => {
  const analyticsClient = (rules: unknown[] = []) => ({
    procurementDataRule: { findMany: vi.fn(async () => rules) },
    procurementOrderRevision: {
      findMany: vi.fn()
        .mockResolvedValueOnce([{ deliveryDate: '2019-11-01' }])
        .mockResolvedValueOnce([
          {
            id: 1,
            source: 'legacy_community',
            sourceOrderReference: "2019-11|Trader Joe's - Northwest",
            eventKind: 'community_donation_month',
            deliveryDate: '2019-11-01',
            donorCode: null,
            donorName: "Trader Joe's - Northwest",
            lines: [{
              acquisitionClass: 'DONATED',
              procurementChannel: 'community_donation',
              quantityHundredths: 0,
              weightHundredths: 240050,
              calculatedPriceTotalCents: 0,
              sourcePriceTotalCents: 0,
              serviceFeeCents: 0,
              grantsAppliedCents: 0,
              priceTotalMatches: true,
              sourceDescription: "Trader Joe's - Northwest",
              product: { productCode: LEGACY_SENTINEL_PRODUCT_CODE },
            }],
          },
        ]),
      findFirst: vi.fn().mockResolvedValue({ deliveryDate: '2019-11-01' }),
      aggregate: vi.fn(async () => ({ _count: { _all: 0 }, _min: { deliveryDate: null }, _max: { deliveryDate: null } })),
    },
    operatingHoursRevision: {
      findFirst: vi.fn().mockResolvedValue({
        id: 1,
        effectiveDate: '1970-01-01',
        timezone: 'America/Los_Angeles',
        hours: DEFAULT_OPERATING_HOURS,
        recordedAt: new Date('2019-01-01T00:00:00Z'),
      }),
    },
  } as never);

  test('counts toward weight, time, and source views', async () => {
    const result = await getProcurementAnalytics(
      { preset: 'all' },
      new Date('2019-12-01T20:00:00Z'),
      analyticsClient()
    );

    expect(result.summary.totalWeightHundredths).toBe(240050);
    expect(result.channelMix).toContainEqual({
      channel: 'community_donation',
      weightHundredths: 240050,
    });
    expect(result.monthlyWeight[0]).toMatchObject({
      bucket: '2019-11',
      communityDonationWeightHundredths: 240050,
      ofbWarehouseWeightHundredths: 0,
      freshAllianceWeightHundredths: 0,
    });
  });

  test('appears in no product or category view, because it has none', async () => {
    const result = await getProcurementAnalytics(
      { preset: 'all' },
      new Date('2019-12-01T20:00:00Z'),
      analyticsClient()
    );

    // Absence is honest here; a fabricated category would not be.
    expect(result.warehouseProducts).toEqual([]);
    expect(result.freshAllianceCategories).toEqual([]);
    expect(result.freshAllianceDonorCategories).toEqual([]);
    expect(result.paidProducts).toEqual([]);
    expect(result.summary.warehouseProductCodes).toBe(0);
    expect(result.summary.freshAllianceCategoryCodes).toBe(0);
  });

  test('having no quantity is not counted as a data-quality defect', async () => {
    const result = await getProcurementAnalytics(
      { preset: 'all' },
      new Date('2019-12-01T20:00:00Z'),
      analyticsClient()
    );

    // A legacy month legitimately has no quantity -- only a weight. Counting it
    // as a zero-inbound line would report a defect that does not exist.
    expect(result.summary.zeroInboundLineCount).toBe(0);
  });
});

describe('community cards show received weight, not retained (D21)', () => {
  // Reuse the single-source fixture, but with a pass_through rule on it. The
  // community history counts the gift; retained supply does not.
  const clientWithRule = () => ({
    procurementDataRule: {
      findMany: vi.fn(async () => [
        { id: 1, flag: 'pass_through', scope: 'donor', donorName: "Trader Joe's - Northwest", enabled: true },
      ]),
    },
    procurementOrderRevision: {
      findMany: vi.fn()
        .mockResolvedValueOnce([{ deliveryDate: '2019-11-01' }])
        .mockResolvedValueOnce([
          {
            id: 1,
            source: 'legacy_community',
            sourceOrderReference: "2019-11|Trader Joe's - Northwest",
            eventKind: 'community_donation_month',
            deliveryDate: '2019-11-01',
            donorCode: null,
            donorName: "Trader Joe's - Northwest",
            lines: [{
              acquisitionClass: 'DONATED',
              procurementChannel: 'community_donation',
              quantityHundredths: 0,
              weightHundredths: 240050,
              calculatedPriceTotalCents: 0,
              sourcePriceTotalCents: 0,
              serviceFeeCents: 0,
              grantsAppliedCents: 0,
              priceTotalMatches: true,
              sourceDescription: "Trader Joe's - Northwest",
              product: { productCode: LEGACY_SENTINEL_PRODUCT_CODE },
            }],
          },
        ]),
      findFirst: vi.fn().mockResolvedValue({ deliveryDate: '2019-11-01' }),
      aggregate: vi.fn(async () => ({ _count: { _all: 0 }, _min: { deliveryDate: null }, _max: { deliveryDate: null } })),
    },
    operatingHoursRevision: {
      findFirst: vi.fn().mockResolvedValue({
        id: 1,
        effectiveDate: '1970-01-01',
        timezone: 'America/Los_Angeles',
        hours: DEFAULT_OPERATING_HOURS,
        recordedAt: new Date('2019-01-01T00:00:00Z'),
      }),
    },
  } as never);

  test('the source keeps its full received weight even under a pass_through rule', async () => {
    const result = await getProcurementAnalytics(
      { preset: 'all' },
      new Date('2019-12-01T20:00:00Z'),
      clientWithRule()
    );

    // Community history: the donation happened, so it is counted in full.
    expect(result.communitySources).toEqual([
      expect.objectContaining({
        sourceName: "Trader Joe's - Northwest",
        weightHundredths: 240050,
      }),
    ]);
    // Retained supply: the same rule removes it.
    expect(result.dataShaping.retainedWeightHundredths).toBe(0);
    expect(result.dataShaping.excludedWeightHundredths).toBe(240050);
  });
});

describe('Fresh Alliance partner classification (D16 stack + toggle)', () => {
  // Two events on the same day: a legacy Amazon month (pre-2023) and a live
  // Fresh Alliance Amazon pickup — same donor name, so the legacy one is a
  // Fresh Alliance partner and feeds the FFA views, not the community cards.
  const client = () => ({
    procurementDataRule: { findMany: vi.fn(async () => []) },
    procurementOrderRevision: {
      findMany: vi.fn()
        .mockResolvedValueOnce([{ deliveryDate: '2019-11-01' }])
        .mockResolvedValueOnce([
          {
            id: 1,
            source: 'legacy_community',
            sourceOrderReference: '2019-11|Amazon - NW Industrial (Prime Now)',
            eventKind: 'community_donation_month',
            deliveryDate: '2019-11-01',
            donorCode: null,
            donorName: 'Amazon - NW Industrial (Prime Now)',
            lines: [{
              acquisitionClass: 'DONATED', procurementChannel: 'community_donation',
              quantityHundredths: 0, weightHundredths: 500000,
              calculatedPriceTotalCents: 0, sourcePriceTotalCents: 0, serviceFeeCents: 0,
              grantsAppliedCents: 0, priceTotalMatches: true, sourceDescription: 'Amazon',
              product: { productCode: LEGACY_SENTINEL_PRODUCT_CODE },
            }],
          },
          {
            id: 2,
            source: 'legacy_community',
            sourceOrderReference: '2020-01|Coava (coffee roaster)',
            eventKind: 'community_donation_month',
            deliveryDate: '2020-01-01',
            donorCode: null,
            donorName: 'Coava (coffee roaster)',
            lines: [{
              acquisitionClass: 'DONATED', procurementChannel: 'community_donation',
              quantityHundredths: 0, weightHundredths: 1800,
              calculatedPriceTotalCents: 0, sourcePriceTotalCents: 0, serviceFeeCents: 0,
              grantsAppliedCents: 0, priceTotalMatches: true, sourceDescription: 'Coava',
              product: { productCode: LEGACY_SENTINEL_PRODUCT_CODE },
            }],
          },
          {
            id: 3,
            source: 'ofb_pickup',
            sourceOrderReference: 'P1',
            eventKind: 'fresh_alliance_receipt',
            deliveryDate: '2023-07-01',
            donorCode: 'RAZ100',
            donorName: 'Amazon - NW Industrial (Prime Now)',
            isConfirmed: true,
            lines: [{
              acquisitionClass: 'DONATED', procurementChannel: 'fresh_alliance',
              quantityHundredths: 100, weightHundredths: 700000,
              calculatedPriceTotalCents: 0, sourcePriceTotalCents: 0, serviceFeeCents: 0,
              grantsAppliedCents: 0, priceTotalMatches: true, sourceDescription: 'Produce',
              product: { productCode: '41000' },
            }],
          },
        ]),
      findFirst: vi.fn().mockResolvedValue({ deliveryDate: '2019-11-01' }),
      aggregate: vi.fn(async () => ({ _count: { _all: 0 }, _min: { deliveryDate: null }, _max: { deliveryDate: null } })),
    },
    operatingHoursRevision: {
      findFirst: vi.fn().mockResolvedValue({
        id: 1, effectiveDate: '1970-01-01', timezone: 'America/Los_Angeles',
        hours: DEFAULT_OPERATING_HOURS, recordedAt: new Date('2019-01-01T00:00:00Z'),
      }),
    },
  } as never);

  test('a legacy source matching a live FFA donor is flagged as a partner', async () => {
    const result = await getProcurementAnalytics({ preset: 'all' }, new Date('2026-01-01T00:00:00Z'), client());
    const amazon = result.communitySources.find((s) => s.sourceName.startsWith('Amazon'))!;
    const coava = result.communitySources.find((s) => s.sourceName.startsWith('Coava'))!;
    expect(amazon.isFreshAlliancePartner).toBe(true);
    expect(coava.isFreshAlliancePartner).toBe(false);
  });

  test('partner legacy weight is exposed for the stack and keyed by live code for the toggle', async () => {
    const result = await getProcurementAnalytics({ preset: 'all' }, new Date('2026-01-01T00:00:00Z'), client());
    // Amazon's legacy 5,000 lb is the FFA-partner legacy total; Coava is not counted.
    expect(result.summary.freshAllianceLegacyWeightHundredths).toBe(500000);
    expect(result.freshAllianceLegacyMonthlyWeight).toEqual([
      { bucket: '2019-11', donorCode: 'RAZ100', weightHundredths: 500000 },
    ]);
    // The full community roster still holds both (mix card shows everyone).
    expect(result.communitySources.map((s) => s.sourceName).sort()).toEqual([
      'Amazon - NW Industrial (Prime Now)', 'Coava (coffee roaster)',
    ]);
  });
});
