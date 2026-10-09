// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

export type DayOfWeek =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export type OperatingHours = Record<DayOfWeek, {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}>;

export interface OperatingHoursSettings {
  revisionId: number | null;
  effectiveDate: string;
  timezone: string;
  hours: OperatingHours;
  updatedAt: string | null;
}

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
  effectiveDate: '1970-01-01',
  timezone: 'America/Los_Angeles',
  hours: DEFAULT_OPERATING_HOURS,
  updatedAt: null,
};
