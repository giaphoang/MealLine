// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * IANA-timezone date helpers for report ranges (docs/reports/logistics.md,
 * Reports initiative §2). Inclusive local dates are converted to
 * `[local start of first day, local start of day-after-last)` UTC.
 * Implemented with the Intl API so no timezone dependency is needed.
 */

export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    // Intl can emit hour 24 for midnight under some hourCycle quirks.
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidLocalDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  if (m < 1 || m > 12) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= 1 && d <= daysInMonth;
}

/**
 * UTC instant of local midnight at the start of `dateStr` in `timeZone`.
 * Iterative offset correction handles DST transitions (a skipped local
 * midnight resolves to the first existing instant after it).
 */
export function localDateStartUtc(dateStr: string, timeZone: string): Date {
  const match = DATE_PATTERN.exec(dateStr);
  if (!match) throw new Error(`Invalid local date: ${dateStr}`);
  const [, y, m, d] = match.map(Number);
  const targetUtcLike = Date.UTC(y, m - 1, d, 0, 0, 0);
  let utcMs = targetUtcLike;
  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(new Date(utcMs), timeZone);
    const seenUtcLike = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const diff = seenUtcLike - targetUtcLike;
    if (diff === 0) break;
    utcMs -= diff;
  }
  return new Date(utcMs);
}

const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

/** UTC instant for a local calendar date and 24-hour HH:mm time. */
export function localDateTimeUtc(
  dateStr: string,
  time: string,
  timeZone: string
): Date {
  const dateMatch = DATE_PATTERN.exec(dateStr);
  const timeMatch = TIME_PATTERN.exec(time);
  if (!dateMatch || !timeMatch) {
    throw new Error(`Invalid local date/time: ${dateStr} ${time}`);
  }
  const [, y, m, d] = dateMatch.map(Number);
  const [, hour, minute] = timeMatch.map(Number);
  if (hour > 23 || minute > 59) {
    throw new Error(`Invalid local time: ${time}`);
  }

  const targetUtcLike = Date.UTC(y, m - 1, d, hour, minute, 0);
  let utcMs = targetUtcLike;
  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(new Date(utcMs), timeZone);
    const seenUtcLike = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const diff = seenUtcLike - targetUtcLike;
    if (diff === 0) break;
    utcMs -= diff;
  }
  return new Date(utcMs);
}

/** Local calendar date ('YYYY-MM-DD') of `instant` in `timeZone`. */
export function localDateOf(instant: Date, timeZone: string): string {
  const parts = getZonedParts(instant, timeZone);
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${parts.year}-${mm}-${dd}`;
}

/** Shifts a local 'YYYY-MM-DD' date by whole calendar days. */
export function shiftLocalDate(dateStr: string, days: number): string {
  const match = DATE_PATTERN.exec(dateStr);
  if (!match) throw new Error(`Invalid local date: ${dateStr}`);
  const [, y, m, d] = match.map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/** Shifts a local 'YYYY-MM-DD' date by whole calendar months (day-clamped). */
export function shiftLocalDateMonths(dateStr: string, months: number): string {
  const match = DATE_PATTERN.exec(dateStr);
  if (!match) throw new Error(`Invalid local date: ${dateStr}`);
  const [, y, m, d] = match.map(Number);
  const targetMonthDays = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const shifted = new Date(Date.UTC(y, m - 1 + months, Math.min(d, targetMonthDays)));
  return shifted.toISOString().slice(0, 10);
}

export const ANALYTICS_RANGE_PRESETS = [
  'last-7-days',
  'last-30-days',
  'last-90-days',
  'ytd',
  'all',
  'custom',
] as const;

export type AnalyticsRangePreset = typeof ANALYTICS_RANGE_PRESETS[number];

// The dormant logistics-report prototype still accepts these longer presets.
export type RangePreset =
  | AnalyticsRangePreset
  | 'last-6-months'
  | 'last-12-months';

export interface ResolvedRange {
  /** Inclusive local calendar dates the range covers. */
  startDate: string;
  endDate: string;
  /** Half-open UTC window: [startUtc, endUtc). */
  startUtc: Date;
  endUtc: Date;
  timeZone: string;
  preset: RangePreset;
}

/**
 * Resolves a preset (relative to `now` in `timeZone`) or exact custom dates
 * into a half-open UTC window. Custom dates are inclusive local dates.
 */
export function resolveRange(
  preset: RangePreset,
  timeZone: string,
  now: Date,
  custom?: { startDate: string; endDate: string },
  allStartDate?: string
): ResolvedRange {
  const today = localDateOf(now, timeZone);
  let startDate: string;
  let endDate: string;

  switch (preset) {
    case 'last-7-days':
      startDate = shiftLocalDate(today, -6);
      endDate = today;
      break;
    case 'last-30-days':
      startDate = shiftLocalDate(today, -29);
      endDate = today;
      break;
    case 'last-90-days':
      startDate = shiftLocalDate(today, -89);
      endDate = today;
      break;
    case 'last-6-months':
      startDate = shiftLocalDateMonths(today, -6);
      endDate = today;
      break;
    case 'last-12-months':
      startDate = shiftLocalDateMonths(today, -12);
      endDate = today;
      break;
    case 'ytd':
      startDate = `${today.slice(0, 4)}-01-01`;
      endDate = today;
      break;
    case 'all':
      startDate = allStartDate ?? today;
      endDate = today;
      break;
    case 'custom': {
      if (!custom) throw new Error('Custom range requires startDate and endDate');
      startDate = custom.startDate;
      endDate = custom.endDate;
      break;
    }
  }

  if (startDate > endDate) {
    throw new Error('Range start date must not be after the end date');
  }

  return {
    startDate,
    endDate,
    startUtc: localDateStartUtc(startDate, timeZone),
    endUtc: localDateStartUtc(shiftLocalDate(endDate, 1), timeZone),
    timeZone,
    preset,
  };
}
