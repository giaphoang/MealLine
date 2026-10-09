// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import {
  DEFAULT_DATE_RANGE,
  type DateRangePreset,
  type DateRangeSelection,
} from '@/types/date-range';

export type AnalyticsRangePreset = DateRangePreset;

export type AnalyticsDateRange = DateRangeSelection;

export const DEFAULT_ANALYTICS_RANGE: AnalyticsDateRange = {
  ...DEFAULT_DATE_RANGE,
};
