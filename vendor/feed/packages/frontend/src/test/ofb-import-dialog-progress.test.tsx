// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

/**
 * The import dialog's waiting state.
 *
 * A large OFB export takes real time on the production Pi — measured at ~1.8s
 * per MB, so a full 10MB file sits near 18 seconds. Before this, the only
 * feedback was a muted "Importing…" button label, which is
 * indistinguishable from a hung request. These tests pin the three things a
 * waiting user needs: that work is visibly in progress, that they are told to
 * wait, and that they are told their existing data is safe meanwhile.
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OfbImportDialog } from '@/components/data-management/ofb-import-dialog';

vi.mock('@/services/procurement', () => ({
  procurementService: {
    importOfbExport: vi.fn(),
    rollbackImports: vi.fn(),
  },
}));

vi.mock('@/services/message', () => ({
  messageService: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

const csvFile = (name = 'OFB_Export_test.csv') =>
  new File(['Schema Version,Record Type\r\n2.0,warehouse_order\r\n'], name, {
    type: 'text/csv',
  });

/** Starts an import that never settles, so the dialog stays in its waiting state. */
const beginHangingImport = async () => {
  const { procurementService } = await import('@/services/procurement');
  vi.mocked(procurementService.importOfbExport).mockReturnValue(
    new Promise(() => { /* deliberately never resolves */ })
  );

  render(
    <OfbImportDialog open onOpenChange={vi.fn()} onImported={vi.fn()} />
  );

  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [csvFile()] } });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /import data/i })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole('button', { name: /import data/i }));
};

describe('OFB import dialog — waiting state', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); });

  test('shows an in-progress status once an import is under way', async () => {
    await beginHangingImport();

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
    expect(screen.getByText(/Importing OFB_Export_test\.csv/i)).toBeInTheDocument();
  });

  test('tells the user to wait rather than leaving them to guess', async () => {
    await beginHangingImport();

    await waitFor(() => {
      expect(screen.getByText(/keep this window open/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/up to about 30 seconds/i)).toBeInTheDocument();
  });

  test('states that existing data is untouched until the import completes', async () => {
    // The atomicity guarantee is the reassurance that makes waiting tolerable:
    // a failure part-way through cannot leave procurement data half-written.
    await beginHangingImport();

    await waitFor(() => {
      expect(
        screen.getByText(/nothing is partly imported/i)
      ).toBeInTheDocument();
    });
  });

  test('replaces the drop zone so a second file cannot be started mid-import', async () => {
    await beginHangingImport();

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
    expect(screen.queryByText(/drag and drop an ofb csv/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled();
  });

  test('counts real elapsed seconds rather than animating a fabricated bar', async () => {
    // The server reports nothing until the transaction returns, so a
    // percentage would be invented. Elapsed time is the honest signal, and it
    // is what separates "still working" from "hung".
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await beginHangingImport();

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    await act(async () => { vi.advanceTimersByTime(2000); });
    await waitFor(() => {
      expect(screen.getByText(/2 seconds elapsed/i)).toBeInTheDocument();
    });
  });
});
