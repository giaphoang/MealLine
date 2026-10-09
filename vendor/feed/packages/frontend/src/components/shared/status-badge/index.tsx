// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { cn } from "@/lib/utils"

export type StatusType = 'success' | 'warning' | 'danger' | 'neutral';

export interface StatusBadgeProps {
  label: string;
  status: StatusType;
  className?: string;
  /** Hover text, where the badge is a summary of something longer. */
  title?: string;
}

export function StatusBadge({
  label,
  status,
  className,
  title
}: StatusBadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "px-2 py-1 rounded-full text-xs font-medium border",
        {
          'success': 'bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-text)]',
          'warning': 'bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning-text)]',
          'danger': 'bg-[var(--status-danger-bg)] border-[var(--status-danger-border)] text-[var(--status-danger-text)]',
          'neutral': 'bg-[var(--status-neutral-bg)] border-[var(--status-neutral-border)] text-[var(--status-neutral-text)]',
        }[status],
        className
      )}
    >
      {label}
    </span>
  );
}