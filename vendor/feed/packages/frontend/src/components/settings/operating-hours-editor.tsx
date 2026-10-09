// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DayOfWeek, OperatingHours } from '@/types/settings';

export const DAYS: Array<{ value: DayOfWeek; label: string }> = [
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
];

const TIMEZONE_GROUPS = [
  {
    label: 'North America',
    options: [
      ['America/New_York', 'Eastern Time'],
      ['America/Chicago', 'Central Time'],
      ['America/Denver', 'Mountain Time'],
      ['America/Los_Angeles', 'Pacific Time'],
      ['America/Anchorage', 'Alaska Time'],
      ['Pacific/Honolulu', 'Hawaii Time'],
    ],
  },
  {
    label: 'Europe & Africa',
    options: [
      ['Europe/London', 'London'],
      ['Europe/Paris', 'Central European Time'],
      ['Europe/Athens', 'Eastern European Time'],
      ['Europe/Lisbon', 'Lisbon'],
      ['Africa/Maputo', 'Central Africa Time'],
      ['Africa/Nairobi', 'East Africa Time'],
    ],
  },
  {
    label: 'Asia',
    options: [
      ['Europe/Moscow', 'Moscow Time'],
      ['Asia/Kolkata', 'India Time'],
      ['Asia/Shanghai', 'China Time'],
      ['Asia/Tokyo', 'Japan Time'],
      ['Asia/Seoul', 'Korea Time'],
      ['Asia/Jakarta', 'Western Indonesia Time'],
    ],
  },
  {
    label: 'Australia & Pacific',
    options: [
      ['Australia/Perth', 'Australian Western Time'],
      ['Australia/Adelaide', 'Australian Central Time'],
      ['Australia/Sydney', 'Australian Eastern Time'],
      ['Pacific/Auckland', 'New Zealand Time'],
      ['Pacific/Fiji', 'Fiji Time'],
    ],
  },
  {
    label: 'South America',
    options: [
      ['America/Argentina/Buenos_Aires', 'Argentina Time'],
      ['America/La_Paz', 'Bolivia Time'],
      ['America/Sao_Paulo', 'Brasilia Time'],
      ['America/Santiago', 'Chile Time'],
    ],
  },
] as const;

interface OperatingHoursEditorProps {
  hours: OperatingHours;
  timezone: string;
  onChange: (hours: OperatingHours) => void;
  onTimezoneChange: (timezone: string) => void;
  disabled?: boolean;
}

export function OperatingHoursEditor({
  hours,
  timezone,
  onChange,
  onTimezoneChange,
  disabled = false,
}: OperatingHoursEditorProps) {
  const updateDay = (
    day: DayOfWeek,
    update: Partial<OperatingHours[DayOfWeek]>
  ) => {
    onChange({
      ...hours,
      [day]: { ...hours[day], ...update },
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="operating-hours-timezone">Timezone</Label>
        <Select
          value={timezone}
          onValueChange={onTimezoneChange}
          disabled={disabled}
        >
          <SelectTrigger id="operating-hours-timezone" className="w-full sm:max-w-md">
            <SelectValue placeholder="Select a timezone" />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONE_GROUPS.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.options.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="hidden grid-cols-[auto_minmax(7rem,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 px-3 text-sm font-medium text-muted-foreground sm:grid">
          <span>Open</span>
          <span>Day</span>
          <span>Opens</span>
          <span>Closes</span>
        </div>

        {DAYS.map(({ value, label }) => {
          const day = hours[value];
          const checkboxId = `operating-hours-${value}-open`;
          return (
            <div
              key={value}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border p-3 sm:grid-cols-[auto_minmax(7rem,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
            >
              <Checkbox
                id={checkboxId}
                checked={day.isOpen}
                onCheckedChange={(checked) => updateDay(value, { isOpen: checked === true })}
                disabled={disabled}
                aria-label={`${label} is open`}
              />
              <Label htmlFor={checkboxId} className="font-medium">{label}</Label>

              {day.isOpen ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor={`operating-hours-${value}-open-time`} className="text-xs text-muted-foreground sm:sr-only">
                      Opens
                    </Label>
                    <Input
                      id={`operating-hours-${value}-open-time`}
                      type="time"
                      value={day.openTime}
                      onChange={(event) => updateDay(value, { openTime: event.target.value })}
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`operating-hours-${value}-close-time`} className="text-xs text-muted-foreground sm:sr-only">
                      Closes
                    </Label>
                    <Input
                      id={`operating-hours-${value}-close-time`}
                      type="time"
                      value={day.closeTime}
                      onChange={(event) => updateDay(value, { closeTime: event.target.value })}
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>
                </>
              ) : (
                <p className="col-span-2 text-sm text-muted-foreground">Closed</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
