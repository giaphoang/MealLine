// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ServiceAnalyticsWorkspace } from '@/components/analytics/service-analytics';
import type { ServiceAnalytics } from '@/services/service';

/**
 * Households by Season measures the same rows two ways.
 *
 * Households counts a household once a month however often it came; visits
 * counts every encounter. Nothing in the numbers says which question was
 * asked — 900 is 900 — so the card has to say it, and the two must not be
 * silently interchangeable.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.scrollIntoView = vi.fn();

const analytics = {
  coverage: {
    startDate: '2023-01-01',
    endDate: '2025-12-31',
    granularity: 'month',
    sources: [{ source: 'link2feed', firstDate: '2023-01-04', lastDate: '2025-12-20', encounters: 100 }],
    hasIntake: true,
    hasServiceLog: false,
    serviceLogFirstDate: null,
    serviceLogLastDate: null,
  },
  summary: {
    visits: 100, peopleServed: 250, identityUnavailableVisits: 7,
    bulkEntryVisits: 0, bulkEntryPeople: 0,
    households: 80, householdsSource: 'intake',
    methods: [], otherServices: [],
  },
  overTime: [],
  seasonal: {
    years: ['2023', '2024'],
    households: [
      { month: 'Jan', '2023': 5, '2024': 9 },
      { month: 'Feb', '2023': 6, '2024': 7 },
    ],
    visits: [
      { month: 'Jan', '2023': 41, '2024': 52 },
      { month: 'Feb', '2023': 43, '2024': 55 },
    ],
  },
  methodSeries: { granularity: 'month', methods: [], buckets: [] },
  recordAgreement: {
    sharedDays: 0, intakeTotal: 0, serviceLogTotal: 0,
    meanAbsoluteDailyDifference: 0, agreementPercent: 0,
  },
  unmetDemand: {
    granularity: 'month', buckets: [], householdsTurnedAway: 0,
    daysWithTurnAway: 0, daysRecorded: 0, capacityReachedDays: 0, firstRecordedDate: null,
  },
  languages: { values: [], householdsAsked: 0, householdsAnswered: 0 },
  responseCoverage: [],
  householdSize: [],
  reachAndFrequency: [],
} as unknown as ServiceAnalytics;

/**
 * Scoped to the measure tablist, because the page has several — the lens
 * switcher and the date presets are tablists too, and an unscoped query for a
 * tab named "Visits" would be answered by whichever rendered first.
 */
const measureTab = (name: 'Households' | 'Visits') =>
  within(screen.getByRole('tablist', { name: 'Measure' })).getByRole('tab', { name });

/**
 * Radix Tabs activate on pointer-down, not click, so `fireEvent.click` leaves
 * the tab unchanged and the assertions fail against the unswitched card. Same
 * approach the report-run test uses on the date presets.
 */
const choose = (name: 'Households' | 'Visits') => fireEvent.mouseDown(measureTab(name));

describe('Households by Season measure toggle', () => {
  test('starts on households and says what that counts', () => {
    render(<ServiceAnalyticsWorkspace analytics={analytics} />);

    expect(screen.getByText('Households by Season')).toBeInTheDocument();
    expect(measureTab('Households')).toHaveAttribute('aria-selected', 'true');
    expect(measureTab('Visits')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText(/repeat visits are counted once/)).toBeInTheDocument();
    expect(screen.getByText(/Anonymous visits are counted but not deduplicated/))
      .toBeInTheDocument();
  });

  test('switching to visits renames the card and changes what the footnote claims', () => {
    render(<ServiceAnalyticsWorkspace analytics={analytics} />);

    choose('Visits');

    expect(screen.getByText('Visits by Season')).toBeInTheDocument();
    expect(measureTab('Visits')).toHaveAttribute('aria-selected', 'true');

    // The claim has to flip with the data. Leaving "only counted once" under a
    // visits chart would be the card lying about its own numbers.
    expect(screen.getByText(/counted each time/)).toBeInTheDocument();
    expect(screen.queryByText(/counted once/)).not.toBeInTheDocument();
  });

  test('uses the project\u2019s animated tab control, not a bespoke one', () => {
    render(<ServiceAnalyticsWorkspace analytics={analytics} />);

    // Same primitive as the Date Range switcher: a labelled tablist of two
    // tabs. A hand-rolled button group would satisfy the behaviour tests above
    // while looking and moving unlike every other switcher in the app.
    const tablist = screen.getByRole('tablist', { name: 'Measure' });
    expect(within(tablist).getAllByRole('tab')).toHaveLength(2);
  });
});
