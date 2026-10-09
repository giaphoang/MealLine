// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ServiceLogWorkspace } from '@/components/service-log';
import {
  ServiceDateNavigator,
} from '@/components/service-log/service-date-navigator';
import {
  adjacentOperatingDate,
  dateInTimezone,
} from '@/components/service-log/service-date';
import { ServiceMetricsSettings } from '@/components/service-metrics';
import { MetricDialog } from '@/components/service-metrics/metric-dialog';
import { formatOrdinalPosition } from '@/components/service-metrics/position';
import { DEFAULT_OPERATING_HOURS, DEFAULT_OPERATING_HOURS_SETTINGS } from '@/types/settings';

const serviceMocks = vi.hoisted(() => ({
  getDay: vi.fn(),
  saveDay: vi.fn(),
  listMetrics: vi.fn(),
  createMetric: vi.fn(),
  updateMetric: vi.fn(),
  seedWthDefaults: vi.fn(),
}));
const getOperatingHours = vi.hoisted(() => vi.fn());

vi.mock('@/services/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/service')>()),
  serviceApi: serviceMocks,
}));
vi.mock('@/services/settings', () => ({
  settingsService: { getOperatingHours },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    isAdministrator: true,
  }),
}));

const showSuccess = vi.fn();
vi.mock('@/hooks/message/useMessage', () => ({
  useMessage: () => ({ showSuccess }),
}));

vi.mock('@/services/error/ErrorHandlerService', () => ({
  ErrorHandlerService: { handleError: vi.fn() },
}));

const serviceDay = {
  serviceDate: '2026-08-10',
  pantryStatus: 'open' as const,
  entryState: 'draft' as const,
  dayRevision: 0,
  metrics: [
    {
      id: 1,
      metricKey: 'shopping_visits',
      definitionRevisionId: 2,
      definitionRevision: 2,
      displayName: 'Pantry Shopping Visits',
      description: 'Households shopping in the pantry.',
      iconName: 'shopping-basket',
      valueType: 'count' as const,
      unit: 'households' as const,
      semanticRole: 'served_household_method' as const,
      contributesToOperationalTotal: true,
      capacityTarget: 75,
      displayOrder: 10,
      observation: null,
    },
    {
      id: 2,
      metricKey: 'capacity_reached_time',
      definitionRevisionId: 3,
      definitionRevision: 1,
      displayName: 'Time Capacity Was Reached',
      description: null,
      iconName: 'circle-parking',
      valueType: 'time_of_day' as const,
      unit: 'marker' as const,
      semanticRole: 'capacity_marker' as const,
      contributesToOperationalTotal: false,
      capacityTarget: null,
      displayOrder: 20,
      observation: null,
    },
  ],
  operationalTotal: {
    value: null,
    recordedMetricCount: 0,
    expectedMetricCount: 1,
    complete: false,
  },
  capacityPlan: {
    planKey: 'wth_standard_pantry',
    revision: 1,
    displayName: 'WTH standard pantry capacity',
    description: null,
    timezone: 'America/Los_Angeles',
    targets: [
      { id: 1, targetKey: 'formal_households', displayName: 'Overall households', unit: 'households', targetValue: 145, metricId: null, displayOrder: 10 },
      { id: 2, targetKey: 'shopping_visits', displayName: 'Shopping visits', unit: 'households', targetValue: 75, metricId: 1, displayOrder: 20 },
    ],
  },
};

const longListsMetric = {
  ...serviceDay.metrics[0],
  id: 3,
  metricKey: 'long_lists',
  displayName: 'Long Lists',
  description: 'Households served through long shopping lists.',
  displayOrder: 20,
};

const serviceDayBeforeMetricRefresh = {
  ...serviceDay,
  metrics: [serviceDay.metrics[0], longListsMetric, serviceDay.metrics[1]],
};

const serviceDayAfterMetricRefresh = {
  ...serviceDay,
  metrics: [longListsMetric, serviceDay.metrics[0], serviceDay.metrics[1]],
};

const configuredMetric = {
  id: 1,
  metricKey: 'shopping_visits',
  createdAt: '2026-08-01T00:00:00.000Z',
  revisionCount: 2,
  hasObservations: true,
  displayPosition: 1,
  currentRevision: {
    id: 2,
    metricId: 1,
    revision: 2,
    displayName: 'Pantry Shopping Visits',
    description: 'Households shopping in the pantry.',
    iconName: 'shopping-basket',
    valueType: 'count' as const,
    unit: 'households' as const,
    semanticRole: 'served_household_method' as const,
    contributesToOperationalTotal: true,
    capacityTarget: 75,
    effectiveStartDate: '2025-11-01',
    effectiveEndDate: null,
    displayOrder: 10,
    isActive: true,
    createdBy: null,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
};

describe('native Service workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getDay.mockResolvedValue(serviceDay);
    serviceMocks.saveDay.mockResolvedValue(serviceDay);
    serviceMocks.listMetrics.mockResolvedValue([]);
    serviceMocks.seedWthDefaults.mockResolvedValue({
      metricsCreated: 7,
      metricsSkipped: 0,
      capacityPlanCreated: true,
    });
    getOperatingHours.mockResolvedValue(DEFAULT_OPERATING_HOURS_SETTINGS);
  });

  // The date-range control was removed: Service Log records one day at a time,
  // and the range only ever changed state nothing read. A control that appears
  // to filter but does not is worse than no control.
  test('defaults the entry date to Today and offers no date-range filter', async () => {
    render(<MemoryRouter><ServiceLogWorkspace /></MemoryRouter>);

    expect(screen.queryByText('Date Range')).toBeNull();
    expect(screen.queryByRole('tab', { name: '90d' })).toBeNull();
    expect(await screen.findByText(/^Today · /)).toBeInTheDocument();
    expect(serviceMocks.getDay).toHaveBeenCalledWith(
      dateInTimezone(DEFAULT_OPERATING_HOURS_SETTINGS.timezone),
    );
  });

  test('places administrator Service Metrics beneath the daily entry cards', async () => {
    render(<MemoryRouter><ServiceLogWorkspace /></MemoryRouter>);

    const dailyCard = await screen.findByText('Service Provided');
    const metrics = await screen.findByRole('region', { name: 'Service Metrics' });
    expect(
      dailyCard.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  test('renders the configured icon and keeps one- or two-metric sections at half width', async () => {
    serviceMocks.getDay.mockResolvedValue({
      ...serviceDay,
      metrics: [
        ...serviceDay.metrics,
        {
          ...serviceDay.metrics[0],
          id: 3,
          metricKey: 'camping_gear_requests',
          displayName: 'Camping Gear Requests',
          iconName: 'tent-tree',
          semanticRole: 'ancillary_service',
          contributesToOperationalTotal: false,
          capacityTarget: null,
          displayOrder: 30,
        },
      ],
    });
    render(<MemoryRouter><ServiceLogWorkspace /></MemoryRouter>);

    expect(await screen.findByTestId('service-metric-icon-1')).toHaveClass('lucide-shopping-basket');
    expect(screen.getByLabelText('Pantry Shopping Visits').parentElement).toHaveClass('mt-auto', 'pt-4');
    expect(screen.getByText('Special items or irregular service types.')).toBeInTheDocument();
    expect(screen.getByTestId('service-metric-section-service')).not.toHaveClass('lg:col-span-2');
    expect(screen.getByTestId('service-metric-section-capacity')).not.toHaveClass('lg:col-span-2');
    expect(screen.getByTestId('service-metric-section-other')).not.toHaveClass('lg:col-span-2');
  });

  test('expands a section with three metrics and keeps its metric cards two per row', async () => {
    serviceMocks.getDay.mockResolvedValue({
      ...serviceDay,
      metrics: [
        serviceDay.metrics[0],
        longListsMetric,
        {
          ...longListsMetric,
          id: 4,
          metricKey: 'premade_bags',
          displayName: 'Premade Bags',
          iconName: 'paper-bag',
          displayOrder: 30,
        },
        serviceDay.metrics[1],
      ],
    });

    render(<MemoryRouter><ServiceLogWorkspace /></MemoryRouter>);

    const section = await screen.findByTestId('service-metric-section-service');
    expect(section).toHaveClass('lg:col-span-2');
    expect(section.querySelector('.sm\\:grid-cols-2')).toBeInTheDocument();
    expect(section.querySelector('.xl\\:grid-cols-3')).not.toBeInTheDocument();
  });

  test('preserves an explicit zero when staff save the service day', async () => {
    render(<MemoryRouter><ServiceLogWorkspace /></MemoryRouter>);

    const shopping = await screen.findByLabelText('Pantry Shopping Visits');
    fireEvent.change(shopping, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(serviceMocks.saveDay).toHaveBeenCalled());
    expect(serviceMocks.saveDay).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        pantryStatus: 'open',
        entryState: 'finalized',
        observations: expect.arrayContaining([
          expect.objectContaining({ metricId: 1, countValue: 0 }),
          expect.objectContaining({ metricId: 2, timeValue: null }),
        ]),
      }),
    );
  });

  test('loads an imported Tracking value as editable Service Log data', async () => {
    const importedDay = {
      ...serviceDay,
      serviceDate: '2025-03-26',
      entryState: 'finalized' as const,
      metrics: [{
        ...serviceDay.metrics[0],
        observation: { countValue: 75, booleanValue: null, timeValue: null },
      }, serviceDay.metrics[1]],
    };
    serviceMocks.getDay.mockResolvedValue(importedDay);
    serviceMocks.saveDay.mockResolvedValue({
      ...importedDay,
      metrics: [{
        ...importedDay.metrics[0],
        observation: { countValue: 76, booleanValue: null, timeValue: null },
      }, importedDay.metrics[1]],
    });

    render(<MemoryRouter><ServiceLogWorkspace /></MemoryRouter>);

    const shopping = await screen.findByLabelText('Pantry Shopping Visits');
    expect(shopping).toHaveValue(75);
    expect(shopping).toBeEnabled();
    fireEvent.change(shopping, { target: { value: '76' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(serviceMocks.saveDay).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        entryState: 'finalized',
        observations: expect.arrayContaining([
          expect.objectContaining({ metricId: 1, countValue: 76 }),
        ]),
      }),
    ));
  });

  test('uses one Save action without exposing draft workflow state', async () => {
    render(<MemoryRouter><ServiceLogWorkspace /></MemoryRouter>);

    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finalize Day' })).not.toBeInTheDocument();
    expect(screen.queryByText('Draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Finalized')).not.toBeInTheDocument();
  });

  test('offers WTH defaults only as an explicit administrator setup action', async () => {
    render(<MemoryRouter><ServiceMetricsSettings /></MemoryRouter>);
    const button = await screen.findByRole('button', { name: 'Configure WTH Defaults' });
    fireEvent.click(button);
    await waitFor(() => expect(serviceMocks.seedWthDefaults).toHaveBeenCalledTimes(1));
    expect(showSuccess).toHaveBeenCalledWith('Configured 7 WTH Service metrics');
  });

  test('uses three compact steps and the same inline icon grid as Categories', async () => {
    render(<MemoryRouter><ServiceMetricsSettings /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Add Metric' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Display name')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Description')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Search icons')).toBeInTheDocument();
    expect(within(dialog).queryByText('Classification')).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Search icons'), {
      target: { value: 'Paper Bag' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Select Paper Bag icon' }));
    expect(within(dialog).getByText('Paper Bag')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Display name'), {
      target: { value: 'Delivery Requests' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));

    expect(within(dialog).getByText('Classification')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Position')).toHaveTextContent('1st');
    expect(dialog.querySelector('[data-radix-scroll-area-viewport]')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getByLabelText('Include in operational household total')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Available for daily entry')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Metric' }));

    await waitFor(() => expect(serviceMocks.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Delivery Requests', iconName: 'paper-bag' }),
    ));
  });

  test('presents Service metric order as a plain ordinal position', async () => {
    render(<MemoryRouter><ServiceMetricsSettings /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Add Metric' }));

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Delivery Requests' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Position')).toHaveTextContent('1st');
    expect(screen.queryByLabelText('Display order')).not.toBeInTheDocument();
    expect(formatOrdinalPosition(2)).toBe('2nd');
    expect(formatOrdinalPosition(3)).toBe('3rd');
    expect(formatOrdinalPosition(11)).toBe('11th');
    expect(formatOrdinalPosition(22)).toBe('22nd');
  });

  test('applies metric changes immediately without discarding unsaved daily entry', async () => {
    serviceMocks.getDay
      .mockResolvedValueOnce(serviceDayBeforeMetricRefresh)
      .mockResolvedValueOnce(serviceDayAfterMetricRefresh);

    render(<MemoryRouter><ServiceLogWorkspace /></MemoryRouter>);

    const shoppingInput = await screen.findByLabelText('Pantry Shopping Visits');
    fireEvent.change(shoppingInput, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Metric' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add Service Metric' });
    fireEvent.change(within(dialog).getByLabelText('Display name'), {
      target: { value: 'Delivery Requests' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Metric' }));

    await waitFor(() => expect(serviceMocks.getDay).toHaveBeenCalledTimes(2));
    expect(serviceMocks.createMetric).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Pantry Shopping Visits')).toHaveValue(12);

    const longLists = screen.getByText('Long Lists');
    const shoppingVisits = screen.getByText('Pantry Shopping Visits');
    expect(
      longLists.compareDocumentPosition(shoppingVisits) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  test('uses the same three-step navigation when editing a metric revision', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <MetricDialog
        open
        metric={configuredMetric}
        metricCount={1}
        isSaving={false}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.getByLabelText('Display name')).toHaveValue('Pantry Shopping Visits');
    expect(screen.getByText('Basket')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Classification')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Revision' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      displayName: 'Pantry Shopping Visits',
      iconName: 'shopping-basket',
      capacityTarget: 75,
    }));
  });
});

describe('Service Date navigation', () => {
  test('moves only across weekdays enabled in Operating Hours', () => {
    expect(adjacentOperatingDate('2026-08-11', -1, DEFAULT_OPERATING_HOURS)).toBe('2026-08-06');
    expect(adjacentOperatingDate('2026-08-11', 1, DEFAULT_OPERATING_HOURS)).toBe('2026-08-12');
  });

  test('reuses the Custom range calendar treatment and allows a special-event day', () => {
    const onChange = vi.fn();
    render(
      <ServiceDateNavigator
        value="2026-08-11"
        today="2026-08-13"
        hours={DEFAULT_OPERATING_HOURS}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Choose service date/ }));

    expect(screen.getByRole('dialog')).toHaveClass(
      'w-[262px]',
      'overflow-hidden',
      'rounded-2xl',
      'border-border/70',
      'bg-background/80',
      'backdrop-blur-[14px]',
      'backdrop-saturate-150'
    );
    expect(screen.getByRole('combobox', { name: 'Choose the Month' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Choose the Year' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', {
      name: 'Monday, August 10th, 2026',
    }));
    expect(onChange).toHaveBeenCalledWith('2026-08-10');
  });

  test('shows the selected service date with its weekday and ordinal day', () => {
    render(
      <ServiceDateNavigator
        value="2026-07-09"
        today="2026-08-13"
        hours={DEFAULT_OPERATING_HOURS}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Thursday, July 9th, 2026')).toBeInTheDocument();
  });
});
