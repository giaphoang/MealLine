// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import {
  DateRangeControl,
} from '@/components/shared/date-range-control';
import { Calendar } from '@/components/ui/calendar';
import { dateRangeFromSearchParams } from '@/lib/date-range';

describe('DateRangeControl', () => {
  test('parses only complete, ordered custom ranges from the URL', () => {
    expect(
      dateRangeFromSearchParams(
        new URLSearchParams('range=custom&from=2025-06-10&to=2025-06-20')
      )
    ).toEqual({
      preset: 'custom',
      startDate: '2025-06-10',
      endDate: '2025-06-20',
    });
    expect(
      dateRangeFromSearchParams(
        new URLSearchParams('range=custom&from=2025-06-20&to=2025-06-10')
      )
    ).toEqual({ preset: 'last-90-days' });
  });

  test('renders one compact calendar with working month and year captions', () => {
    render(
      <DateRangeControl
        value={{ preset: 'last-90-days' }}
        onChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }));

    expect(screen.getAllByRole('grid')).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Choose the Month' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Choose the Year' })).toBeEnabled();
    expect(screen.getByRole('dialog')).toHaveClass(
      'w-[262px]',
      'overflow-hidden',
      'rounded-2xl',
      'border-border/70',
      'bg-background/80',
      'backdrop-blur-[14px]',
      'backdrop-saturate-150'
    );
    expect(screen.getByRole('grid').closest('[data-slot="calendar"]')).toHaveClass('mx-auto');
  });

  test('keeps typed dates and the applied custom range in sync', () => {
    const onChange = vi.fn();
    render(
      <DateRangeControl
        value={{ preset: 'last-90-days' }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }));
    const start = screen.getByRole('textbox', { name: 'Start' });
    const end = screen.getByRole('textbox', { name: 'End' });
    const apply = screen.getByRole('button', { name: 'Apply' });

    fireEvent.change(start, { target: { value: '2025-06-10' } });
    fireEvent.change(end, { target: { value: 'not-a-date' } });
    expect(apply).toBeDisabled();
    expect(end).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(end, { target: { value: '2025-06-20' } });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);

    expect(onChange).toHaveBeenCalledWith({
      preset: 'custom',
      startDate: '2025-06-10',
      endDate: '2025-06-20',
    });
  });
});

describe('shared Calendar', () => {
  test('marks range endpoints and middle days on its custom day buttons', () => {
    render(
      <Calendar
        mode="range"
        defaultMonth={new Date(2025, 5, 1)}
        selected={{
          from: new Date(2025, 5, 10),
          to: new Date(2025, 5, 12),
        }}
      />
    );

    const grid = screen.getByRole('grid', { name: 'June 2025' });
    expect(grid.closest('[data-slot="calendar"]')).toHaveClass('bg-transparent');
    expect(
      within(grid).getByRole('button', {
        name: 'Tuesday, June 10th, 2025, selected',
      })
    ).toHaveAttribute('data-range-start', 'true');
    expect(
      within(grid).getByRole('button', {
        name: 'Wednesday, June 11th, 2025, selected',
      })
    ).toHaveAttribute('data-range-middle', 'true');
    expect(
      within(grid).getByRole('button', {
        name: 'Thursday, June 12th, 2025, selected',
      })
    ).toHaveAttribute('data-range-end', 'true');
  });

  test('preserves the two-month range and single-date consumer shapes', () => {
    const { unmount } = render(
      <Calendar
        mode="range"
        defaultMonth={new Date(2025, 5, 1)}
        numberOfMonths={2}
      />
    );
    expect(screen.getAllByRole('grid')).toHaveLength(2);
    unmount();

    render(
      <Calendar
        mode="single"
        captionLayout="dropdown"
        defaultMonth={new Date(2025, 5, 1)}
        startMonth={new Date(2020, 0, 1)}
        endMonth={new Date(2030, 11, 1)}
      />
    );
    expect(screen.getByRole('grid', { name: 'June 2025' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Choose the Month' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Choose the Year' })).toBeEnabled();
  });
});
