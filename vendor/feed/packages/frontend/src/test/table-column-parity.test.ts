// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * A table's printed columns must match the ones on screen.
 *
 * Report table cards define their columns server-side — id, header, formatter —
 * because a saved template regenerates with no client to ask. That duplicates
 * the frontend's `ColumnDef`, and duplication without a check is how every
 * previous drift in this project started: the date formats, the table widths,
 * the audit labels, the acquisition class wording.
 *
 * Column **ids** matter more than the headers. Sorting travels by id, so a
 * renamed `accessorKey` silently stops the report sorting the way the screen
 * did — the report still renders, still looks plausible, and is ordered
 * differently from what the user configured.
 */

const frontend = () =>
  readFileSync(join(__dirname, '..', 'components', 'analytics', 'index.tsx'), 'utf8');

const backend = () =>
  readFileSync(
    join(__dirname, '..', '..', '..', 'backend', 'src', 'services', 'reports', 'analytics-cards.ts'),
    'utf8'
  );

/** `accessorKey: 'x'` → header, whether the header is a string or a SortableHeader. */
const screenColumns = (source: string, declaration: string): Array<[string, string]> => {
  const start = source.indexOf(declaration);
  if (start === -1) throw new Error(`${declaration} not found — has it been renamed?`);
  // The array literal ends at the memo's closing bracket.
  const block = source.slice(start, source.indexOf('], [', start));

  const out: Array<[string, string]> = [];
  for (const match of block.matchAll(/accessorKey: '([^']+)'([\s\S]*?)(?=accessorKey: '|$)/g)) {
    const [, id, body] = match;
    const plain = /header: '([^']+)'/.exec(body);
    const sortable = /<SortableHeader[^>]*>([^<]+)</.exec(body);
    const header = (plain?.[1] ?? sortable?.[1] ?? '').trim();
    if (header) out.push([id, header]);
  }
  return out;
};

/** `{ id: 'x', header: 'Y' ... }` inside a named TableColumn array. */
const reportColumns = (source: string, declaration: string): Array<[string, string]> => {
  const start = source.indexOf(declaration);
  if (start === -1) throw new Error(`${declaration} not found — has it been renamed?`);
  const block = source.slice(start, source.indexOf('\n];', start));

  return [...block.matchAll(/\{\s*id: '([^']+)',\s*header: '([^']+)'/g)].map(
    match => [match[1], match[2]] as [string, string]
  );
};

describe('table column parity: screen vs printed report', () => {
  it('reads real columns from both sides', () => {
    // Guards the guard: a regex matching nothing would make the comparison
    // below vacuously pass.
    expect(screenColumns(frontend(), 'const warehouseProductColumns').length).toBeGreaterThanOrEqual(6);
    expect(reportColumns(backend(), 'const warehouseColumns').length).toBeGreaterThanOrEqual(6);
  });

  it('OFB Warehouse Product History: same ids, in the same order', () => {
    const screen = screenColumns(frontend(), 'const warehouseProductColumns').map(([id]) => id);
    const report = reportColumns(backend(), 'const warehouseColumns').map(([id]) => id);

    expect(
      report,
      'The report table and the screen table disagree about columns. Sorting ' +
        'travels by column id, so a mismatch silently reorders the exported ' +
        'table. Update warehouseColumns in backend analytics-cards.ts.'
    ).toEqual(screen);
  });

  it('Fresh Food Alliance Receipt Categories: same ids, in the same order', () => {
    const screen = screenColumns(frontend(), 'const freshAllianceDonorCategoryColumns').map(([id]) => id);
    const report = reportColumns(backend(), 'const freshAllianceColumns').map(([id]) => id);

    expect(report).toEqual(screen);
  });

  it('Fresh Food Alliance Receipt Categories: same headers', () => {
    const screen = Object.fromEntries(screenColumns(frontend(), 'const freshAllianceDonorCategoryColumns'));
    const report = Object.fromEntries(reportColumns(backend(), 'const freshAllianceColumns'));

    expect(report).toEqual(screen);
  });

  it('OFB Warehouse Product History: same headers', () => {
    const screen = Object.fromEntries(screenColumns(frontend(), 'const warehouseProductColumns'));
    const report = Object.fromEntries(reportColumns(backend(), 'const warehouseColumns'));

    expect(report).toEqual(screen);
  });
});
