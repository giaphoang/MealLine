// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

// Historical community-donation analytics (D16).
//
// This is the agency's own pre-Primarius record — donations it received
// directly, before OFB's Fresh Alliance data begins. It is a distinct source
// system from the OFB cards and is kept on its own cards rather than blended
// into them (Model A), because its grain is monthly, not per-pickup.
//
// These cards measure donations as an ACTIVITY: they show weight *received*,
// honoring no exclusion flags. A donor's relayed pounds (New Seasons) are a
// real gift here even though the pass_through rule removes them from retained
// supply elsewhere. The two totals answer two different questions and are not
// meant to reconcile (D21) — the card says so, so no one reads a contradiction.

import { prefersReducedMotion } from '@/lib/reduced-motion'
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChevronDown } from 'lucide-react';
import { bucketLabeller, type BucketGranularity } from '@/lib/formatting/bucket-label';
import { FootnoteList } from '@/components/analytics/footnote';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { carbonCategoricalTheme, carbonTheme } from '@/lib/colors';
import { formatAxisNumber } from '@/lib/formatting/number';
import { SelectableBlock } from '@/components/reports/selection';
import type { ProcurementAnalytics } from '@/types/procurement';

// How many sources get their own name, color, bar, and line. The rest fold into
// one "Other Community sources" bucket. 12 keeps the line chart legible while
// naming every large partner; the folded tail — several small parishes among it
// — is never lost: it is itemized in the bucket's tooltip and every source stays
// individually selectable in the filter, so any one can be given its own line.
const COMMUNITY_NAMED_LIMIT = 12;
const OTHER_SOURCES_LABEL = 'Other Community sources';

const pounds = (hundredths: number) => Math.round(hundredths / 100);
const poundLabel = (hundredths: number) => `${pounds(hundredths).toLocaleString()} lb`;

/** CSS-safe key for a source name, for both the React key and the color var. */
function sourceKey(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `src_${slug || 'unnamed'}`;
}


interface CommunityAnalyticsProps {
  communitySources: ProcurementAnalytics['communitySources'];
  communityMonthlyWeight: ProcurementAnalytics['communityMonthlyWeight'];
  /** The grain those buckets carry, so the axis labels them correctly. */
  bucketGranularity?: BucketGranularity;
}

export function CommunityDonationAnalytics({
  communitySources,
  communityMonthlyWeight,
  bucketGranularity = 'month',
}: CommunityAnalyticsProps) {
  const safeSources = React.useMemo(() => communitySources ?? [], [communitySources]);
  const safeMonthly = React.useMemo(() => communityMonthlyWeight ?? [], [communityMonthlyWeight]);

  /**
   * Axis and tooltip label at the grain the buckets carry, through the guarded
   * shared labeller — a month formatter handed a day key throws inside
   * Recharts' render and unmounts the lens.
   */
  const [bucketLabel, tooltipLabel] = React.useMemo(() => {
    const all = safeMonthly.map((row) => row.bucket).sort();
    const spansYears = all.length === 0
      || all[0].slice(0, 4) !== all[all.length - 1].slice(0, 4);
    return [
      bucketLabeller(bucketGranularity, spansYears),
      bucketLabeller(bucketGranularity, spansYears),
    ];
  }, [bucketGranularity, safeMonthly]);

  // The mix card is the full roster (everyone who ever donated). The
  // time-series scope to NON-Fresh-Alliance sources, because a partner's
  // pre-2023 timeline is shown on the Fresh Alliance Donations Over Time card
  // instead -- showing it here too would draw the same line twice.
  const partnerNames = React.useMemo(
    () => new Set(safeSources.filter((s) => s.isFreshAlliancePartner).map((s) => s.sourceName)),
    [safeSources]
  );
  const timeSeriesSources = React.useMemo(
    () => safeSources.filter((source) => !source.isFreshAlliancePartner),
    [safeSources]
  );
  const timeSeriesMonthly = React.useMemo(
    () => safeMonthly.filter((entry) => !partnerNames.has(entry.sourceName)),
    [safeMonthly, partnerNames]
  );

  // The mix card names the heaviest sources across the full roster.
  const { named, foldedNames, hasOther } = React.useMemo(() => {
    const namedSources = safeSources.slice(0, COMMUNITY_NAMED_LIMIT);
    const folded = safeSources.slice(COMMUNITY_NAMED_LIMIT);
    return {
      named: namedSources,
      foldedNames: new Set(folded.map((source) => source.sourceName)),
      hasOther: folded.length > 0,
    };
  }, [safeSources]);

  // The over-time card partitions the NON-partner sources on its own, so its
  // named set and "Other Community sources" bucket reflect what it actually shows.
  const { trendNamed, trendFoldedNames, trendHasOther } = React.useMemo(() => {
    const namedSources = timeSeriesSources.slice(0, COMMUNITY_NAMED_LIMIT);
    const folded = timeSeriesSources.slice(COMMUNITY_NAMED_LIMIT);
    return {
      trendNamed: namedSources,
      trendFoldedNames: new Set(folded.map((source) => source.sourceName)),
      trendHasOther: folded.length > 0,
    };
  }, [timeSeriesSources]);

  // One color per source across the whole roster, so a source keeps its color
  // whether it appears named on the mix bar or on the over-time line. The
  // bucket is neutral gray on both.
  const colorConfig = React.useMemo(() => {
    const config: ChartConfig = {};
    safeSources.forEach((source, index) => {
      config[sourceKey(source.sourceName)] = {
        label: source.sourceName,
        theme: carbonCategoricalTheme(index),
      };
    });
    config[sourceKey(OTHER_SOURCES_LABEL)] = {
      label: OTHER_SOURCES_LABEL,
      theme: carbonTheme('warmGray'),
    };
    return config;
  }, [safeSources]);

  const totalWeightHundredths = React.useMemo(
    () => safeSources.reduce((sum, source) => sum + source.weightHundredths, 0),
    [safeSources]
  );

  // --- Mix (bar): one row per named source, plus one Other row that carries the
  // breakdown of what it contains for its tooltip. ---
  const mixRows = React.useMemo(() => {
    const rows = named.map((source) => ({
      label: source.sourceName,
      key: sourceKey(source.sourceName),
      weight: pounds(source.weightHundredths),
      breakdown: null as Array<{ label: string; weight: number }> | null,
    }));
    if (hasOther) {
      const folded = safeSources.filter((source) => foldedNames.has(source.sourceName));
      rows.push({
        label: OTHER_SOURCES_LABEL,
        key: sourceKey(OTHER_SOURCES_LABEL),
        weight: pounds(folded.reduce((sum, source) => sum + source.weightHundredths, 0)),
        breakdown: folded.map((source) => ({
          label: source.sourceName,
          weight: pounds(source.weightHundredths),
        })),
      });
    }
    return rows;
  }, [named, hasOther, safeSources, foldedNames]);

  // --- Over time (non-partner sources only): a client-side source filter.
  // Every non-partner source is selectable, folded ones included. ---
  const allSeriesKeys = React.useMemo(
    () => [...trendNamed.map((source) => source.sourceName), ...(trendHasOther ? [OTHER_SOURCES_LABEL] : [])],
    [trendNamed, trendHasOther]
  );
  const [hidden, setHidden] = React.useState<string[]>([]);
  const visibleKeys = React.useMemo(
    () => allSeriesKeys.filter((key) => !hidden.includes(key)),
    [allSeriesKeys, hidden]
  );
  const toggleSeries = (key: string, visible: boolean) =>
    setHidden((current) => (visible ? current.filter((k) => k !== key) : [...new Set([...current, key])]));

  // Per-month breakdown of the folded bucket, so the Other line's tooltip can
  // itemize that month rather than showing an unexplained lump.
  const otherBreakdownByMonth = React.useMemo(() => {
    const map = new Map<string, Array<{ label: string; weight: number }>>();
    if (!trendHasOther) return map;
    for (const entry of timeSeriesMonthly) {
      if (!trendFoldedNames.has(entry.sourceName)) continue;
      const list = map.get(entry.bucket) ?? [];
      list.push({ label: entry.sourceName, weight: pounds(entry.weightHundredths) });
      map.set(entry.bucket, list);
    }
    for (const list of map.values()) list.sort((left, right) => right.weight - left.weight);
    return map;
  }, [timeSeriesMonthly, trendFoldedNames, trendHasOther]);

  const trend = React.useMemo(() => {
    const months = [...new Set(timeSeriesMonthly.map((entry) => entry.bucket))].sort();
    const namedSet = new Set(trendNamed.map((source) => source.sourceName));
    return months.map((month) => {
      const row: Record<string, string | number> = { bucket: month };
      for (const source of trendNamed) row[sourceKey(source.sourceName)] = 0;
      if (trendHasOther) row[sourceKey(OTHER_SOURCES_LABEL)] = 0;
      for (const entry of timeSeriesMonthly) {
        if (entry.bucket !== month) continue;
        const key = namedSet.has(entry.sourceName)
          ? sourceKey(entry.sourceName)
          : sourceKey(OTHER_SOURCES_LABEL);
        row[key] = (Number(row[key]) || 0) + pounds(entry.weightHundredths);
      }
      return row;
    });
  }, [timeSeriesMonthly, trendNamed, trendHasOther]);

  if (safeSources.length === 0) return null;

  const receivedNote =
    'Legacy data only, based on internal William Temple House records. Record discontinued June 2023.';

  // Absent unless the picker actually narrowed the roster, so the printed card
  // never claims a filter the user did not apply.
  const selectedSourceNames = hidden.length > 0 ? visibleKeys : undefined;

  return (
    <>
      <SelectableBlock cardId="procurement-legacy-donation-history">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Donation History From Legacy Data</CardTitle>
          <CardDescription>
            Legacy data only, based on internal William Temple House records. Record discontinued
            June 2023.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={colorConfig}
            className="min-w-0 w-full"
            style={{ height: Math.max(280, mixRows.length * 34 + 48) }}
          >
            <BarChart accessibilityLayer data={mixRows} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
              <YAxis dataKey="label" type="category" width={160} tickLine={false} axisLine={false} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as (typeof mixRows)[number];
                  const share = totalWeightHundredths === 0
                    ? 0
                    : (row.weight * 100) / (totalWeightHundredths / 100);
                  return (
                    <div className="grid min-w-56 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-xl">
                      <div className="font-medium">{row.label}</div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Received</span>
                        <span className="font-mono font-medium tabular-nums">{row.weight.toLocaleString()} lb</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Share of community donations</span>
                        <span className="font-mono font-medium tabular-nums">{share.toFixed(1)}%</span>
                      </div>
                      {row.breakdown && row.breakdown.length > 0 && (
                        <div className="mt-1 grid gap-1 border-t border-border/50 pt-1.5">
                          <span className="text-muted-foreground">{row.breakdown.length} sources</span>
                          {row.breakdown.map((entry) => (
                            <div key={entry.label} className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">{entry.label}</span>
                              <span className="font-mono font-medium tabular-nums">{entry.weight.toLocaleString()} lb</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Bar dataKey="weight" radius={3} isAnimationActive={false}>
                {mixRows.map((row) => (
                  <Cell key={row.key} fill={`var(--color-${row.key})`} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      </SelectableBlock>

      <SelectableBlock
        cardId="procurement-legacy-donations-over-time"
        options={{ sourceNames: selectedSourceNames }}
      >
      <Card className="min-w-0">
        <CardHeader className="flex flex-col items-start justify-between gap-3 space-y-0 sm:flex-row sm:items-center">
          <div>
            <CardTitle>Other Donations Over Time (Legacy Data)</CardTitle>
            <CardDescription>
              Monthly received pounds by sources other than Fresh Alliance partners.
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Choose sources">
                {visibleKeys.length === allSeriesKeys.length
                  ? 'All sources'
                  : visibleKeys.length === 1
                    ? visibleKeys[0]
                    : `${visibleKeys.length} sources`}
                <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuItem onClick={() => setHidden([])}>Show all sources</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setHidden(allSeriesKeys)}>Clear all sources</DropdownMenuItem>
              <DropdownMenuSeparator />
              {allSeriesKeys.map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={visibleKeys.includes(key)}
                  onCheckedChange={(checked) => toggleSeries(key, checked)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {key}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent>
          {timeSeriesSources.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-center text-sm text-muted-foreground">
              Every legacy source in this range is a Fresh Alliance partner, shown on the Fresh Food
              Alliance Donations Over Time card.
            </div>
          ) : visibleKeys.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              Choose at least one source.
            </div>
          ) : (
            <ChartContainer config={colorConfig} className="h-80 min-w-0 w-full">
              <LineChart accessibilityLayer data={trend} margin={{ left: 8, right: 16 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="bucket"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={bucketLabel}
                  minTickGap={32}
                />
                <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={formatAxisNumber} />
                <ChartTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const month = String(label);
                    const otherKey = sourceKey(OTHER_SOURCES_LABEL);
                    const rows = payload
                      .filter((item) => Number(item.value) > 0)
                      .map((item) => ({
                        key: String(item.dataKey),
                        name: colorConfig[String(item.dataKey)]?.label ?? String(item.dataKey),
                        color: item.color,
                        value: Number(item.value),
                      }))
                      // Largest first, so the list reads in the order the lines
                      // stack at the hovered month. Recharts hands the payload
                      // over in series-declaration order, which put a 1,543 lb
                      // source above a 6,480 lb one. The folded breakdown below
                      // was already sorted this way; the outer list was not.
                      .sort((left, right) => right.value - left.value);
                    if (rows.length === 0) return null;
                    return (
                      <div className="grid min-w-52 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-xl">
                        <div className="font-medium">{tooltipLabel(month)}</div>
                        {rows.map((row) => (
                          <React.Fragment key={row.key}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: row.color as string }} />
                                {row.name}
                              </span>
                              <span className="font-mono font-medium tabular-nums">{row.value.toLocaleString()} lb</span>
                            </div>
                            {row.key === otherKey && (otherBreakdownByMonth.get(month)?.length ?? 0) > 0 && (
                              <div className="ml-3.5 grid gap-0.5 border-l border-border/50 pl-2">
                                {otherBreakdownByMonth.get(month)!.map((entry) => (
                                  <div key={entry.label} className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">{entry.label}</span>
                                    <span className="font-mono tabular-nums">{entry.weight.toLocaleString()} lb</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    );
                  }}
                />
                <ChartLegend content={<ChartLegendContent />} />
                {visibleKeys.map((key) => {
                  const cssKey = sourceKey(key);
                  return (
                    <Line isAnimationActive={!prefersReducedMotion()}
                      key={cssKey}
                      type="monotone"
                      dataKey={cssKey}
                      stroke={`var(--color-${cssKey})`}
                      strokeWidth={2}
                      dot={false}
                    />
                  );
                })}
              </LineChart>
            </ChartContainer>
          )}
          <FootnoteList items={[receivedNote]} />
        </CardContent>
      </Card>
      </SelectableBlock>
    </>
  );
}
