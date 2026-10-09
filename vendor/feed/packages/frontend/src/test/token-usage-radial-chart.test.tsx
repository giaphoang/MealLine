// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// @vitest-environment jsdom

/**
 * The usage gauge when there is no limit to draw against.
 *
 * Its guard was `typeof maxValue === 'number' ? maxValue : 100`, which caught
 * only non-numbers — so a zero passed straight through to
 * `Math.min(100, (current / max) * 100)`, `0 / 0` gave NaN, and that NaN
 * became `endAngle={180 + (360 * (NaN / 100))}`. The arc broke and the label
 * read "of 0 TPM".
 *
 * That mattered because the callers were removing invented rate limits: a
 * configuration with none set now reports zero, and this component is the
 * thing that has to say so. Fixing the callers without fixing this would have
 * traded a false number for a broken chart.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { TokenUsageRadialChart } from '@/components/dashboard/token-usage/TokenUsageRadialChart';

/**
 * Recharts renders nothing at zero size, and jsdom gives every element zero
 * size — so a chart test that does not force dimensions asserts against an
 * empty container and passes whatever the component does. The neighbouring
 * `service-bucket-labels.test.tsx` records having verified exactly that: its
 * first version passed with the bug reintroduced. Same remedy here.
 */
const WIDTH = 800;
const HEIGHT = 400;

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: WIDTH, height: HEIGHT } } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

for (const [property, value] of [
  ['offsetWidth', WIDTH],
  ['offsetHeight', HEIGHT],
  ['clientWidth', WIDTH],
  ['clientHeight', HEIGHT]
] as const) {
  Object.defineProperty(HTMLElement.prototype, property, { configurable: true, value });
}
Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return {
    width: WIDTH,
    height: HEIGHT,
    top: 0,
    left: 0,
    bottom: HEIGHT,
    right: WIDTH,
    x: 0,
    y: 0,
    toJSON: () => ({})
  } as DOMRect;
};

describe('the usage gauge with no limit configured', () => {
  test('says so, instead of claiming a ceiling of zero', () => {
    const { container } = render(
      <TokenUsageRadialChart title="Tokens Per Minute" currentValue={0} maxValue={0} label="TPM" />
    );

    expect(container.textContent).toContain('no limit set');
    expect(container.textContent).not.toContain('of 0');
  });

  test('renders no NaN anywhere', () => {
    // The whole point. NaN reached `endAngle` and the arc stopped drawing.
    const { container } = render(
      <TokenUsageRadialChart title="Tokens Per Minute" currentValue={0} maxValue={0} label="TPM" />
    );

    expect(container.innerHTML).not.toContain('NaN');
  });

  test('current usage is still shown, since that number is real', () => {
    // A configuration can have used tokens without having a limit set.
    const { container } = render(
      <TokenUsageRadialChart
        title="Tokens Per Minute"
        currentValue={1234}
        maxValue={0}
        label="TPM"
      />
    );

    expect(container.textContent).toContain('1,234');
    expect(container.textContent).toContain('no limit set');
  });
});

describe('the usage gauge with a real limit', () => {
  test('reports the limit and stays free of NaN', () => {
    const { container } = render(
      <TokenUsageRadialChart
        title="Tokens Per Minute"
        currentValue={50000}
        maxValue={200000}
        label="TPM"
      />
    );

    expect(container.textContent).toContain('50,000');
    expect(container.textContent).toContain('200,000');
    expect(container.textContent).not.toContain('no limit set');
    expect(container.innerHTML).not.toContain('NaN');
  });

  test('a non-numeric limit is treated as no limit, not as 100', () => {
    // The old fallback substituted 100, so a missing limit silently produced
    // a percentage against a ceiling of one hundred tokens.
    const { container } = render(
      <TokenUsageRadialChart
        title="Tokens Per Minute"
        currentValue={5}
        maxValue={undefined as unknown as number}
        label="TPM"
      />
    );

    expect(container.textContent).toContain('no limit set');
    expect(container.textContent).not.toContain('100');
  });
});
