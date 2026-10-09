// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { format, isValid, parseISO } from 'date-fns';
import type { DateRangePreset, DateRangeSelection } from '@/types/date-range';

export const RANGE_URL_VALUES: Record<DateRangePreset, string> = {
  'last-7-days': '7d',
  'last-30-days': '30d',
  'last-90-days': '90d',
  ytd: 'ytd',
  all: 'all',
  custom: 'custom',
};

const URL_RANGE_PRESETS = Object.fromEntries(
  Object.entries(RANGE_URL_VALUES).map(([preset, value]) => [value, preset])
) as Record<string, DateRangePreset>;

const validDate = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value;
};

export function dateRangeFromSearchParams(params: URLSearchParams): DateRangeSelection {
  const preset = URL_RANGE_PRESETS[params.get('range') ?? ''] ?? 'last-90-days';
  if (preset !== 'custom') return { preset };
  const startDate = params.get('from');
  const endDate = params.get('to');
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    return { preset: 'last-90-days' };
  }
  return { preset, startDate, endDate };
}
