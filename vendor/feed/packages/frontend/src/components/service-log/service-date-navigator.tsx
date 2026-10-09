// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { ChevronLeft, ChevronRight } from '@/components/ui/icons';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatLongOrdinalDate } from '@/lib/formatting/date';
import type { OperatingHours } from '@/types/settings';
import { adjacentOperatingDate } from './service-date';

interface ServiceDateNavigatorProps {
  value: string;
  today: string;
  hours: OperatingHours;
  onChange: (date: string) => void;
}

export function ServiceDateNavigator({
  value,
  today,
  hours,
  onChange,
}: ServiceDateNavigatorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const previousDate = adjacentOperatingDate(value, -1, hours);
  const nextDate = adjacentOperatingDate(value, 1, hours);
  const selectedDate = parseISO(value);
  const todayDate = parseISO(today);
  const formattedDate = formatLongOrdinalDate(value);
  const displayValue = value === today ? `Today · ${formattedDate}` : formattedDate;

  return (
    <div className="space-y-2">
      <Label>Service Date</Label>
      <div className="flex w-full max-w-sm items-center">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 rounded-r-none"
          aria-label="Previous service day"
          disabled={previousDate === null}
          onClick={() => previousDate && onChange(previousDate)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>

        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="-ml-px min-w-0 flex-1 rounded-none px-3"
              aria-label={`Choose service date, ${displayValue}`}
            >
              <CalendarDays className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate" aria-live="polite">{displayValue}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[262px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-border/70 bg-background/80 p-0 shadow-xl backdrop-blur-[14px] backdrop-saturate-150 supports-backdrop-filter:bg-background/90"
            align="start"
          >
            <Calendar
              className="mx-auto"
              mode="single"
              captionLayout="dropdown"
              selected={selectedDate}
              onSelect={(date) => {
                if (!date) return;
                onChange(format(date, 'yyyy-MM-dd'));
                setIsOpen(false);
              }}
              numberOfMonths={1}
              defaultMonth={selectedDate}
              startMonth={new Date(2017, 0, 1)}
              endMonth={todayDate}
              disabled={{ after: todayDate }}
              today={todayDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="-ml-px shrink-0 rounded-l-none"
          aria-label="Next service day"
          disabled={nextDate === null || nextDate > today}
          onClick={() => nextDate && onChange(nextDate)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
