// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runThemeTransition } from '@/lib/theme-transition';
import { cn } from '@/lib/utils';

/**
 * The deliberate three-way choice, kept out of the header.
 *
 * The header control is a two-state toggle, which reaches all three states but
 * arrives at "follow this device" rather than offering it. This is where
 * someone can choose it outright — a settings panel has the room and the
 * context for an explicit choice that a header button does not.
 *
 * Unlike everything else on the Settings page, this is **not** organization
 * shared state: it is stored in this browser only, and the heading says so.
 * Nothing here is written to the server, so two staff members on the same
 * account can read FEED in different themes.
 */
const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Follow this device', icon: Monitor },
] as const;

export function AppearanceSetting() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Before next-themes has read the stored value there is no honest selection
  // to show, so no option is marked current rather than guessing one.
  const selected = mounted ? (theme ?? 'system') : null;

  return (
    <div role="radiogroup" aria-label="Appearance" className="flex flex-wrap gap-2">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const isSelected = selected === value;
        return (
          <Button
            key={value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            variant={isSelected ? 'default' : 'outline'}
            disabled={!mounted}
            onClick={(event) => {
              if (isSelected) return;
              void runThemeTransition({
                trigger: event.currentTarget,
                update: () => setTheme(value),
              });
            }}
            className={cn('gap-2', isSelected && 'pointer-events-none')}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Button>
        );
      })}
    </div>
  );
}
