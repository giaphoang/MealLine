// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * How FEED writes a date.
 *
 * **`m/d/yyyy`** — US month-first order, with no leading zero on the month or
 * the day. July 11th 2026 is `7/11/2026`, not `07/11/2026` and not
 * `Jul 11, 2026`.
 *
 * ## Why this exists
 *
 * Five conventions were in use across two libraries, because every call site
 * chose its own options object and there was nothing to import:
 *
 * | Written as | Produces |
 * | --- | --- |
 * | `toLocaleDateString()` | `7/11/2026` — correct, by accident |
 * | `toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })` | `07/11/2026` |
 * | `toLocaleDateString(undefined, { month: '2-digit' })` | depends on the viewer |
 * | `toLocaleDateString('en-US', { month: 'short' })` | `Jul 11, 2026` |
 * | date-fns `format(d, 'MMM d, yyyy h:mm a')` | `Jul 11, 2026 3:04 PM` |
 *
 * The bare call is the one that was right, which is the trap: being *explicit*
 * about the options is what produced the padded variant, so the careful thing
 * to do was the wrong thing.
 *
 * ## The locale is pinned deliberately
 *
 * `toLocaleDateString(undefined, …)` formats in the *viewer's* locale. On a
 * browser set to en-GB the same row renders `11/07/2026` — day first. For a
 * pantry reading delivery windows and import dates that is not an
 * inconsistency, it is a misread waiting to happen, so the locale is `en-US`
 * everywhere rather than left to the machine.
 *
 * ## Scope
 *
 * Tables, cards, dialogs — anywhere a date is read as data. Chart **axis
 * ticks** keep their compact `MMM d`, because an axis is a scale rather than a
 * record and `7/11` repeated across a month is unreadable.
 *
 * See docs/layout/table-standard.md.
 */

type DateInput = Date | string | number | null | undefined;

/** What a table cell shows when the value is absent or unparseable. */
const EMPTY = '—';

const toDate = (value: DateInput): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  // API date-only values describe a calendar day, not an instant in UTC.
  // Construct them in local time so western time zones do not display the
  // preceding day (for example, `2025-11-01` as `10/31/2025`).
  const dateOnlyMatch = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    : null;
  const date = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3]),
      )
    : value instanceof Date
      ? value
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  // `numeric`, not `2-digit`: this is what drops the leading zero.
  month: 'numeric',
  day: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

const longDatePartsFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

const ordinalSuffix = (day: number): string => {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  if (day % 10 === 1) return 'st';
  if (day % 10 === 2) return 'nd';
  if (day % 10 === 3) return 'rd';
  return 'th';
};

/** `7/11/2026`. The default for any date shown as data. */
export const formatDate = (value: DateInput): string => {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : EMPTY;
};

/** `Thursday, July 9th, 2026`. Used by prominent calendar-day controls. */
export const formatLongOrdinalDate = (value: DateInput): string => {
  const date = toDate(value);
  if (!date) return EMPTY;
  const parts = longDatePartsFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((candidate) => candidate.type === type)?.value ?? ''
  );
  const day = date.getDate();
  return `${part('weekday')}, ${part('month')} ${day}${ordinalSuffix(day)}, ${part('year')}`;
};

/**
 * `7/11/2026 3:04 PM`.
 *
 * Composed rather than taken from one formatter with both parts, because
 * `Intl` joins them with a comma (`7/11/2026, 3:04 PM`) and the tables that
 * already show a timestamp do not use one.
 */
export const formatDateTime = (value: DateInput): string => {
  const date = toDate(value);
  return date ? `${dateFormatter.format(date)} ${timeFormatter.format(date)}` : EMPTY;
};

/**
 * `6/2/2026 – 7/31/2026`, with an en dash.
 *
 * Either end may be missing — a procurement window can be open — and a range
 * that lost one end should say so rather than render a dash against a blank.
 */
export const formatDateRange = (start: DateInput, end: DateInput): string => {
  const from = toDate(start);
  const to = toDate(end);
  if (!from && !to) return EMPTY;
  if (!from) return `Through ${formatDate(to)}`;
  if (!to) return `From ${formatDate(from)}`;
  return `${formatDate(from)} – ${formatDate(to)}`;
};
