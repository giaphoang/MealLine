// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';
import type { Column } from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A column header that sorts, aligned with the cells beneath it.
 *
 * Every table wrote this inline as `<Button variant="ghost">` with no `size`,
 * which meant the default `px-4`. Cell content sits at the `td`'s `p-2`, so the
 * header label started **16px right of the data it labelled** — in 37 places
 * across 8 files. `-ml-4` cancels the button's own padding so the label's left
 * edge lands on the cell text, while the button keeps its full click target.
 *
 * Right-aligned columns mirror it: the padding is cancelled on the other side
 * and the arrow moves ahead of the label, so the label still ends where the
 * cell content ends.
 *
 * The alignment itself is not chosen here — it comes from the column's
 * `meta.align`, so a column cannot align its header one way and its cells
 * another. See docs/layout/table-standard.md.
 */

interface SortableHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  children: React.ReactNode;
  className?: string;
}

export function SortableHeader<TData, TValue>({
  column,
  children,
  className,
}: SortableHeaderProps<TData, TValue>) {
  const align = column.columnDef.meta?.align ?? 'left';

  return (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      className={cn(
        // Cancel the button's horizontal padding on whichever side the column
        // is aligned to, so the label sits flush with the cells below it.
        align === 'right' ? '-mr-4 flex-row-reverse' : '-ml-4',
        className
      )}
    >
      {children}
      <ArrowUpDown className={cn('h-4 w-4', align === 'right' ? 'mr-2' : 'ml-2')} />
    </Button>
  );
}
