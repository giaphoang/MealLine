// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { OfbImportDialog } from '@/components/data-management/ofb-import-dialog';

vi.mock('@/services/procurement', () => ({
  procurementService: {
    importOfbExport: vi.fn(),
    rollbackImports: vi.fn(),
  },
}));

describe('OFB import prerequisites', () => {
  test('links directly to Primarius and the packaged Chrome extension guide', () => {
    render(
      <OfbImportDialog
        open
        onOpenChange={vi.fn()}
        onImported={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Import OFB Data' })).toBeVisible();
    expect(screen.getByText(/Import the unified OFB export from Order History in/)).toBeVisible();

    const primarius = screen.getByRole('link', { name: 'Primarius' });
    expect(primarius).toHaveAttribute('href', 'https://ofb.primarius.app/PWW/');
    expect(primarius).toHaveAttribute('target', '_blank');

    const extension = screen.getByRole('link', {
      name: 'OFB Order CSV Exporter Chrome Extension and installation guide',
    });
    expect(extension).toHaveAttribute(
      'href',
      '/downloads/OFB-Order-CSV-Exporter-v2.0.0.zip'
    );
    expect(extension).toHaveAttribute('download');

    expect(screen.queryByText(/one file covering Warehouse Completed orders/i)).toBeNull();
    expect(screen.queryByText(/source file is discarded after import/i)).toBeNull();
  });
});
