// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { ColumnDef } from '@tanstack/react-table'

import { EnhancedDataTable } from '@/components/ui/enhanced-data-table'
import { SortableHeader } from '@/components/ui/sortable-header'
import {
  ReportSelectionProvider,
  SelectableBlock,
  useReportSelection,
  wiggleTiltDeg,
} from '@/components/reports/selection'

function SelectionHarness() {
  const { startSelecting, cancelSelecting } = useReportSelection()

  return (
    <>
      <button type="button" onClick={startSelecting}>
        Start selection
      </button>
      <button type="button" onClick={cancelSelecting}>
        Cancel selection
      </button>
      <SelectableBlock cardId="inventory-outlook-kpi">
        <div>Inventory outlook</div>
      </SelectableBlock>
    </>
  )
}

function StatefulChild() {
  const [sortCount, setSortCount] = React.useState(0)

  return (
    <div data-testid="stateful-child">
      <button type="button" onClick={() => setSortCount((count) => count + 1)}>
        Sort count {sortCount}
      </button>
    </div>
  )
}

function LifecycleHarness() {
  const { startSelecting, cancelSelecting } = useReportSelection()

  return (
    <>
      <button type="button" onClick={startSelecting}>Start lifecycle selection</button>
      <button type="button" onClick={cancelSelecting}>End lifecycle selection</button>
      <SelectableBlock cardId="operations-unavailable-episodes">
        <StatefulChild />
      </SelectableBlock>
    </>
  )
}

function OptionsHarness() {
  const { startSelecting, cardOptions } = useReportSelection()
  const [years, setYears] = React.useState(['2026'])

  return (
    <>
      <button type="button" onClick={startSelecting}>Start options selection</button>
      <button type="button" onClick={() => setYears(['2026', '2025'])}>Mount current options</button>
      <output data-testid="captured-options">{JSON.stringify(cardOptions)}</output>
      <SelectableBlock
        cardId="procurement-seasonal-inbound-weight"
        options={{ yearMode: 'selected', years }}
      >
        <div>Seasonal card</div>
      </SelectableBlock>
    </>
  )
}

interface TableRow {
  name: string
  value: number
}

const tableColumns: ColumnDef<TableRow>[] = [
  { accessorKey: 'name', header: 'Name', size: 180 },
  {
    accessorKey: 'value',
    header: ({ column }) => <SortableHeader column={column}>Value</SortableHeader>,
    size: 100,
  },
]

function TableSelectionHarness() {
  const { startSelecting, cancelSelecting, cardOptions } = useReportSelection()
  const [view, setView] = React.useState<Parameters<
    NonNullable<React.ComponentProps<typeof EnhancedDataTable<TableRow>>['onViewStateChange']>
  >[0] | null>(null)
  const data = React.useMemo(
    () => Array.from({ length: 12 }, (_, index) => ({
      name: `Item ${index + 1}`,
      value: index + 1,
    })),
    []
  )

  return (
    <>
      <button type="button" onClick={startSelecting}>Start table selection</button>
      <button type="button" onClick={cancelSelecting}>End table selection</button>
      <output data-testid="table-view">{JSON.stringify(view)}</output>
      <output data-testid="table-options">{JSON.stringify(cardOptions)}</output>
      <SelectableBlock
        cardId="operations-rationing-history"
        options={view ?? undefined}
      >
        <EnhancedDataTable
          columns={tableColumns}
          data={data}
          enableFiltering={false}
          enableColumnVisibility={false}
          defaultPageSize={5}
          onViewStateChange={setView}
        />
      </SelectableBlock>
    </>
  )
}

describe('report selection motion', () => {
  test('uses ZEV-paced staggering and stops motion after selection', () => {
    render(
      <ReportSelectionProvider>
        <SelectionHarness />
      </ReportSelectionProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start selection' }))

    const block = screen.getByRole('checkbox', {
      name: 'Select report block inventory-outlook-kpi',
    })
    expect(block).toHaveClass('report-selectable')
    expect(block.style.getPropertyValue('--report-wiggle-delay')).toBe('60ms')
    expect(block.style.getPropertyValue('--report-wiggle-duration')).toBe('895ms')

    fireEvent.click(block)

    expect(block).not.toHaveClass('report-selectable')
    expect(block).toHaveClass('report-selectable-selected')
    expect(block.style.getPropertyValue('--report-wiggle-delay')).toBe('')
    expect(block.style.getPropertyValue('--report-wiggle-duration')).toBe('')
  })

  test('keeps stateful card content mounted and clears inert after selection', () => {
    render(
      <ReportSelectionProvider>
        <LifecycleHarness />
      </ReportSelectionProvider>
    )

    const childBefore = screen.getByTestId('stateful-child')
    fireEvent.click(screen.getByRole('button', { name: 'Sort count 0' }))
    expect(screen.getByRole('button', { name: 'Sort count 1' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Start lifecycle selection' }))
    const childDuring = screen.getByTestId('stateful-child')
    expect(childDuring).toBe(childBefore)
    expect(childDuring.parentElement).toHaveProperty('inert', true)

    fireEvent.click(screen.getByRole('button', { name: 'End lifecycle selection' }))
    const childAfter = screen.getByTestId('stateful-child')
    expect(childAfter).toBe(childBefore)
    expect(childAfter.parentElement).toHaveProperty('inert', false)
    expect(screen.getByRole('button', { name: 'Sort count 1' })).toBeVisible()
  })

  test('captures a card option when that visible card is selected', () => {
    render(
      <ReportSelectionProvider>
        <OptionsHarness />
      </ReportSelectionProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start options selection' }))
    expect(screen.getByTestId('captured-options')).toHaveTextContent('{}')

    // Simulates switching to a previously unmounted lens after selection mode
    // began. The option visible at card-selection time is the one the report
    // must preserve, not the stale value that existed on the first lens.
    fireEvent.click(screen.getByRole('button', { name: 'Mount current options' }))
    fireEvent.click(screen.getByRole('checkbox', {
      name: 'Select report block procurement-seasonal-inbound-weight',
    }))

    expect(screen.getByTestId('captured-options')).toHaveTextContent(
      '"years":["2026","2025"]'
    )
  })

  test('keeps a sorted, paged table view through selection and captures it', async () => {
    render(
      <ReportSelectionProvider>
        <TableSelectionHarness />
      </ReportSelectionProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Value' }))
    fireEvent.click(screen.getByRole('link', { name: 'Go to next page' }))
    await waitFor(() => {
      expect(screen.getByTestId('table-view')).toHaveTextContent('"pageIndex":1')
      expect(screen.getByTestId('table-view')).toHaveTextContent(
        '"sort":{"id":"value","desc":false}'
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start table selection' }))
    fireEvent.click(screen.getByRole('checkbox', {
      name: 'Select report block operations-rationing-history',
    }))
    expect(screen.getByTestId('table-options')).toHaveTextContent('"pageIndex":1')
    expect(screen.getByTestId('table-options')).toHaveTextContent(
      '"sort":{"id":"value","desc":false}'
    )

    fireEvent.click(screen.getByRole('button', { name: 'End table selection' }))
    expect(screen.getByTestId('table-view')).toHaveTextContent('"pageIndex":1')
    fireEvent.click(screen.getByRole('button', { name: 'Value' }))
    await waitFor(() => {
      expect(screen.getByTestId('table-view')).toHaveTextContent(
        '"sort":{"id":"value","desc":true}'
      )
    })
  })
})

/**
 * Wide blocks tilt less.
 *
 * A rotation about the centre throws the far corner further the wider the
 * element is, so a fixed angle makes a full-width table sway several times as
 * far as a half-width card. Tables used to be held still to avoid that, which
 * read as "this one isn't selectable"; scaling the angle keeps one affordance
 * for everything.
 */
describe('wiggle amplitude', () => {
  test('holds the visible sweep roughly constant across block widths', () => {
    // What is actually held steady is corner displacement, ~ width × sin(tilt).
    const sweep = (width: number) =>
      width * Math.sin((wiggleTiltDeg(width) * Math.PI) / 180)

    expect(sweep(1120) / sweep(560)).toBeLessThan(1.15)
  })

  test('a wide table tilts less than a narrow card', () => {
    expect(wiggleTiltDeg(1200)).toBeLessThan(wiggleTiltDeg(400))
  })

  test('never damps below a perceptible tilt, however wide the block', () => {
    expect(wiggleTiltDeg(6000)).toBeGreaterThanOrEqual(0.5)
  })

  test('never exceeds the original amplitude on a narrow block', () => {
    // Without the ceiling a narrow card would tilt further than the design
    // ever called for, which looks like a glitch rather than an invitation.
    expect(wiggleTiltDeg(120)).toBe(1.6)
  })

  test('falls back to the base tilt before the block has been measured', () => {
    // ResizeObserver has not fired on the first paint, and jsdom reports 0.
    expect(wiggleTiltDeg(0)).toBe(1.6)
    expect(wiggleTiltDeg(Number.NaN)).toBe(1.6)
  })
})
