// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import '@tanstack/react-table';

/**
 * What FEED puts in a column's `meta`.
 *
 * TanStack ships `ColumnMeta` as an empty interface for consumers to augment.
 * Without this file `meta.style` was neither checked nor discoverable — it was
 * read at runtime by the table and invisible to the compiler, which is part of
 * why half the tables never set it.
 *
 * See docs/layout/table-standard.md.
 */
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends unknown, TValue> {
    /**
     * Which edge the column's content sits against.
     *
     * Declared **once per column** and applied by `EnhancedDataTable` to the
     * header and the cells together. Aligning one half of a column and not the
     * other is the defect this exists to make unrepresentable.
     *
     * Defaults to `'left'`. Numeric columns may choose `'right'`, but nothing
     * is right-aligned implicitly — the reference table left-aligns its counts,
     * and silently changing that would be a design decision smuggled in as a
     * refactor.
     */
    align?: 'left' | 'right';

    /**
     * Escape hatch for a bespoke column width.
     *
     * Not needed in normal use: widths come from each column's `size`, which
     * `EnhancedDataTable` resolves for every viewport. Setting this overrides
     * that for one column and opts out of the responsive recalculation, so
     * prefer `size` unless a column genuinely cannot be expressed that way.
     */
    style?: React.CSSProperties;
  }
}
