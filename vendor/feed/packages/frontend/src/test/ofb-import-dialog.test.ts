// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test } from 'vitest';
import {
  combinedWarnings,
  importIds,
  importedSummary,
  warningCount,
} from '@/components/data-management/ofb-import-dialog';
import type { UnifiedImportResult } from '@/types/procurement';

const unifiedResult = (overrides: Partial<UnifiedImportResult> = {}) => ({
  outcome: 'imported' as const,
  rowCount: 535,
  rangeStart: '2026-06-01',
  rangeEnd: '2026-07-21',
  warehouse: {
    outcome: 'imported' as const,
    importId: 10,
    rowCount: 365,
    orderCount: 8,
    skippedOrderCount: 0,
    warningCount: 1,
    rangeStart: '2026-06-01',
    rangeEnd: '2026-07-13',
    warnings: [{ code: 'PRICE_TOTAL_MISMATCH', message: 'Row 5 reports a different Price Total than Qty × Unit Price. FEED retained both values.', deliveryDate: '2026-06-01', rowNumbers: [5] }],
  },
  freshAlliance: {
    outcome: 'imported' as const,
    importId: 11,
    rowCount: 170,
    pickupCount: 43,
    skippedPickupCount: 0,
    supersededEventCount: 29,
    warningCount: 1,
    rangeStart: '2026-06-02',
    rangeEnd: '2026-07-21',
    warnings: [{ code: 'MISSING_DONOR_VALUATION', message: 'Row 20 records no donor value per pound. FEED retained the weight and excluded the row from in-kind value.', deliveryDate: '2026-06-02', rowNumbers: [20] }],
  },
  ...overrides,
} satisfies UnifiedImportResult);

describe('Unified import summary helpers', () => {
  test('summarizes both channels together when both are present', () => {
    const summary = importedSummary(unifiedResult());
    expect(summary).toContain('535 rows');
    expect(summary).toContain('8 warehouse orders');
    expect(summary).toContain('43 pickups with donor detail');
    expect(summary).toContain('replacing 29 matching Completed Orders receipts');
  });

  test('summarizes gracefully when only one channel is present in the file', () => {
    const warehouseOnly = unifiedResult({ freshAlliance: null });
    expect(importedSummary(warehouseOnly)).toBe('Imported 535 rows across 8 warehouse orders');

    const pickupsOnly = unifiedResult({ warehouse: null });
    expect(importedSummary(pickupsOnly)).toContain('pickups with donor detail');
    expect(importedSummary(pickupsOnly)).not.toContain('warehouse order');
  });

  test('sums warning counts and concatenates warnings across both channels', () => {
    const result = unifiedResult();
    expect(warningCount(result)).toBe(2);
    const warnings = combinedWarnings(result);
    expect(warnings).toHaveLength(2);
    expect(warnings.map((warning) => warning.code)).toEqual([
      'PRICE_TOTAL_MISMATCH',
      'MISSING_DONOR_VALUATION',
    ]);
  });

  test('collects both channels’ import IDs so a unified import can be undone in one action', () => {
    expect(importIds(unifiedResult())).toEqual([10, 11]);
    expect(importIds(unifiedResult({ freshAlliance: null }))).toEqual([10]);
    expect(importIds(unifiedResult({
      warehouse: { ...unifiedResult().warehouse!, importId: null },
      freshAlliance: { ...unifiedResult().freshAlliance!, importId: null },
    }))).toEqual([]);
  });
});
