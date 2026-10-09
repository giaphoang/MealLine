// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

export type DateRangePreset =
  | 'last-7-days'
  | 'last-30-days'
  | 'last-90-days'
  | 'ytd'
  | 'all'
  | 'custom';

export interface DateRangeSelection {
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
}

export const DEFAULT_DATE_RANGE: DateRangeSelection = {
  preset: 'last-90-days',
};
