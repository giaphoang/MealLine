// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';

import { AnalyticsWorkspace } from '@/components/analytics';
import { CHART_LEGEND_LAYOUT_CLASS } from '@/components/ui/chart';
import type { OperationalAnalyticsResult } from '@/types/operational-reports';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const result: OperationalAnalyticsResult = {
  dataAsOf: '2026-07-11T12:00:00.000Z',
  range: {
    startDate: '2026-04-12',
    endDate: '2026-07-11',
    timeZone: 'America/Los_Angeles',
  },
  calculationVersion: 'operational-analytics-v7-category-pressure',
  correctionWindowMinutes: 5,
  serviceSchedule: {
    queryTimeZone: 'America/Los_Angeles',
    appliedRevisions: [{
      revisionId: 1,
      effectiveDate: '1970-01-01',
      timezone: 'America/Los_Angeles',
      recordedAt: '2026-07-01T12:00:00.000Z',
    }],
  },
  summary: {
    trackedItems: 40,
    availableNow: 32,
    unavailableNow: 8,
    limitedSupplyNow: 5,
    clearanceNow: 2,
    itemRationedNow: 12,
    categoryRationedNow: 3,
    repeatUnavailableItems: 3,
    recurringUnavailableEntries: 8,
    recurringRestorations: 6,
    recurringOngoingEpisodes: 1,
    recurringMedianRestorationHours: 24,
    unavailableEpisodes: 14,
    medianRestorationHours: 30,
    averageAvailableAssortment: 31.5,
    latestAvailableAssortment: 32,
  },
  timeline: [],
  assortmentCategorySeries: [],
  rationedLimitSeries: [
    { key: '1|household', limit: 1, limitType: 'household' },
    { key: '2|household', limit: 2, limitType: 'household' },
    { key: '3|household', limit: 3, limitType: 'household' },
  ],
  recurringAvailability: [],
  recurringAvailabilityCategories: [],
  categoryPressure: [],
  episodes: [],
  limitChanges: [],
};

vi.mock('@/services/operational-reports', () => ({
  operationalReportsService: {
    query: vi.fn(() => Promise.resolve(result)),
    downloadCardCsv: vi.fn(),
    downloadRawCsv: vi.fn(),
  },
}));

describe('Operational Analytics phone-width layout contract', () => {
  test('tests the mounted workspace and keeps chart legends wrap-capable', async () => {
    const { container } = render(
      <MemoryRouter>
        <AnalyticsWorkspace />
      </MemoryRouter>
    );

    expect(await screen.findByText('Availability Summary')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '90d' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('button', { name: 'Custom range' })).toHaveClass('w-full');
    expect(screen.getByRole('combobox', { name: 'Assortment Category' })).toHaveClass('w-full');
    // The rejected pattern, asserted absent rather than deleted from the test.
    // Per-card "Export CSV" and this page-level "Export Raw History" cluttered
    // the surface and obscured how to produce a report; the chosen flow is one
    // "Generate Report" action into a selection mode and a single modal.
    expect(screen.queryByRole('button', { name: 'Export Raw History' })).toBeNull();
    expect(screen.queryAllByRole('button', { name: 'Export CSV' })).toHaveLength(0);
    expect(screen.getAllByRole('tablist')).toHaveLength(2);

    const wrapper = container.firstElementChild as HTMLElement;
    const tabsContents = container.querySelector('[data-slot="tabs-contents"]') as HTMLElement;
    expect(wrapper).toHaveClass('min-w-0', 'w-full');
    expect(tabsContents).toHaveStyle({ overflow: 'visible' });
    expect(CHART_LEGEND_LAYOUT_CLASS).toContain('flex-wrap');
    expect(CHART_LEGEND_LAYOUT_CLASS).toContain('min-w-0');
  });
});
