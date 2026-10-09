// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { navigationItems } from '@/components/layout/navigation';
import { ReportsManagementWorkspace } from '@/components/reports-management';

// The page loads saved templates on mount. These assertions are about its
// structure, not the network, so the service is stubbed to an empty list.
vi.mock('@/services/analytics-reports', () => ({
  analyticsReportsService: {
    getTemplates: vi.fn().mockResolvedValue([]),
    getCards: vi.fn().mockResolvedValue([]),
    deleteTemplate: vi.fn().mockResolvedValue(undefined),
    deleteTemplates: vi.fn().mockResolvedValue({ deleted: 0 }),
    downloadReport: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Analytics and Reports information architecture', () => {
  // Analytics sat under Inventory while every lens described inventory over
  // time. Service encounters are not inventory, so the section that named the
  // subject stopped describing the page. Analytics, Reports and Data now read
  // as one progression: look at the data, report on it, manage its sources.
  test('groups Analytics, Reports and Data together under Information', () => {
    const inventory = navigationItems.find((item) => item.title === 'Inventory');
    const information = navigationItems.find((item) => item.title === 'Information');

    expect(inventory?.items?.map((item) => item.title)).toEqual(['Categories', 'Food Items']);

    expect(information?.items?.map((item) => item.title)).toEqual([
      'Analytics', 'Reports', 'Data', 'Help',
    ]);
    expect(information?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Analytics', href: '/analytics' }),
        expect.objectContaining({ title: 'Reports', href: '/reports' }),
        expect.objectContaining({ title: 'Data', href: '/data-management' }),
      ])
    );
  });

  // AI Configuration powers the tools rather than being one, so the section is
  // named for both — which also gives Settings and Admin a home beside it and
  // leaves Information to be about reading data rather than configuring it.
  test('groups configuration under Tools & Settings', () => {
    const tools = navigationItems.find((item) => item.title === 'Tools & Settings');
    const information = navigationItems.find((item) => item.title === 'Information');

    expect(tools?.items?.map((item) => item.title)).toEqual([
      'Shopping Lists', 'Document Translator', 'AI Configuration', 'Settings', 'Admin',
    ]);
    expect(navigationItems.find((item) => item.title === 'Tools')).toBeUndefined();
    expect(information?.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Settings' })])
    );
  });

  test('lists saved report templates with standard table controls', async () => {
    // Was a hardcoded placeholder; it now reads saved templates. The controls
    // asserted here are the table standard's, not this page's own.
    render(<ReportsManagementWorkspace />);

    const heading = screen.getByRole('heading', { name: 'Reports Management' });
    expect(heading).toBeVisible();
    const pageIcon = heading.parentElement?.parentElement?.querySelector('svg');
    expect(pageIcon).toHaveAttribute('width', '28');
    expect(pageIcon).toHaveAttribute('height', '28');
    // Awaited: the table renders skeletons until the load settles.
    expect(await screen.findByPlaceholderText('Filter templates...')).toBeVisible();
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
    expect(screen.getByTestId('pagination-controls')).toBeVisible();
  });

  test('says where templates come from — they cannot be created on this page', async () => {
    render(<ReportsManagementWorkspace />);

    // Let both initial service requests settle before the test is cleaned up.
    await screen.findByPlaceholderText('Filter templates...');

    expect(screen.getByText(/Save as report template/)).toBeVisible();
    // The page once said running a template was not available. It is now, so
    // that sentence must not survive: stale reassurance is worse than none.
    expect(screen.queryByText(/not available yet/)).toBeNull();
  });
});
