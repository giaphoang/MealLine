// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "@/components/ui/icons"
import {
  DayButton,
  DayPicker,
  getDefaultClassNames,
} from "react-day-picker"

import { cn } from "@/lib/utils"
import {
  Button,
  buttonVariants,
  type ButtonProps,
} from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: ButtonProps["variant"]
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn(
        "group/calendar bg-transparent p-3 [--cell-size:2rem]",
        className
      )}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn(
          "flex w-full flex-col gap-4",
          defaultClassNames.month
        ),
        nav: cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "pointer-events-auto h-(--cell-size) w-(--cell-size) select-none p-0 aria-disabled:opacity-50",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "pointer-events-auto h-(--cell-size) w-(--cell-size) select-none p-0 aria-disabled:opacity-50",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "relative z-20 flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-md border border-input shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute inset-0 cursor-pointer bg-popover opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-medium",
          captionLayout === "label"
            ? "text-sm"
            : "flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-muted-foreground",
          defaultClassNames.caption_label
        ),
        month_grid: cn(
          "w-full border-collapse",
          defaultClassNames.month_grid
        ),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 select-none rounded-md text-[0.8rem] font-normal text-muted-foreground",
          defaultClassNames.weekday
        ),
        week: cn(
          "mt-2 flex w-full",
          defaultClassNames.week
        ),
        week_number_header: cn(
          "w-(--cell-size) select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "select-none text-[0.8rem] text-muted-foreground",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative h-full w-full select-none p-0 text-center aspect-square [&[data-selected=true]_button]:first:rounded-l-md [&[data-selected=true]_button]:last:rounded-r-md",
          defaultClassNames.day
        ),
        range_start: cn(
          "rounded-l-md bg-accent",
          defaultClassNames.range_start
        ),
        range_middle: cn(
          "rounded-none",
          defaultClassNames.range_middle
        ),
        range_end: cn(
          "rounded-r-md bg-accent",
          defaultClassNames.range_end
        ),
        today: cn(
          "rounded-md bg-accent text-accent-foreground data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className: rootClassName, rootRef, ...rootProps }) => (
          <div
            data-slot="calendar"
            ref={rootRef}
            className={cn(rootClassName)}
            {...rootProps}
          />
        ),
        Chevron: ({ className: chevronClassName, orientation, ...chevronProps }) => {
          const Icon = orientation === "left"
            ? ChevronLeft
            : orientation === "right"
              ? ChevronRight
              : ChevronDown
          return (
            <Icon
              className={cn("h-4 w-4", chevronClassName)}
              {...chevronProps}
            />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...weekNumberProps }) => (
          <td {...weekNumberProps}>
            <div className="flex h-(--cell-size) w-(--cell-size) items-center justify-center text-center">
              {children}
            </div>
          </td>
        ),
        ...components,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()
  const ref = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected
        && !modifiers.range_start
        && !modifiers.range_end
        && !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "flex h-auto min-w-(--cell-size) w-full flex-col gap-1 self-stretch rounded-md p-0 font-normal leading-none aspect-square data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-start=true]:rounded-l-md data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:rounded-r-md data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none! data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 dark:hover:text-accent-foreground [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
