// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, test } from 'vitest';

import { formatDate, formatDateRange, formatDateTime, formatLongOrdinalDate } from './date';

/**
 * The format is a decision, so it is pinned here rather than left to whoever
 * edits an options object next. Five variants were in use before this existed.
 */

describe('formatDate', () => {
  test('writes m/d/yyyy with no leading zeros', () => {
    // The reported drift: 08/04/2026 and "Jul 11, 2026" for the same idea.
    expect(formatDate(new Date(2026, 6, 11))).toBe('7/11/2026');
    expect(formatDate(new Date(2026, 7, 4))).toBe('8/4/2026');
    expect(formatDate(new Date(2026, 11, 25))).toBe('12/25/2026');
  });

  test('drops the zero on single-digit months and days independently', () => {
    expect(formatDate(new Date(2026, 0, 1))).toBe('1/1/2026');
    expect(formatDate(new Date(2026, 0, 15))).toBe('1/15/2026');
    expect(formatDate(new Date(2026, 9, 5))).toBe('10/5/2026');
  });

  test('accepts what the API actually returns', () => {
    // ISO strings and epoch millis both reach these cells.
    expect(formatDate('2026-07-11T00:00:00.000Z')).toContain('2026');
    expect(formatDate(new Date(2026, 6, 11).getTime())).toBe('7/11/2026');
  });

  test('treats date-only API values as calendar dates rather than UTC instants', () => {
    expect(formatDate('2025-11-01')).toBe('11/1/2025');
    expect(formatDateRange('2024-05-01', '2025-10-31')).toBe('5/1/2024 – 10/31/2025');
  });

  test('shows a dash rather than "Invalid Date"', () => {
    // A null lastLoginAt is normal for an invited user who has not signed in.
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('not a date')).toBe('—');
  });
});

describe('formatLongOrdinalDate', () => {
  test.each([
    ['2026-07-01', 'Wednesday, July 1st, 2026'],
    ['2026-07-02', 'Thursday, July 2nd, 2026'],
    ['2026-07-03', 'Friday, July 3rd, 2026'],
    ['2026-07-09', 'Thursday, July 9th, 2026'],
    ['2026-07-11', 'Saturday, July 11th, 2026'],
    ['2026-07-12', 'Sunday, July 12th, 2026'],
    ['2026-07-13', 'Monday, July 13th, 2026'],
    ['2026-07-21', 'Tuesday, July 21st, 2026'],
  ])('formats %s with weekday and ordinal day', (input, expected) => {
    expect(formatLongOrdinalDate(input)).toBe(expected);
  });
});

describe('formatDateTime', () => {
  test('appends the time without the Intl comma', () => {
    // `Intl` would render "7/11/2026, 3:04 PM"; the tables showing timestamps
    // do not use a comma.
    expect(formatDateTime(new Date(2026, 6, 11, 15, 4))).toBe('7/11/2026 3:04 PM');
  });

  test('keeps a leading-zero-free hour and a padded minute', () => {
    expect(formatDateTime(new Date(2026, 6, 11, 9, 5))).toBe('7/11/2026 9:05 AM');
  });

  test('falls back to a dash', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('formatDateRange', () => {
  test('joins with an en dash', () => {
    expect(formatDateRange(new Date(2026, 5, 2), new Date(2026, 6, 31))).toBe(
      '6/2/2026 – 7/31/2026'
    );
  });

  test('says which end it has when a window is open', () => {
    // A dash against a blank reads as a rendering bug rather than an open range.
    expect(formatDateRange(new Date(2026, 5, 2), null)).toBe('From 6/2/2026');
    expect(formatDateRange(null, new Date(2026, 6, 31))).toBe('Through 7/31/2026');
    expect(formatDateRange(null, null)).toBe('—');
  });
});

describe('the format does not follow the viewer', () => {
  test('is month-first regardless of the machine locale', () => {
    // `toLocaleDateString(undefined, …)` renders 11/07/2026 on an en-GB
    // browser. For delivery windows that is a misread, not a preference.
    const formatted = formatDate(new Date(2026, 6, 11));
    const [first] = formatted.split('/');
    expect(first).toBe('7');
  });
});
