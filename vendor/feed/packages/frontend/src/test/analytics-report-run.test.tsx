// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ReportsManagementWorkspace } from '@/components/reports-management';
import { RunTemplateDialog } from '@/components/reports-management/run-dialog';
import {
  cardAvailability,
  parseTemplateSpec,
} from '@/components/reports-management/template-spec';
import { analyticsReportsService } from '@/services/analytics-reports';

/**
 * Running a saved template.
 *
 * The point of a template is that the second run means the same thing as the
 * first, so these assert on the *request*: the stored cards, their order, the
 * filters and the output choices must all survive the round trip, with only the
 * period changing.
 */

vi.mock('@/services/analytics-reports', () => ({
  analyticsReportsService: {
    getTemplates: vi.fn(),
    getCards: vi.fn(),
    deleteTemplate: vi.fn().mockResolvedValue(undefined),
    deleteTemplates: vi.fn().mockResolvedValue({ deleted: 0 }),
    downloadReport: vi.fn().mockResolvedValue(undefined),
  },
}));

const service = vi.mocked(analyticsReportsService);

const CARD_TITLES = {
  'procurement-acquisition-mix': 'Acquisition Mix',
  'procurement-channels': 'Procurement Channels',
};

const SPEC = parseTemplateSpec({
  id: 7,
  name: 'Monthly Procurement',
  source: 'analytics',
  templateData: {
    schemaVersion: 1,
    cardIds: ['procurement-channels', 'procurement-acquisition-mix'],
    channel: 'ofb_warehouse',
    acquisitionClass: 'PURCHASED',
    includePdf: true,
    includeCsv: true,
    csvGrain: 'raw',
    cardOptions: { 'procurement-channels': { donors: ['a'] } },
  },
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
});

const target = (cardIds = SPEC.cardIds) => ({
  id: 7,
  name: 'Monthly Procurement',
  spec: { ...SPEC, cardIds },
});

const generate = () => fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

beforeEach(() => {
  vi.clearAllMocks();
  service.downloadReport.mockResolvedValue(undefined);
  service.getCards.mockResolvedValue([]);
  service.getTemplates.mockResolvedValue([]);
});

describe('Running a saved report template', () => {
  test('sends the stored cards, order, filters and output choices with the chosen period', async () => {
    render(
      <RunTemplateDialog target={target()} onOpenChange={vi.fn()} cardTitles={CARD_TITLES} />
    );

    // Card titles come from the server registry, not the stored ids.
    expect(screen.getByText('Procurement Channels')).toBeVisible();
    generate();

    await waitFor(() => expect(service.downloadReport).toHaveBeenCalledTimes(1));
    expect(service.downloadReport).toHaveBeenCalledWith({
      // The saved order, not the registry's.
      cardIds: ['procurement-channels', 'procurement-acquisition-mix'],
      title: 'Monthly Procurement',
      includePdf: true,
      includeCsv: true,
      csvGrain: 'raw',
      cardOptions: { 'procurement-channels': { donors: ['a'] } },
      // The period is the one thing a template does not store.
      preset: 'last-90-days',
      startDate: undefined,
      endDate: undefined,
      channel: 'ofb_warehouse',
      acquisitionClass: 'PURCHASED',
    });
  });

  test('the period is chosen at run time and travels with the request', async () => {
    render(
      <RunTemplateDialog target={target()} onOpenChange={vi.fn()} cardTitles={CARD_TITLES} />
    );

    // Radix tabs select on mousedown, not click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'YTD' }));
    generate();

    await waitFor(() => expect(service.downloadReport).toHaveBeenCalledTimes(1));
    expect(service.downloadReport.mock.calls[0][0]).toMatchObject({ preset: 'ytd' });
  });

  test('a custom period reaches the request with both dates', async () => {
    render(
      <RunTemplateDialog target={target()} onOpenChange={vi.fn()} cardTitles={CARD_TITLES} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Start' }), {
      target: { value: '2026-06-01' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'End' }), {
      target: { value: '2026-06-30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    generate();

    await waitFor(() => expect(service.downloadReport).toHaveBeenCalledTimes(1));
    expect(service.downloadReport.mock.calls[0][0]).toMatchObject({
      preset: 'custom',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
  });

  test('warns about a removed card before generating, and omits it from the request', async () => {
    render(
      <RunTemplateDialog
        target={target(['procurement-channels', 'procurement-retired-card'])}
        onOpenChange={vi.fn()}
        cardTitles={CARD_TITLES}
      />
    );

    // Said in the dialog, before the download — not discovered afterwards from
    // a response header or a short archive.
    expect(screen.getByText(/no longer available/i)).toBeVisible();
    expect(screen.getByText('Unavailable')).toBeVisible();

    generate();

    await waitFor(() => expect(service.downloadReport).toHaveBeenCalledTimes(1));
    expect(service.downloadReport.mock.calls[0][0].cardIds).toEqual(['procurement-channels']);
  });

  test('cannot be generated when none of its cards survive', () => {
    render(
      <RunTemplateDialog
        target={target(['procurement-retired-card'])}
        onOpenChange={vi.fn()}
        cardTitles={CARD_TITLES}
      />
    );

    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.getByText(/Nothing is left to generate/)).toBeVisible();
  });

  test('does not claim cards are missing when the registry could not be read', async () => {
    render(<RunTemplateDialog target={target()} onOpenChange={vi.fn()} cardTitles={null} />);

    expect(screen.queryByText(/no longer available/i)).toBeNull();
    generate();

    await waitFor(() => expect(service.downloadReport).toHaveBeenCalledTimes(1));
    // Every stored id is sent; the server decides what it can render.
    expect(service.downloadReport.mock.calls[0][0].cardIds).toEqual(SPEC.cardIds);
  });
});

describe('Reports Management', () => {
  test('flags a removed card in the table, so it is visible without opening the row', async () => {
    service.getCards.mockResolvedValue([
      { id: 'procurement-channels', title: 'Procurement Channels', lens: 'procurement', kind: 'chart' },
    ]);
    service.getTemplates.mockResolvedValue([
      {
        id: 7,
        name: 'Monthly Procurement',
        source: 'analytics',
        templateData: { cardIds: ['procurement-channels', 'procurement-retired-card'] },
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
      },
    ]);

    render(<ReportsManagementWorkspace />);

    const row = await screen.findByRole('row', { name: /Monthly Procurement/ });
    expect(await within(row).findByText('1 unavailable')).toBeVisible();
  });

  test('deletes selected templates through the standard bulk action', async () => {
    service.getTemplates.mockResolvedValue([
      {
        id: 7,
        name: 'Monthly Procurement',
        source: 'analytics',
        templateData: { cardIds: ['procurement-channels'] },
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
      },
      {
        id: 8,
        name: 'Weekly Operations',
        source: 'analytics',
        templateData: { cardIds: ['operations-recurring-availability'] },
        createdAt: '2026-07-02T10:00:00.000Z',
        updatedAt: '2026-07-02T10:00:00.000Z',
      },
    ]);
    service.deleteTemplates.mockResolvedValue({ deleted: 2 });

    render(<ReportsManagementWorkspace />);

    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: 'Select row' });
    fireEvent.click(rowCheckboxes[0]);
    expect(screen.getByText('1 selected')).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByText('2 selected')).toBeVisible();

    // Keyboard activation is a supported Radix trigger path and is stable in jsdom.
    fireEvent.keyDown(screen.getByTestId('bulk-actions-button'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete Selected' }));

    expect(screen.getByText(/permanently delete 2 report templates/i)).toBeVisible();
    expect(screen.getByText(/Monthly Procurement, Weekly Operations/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Anyway' }));

    await waitFor(() =>
      expect(service.deleteTemplates).toHaveBeenCalledWith([7, 8])
    );
    await waitFor(() => expect(screen.queryByText('2 selected')).toBeNull());
  });
});

describe('cardAvailability', () => {
  const spec = { ...SPEC, cardIds: ['kept', 'gone'] };

  test('partitions the saved ids against the registry', () => {
    expect(cardAvailability(spec, { kept: 'Kept' })).toEqual({
      available: ['kept'],
      missing: ['gone'],
    });
  });

  test('reports nothing missing when the registry is unknown', () => {
    // An unread registry and an empty one are different facts. Conflating them
    // would tell the user every card in every template had been deleted.
    expect(cardAvailability(spec, null)).toEqual({
      available: ['kept', 'gone'],
      missing: [],
    });
  });

  test('reports everything missing when the registry really is empty', () => {
    expect(cardAvailability(spec, {})).toEqual({ available: [], missing: ['kept', 'gone'] });
  });
});

describe('parseTemplateSpec', () => {
  const stored = (templateData: unknown) => ({
    id: 1,
    name: 'T',
    source: 'analytics',
    templateData,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  });

  test('defaults an absent output choice to on, matching the server', () => {
    expect(parseTemplateSpec(stored({ cardIds: ['a'] }))).toEqual({
      cardIds: ['a'],
      channel: undefined,
      acquisitionClass: undefined,
      includePdf: true,
      includeCsv: true,
      csvGrain: 'condensed',
      cardOptions: {},
    });
  });

  test('survives a payload written by a client that knew nothing of this shape', () => {
    const spec = parseTemplateSpec(stored({ cardIds: ['a', 7, null], channel: 'moon' }));

    expect(spec.cardIds).toEqual(['a']);
    expect(spec.channel).toBeUndefined();
  });

  test('treats a missing payload as an empty template rather than throwing', () => {
    expect(parseTemplateSpec(stored(null)).cardIds).toEqual([]);
  });
});
