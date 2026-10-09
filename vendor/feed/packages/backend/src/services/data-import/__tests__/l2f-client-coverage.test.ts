// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import { measureClientCoverage } from '../l2f-client-coverage';

/**
 * The measurement the per-year Link2Feed client exports need, tested against
 * fixtures that mirror the real files' shape.
 *
 * Real exports are never committed — they carry PII even sanitized, and live
 * outside the repository. So the arithmetic is proved here and the script that
 * feeds it real files stays a thin reader.
 */

const stored = ['5000001', '5000002', '5466020', '5466021', '5900000'];

describe('per-year Link2Feed client coverage', () => {
  it('reports the union rather than the largest single file', () => {
    // The point of per-year files: each is small, but together they should
    // reach clients no single export did.
    const report = measureClientCoverage({
      storedClientIds: stored,
      files: [
        { label: '2024', clientIds: ['5466020', '5466021'] },
        { label: '2025', clientIds: ['5466021', '5900000'] },
      ],
    });

    expect(report.files.map((f) => f.rows)).toEqual([2, 2]);
    // Three distinct ids across four rows: the overlap is counted once.
    expect(report.combined.rows).toBe(3);
    expect(report.combined.matched).toBe(3);
    expect(report.combined.coveragePercent).toBe(60);
  });

  it('separates clients the exports start too late to hold from genuinely absent ones', () => {
    // This is the distinction that decided the all-time review: 3,344 of the
    // clients it missed carried ids below its lowest, so the file could not
    // have held them however complete it was.
    const report = measureClientCoverage({
      storedClientIds: stored,
      files: [{ label: '2025', clientIds: ['5466020', '5466021', '5900000'] }],
    });

    expect(report.missing.count).toBe(2);
    expect(report.missing.belowLowestExportedId).toBe(2);
  });

  it('counts a row FEED has never seen as unmatched, not as coverage', () => {
    // A client in the export but not in FEED is a gap in the visits import,
    // and must never be mistaken for the export covering one of ours.
    const report = measureClientCoverage({
      storedClientIds: stored,
      files: [{ label: '2025', clientIds: ['5900000', '9999999'] }],
    });

    expect(report.combined.matched).toBe(1);
    expect(report.combined.unmatched).toBe(1);
    expect(report.combined.coveragePercent).toBe(20);
  });

  it('answers whether the union beats the all-time export', () => {
    const better = measureClientCoverage(
      { storedClientIds: stored, files: [{ label: 'union', clientIds: stored }] },
      3,
    );
    expect(better.improvesOnBaseline).toBe(true);

    const worse = measureClientCoverage(
      { storedClientIds: stored, files: [{ label: 'union', clientIds: ['5900000'] }] },
      3,
    );
    expect(worse.improvesOnBaseline).toBe(false);

    // No baseline given is not the same as "no improvement".
    const unknown = measureClientCoverage({
      storedClientIds: stored,
      files: [{ label: 'union', clientIds: stored }],
    });
    expect(unknown.improvesOnBaseline).toBeNull();
  });

  it('does not invent an ordering for non-numeric ids', () => {
    const report = measureClientCoverage({
      storedClientIds: ['A-1', 'B-2'],
      files: [{ label: '2025', clientIds: ['B-2'] }],
    });

    expect(report.missing.count).toBe(1);
    expect(report.missing.belowLowestExportedId).toBe(0);
  });

  it('ignores blank and padded ids rather than counting them as clients', () => {
    const report = measureClientCoverage({
      storedClientIds: ['5000001', '  ', ''],
      files: [{ label: '2025', clientIds: [' 5000001 ', ''] }],
    });

    expect(report.storedCount).toBe(1);
    expect(report.combined.rows).toBe(1);
    expect(report.combined.matched).toBe(1);
    expect(report.combined.coveragePercent).toBe(100);
  });
});
