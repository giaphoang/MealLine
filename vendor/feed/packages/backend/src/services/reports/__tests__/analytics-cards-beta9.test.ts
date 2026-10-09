// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import {
  ANALYTICS_CARDS,
  FRESH_ALLIANCE_DONATIONS_OVER_TIME,
  FRESH_ALLIANCE_PICKUP_HISTORY,
  GROCERY_PARTNER_MIX,
  LEGACY_DONATION_HISTORY,
  LEGACY_DONATIONS_OVER_TIME,
  OPERATIONAL_PRESSURE,
  RECORDED_DONATED_VALUE,
  RECURRING_AVAILABILITY,
  cardCsv,
} from '../analytics-cards';

/**
 * The eight cards that were on screen but not exportable.
 *
 * Each one carries at least one decision that a naive re-derivation gets wrong,
 * so these assert the decision rather than the plumbing: that legacy months are
 * opt-in, that a partner's silent month is a zero and not a gap, that a card
 * filter narrows what prints, and that a share is computed against the whole
 * range rather than the visible rows.
 */

const operations = {
  summary: {
    repeatUnavailableItems: 18,
    recurringUnavailableEntries: 44,
    recurringOngoingEpisodes: 18,
    recurringMedianRestorationHours: 211.2,
  },
  recurringAvailability: Array.from({ length: 12 }, (_, i) => ({
    itemName: `Item ${i}`,
    unavailableEntries: 12 - i,
    restorations: 11 - i,
  })),
  timeline: [
    { date: '2026-05-01', limitedSupply: 4, clearance: 1, categoryRationed: 2, rationedByLimit: { '1|household': 3 } },
    { date: '2026-05-02', limitedSupply: 6, clearance: 0, categoryRationed: 2, rationedByLimit: { '1|household': 5 } },
  ],
  rationedLimitSeries: [{ key: '1|household', limit: 1, limitType: 'household' }],
};

const procurement = {
  donors: [
    {
      donorCode: 'FRED',
      donorName: 'Fred Meyer Hollywood',
      weightHundredths: 750_000,
      pickupCount: 30,
      averageWeightPerPickupHundredths: 25_000,
      categories: ['Produce', 'Bakery'],
      firstReceivedDate: '2026-05-01',
      lastReceivedDate: '2026-05-30',
    },
    {
      donorCode: 'TJ',
      donorName: "Trader Joe's",
      weightHundredths: 250_000,
      pickupCount: 10,
      averageWeightPerPickupHundredths: 25_000,
      categories: ['Dairy'],
      firstReceivedDate: '2026-05-02',
      lastReceivedDate: '2026-05-29',
    },
  ],
  donorValue: {
    recordedValueCents: 1_234_500,
    valuedWeightHundredths: 600_000,
    unvaluedWeightHundredths: 400_000,
  },
  donorMonthlyWeight: [
    { bucket: '2026-04', donorCode: 'FRED', weightHundredths: 300_000 },
    { bucket: '2026-05', donorCode: 'FRED', weightHundredths: 450_000 },
    { bucket: '2026-05', donorCode: 'TJ', weightHundredths: 250_000 },
  ],
  freshAllianceLegacyMonthlyWeight: [
    { bucket: '2023-05', donorCode: 'FRED', weightHundredths: 100_000 },
  ],
  communitySources: [
    { sourceName: 'St. Andrew Parish', weightHundredths: 500_000, isFreshAlliancePartner: false },
    { sourceName: 'Fred Meyer Hollywood', weightHundredths: 900_000, isFreshAlliancePartner: true },
    { sourceName: 'Neighborhood Drive', weightHundredths: 200_000, isFreshAlliancePartner: false },
  ],
  communityMonthlyWeight: [
    { bucket: '2022-11', sourceName: 'St. Andrew Parish', weightHundredths: 300_000 },
    { bucket: '2022-12', sourceName: 'Neighborhood Drive', weightHundredths: 200_000 },
    { bucket: '2022-12', sourceName: 'Fred Meyer Hollywood', weightHundredths: 900_000 },
  ],
};

describe('Recurring Availability', () => {
  it('shows the same top eight the screen does', () => {
    const data = RECURRING_AVAILABILITY.data(operations);
    expect(data.categories).toHaveLength(8);
    expect(data.categories[0]).toBe('Item 0');
  });

  it('keeps entries and restorations as separate series', () => {
    // Grouped, not stacked: an item restored fewer times than it went
    // unavailable is the interesting case, and a stacked total hides it.
    const data = RECURRING_AVAILABILITY.data(operations);
    expect(data.series.map(s => s.name)).toEqual(['Unavailable Entries', 'Restorations']);
  });

  it('carries the summary figures as tiles, not as rows of the dataset', () => {
    const data = RECURRING_AVAILABILITY.data(operations);

    expect(data.tiles?.map(t => t.label)).toEqual([
      'Recurring Items',
      'Repeat Episodes',
      'Currently Unavailable',
      'Recurring Median Restoration',
    ]);
    // 211.2 hours is 8.8 days — the screen's own wording.
    expect(data.tiles?.[3].value).toBe('8.8 days');
    // The CSV is the per-item table; a tile label in this column would be junk.
    expect(cardCsv(data)).not.toContain('Repeat Episodes');
  });

  it('says so plainly when no item entered the cohort', () => {
    const data = RECURRING_AVAILABILITY.data({ summary: {}, recurringAvailability: [] });
    expect(data.note).toContain('No items completed enough availability cycles');
  });
});

describe('Operational Pressure', () => {
  it('draws one line per limit configuration alongside the fixed signals', () => {
    const data = OPERATIONAL_PRESSURE.data(operations);
    expect(data.series.map(s => s.name)).toEqual([
      'Limited Supply',
      'Clearance',
      'Categories with Limits',
      '1 Per Household',
    ]);
  });

  it('never expands a category limit into implied item counts', () => {
    // Categories with Limits stays a count of categories: 2 on both days,
    // not multiplied by the items inside them.
    const data = OPERATIONAL_PRESSURE.data(operations);
    expect(data.series.find(s => s.name === 'Categories with Limits')!.values).toEqual([2, 2]);
  });
});

describe('Grocery Partner Mix', () => {
  it('reports partner pounds and excludes legacy donations', () => {
    const data = GROCERY_PARTNER_MIX.data(procurement);

    expect(data.categories).toEqual(['Fred Meyer Hollywood', "Trader Joe's"]);
    expect(data.series[0].values).toEqual([7500, 2500]);
    expect(data.note).toContain('Does not include legacy donations');
  });
});

describe('Recorded Donated Value', () => {
  it('keeps the valued/unvalued split, so the total cannot read as everything', () => {
    const data = RECORDED_DONATED_VALUE.data(procurement);

    expect(data.categories).toEqual([
      'Recorded value',
      'Pounds with a recorded rate',
      'Pounds without a recorded rate',
    ]);
    expect(data.series[0].text).toEqual(['$12,345', '6,000 lb', '4,000 lb']);
  });

  it('puts the figures in the CSV, because here the tiles are the data', () => {
    const csv = cardCsv(RECORDED_DONATED_VALUE.data(procurement));
    expect(csv).toContain('Recorded value');
    expect(csv).toContain('$12,345');
  });
});

describe('Fresh Food Alliance Pickup History', () => {
  it('computes share against the whole range, not the visible rows', () => {
    // Filtering to one partner must not report it as 100% of everything.
    const data = FRESH_ALLIANCE_PICKUP_HISTORY.data(procurement, { search: 'Trader' });
    const share = data.series.find(s => s.name === 'Share')!;

    expect(data.categories).toEqual(["Trader Joe's"]);
    expect(share.text![0]).toBe('25%');
  });

  it('reproduces the columns the screen shows, in order', () => {
    const data = FRESH_ALLIANCE_PICKUP_HISTORY.data(procurement, {});
    expect([data.categoryColumn, ...data.series.map(s => s.name)]).toEqual([
      'Partner',
      'Pickups',
      'Received',
      'Share',
      'Average load',
      'Categories',
      'Observed range',
    ]);
  });
});

describe('Fresh Food Alliance Donations Over Time', () => {
  it('leaves legacy months out unless the screen switch was on', () => {
    const off = FRESH_ALLIANCE_DONATIONS_OVER_TIME.data(procurement, {});
    const on = FRESH_ALLIANCE_DONATIONS_OVER_TIME.data(procurement, { showLegacy: true });

    expect(off.categories).toEqual(['2026-04', '2026-05']);
    expect(on.categories).toEqual(['2023-05', '2026-04', '2026-05']);
    expect(on.note).toContain('legacy records');
  });

  it('writes a zero for a month a partner did not deliver in', () => {
    // A gap would let the line bridge the month and draw a delivery that
    // never happened.
    const data = FRESH_ALLIANCE_DONATIONS_OVER_TIME.data(procurement, {});
    expect(data.series.find(s => s.name === "Trader Joe's")!.values).toEqual([0, 2500]);
  });

  it('narrows to the chosen partners and says that it did', () => {
    const data = FRESH_ALLIANCE_DONATIONS_OVER_TIME.data(procurement, { donorCodes: ['TJ'] });

    expect(data.series.map(s => s.name)).toEqual(["Trader Joe's"]);
    expect(data.note).toContain('Partners narrowed to 1');
  });

  it('claims no filter when the picker was left alone', () => {
    const data = FRESH_ALLIANCE_DONATIONS_OVER_TIME.data(procurement, {});
    expect(data.note ?? '').not.toContain('narrowed');
  });
});

describe('legacy donation cards', () => {
  it('carries the discontinued-record provenance onto the card', () => {
    const data = LEGACY_DONATION_HISTORY.data(procurement);
    expect(data.note).toContain('discontinued June 2023');
  });

  it('includes Fresh Alliance partners in the mix, as the screen does', () => {
    const data = LEGACY_DONATION_HISTORY.data(procurement);
    expect(data.categories).toContain('Fred Meyer Hollywood');
  });

  it('excludes partners from the over-time card, so no month is drawn twice', () => {
    // A partner's pre-2023 timeline belongs to the Fresh Alliance card.
    const data = LEGACY_DONATIONS_OVER_TIME.data(procurement, {});

    expect(data.series.map(s => s.name)).toEqual(['St. Andrew Parish', 'Neighborhood Drive']);
    expect(data.series.map(s => s.name)).not.toContain('Fred Meyer Hollywood');
  });

  it('narrows to the chosen sources', () => {
    const data = LEGACY_DONATIONS_OVER_TIME.data(procurement, {
      sourceNames: ['St. Andrew Parish'],
    });

    expect(data.series.map(s => s.name)).toEqual(['St. Andrew Parish']);
    expect(data.note).toContain('Sources narrowed to 1');
  });
});

describe('the registry after beta.9', () => {
  it('registers all forty-two cards with unique ids', () => {
    const ids = ANALYTICS_CARDS.map(card => card.id);
    expect(ids).toHaveLength(42);
    expect(new Set(ids).size).toBe(42);
  });

  it('gives every card a data() and a print() that survive an empty payload', () => {
    // A card that throws on an empty range takes the whole archive down with
    // it, and an empty range is an ordinary thing to ask for.
    for (const card of ANALYTICS_CARDS) {
      expect(() => card.print(card.data({}, {})), card.id).not.toThrow();
    }
  });
});
