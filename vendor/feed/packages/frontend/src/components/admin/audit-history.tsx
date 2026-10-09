// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { EnhancedDataTable } from '@/components/ui/enhanced-data-table';
import { SortableHeader } from '@/components/ui/sortable-header';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { adminService } from '@/services/admin';
import { formatDateTime } from '@/lib/formatting/date';
import { AUDIT_ACTION_LABELS, type AuditEntry } from '@/types/admin';

/**
 * Who did what, to whom, and when.
 *
 * The first entries on a freshly upgraded instance are the beta.4 migration's
 * own mass grant, recorded as `system:beta.4-migration` so the roster's origin
 * is on the record rather than appearing as administrators from nowhere.
 */

/** The server's own ceiling (`MAX_PAGE_SIZE` in `admin-audit-service.ts`). */
const REQUEST_SIZE = 200;

/**
 * How much history the table will hold at once.
 *
 * Sorting and filtering happen in the browser, over whatever rows are loaded —
 * which means a partial load makes the filter lie: it would report "no results"
 * for an entry that exists but was never fetched. In an audit log, which people
 * consult precisely to find one past action, that is the worst possible failure.
 *
 * So the whole history is loaded up front. It can afford to be: this table
 * records administrative actions only — role changes, invitations, access
 * changes, policy edits, backup downloads — so it grows by a handful of rows a
 * month, not per pantry visit. The ceiling exists so an unexpectedly large log
 * degrades visibly (see `isTruncated`) instead of hanging the page.
 */
const MAX_ENTRIES = 2000;

const actorLabel = (entry: AuditEntry): string => {
  if (entry.actorLabel === 'system:beta.4-migration') return 'FEED upgrade';
  if (entry.actorLabel === 'operator:cli') return 'Server console';
  return entry.actorLabel;
};

/**
 * `targetLabel` is whatever the action recorded about its subject — usually an
 * email address, but for a restore it is the backup artifact's own timestamp,
 * which arrived as `2026-08-04T22:20:41.415Z`. Formatted here so the one place
 * in the table that shows a date to a person does not show it in wire format.
 */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const targetLabel = (entry: AuditEntry): string => {
  const label = entry.targetLabel;
  if (!label) return '—';
  return ISO_TIMESTAMP.test(label) ? formatDateTime(label) : label;
};

const columns: ColumnDef<AuditEntry>[] = [
  {
    // Sorts on the timestamp, not the rendered string. "8/5/2026 9:04 AM"
    // sorted as text puts October before February.
    id: 'createdAt',
    accessorFn: entry => new Date(entry.createdAt).getTime(),
    header: ({ column }) => <SortableHeader column={column}>When</SortableHeader>,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {formatDateTime(row.original.createdAt)}
      </span>
    ),
    size: 190,
  },
  {
    id: 'actorLabel',
    accessorFn: actorLabel,
    header: ({ column }) => <SortableHeader column={column}>Who</SortableHeader>,
    size: 220,
  },
  {
    id: 'action',
    accessorFn: entry => AUDIT_ACTION_LABELS[entry.action] ?? entry.action,
    header: ({ column }) => <SortableHeader column={column}>Action</SortableHeader>,
    size: 200,
  },
  {
    id: 'targetLabel',
    accessorFn: targetLabel,
    header: ({ column }) => <SortableHeader column={column}>Affected</SortableHeader>,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{targetLabel(row.original)}</span>
    ),
    size: 220,
  },
];

export function AuditHistory() {
  const [entries, setEntries] = React.useState<AuditEntry[]>([]);
  const [isTruncated, setIsTruncated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      setIsLoading(true);
      try {
        const collected: AuditEntry[] = [];
        let total = Infinity;

        while (collected.length < Math.min(total, MAX_ENTRIES)) {
          const page = await adminService.getAudit({
            limit: REQUEST_SIZE,
            offset: collected.length,
          });
          if (cancelled) return;

          total = page.total;
          collected.push(...page.entries);

          // A page shorter than requested means the server has no more, whatever
          // `total` claimed. Without this the loop spins if the two disagree.
          if (page.entries.length < REQUEST_SIZE) break;
        }

        setEntries(collected);
        setIsTruncated(total > collected.length);
      } catch (error) {
        if (!cancelled) ErrorHandlerService.handleError(error, 'adminAuditHistory');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-2">
      <EnhancedDataTable
        columns={columns}
        data={entries}
        isLoading={isLoading}
        filterColumn="actorLabel"
        filterPlaceholder="Filter by who…"
        emptyMessage="Nothing recorded yet."
        // The component default is 5. This table previously showed 25 at a
        // time, and it is scanned rather than acted on, so 5 would be a visible
        // downgrade. 10 matches the Analytics history tables — the closest
        // equivalent — and the row-count selector still offers the rest.
        defaultPageSize={10}
      />

      {isTruncated && (
        // Said out loud rather than silently dropped: once the filter covers
        // less than the whole log, "no results" stops meaning "never happened".
        <p className="text-sm text-muted-foreground">
          Showing the most recent {MAX_ENTRIES.toLocaleString()} entries. Older history is
          not searchable here.
        </p>
      )}
    </div>
  );
}
