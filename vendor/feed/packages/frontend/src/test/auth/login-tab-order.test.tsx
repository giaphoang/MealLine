// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { LoginPage } from '@/components/auth/login-page';

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

/**
 * Magic Link leads sign-in; Verification Code is the fallback.
 *
 * The order is also a correctness constraint, not only a preference.
 * `TabsContents` slides the panel strip to `activeIndex * -100%`, where the
 * index comes from the *panel* order — not the trigger order. The two lists
 * were previously reversed relative to each other, so selecting the left tab
 * animated the strip rightwards, away from the tab that was just clicked.
 * These assertions fail if either list is reordered without the other.
 */
describe('LoginPage — tab order', () => {
  const labels = (elements: HTMLElement[]) =>
    elements.map(element => element.textContent?.trim());

  it('offers Magic Link first, and selects it by default', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    const tabs = screen.getAllByRole('tab');

    expect(labels(tabs)).toEqual(['Magic Link', 'Verification Code']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('orders the panels to match the triggers', () => {
    // Read from the source rather than the DOM: Radix mounts only the active
    // panel, so the rendered tree never shows the panel order. `TabsContents`
    // indexes its React children, so the JSX order *is* the animation order.
    const source = readFileSync(
      join(__dirname, '..', '..', 'components', 'auth', 'login-page.tsx'),
      'utf8'
    );

    const valuesOf = (tag: string) =>
      [...source.matchAll(new RegExp(`<${tag}\\s+value="([^"]+)"`, 'g'))].map(match => match[1]);

    const triggers = valuesOf('TabsTrigger');
    const panels = valuesOf('TabsContent');

    expect(triggers).toEqual(['magic', 'otp']);
    // If the panels are ever reversed relative to the triggers, the strip
    // animates away from the tab that was clicked.
    expect(panels).toEqual(triggers);
  });
});
