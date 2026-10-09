// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * TEMPORARY — interactive calibration for the Tailwind palette evaluation.
 *
 * Each row is one colour literal from the built-in appearance: the authored
 * value, then the nearest palette entries. Choosing one applies it to the live
 * page immediately, so a candidate is judged against real UI rather than a
 * swatch. Export writes the choices in the exact shape
 * `packages/backend/scripts/tailwind-ab-overrides.json` expects.
 *
 * A side sheet rather than a centred dialog on purpose: the page has to stay
 * visible to judge a colour against it.
 *
 * Delete with the rest of the A/B scaffolding — see palette-ab-switcher.tsx.
 */

import * as React from 'react';
import { Check, Download, RotateCcw, SlidersHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { hexToOklch } from '@/lib/brand-color';
import { cn } from '@/lib/utils';
import candidates from '@/styles/tailwind-ab-candidates.json';

type Candidate = { name: string; hex: string; drift: number; auto: boolean };
type Row = {
  key: string;
  scope: 'light' | 'dark';
  token: string;
  alpha: number | null;
  authoredHex: string;
  chosen: string;
  overridden: boolean;
  candidates: Candidate[];
};

type PaletteEntry = { name: string; hex: string };

const DATA = candidates as {
  picks: Record<string, string>;
  palette: PaletteEntry[];
  rows: Row[];
};
const ROWS = DATA.rows;
/**
 * Picks written but not yet applied to index.css.
 *
 * Normally empty: applying consumes them. Seeding from here means a session
 * interrupted between export and apply resumes where it left off rather than
 * appearing to have lost the work.
 */
const PENDING_PICKS = DATA.picks ?? {};
const PALETTE = DATA.palette;
const PALETTE_BY_NAME = new Map(PALETTE.map((entry) => [entry.name, entry]));
const DATALIST_ID = 'palette-calibration-names';

/**
 * Perceptual distance between two hex colours, as plain Euclidean distance in
 * OKLab — the same measure the generator reports.
 *
 * Computed here rather than only read from the candidate list so a hand-entered
 * pick, which by definition is not in that list, still sorts and reports a real
 * figure instead of dropping out of the ordering.
 */
const driftBetween = (a: string, b: string): number => {
  const left = hexToOklch(a);
  const right = hexToOklch(b);
  if (!left || !right) return Number.NaN;
  const toLab = ({ l, c, h }: { l: number; c: number; h: number }) => {
    const rad = (h * Math.PI) / 180;
    return [l, c * Math.cos(rad), c * Math.sin(rad)] as const;
  };
  const [al, aa, ab] = toLab(left);
  const [bl, ba, bb] = toLab(right);
  return Math.hypot(al - bl, aa - ba, ab - bb);
};

export type SortMode = 'order' | 'drift-desc' | 'drift-asc';

/**
 * Order rows by how far the active pick sits from the authored colour.
 *
 * Pure and exported so the ordering is verifiable without driving a Radix
 * Select. A row whose drift cannot be computed sorts last in both directions
 * rather than NaN-poisoning the comparison — `NaN` compares false against
 * everything, which silently leaves an array in arbitrary order.
 */
export const sortByDrift = <T,>(
  rows: readonly T[],
  mode: SortMode,
  driftOf: (row: T) => number,
): T[] => {
  if (mode === 'order') return [...rows];
  const dir = mode === 'drift-desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const da = driftOf(a);
    const db = driftOf(b);
    if (Number.isNaN(da) && Number.isNaN(db)) return 0;
    if (Number.isNaN(da)) return 1;
    if (Number.isNaN(db)) return -1;
    return (da - db) * dir;
  });
};

const SORT_LABEL: Record<SortMode, string> = {
  order: 'Source order',
  'drift-desc': 'Deviation: high to low',
  'drift-asc': 'Deviation: low to high',
};
const STORAGE_KEY = 'feed.paletteCalibration';
const STYLE_ID = 'palette-calibration-overrides';

/** `light --feed-shell-haze#1` -> the token name the CSS declaration uses. */
const tokenOf = (key: string) => key.replace(/^(light|dark) --/, '').replace(/#\d+$/, '');

/**
 * Hand entry for a palette name the eight suggestions do not include.
 *
 * Validated against the full palette rather than accepted freehand: a typo
 * would otherwise resolve to `var(--color-nonsense)`, which CSS silently drops,
 * leaving the token at whatever it inherited and the operator wondering why
 * their choice did nothing.
 */
function CustomEntry({
  value,
  onChoose,
}: {
  value: string;
  onChoose: (name: string) => void;
}) {
  const [draft, setDraft] = React.useState('');
  const trimmed = draft.trim();
  const match = PALETTE_BY_NAME.get(trimmed);
  const invalid = trimmed.length > 0 && !match;

  const commit = () => {
    if (match) {
      onChoose(trimmed);
      setDraft('');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
        list={DATALIST_ID}
        spellCheck={false}
        placeholder="Type a palette name, e.g. sky-100"
        aria-label="Custom Tailwind palette value"
        aria-invalid={invalid}
        className={cn('h-8 flex-1 font-mono text-xs', invalid && 'border-destructive')}
      />
      <span
        className="h-8 w-8 shrink-0 rounded border"
        style={{ background: match?.hex ?? 'transparent' }}
        title={match ? `${match.name} ${match.hex}` : 'no preview'}
        aria-hidden="true"
      />
      <Button size="sm" variant="outline" onClick={commit} disabled={!match}>
        Use
      </Button>
    </div>
  );
}

export function PaletteCalibration() {
  const [open, setOpen] = React.useState(false);
  const [picks, setPicks] = React.useState<Record<string, string>>(PENDING_PICKS);
  const [filter, setFilter] = React.useState('');
  const [onlyChanged, setOnlyChanged] = React.useState(false);
  const [sort, setSort] = React.useState<SortMode>('order');

  React.useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      // An in-progress session layers over what is on disk, rather than
      // replacing it, so a partly-finished sitting never discards committed work.
      if (saved) setPicks({ ...PENDING_PICKS, ...JSON.parse(saved) });
    } catch {
      /* private browsing — the file overrides still stand */
    }
  }, []);

  // Apply picks as a stylesheet layered over the generated A/B sheet. Only rows
  // whose token has a single literal can be overridden live; a gradient or
  // shadow needs its whole value rebuilt, so those stay auto and are marked.
  React.useEffect(() => {
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    const byScope: Record<'light' | 'dark', string[]> = { light: [], dark: [] };
    for (const [key, name] of Object.entries(picks)) {
      if (/#\d+$/.test(key)) continue;
      const row = ROWS.find(r => r.key === key);
      if (!row) continue;
      const value = row.alpha === null
        ? `var(--color-${name})`
        : `color-mix(in oklab, var(--color-${name}) ${(row.alpha * 100).toFixed(1)}%, transparent)`;
      byScope[row.scope].push(`  --${tokenOf(key)}: ${value};`);
    }
    el.textContent = [
      // Mutually exclusive selectors, not `:root` and `.dark`.
      //
      // `:root` matches the html element whether or not `.dark` is stamped on
      // it, and the two carry equal specificity, so a light pick with no dark
      // counterpart bled straight through into dark mode — a sky-100 sidebar
      // accent appearing over a dark sidebar. `html:not(.dark)` cannot match at
      // the same time as `html.dark`, so a scope only ever applies to its own
      // theme however few tokens it carries.
      //
      // Both stay unlayered, so they beat index.css's tokens in @layer base
      // regardless of source order.
      byScope.light.length ? `html:not(.dark) {\n${byScope.light.join('\n')}\n}` : '',
      byScope.dark.length ? `html.dark {\n${byScope.dark.join('\n')}\n}` : '',
    ].filter(Boolean).join('\n\n');

    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
    } catch {
      /* not worth surfacing */
    }
  }, [picks]);

  /** Drift of whatever is currently selected, listed candidate or hand-entered. */
  const activeDrift = React.useCallback((row: Row) => {
    const active = picks[row.key] ?? row.chosen;
    const listed = row.candidates.find(c => c.name === active);
    if (listed) return listed.drift;
    const entry = PALETTE_BY_NAME.get(active);
    return entry ? driftBetween(row.authoredHex, entry.hex) : Number.NaN;
  }, [picks]);

  const visible = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = ROWS.filter(r => {
      if (onlyChanged && !picks[r.key]) return false;
      if (!q) return true;
      return r.key.toLowerCase().includes(q) || r.chosen.toLowerCase().includes(q);
    });
    return sortByDrift(rows, sort, activeDrift);
  }, [filter, onlyChanged, picks, sort, activeDrift]);

  const exportJson = () => {
    // What index.css does not already say. Applying consumes these.
    const out: Record<string, string> = {};
    for (const [key, name] of Object.entries(picks)) {
      const row = ROWS.find(r => r.key === key);
      if (row && row.chosen !== name) out[key] = name;
    }
    const blob = new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'palette-picks.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!import.meta.env.DEV) return null;

  /**
   * A change is a pick that differs from what index.css currently says.
   *
   * There is one count again. While overrides were permanent there were two
   * baselines — the committed value and the automatic match — and after the
   * migration those became the same thing, so the second count could only ever
   * report a difference that no longer existed.
   */
  const changed = Object.entries(picks)
    .filter(([k, v]) => ROWS.find((r) => r.key === k)?.chosen !== v).length;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Open palette calibration"
            className={cn(changed > 0 && 'text-primary')}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Palette calibration{changed > 0 ? ` (${changed} changed)` : ''}</TooltipContent>
      </Tooltip>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-xl">
          <SheetHeader className="space-y-1">
            <SheetTitle>Palette calibration</SheetTitle>
            <SheetDescription>
              Pick the Tailwind entry for each token. Choices apply to the page
              immediately. Export writes the overrides file.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter tokens…"
              className="h-8 flex-1"
            />
            <Select value={sort} onValueChange={(value) => setSort(value as SortMode)}>
              <SelectTrigger className="h-8 w-[190px]" aria-label="Sort tokens">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABEL) as SortMode[]).map((mode) => (
                  <SelectItem key={mode} value={mode}>{SORT_LABEL[mode]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={onlyChanged ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOnlyChanged((v) => !v)}
            >
              Changed {changed > 0 ? `(${changed})` : ''}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPicks(PENDING_PICKS)}
              disabled={changed === 0}
              title="Discard these picks and return to what index.css says"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </Button>
            <Button size="sm" onClick={exportJson} disabled={changed === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Export
            </Button>
          </div>

          <ScrollArea className="h-[calc(100vh-14rem)] pr-3">
            <div className="space-y-4">
              {visible.map((row) => {
                const active = picks[row.key] ?? row.chosen;
                const multi = /#\d+$/.test(row.key);
                return (
                  <div key={row.key} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs">{row.key}</p>
                        <p className="text-xs text-muted-foreground">
                          authored {row.authoredHex}
                          {row.alpha !== null && ` · alpha ${row.alpha}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{row.scope}</Badge>
                        {multi && (
                          <Badge variant="secondary" className="text-[10px]">auto only</Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="h-8 w-8 shrink-0 rounded border"
                        style={{ background: row.authoredHex }}
                        title={`authored ${row.authoredHex}`}
                        aria-hidden="true"
                      />
                      <span className="text-muted-foreground" aria-hidden="true">→</span>
                      {(PALETTE_BY_NAME.has(active) && !row.candidates.some(c => c.name === active)
                        ? [{
                            name: active,
                            hex: PALETTE_BY_NAME.get(active)!.hex,
                            drift: Number.NaN,
                            auto: false,
                          } as Candidate]
                        : []
                      ).concat(row.candidates).map((candidate) => {
                        const selected = candidate.name === active;
                        return (
                          <button
                            key={candidate.name}
                            type="button"
                            disabled={multi}
                            onClick={() => setPicks((p) => ({ ...p, [row.key]: candidate.name }))}
                            aria-pressed={selected}
                            title={
                              Number.isNaN(candidate.drift)
                                ? `${candidate.name} — hand-entered`
                                : `${candidate.name} — drift ${candidate.drift}`
                            }
                            className={cn(
                              'relative h-8 w-8 rounded border transition-all',
                              selected ? 'ring-2 ring-primary ring-offset-1' : 'hover:scale-110',
                              multi && 'cursor-not-allowed opacity-50',
                            )}
                            style={{ background: candidate.hex }}
                          >
                            {selected && (
                              <Check
                                className="absolute inset-0 m-auto h-4 w-4 drop-shadow"
                                style={{ color: candidate.drift > 0.5 ? '#fff' : '#000' }}
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {!multi && (
                      <CustomEntry
                        value={active}
                        onChoose={(name) => setPicks((p) => ({ ...p, [row.key]: name }))}
                      />
                    )}

                    <p className="font-mono text-[11px] text-muted-foreground">
                      {active}
                      {(() => {
                        const listed = row.candidates.find(c => c.name === active);
                        if (listed) {
                          return `${' · drift '}${listed.drift}${listed.auto ? ' · auto' : ''}`;
                        }
                        // Hand-entered and outside the suggested slate: still
                        // report a real figure rather than an opaque label.
                        const d = activeDrift(row);
                        return Number.isNaN(d)
                          ? ' · custom'
                          : ` · drift ${d.toFixed(4)} · custom`;
                      })()}
                    </p>
                  </div>
                );
              })}
              {visible.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No tokens match that filter.
                </p>
              )}
            </div>
          </ScrollArea>

          <datalist id={DATALIST_ID}>
            {PALETTE.map((entry) => (
              <option key={entry.name} value={entry.name} />
            ))}
          </datalist>
        </SheetContent>
      </Sheet>
    </>
  );
}
