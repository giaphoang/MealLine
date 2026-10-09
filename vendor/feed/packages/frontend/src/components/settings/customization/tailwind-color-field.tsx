// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { PaletteEntry } from '@/services/brand';
import { cn } from '@/lib/utils';

type Nearby = { name: string; family: string; stop: number; color: string };

type TailwindColorFieldProps = {
  /** The stop currently in use, already snapped. */
  value: string | null;
  /** Neighbouring families at a similar colour, from the preview. */
  nearby: Nearby[];
  palette: PaletteEntry[];
  onSelect: (entry: PaletteEntry) => void;
  disabled?: boolean;
  label: string;
};

const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/**
 * A brand colour control that can only produce a Tailwind stop.
 *
 * There is deliberately no long scrolling grid in here. An earlier version
 * listed all 26 families as a 286-cell wall, which had to scroll — and a
 * scroll region inside a popover that is portalled out of a Dialog does not
 * respond to the wheel, because Radix Dialog locks background scrolling with
 * `react-remove-scroll` and the portalled panel counts as background. Nothing
 * short of re-parenting the portal or reaching into that lock fixes it.
 *
 * Choosing the family first and then its weight is both the way round the
 * problem and the better interaction: it is how Tailwind is actually used, it
 * is two small decisions instead of scanning a wall of swatches, and the
 * family list is a native `<select>` whose menu the browser draws outside the
 * page entirely — so the scroll lock cannot reach it.
 *
 * The wizard used a native `<input type="color">` and a hex field. Both are
 * RGB instruments in a project whose theme is entirely Tailwind palette
 * references, and both were lying about the outcome: whatever was picked got
 * snapped to the nearest stop, so the value on screen was an input, not the
 * colour in use.
 *
 * Constraint is the feature here, not a limitation. There are 288 stops, they
 * are already contrast-checked as a set, and a logo-derived colour lands
 * somewhere arbitrary between them. Offering the neighbouring families first
 * turns an open-ended decision into a handful of defensible ones; the full
 * grid is there when someone wants a different family entirely. No path
 * through this control can produce a colour that is not in the palette.
 */
export function TailwindColorField({
  value,
  nearby,
  palette,
  onSelect,
  disabled,
  label,
}: TailwindColorFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [family, setFamily] = React.useState(() => value?.replace(/-\d+$/, '') ?? 'emerald');
  React.useEffect(() => {
    if (value) setFamily(value.replace(/-\d+$/, ''));
  }, [value]);

  const byName = React.useMemo(
    () => new Map(palette.map((entry) => [entry.name, entry])),
    [palette]
  );
  const families = React.useMemo(() => {
    const seen: string[] = [];
    for (const entry of palette) if (!seen.includes(entry.family)) seen.push(entry.family);
    return seen;
  }, [palette]);

  const current = value ? byName.get(value) ?? null : null;
  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return palette.filter((entry) => entry.name.includes(needle)).slice(0, 24);
  }, [palette, query]);

  const choose = (entry: PaletteEntry | undefined) => {
    if (!entry) return;
    onSelect(entry);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${label} — choose a Tailwind color`}
            className="flex min-w-0 items-center gap-2 rounded-md border border-input px-2 py-1.5 text-left disabled:opacity-50"
          >
            <span
              aria-hidden
              className="h-5 w-5 shrink-0 rounded border border-border"
              style={{ background: current?.color ?? 'transparent' }}
            />
            <span className="truncate font-mono text-sm">{value ?? 'choose a color'}</span>
          </button>
        </PopoverTrigger>
        {/*
          * The full grid is taller than a laptop viewport, so the popover has
          * to be told it cannot simply be as tall as its content. Radix will
          * flip it to whichever side has more room, but flipping an
          * over-tall panel only moves which end gets cut off — the header
          * scrolled off the top, or the last colour families off the bottom.
          *
          * `--radix-popover-content-available-height` is the space actually
          * left on the chosen side. Capping to it and scrolling inside keeps
          * the whole control reachable at any window height. The chooser rows
          * stay pinned; only the family grid scrolls, so the search field and
          * the suggested colours never leave the screen.
          */}
        <PopoverContent
          align="start"
          collisionPadding={12}
          className="flex max-h-[var(--radix-popover-content-available-height)] w-80 flex-col gap-3 overflow-y-auto"
        >
          {nearby.length > 0 ? (
            <div className="shrink-0 space-y-1.5">
              <Label className="text-xs">Closest to your logo color</Label>
              <div className="flex flex-wrap gap-1.5">
                {nearby.map((option) => (
                  <button
                    key={option.name}
                    type="button"
                    title={option.name}
                    aria-label={option.name}
                    onClick={() => choose(byName.get(option.name))}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
                      option.name === value ? 'border-ring ring-2 ring-ring' : 'border-input'
                    )}
                  >
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 rounded-sm border border-border"
                      style={{ background: option.color }}
                    />
                    <span className="font-mono">{option.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="shrink-0 space-y-1.5">
            <Label htmlFor={`palette-search-${label}`} className="text-xs">
              Search the palette
            </Label>
            <Input
              id={`palette-search-${label}`}
              value={query}
              placeholder="emerald-600"
              className="h-8 font-mono text-xs"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  choose(byName.get(query.trim().toLowerCase()) ?? matches[0]);
                }
              }}
            />
            {matches.length > 0 ? (
              <div className="max-h-32 overflow-y-auto rounded-md border">
                {matches.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => choose(entry)}
                    className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-accent"
                  >
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 rounded-sm border border-border"
                      style={{ background: entry.color }}
                    />
                    <span className="font-mono">{entry.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 space-y-1.5">
            <Label htmlFor={`palette-family-${label}`} className="text-xs">
              Or pick a family and weight
            </Label>
            <select
              id={`palette-family-${label}`}
              value={family}
              onChange={(event) => setFamily(event.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              {families.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <div className="flex gap-1">
              {STOPS.map((stop) => {
                const entry = byName.get(`${family}-${stop}`);
                if (!entry) return <span key={stop} className="h-7 flex-1" />;
                return (
                  <button
                    key={stop}
                    type="button"
                    title={entry.name}
                    aria-label={entry.name}
                    onClick={() => choose(entry)}
                    style={{ background: entry.color }}
                    className={cn(
                      'h-7 flex-1 rounded-sm border',
                      entry.name === value
                        ? 'border-foreground ring-1 ring-foreground'
                        : 'border-border/50'
                    )}
                  />
                );
              })}
            </div>
            <div className="flex gap-1 text-[9px] text-muted-foreground">
              {STOPS.map((stop) => (
                <span key={stop} className="flex-1 text-center">{stop}</span>
              ))}
            </div>
          </div>

        </PopoverContent>
      </Popover>
    </div>
  );
}
