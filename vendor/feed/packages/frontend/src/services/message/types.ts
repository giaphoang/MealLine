// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Message type variants supported by the system
 */
export type MessageType = 'success' | 'error' | 'info' | 'warning';

/**
 * Configuration options for message display
 */
export interface MessageOptions {
  /** Duration in milliseconds to display the message */
  duration?: number;
  
  /** Optional action button configuration */
  action?: {
    /** Label for the action button */
    label: string;
    /** Callback function when action is clicked */
    onClick: () => void;
  };

  /** Whether the message should persist until manually dismissed */
  persist?: boolean;
}

/**
 * Length-aware toast duration (ISSUES.md #44).
 *
 * Toast visibility is now purely time-based and scales with how much there is
 * to read. Target: enough time to read the message through three times.
 *
 *   duration = chars × 50ms/char × 3 reads, clamped to [3s, 12s]
 *
 * 50ms/char ≈ 20 chars/sec comfortable reading; ×3 honors the "read it three
 * times" goal. The 3s floor keeps short toasts ("Marked in stock.") on screen
 * long enough to register; the 12s ceiling stops long messages from camping.
 *
 * This replaced the previous per-message-type fixed durations (4–8s), which
 * ignored message length entirely. Hover/focus/tap no longer extend a toast —
 * see `components/ui/use-toast.ts` for the time-only dismissal mechanism.
 */
export const MIN_MESSAGE_DURATION_MS = 3000;
export const MAX_MESSAGE_DURATION_MS = 12000;
const MESSAGE_MS_PER_CHAR = 50;
const MESSAGE_READS = 3;

export function computeMessageDuration(text: string): number {
  const length = typeof text === 'string' ? text.trim().length : 0;
  const raw = length * MESSAGE_MS_PER_CHAR * MESSAGE_READS;
  return Math.min(MAX_MESSAGE_DURATION_MS, Math.max(MIN_MESSAGE_DURATION_MS, raw));
}

/**
 * Default titles for different message types
 */
export const DEFAULT_TITLES: Partial<Record<MessageType, string>> = {
  error: 'Error',
  warning: 'Warning'
} as const;

/**
 * Variant mappings for toast styling
 */
export const VARIANT_MAPPINGS: Record<MessageType, 'default' | 'destructive' | 'warning'> = {
  success: 'default',
  error: 'destructive',
  info: 'default',
  warning: 'warning'
} as const;