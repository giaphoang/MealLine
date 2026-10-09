// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// The header control is a two-state toggle that still reaches all three theme
// states. The interesting behaviour is the third one: toggling toward whatever
// the device would have chosen clears the stored override instead of writing
// it, which is what keeps "follow this device" reachable without a third
// button. See docs/frontend-services/theme-control.md.

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const setTheme = vi.fn();
const themeState = {
  theme: 'system' as string | undefined,
  resolvedTheme: 'dark' as string | undefined,
  systemTheme: 'dark' as string | undefined,
};

vi.mock('next-themes', () => ({
  useTheme: () => ({ ...themeState, setTheme }),
}));

// The View Transition wrapper is environment-dependent; the test cares that the
// theme update runs, not how it is animated.
vi.mock('@/lib/theme-transition', () => ({
  runThemeTransition: async ({ update }: { update: () => void }) => update(),
}));

import { ThemeSwitcher } from '@/components/theme-switcher';
import { AppearanceSetting } from '@/components/settings/appearance-setting';

beforeEach(() => {
  setTheme.mockClear();
  themeState.theme = 'system';
  themeState.resolvedTheme = 'dark';
  themeState.systemTheme = 'dark';
});

describe('header theme toggle', () => {
  test('offers one action rather than a three-way choice', () => {
    render(<ThemeSwitcher />);

    // The old control was a dropdown of radio items — two clicks and a
    // three-way decision for "make it stop being this".
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  test('names the action it will perform, not the widget it is', () => {
    render(<ThemeSwitcher />);
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
  });

  test('stores an override when it differs from the device', () => {
    // Device is dark and the screen is dark; switching to light is a real
    // override and has to be remembered.
    render(<ThemeSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  test('clears the override when toggling back toward the device', () => {
    // Screen is light because of a stored override, and the device is dark.
    // Toggling to dark must restore "follow this device" rather than pinning
    // dark — that is what makes the third state reachable from two buttons.
    themeState.theme = 'light';
    themeState.resolvedTheme = 'light';
    themeState.systemTheme = 'dark';

    render(<ThemeSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(setTheme).toHaveBeenCalledWith('system');
  });

  test('a stale override is self-healing in one click', () => {
    // Chose dark in winter; the device is light now and FEED is still dark.
    themeState.theme = 'dark';
    themeState.resolvedTheme = 'dark';
    themeState.systemTheme = 'light';

    render(<ThemeSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(setTheme).toHaveBeenCalledWith('system');
  });
});

describe('Settings appearance control', () => {
  test('keeps the deliberate three-way choice, including following the device', () => {
    render(<AppearanceSetting />);

    expect(screen.getByRole('radio', { name: /Light/ })).toBeVisible();
    expect(screen.getByRole('radio', { name: /Dark/ })).toBeVisible();
    expect(screen.getByRole('radio', { name: /Follow this device/ })).toBeVisible();
  });

  test('marks the stored selection, not the resolved one', () => {
    // Stored "system" while the device renders dark: the choice on record is
    // Follow this device, and Dark must not be shown as if it were chosen.
    themeState.theme = 'system';
    themeState.resolvedTheme = 'dark';

    render(<AppearanceSetting />);
    expect(screen.getByRole('radio', { name: /Follow this device/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Dark/ })).toHaveAttribute('aria-checked', 'false');
  });

  test('sets the chosen theme outright', () => {
    render(<AppearanceSetting />);
    fireEvent.click(screen.getByRole('radio', { name: /Light/ }));
    expect(setTheme).toHaveBeenCalledWith('light');
  });
});
