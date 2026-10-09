// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { buildAnalyticsReport } from '../analytics-report';
import {
  SERVICE_HOUSEHOLD_SIZE,
  SERVICE_LANGUAGES,
  SERVICE_METHOD_MIX,
  SERVICE_QUEUE_CALL_MILESTONES,
  SERVICE_QUEUE_TIMING,
  SERVICE_QUEUE_VOLUME,
  SERVICE_RESPONSE_COVERAGE,
  SERVICE_OVER_TIME,
  SERVICE_SEASONAL_HOUSEHOLDS,
  SERVICE_SUMMARY,
  SERVICE_UNMET_DEMAND,
  cardCsv,
  getAnalyticsCard,
} from '../analytics-cards';

/**
 * The Service lens, as reports.
 *
 * The lens shipped on screen with no registry entries at all, so selecting a
 * Service card produced an archive that silently omitted it — and a
 * Service-only selection crashed outright, because the printed header read a
 * `range` field only the other two lenses carry.
 *
 * These assert the decisions rather than the plumbing: that absence and zero
 * stay distinct across two archives beginning years apart, that an unfinished
 * month is dropped and named exactly as the screen drops and names it, and
 * that provenance survives a report drawn from Service alone.
 */

const SERVICE_ANALYTICS = {
  coverage: {
    startDate: '2023-01-01',
    endDate: '2024-03-31',
    granularity: 'month' as const,
    sources: [
      { source: 'link2feed', firstDate: '2023-01-04', lastDate: '2023-08-30', encounters: 40 },
      { source: 'simc', firstDate: '2023-09-06', lastDate: '2024-03-27', encounters: 60 },
    ],
    hasIntake: true,
    hasServiceLog: true,
    serviceLogFirstDate: '2023-10-04',
    serviceLogLastDate: '2024-03-27',
  },
  summary: {
    visits: 100,
    peopleServed: 250,
    identityUnavailableVisits: 7,
    bulkEntryVisits: 2,
    bulkEntryPeople: 30,
    households: 80,
    householdsSource: 'service_log' as const,
    methods: [
      { metricKey: 'pantry', displayName: 'Pantry Shopping Visits', unit: '', iconName: 'x', households: 60 },
      { metricKey: 'bags', displayName: 'Premade Bags', unit: '', iconName: 'x', households: 20 },
    ],
    otherServices: [
      { metricKey: 'camping', displayName: 'Camping Gear Requests', unit: 'requests', iconName: 'x', total: 21 },
    ],
  },
  overTime: [
    // Link2Feed stops when SIMC starts; the Service Log begins later still.
    { month: '2023-08', link2feedHouseholds: 10, link2feedIndividuals: 25, simcHouseholds: null, simcIndividuals: null, serviceLogHouseholds: null },
    { month: '2023-10', link2feedHouseholds: null, link2feedIndividuals: null, simcHouseholds: 12, simcIndividuals: 30, serviceLogHouseholds: 11 },
  ],
  seasonal: {
    years: ['2023', '2024'],
    // 2024 ran only part of the calendar; the rest of its slots are absent.
    households: [
      { month: 'Jan', '2023': 5, '2024': 9 },
      { month: 'Feb', '2023': 6 },
    ],
    // Same months, counted without the DISTINCT — always at least households.
    visits: [
      { month: 'Jan', '2023': 8, '2024': 14 },
      { month: 'Feb', '2023': 9 },
    ],
  },
  methodSeries: {
    granularity: 'month' as const,
    methods: [
      { metricKey: 'pantry', displayName: 'Pantry Shopping Visits', unit: '', iconName: 'x', firstRecordedDate: '2023-08-02' },
      { metricKey: 'emergency', displayName: 'Emergency Bags', unit: '', iconName: 'x', firstRecordedDate: '2023-10-04' },
    ],
    buckets: [
      { bucket: '2023-08', pantry: 30 },
      { bucket: '2023-10', pantry: 40, emergency: 0 },
    ],
  },
  recordAgreement: {
    sharedDays: 20, intakeTotal: 100, serviceLogTotal: 99,
    meanAbsoluteDailyDifference: 0.5, agreementPercent: 99,
  },
  unmetDemand: {
    granularity: 'month' as const,
    buckets: [
      // Before the Service Log there is no record; inside it, a blank is a zero.
      { bucket: '2023-08', turnedAway: null },
      { bucket: '2023-10', turnedAway: 0 },
      { bucket: '2023-11', turnedAway: 4 },
    ],
    householdsTurnedAway: 4,
    daysWithTurnAway: 1,
    daysRecorded: 20,
    capacityReachedDays: 2,
    firstRecordedDate: '2023-11-08',
  },
  languages: {
    // Chart-facing: "Mandarin Chinese" has been folded into "Mandarin", while
    // "Chinese" — a different name, not a longer one — stays on its own.
    values: [
      { language: 'English', households: 40 },
      { language: 'Mandarin', households: 9 },
      { language: 'Chinese', households: 1 },
    ],
    // Exactly what households recorded, for the export.
    rawValues: [
      { language: 'English', households: 40 },
      { language: 'Mandarin Chinese', households: 6 },
      { language: 'Mandarin', households: 3 },
      { language: 'Chinese', households: 1 },
    ],
    mergedLabels: 1,
    householdsAsked: 80,
    householdsAnswered: 50,
  },
  responseCoverage: [
    { dimension: 'postal_code', displayName: 'Postal code', provided: 70, notProvided: 10, sources: ['link2feed', 'simc'] },
    { dimension: 'employment', displayName: 'Employment', provided: 1, notProvided: 60, sources: ['simc'] },
  ],
  householdSize: [
    { people: 1, visits: 50 },
    { people: 2, visits: 30 },
  ],
  reachAndFrequency: [{ year: '2023', households: 80, visits: 100, visitsPerHousehold: 1.25 }],
  queueTiming: {
    includedSessionCount: 2,
    includedServiceDayCount: 2,
    volumeServiceDayCount: 2,
    pendingReviewCount: 1,
    excludedSessionCount: 0,
    observedTicketCount: 38,
    medianWaitMinutes: 20,
    averageWaitMinutes: 22,
    p75WaitMinutes: 30,
    p90WaitMinutes: 40,
    historicalServingIntervalMinutes: 2.2,
    typicalLastCallLocalTime: '11:26 AM',
    medianInitialBatchSize: 10,
    averageIssuedPerServiceDay: 33.5,
    averageReturnedPerServiceDay: 0.5,
    daily: [
      { serviceDate: '2026-08-20', issuedCount: 40, returnedCount: 0, calledCount: 12, initialBatchIssuedCount: 10, tenthCallLocalMinute: 670, twentyFifthCallLocalMinute: null, fiftiethCallLocalMinute: null, lastCallLocalMinute: 672 },
      { serviceDate: '2026-08-21', issuedCount: 27, returnedCount: 1, calledCount: 26, initialBatchIssuedCount: 10, tenthCallLocalMinute: 670, twentyFifthCallLocalMinute: 685, fiftiethCallLocalMinute: null, lastCallLocalMinute: 686 },
    ],
  },
};

describe('the Service cards', () => {
  it('registers the service cards under the service lens', () => {
    const ids = [
      'service-summary',
      'service-queue-timing',
      'service-queue-volume',
      'service-queue-call-milestones',
      'service-over-time',
      'service-seasonal-households',
      'service-method-mix',
      'service-unmet-demand',
    ];
    for (const id of ids) {
      const card = getAnalyticsCard(id);
      expect(card, `${id} is on screen but not in the registry`).toBeDefined();
      expect(card!.lens).toBe('service');
    }
  });

  it('exports queue statistics and daily volume using actual call counts', () => {
    const statistics = SERVICE_QUEUE_TIMING.data(SERVICE_ANALYTICS);
    expect(statistics.title).toBe('Queue Statistics');
    expect(statistics.tiles).toEqual(expect.arrayContaining([
      { label: 'Typical initial issuance', value: '10' },
      { label: 'Average tickets issued', value: '33.5' },
      { label: 'Average tickets returned', value: '0.5' },
    ]));

    const volume = SERVICE_QUEUE_VOLUME.data(SERVICE_ANALYTICS);
    expect(volume.series.find((series) => series.name === 'Tickets called')?.values).toEqual([12, 26]);
    expect(cardCsv(volume)).toContain('2026-08-20,40,0,12,10');
  });

  it('exports unknown partial legacy volume as blank rather than zero', () => {
    const withPartial = {
      ...SERVICE_ANALYTICS,
      queueTiming: {
        ...SERVICE_ANALYTICS.queueTiming,
        daily: [
          { ...SERVICE_ANALYTICS.queueTiming.daily[0], issuedCount: null, returnedCount: null, calledCount: null, initialBatchIssuedCount: null },
          SERVICE_ANALYTICS.queueTiming.daily[1],
        ],
      },
    };
    const volume = SERVICE_QUEUE_VOLUME.data(withPartial);
    expect(cardCsv(volume).split('\r\n')[1]).toBe('2026-08-20,,,,');
    expect(volume.note).toContain('Partial legacy days are gaps');
  });

  it('exports call milestones as local clock times and leaves unmet milestones blank', () => {
    const milestones = SERVICE_QUEUE_CALL_MILESTONES.data(SERVICE_ANALYTICS);
    const csv = cardCsv(milestones);
    expect(csv).toContain('2026-08-20,11:10 AM,,,11:12 AM');
    expect(csv).toContain('2026-08-21,11:10 AM,11:25 AM,,11:26 AM');
    expect(SERVICE_QUEUE_CALL_MILESTONES.print(milestones)).toContain('11:00 AM');
  });

  it('registers the client cards under their own lens', () => {
    // Split from Service so the two questions stop sharing a heading. The ids
    // moved with them, which is safe only because no template has been saved
    // against the old ones — the lens has not shipped.
    for (const id of [
      'clients-household-size',
      'clients-languages',
      'clients-response-coverage',
    ]) {
      expect(getAnalyticsCard(id)!.lens).toBe('clients');
    }
  });

  it('keeps a record out of the chart before it existed, rather than drawing a zero', () => {
    const data = SERVICE_OVER_TIME.data(SERVICE_ANALYTICS);
    const serviceLog = data.series.find(s => s.name === 'Service Log Households')!;

    // August predates the Service Log; October is inside it. A zero here would
    // claim WTH served nobody in a month it was not yet keeping the record.
    expect(serviceLog.defined).toEqual([false, true]);
    expect(data.series.find(s => s.name === 'Link2Feed Households')!.defined).toEqual([true, false]);
    expect(cardCsv(data)).toContain('2023-08');
    // An absent slot is an empty cell, not a zero, in the CSV too.
    // Link2Feed's two figures, then three empty cells: SIMC and the Service
    // Log did not exist yet.
    expect(cardCsv(data).split('\r\n')[1]).toBe('2023-08,10,25,,,');
  });

  it('drops a record with no reach into the range instead of an empty legend entry', () => {
    const noServiceLog = {
      ...SERVICE_ANALYTICS,
      overTime: SERVICE_ANALYTICS.overTime.map(row => ({ ...row, serviceLogHouseholds: null })),
    };
    const names = SERVICE_OVER_TIME.data(noServiceLog).series.map(s => s.name);
    expect(names).not.toContain('Service Log Households');
  });

  it('leaves a partial year absent for the months it did not run', () => {
    const data = SERVICE_SEASONAL_HOUSEHOLDS.data(SERVICE_ANALYTICS);
    expect(data.series.find(s => s.name === '2024')!.defined).toEqual([true, false]);
    expect(data.series.find(s => s.name === '2023')!.defined).toEqual([true, true]);
  });

  it('exports the measure the card was showing, and says which it is', () => {
    // Both are counts of the same rows, so nothing in the numbers themselves
    // tells the reader which question was asked. The title and note have to.
    const households = SERVICE_SEASONAL_HOUSEHOLDS.data(SERVICE_ANALYTICS, { measure: 'households' });
    expect(households.title).toBe('Households by Season');
    expect(households.series.find(s => s.name === '2023')!.values).toEqual([5, 6]);
    expect(households.note).toContain('only counted once');

    const visits = SERVICE_SEASONAL_HOUSEHOLDS.data(SERVICE_ANALYTICS, { measure: 'visits' });
    expect(visits.title).toBe('Visits by Season');
    expect(visits.series.find(s => s.name === '2023')!.values).toEqual([8, 9]);
    expect(visits.note).toContain('counted each time');
  });

  it('defaults to households when no measure was frozen', () => {
    // Templates saved before the toggle existed carry no measure.
    expect(SERVICE_SEASONAL_HOUSEHOLDS.data(SERVICE_ANALYTICS).title).toBe('Households by Season');
    expect(SERVICE_SEASONAL_HOUSEHOLDS.data(SERVICE_ANALYTICS, {}).title).toBe('Households by Season');
  });

  it('exports only the years that were selected on screen', () => {
    const data = SERVICE_SEASONAL_HOUSEHOLDS.data(SERVICE_ANALYTICS, {
      yearMode: 'selected', years: ['2023'],
    });
    expect(data.series.map(s => s.name)).toEqual(['2023']);

    // A year that has since left the range cannot be resurrected by a template.
    const stale = SERVICE_SEASONAL_HOUSEHOLDS.data(SERVICE_ANALYTICS, {
      yearMode: 'selected', years: ['2023', '2019'],
    });
    expect(stale.series.map(s => s.name)).toEqual(['2023']);
  });

  it('treats a silent month inside a method’s life as a real zero', () => {
    const data = SERVICE_METHOD_MIX.data(SERVICE_ANALYTICS);
    const emergency = data.series.find(s => s.name === 'Emergency Bags')!;
    // The program began in October: August is absent, October is a true zero.
    expect(emergency.defined).toEqual([false, true]);
    expect(emergency.values[1]).toBe(0);
  });

  it('drops the unfinished month and names it, exactly as the screen does', () => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    const withPartial = {
      ...SERVICE_ANALYTICS,
      overTime: [
        ...SERVICE_ANALYTICS.overTime,
        { month: thisMonth, link2feedHouseholds: null, link2feedIndividuals: null, simcHouseholds: 1, simcIndividuals: 2, serviceLogHouseholds: 1 },
      ],
      methodSeries: {
        ...SERVICE_ANALYTICS.methodSeries,
        buckets: [...SERVICE_ANALYTICS.methodSeries.buckets, { bucket: thisMonth, pantry: 1, emergency: 1 }],
      },
    };

    const timeline = SERVICE_OVER_TIME.data(withPartial);
    expect(timeline.categories).not.toContain(thisMonth);
    expect(timeline.note).toContain('is still in progress and is not plotted');

    const methods = SERVICE_METHOD_MIX.data(withPartial);
    expect(methods.categories).not.toContain(thisMonth);
    expect(methods.note).toContain('is still in progress and is not plotted');
  });

  it('keeps the whole of a daily range, where no bucket is half counted', () => {
    const daily = {
      ...SERVICE_ANALYTICS,
      coverage: { ...SERVICE_ANALYTICS.coverage, granularity: 'day' as const },
      overTime: [{ month: new Date().toISOString().slice(0, 10), link2feedHouseholds: 3, link2feedIndividuals: 4, simcHouseholds: null, simcIndividuals: null, serviceLogHouseholds: null }],
    };
    expect(SERVICE_OVER_TIME.data(daily).categories).toHaveLength(1);
  });

  it('says where the households figure came from and what it leaves out', () => {
    const note = SERVICE_SUMMARY.data(SERVICE_ANALYTICS).note!;
    expect(note).toContain('2023-10-17'.slice(0, 4)); // the Service Log's own start
    // Anonymous visits are households that cannot be deduplicated, not
    // non-households — the earlier wording said the opposite.
    expect(note).toContain('7 visits were recorded anonymously');
    expect(note).toContain('cannot be deduplicated');
    expect(note).toContain('30 people from bulk entries');
  });

  it('gives an ancillary metric its own unit rather than the households axis', () => {
    const data = SERVICE_SUMMARY.data(SERVICE_ANALYTICS);

    // 21 requests is not a smaller quantity than 60 households; drawn on one
    // scale it becomes an invisible sliver of an axis it does not share.
    expect(data.tiles!.map(t => t.label)).toContain('Camping Gear Requests');
    expect(data.tiles!.find(t => t.label === 'Camping Gear Requests')!.value).toBe('21 requests');
    expect(data.tiles!.map(t => t.label)).not.toContain('Pantry Shopping Visits');

    // …and it stays in the rows, so the CSV still carries every figure.
    const csv = cardCsv(data);
    expect(csv).toContain('Camping Gear Requests,21 requests');
    expect(csv).toContain('Pantry Shopping Visits,60');
    expect(csv).toContain('Households Served,80');
  });

  it('renders every card on an empty range without throwing', () => {
    for (const card of [
      SERVICE_SUMMARY,
      SERVICE_QUEUE_TIMING,
      SERVICE_QUEUE_VOLUME,
      SERVICE_QUEUE_CALL_MILESTONES,
      SERVICE_OVER_TIME,
      SERVICE_SEASONAL_HOUSEHOLDS,
      SERVICE_METHOD_MIX,
      SERVICE_HOUSEHOLD_SIZE,
      SERVICE_UNMET_DEMAND,
      SERVICE_LANGUAGES,
      SERVICE_RESPONSE_COVERAGE,
    ]) {
      const data = card.data({});
      const svg = card.print(data);
      expect(svg).not.toMatch(/NaN|undefined/);
      expect(cardCsv(data)).not.toMatch(/NaN|undefined/);
    }
  });

  it('counts visits by household size without renaming them families', () => {
    const data = SERVICE_HOUSEHOLD_SIZE.data(SERVICE_ANALYTICS);
    expect(data.categories).toEqual(['1 person', '2 people']);
    expect(data.note).toContain('bulk entries and special events');
  });
});

describe('Turned Away', () => {
  it('drops buckets the Service Log does not cover, and keeps the zeros inside it', () => {
    const data = SERVICE_UNMET_DEMAND.data(SERVICE_ANALYTICS);

    // A bar chart cannot draw "no record" — a zero-height bar reads as a
    // confirmed zero, which is the opposite of what a null means here.
    expect(data.categories).toEqual(['2023-10', '2023-11']);
    expect(data.series[0].values).toEqual([0, 4]);
    expect(data.note).toContain('Blank entries are treated as a zero count');
  });

  it('reports the days it happened against the days the Log was kept', () => {
    const tiles = SERVICE_UNMET_DEMAND.data(SERVICE_ANALYTICS).tiles!;
    // Not "1 day" alone: without its denominator the figure means nothing.
    expect(tiles.find(t => t.label === 'Days it happened')!.value).toBe('1 of 20');
    expect(tiles.find(t => t.label === 'Times capacity was reached')!.value).toBe('2');
  });
});

describe('Languages Spoken at Home', () => {
  it('plots the merged labels and exports every answer as recorded', () => {
    const data = SERVICE_LANGUAGES.data(SERVICE_ANALYTICS);

    // The chart collapses a redundant qualifier; the CSV does not, so nothing
    // a household actually said is only available as someone else's summary.
    expect(data.categories).toEqual(['English', 'Mandarin', 'Chinese']);
    expect(data.series[0].values).toEqual([40, 9, 1]);
    expect(cardCsv(data, 'raw')).toContain('Mandarin Chinese,6');
    expect(cardCsv(data, 'raw')).toContain('Mandarin,3');
    expect(data.note).toContain('the CSV keeps every answer as recorded');
  });

  it('says the merge happened rather than leaving it to be discovered', () => {
    expect(SERVICE_LANGUAGES.data(SERVICE_ANALYTICS).note)
      .toContain('“Mandarin Chinese” counts as “Mandarin”');
  });

  it('states the share as a percentage of those asked', () => {
    // 50 of 80. The card leads with the rate because the raw pair invited the
    // reader to do the division themselves.
    expect(SERVICE_LANGUAGES.data(SERVICE_ANALYTICS).note)
      .toContain('About 63% of households answered this question');
  });

  it('limits what it plots without dropping anything from the export', () => {
    const answers = Array.from({ length: 22 }, (_, i) => ({
      language: `Language ${i}`, households: 22 - i,
    }));
    const many = {
      ...SERVICE_ANALYTICS,
      languages: { ...SERVICE_ANALYTICS.languages, values: answers, rawValues: answers },
    };
    const data = SERVICE_LANGUAGES.data(many);

    expect(data.categories).toHaveLength(15);
    expect(data.note).toContain('the 7 rarest are in the CSV');
    // A display limit is not a merge: every answer survives in the raw grain.
    expect(cardCsv(data, 'raw').trimEnd().split('\r\n')).toHaveLength(23);
  });
});

describe('Demographics Questions Response Rate', () => {
  it('names each question as it was asked, not as it is stored', () => {
    const data = SERVICE_RESPONSE_COVERAGE.data(SERVICE_ANALYTICS);
    expect(data.categories).toEqual(['Postal code', 'Employment']);
    expect(cardCsv(data)).not.toContain('postal_code');
  });

  it('says a decline is not an answer', () => {
    // "Prefer not to answer" and its variants are stripped at import
    // (NON_ANSWER_LABELS in profiles.ts), so a `provided` status means the
    // household said something substantive. The card states that rather than
    // leaving a reader to assume a decline inflated the rate.
    expect(SERVICE_RESPONSE_COVERAGE.data(SERVICE_ANALYTICS).note)
      .toContain('Declining to answer counts as not answered');
  });

  it('counts households, and says so in the units it prints', () => {
    const data = SERVICE_RESPONSE_COVERAGE.data(SERVICE_ANALYTICS);
    expect(data.series.map(s => s.name)).toEqual(['Answered', 'Not answered']);
    // The stacked helper defaults to pounds; a household count printed as
    // "80 lb" is the bug this card would otherwise have shipped with.
    expect(SERVICE_RESPONSE_COVERAGE.print(data)).not.toContain(' lb');
  });
});

describe('a report drawn from Service alone', () => {
  const request = {
    cardIds: ['service-summary', 'service-over-time'],
    title: 'Service Report',
    includePdf: false,
    includeCsv: true,
    csvGrain: 'condensed' as const,
  };

  it('renders its cards instead of skipping them as stale ids', async () => {
    const result = await buildAnalyticsReport({ service: SERVICE_ANALYTICS }, request);
    expect(result.unknownCardIds).toEqual([]);
  });

  it('reports provenance from coverage, which is the only range it has', async () => {
    const result = await buildAnalyticsReport({ service: SERVICE_ANALYTICS }, request);
    const manifest = JSON.parse(
      await (await JSZip.loadAsync(result.zip)).file('manifest.json')!.async('string')
    );

    expect(manifest.range).toEqual({ startDate: '2023-01-01', endDate: '2024-03-31' });
    // The last date a record actually reaches, not the end of the range asked
    // for — a report run today must not claim data through today.
    expect(manifest.dataAsOf).toBe('2024-03-27');
    expect(manifest.unknownCardIds).toEqual([]);
  });

  it('still prefers the other lenses’ own provenance when they are present', async () => {
    const result = await buildAnalyticsReport(
      {
        service: SERVICE_ANALYTICS,
        procurement: {
          range: { startDate: '2024-01-01', endDate: '2024-01-31', timeZone: 'America/Los_Angeles' },
          dataAsOf: '2024-01-31',
        },
      },
      { ...request, cardIds: ['service-summary'] }
    );
    const manifest = JSON.parse(
      await (await JSZip.loadAsync(result.zip)).file('manifest.json')!.async('string')
    );
    expect(manifest.range.timeZone).toBe('America/Los_Angeles');
  });
});
