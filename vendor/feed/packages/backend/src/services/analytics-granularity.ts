// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import type { AnalyticsRangePreset } from './inventory-analytics/timezone';

export type BucketGranularity = 'day' | 'week' | 'month';

/**
 * How coarse a time series should be for a given range.
 *
 * Short ranges stay daily, because the unit staff work and record in is a day
 * — a service day, a delivery. Past a quarter the daily shape stops being
 * readable: a hundred-household Thursday against a five-household Friday
 * backpack session is a real swing that renders as noise once hundreds of
 * points share an axis, and procurement over its full span would put 1,710
 * delivery dates on one line.
 *
 * Shared by the Service and Procurement lenses rather than written twice. The
 * two had no reason to differ, and a rule copied into two files is a rule that
 * eventually does.
 */
export const MONTHLY_THRESHOLD_DAYS = 90;

export const granularityForRange = (
  preset: AnalyticsRangePreset,
  startDate: string,
  endDate: string,
): BucketGranularity => {
  if (preset === 'ytd' || preset === 'all') return 'month';
  if (preset !== 'custom') return 'day';
  const days = Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  ) + 1;
  return days > MONTHLY_THRESHOLD_DAYS ? 'month' : 'day';
};

/**
 * The bucket key a date falls in.
 *
 * Monday-start weeks, so a bucket never splits a Tuesday-to-Thursday service
 * week across two points.
 */
export const bucketKeyFor = (granularity: BucketGranularity, isoDate: string): string => {
  if (granularity === 'month') return isoDate.slice(0, 7);
  if (granularity === 'day') return isoDate;
  const date = new Date(`${isoDate}T00:00:00Z`);
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
};
