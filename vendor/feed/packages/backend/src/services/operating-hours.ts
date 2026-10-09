// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { z } from 'zod';
import prisma from '../db';
import {
  isValidTimeZone,
  localDateOf,
  localDateTimeUtc,
} from './inventory-analytics/timezone';

export const DAYS_OF_WEEK = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type DayOfWeek = typeof DAYS_OF_WEEK[number];

const timeSchema = z.string().regex(
  /^(?:[01]\d|2[0-3]):[0-5]\d$/,
  'Use a valid time in HH:mm format.'
);

export const dayScheduleSchema = z.object({
  isOpen: z.boolean(),
  openTime: timeSchema,
  closeTime: timeSchema,
}).strict().superRefine((day, context) => {
  if (day.isOpen && day.closeTime <= day.openTime) {
    context.addIssue({
      code: 'custom',
      path: ['closeTime'],
      message: 'Closing time must be later than opening time.',
    });
  }
});

export const operatingHoursSchema = z.object({
  sunday: dayScheduleSchema,
  monday: dayScheduleSchema,
  tuesday: dayScheduleSchema,
  wednesday: dayScheduleSchema,
  thursday: dayScheduleSchema,
  friday: dayScheduleSchema,
  saturday: dayScheduleSchema,
}).strict();

export const operatingHoursSettingsInputSchema = z.object({
  timezone: z.string().refine(isValidTimeZone, 'Choose a valid timezone.'),
  hours: operatingHoursSchema,
}).strict();

export type OperatingHours = z.infer<typeof operatingHoursSchema>;

export interface OperatingHoursSettings {
  revisionId: number | null;
  effectiveDate: string;
  timezone: string;
  hours: OperatingHours;
  updatedAt: string | null;
}

export type AppliedOperatingHoursRevision = OperatingHoursSettings & {
  revisionId: number;
  updatedAt: string;
};

export const OPERATING_HOURS_BASELINE_DATE = '1970-01-01';

export const DEFAULT_OPERATING_HOURS: OperatingHours = {
  sunday: { isOpen: false, openTime: '11:00', closeTime: '14:00' },
  monday: { isOpen: false, openTime: '11:00', closeTime: '14:00' },
  tuesday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
  wednesday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
  thursday: { isOpen: true, openTime: '11:00', closeTime: '14:00' },
  friday: { isOpen: false, openTime: '11:00', closeTime: '14:00' },
  saturday: { isOpen: false, openTime: '11:00', closeTime: '14:00' },
};

export const DEFAULT_OPERATING_HOURS_SETTINGS: OperatingHoursSettings = {
  revisionId: null,
  effectiveDate: OPERATING_HOURS_BASELINE_DATE,
  timezone: 'America/Los_Angeles',
  hours: DEFAULT_OPERATING_HOURS,
  updatedAt: null,
};

export function dayOfWeekForLocalDate(date: string): DayOfWeek {
  const dayIndex = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return DAYS_OF_WEEK[dayIndex];
}

export function serviceWindowForDate(
  date: string,
  settings: Pick<OperatingHoursSettings, 'timezone' | 'hours'>
): { start: Date; end: Date } | null {
  const day = settings.hours[dayOfWeekForLocalDate(date)];
  if (!day.isOpen) return null;
  return {
    start: localDateTimeUtc(date, day.openTime, settings.timezone),
    end: localDateTimeUtc(date, day.closeTime, settings.timezone),
  };
}

type OperatingHoursClient = Pick<typeof prisma, 'operatingHoursRevision'>;

const rowToSettings = (row: {
  id: number;
  effectiveDate: string;
  timezone: string;
  hours: unknown;
  recordedAt: Date;
}): AppliedOperatingHoursRevision => ({
  revisionId: row.id,
  effectiveDate: row.effectiveDate,
  timezone: row.timezone,
  hours: operatingHoursSchema.parse(row.hours),
  updatedAt: row.recordedAt.toISOString(),
});

const latestFirst = [
  { effectiveDate: 'desc' as const },
  { recordedAt: 'desc' as const },
  { id: 'desc' as const },
];

const chronological = [
  { effectiveDate: 'asc' as const },
  { recordedAt: 'asc' as const },
  { id: 'asc' as const },
];

export async function getOperatingHoursSettings(
  client: OperatingHoursClient = prisma
): Promise<OperatingHoursSettings> {
  const row = await client.operatingHoursRevision.findFirst({
    orderBy: latestFirst,
  });
  if (!row) {
    return {
      ...DEFAULT_OPERATING_HOURS_SETTINGS,
      hours: { ...DEFAULT_OPERATING_HOURS },
    };
  }

  return rowToSettings(row);
}

/**
 * Returns only revisions that can govern a date in the range: the latest
 * revision on/before the first date, plus the final correction for each later
 * effective date. Superseded same-day rows remain in the append-only ledger.
 */
export async function getAppliedOperatingHoursRevisions(
  startDate: string,
  endDate: string,
  client: OperatingHoursClient = prisma
): Promise<AppliedOperatingHoursRevision[]> {
  const rows = await client.operatingHoursRevision.findMany({
    where: { effectiveDate: { lte: endDate } },
    orderBy: chronological,
  });
  if (rows.length === 0) {
    return [{
      ...DEFAULT_OPERATING_HOURS_SETTINGS,
      revisionId: 0,
      updatedAt: new Date(0).toISOString(),
    }];
  }

  const latestByDate = new Map<string, AppliedOperatingHoursRevision>();
  for (const row of rows) {
    latestByDate.set(row.effectiveDate, rowToSettings(row));
  }
  const compacted = [...latestByDate.values()].sort(
    (a, b) => a.effectiveDate.localeCompare(b.effectiveDate)
  );
  const anchorIndex = compacted.findLastIndex(
    (revision) => revision.effectiveDate <= startDate
  );
  return compacted.slice(Math.max(0, anchorIndex));
}

export function operatingHoursRevisionForDate(
  date: string,
  revisions: AppliedOperatingHoursRevision[]
): AppliedOperatingHoursRevision {
  let applied = revisions[0];
  for (const revision of revisions) {
    if (revision.effectiveDate > date) break;
    applied = revision;
  }
  return applied;
}

export async function saveOperatingHoursSettings(
  input: unknown,
  client: OperatingHoursClient = prisma,
  now = new Date()
): Promise<OperatingHoursSettings> {
  const parsed = operatingHoursSettingsInputSchema.parse(input);
  const current = await getOperatingHoursSettings(client);
  if (
    current.revisionId !== null &&
    current.timezone === parsed.timezone &&
    JSON.stringify(current.hours) === JSON.stringify(parsed.hours)
  ) {
    return current;
  }

  const row = await client.operatingHoursRevision.create({
    data: {
      effectiveDate: localDateOf(now, parsed.timezone),
      timezone: parsed.timezone,
      hours: parsed.hours,
      revisionKind: 'updated',
    },
  });
  return rowToSettings(row);
}
