// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  OperationalAnalyticsWorkspace,
  assortmentCategoryChartKey,
  buildAssortmentChart,
  buildPressureChart,
  limitSeriesLabel,
} from '@/components/operational-reports';
import type { OperationalAnalyticsResult } from '@/types/operational-reports';

// Charts and tables measure themselves with ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const result: OperationalAnalyticsResult = {
  dataAsOf: '2026-07-11T12:00:00.000Z',
  range: { startDate: '2026-04-12', endDate: '2026-07-11', timeZone: 'America/Los_Angeles' },
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
  rationedLimitSeries: [],
  recurringAvailability: [
    {
      itemId: 1,
      itemName: 'Tuna',
      categoryId: 2,
      categoryName: 'Canned Goods',
      unavailableEntries: 3,
      restorations: 2,
      ongoingEpisodes: 1,
      deletedEpisodes: 0,
      medianRestorationHours: 24,
      latestUnavailableAt: '2026-07-10T10:00:00.000Z',
    },
  ],
  recurringAvailabilityCategories: [{
    categoryId: 2,
    categoryName: 'Canned Goods',
    recurringItems: 1,
    unavailableEntries: 3,
    restorations: 2,
    ongoingEpisodes: 1,
    deletedEpisodes: 0,
    medianRestorationHours: 24,
  }],
  categoryPressure: [{
    categoryId: 2,
    categoryName: 'Canned Goods',
    observedServiceMinutes: 360,
    limitedSupplyServicePercent: 25,
    clearanceServicePercent: 10,
    itemRationedServicePercent: 50,
    categoryRationedServicePercent: 20,
    recurringItems: 1,
    recurringUnavailableEntries: 3,
  }],
  episodes: [
    {
      itemId: 1,
      itemName: 'Tuna',
      categoryId: 2,
      categoryName: 'Canned Goods',
      startedAt: '2026-07-01T10:00:00.000Z',
      endedAt: '2026-07-03T10:00:00.000Z',
      durationHours: 48,
      resolution: 'restored',
      entryKind: 'availability_transition',
    },
    {
      itemId: 2,
      itemName: 'Rice',
      categoryId: 3,
      categoryName: 'Grains',
      startedAt: '2026-07-10T10:00:00.000Z',
      endedAt: null,
      durationHours: 3,
      resolution: 'open_at_range_end',
      entryKind: 'availability_transition',
    },
  ],
  limitChanges: [],
};

vi.mock('@/services/operational-reports', () => ({
  operationalReportsService: {
    query: vi.fn(() => Promise.resolve(result)),
    downloadCardCsv: vi.fn(),
    downloadRawCsv: vi.fn(),
  },
}));

describe('OperationalAnalyticsWorkspace tooltips and layout', () => {
  test('KPI labels expose plain-language explanations on focus/hover', async () => {
    render(<OperationalAnalyticsWorkspace />);

    const label = await screen.findByText('Repeat Unavailability');
    fireEvent.focus(label);

    const tooltips = await screen.findAllByText(
      /moved from Available to Unavailable at least twice/
    );
    expect(tooltips.length).toBeGreaterThan(0);
  });

  test('the canonical availability summary includes every exported headline state', async () => {
    render(<OperationalAnalyticsWorkspace />);

    expect(await screen.findByText('Availability Summary')).toBeTruthy();
    expect(screen.getAllByText('Available Now').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unavailable Now').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Limited Supply').length).toBeGreaterThan(0);
    expect(screen.queryByText('Clearance')).toBeNull();
    expect(screen.queryByText('Inventory Distribution')).toBeNull();
  });

  test('the correction-sampling description explains the five-minute window', async () => {
    render(<OperationalAnalyticsWorkspace />);

    const trigger = await screen.findByText(
      /Five-minute correction sampling; raw events remain exportable/
    );
    fireEvent.focus(trigger);

    const tooltips = await screen.findAllByText(
      /reports count only the final result/
    );
    expect(tooltips.length).toBeGreaterThan(0);
  });

  test('every summary KPI has help copy', async () => {
    render(<OperationalAnalyticsWorkspace />);

    for (const label of [
      'Repeat Unavailability',
      'Item Limits',
      'Category Limits',
      'Median Restoration',
    ]) {
      const elements = await screen.findAllByText(label);
      // A KPI without help renders a plain label; help-enabled labels are
      // tooltip triggers with the cursor-help affordance.
      expect(elements.some((element) => element.className.includes('cursor-help'))).toBe(true);
    }
  });

  test('episode table headers sort like the management tables', async () => {
    const { container } = render(<OperationalAnalyticsWorkspace />);

    const durationHeader = await screen.findByRole('button', { name: 'Duration' });

    const rowNames = () =>
      [...container.querySelectorAll('tbody tr')]
        .map((row) => row.textContent ?? '')
        .filter((text) => /Tuna|Rice/.test(text))
        .map((text) => (text.includes('Tuna') ? 'Tuna' : 'Rice'));

    fireEvent.click(durationHeader); // ascending
    expect(rowNames()).toEqual(['Rice', 'Tuna']);

    fireEvent.click(durationHeader); // descending
    expect(rowNames()).toEqual(['Tuna', 'Rice']);
  });

  test('the pressure chart grows one labeled series per limit configuration', () => {
    const chart = buildPressureChart({
      ...result,
      rationedLimitSeries: [
        { key: '1|household', limit: 1, limitType: 'household' },
        { key: '2|person', limit: 2, limitType: 'person' },
      ],
      timeline: [
        {
          date: '2026-07-10',
          trackedItems: 3,
          serviceMinutes: 180,
          trackedItemMinutes: 540,
          availableItemMinutes: 360,
          available: 2,
          unavailable: 1,
          limitedSupply: 1,
          clearance: 0,
          itemRationed: 2,
          categoryRationed: 1,
          rationedByLimit: { '1|household': 1, '2|person': 1 },
        },
      ],
    });

    expect(chart.config['limit_1_household']?.label).toBe('1 Per Household');
    expect(chart.config['limit_2_person']?.label).toBe('2 Per Person');
    // Base series stay alongside the adaptive ones.
    expect(chart.config['limitedSupply']?.label).toBe('Limited Supply');
    expect(chart.config['categoryRationed']?.label).toBe('Categories with Limits');

    const point = chart.data[0] as Record<string, unknown>;
    expect(point['limit_1_household']).toBe(1);
    expect(point['limit_2_person']).toBe(1);
  });

  test('every pressure line gets a distinct Carbon color in both schemes', () => {
    // Eight series exhausts the seven unreserved primary families and begins
    // the secondary-grade pool. Orange, purple, and teal remain reserved.
    const chart = buildPressureChart({
      ...result,
      rationedLimitSeries: Array.from({ length: 8 }, (_, i) => ({
        key: `${i + 1}|household`,
        limit: i + 1,
        limitType: 'household',
      })),
      timeline: [],
    });

    for (const scheme of ['light', 'dark'] as const) {
      const colors = Object.values(chart.config).map(
        (entry) => (entry as { theme: Record<string, string> }).theme[scheme]
      );
      // 3 base lines + 8 series, no color reused.
      expect(colors).toHaveLength(11);
      expect(new Set(colors).size).toBe(11);
    }
  });

  test('limit series labels read as rationing policy', () => {
    expect(limitSeriesLabel({ key: '1|household', limit: 1, limitType: 'household' })).toBe('1 Per Household');
    expect(limitSeriesLabel({ key: '3|person', limit: 3, limitType: 'person' })).toBe('3 Per Person');
  });

  test('page wrapper matches the established section layout (w-full pt-6)', async () => {
    const { container } = render(<OperationalAnalyticsWorkspace />);
    await screen.findByText('Repeat Unavailability');

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('pt-6');
    expect(wrapper.className).toContain('w-full');
  });

  test('presents assortment and recurrence as separate lenses', async () => {
    render(<OperationalAnalyticsWorkspace />);

    expect(await screen.findByText('Available Assortment Over Time')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Assortment Category' })).toBeTruthy();
    expect(screen.getByText('Recurring Availability')).toBeTruthy();
    expect(screen.getByText('Items Cycling Most Often')).toBeTruthy();
    expect(screen.getByText('Category Pressure')).toBeTruthy();
    expect(screen.getByText('Recorded Service Pressure')).toBeTruthy();
    expect(screen.getByText('Recurring Unavailability')).toBeTruthy();
    expect(screen.getByText('Repeat Episodes')).toBeTruthy();
    expect(screen.getByText('Currently Unavailable')).toBeTruthy();
    expect(screen.queryByText('Availability Over Time')).toBeNull();
    expect(screen.queryByText('Tracked Availability')).toBeNull();
  });

  test('builds one canonical combined series plus a trend for every Category', () => {
    const categoryResult: OperationalAnalyticsResult = {
      ...result,
      timeline: [{
        date: '2026-07-10',
        serviceMinutes: 180,
        trackedItemMinutes: 540,
        availableItemMinutes: 450,
        availableCategoryItemMinutes: { '2': 270, '3': 180 },
        trackedItems: 3,
        available: 2.5,
        availableByCategory: { '2': 1.5, '3': 1 },
        unavailable: 0.5,
        limitedSupply: 0,
        clearance: 0,
        itemRationed: 0,
        categoryRationed: 0,
        rationedByLimit: {},
      }],
      assortmentCategorySeries: [
        { categoryId: 2, categoryName: 'Canned Goods', averageAvailable: 1.5 },
        { categoryId: 3, categoryName: 'Produce', averageAvailable: 1 },
      ],
    };

    const chart = buildAssortmentChart(categoryResult);
    expect(chart.config[assortmentCategoryChartKey(2)].label).toBe('Canned Goods');
    expect(chart.config[assortmentCategoryChartKey(3)].label).toBe('Produce');
    expect(chart.data[0]).toMatchObject({
      available: 2.5,
      [assortmentCategoryChartKey(2)]: 1.5,
      [assortmentCategoryChartKey(3)]: 1,
    });

    const isolated = buildAssortmentChart(categoryResult, 3);
    expect(isolated.series.map((series) => series.categoryId)).toEqual([3]);
    expect(isolated.config.available).toBeUndefined();
    expect(isolated.config[assortmentCategoryChartKey(3)].label).toBe('Produce');
    expect(isolated.data[0]).not.toHaveProperty(assortmentCategoryChartKey(2));
    expect(isolated.data[0]).toMatchObject({
      [assortmentCategoryChartKey(3)]: 1,
    });
  });
});
