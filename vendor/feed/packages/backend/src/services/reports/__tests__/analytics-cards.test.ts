// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import {
  ACQUISITION_MIX,
  WAREHOUSE_PRODUCT_HISTORY,
  CATEGORY_PRESSURE,
  AVAILABILITY_SUMMARY,
  FRESH_ALLIANCE_CATEGORY_MIX,
  SEASONAL_INBOUND_WEIGHT,
  PAID_PRODUCT_SPEND,
  PAID_PROCUREMENT_SUMMARY,
  ANALYTICS_CARDS,
  INBOUND_WEIGHT_OVER_TIME,
  PROCUREMENT_CHANNELS,
  RECURRING_AVAILABILITY,
  OPERATIONAL_PRESSURE,
  UNAVAILABLE_EPISODES,
  RATIONING_HISTORY,
  cardCsv,
} from '../analytics-cards';
import { MIN_BAR_MM, maxReadableCategories } from '../condense';

/**
 * The card contract, enforced.
 *
 * The first spike re-derived rows inside each renderer and drifted from the
 * screen on its very first output: raw `PURCH-DON` instead of `Purch-Don`, and
 * Fresh Alliance missing the legacy history the screen stacks onto it. These
 * assertions are the mechanism that would have caught both.
 */

/** Shaped like the real payload, with values chosen to be recognisable. */
const analytics = {
  acquisitionMix: [
    { acquisitionClass: 'PURCH-DON', weightHundredths: 33_423_400 },
    { acquisitionClass: 'DONATED', weightHundredths: 307_467_700 },
    { acquisitionClass: 'GOVERNMENT', weightHundredths: 87_372_500 },
    { acquisitionClass: 'PURCHASED', weightHundredths: 49_331_600 },
  ],
  channelMix: [
    { channel: 'ofb_warehouse', weightHundredths: 200_000_000 },
    { channel: 'fresh_alliance', weightHundredths: 50_000_000 },
    { channel: 'community_donation', weightHundredths: 10_000_000 },
  ],
  summary: { freshAllianceLegacyWeightHundredths: 75_000_000 },
};

describe('analytics card contract', () => {
  it('labels rows the way the screen labels them', () => {
    const labels = ACQUISITION_MIX.data(analytics).categories;

    // The exact bug the spike shipped: the enum reaching paper.
    expect(labels).not.toContain('PURCH-DON');
    expect(labels).toEqual(['Donated', 'Government', 'Purchased', 'Purch-Don']);
  });

  it('stacks legacy partner history onto Fresh Alliance, as the screen does', () => {
    const d = PROCUREMENT_CHANNELS.data(analytics);
    const ffa = d.series[0].values[d.categories.indexOf('Fresh Food Alliance')];

    // 50,000,000 + 75,000,000 hundredths = 1,250,000 lb. Omitting the legacy
    // term understates the channel by 750,000 lb.
    expect(ffa).toBe(1_250_000);
  });

  it('converts to display units, not wire units', () => {
    const d = ACQUISITION_MIX.data(analytics);
    expect(d.series[0].values[d.categories.indexOf('Donated')]).toBe(3_074_677);
  });

  it.each(ANALYTICS_CARDS)('$defaultTitle: chart and CSV read the same data', card => {
    const data = card.data(analytics);
    const csv = cardCsv(data);
    const svg = card.print(data);

    // Same categories, same numbers, in both outputs. If a renderer recomputed
    // anything, one of these drifts and this fails.
    for (const category of data.categories) {
      expect(csv, `${category} missing from CSV`).toContain(category);
    }
    for (const s of data.series) {
      expect(csv.split('\r\n')[0], 'series missing from CSV header').toContain(s.name);
      for (const v of s.values) {
        if (v > 0) expect(csv).toContain(String(v));
      }
    }
    expect(csv.split('\r\n')[0].split(',')[0]).toBe(data.categoryColumn);
    // A chart prints SVG, a KPI card HTML tiles, a table an HTML table — and
    // Availability Summary prints a chart *and* tiles, because the screen shows
    // both in one card. The assertion is that something was drawn, not which
    // form it led with.
    expect(/^<(svg|div|table)[\s>]/.test(svg)).toBe(true);
  });

  it.each(ANALYTICS_CARDS)('$defaultTitle: chart depends on no stylesheet', card => {
    const svg = card.print(card.data(analytics));

    // The property that makes this approach deterministic. A `var()` here means
    // the chart would render differently depending on where it was drawn.
    expect(svg).not.toMatch(/var\(--/);
    expect(svg).not.toMatch(/class=/);
  });

  it('has no duplicate card ids', () => {
    const ids = ANALYTICS_CARDS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('survives an empty payload without throwing', () => {
    // A filtered range can legitimately return nothing.
    for (const card of ANALYTICS_CARDS) {
      const data = card.data({});
      expect(() => card.print(data)).not.toThrow();
      // A KPI card still shows its tiles, reading zero or "Unknown" — what the
      // screen does, so the report matches rather than going blank.
      if (card.kind === 'kpi') {
        expect(data.categories.length).toBeGreaterThan(0);
        continue;
      }
      // A chart draws nothing. Asserted on the *values*, not the categories:
      // Seasonal Inbound Weight's axis is the calendar, so it keeps twelve
      // month labels with or without data, exactly as the screen does.
      expect(data.series.flatMap(s => s.values).filter(v => v !== 0)).toEqual([]);
    }
  });
});

/** `count` months of a single flat series, starting 2009-11. */
const monthsPayload = (count: number, channel: string | null = null) => {
  const monthly = Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(2009, 10 + i, 1));
    return {
      bucket: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      donatedWeightHundredths: 100_000,
      purchDonWeightHundredths: 0,
      governmentWeightHundredths: 0,
      purchasedWeightHundredths: 0,
      ofbWarehouseWeightHundredths: 100_000,
      freshAllianceWeightHundredths: 50_000,
      communityDonationWeightHundredths: 0,
    };
  });
  return { monthlyWeight: monthly, filters: { channel } };
};

describe('time-series grain follows the readability threshold', () => {
  /**
   * Short procurement ranges plot deliveries by day. The export has to say so:
   * a CSV whose column reads "month" over a column of dates is the chart and
   * the spreadsheet disagreeing about what a row is.
   */
  it('carries the day grain through to the CSV column', () => {
    const daily = {
      bucketGranularity: 'day',
      monthlyWeight: ['2026-08-11', '2026-08-12', '2026-08-13'].map((bucket) => ({
        bucket,
        donatedWeightHundredths: 100_000,
        purchDonWeightHundredths: 0,
        governmentWeightHundredths: 0,
        purchasedWeightHundredths: 0,
        ofbWarehouseWeightHundredths: 100_000,
        freshAllianceWeightHundredths: 0,
        communityDonationWeightHundredths: 0,
      })),
      filters: { channel: 'all' },
    };

    const data = INBOUND_WEIGHT_OVER_TIME.data(daily);

    expect(data.grain).toBe('day');
    expect(data.categoryColumn).toBe('day');
    expect(data.categories).toEqual(['2026-08-11', '2026-08-12', '2026-08-13']);
    expect(data.note).toBeNull();
  });

  it('still reports months when the payload is monthly', () => {
    const data = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(6));

    expect(data.grain).toBe('month');
    expect(data.categoryColumn).toBe('month');
  });

  it('leaves a printable range at its native grain', () => {
    const limit = maxReadableCategories();
    const data = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(limit));

    expect(data.grain).toBe('month');
    expect(data.note).toBeNull();
    expect(data.categories).toHaveLength(limit);
  });

  it('condenses one step past the threshold, and says so', () => {
    const data = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(201));

    expect(data.grain).toBe('quarter');
    // 2009 Q4 through 2026 Q3 — partial quarters at both ends.
    expect(data.categories).toHaveLength(68);
    expect(data.categories[0]).toBe('2009 Q4');
    expect(data.note).toContain('Condensed to quarters');
    expect(data.note).toContain(`${MIN_BAR_MM}mm`);
    // The way out is stated, not just the fact.
    expect(data.note).toContain('Narrow the date range');
  });

  it('falls to years when quarters are still too dense', () => {
    const data = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(1200));

    expect(data.grain).toBe('year');
    expect(data.note).toContain('Condensed to years');
  });

  it('conserves the totals it condenses', () => {
    // Bucketing must move weight between buckets, never create or lose it.
    const fine = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(24));
    const coarse = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(201));
    const sum = (d: { series: { values: number[] }[] }) =>
      d.series.reduce((t, s) => t + s.values.reduce((a, b) => a + b, 0), 0);

    expect(sum(fine)).toBe(24 * (1000 + 500));
    expect(sum(coarse)).toBe(201 * (1000 + 500));
  });

  it('offers both grains, and defaults to the one the chart drew', () => {
    const data = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(201));

    const condensed = cardCsv(data, 'condensed');
    const raw = cardCsv(data, 'raw');

    expect(condensed.split('\r\n')[0].split(',')[0]).toBe('quarter');
    expect(raw.split('\r\n')[0].split(',')[0]).toBe('month');
    expect(raw).toContain('2009-11');
    expect(raw.trim().split('\r\n')).toHaveLength(202); // header + 201 months
    // Default matches the picture, so an unqualified export is never a file
    // that disagrees with the chart beside it.
    expect(cardCsv(data)).toBe(condensed);
  });

  it('raw and condensed carry the same totals', () => {
    // Different buckets, same weight. If these diverge, condensing is losing
    // or inventing data.
    const data = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(201));
    const total = (csv: string) =>
      csv.trim().split('\r\n').slice(1)
        .reduce((sum, line) => sum + line.split(',').slice(1).reduce((a, b) => a + Number(b), 0), 0);

    expect(total(cardCsv(data, 'raw'))).toBe(total(cardCsv(data, 'condensed')));
  });

  it('falls back to the condensed view when nothing was condensed', () => {
    // "Raw" must mean something for every card, including ones with no
    // coarser form — otherwise the option is a trap on short ranges.
    const data = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(12));

    expect(data.raw).toBeUndefined();
    expect(cardCsv(data, 'raw')).toBe(cardCsv(data, 'condensed'));
  });

  it('condenses the CSV with the chart, so the two agree', () => {
    const data = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(201));
    const csv = cardCsv(data);

    // Header names the coarser grain; no monthly key survives.
    expect(csv.split('\r\n')[0].split(',')[0]).toBe('quarter');
    expect(csv).toContain('2009 Q4');
    expect(csv).not.toContain('2009-11');
    expect(csv.trim().split('\r\n')).toHaveLength(69); // header + 68 quarters
  });
});

describe('time-series card follows the channel filter, as the screen does', () => {
  it('no filter: one series per channel, community only when present', () => {
    const data = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(12, null));

    expect(data.title).toBe('Inbound Weight Over Time');
    expect(data.series.map(s => s.name)).toEqual(['OFB Warehouse', 'Fresh Food Alliance']);
  });

  it('ofb_warehouse: acquisition classes, with the matching title', () => {
    const data = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(12, 'ofb_warehouse'));

    expect(data.title).toBe('Warehouse Weight by Acquisition Class');
    expect(data.series.map(s => s.name)).toEqual([
      'Donated', 'Purch-Don', 'Government', 'Purchased',
    ]);
  });

  it('fresh_alliance: that channel alone', () => {
    const data = INBOUND_WEIGHT_OVER_TIME.data(monthsPayload(12, 'fresh_alliance'));

    expect(data.title).toBe('Fresh Food Alliance Weight Over Time');
    expect(data.series.map(s => s.name)).toEqual(['Fresh Food Alliance']);
  });

  it('includes the community sidecar only when that history is loaded', () => {
    // D22: an always-present empty line would imply every agency has a source
    // it will never have.
    const withCommunity = monthsPayload(12, null);
    withCommunity.monthlyWeight[3].communityDonationWeightHundredths = 5_000;

    expect(INBOUND_WEIGHT_OVER_TIME.data(withCommunity).series.map(s => s.name)).toContain(
      'Donations (Legacy Data)'
    );
  });
});

describe('paid procurement summary follows the channel filter', () => {
  const costs = {
    summary: {
      calculatedGrossProductChargesCents: 1_234_500,
      serviceFeesCents: 45_600,
      grantsAppliedCents: null,
      netRecordedCostCents: null,
    },
    filters: { channel: null },
  };

  it('formats currency and says when a figure cannot be attributed', () => {
    const data = PAID_PROCUREMENT_SUMMARY.data(costs);
    const text = data.series[0].text!;

    expect(text[0]).toBe('$12,345.00');
    expect(text[1]).toBe('$456.00');
    // Order-level figures under an acquisition filter: the screen refuses to
    // guess, and so does the report.
    expect(text[2]).toBe('Not attributable');
    expect(text[3]).toBe('Not attributable');
  });

  it('pins the locale so the same export does not vary by who made it', () => {
    // The screen uses toLocaleString(undefined, ...). A filed document must not
    // depend on the generating browser.
    expect(PAID_PROCUREMENT_SUMMARY.data(costs).series[0].text![0]).toBe('$12,345.00');
  });

  it('is empty for Fresh Alliance, and says why', () => {
    // Donation receipts have no product charges. Zeroes would read as "we paid
    // nothing" rather than "this does not apply".
    const data = PAID_PROCUREMENT_SUMMARY.data({
      ...costs,
      filters: { channel: 'fresh_alliance' },
    });

    expect(data.categories).toEqual([]);
    expect(data.note).toContain('Not applicable to Fresh Food Alliance');
    expect(() => PAID_PROCUREMENT_SUMMARY.print(data)).not.toThrow();
  });
});

describe('card-level options reach the report', () => {
  const products = [
    { description: 'Meat, Chicken Drumsticks', productCode: 'C1', totalSpendCents: 500_00 },
    { description: 'Meals, Chili, Chicken', productCode: 'C2', totalSpendCents: 300_00 },
    { description: 'Condiment, Vegetable Oil', productCode: 'V1', totalSpendCents: 900_00 },
  ];
  const analytics = { paidProducts: products };

  it('shows the unfiltered ranking when the card had no query', () => {
    const data = PAID_PRODUCT_SPEND.data(analytics);

    expect(data.categories).toEqual([
      'Meat, Chicken Drumsticks',
      'Meals, Chili, Chicken',
      'Condiment, Vegetable Oil',
    ]);
    expect(data.note).toBeNull();
  });

  it('applies the cardptions search, matching the screen', () => {
    // Without this the report would show the full ranking while the screen
    // showed two rows — right-looking and wrong.
    const data = PAID_PRODUCT_SPEND.data(analytics, { search: 'chicken' });

    expect(data.categories).toEqual(['Meat, Chicken Drumsticks', 'Meals, Chili, Chicken']);
    expect(data.series[0].values).toEqual([500, 300]);
  });

  it('says on the card that it is filtered', () => {
    // A filtered report that does not declare itself is the misread the whole
    // parity contract exists to prevent.
    const data = PAID_PRODUCT_SPEND.data(analytics, { search: 'chicken' });

    expect(data.note).toContain('Filtered to "chicken"');
    expect(data.note).toContain('2 matching products');
  });

  it('matches on product code as well as description', () => {
    expect(PAID_PRODUCT_SPEND.data(analytics, { search: 'V1' }).categories).toEqual([
      'Condiment, Vegetable Oil',
    ]);
  });

  it('treats a blank or missing query as unfiltered', () => {
    for (const options of [undefined, {}, { search: '' }, { search: '   ' }]) {
      expect(PAID_PRODUCT_SPEND.data(analytics, options).categories).toHaveLength(3);
      expect(PAID_PRODUCT_SPEND.data(analytics, options).note).toBeNull();
    }
  });

  it('keeps the paid-product tail split into the families shown on screen', () => {
    const many = {
      paidProducts: Array.from({ length: 18 }, (_, index) => ({
        description: `${['Meat', 'Veg', 'Meals'][index % 3]}, Product ${index + 1}`,
        productCode: `P${index + 1}`,
        totalSpendCents: (1800 - index * 50) * 100,
      })),
    };

    const data = PAID_PRODUCT_SPEND.data(many);
    const tailIndex = data.categories.findIndex(category => category.startsWith('Other paid products'));
    const tailSegments = data.rowSegments?.[tailIndex] ?? [];

    expect(tailSegments.map(segment => segment.name).sort()).toEqual(['Meals', 'Meat', 'Veg']);
    expect(tailSegments.reduce((sum, segment) => sum + segment.value, 0)).toBe(
      data.series[0].values[tailIndex]
    );

    const svg = PAID_PRODUCT_SPEND.print(data);
    expect(svg).toContain('data-segment="Meat"');
    expect(svg).toContain('data-segment="Veg"');
    expect(svg).toContain('data-segment="Meals"');
    expect(svg).toContain('>Meat<');

    const csv = cardCsv(data);
    expect(csv.match(/Other paid products/g)).toHaveLength(1);
  });
});

describe('seasonal inbound weight compares years, it does not sum them', () => {
  const analytics = {
    range: {
      preset: 'all',
      startDate: '2024-03-15',
      endDate: '2025-02-20',
      timeZone: 'America/Los_Angeles',
    },
    availableYears: ['2025', '2024'],
    seasonalWeight: [
      { year: '2025', month: 1, weightHundredths: 1_000_00 },
      { year: '2025', month: 2, weightHundredths: 2_000_00 },
      { year: '2024', month: 1, weightHundredths: 3_000_00 },
    ],
    seasonalChannelWeight: [
      { year: '2025', month: 1, channel: 'fresh_alliance', weightHundredths: 400_00 },
      { year: '2025', month: 1, channel: 'ofb_warehouse', weightHundredths: 600_00 },
    ],
  };

  it('puts twelve months on the axis and one series per compared year', () => {
    const data = SEASONAL_INBOUND_WEIGHT.data(analytics, {
      channel: 'all',
      yearMode: 'selected',
      years: ['2025', '2024'],
    });

    expect(data.categories).toHaveLength(12);
    expect(data.categories[0]).toBe('Jan');
    expect(data.series.map(s => s.name)).toEqual(['2025', '2024']);
    expect(data.series[0].values[0]).toBe(1000);
    expect(data.series[1].values[0]).toBe(3000);
  });

  it('never condenses — the axis is a calendar month, not a timeline', () => {
    // Twelve categories always print; the readability threshold does not apply.
    const data = SEASONAL_INBOUND_WEIGHT.data(analytics, {
      channel: 'all',
      yearMode: 'selected',
      years: ['2025'],
    });

    expect(data.grain).toBeUndefined();
    expect(data.categoryColumn).toBe('month');
  });

  it('sums the per-channel source when a channel is chosen', () => {
    // The all-channel series is pre-aggregated; the per-channel one is not.
    const data = SEASONAL_INBOUND_WEIGHT.data(analytics, {
      channel: 'fresh_alliance',
      yearMode: 'selected',
      years: ['2025'],
    });

    expect(data.series[0].values[0]).toBe(400);
    expect(data.note).toBe('Fresh Food Alliance only.');
  });

  it('says the card is empty rather than drawing nothing silently', () => {
    const data = SEASONAL_INBOUND_WEIGHT.data(analytics, {
      channel: 'all',
      yearMode: 'selected',
      years: [],
    });

    expect(data.series).toEqual([]);
    expect(data.note).toContain('No calendar years were selected');
    expect(() => SEASONAL_INBOUND_WEIGHT.print(data)).not.toThrow();
  });

  it('gives the CSV one column per year', () => {
    const csv = cardCsv(SEASONAL_INBOUND_WEIGHT.data(analytics, {
      channel: 'all',
      yearMode: 'selected',
      years: ['2025', '2024'],
    }));

    expect(csv.split('\r\n')[0]).toBe('month,2025,2024');
    expect(csv.trim().split('\r\n')).toHaveLength(13); // header + 12 months
  });

  it('derives all years from the new range unless the user chose a subset', () => {
    const automatic = SEASONAL_INBOUND_WEIGHT.data(analytics, {
      channel: 'all',
      // Legacy templates persisted a concrete default year list without a
      // mode. It must not narrow a later All-history run.
      years: ['2025'],
    });
    const selected = SEASONAL_INBOUND_WEIGHT.data(analytics, {
      channel: 'all',
      yearMode: 'selected',
      years: ['2025'],
    });

    expect(automatic.series.map((series) => series.name)).toEqual(['2025', '2024']);
    expect(selected.series.map((series) => series.name)).toEqual(['2025']);
  });

  it('marks only the months inside the resolved range as drawable', () => {
    const data = SEASONAL_INBOUND_WEIGHT.data(analytics, {
      channel: 'all',
      yearMode: 'selected',
      years: ['2025', '2024'],
    });

    expect(data.series[0].defined).toEqual([
      true, true, false, false, false, false, false, false, false, false, false, false,
    ]);
    expect(data.series[1].defined).toEqual([
      false, false, true, true, true, true, true, true, true, true, true, true,
    ]);

    const csv = cardCsv(data).split('\r\n');
    expect(csv[1]).toBe('Jan,1000,');
    expect(csv[3]).toBe('Mar,,0');

    const svg = SEASONAL_INBOUND_WEIGHT.print(data);
    expect(svg).not.toContain('points="62.0,226.0 137.5,226.0 213.0,226.0');
  });
});

describe('operations lens', () => {
  const ops = {
    summary: {
      availableNow: 58, unavailableNow: 110, limitedSupplyNow: 13,
      repeatUnavailableItems: 70, itemRationedNow: 58, categoryRationedNow: 7,
      medianRestorationHours: 331.2,
    },
  };

  it('carries the caveat that makes the three counts add up', () => {
    // Without it the bars read as a partition of the catalogue: 58 + 110 + 13
    // exceeds the tracked total because Limited Supply is a subset.
    expect(AVAILABILITY_SUMMARY.data(ops).note).toContain(
      'Limited Supply is included in Available Now'
    );
  });

  it('formats restoration the way the screen does', () => {
    const data = AVAILABILITY_SUMMARY.data(ops);
    const i = data.categories.indexOf('Median Restoration');

    expect(data.series[0].text![i]).toBe('13.8 days');
    expect(AVAILABILITY_SUMMARY.data({ summary: { medianRestorationHours: 6.25 } })
      .series[0].text!.at(-1)).toBe('6.3 hr');
    expect(AVAILABILITY_SUMMARY.data({ summary: {} }).series[0].text!.at(-1)).toBe('Unknown');
  });

  it('declares the operations lens so the route loads the right payload', () => {
    expect(AVAILABILITY_SUMMARY.lens).toBe('operations');
  });
});

describe('fresh alliance category mix segments by donor', () => {
  const analytics = {
    freshAllianceDonorCategories: [
      { description: 'Produce (Fresh Alliance)', donorName: 'Trader Joe', donorCode: 'TJ', totalWeightHundredths: 300_00 },
      { description: 'Produce (Fresh Alliance)', donorName: 'Fred Meyer', donorCode: 'FM', totalWeightHundredths: 100_00 },
      { description: 'Dairy (Fresh Alliance)', donorName: 'Trader Joe', donorCode: 'TJ', totalWeightHundredths: 50_00 },
    ],
  };

  it('stacks donors within each category, biggest category first', () => {
    const data = FRESH_ALLIANCE_CATEGORY_MIX.data(analytics);

    expect(data.categories).toEqual(['Produce', 'Dairy']);
    // Legend ordered by total weight across categories: TJ 350 > FM 100.
    expect(data.series.map(s => s.name)).toEqual(['Trader Joe', 'Fred Meyer']);
    expect(data.series[0].values).toEqual([300, 50]);
    expect(data.series[1].values).toEqual([100, 0]);
  });

  it('strips the redundant channel suffix from category labels', () => {
    expect(FRESH_ALLIANCE_CATEGORY_MIX.data(analytics).categories).not.toContain(
      'Produce (Fresh Alliance)'
    );
  });

  it('honours the donor filter, and says it is narrowed', () => {
    // The filter lives on the table beneath the chart; a report generated with
    // one donor selected must not quietly show all of them.
    const data = FRESH_ALLIANCE_CATEGORY_MIX.data(analytics, { donorCodes: ['TJ'] });

    expect(data.series.map(s => s.name)).toEqual(['Trader Joe']);
    expect(data.series[0].values).toEqual([300, 50]);
    expect(data.note).toBe('Narrowed to 1 donor.');
  });

  it('includes every donor when no filter travelled', () => {
    expect(FRESH_ALLIANCE_CATEGORY_MIX.data(analytics).note).toBeNull();
  });
});

describe('category pressure keeps its signals independent', () => {
  const ops = {
    categoryPressure: [
      {
        categoryName: 'Beans',
        limitedSupplyServicePercent: 98,
        clearanceServicePercent: 0,
        itemRationedServicePercent: 100,
        categoryRationedServicePercent: null,
      },
    ],
  };

  it('exposes four series, not one total', () => {
    const data = CATEGORY_PRESSURE.data(ops);

    // 98 + 0 + 100 sums past 100 because these measure different things. A
    // stacked bar would render a length that means nothing.
    expect(data.series.map(s => s.name)).toEqual([
      'Limited Supply', 'Clearance', 'Item Limits', 'Category Limits',
    ]);
    expect(data.note).toContain('not parts of one total');
  });

  it('distinguishes "not computed" from zero', () => {
    // A null percent means the signal could not be computed for that category.
    // Printing it as 0% would assert no pressure, which is a different claim.
    const data = CATEGORY_PRESSURE.data(ops);

    expect(data.series[1].text![0]).toBe('0.0%');
    expect(data.series[3].text![0]).toBe('—');
    expect(data.series[3].defined![0]).toBe(false);
    expect(CATEGORY_PRESSURE.print(data)).toContain('>100%<');
    expect(CATEGORY_PRESSURE.print(data)).toContain('>98.0%<');
  });

  it('says so when nothing was recorded', () => {
    const data = CATEGORY_PRESSURE.data({ categoryPressure: [] });

    expect(data.categories).toEqual([]);
    expect(data.note).toContain('No category pressure was recorded');
    expect(() => CATEGORY_PRESSURE.print(data)).not.toThrow();
  });
});

describe('operations print charts expose their scale and values', () => {
  it('labels recurring availability counts', () => {
    const data = RECURRING_AVAILABILITY.data({
      recurringAvailability: [
        { itemName: 'Rice', unavailableEntries: 5, restorations: 4 },
      ],
      summary: {},
    });
    const svg = RECURRING_AVAILABILITY.print(data);

    expect(svg).toContain('data-axis-tick="true"');
    expect(svg).toContain('data-bar-value="Unavailable Entries"');
    expect(svg).toContain('>5<');
  });

  it('labels the latest operational-pressure value for every line', () => {
    const data = OPERATIONAL_PRESSURE.data({
      timeline: [
        { date: '2026-07-01', limitedSupply: 2, clearance: 1, categoryRationed: 3 },
        { date: '2026-07-02', limitedSupply: 5, clearance: 4, categoryRationed: 3 },
      ],
      rationedLimitSeries: [],
    });
    const svg = OPERATIONAL_PRESSURE.print(data);

    expect(svg.match(/data-end-label=/g)).toHaveLength(3);
    expect(svg).toContain('data-end-label="Limited Supply"');
  });
});

describe('operations table cards retain the selected view', () => {
  it('applies the Unavailable Episodes sort and page captured by selection', () => {
    const episodes = Array.from({ length: 6 }, (_, index) => ({
      itemName: `Item ${index + 1}`,
      categoryName: 'Pantry',
      startedAt: '2026-07-01T12:00:00.000Z',
      endedAt: '2026-07-02T12:00:00.000Z',
      durationHours: index + 1,
      resolution: 'restored',
    }));
    const data = UNAVAILABLE_EPISODES.data({ episodes }, {
      sort: { id: 'durationHours', desc: true },
      pageSize: 2,
      pageIndex: 1,
    });

    expect(data.categories).toEqual(['Item 4', 'Item 3']);
    expect(data.note).toContain('showing rows 3–4 of 6');
  });

  it('applies the Rationing History sort and page captured by selection', () => {
    const limitChanges = Array.from({ length: 6 }, (_, index) => ({
      entityName: `Policy ${index + 1}`,
      entityType: 'food_item',
      categoryName: 'Pantry',
      limit: index + 1,
      limitType: 'person',
      isNoLimit: false,
      recordedAt: '2026-07-01T12:00:00.000Z',
    }));
    const data = RATIONING_HISTORY.data({ limitChanges }, {
      sort: { id: 'limit', desc: true },
      pageSize: 2,
      pageIndex: 1,
    });

    expect(data.categories).toEqual(['Policy 4', 'Policy 3']);
    expect(data.note).toContain('showing rows 3–4 of 6');
  });
});

describe('table cards reproduce how the user configured the table', () => {
  const analytics = {
    warehouseProducts: [
      { description: 'Chicken Thighs', productCode: 'C1', acquisitionClass: 'PURCHASED', receiptDateCount: 3, totalWeightHundredths: 100_00, totalSpendCents: 900_00, costPerPaidPoundCents: 900, lastReceivedDate: '2026-07-01' },
      { description: 'Apples', productCode: 'A1', acquisitionClass: 'DONATED', receiptDateCount: 9, totalWeightHundredths: 500_00, totalSpendCents: 0, costPerPaidPoundCents: null, lastReceivedDate: '2026-07-05' },
      { description: 'Chicken Wings', productCode: 'C2', acquisitionClass: 'PURCHASED', receiptDateCount: 1, totalWeightHundredths: 50_00, totalSpendCents: 300_00, costPerPaidPoundCents: 600, lastReceivedDate: '2026-06-01' },
    ],
  };

  it('sorts on the underlying value, not the formatted text', () => {
    // "$900.00" vs "$300.00" sorts correctly as text by luck; "$9" vs "$10"
    // would not. Sorting always uses the raw number.
    const data = WAREHOUSE_PRODUCT_HISTORY.data(analytics, {
      sort: { id: 'totalSpendCents', desc: true },
    });

    expect(data.categories).toEqual(['Chicken Thighs', 'Chicken Wings', 'Apples']);
  });

  it('applies filter, then sort, then page — the order the table does', () => {
    const data = WAREHOUSE_PRODUCT_HISTORY.data(analytics, {
      search: 'chicken',
      sort: { id: 'totalSpendCents', desc: false },
      pageSize: 1,
      pageIndex: 0,
    });

    expect(data.categories).toEqual(['Chicken Wings']);
    expect(data.note).toContain('filtered to "chicken"');
    expect(data.note).toContain('showing rows 1–1 of 2');
  });

  it('honours which columns the user left visible', () => {
    const data = WAREHOUSE_PRODUCT_HISTORY.data(analytics, {
      visibleColumns: ['description', 'totalWeightHundredths'],
    });

    expect(data.categoryColumn).toBe('Product');
    expect(data.series.map(s => s.name)).toEqual(['Total Weight']);
  });

  it('keeps the em dash for an unpaid product', () => {
    // $0.00 would read as "we paid nothing"; the dash says the charge does not
    // apply, which is what a donated product means.
    const data = WAREHOUSE_PRODUCT_HISTORY.data(analytics, { sort: { id: 'description', desc: false } });
    const charges = data.series.find(s => s.name === 'Total Charges')!;

    expect(charges.text![0]).toBe('—');
  });

  it('prints a hundred rows with a repeating header and unbroken rows', () => {
    // A long table is a legitimate export. It has to survive page breaks.
    const many = {
      warehouseProducts: Array.from({ length: 100 }, (_, i) => ({
        ...analytics.warehouseProducts[0],
        description: `Product ${i}`,
      })),
    };
    const html = WAREHOUSE_PRODUCT_HISTORY.print(
      WAREHOUSE_PRODUCT_HISTORY.data(many, { pageSize: 100 })
    );

    expect((html.match(/<tr /g) ?? [])).toHaveLength(100);
    expect(html).toContain('table-header-group');
    expect(html).toContain('break-inside:avoid');
  });

  it('exports the same rows to CSV that it drew', () => {
    const data = WAREHOUSE_PRODUCT_HISTORY.data(analytics, { search: 'chicken' });
    const csv = cardCsv(data);

    expect(csv.split('\r\n')[0]).toContain('Product');
    expect(csv).toContain('Chicken Thighs');
    expect(csv).not.toContain('Apples');
  });
});
