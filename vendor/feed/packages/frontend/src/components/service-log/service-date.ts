// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { addDays, format, parseISO } from 'date-fns';
import type { DayOfWeek, OperatingHours } from '@/types/settings';

const WEEKDAYS: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export const dateInTimezone = (timezone: string, now = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const adjacentOperatingDate = (
  serviceDate: string,
  direction: -1 | 1,
  hours: OperatingHours,
): string | null => {
  let candidate = parseISO(serviceDate);
  for (let offset = 0; offset < 7; offset += 1) {
    candidate = addDays(candidate, direction);
    if (hours[WEEKDAYS[candidate.getDay()]].isOpen) {
      return format(candidate, 'yyyy-MM-dd');
    }
  }
  return null;
};
