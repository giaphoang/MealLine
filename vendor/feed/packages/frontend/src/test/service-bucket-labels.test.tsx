// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ServiceAnalyticsWorkspace } from '@/components/analytics/service-analytics';
import type { ServiceAnalytics } from '@/services/service';

/**
 * Bucket grain is a card's own decision, not the page's.
 *
 * How Service Was Delivered plots every recorded service day at every range,
 * while the page-wide grain is monthly on the YTD and All presets. Labelling
 * that card with the page grain fed a day key ("2026-06-02") to a month
 * formatter, which built "2026-06-02-01", threw `RangeError: Invalid time
 * value` inside Recharts' render, and unmounted the entire Service tab — a
 * blank page, not a wrong label. Both presets that produce a monthly page
 * grain were affected; the daily presets were fine, which is what made it look
 * intermittent.
 */

/**
 * Recharts skips rendering entirely at zero size, and jsdom gives every
 * element zero size — so a chart test that does not force dimensions asserts
 * against an empty container and passes no matter what the formatters do.
 * (Verified: the first version of this file passed with the bug reintroduced.)
 * The observer reports a real box and the layout properties agree with it.
 */
const WIDTH = 800;
const HEIGHT = 400;

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: WIDTH, height: HEIGHT } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.scrollIntoView = vi.fn();

for (const [property, value] of [['offsetWidth', WIDTH], ['offsetHeight', HEIGHT],
  ['clientWidth', WIDTH], ['clientHeight', HEIGHT]] as const) {
  Object.defineProperty(HTMLElement.prototype, property, {
    configurable: true, value,
  });
}
Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { width: WIDTH, height: HEIGHT, top: 0, left: 0, bottom: HEIGHT, right: WIDTH,
    x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
};

/** The shape that used to crash: monthly page, daily method series. */
const analytics = {
  coverage: {
    startDate: '2023-01-01',
    endDate: '2026-08-13',
    granularity: 'month',
    sources: [
      { source: 'link2feed', firstDate: '2023-01-04', lastDate: '2026-06-01', encounters: 100 },
    ],
    hasIntake: true,
    hasServiceLog: true,
    serviceLogFirstDate: '2023-10-05',
    serviceLogLastDate: '2026-08-13',
  },
  summary: {
    visits: 100, peopleServed: 250, identityUnavailableVisits: 7,
    bulkEntryVisits: 0, bulkEntryPeople: 0,
    households: 80, householdsSource: 'service_log',
    methods: [], otherServices: [],
  },
  overTime: [
    { month: '2026-06', link2feedHouseholds: 12, link2feedIndividuals: 30,
      simcHouseholds: null, simcIndividuals: null, serviceLogHouseholds: 14 },
    { month: '2026-07', link2feedHouseholds: 11, link2feedIndividuals: 28,
      simcHouseholds: null, simcIndividuals: null, serviceLogHouseholds: 13 },
  ],
  seasonal: { years: [], households: [], visits: [] },
  methodSeries: {
    granularity: 'day',
    methods: [
      { metricKey: 'grocery', displayName: 'Grocery', unit: 'households', iconName: 'box',
        firstRecordedDate: '2026-06-02' },
    ],
    buckets: [
      { bucket: '2026-06-02', grocery: 41 },
      { bucket: '2026-06-04', grocery: 38 },
      { bucket: '2026-08-13', grocery: 44 },
    ],
  },
  recordAgreement: {
    sharedDays: 0, intakeTotal: 0, serviceLogTotal: 0,
    meanAbsoluteDailyDifference: 0, agreementPercent: 0,
  },
  unmetDemand: {
    granularity: 'month', buckets: [], householdsTurnedAway: 0,
    daysWithTurnAway: 0, daysRecorded: 0, capacityReachedDays: 0, firstRecordedDate: null,
  },
  languages: { values: [], rawValues: [], mergedLabels: 0, householdsAsked: 0, householdsAnswered: 0 },
  responseCoverage: [],
  householdSize: [],
  reachAndFrequency: [],
} as unknown as ServiceAnalytics;

/** Tick text inside one named card, with Recharts' tspan splits collapsed. */
const cardTicks = (title: string) => {
  const card = screen.getByText(title).closest('[data-slot="card"]')
    ?? screen.getByText(title).closest('div');
  return [...(card?.querySelectorAll('.recharts-cartesian-axis-tick-value') ?? [])]
    .map((tick) => (tick.textContent ?? '').replace(/\s+/g, ''));
};

const methodAxisTicks = () => cardTicks('How Service Was Delivered');

describe('Service queue timing compatibility', () => {
  test('keeps the Service lens usable when a pre-v1.6 response omits queue timing', () => {
    render(<ServiceAnalyticsWorkspace analytics={analytics} />);

    expect(screen.getByText('Service Summary')).toBeInTheDocument();
    expect(screen.queryByText('Queue Timing')).not.toBeInTheDocument();
  });
});

describe('Service bucket labels', () => {
  test('renders with a daily method series under a monthly page grain', () => {
    // The regression was total: nothing rendered at all. Asserting on any
    // card proves the tab survived the mismatch.
    render(<ServiceAnalyticsWorkspace analytics={analytics} />);

    expect(screen.getByText('Service Summary')).toBeInTheDocument();
    expect(screen.getByText('How Service Was Delivered')).toBeInTheDocument();

    // Not merely "did not crash": the axis has to carry day labels, because
    // the series is daily. Recharts splits a tick across tspans, so the text
    // arrives without its spaces and a plain getByText never matches.
    expect(methodAxisTicks()).toContain('Aug13,2026');

    // And the page-wide monthly charts must still label by month — the fix is
    // per-card labelling, not a blanket switch to days.
    expect(cardTicks('Service Over Time')).toContain('Jul2026');
  });

  test('survives a bucket key no formatter can parse', () => {
    // Defence in depth for the class of bug rather than the one instance: a
    // tick formatter throwing takes the tab with it, so an unparseable key has
    // to degrade to itself. Whatever a future payload change hands the axis,
    // the page must still render.
    const malformed = {
      ...analytics,
      methodSeries: {
        ...(analytics as unknown as { methodSeries: Record<string, unknown> }).methodSeries,
        buckets: [{ bucket: 'not-a-date', grocery: 41 }, { bucket: '2026-13-99', grocery: 12 }],
      },
    } as unknown as ServiceAnalytics;

    render(<ServiceAnalyticsWorkspace analytics={malformed} />);

    expect(screen.getByText('How Service Was Delivered')).toBeInTheDocument();
  });
});
