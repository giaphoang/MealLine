// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';

/**
 * Tooltips list series in the order the reader sees them.
 *
 * Recharts hands the payload over in series-declaration order. On a chart of
 * overlapping lines that is the order they appear in the source, not the order
 * they stack on screen, so the tooltip reads as the inverse of the picture —
 * Other Donations Over Time put a 1,543 lb source above a 6,480 lb one.
 *
 * The sort is opt-in rather than automatic because it is not always right: a
 * stacked chart's payload order *is* its stack order, and re-ordering it breaks
 * the correspondence between the list and the bar the reader is pointing at.
 */

const config = {
  small: { label: 'Other Donors', color: '#111' },
  large: { label: 'CFAP', color: '#222' },
  middle: { label: 'Individual Donors', color: '#333' },
};

// Declaration order, deliberately not value order — this is what Recharts hands over.
const payload = [
  { dataKey: 'small', name: 'small', value: 1543, color: '#111', payload: {} },
  { dataKey: 'large', name: 'large', value: 6480, color: '#222', payload: {} },
  { dataKey: 'middle', name: 'middle', value: 336, color: '#333', payload: {} },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any[];

const renderTooltip = (props: Record<string, unknown>) =>
  render(
    <ChartContainer config={config}>
      <div>
        <ChartTooltipContent active payload={payload} label="August 2020" {...props} />
      </div>
    </ChartContainer>
  );

/** The series names in the order they were rendered into the tooltip. */
const renderedOrder = () =>
  Object.values(config)
    .map(entry => ({ label: entry.label, node: screen.queryByText(entry.label) }))
    .filter((entry): entry is { label: string; node: HTMLElement } => entry.node !== null)
    .sort((left, right) =>
      left.node.compareDocumentPosition(right.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    )
    .map(entry => entry.label);

describe('ChartTooltipContent ordering', () => {
  it('lists the largest value first when sorting is on', () => {
    renderTooltip({ sortByValue: true });
    expect(renderedOrder()).toEqual(['CFAP', 'Other Donors', 'Individual Donors']);
  });

  it('keeps declaration order by default, so a stacked chart still matches its bar', () => {
    renderTooltip({});
    expect(renderedOrder()).toEqual(['Other Donors', 'CFAP', 'Individual Donors']);
  });
});

describe('the charts that opted in', () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, '..', ...parts), 'utf8');

  /**
   * Guards the audit, not the mechanism.
   *
   * These charts draw several independent series that overlap or sit side by
   * side, so the reader is comparing magnitudes and the list has to agree with
   * the picture. Dropping the flag from one of them is a silent regression —
   * the tooltip still renders, just in the wrong order.
   */
  const MULTI_SERIES_CHARTS: [string[], string][] = [
    [['components', 'analytics', 'index.tsx'], 'Inbound Weight Over Time'],
    [['components', 'analytics', 'donor-analytics.tsx'], 'Fresh Food Alliance Donations Over Time'],
    [['components', 'operational-reports', 'index.tsx'], 'Available Assortment Over Time'],
  ];

  for (const [parts, chart] of MULTI_SERIES_CHARTS) {
    it(`${parts[parts.length - 1]} still sorts its overlapping series (${chart})`, () => {
      expect(read(...parts)).toContain('<ChartTooltipContent sortByValue');
    });
  }

  it('Queue Volume, Call Milestones, Service Over Time, and How Service Was Delivered sort', () => {
    const source = read('components', 'analytics', 'service-analytics.tsx');
    expect(source.match(/<ChartTooltipContent\s+sortByValue/g)).toHaveLength(4);
  });

  it('leaves the stacked charts in stack order', () => {
    // Demographics Questions Response Rate stacks answered onto not-answered; sorting
    // would list them in an order that flips per row against a fixed bar.
    const clients = read('components', 'analytics', 'client-analytics.tsx');
    const stacked = clients.slice(clients.indexOf('Demographics Questions Response Rate'));
    expect(stacked).toContain('<ChartTooltipContent />');
    expect(stacked).not.toContain('sortByValue');
  });
});
