// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  AnalyticsReportDialog,
  defaultAnalyticsReportTitle,
} from '@/components/analytics/report-dialog';
import {
  ReportSelectionProvider,
  useReportSelection,
} from '@/components/reports/selection';

vi.mock('@/services/analytics-reports', () => ({
  analyticsReportsService: {
    saveTemplate: vi.fn(),
    downloadReport: vi.fn(),
  },
}));

function DialogHarness({ cardIds, open }: { cardIds: string[]; open: boolean }) {
  const { applySelection } = useReportSelection();
  const selectionKey = cardIds.join('|');

  React.useEffect(() => {
    applySelection(cardIds);
    // `applySelection` changes identity with selection state; the serialized
    // ids are the input this harness intentionally follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  return React.createElement(AnalyticsReportDialog, {
    open,
    onOpenChange: vi.fn(),
    titles: Object.fromEntries(cardIds.map(id => [id, id])),
    filters: { preset: 'all', summary: 'All history' },
    onGenerated: vi.fn(),
  });
}

const renderDialog = (cardIds: string[], open = true) =>
  React.createElement(
    ReportSelectionProvider,
    null,
    React.createElement(DialogHarness, { cardIds, open })
  );

describe('default Analytics report title', () => {
  it('names a Procurement-only selection Procurement Report', () => {
    expect(defaultAnalyticsReportTitle([
      'procurement-channels',
      'procurement-seasonal-inbound-weight',
    ])).toBe('Procurement Report');
  });

  it('names an Operations-only selection Operations Report', () => {
    expect(defaultAnalyticsReportTitle([
      'operations-recurring-availability',
      'operations-rationing-history',
    ])).toBe('Operations Report');
  });

  it('names a Service-only selection Service Report', () => {
    // A third lens broke the old pairwise test: "procurement and not
    // operations" made a Service-only selection Combined, which is the one
    // thing it is not.
    expect(defaultAnalyticsReportTitle([
      'service-summary', 'service-over-time',
    ])).toBe('Service Report');
  });

  it('names a mixed selection Combined Report regardless of order', () => {
    expect(defaultAnalyticsReportTitle([
      'operations-category-pressure',
      'procurement-paid-product-spend',
    ])).toBe('Combined Report');
    expect(defaultAnalyticsReportTitle([
      'procurement-paid-product-spend',
      'operations-category-pressure',
    ])).toBe('Combined Report');
  });

  it('uses the neutral combined name when no recognized card is present', () => {
    expect(defaultAnalyticsReportTitle([])).toBe('Combined Report');
    expect(defaultAnalyticsReportTitle(['retired-card'])).toBe('Combined Report');
  });

  it('updates the suggestion until the user customizes the title', async () => {
    const view = render(renderDialog(['procurement-channels']));
    const title = await screen.findByLabelText('Title') as HTMLInputElement;
    await waitFor(() => expect(title.value).toBe('Procurement Report'));

    view.rerender(renderDialog([
      'procurement-channels',
      'operations-category-pressure',
    ]));
    await waitFor(() => expect(title.value).toBe('Combined Report'));

    fireEvent.change(title, { target: { value: 'Quarterly Pantry Review' } });
    expect(title.value).toBe('Quarterly Pantry Review');

    view.rerender(renderDialog(['operations-category-pressure']));
    await waitFor(() => expect(title.value).toBe('Quarterly Pantry Review'));

    // Closing and starting a new workflow resets to the new selection's
    // suggestion; customization belongs only to the workflow where it occurred.
    view.rerender(renderDialog(['operations-category-pressure'], false));
    view.rerender(renderDialog(['operations-category-pressure'], true));
    const reopenedTitle = await screen.findByLabelText('Title') as HTMLInputElement;
    await waitFor(() => expect(reopenedTitle.value).toBe('Operations Report'));
  });
});
