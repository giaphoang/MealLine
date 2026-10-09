// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { prefersReducedMotion } from '@/lib/reduced-motion'
import * as React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';

import { SectionHeader } from '@/components/shared/section-header';
import { createPageTitleIcon } from '@/components/layout/page-title-icon';
import { ChartNoAxesCombinedIcon } from '@/components/ui/chart-no-axes-combined';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { EnhancedDataTable } from '@/components/ui/enhanced-data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { SelectableBlock } from '@/components/reports/selection';
import { operationalReportsService } from '@/services/operational-reports';
import {
  LimitChange,
  OperationalAnalyticsResult,
  RationedLimitSeries,
  UnavailableEpisode,
} from '@/types/operational-reports';
import type { AnalyticsDateRange } from '@/types/analytics';
import { DEFAULT_ANALYTICS_RANGE } from '@/types/analytics';
import {
  carbonCategoricalFamilies,
  CarbonFamily,
  carbonCategoricalTheme,
  carbonTheme,
  getChartStatusColor,
} from '@/lib/colors';
import { SortableHeader } from "@/components/ui/sortable-header"
import { formatDateTime } from '@/lib/formatting/date';
import { formatAxisNumber } from '@/lib/formatting/number';

const PageTitleAnalyticsIcon = createPageTitleIcon(ChartNoAxesCombinedIcon);

const baseAssortmentConfig = {
  available: {
    label: 'Combined Assortment',
    theme: {
      light: 'var(--foreground)',
      dark: 'var(--foreground)',
    },
  },
} satisfies ChartConfig;

export const assortmentCategoryChartKey = (categoryId: number) =>
  `assortment_category_${categoryId}`;

export function buildAssortmentChart(
  result: OperationalAnalyticsResult,
  selectedCategoryId: number | null = null
) {
  const selectedSeries = selectedCategoryId === null
    ? result.assortmentCategorySeries
    : result.assortmentCategorySeries.filter(
        (series) => series.categoryId === selectedCategoryId
      );
  const config: ChartConfig = selectedCategoryId === null
    ? { ...baseAssortmentConfig }
    : {};
  selectedSeries.forEach((series) => {
    const index = result.assortmentCategorySeries.findIndex(
      (candidate) => candidate.categoryId === series.categoryId
    );
    config[assortmentCategoryChartKey(series.categoryId)] = {
      label: series.categoryName,
      theme: carbonCategoricalTheme(index),
    };
  });
  const data = result.timeline.map((point) => ({
    ...point,
    ...Object.fromEntries(
      selectedSeries.map((series) => [
        assortmentCategoryChartKey(series.categoryId),
        point.availableByCategory[String(series.categoryId)] ?? 0,
      ])
    ),
  }));
  return { config, data, series: selectedSeries };
}

const recurringAvailabilityConfig = {
  unavailableEntries: {
    label: 'Unavailable Entries',
    theme: {
      light: getChartStatusColor('error', 'light'),
      dark: getChartStatusColor('error', 'dark'),
    },
  },
  restorations: {
    label: 'Restorations',
    theme: {
      light: getChartStatusColor('success', 'light'),
      dark: getChartStatusColor('success', 'dark'),
    },
  },
} satisfies ChartConfig;

const categoryRecurrenceConfig = {
  recurringItems: {
    label: 'Recurring Items',
    theme: carbonTheme('blue'),
  },
  recurringUnavailableEntries: {
    label: 'Unavailable Entries',
    theme: carbonTheme('red'),
  },
} satisfies ChartConfig;

const categoryPressureConfig = {
  limitedSupplyServicePercent: {
    label: 'Limited Supply Active (%)',
    theme: carbonTheme('orange'),
  },
  clearanceServicePercent: {
    label: 'Clearance Active (%)',
    theme: carbonTheme('purple'),
  },
  itemRationedServicePercent: {
    label: 'Item Limit Active (%)',
    theme: carbonTheme('blue'),
  },
  categoryRationedServicePercent: {
    label: 'Category Limit Active (%)',
    theme: carbonTheme('teal'),
  },
} satisfies ChartConfig;

const summaryChartConfig = {
  availableNow: {
    label: 'Available Now',
    theme: {
      light: getChartStatusColor('success', 'light'),
      dark: getChartStatusColor('success', 'dark'),
    },
  },
  unavailableNow: {
    label: 'Unavailable Now',
    theme: {
      light: getChartStatusColor('error', 'light'),
      dark: getChartStatusColor('error', 'dark'),
    },
  },
  limitedSupplyNow: {
    label: 'Limited Supply',
    theme: carbonTheme('orange'),
  },
} satisfies ChartConfig;

// Operational Pressure uses the IBM Carbon data-viz palette (see
// carbonChartColors in @/lib/colors): WCAG-compliant, color-blind tested,
// with paired dark variants. Limited Supply keeps a warning-adjacent orange,
// Clearance a fixed purple, and the separate category-policy count a fixed
// teal. Adaptive Food Item limit series draw from the remaining hue families.
const basePressureConfig = {
  limitedSupply: {
    label: 'Limited Supply',
    theme: carbonTheme('orange'),
  },
  clearance: {
    label: 'Clearance',
    theme: carbonTheme('purple'),
  },
  categoryRationed: {
    label: 'Categories with Limits',
    theme: carbonTheme('teal'),
  },
} satisfies ChartConfig;

const pressureSeriesFamilies = (): readonly CarbonFamily[] =>
  carbonCategoricalFamilies().filter(
    (family) =>
      family !== 'orange' && family !== 'purple' && family !== 'teal'
  );

const pressureSeriesTheme = (index: number) => {
  const families = pressureSeriesFamilies();
  const family = families[index % families.length];
  const grade =
    Math.floor(index / families.length) % 2 === 0
      ? ('primary' as const)
      : ('secondary' as const);
  return carbonTheme(family, grade);
};

// ChartContainer turns config keys into CSS variables, so the series key
// "1|household" needs a variable-safe form.
export const limitSeriesChartKey = (series: RationedLimitSeries) =>
  `limit_${series.limit}_${series.limitType}`;

export const limitSeriesLabel = (series: RationedLimitSeries) =>
  `${series.limit} Per ${series.limitType === 'person' ? 'Person' : 'Household'}`;

/**
 * The Operational Pressure chart draws one line per limit configuration
 * present in the range (e.g. "1 Per Household"), alongside Limited Supply,
 * Clearance, and a distinct count of categories with limits. Category rules
 * are never expanded into implied Food Item counts.
 */
export function buildPressureChart(result: OperationalAnalyticsResult) {
  const config: ChartConfig = { ...basePressureConfig };
  result.rationedLimitSeries.forEach((series, index) => {
    config[limitSeriesChartKey(series)] = {
      label: limitSeriesLabel(series),
      theme: pressureSeriesTheme(index),
    };
  });
  const data = result.timeline.map((point) => ({
    ...point,
    ...Object.fromEntries(
      result.rationedLimitSeries.map((series) => [
        limitSeriesChartKey(series),
        point.rationedByLimit[series.key] ?? 0,
      ])
    ),
  }));
  return { config, data };
}

// Plain-language explanations for the Availability Summary KPIs, surfaced
// as hover tooltips. Keep these aligned with the backend definitions in
// packages/backend/src/services/operational-analytics.
const KPI_HELP: Record<string, string> = {
  'Available Now':
    'Tracked items currently available to clients, including items marked Limited Supply or Clearance.',
  'Unavailable Now':
    'Tracked items currently marked Out of Stock and unavailable to clients.',
  'Limited Supply':
    'Available items staff have flagged as Limited Supply. This records supply pressure without guessing its cause.',
  'Clearance':
    'Available items staff have flagged for accelerated distribution.',
  'Repeat Unavailability':
    'Items that moved from Available to Unavailable at least twice during the selected period. Initial and migration states do not count.',
  'Recurring Items':
    'Items with at least two observed Available to Unavailable transitions. A restoration must occur between transitions, so one-time rotating items stay outside this lens.',
  'Repeat Episodes':
    'All observed Available to Unavailable transitions belonging to items in the recurring cohort.',
  'Currently Unavailable':
    'Recurring-cohort episodes that remained open at the end of the selected period.',
  'Recurring Median Restoration':
    'Typical restoration time across completed episodes for recurring items only. Deleted items do not count as restored.',
  'Range Average':
    'The service-minute-weighted average number of distinct Food Item records available across the selected date range.',
  'Latest Service Window':
    'The average number of distinct Food Item records available during the most recent observed pantry service window.',
  'Item Limits':
    'Food items that currently have a per-person or per-household limit — anything other than No Limit.',
  'Category Limits':
    'Categories that currently have a per-person or per-household limit — anything other than No Limit.',
  'Median Restoration':
    'Typical time for an out-of-stock item to come back in stock during the selected period. Half of restorations were faster, half slower.',
};

const formatDuration = (hours: number) => {
  if (hours < 24) return `${hours.toFixed(1)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
};

/*
 * Per-card "Export CSV" and a page-level "Export Raw History" used to live
 * here. That was the primitive export workflow rejected during ideation: a
 * button on every card cluttered the surface and left people unsure how to
 * produce a report at all.
 *
 * The chosen pattern is ZEV's — one "Generate Report" action puts the page in
 * selection mode, cards wiggle and take an order number as you pick them, and a
 * single modal chooses PDF and/or CSV, delivered as one ZIP. That flow already
 * exists in components/reports/selection.tsx and
 * components/reports/generate-report-dialog.tsx; it was mothballed with the
 * rest of the Reports workspace in the #46 rollback, not replaced.
 *
 * These buttons outlived the decision and were still rendering here — eight of
 * them on the Operations lens. Removed so the rejected pattern is not the one
 * on screen while the intended one is revived.
 */

interface OperationalAnalyticsWorkspaceProps {
  showHeader?: boolean;
  range?: AnalyticsDateRange;
}

export function OperationalAnalyticsWorkspace({
  showHeader = true,
  range = DEFAULT_ANALYTICS_RANGE,
}: OperationalAnalyticsWorkspaceProps = {}) {
  const [assortmentCategory, setAssortmentCategory] = React.useState('all');
  type TableView = {
    search: string;
    sort: { id: string; desc: boolean } | null;
    visibleColumns: string[];
    pageSize: number;
    pageIndex: number;
  };
  const [episodeView, setEpisodeView] = React.useState<TableView | null>(null);
  const [rationingView, setRationingView] = React.useState<TableView | null>(null);
  const [result, setResult] = React.useState<OperationalAnalyticsResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const request = React.useMemo(() => ({ ...range }), [range]);
  const pressureChart = React.useMemo(
    () =>
      result ? buildPressureChart(result) : { config: basePressureConfig, data: [] },
    [result]
  );
  const assortmentChart = React.useMemo(
    () =>
      result
        ? buildAssortmentChart(
            result,
            assortmentCategory === 'all' ? null : Number(assortmentCategory)
          )
        : { config: baseAssortmentConfig, data: [], series: [] },
    [assortmentCategory, result]
  );
  const recurringAvailability = React.useMemo(
    () => result?.recurringAvailability.slice(0, 8) ?? [],
    [result]
  );

  React.useEffect(() => {
    let active = true;
    setIsLoading(true);
    operationalReportsService.query(request)
      .then((data) => active && setResult(data))
      .catch((error) => ErrorHandlerService.handleError(error, 'operationalReportsQuery'))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [request]);

  React.useEffect(() => {
    if (
      result &&
      assortmentCategory !== 'all' &&
      !result.assortmentCategorySeries.some(
        (series) => String(series.categoryId) === assortmentCategory
      )
    ) {
      setAssortmentCategory('all');
    }
  }, [assortmentCategory, result]);

  return (
    <TooltipProvider>
    <div className={showHeader ? 'space-y-6 min-w-0 w-full pt-6' : 'space-y-6 min-w-0 w-full'}>
      {showHeader && (
        <div className="w-full min-w-0">
          <SectionHeader
            title="Analytics"
            description="Availability, service pressure, and rationing history from everyday inventory updates."
            icon={PageTitleAnalyticsIcon}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {result
            ? `${format(new Date(`${result.range.startDate}T00:00:00`), 'MMM d, yyyy')} – ${format(new Date(`${result.range.endDate}T00:00:00`), 'MMM d, yyyy')}`
            : 'Loading selected date range…'}
        </p>
      </div>

      {isLoading && !result ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        </div>
      ) : result ? (
        <>
          <SelectableBlock cardId="operations-availability-summary">
            <Card className="min-w-0">
            <CardHeader className="flex flex-col items-start justify-between gap-2 space-y-0 sm:flex-row">
              <div>
                <CardTitle>Availability Summary</CardTitle>
                <CardDescription>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="w-fit cursor-help">
                        Five-minute correction sampling; raw events remain exportable
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72">
                      When the same item is edited several times within five
                      minutes, reports count only the final result, so quick
                      fixes to a mistake don&apos;t read as real activity.
                      Every edit is still saved and included in raw exports.
                    </TooltipContent>
                  </Tooltip>
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center">
                <div className="min-w-0 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Current recorded state; Limited Supply is included in Available Now.
                  </p>
                  <ChartContainer config={summaryChartConfig} className="h-44 min-w-0 w-full">
                    <BarChart
                      accessibilityLayer
                      data={[
                        { metric: 'Available Now', value: result.summary.availableNow, fill: 'var(--color-availableNow)' },
                        { metric: 'Unavailable Now', value: result.summary.unavailableNow, fill: 'var(--color-unavailableNow)' },
                        { metric: 'Limited Supply', value: result.summary.limitedSupplyNow, fill: 'var(--color-limitedSupplyNow)' },
                      ]}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
                      <YAxis dataKey="metric" type="category" width={104} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Bar isAnimationActive={!prefersReducedMotion()} dataKey="value" radius={4} />
                    </BarChart>
                  </ChartContainer>
                  <dl className="sr-only">
                    <div><dt>Available Now</dt><dd>{result.summary.availableNow}</dd></div>
                    <div><dt>Unavailable Now</dt><dd>{result.summary.unavailableNow}</dd></div>
                    <div><dt>Limited Supply</dt><dd>{result.summary.limitedSupplyNow}</dd></div>
                  </dl>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Kpi label="Repeat Unavailability" value={String(result.summary.repeatUnavailableItems)} />
                  <Kpi label="Item Limits" value={String(result.summary.itemRationedNow)} />
                  <Kpi label="Category Limits" value={String(result.summary.categoryRationedNow)} />
                  <Kpi
                    label="Median Restoration"
                    value={result.summary.medianRestorationHours === null ? 'Unknown' : formatDuration(result.summary.medianRestorationHours)}
                  />
                </div>
              </div>
            </CardContent>
            </Card>
          </SelectableBlock>

          {/*
            No wrapping grid. Both of these cards are full width, and the
            two-column grid they used to sit in did nothing but break them:
            SelectableBlock is the grid item, so the `md:col-span-2` on the
            inner Card applied to a non-child and Assortment rendered at half
            width with dead space beside it. They now sit in the page's own
            `space-y-6` flow, like every other full-width card here.
          */}
          <SelectableBlock
            cardId="operations-available-assortment"
            options={{ categoryId: assortmentCategory }}
          >
              <Card className="min-w-0">
              <CardHeader className="flex flex-col items-start justify-between gap-2 space-y-0 sm:flex-row">
                <div>
                  <CardTitle>Available Assortment Over Time</CardTitle>
                  <CardDescription>Combined service-window averages with all-Category or isolated Category trends</CardDescription>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <Select value={assortmentCategory} onValueChange={setAssortmentCategory}>
                    <SelectTrigger aria-label="Assortment Category" className="w-full sm:w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {result.assortmentCategorySeries.map((series) => (
                        <SelectItem key={series.categoryId} value={String(series.categoryId)}>
                          {series.categoryName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid max-w-xl grid-cols-2 gap-4">
                  <Kpi
                    label="Range Average"
                    value={result.summary.averageAvailableAssortment === null
                      ? 'Unknown'
                      : result.summary.averageAvailableAssortment.toFixed(1)}
                  />
                  <Kpi
                    label="Latest Service Window"
                    value={result.summary.latestAvailableAssortment === null
                      ? 'Unknown'
                      : result.summary.latestAvailableAssortment.toFixed(1)}
                  />
                </div>
                <ChartContainer config={assortmentChart.config} className="h-144 min-w-0 w-full sm:h-120">
                  <ComposedChart data={assortmentChart.data}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(value: string) => format(new Date(`${value}T00:00:00`), 'MMM d')} />
                    <YAxis width={34} tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
                    <ChartTooltip content={<ChartTooltipContent sortByValue />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    {assortmentCategory === 'all' ? (
                      <Area isAnimationActive={!prefersReducedMotion()}
                        dataKey="available"
                        type="monotone"
                        stroke="var(--color-available)"
                        strokeWidth={3}
                        fill="var(--color-available)"
                        fillOpacity={0.08}
                        dot={false}
                      />
                    ) : null}
                    {assortmentChart.series.map((series) => {
                      const key = assortmentCategoryChartKey(series.categoryId);
                      return (
                        <Line isAnimationActive={!prefersReducedMotion()}
                          key={series.categoryId}
                          dataKey={key}
                          type="monotone"
                          stroke={`var(--color-${key})`}
                          strokeWidth={2}
                          dot={false}
                        />
                      );
                    })}
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
              </Card>
          </SelectableBlock>

          <SelectableBlock cardId="operations-recurring-availability">
            <Card className="min-w-0">
              <CardHeader className="flex flex-col items-start justify-between gap-2 space-y-0 sm:flex-row">
                <div>
                  <CardTitle>Recurring Availability</CardTitle>
                  <CardDescription>Repeated item cycles; one-time unavailable items remain outside this lens</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {recurringAvailability.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      <Kpi label="Recurring Items" value={String(result.summary.repeatUnavailableItems)} />
                      <Kpi label="Repeat Episodes" value={String(result.summary.recurringUnavailableEntries)} />
                      <Kpi label="Currently Unavailable" value={String(result.summary.recurringOngoingEpisodes)} />
                      <Kpi
                        label="Recurring Median Restoration"
                        value={result.summary.recurringMedianRestorationHours === null
                          ? 'Unknown'
                          : formatDuration(result.summary.recurringMedianRestorationHours)}
                      />
                    </div>

                    {/*
                      Full card width. `max-w-4xl` capped this block at roughly
                      half the card, which stopped the divider under the third
                      KPI and left the fourth stranded above empty space — the
                      chart read as a fragment of a wider one. The item-name
                      axis gets the room a full-width chart can afford.
                    */}
                    <div className="min-w-0 space-y-3 border-t pt-6">
                        <div>
                          <h3 className="font-medium">Items Cycling Most Often</h3>
                          <p className="text-sm text-muted-foreground">Up to eight recurring items, ranked by unavailable entries</p>
                        </div>
                        <ChartContainer config={recurringAvailabilityConfig} className="h-80 min-w-0 w-full">
                          <BarChart
                            accessibilityLayer
                            data={recurringAvailability}
                            layout="vertical"
                            margin={{ left: 8, right: 24 }}
                          >
                            <CartesianGrid horizontal={false} />
                            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
                            <YAxis dataKey="itemName" type="category" width={168} tickLine={false} axisLine={false} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Bar isAnimationActive={!prefersReducedMotion()} dataKey="unavailableEntries" fill="var(--color-unavailableEntries)" radius={3} />
                            <Bar isAnimationActive={!prefersReducedMotion()} dataKey="restorations" fill="var(--color-restorations)" radius={3} />
                          </BarChart>
                        </ChartContainer>
                    </div>
                  </>
                ) : (
                  <div className="flex h-64 items-center justify-center rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No items completed enough availability cycles to enter the recurring cohort in this date range.
                  </div>
                )}
              </CardContent>
            </Card>
          </SelectableBlock>

          <SelectableBlock cardId="operations-operational-pressure">
          <Card className="min-w-0">
            <CardHeader className="flex flex-col items-start justify-between gap-2 space-y-0 sm:flex-row">
              <div>
                <CardTitle>Operational Pressure</CardTitle>
                <CardDescription>Food Item pressure and separate category-policy counts during scheduled service hours</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer config={pressureChart.config} className="h-64 min-w-0 w-full">
                <LineChart data={pressureChart.data}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(value: string) => format(new Date(`${value}T00:00:00`), 'MMM d')} />
                    <YAxis width={34} tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
                    <ChartTooltip content={<ChartTooltipContent sortByValue />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line isAnimationActive={!prefersReducedMotion()} dataKey="limitedSupply" stroke="var(--color-limitedSupply)" dot={false} />
                    <Line isAnimationActive={!prefersReducedMotion()} dataKey="clearance" stroke="var(--color-clearance)" dot={false} />
                    <Line isAnimationActive={!prefersReducedMotion()} dataKey="categoryRationed" stroke="var(--color-categoryRationed)" dot={false} />
                    {result.rationedLimitSeries.map((series) => (
                      <Line isAnimationActive={!prefersReducedMotion()}
                        key={series.key}
                        dataKey={limitSeriesChartKey(series)}
                        stroke={`var(--color-${limitSeriesChartKey(series)})`}
                        dot={false}
                      />
                    ))}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
          </SelectableBlock>

          <SelectableBlock cardId="operations-category-pressure">
            <Card className="min-w-0">
            <CardHeader className="flex flex-col items-start justify-between gap-2 space-y-0 sm:flex-row">
              <div>
                <CardTitle>Category Pressure</CardTitle>
                <CardDescription>Independent service-pressure signals and recurring unavailability by Category</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {result.categoryPressure.length > 0 ? (
                <div className="grid min-w-0 gap-6 xl:grid-cols-2">
                  <div className="min-w-0 space-y-3">
                    <div>
                      <h3 className="font-medium">Recorded Service Pressure</h3>
                      <p className="text-sm text-muted-foreground">Share of each Category&apos;s observed service time with each signal active</p>
                    </div>
                    <ChartContainer config={categoryPressureConfig} className="h-136 min-w-0 w-full">
                      <BarChart
                        accessibilityLayer
                        data={result.categoryPressure}
                        layout="vertical"
                        margin={{ left: 8, right: 16 }}
                      >
                        <CartesianGrid horizontal={false} />
                        <XAxis
                          type="number"
                          domain={[0, 100]}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value: number) => `${value}%`}
                        />
                        <YAxis dataKey="categoryName" type="category" width={112} tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent sortByValue />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar isAnimationActive={!prefersReducedMotion()} dataKey="limitedSupplyServicePercent" fill="var(--color-limitedSupplyServicePercent)" radius={2} />
                        <Bar isAnimationActive={!prefersReducedMotion()} dataKey="clearanceServicePercent" fill="var(--color-clearanceServicePercent)" radius={2} />
                        <Bar isAnimationActive={!prefersReducedMotion()} dataKey="itemRationedServicePercent" fill="var(--color-itemRationedServicePercent)" radius={2} />
                        <Bar isAnimationActive={!prefersReducedMotion()} dataKey="categoryRationedServicePercent" fill="var(--color-categoryRationedServicePercent)" radius={2} />
                      </BarChart>
                    </ChartContainer>
                  </div>

                  <div className="min-w-0 space-y-3">
                    <div>
                      <h3 className="font-medium">Recurring Unavailability</h3>
                      <p className="text-sm text-muted-foreground">Repeat-cycling items and their unavailable entries remain event counts</p>
                    </div>
                    <ChartContainer config={categoryRecurrenceConfig} className="h-136 min-w-0 w-full">
                      <BarChart
                        accessibilityLayer
                        data={result.categoryPressure}
                        layout="vertical"
                        margin={{ left: 8, right: 16 }}
                      >
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
                        <YAxis dataKey="categoryName" type="category" width={112} tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar isAnimationActive={!prefersReducedMotion()} dataKey="recurringItems" fill="var(--color-recurringItems)" radius={3} />
                        <Bar isAnimationActive={!prefersReducedMotion()} dataKey="recurringUnavailableEntries" fill="var(--color-recurringUnavailableEntries)" radius={3} />
                      </BarChart>
                    </ChartContainer>
                  </div>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No Category pressure observations are available in this date range.
                </div>
              )}
            </CardContent>
            </Card>
          </SelectableBlock>

          <SelectableBlock
            cardId="operations-unavailable-episodes"
            options={episodeView ?? undefined}
          >
            <div className="space-y-3">
              <DetailHeader title="Unavailable Episodes" description="Each recorded period when an item was unavailable" />
              <EnhancedDataTable columns={episodeColumns} data={result.episodes} isLoading={isLoading} filterColumn="itemName" filterPlaceholder="Filter items..." onViewStateChange={setEpisodeView} />
            </div>
          </SelectableBlock>

          <SelectableBlock
            cardId="operations-rationing-history"
            options={rationingView ?? undefined}
          >
            <div className="space-y-3">
              <DetailHeader title="Rationing History" description="Item and category limit-policy changes" />
              <EnhancedDataTable columns={limitColumns} data={result.limitChanges} isLoading={isLoading} filterColumn="entityName" filterPlaceholder="Filter items or categories..." onViewStateChange={setRationingView} />
            </div>
          </SelectableBlock>
        </>
      ) : null}
    </div>
    </TooltipProvider>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  const help = KPI_HELP[label];
  return (
    <div className="space-y-1">
      {help ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <p tabIndex={0} className="w-fit cursor-help text-sm text-muted-foreground">{label}</p>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{help}</TooltipContent>
        </Tooltip>
      ) : (
        <p className="text-sm text-muted-foreground">{label}</p>
      )}
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DetailHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// Sortable header, matching the ghost-button + ArrowUpDown pattern used by
// the management tables (e.g. category-management/data-table/columns.tsx).
function sortableHeader<TData>(label: string): ColumnDef<TData>['header'] {
  return ({ column }) => <SortableHeader column={column}>{label}</SortableHeader>;
}

const episodeColumns: ColumnDef<UnavailableEpisode>[] = [
  { accessorKey: 'itemName', header: sortableHeader('Name') },
  { accessorKey: 'categoryName', header: sortableHeader('Category') },
  { accessorKey: 'startedAt', header: sortableHeader('Unavailable Since'), cell: ({ row }) => formatDateTime(row.original.startedAt) },
  {
    accessorKey: 'endedAt',
    header: sortableHeader('Available Again'),
    cell: ({ row }) => row.original.endedAt ? formatDateTime(row.original.endedAt) : 'Ongoing',
    // Ongoing episodes (null endedAt) sort as the most recent end.
    sortingFn: (a, b) => (a.original.endedAt ?? '￿').localeCompare(b.original.endedAt ?? '￿'),
  },
  { accessorKey: 'durationHours', header: sortableHeader('Duration'), cell: ({ row }) => formatDuration(row.original.durationHours) },
  { accessorKey: 'resolution', header: sortableHeader('Resolution'), cell: ({ row }) => ({ restored: 'Restored', deleted: 'Item deleted', open_at_range_end: 'Ongoing' }[row.original.resolution]) },
];

const limitColumns: ColumnDef<LimitChange>[] = [
  { accessorKey: 'entityName', header: sortableHeader('Name') },
  { accessorKey: 'entityType', header: sortableHeader('Type'), cell: ({ row }) => row.original.entityType === 'food_item' ? 'Food Item' : 'Category' },
  { accessorKey: 'categoryName', header: sortableHeader('Category'), cell: ({ row }) => row.original.categoryName ?? '—' },
  { accessorKey: 'limit', header: sortableHeader('Limit'), cell: ({ row }) => row.original.isNoLimit ? 'No Limit' : row.original.limit },
  { accessorKey: 'limitType', header: sortableHeader('Applies To'), cell: ({ row }) => row.original.isNoLimit ? '—' : row.original.limitType === 'person' ? 'Per Person' : 'Per Household' },
  { accessorKey: 'recordedAt', header: sortableHeader('Changed'), cell: ({ row }) => formatDateTime(row.original.recordedAt) },
];
