// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// Service Analytics — the third lens, beside Operations and Procurement.
//
// Two records describe the same pantry days and are complementary, not
// authority and commentary. Formal intake (Link2Feed, then SIMC) is the
// client-grained record; the Service Log is WTH's own end-of-day count, entered
// by staff, and it covers days and households intake missed. They are never
// summed with each other, and where both can answer a question the Service Log
// is preferred — a hand-counted total does not depend on every client
// completing intake.
//
// Card copy follows one rule: the description says what the card shows, source
// pills say where it came from, and anything the reader must know to avoid
// misreading it goes in the footer. The footer is the place for caveats
// precisely because it is read last, after the shape of the data is already
// understood.
//
// Reused from the Procurement lens rather than reinvented:
// `buildSeasonalYearChartConfig` (year-over-year colour assignment) and the
// year-picker dropdown pattern from Seasonal Inbound Weight.

import * as React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Label, Line, LineChart, Pie, PieChart,
  ReferenceLine, XAxis, YAxis,
} from 'recharts';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Ban, Calendar, ChevronDown, Gauge } from '@/components/ui/icons';
import {
  BadgeQuestionMark, Clock3, Hourglass, ShoppingBasket, Ticket, TicketCheck, Tickets, UsersRound,
} from 'lucide-react';
import { getIconComponent } from '@/lib/icon-library';
import { SelectableBlock } from '@/components/reports/selection';
import { FootnoteList } from '@/components/analytics/footnote';
import { useCategoryAxis } from '@/lib/chart-axis';
import { bucketLabeller, monthLabel } from '@/lib/formatting/bucket-label';
import { prefersReducedMotion } from '@/lib/reduced-motion';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { carbonChartColors } from '@/lib/colors';
import { formatAxisNumber, formatNumber } from '@/lib/formatting/number';
import { buildSeasonalYearChartConfig } from './index';
import {
  serviceApi,
  type ServiceAnalytics,
  type ServiceBucketGranularity,
} from '@/services/service';
import type { AnalyticsDateRange } from '@/types/analytics';

export function ServiceAnalyticsLens({ range }: { range: AnalyticsDateRange }) {
  const [analytics, setAnalytics] = React.useState<ServiceAnalytics | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setIsLoading(true);
    serviceApi.getAnalytics({
      preset: range.preset,
      ...(range.preset === 'custom' && range.startDate && range.endDate
        ? { startDate: range.startDate, endDate: range.endDate }
        : {}),
    })
      .then((result) => { if (active) setAnalytics(result); })
      .catch((error) => ErrorHandlerService.handleError(error, 'serviceAnalytics'))
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [range.preset, range.startDate, range.endDate]);

  if (isLoading && !analytics) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  // Either record makes the range non-empty. Checking only intake is what told
  // staff "no service records" for the last seven days while their own Service
  // Log held entries through yesterday.
  const hasAnything = analytics
    && (analytics.coverage.hasIntake || analytics.coverage.hasServiceLog
      || (analytics.queueTiming?.includedSessionCount ?? 0) > 0
      || (analytics.queueTiming?.pendingReviewCount ?? 0) > 0);

  if (!analytics || !hasAnything) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>No service records in this range</CardTitle>
          <CardDescription>
            Nothing was recorded in the Service Log and no intake data covers these
            dates. Widen the date range, record a service day in Service &rarr; Service
            Log, or import visit data from Information &rarr; Data.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <ServiceAnalyticsWorkspace analytics={analytics} />;
}

const count = (value: number) => formatNumber(value);
const round1 = (value: number) => Math.round(value * 10) / 10;
const EMPTY_QUEUE_TIMING: NonNullable<ServiceAnalytics['queueTiming']> = {
  includedSessionCount: 0,
  includedServiceDayCount: 0,
  volumeServiceDayCount: 0,
  pendingReviewCount: 0,
  excludedSessionCount: 0,
  observedTicketCount: 0,
  medianWaitMinutes: null,
  averageWaitMinutes: null,
  p75WaitMinutes: null,
  p90WaitMinutes: null,
  historicalServingIntervalMinutes: null,
  typicalLastCallLocalTime: null,
  medianInitialBatchSize: null,
  averageIssuedPerServiceDay: null,
  averageReturnedPerServiceDay: null,
  daily: [],
};
/** Shared with Procurement so the two lenses label buckets identically. */
const monthOfDate = (date: string) => monthLabel(date.slice(0, 7));

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const seriesColor = (configKey: string) => `var(--color-${configKey})`;

/** Every line Service Over Time can draw, in the order they stack. */
const TIMELINE_SERIES = [
  ['link2feedHouseholds', 'Link2Feed households', carbonChartColors.blue.primary.light],
  ['link2feedIndividuals', 'Link2Feed individuals', carbonChartColors.cyan.primary.light],
  ['simcHouseholds', 'SIMC households', carbonChartColors.purple.primary.light],
  ['simcIndividuals', 'SIMC individuals', carbonChartColors.magenta.primary.light],
  ['serviceLogHouseholds', 'Service Log households', carbonChartColors.teal.primary.light],
] as const;

const QUEUE_VOLUME_SERIES = [
  ['issuedCount', 'Tickets issued', carbonChartColors.blue.primary.light],
  ['returnedCount', 'Tickets returned', carbonChartColors.magenta.primary.light],
  ['calledCount', 'Tickets called', carbonChartColors.teal.primary.light],
  ['initialBatchIssuedCount', 'Initial issuance', carbonChartColors.purple.primary.light],
] as const;

const QUEUE_CALL_SERIES = [
  ['tenthCallLocalMinute', '10th ticket called', carbonChartColors.blue.primary.light],
  ['twentyFifthCallLocalMinute', '25th ticket called', carbonChartColors.teal.primary.light],
  ['fiftiethCallLocalMinute', '50th ticket called', carbonChartColors.purple.primary.light],
  ['lastCallLocalMinute', 'Last ticket called', carbonChartColors.orange.primary.light],
] as const;

const queueVolumeConfig = Object.fromEntries(
  QUEUE_VOLUME_SERIES.map(([key, label, color]) => [key, { label, color }]),
) satisfies ChartConfig;

const queueCallConfig = Object.fromEntries(
  QUEUE_CALL_SERIES.map(([key, label, color]) => [key, { label, color }]),
) satisfies ChartConfig;

const formatLocalClockMinute = (value: unknown) => {
  const raw = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(raw)) return '—';
  const minutes = Math.round(raw);
  const hours24 = Math.floor(minutes / 60) % 24;
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes % 60).padStart(2, '0')} ${hours24 < 12 ? 'AM' : 'PM'}`;
};

/** Source provenance, stated as a pill rather than a sentence. */
function SourcePills({ sources }: { sources: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {sources.map((source) => (
        <Badge key={source} variant="outline" className="font-normal">{source}</Badge>
      ))}
    </div>
  );
}


/** Matches the Dashboard stat cards: figure left, icon top-right. */
function Tile({
  label, value, hint, icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * One Service Log method. The icon comes from the metric's own configuration,
 * so administration is the single place icons are chosen.
 */
function MethodRow({
  iconName, displayName, value, unit, color,
}: {
  iconName: string; displayName: string; value: number; unit?: string; color?: string;
}) {
  const Icon = getIconComponent(iconName);
  return (
    <div className="flex items-center gap-4 border-b py-3.5 last:border-b-0">
      {/* The swatch is the icon's own tinted disc, so the key reads as a legend
          for the chart beside it without needing a separate colour chip. */}
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={color
          ? { backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)` }
          : { backgroundColor: 'var(--muted)' }}
      >
        <Icon
          className="h-5 w-5"
          {...(color ? { style: { color } } : {})}
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-base">{displayName}</span>
      <span className="shrink-0 text-lg font-semibold tabular-nums">
        {count(value)}
        {unit && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
}

export function ServiceAnalyticsWorkspace({ analytics }: { analytics: ServiceAnalytics }) {
  const {
    coverage, summary, overTime, seasonal, methodSeries, recordAgreement, unmetDemand,
  } = analytics;
  // Merge rather than merely coalesce so a frontend deployed ahead of the
  // expanded backend contract still treats the new fields as empty.
  const queueTiming = {
    ...EMPTY_QUEUE_TIMING,
    ...analytics.queueTiming,
    daily: analytics.queueTiming?.daily ?? [],
  };
  const queueDaily = queueTiming.daily;
  const queueCallTimeDomain = React.useMemo<[number, number]>(() => {
    const values = queueDaily.flatMap((day) => [
      day.tenthCallLocalMinute,
      day.twentyFifthCallLocalMinute,
      day.fiftiethCallLocalMinute,
      day.lastCallLocalMinute,
    ]).filter((value): value is number => value !== null);
    if (values.length === 0) return [0, 1440];
    let minimum = Math.max(0, Math.floor(Math.min(...values) / 60) * 60);
    let maximum = Math.min(1440, Math.ceil(Math.max(...values) / 60) * 60);
    if (minimum === maximum) {
      minimum = Math.max(0, minimum - 60);
      maximum = Math.min(1440, maximum + 60);
    }
    return [minimum, maximum];
  }, [queueDaily]);

  /**
   * The turned-away series carries nulls outside the Service Log's span. A bar
   * chart cannot express "no record" the way a line can break, so those buckets
   * are dropped rather than drawn as zero-height bars that would read as
   * confirmed zeros.
   */
  const unmetBuckets = React.useMemo(
    () => unmetDemand.buckets.filter((bucket) => bucket.turnedAway !== null),
    [unmetDemand.buckets],
  );

  // Monthly buckets bring back the partial-period hazard: the newest month
  // holds only the service days that have happened, so plotting it beside
  // complete months reads as a collapse. Daily buckets need no such guard — a
  // service day is either recorded or absent, never half-counted.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const dropPartial = <T extends { month?: string; bucket?: string }>(rows: T[], key: 'month' | 'bucket') => {
    if (coverage.granularity !== 'month') return { rows, excluded: null as string | null };
    const last = rows[rows.length - 1];
    if (!last || String(last[key]) !== currentMonth) return { rows, excluded: null as string | null };
    return { rows: rows.slice(0, -1), excluded: currentMonth };
  };

  const { rows: timeline, excluded: timelinePartial } = dropPartial(overTime, 'month');
  const { rows: methodBucketsRaw, excluded: methodPartial } = dropPartial(
    methodSeries.buckets as Array<{ bucket?: string }>, 'bucket',
  ) as { rows: Array<Record<string, string | number>>; excluded: string | null };

  const TOTAL_KEY = '__total';
  const methodBuckets = React.useMemo(() => methodBucketsRaw.map((bucket) => {
    const total = methodSeries.methods.reduce((sum, method) => {
      const value = bucket[method.metricKey];
      return typeof value === 'number' ? sum + value : sum;
    }, 0);
    return { ...bucket, [TOTAL_KEY]: total };
  }), [methodBucketsRaw, methodSeries.methods]);

  // The changeover is marked at the first day SIMC recorded, taken from the
  // data rather than a hardcoded month, so the marker follows the record.
  const spansCutover = React.useMemo(() => {
    const hasL2f = overTime.some((row) => (row.link2feedHouseholds ?? 0) > 0 || (row.link2feedIndividuals ?? 0) > 0);
    const hasSimc = overTime.some((row) => (row.simcHouseholds ?? 0) > 0 || (row.simcIndividuals ?? 0) > 0);
    return hasL2f && hasSimc;
  }, [overTime]);
  const cutoverDate = React.useMemo(
    () => (spansCutover
      ? overTime.find((row) => (row.simcHouseholds ?? 0) > 0 || (row.simcIndividuals ?? 0) > 0)?.month ?? null
      : null),
    [overTime, spansCutover],
  );

  // Derived from which records actually meet at the boundary, so the marker
  // describes this organization's history rather than a hardcoded event.
  const cutoverLabel = React.useMemo(() => {
    const ordered = [...coverage.sources].sort((a, b) => a.firstDate.localeCompare(b.firstDate));
    const names = ordered.map((entry) => (entry.source === 'link2feed' ? 'Link2Feed' : 'SIMC'));
    return names.length === 2 ? `${names[0]} \u2192 ${names[1]}` : 'Record changed';
  }, [coverage.sources]);

  // The seasonal plot needs the same in-progress guard as the timeline: the
  // current month holds only the service days that have happened so far, and
  // plotting it beside eleven complete months makes the current year appear to
  // collapse. Only the current year's newest point is dropped — every prior
  // year's month is complete.
  /**
   * Households counts a household once a month however often it came; visits
   * counts every encounter. Staff ask both questions of this chart — "how many
   * families did we reach in March" and "how busy was March" — and the shapes
   * differ, so the measure is a choice rather than an assumption.
   */
  const [seasonalMeasure, setSeasonalMeasure] =
    React.useState<'households' | 'visits'>('households');

  /**
   * Which records this range actually contains.
   *
   * `coverage.sources` is scoped to the range, so a 30-day window after the
   * June 2026 changeover reports SIMC and not Link2Feed. Naming a source that
   * contributed nothing — in a legend, a pill, or a caption — invites the
   * reader to look for a line that was never going to be there.
   */
  const presentSources = React.useMemo(
    () => new Set(coverage.sources.map((entry) => entry.source)),
    [coverage.sources],
  );
  const intakePills = React.useMemo(() => [
    ...(presentSources.has('link2feed') ? ['Link2Feed'] : []),
    ...(presentSources.has('simc') ? ['SIMC'] : []),
  ], [presentSources]);

  /**
   * One entry per record that reaches this range.
   *
   * The payload nulls a series outside its own coverage, so "has any non-null
   * value" is the same question as "did this record contribute". Building the
   * chart config from that rather than from a fixed list is what stops a
   * 30-day range after the changeover from offering two Link2Feed legend
   * entries with no lines under them.
   */
  const timelineKeys = React.useMemo(
    () => TIMELINE_SERIES
      .map(([key]) => key)
      .filter((key) => timeline.some((row) => row[key] !== null && row[key] !== undefined)),
    [timeline],
  );
  const timelineConfig = React.useMemo(() => Object.fromEntries(
    TIMELINE_SERIES
      .filter(([key]) => timelineKeys.includes(key))
      .map(([key, label, color]) => [key, { label, color }]),
  ) satisfies ChartConfig, [timelineKeys]);

  const seasonalMonths = React.useMemo(() => {
    const now = new Date();
    const currentYear = String(now.getFullYear());
    const currentMonthLabel = MONTH_LABELS[now.getMonth()];
    return seasonal[seasonalMeasure].map((row) => {
      if (row.month !== currentMonthLabel || row[currentYear] === undefined) return row;
      const rest = { ...row };
      delete rest[currentYear];
      return rest;
    });
  }, [seasonal, seasonalMeasure]);

  // Seasonal year picker, mirroring Seasonal Inbound Weight.
  const [selectedYears, setSelectedYears] = React.useState<string[] | null>(null);
  const years = seasonal.years;
  const activeYears = selectedYears ?? years;
  const seasonalConfig = React.useMemo(
    () => buildSeasonalYearChartConfig(activeYears, new Date().getFullYear()),
    [activeYears],
  );

  const methodSlices = React.useMemo(
    () => summary.methods.filter((method) => method.households > 0),
    [summary.methods],
  );

  const methodPalette = React.useMemo(() => [
    carbonChartColors.blue.primary.light,
    carbonChartColors.cyan.primary.light,
    carbonChartColors.teal.primary.light,
    carbonChartColors.orange.primary.light,
    carbonChartColors.purple.primary.light,
  ], []);
  const methodColorFor = React.useCallback((metricKey: string) => {
    const index = summary.methods.findIndex((method) => method.metricKey === metricKey);
    return index < 0 ? undefined : methodPalette[index % methodPalette.length];
  }, [methodPalette, summary.methods]);

  const methodConfig = React.useMemo(() => Object.fromEntries(
    (methodSeries.methods.length > 0 ? methodSeries.methods : summary.methods)
      .map((method, index) => [method.metricKey, {
      label: method.displayName,
      color: methodPalette[index % methodPalette.length],
    }]),
  ) satisfies ChartConfig, [methodPalette, methodSeries.methods, summary.methods]);

  const methodChartConfig = React.useMemo(() => ({
    ...methodConfig,
    [TOTAL_KEY]: { label: 'All households served', color: 'var(--muted-foreground)' },
  }) satisfies ChartConfig, [methodConfig]);

  const spansYears = coverage.startDate.slice(0, 4) !== coverage.endDate.slice(0, 4);
  /**
   * Built per granularity, not per page. Bucket grain is a card's own decision
   * — How Service Was Delivered plots every service day at every range — so a
   * chart that labelled its buckets with the page-wide grain fed a day key to
   * a month formatter and threw, blanking the whole tab.
   */
  const labelFor = (granularity: ServiceBucketGranularity) =>
    bucketLabeller(granularity, spansYears);
  const labelBucket = labelFor(coverage.granularity);
  const labelMethodBucket = labelFor(methodSeries.granularity);
  const pointNoun = coverage.granularity === 'month' ? 'one month' : 'one service day';

  /** Twelve month abbreviations: roomy on a wide card, tight on a phone. */
  const [seasonalChartRef, seasonalAxisProps, seasonalAxisExtraHeight] =
    useCategoryAxis(MONTH_LABELS as unknown as string[]);

  const householdsFromLog = summary.householdsSource === 'service_log';
  const serviceLogStartsLater = householdsFromLog
    && coverage.serviceLogFirstDate
    && coverage.serviceLogFirstDate > coverage.startDate;

  return (
    <div className="space-y-4">
      {/* ---- Service Summary ---------------------------------------------- */}
      <SelectableBlock cardId="service-summary">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Service Summary</CardTitle>
            <CardDescription>Pantry service recorded across both records.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* The Service Log is the wider column because it carries the chart
                and the method key; intake is three figures and reads fine in a
                stacked rail beside it. */}
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
              {coverage.hasServiceLog && (
                <section aria-labelledby="service-log-heading" className="min-w-0">
                  <p
                    id="service-log-heading"
                    className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Service Log
                  </p>
                  <div className="grid gap-6 sm:grid-cols-[minmax(0,300px)_1fr] sm:items-center">
                    <ChartContainer config={methodConfig} className="aspect-square w-full max-w-[300px]">
                      <PieChart>
                        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                        <Pie
                          isAnimationActive={!prefersReducedMotion()}
                          data={methodSlices}
                          dataKey="households"
                          nameKey="displayName"
                          innerRadius="68%"
                          outerRadius="100%"
                          paddingAngle={4}
                        >
                          <Label content={({ viewBox }) => {
                            if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null;
                            return (
                              <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                                <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-4xl font-bold">
                                  {count(summary.households)}
                                </tspan>
                                <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 26} className="fill-muted-foreground text-sm">
                                  Households served
                                </tspan>
                              </text>
                            );
                          }} />
                          {methodSlices.map((slice) => (
                            <Cell
                              key={slice.metricKey}
                              fill={seriesColor(slice.metricKey)}
                              className="stroke-background"
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>

                    {/* The key, in the order the administrator set. */}
                    <div className="min-w-0">
                      {summary.methods.map((method) => (
                        <MethodRow
                          key={method.metricKey}
                          iconName={method.iconName}
                          displayName={method.displayName}
                          value={method.households}
                          color={methodColorFor(method.metricKey)}
                        />
                      ))}
                      {summary.otherServices.map((service) => (
                        <MethodRow
                          key={service.metricKey}
                          iconName={service.iconName}
                          displayName={service.displayName}
                          value={service.total}
                          unit={service.unit}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {coverage.hasIntake && (
                <section aria-labelledby="intake-heading" className="min-w-0">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <p
                      id="intake-heading"
                      className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                    >
                      Intake records
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {coverage.sources.map((source) => (
                        <Badge
                          key={source.source}
                          variant="outline"
                          className="font-normal"
                        >
                          {source.source === 'link2feed' ? 'Link2Feed' : 'SIMC'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Tile label="Visits" value={count(summary.visits)} icon={ShoppingBasket} />
                    <Tile label="People served *" value={count(summary.peopleServed)} icon={UsersRound} />
                    <Tile
                      label="Anonymous visits"
                      value={count(summary.identityUnavailableVisits)}
                      icon={BadgeQuestionMark}
                    />
                    {!coverage.hasServiceLog && (
                      <Tile label="Households served" value={count(summary.households)} />
                    )}
                  </div>
                </section>
              )}
            </div>

            <div className="mt-6 border-t pt-4">
              {/* An asterisk, not a bullet, and it earns it: "treat this as an
                  undercount" needs to say what is undercounted, and the mark on
                  the People served tile above is what supplies the referent. The
                  "**" pair this card also carried is gone — those pointed at a
                  tile that never had the mark, so they decoded to nothing. */}
              <FootnoteList
                marker="*"
                items={['Not all clients disclose household size, treat this as an undercount.']}
              />
              <FootnoteList
                items={[
                  'People served counts every visit by household size.',
                  recordAgreement.sharedDays > 0
                    && `Across ${count(recordAgreement.sharedDays)} days in both records they `
                      + `differ by an average of ${Math.abs(round1(100 - recordAgreement.agreementPercent))}%.`,
                  serviceLogStartsLater && coverage.serviceLogFirstDate
                    && `The Service Log begins ${monthOfDate(coverage.serviceLogFirstDate)}; `
                      + 'earlier dates are covered by intake records only.',
                ]}
              />
            </div>
          </CardContent>
        </Card>
      </SelectableBlock>

      {/* Queue statistics are operational evidence from LOTTO. They never contribute
          to visits, households, or people served above. */}
      {(queueTiming.includedSessionCount > 0 || queueTiming.pendingReviewCount > 0) && (
        <SelectableBlock cardId="service-queue-timing">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Queue Statistics</CardTitle>
              <CardDescription>
                Observed queue activities and ticket entry-to-first-call waits from reviewed LOTTO sessions.
              </CardDescription>
              <SourcePills sources={['LOTTO']} />
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Tile
                  label="Typical initial issuance"
                  value={queueTiming.medianInitialBatchSize === null ? '—' : count(queueTiming.medianInitialBatchSize)}
                  hint="Median initial batch per pantry day"
                  icon={Ticket}
                />
                <Tile
                  label="Average tickets issued"
                  value={queueTiming.averageIssuedPerServiceDay === null ? '—' : count(queueTiming.averageIssuedPerServiceDay)}
                  hint="Per pantry day"
                  icon={Tickets}
                />
                <Tile
                  label="Average tickets returned"
                  value={queueTiming.averageReturnedPerServiceDay === null ? '—' : count(queueTiming.averageReturnedPerServiceDay)}
                  hint="Per pantry day"
                  icon={TicketCheck}
                />
                <Tile
                  label="Median ticket wait"
                  value={queueTiming.medianWaitMinutes === null ? '—' : `${queueTiming.medianWaitMinutes} min`}
                  hint={`${count(queueTiming.observedTicketCount)} paired tickets`}
                  icon={Hourglass}
                />
                <Tile
                  label="Average ticket wait"
                  value={queueTiming.averageWaitMinutes === null ? '—' : `${queueTiming.averageWaitMinutes} min`}
                  icon={Hourglass}
                />
                <Tile
                  label="75th percentile wait"
                  value={queueTiming.p75WaitMinutes === null ? '—' : `${queueTiming.p75WaitMinutes} min`}
                  icon={Hourglass}
                />
                <Tile
                  label="90th percentile wait"
                  value={queueTiming.p90WaitMinutes === null ? '—' : `${queueTiming.p90WaitMinutes} min`}
                  icon={Hourglass}
                />
                <Tile
                  label="Typical serving interval"
                  value={queueTiming.historicalServingIntervalMinutes === null ? '—' : `${queueTiming.historicalServingIntervalMinutes} min`}
                  icon={Clock3}
                />
                <Tile
                  label="Typical last call"
                  value={queueTiming.typicalLastCallLocalTime ?? '—'}
                  hint="Local LOTTO time"
                  icon={Clock3}
                />
              </div>
              <FootnoteList items={[
                `${count(queueTiming.includedSessionCount)} reviewed service sessions across ${count(queueTiming.includedServiceDayCount)} pantry days are included.`,
                queueTiming.volumeServiceDayCount < queueTiming.includedServiceDayCount
                  && `Daily volume averages use ${count(queueTiming.volumeServiceDayCount)} complete-capture pantry days; partial legacy days are shown as gaps.`,
                queueTiming.pendingReviewCount > 0
                  && `${count(queueTiming.pendingReviewCount)} synchronized session${queueTiming.pendingReviewCount === 1 ? '' : 's'} await staff review and are withheld from these figures.`,
                'Queue tickets are operational timing observations, not visits, households, or people served.',
              ]} />
            </CardContent>
          </Card>
        </SelectableBlock>
      )}

      {queueDaily.length > 0 && (
        <SelectableBlock cardId="service-queue-volume">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Queue Volume by Pantry Day</CardTitle>
              <CardDescription>
                Daily ticket issuance, returns, and calls from reviewed LOTTO sessions.
              </CardDescription>
              <SourcePills sources={['LOTTO']} />
            </CardHeader>
            <CardContent>
              <ChartContainer config={queueVolumeConfig} className="h-[300px] w-full">
                <LineChart accessibilityLayer data={queueDaily} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="serviceDate" tickFormatter={(value) => labelFor('day')(String(value))} tickLine={false} axisLine={false} minTickGap={44} />
                  <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={formatAxisNumber} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent sortByValue labelFormatter={(value) => labelFor('day')(String(value))} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {QUEUE_VOLUME_SERIES.map(([key]) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={seriesColor(key)}
                      strokeWidth={2}
                      dot={queueDaily.filter((day) => day[key] !== null).length === 1}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
              <FootnoteList items={[
                'Tickets called counts observed first calls; it is not calculated as tickets issued minus tickets returned.',
                'Initial issuance is the first recorded ticket batch for each pantry day.',
                queueDaily.some((day) => day.issuedCount === null)
                  && 'Partial legacy days are shown as gaps because their total volume is unknown.',
              ]} />
            </CardContent>
          </Card>
        </SelectableBlock>
      )}

      {queueDaily.some((day) => day.lastCallLocalMinute !== null) && (
        <SelectableBlock cardId="service-queue-call-milestones">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Call Milestones by Pantry Day</CardTitle>
              <CardDescription>
                Local times when reviewed LOTTO sessions reached each call milestone.
              </CardDescription>
              <SourcePills sources={['LOTTO']} />
            </CardHeader>
            <CardContent>
              <ChartContainer config={queueCallConfig} className="h-[300px] w-full">
                <LineChart accessibilityLayer data={queueDaily} margin={{ left: 12, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="serviceDate" tickFormatter={(value) => labelFor('day')(String(value))} tickLine={false} axisLine={false} minTickGap={44} />
                  <YAxis
                    domain={queueCallTimeDomain}
                    tickLine={false}
                    axisLine={false}
                    width={72}
                    tickFormatter={formatLocalClockMinute}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent
                      sortByValue
                      labelFormatter={(value) => labelFor('day')(String(value))}
                      formatter={(value, _name, item) => (
                        <div className="flex flex-1 items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                            {String(queueCallConfig[String(item.dataKey)]?.label ?? item.dataKey)}
                          </span>
                          <span className="font-mono font-medium tabular-nums">
                            {formatLocalClockMinute(value)}
                          </span>
                        </div>
                      )}
                    />}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  {QUEUE_CALL_SERIES.map(([key]) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={seriesColor(key)}
                      strokeWidth={2}
                      dot={queueDaily.filter((day) => day[key] !== null).length === 1}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
              <FootnoteList items={[
                'Times use the timezone stored by LOTTO for each session.',
                'A blank milestone means that pantry day did not reach that many observed first calls.',
              ]} />
            </CardContent>
          </Card>
        </SelectableBlock>
      )}

      {/* ---- Service Over Time -------------------------------------------- */}
      {timeline.length > 1 && (
        <SelectableBlock cardId="service-over-time">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Service Over Time</CardTitle>
              <CardDescription>
                Service by {coverage.granularity === 'month' ? 'month' : 'day'}, by record.
              </CardDescription>
              <SourcePills sources={[...intakePills, ...(coverage.hasServiceLog ? ['Service Log'] : [])]} />
            </CardHeader>
            <CardContent>
              <ChartContainer config={timelineConfig} className="h-[300px] w-full">
                <LineChart data={timeline} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="month" tickFormatter={(value) => labelBucket(String(value))} tickLine={false} axisLine={false} minTickGap={44} />
                  <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={formatAxisNumber} />
                  <ChartTooltip content={<ChartTooltipContent sortByValue labelFormatter={(value) => labelBucket(String(value))} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {cutoverDate && <ReferenceLine
                    x={cutoverDate}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    label={{ value: cutoverLabel, position: 'insideTopRight', fontSize: 11, fill: 'var(--muted-foreground)' }}
                  />}
                  {timelineKeys.map((key) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={seriesColor(key)}
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
              <FootnoteList
                items={[
                  `Each point is ${pointNoun}.`,
                  spansCutover
                    && 'The gap between the two intake lines is the changeover, not a drop in service.',
                  timelinePartial
                    && `${monthLabel(timelinePartial)} is still in progress and is not plotted.`,
                ]}
              />
            </CardContent>
          </Card>
        </SelectableBlock>
      )}

      {/* ---- Households by Season ----------------------------------------- */}
      {years.length > 1 && (
        <SelectableBlock
          cardId="service-seasonal-households"
          options={{
            measure: seasonalMeasure,
            yearMode: selectedYears === null ? 'all-available' : 'selected',
            ...(selectedYears === null ? {} : { years: activeYears }),
          }}
        >
          <Card className="min-w-0">
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1.5">
                <CardTitle>
                  {seasonalMeasure === 'visits' ? 'Visits by Season' : 'Households by Season'}
                </CardTitle>
                <CardDescription>Calendar years compared month by month.</CardDescription>
                <SourcePills sources={intakePills} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* The same animated segmented control the Date Range switcher
                    uses, rather than a second hand-rolled one: the highlight
                    slides between the two, so the change of measure is seen
                    rather than only read off a re-rendered title. Tabs with no
                    TabsContent is how that control is used there too. */}
                <Tabs
                  value={seasonalMeasure}
                  onValueChange={(value) =>
                    setSeasonalMeasure(value as 'households' | 'visits')}
                  className="w-auto"
                >
                  <TabsList aria-label="Measure" className="h-8">
                    <TabsTrigger value="households">Households</TabsTrigger>
                    <TabsTrigger value="visits">Visits</TabsTrigger>
                  </TabsList>
                </Tabs>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0">
                    Years <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto">
                  <DropdownMenuItem onSelect={() => setSelectedYears(years)}>Select all years</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSelectedYears([])}>Clear all years</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {years.map((year) => (
                    <DropdownMenuCheckboxItem
                      key={year}
                      checked={activeYears.includes(year)}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(checked) => setSelectedYears(
                        checked
                          ? [...activeYears, year].sort()
                          : activeYears.filter((entry) => entry !== year),
                      )}
                    >
                      {year}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              {activeYears.length === 0 ? (
                <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                  Choose at least one year.
                </div>
              ) : (
                <div ref={seasonalChartRef}>
                <ChartContainer
                  config={seasonalConfig}
                  className="w-full"
                  style={{ height: `${300 + seasonalAxisExtraHeight}px` }}
                >
                  <LineChart data={seasonalMonths} margin={{ left: 4, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} {...seasonalAxisProps} />
                    <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={formatAxisNumber} />
                    {/* Sorted highest-first, so the tooltip's order matches how
                        the lines actually stack at the hovered month. The default
                        content lists series in render order — ascending year —
                        which reads as the inverse of what is on screen. Same
                        treatment as Seasonal Inbound Weight. */}
                    <ChartTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const rows = [...payload]
                          .filter((item) => item.value != null)
                          .sort((left, right) => Number(right.value) - Number(left.value));
                        if (rows.length === 0) return null;
                        return (
                          <div className="grid min-w-40 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-xl">
                            <div className="font-medium">{String(label)}</div>
                            {rows.map((item) => (
                              <div key={String(item.dataKey)} className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                                  {String(item.name ?? item.dataKey)}
                                </span>
                                <span className="font-mono font-medium tabular-nums">
                                  {count(Number(item.value))}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    {[...activeYears].sort().map((year) => {
                      const isCurrentYear = year === String(new Date().getFullYear());
                      return (
                        <Line
                          key={year}
                          type="monotone"
                          dataKey={year}
                          stroke={seriesColor(year)}
                          strokeWidth={isCurrentYear ? 3 : 2}
                          strokeLinecap="round"
                          dot={activeYears.length === 1}
                          connectNulls={false}
                          // Same emphasis Seasonal Inbound Weight gives the year
                          // in progress, so the two charts read alike.
                          style={isCurrentYear ? {
                            filter: `drop-shadow(0 0 2px var(--color-${year})) drop-shadow(0 0 5px var(--color-${year}))`,
                          } : undefined}
                        />
                      );
                    })}
                  </LineChart>
                </ChartContainer>
                </div>
              )}
              <FootnoteList
                items={seasonalMeasure === 'visits'
                  ? ['Every visit each month, so repeat visits are counted each time.']
                  : [
                    'Distinct households each month, so repeat visits are counted once.',
                    'Anonymous visits are counted but not deduplicated.',
                  ]}
              />
            </CardContent>
          </Card>
        </SelectableBlock>
      )}

      {/* ---- How Service Was Delivered ------------------------------------ */}
      {methodBuckets.length > 0 && (
        <SelectableBlock cardId="service-method-mix">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>How Service Was Delivered</CardTitle>
              <CardDescription>
                William Temple House&apos;s own operational record of service methods.
              </CardDescription>
              <SourcePills sources={['Service Log', 'Households']} />
            </CardHeader>
            <CardContent>
              {/* Lines, not a stacked area: stacking made the topmost series
                  read as the peak value against the axis, so emergency bags
                  looked like the largest method when they are the smallest. */}
              <ChartContainer config={methodChartConfig} className="h-[300px] w-full">
                <LineChart data={methodBuckets} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" tickFormatter={(value) => labelMethodBucket(String(value))} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={formatAxisNumber} />
                  <ChartTooltip content={<ChartTooltipContent sortByValue labelFormatter={(value) => labelMethodBucket(String(value))} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {/* Dashed and neutral so it reads as the sum of the others
                      rather than a fifth service method. */}
                  {/* Animation off deliberately: Recharts draws a line by
                      animating stroke-dasharray, which overwrites the dash that
                      makes this read as a total rather than a fifth method. */}
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey={TOTAL_KEY}
                    stroke={seriesColor(TOTAL_KEY)}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                  />
                  {methodSeries.methods.map((method) => (
                    <Line
                      key={method.metricKey}
                      type="monotone"
                      dataKey={method.metricKey}
                      stroke={seriesColor(method.metricKey)}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
              <FootnoteList
                items={[
                  `Households per ${methodSeries.granularity === 'month' ? 'month' : 'service day'}.`,
                  'Each line begins when that service was first recorded.',
                  methodPartial
                    && `${monthLabel(methodPartial)} is still in progress and is not plotted.`,
                ]}
              />
            </CardContent>
          </Card>
        </SelectableBlock>
      )}

      {/* ---- Capacity and Unmet Demand ------------------------------------ */}
      {unmetBuckets.length > 0 && (
        <SelectableBlock cardId="service-unmet-demand">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Turned Away</CardTitle>
              <CardDescription>
                Households the pantry could not serve, and the days capacity ran out.
              </CardDescription>
              <SourcePills sources={['Service Log']} />
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Tile label="Households turned away" value={count(unmetDemand.householdsTurnedAway)} icon={Ban} />
                <Tile
                  label="Days it happened"
                  value={count(unmetDemand.daysWithTurnAway)}
                  hint={`of ${count(unmetDemand.daysRecorded)} recorded service days`}
                  icon={Calendar}
                />
                {/* The administrator's own icon for the capacity metric, resolved
                    the same way the Service Log resolves it, so the two surfaces
                    cannot disagree about what that metric looks like. Falls back
                    only when there is no capacity metric, or several — the count
                    spans all of them, so one metric's icon would misrepresent it. */}
                <Tile
                  label="Times capacity was reached"
                  value={count(unmetDemand.capacityReachedDays)}
                  icon={unmetDemand.capacityIconName
                    ? getIconComponent(unmetDemand.capacityIconName)
                    : Gauge}
                />
              </div>
              <ChartContainer
                config={{ turnedAway: { label: 'Households turned away', color: carbonChartColors.orange.primary.light } } satisfies ChartConfig}
                className="h-[220px] w-full"
              >
                <BarChart data={unmetBuckets} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="bucket"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={bucketLabeller(unmetDemand.granularity, true)}
                    minTickGap={24}
                  />
                  <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} tickFormatter={formatAxisNumber} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) =>
                          unmetDemand.granularity === 'month' ? monthLabel(String(value)) : String(value)
                        }
                      />
                    }
                  />
                  <Bar dataKey="turnedAway" fill={seriesColor('turnedAway')} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartContainer>
              <FootnoteList items={['Blank entries are treated as a zero count.']} />
            </CardContent>
          </Card>
        </SelectableBlock>
      )}

    </div>
  );
}
