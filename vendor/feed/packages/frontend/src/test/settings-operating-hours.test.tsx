// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OperatingHoursEditor } from '@/components/settings/operating-hours-editor';
import { SettingsWorkspace } from '@/components/settings';
import { navigationItems } from '@/components/layout/navigation';
import {
  DEFAULT_OPERATING_HOURS,
  type OperatingHoursSettings,
} from '@/types/settings';

const getOperatingHours = vi.hoisted(() => vi.fn());
const updateOperatingHours = vi.hoisted(() => vi.fn());
const success = vi.hoisted(() => vi.fn());

vi.mock('@/services/settings', () => ({
  settingsService: { getOperatingHours, updateOperatingHours },
}));
vi.mock('@/services/message', () => ({
  messageService: { success, error: vi.fn() },
}));
vi.mock('@/services/error/ErrorHandlerService', () => ({
  ErrorHandlerService: { handleError: vi.fn() },
}));

const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const loadedSettings: OperatingHoursSettings = {
  revisionId: 1,
  effectiveDate: '1970-01-01',
  timezone: localTimezone,
  hours: DEFAULT_OPERATING_HOURS,
  updatedAt: '2026-07-13T12:00:00.000Z',
};

describe('Operating Hours settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/');
    getOperatingHours.mockResolvedValue(loadedSettings);
    updateOperatingHours.mockImplementation(async (input) => ({
      ...input,
      revisionId: 2,
      effectiveDate: '2026-07-13',
      updatedAt: '2026-07-13T13:00:00.000Z',
    }));
  });

  test('shows all seven days and retains a closed day’s times when reopened', () => {
    function Harness() {
      const [hours, setHours] = React.useState(DEFAULT_OPERATING_HOURS);
      return (
        <OperatingHoursEditor
          hours={hours}
          timezone="America/Los_Angeles"
          onChange={setHours}
          onTimezoneChange={vi.fn()}
        />
      );
    }
    const { container } = render(
      <Harness />
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(7);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Monday is open' }));

    const mondayOpenTime = container.querySelector<HTMLInputElement>(
      '#operating-hours-monday-open-time'
    );
    const mondayCloseTime = container.querySelector<HTMLInputElement>(
      '#operating-hours-monday-close-time'
    );
    expect(mondayOpenTime?.value).toBe('11:00');
    expect(mondayCloseTime?.value).toBe('14:00');
  });

  // Settings sits with the configuration it belongs to — beside AI
  // Configuration, which powers the tools — rather than under Information,
  // which is now about reading the organization's data.
  test('places Settings under Tools & Settings in the shared sidebar', () => {
    const tools = navigationItems.find((item) => item.title === 'Tools & Settings');
    const inventory = navigationItems.find((item) => item.title === 'Inventory');
    expect(tools?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Settings', href: '/settings' }),
    ]));
    expect(inventory?.items?.some((item) => item.href === '/settings')).toBe(false);
    expect(navigationItems.some((item) =>
      item.items?.some((child) => child.href === '/service-metrics')
    )).toBe(false);
  });

  test('keeps Settings focused on organization operating hours', async () => {
    const { container } = render(<SettingsWorkspace />);

    const operatingHours = await screen.findByText('Operating Hours');
    expect(screen.getByRole('region', { name: 'Operating Hours' })).toContainElement(operatingHours);
    expect(screen.queryByText('Service Metrics')).toBeNull();
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
  });

  test('loads and saves one organization-wide schedule', async () => {
    render(<SettingsWorkspace />);

    expect(await screen.findByText('Operating Hours')).toBeTruthy();
    const saveButton = screen.getByRole('button', { name: 'Save Operating Hours' });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Monday is open' }));
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => expect(updateOperatingHours).toHaveBeenCalledTimes(1));
    expect(updateOperatingHours).toHaveBeenCalledWith(expect.objectContaining({
      hours: expect.objectContaining({
        monday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
      }),
    }));
    expect(success).toHaveBeenCalledWith(
      'Operating hours saved for everyone using FEED, effective today.'
    );
  });
});
