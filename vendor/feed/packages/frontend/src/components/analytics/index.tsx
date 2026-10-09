// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { prefersReducedMotion } from '@/lib/reduced-motion'
import { trimSeriesToData } from '@/lib/chart-series'
import { bucketLabeller } from '@/lib/formatting/bucket-label'
import { FootnoteList } from '@/components/analytics/footnote'
import { useCategoryAxis } from '@/lib/chart-axis'
import { formatAxisMoney } from '@/lib/formatting/number'
import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  Database,
  PackageOpen,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { DateRangeControl } from '@/components/shared/date-range-control';
import { RANGE_URL_VALUES, dateRangeFromSearchParams } from '@/lib/date-range';
import { createPageTitleIcon } from '@/components/layout/page-title-icon';
import { OperationalAnalyticsWorkspace } from '@/components/operational-reports';
import { SectionHeader } from '@/components/shared/section-header';
import { ChartNoAxesCombinedIcon } from '@/components/ui/chart-no-axes-combined';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Input } from '@/components/ui/input';
import { SearchIcon, type SearchIconHandle } from '@/components/ui/search';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useTheme } from 'next-themes';
import {
  carbonCategoricalTheme,
  carbonChartColors,
  carbonTheme,
  type CarbonFamily,
  type CarbonGrade,
} from '@/lib/colors';
import { ServiceAnalyticsLens } from './service-analytics'
import { ClientAnalyticsLens } from './client-analytics';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { useTerminology } from '@/contexts/TerminologyContext';
import { procurementService } from '@/services/procurement';
import type {
  AcquisitionClass,
  FreshAllianceCategorySummary,
  FreshAllianceDonorCategorySummary,
  PaidProcurementProductSummary,
  ProcurementAnalytics,
  ProcurementChannel,
  ProcurementWarehouseProductSummary,
} from '@/types/procurement';
import type { AnalyticsDateRange } from '@/types/analytics';
import { DEFAULT_ANALYTICS_RANGE } from '@/types/analytics';
import { CommunityDonationAnalytics } from './community-analytics';
import { DonorAnalytics } from './donor-analytics';
import {
  ReportSelectionProvider,
  SelectableBlock,
  useReportSelection,
} from '@/components/reports/selection';
import { AnalyticsReportDialog, type ReportFilterContext } from './report-dialog';
import { FileChartColumnIcon } from '@/components/ui/file-chart-column';
import { SortableHeader } from "@/components/ui/sortable-header"
import { formatDate } from '@/lib/formatting/date';
import { formatAxisNumber } from '@/lib/formatting/number';

const PageTitleAnalyticsIcon = createPageTitleIcon(ChartNoAxesCombinedIcon);

const acquisitionMixConfig = {
  weight: { label: 'Inbound Weight', theme: carbonTheme('blue') },
} satisfies ChartConfig;

const channelMixConfig = {
  primaryWeight: { label: 'Received', theme: carbonTheme('teal') },
  // Fresh Alliance partners' pre-Primarius history, stacked onto the FFA bar so
  // it reflects the whole relationship, not just the years OFB recorded (D16).
  legacyWeight: { label: 'Legacy partner history', theme: carbonTheme('magenta') },
} satisfies ChartConfig;

const monthlyWeightConfig = {
  donatedWeight: { label: 'Donated', theme: carbonTheme('green') },
  purchDonWeight: { label: 'Purch-Don', theme: carbonTheme('teal') },
  governmentWeight: { label: 'Government', theme: carbonTheme('purple') },
  purchasedWeight: { label: 'Purchased', theme: carbonTheme('orange') },
} satisfies ChartConfig;

const channelMonthlyWeightConfig = {
  ofbWarehouseWeight: { label: 'OFB Warehouse', theme: carbonTheme('blue') },
  freshAllianceWeight: { label: 'Fresh Food Alliance', theme: carbonTheme('green') },
  // Its own line, color, and legend entry so the pre-Primarius record reads as
  // a distinct source rather than merging into an OFB series (D16).
  communityDonationWeight: { label: 'Donations (Legacy Data)', theme: carbonTheme('magenta') },
} satisfies ChartConfig;

const paidProductSpendConfig = {
  spendDollars: { label: 'Paid Product Charges', theme: carbonTheme('blue') },
} satisfies ChartConfig;

const acquisitionLabels: Record<AcquisitionClass, string> = {
  DONATED: 'Donated',
  'PURCH-DON': 'Purch-Don',
  GOVERNMENT: 'Government',
  PURCHASED: 'Purchased',
};

const channelLabels: Record<ProcurementChannel, string> = {
  ofb_warehouse: 'OFB Warehouse',
  fresh_alliance: 'Fresh Food Alliance',
  community_donation: 'Donations (Legacy Data)',
};

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Plain wording for the range, shown in the report modal. */
const RANGE_SUMMARY_LABELS: Record<string, string> = {
  'last-7-days': 'Last 7 days',
  'last-30-days': 'Last 30 days',
  'last-90-days': 'Last 90 days',
  ytd: 'Year to date',
  all: 'All recorded history',
};
const toPounds = (hundredths: number) => hundredths / 100;
// Dates in tables come from the shared formatter (lib/formatting/date). This
// used to be a local helper whose comment claimed FEED's standard was
// zero-padded MM/DD/YYYY, citing the shopping-list and AI-configuration tables
// as evidence — but AI Configuration used a bare toLocaleDateString(), which
// drops the zeros. The survey was real and the conclusion was wrong, which is
// why the format now lives in one importable place instead of a comment.
// Chart axes keep the compact "MMM d": an axis is a scale, not a record.
const tableDate = (iso: string) => formatDate(iso);
const pounds = (hundredths: number | null) =>
  hundredths === null
    ? 'Unknown'
    : `${toPounds(hundredths).toLocaleString(undefined, { maximumFractionDigits: 2 })} lb`;
const dollars = (cents: number) =>
  (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const attributableDollars = (cents: number | null) =>
  cents === null ? 'Not attributable' : dollars(cents);
const shortenedProductName = (description: string) =>
  description.length > 34 ? `${description.slice(0, 31)}…` : description;
const MAX_PAID_PRODUCT_SEARCH_RESULTS = 25;
/** Client-side key for rows with no donor on file, so it can live in a plain
 *  string[] selection array alongside real donor codes. Never sent to the
 *  server or presented as a real donor identity. */
const NOT_REPORTED_DONOR_CODE = '__not_reported__';

export function buildSeasonalYearChartConfig(
  years: string[],
  currentYear: number
): ChartConfig {
  const paletteSize = 20;

  return Object.fromEntries(years.map((year) => {
    const numericYear = Number.parseInt(year, 10);
    const yearOffset = Number.isFinite(numericYear) ? currentYear - numericYear : 0;
    const colorIndex = ((yearOffset % paletteSize) + paletteSize) % paletteSize;

    return [year, { label: year, theme: carbonCategoricalTheme(colorIndex) }];
  })) satisfies ChartConfig;
}

/**
 * Groups a paid product by the family prefix in its OFB description, e.g.
 * "Meals, Beef Stew 12/24oz" -> "Meals".
 *
 * This is a **display grouping derived from the product description**, not a
 * taxonomy Oregon Food Bank publishes as a field. It exists so the long tail of
 * paid products can be read at a glance. It must never be presented as an OFB
 * category, and a description without a recognizable prefix stays
 * "Unclassified" rather than being forced into a bucket.
 */
export function productFamily(description: string): string {
  const match = /^([^,]{2,40}),/.exec(description.trim());
  if (!match) return UNCLASSIFIED_FAMILY;
  const family = match[1].trim();
  return family.length > 0 ? family : UNCLASSIFIED_FAMILY;
}

export const UNCLASSIFIED_FAMILY = 'Unclassified';

/**
 * Fixed color assignment per product family, so a color always means the same
 * family everywhere it appears — this chart's bars, its legend, and its
 * aggregate-row tooltip — regardless of which families the current filter or
 * search happens to include or how they rank by spend. An index-based palette
 * (assign color N to whichever family is Nth by spend) would reassign colors
 * every time the visible family set changed, which defeats the point of a
 * legend.
 *
 * Order and shares reflect the real OFB Warehouse paid-product corpus profiled
 * during development (Meals 17%, Condiment 15%, Meat 13%, Other Protein 12%,
 * Fruit 9%, Dairy 9%, Veg 6%, Non-Food 6%, Grains 5%, Cereal 4%, Bev 2%,
 * Beans 2%, Pasta 1%, Rice 1%). The nine non-gray Carbon hue families each
 * take one slot at `primary` grade first (hue-hopped for maximum adjacent
 * contrast), then the remaining families repeat those hues at `secondary`
 * grade. `Unclassified` is pinned to `warmGray` — reserved, never assigned to
 * a real family — so a muted, deliberately unsaturated color visually marks
 * "not a real category" rather than looking like one.
 */
const FAMILY_COLOR_ASSIGNMENTS: Record<string, { family: CarbonFamily; grade: CarbonGrade }> = {
  Meals: { family: 'blue', grade: 'primary' },
  Condiment: { family: 'magenta', grade: 'primary' },
  Meat: { family: 'teal', grade: 'primary' },
  'Other Protein': { family: 'orange', grade: 'primary' },
  Fruit: { family: 'purple', grade: 'primary' },
  Dairy: { family: 'green', grade: 'primary' },
  Veg: { family: 'yellow', grade: 'primary' },
  'Non-Food': { family: 'cyan', grade: 'primary' },
  Grains: { family: 'red', grade: 'primary' },
  Cereal: { family: 'blue', grade: 'secondary' },
  Bev: { family: 'magenta', grade: 'secondary' },
  Beans: { family: 'teal', grade: 'secondary' },
  Pasta: { family: 'orange', grade: 'secondary' },
  Rice: { family: 'purple', grade: 'secondary' },
  [UNCLASSIFIED_FAMILY]: { family: 'warmGray', grade: 'primary' },
};

/** Non-gray hues, both grades, in the same hue-hopped order as the fixed
 *  family assignments above — excludes `warmGray` so a hashed fallback can
 *  never collide with a reserved "not really a category" color. Shared by
 *  every open-label-set color assignment in this file (product families
 *  outside the profiled set, and donors — D5: the donor roster has no fixed
 *  enum, so it never gets a hand-curated table the way families did). */
const CATEGORICAL_COLOR_FALLBACK_SLOTS: Array<{ family: CarbonFamily; grade: CarbonGrade }> = [
  'blue', 'magenta', 'teal', 'orange', 'purple', 'green', 'yellow', 'cyan', 'red',
].flatMap((family) => ([
  { family: family as CarbonFamily, grade: 'primary' as CarbonGrade },
  { family: family as CarbonFamily, grade: 'secondary' as CarbonGrade },
]));

/** Deterministic, stable per-label slot index — same label always lands on
 *  the same fallback color, across renders and sessions, without needing a
 *  hand-curated table. */
function hashLabel(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Assigns a stable color to any family label, including one this list has
 * never seen. A future OFB export could introduce a product-description
 * prefix outside the profiled set; rather than let that family silently
 * borrow another family's color (or fall through to the reserved gray), it
 * gets a deterministic hash-based slot from the same palette so its color is
 * still fixed and repeatable across renders, just not hand-picked.
 */
function familyColorAssignment(label: string): { family: CarbonFamily; grade: CarbonGrade } {
  const known = FAMILY_COLOR_ASSIGNMENTS[label];
  if (known) return known;
  return CATEGORICAL_COLOR_FALLBACK_SLOTS[hashLabel(label) % CATEGORICAL_COLOR_FALLBACK_SLOTS.length];
}

export function familyColorTheme(label: string): Record<'light' | 'dark', string> {
  const { family, grade } = familyColorAssignment(label);
  return carbonTheme(family, grade);
}

export function familyColorHex(label: string, scheme: 'light' | 'dark'): string {
  const { family, grade } = familyColorAssignment(label);
  return carbonChartColors[family][grade][scheme];
}

const NOT_REPORTED_DONOR_LABEL = 'Not Reported';

/**
 * Assigns a stable color to any donor name. Unlike product families, the
 * donor roster is deliberately open (D5: no fixed enum, no seeded partner
 * list — partners start and stop) so there is no hand-curated table to
 * consult; every real donor goes through the same hash-based fallback.
 * "Not Reported" (a category row with no donor on file) is pinned to
 * `warmGray`, the same reserved, muted "not really a category" treatment
 * `Unclassified` gets for product families.
 */
function donorColorAssignment(donorName: string): { family: CarbonFamily; grade: CarbonGrade } {
  if (donorName === NOT_REPORTED_DONOR_LABEL) return { family: 'warmGray', grade: 'primary' };
  return CATEGORICAL_COLOR_FALLBACK_SLOTS[hashLabel(donorName) % CATEGORICAL_COLOR_FALLBACK_SLOTS.length];
}

export function donorColorTheme(donorName: string): Record<'light' | 'dark', string> {
  const { family, grade } = donorColorAssignment(donorName);
  return carbonTheme(family, grade);
}

export function donorColorHex(donorName: string, scheme: 'light' | 'dark'): string {
  const { family, grade } = donorColorAssignment(donorName);
  return carbonChartColors[family][grade][scheme];
}


/** Chart config keys become CSS custom property names, so labels are slugged. */
export function familyCssKey(family: string): string {
  return `fam_${family.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
}

export interface PaidProductSpendDatum {
  product: string;
  fullDescription: string;
  spendDollars: number;
  spendShare: number;
  productCount: number;
  family: string;
  /** Present only on the aggregate row: spend per family inside it. */
  familyBreakdown?: Array<{ family: string; spendDollars: number }>;
}

export interface PaidProductChartSegment {
  family: string;
  spendDollars: number;
}

export interface PaidProductChartRow {
  product: string;
  fullDescription: string;
  spendDollars: number;
  spendShare: number;
  productCount: number;
  /** One entry for an ordinary product row; several for the aggregate row. */
  segments: PaidProductChartSegment[];
}

/**
 * Reshapes spend rows into the segments a stacked bar draws.
 *
 * Recharts' native per-series `stackId` stacking is unreliable at this
 * cardinality — a 14-series stack over this data renders no geometry at all,
 * a documented Recharts bug (recharts/recharts#3883, "Stacked Bar Chart
 * disappears when stackId is added for complex datasets"), reproduced here
 * even after eliminating undefined per-series values. Rather than keep
 * fighting that mechanism, the bar uses a single series with a custom `shape`
 * that draws each row's segments as adjacent `<rect>`s sized from
 * `segments` directly — full control, and it never touches Recharts' stack
 * math at all.
 */
export function buildPaidProductChartSeries(data: PaidProductSpendDatum[]): {
  rows: PaidProductChartRow[];
  families: Array<{ key: string; label: string }>;
} {
  const families: Array<{ key: string; label: string }> = [];
  const noteFamily = (label: string) => {
    const key = familyCssKey(label);
    if (!families.some((entry) => entry.key === key)) families.push({ key, label });
  };

  const rows: PaidProductChartRow[] = data.map((datum) => {
    const segments = datum.familyBreakdown && datum.familyBreakdown.length > 0
      ? datum.familyBreakdown
      : [{ family: datum.family, spendDollars: datum.spendDollars }];
    for (const segment of segments) noteFamily(segment.family);
    return {
      product: datum.product,
      fullDescription: datum.fullDescription,
      spendDollars: datum.spendDollars,
      spendShare: datum.spendShare,
      productCount: datum.productCount,
      segments,
    };
  });

  // Order families by total spend so the legend and segment order read
  // consistently with the rest of the chart.
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const segment of row.segments) {
      totals.set(segment.family, (totals.get(segment.family) ?? 0) + segment.spendDollars);
    }
  }
  families.sort((left, right) => (totals.get(right.label) ?? 0) - (totals.get(left.label) ?? 0));

  return { rows, families };
}

export interface FreshAllianceCategoryMixSegment {
  donor: string;
  weightPounds: number;
}

export interface FreshAllianceCategoryMixRow {
  category: string;
  fullDescription: string;
  weightPounds: number;
  segments: FreshAllianceCategoryMixSegment[];
}

/**
 * Groups (donor, category) rows back up into one bar per reporting category,
 * each segmented by donor. Unlike the paid-products chart there are only a
 * handful of Fresh Alliance categories (8 in the profiled corpus) and every
 * one is genuinely multi-donor, so there is no "top N + aggregate" cutoff
 * here — every category gets a real stack, not a lone bar plus one grouped
 * long tail.
 */
export function buildFreshAllianceCategoryMixSeries(
  rows: FreshAllianceDonorCategorySummary[]
): {
  rows: FreshAllianceCategoryMixRow[];
  donors: Array<{ key: string; label: string }>;
} {
  const donors: Array<{ key: string; label: string }> = [];
  const noteDonor = (label: string) => {
    const key = familyCssKey(label);
    if (!donors.some((entry) => entry.key === key)) donors.push({ key, label });
  };

  const byCategory = new Map<string, { fullDescription: string; segments: Map<string, number> }>();
  for (const row of rows) {
    const category = row.description.replace(/\s*\(Fresh Alliance\)\s*$/i, '');
    const entry = byCategory.get(category) ?? { fullDescription: row.description, segments: new Map() };
    entry.segments.set(row.donorName, (entry.segments.get(row.donorName) ?? 0) + toPounds(row.totalWeightHundredths));
    byCategory.set(category, entry);
    noteDonor(row.donorName);
  }

  const categoryRows: FreshAllianceCategoryMixRow[] = [...byCategory.entries()].map(
    ([category, { fullDescription, segments }]) => {
      const sortedSegments = [...segments.entries()]
        .map(([donor, weightPounds]) => ({ donor, weightPounds }))
        .sort((left, right) => right.weightPounds - left.weightPounds);
      return {
        category,
        fullDescription,
        weightPounds: sortedSegments.reduce((sum, segment) => sum + segment.weightPounds, 0),
        segments: sortedSegments,
      };
    }
  ).sort((left, right) => right.weightPounds - left.weightPounds);

  // Order the legend by total weight across all categories, matching the
  // paid-product family legend's convention.
  const donorTotals = new Map<string, number>();
  for (const row of categoryRows) {
    for (const segment of row.segments) {
      donorTotals.set(segment.donor, (donorTotals.get(segment.donor) ?? 0) + segment.weightPounds);
    }
  }
  donors.sort((left, right) => (donorTotals.get(right.label) ?? 0) - (donorTotals.get(left.label) ?? 0));

  return { rows: categoryRows, donors };
}

interface GenericBarSegment {
  /** CSS-safe key: both the React key and the `var(--color-{key})` fill lookup. */
  key: string;
  value: number;
}

/**
 * Draws one row's segments as adjacent rects instead of relying on Recharts'
 * per-series stacking. Recharts' native `stackId` stacking is unreliable at
 * the cardinality either chart in this file needs — a many-series stack over
 * this kind of data renders no geometry at all, a documented Recharts bug
 * (recharts/recharts#3883, "Stacked Bar Chart disappears when stackId is
 * added for complex datasets"), reproduced during development even after
 * eliminating undefined per-series values. Every stacked bar in this file
 * uses this one geometry function instead of fighting that mechanism a
 * second time per chart.
 *
 * A shared rounded clip path gives the whole bar rounded outer corners while
 * interior segment boundaries stay square, matching how a real stacked bar
 * reads. Recharts computes `x`/`width` for the underlying single-series `Bar`
 * exactly as it would for a plain flat-colored bar, so a row with one segment
 * fills the same rect a non-stacked bar would have.
 */
function renderStackedBarSegments(
  segments: GenericBarSegment[],
  x: number,
  y: number,
  width: number,
  height: number,
  clipId: string
): React.ReactElement {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  // A returned element is required, not null, for the degenerate case (a
  // zero-width bar has nothing to draw) -- Recharts' shape type demands it.
  if (width <= 0 || height <= 0 || total <= 0) return <g />;

  let cursor = x;
  return (
    <g>
      <clipPath id={clipId}>
        <rect x={x} y={y} width={width} height={height} rx={3} ry={3} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {segments.map((segment) => {
          const segmentWidth = (segment.value / total) * width;
          const rectX = cursor;
          cursor += segmentWidth;
          return (
            <rect
              key={segment.key}
              x={rectX}
              y={y}
              width={Math.max(segmentWidth, 0)}
              height={height}
              fill={`var(--color-${segment.key})`}
            />
          );
        })}
      </g>
    </g>
  );
}

interface PaidProductBarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  payload?: PaidProductChartRow;
}

// Recharts types its `shape` render-prop input as `unknown` (it is spread
// from internal state, not a typed public API), so the specific prop shape
// is asserted here rather than accepted as the parameter type directly.
function PaidProductBarShape(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, payload } = props as PaidProductBarShapeProps;
  const segments = (payload?.segments ?? []).map((segment) => ({
    key: familyCssKey(segment.family),
    value: segment.spendDollars,
  }));
  return renderStackedBarSegments(segments, x, y, width, height, `paid-product-bar-clip-${index}`);
}

interface FreshAllianceCategoryBarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  payload?: FreshAllianceCategoryMixRow;
}

function FreshAllianceCategoryBarShape(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, payload } =
    props as FreshAllianceCategoryBarShapeProps;
  const segments = (payload?.segments ?? []).map((segment) => ({
    key: familyCssKey(segment.donor),
    value: segment.weightPounds,
  }));
  return renderStackedBarSegments(segments, x, y, width, height, `fresh-alliance-category-bar-clip-${index}`);
}

export interface PaidProductSearchResult {
  data: PaidProductSpendDatum[];
  matchCount: number;
}

function toPaidProductSpendDatum(
  product: PaidProcurementProductSummary,
  totalSpendCents: number
): PaidProductSpendDatum {
  return {
    product: shortenedProductName(product.description),
    fullDescription: `${product.description} (${product.productCode})`,
    spendDollars: product.totalSpendCents / 100,
    spendShare: totalSpendCents > 0
      ? product.totalSpendCents / totalSpendCents
      : 0,
    productCount: 1,
    family: productFamily(product.description),
  };
}

export function buildPaidProductSpendData(
  paidProducts: PaidProcurementProductSummary[]
): PaidProductSpendDatum[] {
  const totalSpendCents = paidProducts.reduce(
    (sum, product) => sum + product.totalSpendCents,
    0
  );
  const topProducts = paidProducts
    .slice(0, 15)
    .map((product) => toPaidProductSpendDatum(product, totalSpendCents));
  const remainingProducts = paidProducts.slice(15);
  const remainingSpendCents = remainingProducts.reduce(
    (sum, product) => sum + product.totalSpendCents,
    0
  );

  if (remainingSpendCents > 0) {
    const productCountLabel = remainingProducts.length === 1 ? 'code' : 'codes';
    // Individually these products are hairlines -- the largest is around 1% of
    // paid spend and the average is far less -- so stacking them by product
    // would be unreadable. Grouping the tail by family keeps the bar legible
    // and answers what the aggregate actually contains.
    const familySpend = new Map<string, number>();
    for (const product of remainingProducts) {
      const family = productFamily(product.description);
      familySpend.set(family, (familySpend.get(family) ?? 0) + product.totalSpendCents);
    }
    topProducts.push({
      product: `Other paid products (${remainingProducts.length} ${productCountLabel})`,
      fullDescription: `All remaining ${remainingProducts.length} paid OFB Warehouse product ${productCountLabel}`,
      spendDollars: remainingSpendCents / 100,
      spendShare: totalSpendCents > 0
        ? remainingSpendCents / totalSpendCents
        : 0,
      productCount: remainingProducts.length,
      family: UNCLASSIFIED_FAMILY,
      familyBreakdown: [...familySpend.entries()]
        .map(([family, cents]) => ({ family, spendDollars: cents / 100 }))
        .sort((left, right) => right.spendDollars - left.spendDollars),
    });
  }

  return topProducts;
}

export function buildPaidProductSearchResult(
  paidProducts: PaidProcurementProductSummary[],
  query: string,
  limit = MAX_PAID_PRODUCT_SEARCH_RESULTS
): PaidProductSearchResult {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const totalSpendCents = paidProducts.reduce(
    (sum, product) => sum + product.totalSpendCents,
    0
  );
  const matches = paidProducts.filter((product) =>
    product.description.toLocaleLowerCase().includes(normalizedQuery) ||
    product.productCode.toLocaleLowerCase().includes(normalizedQuery)
  );

  return {
    data: matches
      .slice(0, limit)
      .map((product) => toPaidProductSpendDatum(product, totalSpendCents)),
    matchCount: matches.length,
  };
}

function PaidProductSearch({
  value,
  onChange,
  matchCount,
  displayedCount,
}: {
  value: string;
  onChange: (value: string) => void;
  matchCount: number;
  displayedCount: number;
}) {
  const searchIconRef = React.useRef<SearchIconHandle>(null);
  const hasQuery = value.trim().length > 0;

  React.useEffect(() => {
    searchIconRef.current?.startAnimation();
  }, []);

  const playSearchIcon = React.useCallback(() => {
    searchIconRef.current?.startAnimation();
  }, []);

  return (
    <div className="flex w-full flex-col gap-2 sm:max-w-md">
      <div
        className="relative"
        onMouseEnter={playSearchIcon}
        onClick={playSearchIcon}
      >
        <SearchIcon
          ref={searchIconRef}
          size={16}
          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Search paid products"
          placeholder="Search product name or OFB code..."
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pl-9"
        />
      </div>
      {hasQuery && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {matchCount > displayedCount
            ? `Showing the top ${displayedCount.toLocaleString()} of ${matchCount.toLocaleString()} matching product codes.`
            : `${matchCount.toLocaleString()} matching product ${matchCount === 1 ? 'code' : 'codes'}.`}
        </p>
      )}
    </div>
  );
}

/**
 * The ZEV entry point: one action, not a button per card.
 *
 * "Generate Report" puts the page into selection mode; cards wiggle and take an
 * order number as they are picked; "Review N cards" opens the single modal that
 * chooses PDF and/or CSV. The per-card export buttons this replaces were
 * rejected during ideation for cluttering the surface and obscuring how to
 * produce a report at all.
 */
function ReportToolbar({ filters }: { filters: ReportFilterContext }) {
  const { isSelecting, selectedIds, startSelecting, cancelSelecting, clearSelection } =
    useReportSelection();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const titles: Record<string, string> = {
    'procurement-inbound-supply-summary': 'Inbound Supply Summary',
    'procurement-paid-summary': 'Paid Procurement Summary',
    'procurement-acquisition-mix': 'Acquisition Mix',
    'procurement-channels': 'Procurement Channels',
    'procurement-inbound-weight-over-time': 'Inbound Weight Over Time',
    'procurement-spend-over-time': 'OFB Spending Over Time',
    'procurement-paid-product-spend': 'Where Paid Procurement Dollars Went',
    'procurement-seasonal-inbound-weight': 'Seasonal Inbound Weight',
    'procurement-fresh-alliance-category-mix': 'Fresh Food Alliance Category Mix',
    'operations-availability-summary': 'Availability Summary',
    'operations-category-pressure': 'Category Pressure',
    'operations-available-assortment': 'Available Assortment Over Time',
    'operations-unavailable-episodes': 'Unavailable Episodes',
    'operations-rationing-history': 'Rationing History',
    'procurement-warehouse-product-history': 'OFB Warehouse Product History',
    'procurement-fresh-alliance-receipt-categories': 'Fresh Food Alliance Receipt Categories',
    'operations-recurring-availability': 'Recurring Availability',
    'operations-operational-pressure': 'Operational Pressure',
    'procurement-grocery-partner-mix': 'Grocery Partner Mix',
    'procurement-donated-value': 'Recorded Donated Value',
    'procurement-fresh-alliance-pickup-history': 'Fresh Food Alliance Pickup History',
    'procurement-fresh-alliance-donations-over-time': 'Fresh Food Alliance Donations Over Time',
    'procurement-legacy-donation-history': 'Donation History From Legacy Data',
    'procurement-legacy-donations-over-time': 'Other Donations Over Time (Legacy Data)',
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isSelecting ? (
        <Button variant="outline" size="sm" onClick={startSelecting}>
          {/* Same mark as the Reports page, so the action and its destination
              read as one feature. */}
          <FileChartColumnIcon size={16} className="mr-2" />
          Generate Report
        </Button>
      ) : (
        <>
          <Button size="sm" disabled={selectedIds.length === 0} onClick={() => setDialogOpen(true)}>
            Review {selectedIds.length} card{selectedIds.length === 1 ? '' : 's'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { clearSelection(); cancelSelecting(); }}>
            Cancel
          </Button>
          <span className="text-sm text-muted-foreground">
            Choose the cards to include, in order.
          </span>
        </>
      )}

      <AnalyticsReportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        titles={titles}
        filters={filters}
        onGenerated={() => { clearSelection(); cancelSelecting(); }}
      />
    </div>
  );
}

export function AnalyticsWorkspace() {
  const terminology = useTerminology();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  const tabParam = searchParams.get('tab');
  const activeTab =
    tabParam === 'procurement' || tabParam === 'service' || tabParam === 'clients'
      ? tabParam
      : 'operations';
  const range = React.useMemo(
    () => dateRangeFromSearchParams(searchParams),
    // The serialized query is the stable source of truth for the range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchKey]
  );

  const updateSearchParams = React.useCallback((update: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    update(next);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // The report is generated against exactly what the page is showing, so both
  // come from the URL — the same source ProcurementAnalyticsWorkspace reads.
  const reportChannel = (() => {
    const value = searchParams.get('channel');
    return value === 'ofb_warehouse' || value === 'fresh_alliance' ? value : undefined;
  })();
  const reportRangeSummary =
    range.preset === 'custom' && range.startDate && range.endDate
      ? `${range.startDate} – ${range.endDate}`
      : RANGE_SUMMARY_LABELS[range.preset] ?? range.preset;

  // Operations is the default lens, so it stays absent from the URL; any other
  // lens is named, which also makes a Service view shareable as a link.
  const setActiveTab = (tab: string) => updateSearchParams((next) => {
    if (tab === 'procurement' || tab === 'service' || tab === 'clients') next.set('tab', tab);
    else next.delete('tab');
  });

  const setRange = (nextRange: AnalyticsDateRange) => updateSearchParams((next) => {
    next.set('range', RANGE_URL_VALUES[nextRange.preset]);
    if (nextRange.preset === 'custom' && nextRange.startDate && nextRange.endDate) {
      next.set('from', nextRange.startDate);
      next.set('to', nextRange.endDate);
    } else {
      next.delete('from');
      next.delete('to');
    }
  });

  return (
    <ReportSelectionProvider>
    <div className="space-y-6 min-w-0 w-full pt-6">
      <SectionHeader
        title="Analytics"
        description={terminology.format('Inventory, supply, and {pantry} service, kept in distinct analytical lenses.')}
        icon={PageTitleAnalyticsIcon}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0">
        {/* Sticky beneath the app header (h-16) so the tab switcher and date
            range stay reachable across a long scroll of Procurement cards.
            Translucent + blurred to match the one existing sticky-content
            treatment in the app (GuideToc) rather than an opaque bar. */}
        <div className="sticky top-16 z-30 -mx-4 space-y-4 border-b border-border/70 bg-background/40 px-4 py-4 backdrop-blur-[14px] backdrop-saturate-150 supports-backdrop-filter:bg-background/40 sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="grid h-auto w-full grid-cols-4 sm:w-[600px]">
              <TabsTrigger value="operations">Operations</TabsTrigger>
              <TabsTrigger value="procurement">Procurement</TabsTrigger>
              <TabsTrigger value="service">Service</TabsTrigger>
              <TabsTrigger value="clients">{terminology.format('{Clients}')}</TabsTrigger>
            </TabsList>
            {/* Both lenses now have registered cards, so the action is
                unconditional. Selection persists across the tabs, so a report
                can mix Operations and Procurement cards. */}
            {(
              <ReportToolbar
                filters={{
                  preset: range.preset,
                  startDate: range.startDate,
                  endDate: range.endDate,
                  channel: reportChannel,
                  summary: reportRangeSummary,
                }}
              />
            )}
          </div>
          <DateRangeControl value={range} onChange={setRange} />
        </div>
        <TabsContents>
          <TabsContent value="operations" className="pt-4">
            <OperationalAnalyticsWorkspace showHeader={false} range={range} />
          </TabsContent>
          <TabsContent value="procurement" className="pt-4">
            <ProcurementAnalyticsWorkspace range={range} />
          </TabsContent>
          <TabsContent value="service" className="pt-4">
            <ServiceAnalyticsLens range={range} />
          </TabsContent>
          <TabsContent value="clients" className="pt-4">
            <ClientAnalyticsLens range={range} />
          </TabsContent>
        </TabsContents>
      </Tabs>
    </div>
    </ReportSelectionProvider>
  );
}

export function ProcurementAnalyticsWorkspace({
  range = DEFAULT_ANALYTICS_RANGE,
}: {
  range?: AnalyticsDateRange;
} = {}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // ChartContainer scopes its color CSS variables to a per-instance
  // [data-chart=id] selector, and Recharts requires ChartContainer's only
  // child to be the chart itself — there's nowhere to mount a legend that
  // would inherit those variables. The family-color legend below resolves
  // hex values directly instead, matching the pattern already used in
  // dashboard/category-chart.tsx for the same reason.
  const { resolvedTheme } = useTheme();
  const colorScheme: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light';
  const [analytics, setAnalytics] = React.useState<ProcurementAnalytics | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedSeasonalYears, setSelectedSeasonalYears] = React.useState<string[]>([]);
  const [seasonalYearMode, setSeasonalYearMode] = React.useState<'all-available' | 'selected'>('all-available');
  const [selectedFreshAllianceDonors, setSelectedFreshAllianceDonors] = React.useState<string[]>([]);
  const [paidProductSearch, setPaidProductSearch] = React.useState('');
  // Published by EnhancedDataTable. Held here so the report can reproduce the
  // filter, sort, visible columns, and page size the user configured.
  const [freshAllianceTableView, setFreshAllianceTableView] = React.useState<{
    search: string;
    sort: { id: string; desc: boolean } | null;
    visibleColumns: string[];
    pageSize: number;
    pageIndex: number;
  } | null>(null);
  const [warehouseTableView, setWarehouseTableView] = React.useState<{
    search: string;
    sort: { id: string; desc: boolean } | null;
    visibleColumns: string[];
    pageSize: number;
    pageIndex: number;
  } | null>(null);
  const selectedChannel: 'all' | ProcurementChannel = searchParams.get('channel') === 'ofb_warehouse' ||
    searchParams.get('channel') === 'fresh_alliance'
    ? (searchParams.get('channel') as ProcurementChannel)
    : 'all';
  const setProcurementFilter = (key: 'channel', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  React.useEffect(() => {
    let active = true;
    setIsLoading(true);
    procurementService.getAnalytics({
      ...range,
      ...(selectedChannel === 'all' ? {} : { channel: selectedChannel as ProcurementChannel }),
    })
      .then((result) => {
        if (!active) return;
        setAnalytics(result);
        setSelectedSeasonalYears(result.availableYears);
        setSeasonalYearMode('all-available');
        setSelectedFreshAllianceDonors([...new Set(
          result.freshAllianceDonorCategories.map((row) => row.donorCode ?? NOT_REPORTED_DONOR_CODE)
        )]);
      })
      .catch((error) => ErrorHandlerService.handleError(error, 'procurementAnalytics'))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range, selectedChannel]);

  // The card's own channel breakdown only applies when the page-level filter
  // is "All Channels" -- otherwise the analytics payload is already scoped to
  // one channel, and a second independent control here could disagree with
  // the filter a user can see at the top of the page. See
  // procurement-unification-plan.md: one source of truth, no contradictory
  // filter states.
  const [selectedSeasonalChannel, setSelectedSeasonalChannel] = React.useState<'all' | ProcurementChannel>('all');
  const effectiveSeasonalChannel = selectedChannel === 'all' ? selectedSeasonalChannel : selectedChannel;

  const canCompareSeasons = Boolean(
    analytics && analytics.range.startDate.slice(0, 4) !== analytics.range.endDate.slice(0, 4)
  );
  // Memoized because three separate memos depend on it. As a bare conditional
  // it is a new array every render, which makes each of their dependency lists
  // change every render and defeats the memoization entirely.
  const seasonalYears = React.useMemo(
    () => (canCompareSeasons ? selectedSeasonalYears : analytics?.availableYears.slice(0, 1) ?? []),
    [canCompareSeasons, selectedSeasonalYears, analytics],
  );
  const currentCalendarYear = new Date().getFullYear();
  const seasonalConfig = React.useMemo(
    () => buildSeasonalYearChartConfig(
      analytics?.availableYears ?? [],
      currentCalendarYear
    ),
    [analytics?.availableYears, currentCalendarYear]
  );
  /**
   * The month in progress, which this chart must not plot.
   *
   * A seasonal comparison puts every year on one twelve-month axis, so a
   * half-finished August sits beside six complete Augusts and reads as a
   * collapse in supply rather than a month that has not happened yet. Only the
   * current year's newest point is affected — every prior year's month is
   * complete. Same guard as Service Over Time, which says so in the same words.
   */
  const inProgressMonth = React.useMemo(() => {
    const now = new Date();
    return { year: String(now.getFullYear()), monthNumber: now.getMonth() + 1 };
  }, []);

  const seasonalData = React.useMemo(() => {
    const rows = monthLabels.map((month, index) => ({ month, monthNumber: index + 1 } as Record<string, string | number>));
    const inProgress = (year: string, monthNumber: number) =>
      year === inProgressMonth.year && monthNumber === inProgressMonth.monthNumber;
    if (effectiveSeasonalChannel === 'all') {
      for (const point of analytics?.seasonalWeight ?? []) {
        if (seasonalYears.includes(point.year) && !inProgress(point.year, point.month)) {
          rows[point.month - 1][point.year] = toPounds(point.weightHundredths);
        }
      }
    } else {
      for (const point of analytics?.seasonalChannelWeight ?? []) {
        if (point.channel !== effectiveSeasonalChannel || !seasonalYears.includes(point.year)) continue;
        if (inProgress(point.year, point.month)) continue;
        const cell = rows[point.month - 1];
        cell[point.year] = (Number(cell[point.year]) || 0) + toPounds(point.weightHundredths);
      }
    }
    return rows;
  }, [analytics, seasonalYears, effectiveSeasonalChannel, inProgressMonth]);

  /** Set only when the in-progress month was actually dropped from the chart. */
  const seasonalInProgressLabel = React.useMemo(() => {
    if (!seasonalYears.includes(inProgressMonth.year)) return null;
    const points = effectiveSeasonalChannel === 'all'
      ? (analytics?.seasonalWeight ?? [])
      : (analytics?.seasonalChannelWeight ?? []).filter((p) => p.channel === effectiveSeasonalChannel);
    const dropped = points.some((p) =>
      p.year === inProgressMonth.year && p.month === inProgressMonth.monthNumber);
    if (!dropped) return null;
    return `${monthLabels[inProgressMonth.monthNumber - 1]} ${inProgressMonth.year}`;
  }, [analytics, seasonalYears, effectiveSeasonalChannel, inProgressMonth]);

  const monthlyWeight = React.useMemo(
    () => (analytics?.monthlyWeight ?? []).map((row) => ({
      bucket: row.bucket,
      donatedWeight: toPounds(row.donatedWeightHundredths),
      purchDonWeight: toPounds(row.purchDonWeightHundredths),
      governmentWeight: toPounds(row.governmentWeightHundredths),
      purchasedWeight: toPounds(row.purchasedWeightHundredths),
      ofbWarehouseWeight: toPounds(row.ofbWarehouseWeightHundredths),
      freshAllianceWeight: toPounds(row.freshAllianceWeightHundredths),
      communityDonationWeight: toPounds(row.communityDonationWeightHundredths),
    })),
    [analytics]
  );
  /**
   * Spend by month, in dollars.
   *
   * Product charges and net recorded cost are drawn as separate lines rather
   * than one: they diverge only where fees or grants applied, and where they
   * coincide the reader can see that nothing was added or forgiven.
   */
  const monthlySpend = React.useMemo(() => {
    const rows = (analytics?.monthlySpend ?? []).map((row) => ({
      bucket: row.bucket,
      productCharges: row.productChargesCents / 100,
      netRecordedCost: row.netRecordedCostCents / 100,
    }));
    return trimSeriesToData(rows, ['productCharges', 'netRecordedCost']);
  }, [analytics]);

  const acquisitionMix = React.useMemo(
    () => (analytics?.acquisitionMix ?? []).map((row) => ({
      acquisitionClass: acquisitionLabels[row.acquisitionClass],
      weight: toPounds(row.weightHundredths),
    })),
    [analytics]
  );
  const communityTotalHundredths = React.useMemo(
    () => (analytics?.communitySources ?? []).reduce((sum, s) => sum + s.weightHundredths, 0),
    [analytics]
  );
  const channelMix = React.useMemo(() => {
    const legacyPartner = analytics?.summary.freshAllianceLegacyWeightHundredths ?? 0;
    return (analytics?.channelMix ?? []).map((row) => {
      if (row.channel === 'fresh_alliance') {
        // Stack: Primarius (2023+) plus the matched partners' legacy history.
        return { channel: channelLabels[row.channel], primaryWeight: toPounds(row.weightHundredths), legacyWeight: toPounds(legacyPartner) };
      }
      if (row.channel === 'community_donation') {
        // Legacy bar shows only what did NOT move to the Fresh Alliance bar.
        return { channel: channelLabels[row.channel], primaryWeight: toPounds(Math.max(0, communityTotalHundredths - legacyPartner)), legacyWeight: 0 };
      }
      return { channel: channelLabels[row.channel], primaryWeight: toPounds(row.weightHundredths), legacyWeight: 0 };
    });
  }, [analytics, communityTotalHundredths]);
  const paidProductSearchResult = React.useMemo(
    () => buildPaidProductSearchResult(
      analytics?.paidProducts ?? [],
      paidProductSearch
    ),
    [analytics, paidProductSearch]
  );
  const paidProductSpendData = React.useMemo(
    () => paidProductSearch.trim().length > 0
      ? paidProductSearchResult.data
      : buildPaidProductSpendData(analytics?.paidProducts ?? []),
    [analytics, paidProductSearch, paidProductSearchResult.data]
  );
  const paidProductSeries = React.useMemo(
    () => buildPaidProductChartSeries(paidProductSpendData),
    [paidProductSpendData]
  );
  const paidProductFamilyConfig = React.useMemo(
    () => Object.fromEntries(
      paidProductSeries.families.map((family) => [
        family.key,
        { label: family.label, theme: familyColorTheme(family.label) },
      ])
    ) satisfies ChartConfig,
    [paidProductSeries.families]
  );
  const paidProductChartHeight = Math.max(320, paidProductSpendData.length * 36 + 96);
  // Distinct donors present in the receipt-category breakdown, in the same
  // weight-descending order the backend already sorted the rows in — no
  // separate ranking needed here.
  const freshAllianceDonorOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ code: string; label: string }> = [];
    for (const row of analytics?.freshAllianceDonorCategories ?? []) {
      const code = row.donorCode ?? NOT_REPORTED_DONOR_CODE;
      if (seen.has(code)) continue;
      seen.add(code);
      options.push({ code, label: row.donorName });
    }
    return options;
  }, [analytics]);
  const freshAllianceDonorCategoryRows = React.useMemo(
    () => (analytics?.freshAllianceDonorCategories ?? []).filter(
      (row) => selectedFreshAllianceDonors.includes(row.donorCode ?? NOT_REPORTED_DONOR_CODE)
    ),
    [analytics, selectedFreshAllianceDonors]
  );
  // Built from the same donor-filtered rows as the table below, so narrowing
  // the donor filter narrows this chart consistently rather than showing a
  // different picture than what's selected.
  const freshAllianceCategoryMixSeries = React.useMemo(
    () => buildFreshAllianceCategoryMixSeries(freshAllianceDonorCategoryRows),
    [freshAllianceDonorCategoryRows]
  );
  const freshAllianceCategoryMixConfig = React.useMemo(
    () => Object.fromEntries(
      freshAllianceCategoryMixSeries.donors.map((donor) => [
        donor.key,
        { label: donor.label, theme: donorColorTheme(donor.label) },
      ])
    ) satisfies ChartConfig,
    [freshAllianceCategoryMixSeries.donors]
  );
  const freshAllianceCategoryMixHeight = Math.max(
    280,
    freshAllianceCategoryMixSeries.rows.length * 40 + 60
  );
  const warehouseProductColumns = React.useMemo<ColumnDef<ProcurementWarehouseProductSummary>[]>(() => [
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <SortableHeader column={column}>Product</SortableHeader>
      ),
      size: 280,
      cell: ({ row }) => <span className="font-medium">{row.original.description}</span>,
    },
    { accessorKey: 'productCode', header: 'Code', size: 90 },
    {
      accessorKey: 'acquisitionClass',
      header: 'Acquisition',
      size: 115,
      cell: ({ row }) => acquisitionLabels[row.original.acquisitionClass],
    },
    {
      accessorKey: 'receiptDateCount',
      header: ({ column }) => (
        <SortableHeader column={column}>Receipt Dates</SortableHeader>
      ),
      size: 135,
    },
    {
      accessorKey: 'totalWeightHundredths',
      header: ({ column }) => (
        <SortableHeader column={column}>Total Weight</SortableHeader>
      ),
      size: 145,
      cell: ({ row }) => pounds(row.original.totalWeightHundredths),
    },
    {
      accessorKey: 'totalSpendCents',
      header: ({ column }) => (
        <SortableHeader column={column}>Total Charges</SortableHeader>
      ),
      size: 140,
      // Donated products have no charge; show "—" rather than $0.
      cell: ({ row }) => row.original.totalSpendCents > 0 ? dollars(row.original.totalSpendCents) : '—',
    },
    {
      accessorKey: 'costPerPaidPoundCents',
      header: ({ column }) => (
        <SortableHeader column={column}>Cost / Paid lb</SortableHeader>
      ),
      size: 140,
      // Sort purchased products to the top with a descending sort here.
      cell: ({ row }) => row.original.costPerPaidPoundCents === null
        ? '—'
        : dollars(row.original.costPerPaidPoundCents),
    },
    {
      accessorKey: 'lastReceivedDate',
      header: ({ column }) => (
        <SortableHeader column={column}>Last Received</SortableHeader>
      ),
      size: 130,
      cell: ({ row }) => tableDate(row.original.lastReceivedDate),
    },
  ], []);
  const freshAllianceDonorCategoryColumns = React.useMemo<ColumnDef<FreshAllianceDonorCategorySummary>[]>(() => [
    {
      accessorKey: 'donorName',
      header: ({ column }) => (
        <SortableHeader column={column}>Donor</SortableHeader>
      ),
      size: 220,
      cell: ({ row }) => <span className="font-medium">{row.original.donorName}</span>,
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <SortableHeader column={column}>Category</SortableHeader>
      ),
      size: 280,
    },
    { accessorKey: 'productCode', header: 'Source Code', size: 110 },
    {
      accessorKey: 'receiptEventCount',
      header: ({ column }) => (
        <SortableHeader column={column}>Receipt Events</SortableHeader>
      ),
      size: 135,
    },
    {
      accessorKey: 'receivingDateCount',
      header: ({ column }) => (
        <SortableHeader column={column}>Receiving Dates</SortableHeader>
      ),
      size: 140,
    },
    {
      accessorKey: 'totalWeightHundredths',
      header: ({ column }) => (
        <SortableHeader column={column}>Total Weight</SortableHeader>
      ),
      size: 145,
      cell: ({ row }) => pounds(row.original.totalWeightHundredths),
    },
    {
      accessorKey: 'lastReceivedDate',
      header: ({ column }) => (
        <SortableHeader column={column}>Last Pickup</SortableHeader>
      ),
      size: 130,
      cell: ({ row }) => tableDate(row.original.lastReceivedDate),
    },
  ], []);

  /**
   * Twelve month abbreviations; tilts on a phone, flat on a desktop card.
   *
   * Declared above the guards below, not beside the chart that uses it: a hook
   * after an early return runs on some renders and not others, and React fails
   * the entire workspace rather than just this card.
   */
  const [seasonalChartRef, seasonalAxisProps, seasonalAxisExtraHeight] =
    useCategoryAxis(monthLabels);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (!analytics?.status.hasData) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-72 flex-col items-center justify-center gap-4 p-6 text-center">
          <PackageOpen className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <div className="max-w-lg space-y-2">
            <h3 className="text-lg font-semibold">No procurement data yet</h3>
            <p className="text-sm text-muted-foreground">
              Import a standardized Oregon Food Bank CSV to analyze inbound weight, OFB Warehouse Orders, and Fresh Food Alliance receipts. FEED discards the source file after import.
            </p>
          </div>
          <Button onClick={() => navigate('/data-management')}>
            <Database className="mr-2 h-4 w-4" />
            Manage Procurement Data
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = analytics.summary;
  const middleRange = summary.lowerQuartileEventWeightHundredths === null || summary.upperQuartileEventWeightHundredths === null
    ? 'Unknown'
    : `${pounds(summary.lowerQuartileEventWeightHundredths)}–${pounds(summary.upperQuartileEventWeightHundredths)}`;
  const acquisitionWeightTotal = analytics.acquisitionMix.reduce((sum, row) => sum + row.weightHundredths, 0);
  const includesWarehouse = selectedChannel !== 'fresh_alliance';
  const includesFreshAlliance = selectedChannel !== 'ofb_warehouse';
  const allChannels = selectedChannel === 'all';
  // The legacy series appears only when that history is actually loaded --
  // it is a single-agency sidecar (D22), so an empty line would imply every
  // other agency has a source it will never have.
  const hasCommunityDonations = (analytics?.monthlyWeight ?? []).some(
    (row) => row.communityDonationWeightHundredths > 0
  );

  /**
   * Series for "Inbound Weight Over Time", as an array rather than a Fragment.
   *
   * Recharts collects its series by scanning the chart's children; it does not
   * descend into a React Fragment, so `<>...</>` wrappers make every <Line>
   * invisible and the chart renders axes with no data. An array is flattened by
   * React.Children.toArray, so Recharts sees the Lines.
   *
   * This rendered correctly under React 18 and stopped at the React 19 upgrade
   * (recharts 2.15.1). The console error "Accessing element.ref was removed in
   * React 19" comes from the same incompatibility.
   */
  const monthlyWeightAllKeys = selectedChannel === 'ofb_warehouse'
    ? ['donatedWeight', 'purchDonWeight', 'governmentWeight', 'purchasedWeight']
    : [
        ...(allChannels ? ['ofbWarehouseWeight'] : []),
        'freshAllianceWeight',
        ...(allChannels && hasCommunityDonations ? ['communityDonationWeight'] : []),
      ];

  // A channel that ended mid-range stops at its last delivery rather than
  // running along zero for every month afterwards.
  //
  // A plain const, not a useMemo: this sits after the loading and empty-state
  // early returns above, so a hook here is called on some renders and not
  // others — React reports it as a change in hook order and the whole
  // workspace fails to render.
  const monthlyWeightPlotted = trimSeriesToData(monthlyWeight, monthlyWeightAllKeys);

  /**
   * One labeller for every over-time chart on this lens, built from the grain
   * the payload actually carries. Short ranges now plot deliveries by day, and
   * a month formatter handed a day key throws inside Recharts' render — which
   * blanks the tab rather than spoiling a label. `bucketLabeller` guards that.
   */
  const bucketGranularity = analytics?.bucketGranularity ?? 'month';
  const bucketSpansYears = (() => {
    const buckets = (analytics?.monthlyWeight ?? []).map((row) => row.bucket);
    if (buckets.length === 0) return true;
    return buckets[0].slice(0, 4) !== buckets[buckets.length - 1].slice(0, 4);
  })();
  const bucketLabel = bucketLabeller(bucketGranularity, bucketSpansYears);

  // Series are not dropped when empty: the acquisition classes are a fixed
  // taxonomy, and FEED imports both OFB channels, so "nothing this range" is a
  // real observation rather than an absent series. The line simply stops.
  const monthlyWeightSeriesKeys = monthlyWeightAllKeys;

  const toggleSeasonalYear = (year: string, checked: boolean) => {
    setSeasonalYearMode('selected');
    setSelectedSeasonalYears((current) => {
      if (!checked) return current.filter((value) => value !== year);
      if (current.includes(year)) return current;
      return [...current, year].sort();
    });
  };

  const toggleFreshAllianceDonor = (donorCode: string, checked: boolean) => {
    setSelectedFreshAllianceDonors((current) => {
      if (!checked) return current.filter((value) => value !== donorCode);
      if (current.includes(donorCode)) return current;
      return [...current, donorCode];
    });
  };

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-semibold">Oregon Food Bank Procurement</h3>
          <p className="text-sm text-muted-foreground">
            Inbound supply observations remain separate from service-catalog availability.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/data-management')}>
          <Database className="mr-2 h-4 w-4" />
          Manage Procurement Data
        </Button>
      </div>

      <div>
        <Select value={selectedChannel} onValueChange={(value) => setProcurementFilter('channel', value)}>
          {/* Constrained so the control sizes to its content rather than
              stretching across the viewport. */}
          <SelectTrigger aria-label="Procurement channel" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="ofb_warehouse">OFB Warehouse</SelectItem>
            <SelectItem value="fresh_alliance">Fresh Food Alliance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {analytics.status.isStale && analytics.status.latestDeliveryDate && (
        <Alert variant="warning" className="items-start">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <AlertTitle>Procurement data may be out of date</AlertTitle>
            <AlertDescription>
              The latest recorded delivery was {analytics.status.daysSinceLatestDelivery} calendar days ago ({format(parseISO(analytics.status.latestDeliveryDate), 'MMM d, yyyy')}). Import a current OFB export before relying on recent-period trends.
            </AlertDescription>
          </div>
        </Alert>
      )}

      <SelectableBlock cardId="procurement-inbound-supply-summary">
        <Card>
        <CardHeader>
          <CardTitle>Inbound Supply Summary</CardTitle>
          <CardDescription>
            {allChannels
              ? 'OFB Warehouse orders and Fresh Food Alliance receipts remain distinct'
              : selectedChannel === 'fresh_alliance'
                ? 'Grocery-partner donation receipts reported through Fresh Food Alliance'
                : 'Requested acquisitions fulfilled through the OFB warehouse'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 xl:grid-cols-4">
            <ProcurementKpi
              label={selectedChannel === 'fresh_alliance' ? 'Partner Donation Weight' : 'Total Inbound Weight'}
              value={pounds(summary.totalWeightHundredths)}
            />
            {allChannels && <ProcurementKpi label="Source Events" value={summary.sourceEventCount.toLocaleString()} />}
            {!allChannels && (
              <ProcurementKpi
                label={selectedChannel === 'fresh_alliance' ? 'Fresh Food Alliance Receipts' : 'OFB Warehouse Orders'}
                value={summary.sourceEventCount.toLocaleString()}
              />
            )}
            {allChannels && <ProcurementKpi label="OFB Warehouse Orders" value={summary.warehouseOrderCount.toLocaleString()} />}
            {allChannels && <ProcurementKpi label="Fresh Food Alliance Receipts" value={summary.freshAllianceReceiptCount.toLocaleString()} />}
            <ProcurementKpi label="Receiving Dates" value={summary.receivingDateCount.toLocaleString()} />
            {!allChannels && (
              <>
                <ProcurementKpi
                  label={selectedChannel === 'fresh_alliance' ? 'Typical Fresh Food Alliance Event' : 'Typical OFB Warehouse Event'}
                  value={pounds(summary.medianEventWeightHundredths)}
                />
                <ProcurementKpi
                  label={selectedChannel === 'fresh_alliance' ? 'Middle 50% of Fresh Events' : 'Middle 50% of Warehouse Events'}
                  value={middleRange}
                />
                <ProcurementKpi
                  label={selectedChannel === 'fresh_alliance' ? 'Typical Category Lines' : 'Typical Order Lines'}
                  value={summary.medianLinesPerEvent?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? 'Unknown'}
                />
              </>
            )}
            {includesWarehouse && <ProcurementKpi label="Warehouse Products" value={summary.warehouseProductCodes.toLocaleString()} />}
            {includesFreshAlliance && <ProcurementKpi label="Fresh Food Alliance Categories" value={summary.freshAllianceCategoryCodes.toLocaleString()} />}
            <ProcurementKpi
              label="Median Receiving Gap"
              value={summary.medianReceivingGapDays === null
                ? 'Insufficient history'
                : `${summary.medianReceivingGapDays.toLocaleString(undefined, { maximumFractionDigits: 1 })} days`}
            />
          </div>
          <FreshAlliancePendingNote pending={summary.freshAlliancePending} />
          <DataShapingNote dataShaping={analytics.dataShaping} />
        </CardContent>
        </Card>
      </SelectableBlock>

      <SelectableBlock cardId="procurement-inbound-weight-over-time">
        <Card className="min-w-0">
        <CardHeader>
          <CardTitle>
            {allChannels
              ? 'Inbound Weight Over Time'
              : selectedChannel === 'fresh_alliance'
                ? 'Fresh Food Alliance Weight Over Time'
                : 'Warehouse Weight by Acquisition Class'}
          </CardTitle>
          <CardDescription>
            {allChannels
              ? (hasCommunityDonations
                ? 'Monthly inbound pounds, each source kept separate. Community donations are the agency\u2019s own pre-Primarius record, at monthly grain.'
                : 'Monthly inbound pounds with OFB Warehouse and Fresh Food Alliance kept separate')
              : selectedChannel === 'fresh_alliance'
                ? 'Monthly pounds reported through grocery-partner donation receipts'
                : 'Monthly warehouse pounds with OFB acquisition classes kept separate'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={selectedChannel === 'ofb_warehouse' ? monthlyWeightConfig : channelMonthlyWeightConfig}
            className="h-80 min-w-0 w-full"
          >
            <LineChart accessibilityLayer data={monthlyWeightPlotted} margin={{ left: 8, right: 16 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickFormatter={bucketLabel} minTickGap={32} />
              <YAxis width={52} tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
              <ChartTooltip content={<ChartTooltipContent sortByValue />} />
              <ChartLegend content={<ChartLegendContent />} />
              {monthlyWeightSeriesKeys.map((seriesKey) => (
                <Line
                  key={seriesKey}
                  isAnimationActive={!prefersReducedMotion()}
                  dataKey={seriesKey}
                  stroke={`var(--color-${seriesKey})`}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
        </CardContent>
        </Card>
      </SelectableBlock>

      {monthlySpend.length > 0 && (
        <SelectableBlock cardId="procurement-spend-over-time">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>OFB Spending Over Time</CardTitle>
              <CardDescription>
                Recorded charges by delivery month. Money and weight do not move
                together — a heavy donated load costs nothing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  productCharges: { label: 'Product charges', color: carbonChartColors.blue.primary.light },
                  netRecordedCost: { label: 'Net recorded cost', color: carbonChartColors.teal.primary.light },
                } satisfies ChartConfig}
                className="h-80 min-w-0 w-full"
              >
                <LineChart accessibilityLayer data={monthlySpend} margin={{ left: 8, right: 16 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="bucket"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={bucketLabel}
                    minTickGap={32}
                  />
                  <YAxis width={72} tickLine={false} axisLine={false} tickFormatter={formatAxisMoney} />
                  <ChartTooltip content={<ChartTooltipContent sortByValue />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line isAnimationActive={!prefersReducedMotion()} dataKey="productCharges" stroke="var(--color-productCharges)" strokeWidth={2} dot={false} />
                  <Line isAnimationActive={!prefersReducedMotion()} dataKey="netRecordedCost" stroke="var(--color-netRecordedCost)" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                </LineChart>
              </ChartContainer>
              <FootnoteList
                items={[
                  'Net recorded cost adds service fees and subtracts grants.',
                  'Where the two lines coincide, neither applied.',
                  'Fees and grants sit on a whole order, so a filter that divides one '
                    + 'leaves them out rather than assigning them arbitrarily.',
                ]}
              />
            </CardContent>
          </Card>
        </SelectableBlock>
      )}

      {selectedChannel !== 'fresh_alliance' && <SelectableBlock cardId="procurement-paid-summary">
        <Card>
        <CardHeader>
          <CardTitle>Paid Procurement Summary</CardTitle>
          <CardDescription>
            {summary.costAdjustmentsAttributable
              ? 'Charges and credits remain separate; net values are never allocated across products'
              : 'Product charges follow the active acquisition filter; order-level fees, grants, and net cost cannot be attributed to one acquisition class'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
          <ProcurementKpi label="Gross Product Charges" value={dollars(summary.calculatedGrossProductChargesCents)} />
          <ProcurementKpi label="Service Fees" value={attributableDollars(summary.serviceFeesCents)} />
          <ProcurementKpi label="Grants Applied" value={attributableDollars(summary.grantsAppliedCents)} />
          <ProcurementKpi label="Net Recorded Charge" value={attributableDollars(summary.netRecordedCostCents)} />
        </CardContent>
        </Card>
      </SelectableBlock>}

      {selectedChannel !== 'fresh_alliance' && (
        <SelectableBlock
          cardId="procurement-paid-product-spend"
          options={{ search: paidProductSearch }}
        >
          <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Where Paid Procurement Dollars Went</CardTitle>
            <CardDescription>
              Exact OFB Warehouse product codes ranked by calculated product charges in the selected range
            </CardDescription>
            <PaidProductSearch
              value={paidProductSearch}
              onChange={setPaidProductSearch}
              matchCount={paidProductSearchResult.matchCount}
              displayedCount={paidProductSearchResult.data.length}
            />
          </CardHeader>
          <CardContent>
            {paidProductSpendData.length === 0 ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                {paidProductSearch.trim().length > 0
                  ? `No paid OFB Warehouse products match “${paidProductSearch.trim()}” in this range.`
                  : 'No paid OFB Warehouse product charges match this range and filter.'}
              </div>
            ) : (
              <ChartContainer
                config={paidProductFamilyConfig}
                className="min-w-0 w-full"
                style={{ height: paidProductChartHeight }}
              >
                <BarChart
                  accessibilityLayer
                  data={paidProductSeries.rows}
                  layout="vertical"
                  margin={{ left: 8, right: 24 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => dollars(Math.round(value * 100))}
                  />
                  <YAxis dataKey="product" type="category" width={190} tickLine={false} axisLine={false} />
                  {/* One row summary rather than one entry per family
                      series, plus the family split when the bar actually has
                      more than one. */}
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as Record<string, unknown>;
                      // The chart row carries `segments` -- `familyBreakdown`
                      // lives on the pre-chart datum and is never present here,
                      // which is why this block used to render nothing on the
                      // aggregate bar.
                      const breakdown = row.segments as
                        | Array<{ family: string; spendDollars: number }>
                        | undefined;
                      const breakdownTotal = (breakdown ?? []).reduce(
                        (sum, entry) => sum + entry.spendDollars,
                        0
                      );
                      return (
                        <div className="grid min-w-52 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-xl">
                          <div className="font-medium">{String(row.fullDescription)}</div>
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Paid Product Charges</span>
                            <span className="font-mono font-medium tabular-nums">{dollars(Math.round(Number(row.spendDollars) * 100))}</span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Share of Paid Charges</span>
                            <span className="font-mono font-medium tabular-nums">{(Number(row.spendShare) * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Product Codes</span>
                            <span className="font-mono font-medium tabular-nums">{Number(row.productCount).toLocaleString()}</span>
                          </div>
                          {breakdown && breakdown.length > 1 && breakdownTotal > 0 && (
                            <div className="mt-1 grid gap-1 border-t border-border/50 pt-1.5">
                              <span className="text-muted-foreground">By product family</span>
                              {breakdown.map((entry) => (
                                <div key={entry.family} className="flex items-center justify-between gap-3">
                                  <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-[2px]"
                                      style={{ backgroundColor: `var(--color-${familyCssKey(entry.family)})` }}
                                    />
                                    {entry.family}
                                  </span>
                                  <span className="font-mono font-medium tabular-nums">
                                    {(entry.spendDollars / breakdownTotal * 100).toFixed(1)}%
                                    <span className="ml-1.5 text-muted-foreground">
                                      {dollars(Math.round(entry.spendDollars * 100))}
                                    </span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {/* Colour carries product family, which the axis label does
                      not already encode. A custom shape draws each row's
                      segments directly (see PaidProductBarShape) instead of
                      Recharts' native stacking, which renders nothing at this
                      series count. */}
                  <Bar dataKey="spendDollars" shape={PaidProductBarShape} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            )}
            {paidProductSeries.families.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Colored by product family:</span>
                {paidProductSeries.families.map((family) => (
                  <span key={family.key} className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: familyColorHex(family.label, colorScheme) }}
                    />
                    {family.label}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
          </Card>
        </SelectableBlock>
      )}

      {(includesWarehouse || allChannels) && (
        <div className={`grid min-w-0 gap-4 ${allChannels ? 'lg:grid-cols-2' : ''}`}>
        {includesWarehouse && <SelectableBlock cardId="procurement-acquisition-mix">
          <Card className="min-w-0">
          <CardHeader><CardTitle>Acquisition Mix</CardTitle><CardDescription>Inbound pounds by OFB acquisition class</CardDescription></CardHeader>
          <CardContent>
            <ChartContainer config={acquisitionMixConfig} className="h-72 min-w-0 w-full">
              <BarChart accessibilityLayer data={acquisitionMix} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
                <YAxis dataKey="acquisitionClass" type="category" width={92} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar isAnimationActive={!prefersReducedMotion()} dataKey="weight" fill="var(--color-weight)" radius={3} />
              </BarChart>
            </ChartContainer>
            <MixDetails total={acquisitionWeightTotal} rows={analytics.acquisitionMix.map((row) => ({ label: acquisitionLabels[row.acquisitionClass], weight: row.weightHundredths }))} />
          </CardContent>
          </Card>
        </SelectableBlock>}

        {allChannels && <SelectableBlock cardId="procurement-channels">
          <Card className="min-w-0">
          <CardHeader><CardTitle>Procurement Channels</CardTitle><CardDescription>Fresh Food Alliance remains distinct from OFB warehouse supply</CardDescription></CardHeader>
          <CardContent>
            <ChartContainer config={channelMixConfig} className="h-72 min-w-0 w-full">
              <BarChart accessibilityLayer data={channelMix} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
                <YAxis dataKey="channel" type="category" width={110} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar isAnimationActive={!prefersReducedMotion()} dataKey="primaryWeight" stackId="channel" fill="var(--color-primaryWeight)" radius={[3, 0, 0, 3]} />
                <Bar isAnimationActive={!prefersReducedMotion()} dataKey="legacyWeight" stackId="channel" fill="var(--color-legacyWeight)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ChartContainer>
            <MixDetails
              total={channelMix.reduce((sum, row) => sum + row.primaryWeight + row.legacyWeight, 0) * 100}
              rows={channelMix.map((row) => ({ label: row.channel, weight: (row.primaryWeight + row.legacyWeight) * 100 }))}
            />
          </CardContent>
          </Card>
        </SelectableBlock>}
        </div>
      )}

      {includesFreshAlliance && (
        <SelectableBlock
          cardId="procurement-fresh-alliance-category-mix"
          options={{ donorCodes: selectedFreshAllianceDonors }}
        >
          <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Fresh Food Alliance Category Mix</CardTitle>
            <CardDescription>
              Broad OFB reporting categories, broken down by donor. Donor identity comes from the
              OFB Agency Pickups export and is never inferred beyond what it reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {freshAllianceCategoryMixSeries.rows.length === 0 ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                No Fresh Food Alliance receipts match this range and filter.
              </div>
            ) : (
              <ChartContainer
                config={freshAllianceCategoryMixConfig}
                className="min-w-0 w-full"
                style={{ height: freshAllianceCategoryMixHeight }}
              >
                <BarChart
                  accessibilityLayer
                  data={freshAllianceCategoryMixSeries.rows}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
                  <YAxis dataKey="category" type="category" width={150} tickLine={false} axisLine={false} />
                  {/* One row summary plus the donor split, same pattern as the
                      paid-product chart's tooltip — a single Bar payload
                      entry per row, not one per donor series. */}
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as FreshAllianceCategoryMixRow;
                      return (
                        <div className="grid min-w-52 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-xl">
                          <div className="font-medium">{row.fullDescription}</div>
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Inbound Weight</span>
                            <span className="font-mono font-medium tabular-nums">{pounds(Math.round(row.weightPounds * 100))}</span>
                          </div>
                          {row.segments.length > 0 && (
                            <div className="mt-1 grid gap-1 border-t border-border/50 pt-1.5">
                              <span className="text-muted-foreground">By donor</span>
                              {row.segments.map((segment) => (
                                <div key={segment.donor} className="flex items-center justify-between gap-3">
                                  <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-[2px]"
                                      style={{ backgroundColor: `var(--color-${familyCssKey(segment.donor)})` }}
                                    />
                                    {segment.donor}
                                  </span>
                                  <span className="font-mono font-medium tabular-nums">{pounds(Math.round(segment.weightPounds * 100))}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {/* Colour carries donor, which the axis label does not
                      already encode. A custom shape draws each row's
                      segments directly (see renderStackedBarSegments)
                      instead of Recharts' native stacking, which renders
                      nothing at this series count. */}
                  <Bar dataKey="weightPounds" shape={FreshAllianceCategoryBarShape} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            )}
            {freshAllianceCategoryMixSeries.donors.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Colored by donor:</span>
                {freshAllianceCategoryMixSeries.donors.map((donor) => (
                  <span key={donor.key} className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: donorColorHex(donor.label, colorScheme) }}
                    />
                    {donor.label}
                  </span>
                ))}
              </div>
            )}
            <FootnoteList items={['Does not include legacy donations data.']} />
          </CardContent>
          </Card>
        </SelectableBlock>
      )}

      {includesFreshAlliance && (
        <DonorAnalytics
          donors={analytics.donors}
          donorValue={analytics.donorValue}
          donorMonthlyWeight={analytics.donorMonthlyWeight}
          legacyMonthlyWeight={analytics.freshAllianceLegacyMonthlyWeight}
          bucketGranularity={analytics.bucketGranularity}
          formatDate={tableDate}
        />
      )}

      {hasCommunityDonations && (
        <CommunityDonationAnalytics
          communitySources={analytics.communitySources}
          communityMonthlyWeight={analytics.communityMonthlyWeight}
          bucketGranularity={analytics.bucketGranularity}
        />
      )}

      <SelectableBlock
        cardId="procurement-seasonal-inbound-weight"
        options={{
          channel: effectiveSeasonalChannel,
          yearMode: seasonalYearMode,
          ...(seasonalYearMode === 'selected' ? { years: seasonalYears } : {}),
        }}
      >
        <Card className="min-w-0">
        <CardHeader className="flex flex-col items-start justify-between gap-3 space-y-0 sm:flex-row sm:items-center">
          <div>
            <CardTitle>Seasonal Inbound Weight</CardTitle>
            <CardDescription>
              {canCompareSeasons
                ? 'Calendar years within the selected range compared month by month'
                : 'Monthly inbound weight within the selected date range'}
              {effectiveSeasonalChannel !== 'all' && (
                <> &middot; {channelLabels[effectiveSeasonalChannel]} only</>
              )}
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {/* Only offered when the page-level channel filter is "All
              Channels". A narrower page filter already scopes this card's
              data, so a second independent choice here could contradict the
              filter visible at the top of the page. */}
          {selectedChannel === 'all' && (
            <Select
              value={selectedSeasonalChannel}
              onValueChange={(value) => setSelectedSeasonalChannel(value as 'all' | ProcurementChannel)}
            >
              <SelectTrigger aria-label="Seasonal channel breakdown" className="w-full sm:w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="ofb_warehouse">OFB Warehouse</SelectItem>
                <SelectItem value="fresh_alliance">Fresh Food Alliance</SelectItem>
                {/* Offered only when legacy history is loaded — its own channel
                    is already summed into "All Channels" and can now be isolated. */}
                {hasCommunityDonations && (
                  <SelectItem value="community_donation">Donations (Legacy Data)</SelectItem>
                )}
              </SelectContent>
            </Select>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={!canCompareSeasons}>
              <Button variant="outline" className="w-full justify-between sm:w-auto">
                {seasonalYears.length === analytics.availableYears.length
                  ? 'All years'
                  : seasonalYears.length === 1
                    ? seasonalYears[0]
                    : `${seasonalYears.length} years`}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            {/* DropdownMenu owns this overflow; bound long histories to its available popper height. */}
            <DropdownMenuContent align="end" className="max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setSelectedSeasonalYears(analytics.availableYears);
                  setSeasonalYearMode('all-available');
                }}
              >
                Select all years
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setSelectedSeasonalYears([]);
                  setSeasonalYearMode('selected');
                }}
              >
                Clear all years
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {analytics.availableYears.map((year) => (
                <DropdownMenuCheckboxItem
                  key={year}
                  checked={selectedSeasonalYears.includes(year)}
                  onCheckedChange={(checked) => toggleSeasonalYear(year, checked === true)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {year}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {seasonalYears.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">Choose at least one year.</div>
          ) : (
            <div ref={seasonalChartRef} className="min-w-0">
            <ChartContainer
              config={seasonalConfig}
              className="min-w-0 w-full"
              style={{ height: `${320 + seasonalAxisExtraHeight}px` }}
            >
              <LineChart accessibilityLayer data={seasonalData} margin={{ left: 8, right: 16 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} {...seasonalAxisProps} />
                <YAxis width={52} tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
                {/* Sorted heaviest-first per month, so the tooltip's order
                    mirrors the lines' visual stacking at that point rather than
                    a fixed year order. */}
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
                            <span className="font-mono font-medium tabular-nums">{Math.round(Number(item.value)).toLocaleString()} lb</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <ChartLegend content={<ChartLegendContent />} />
                {/* Ascending so the legend reads oldest → newest, with the
                    current year last (rightmost). Colors are keyed by year, not
                    render order, so this does not disturb them. */}
                {[...seasonalYears].sort().map((year) => {
                  const isCurrentYear = year === String(currentCalendarYear);

                  return (
                    <Line isAnimationActive={!prefersReducedMotion()}
                      key={year}
                      dataKey={year}
                      stroke={`var(--color-${year})`}
                      strokeWidth={isCurrentYear ? 3 : 2}
                      strokeLinecap="round"
                      dot={seasonalYears.length === 1}
                      connectNulls={false}
                      style={isCurrentYear
                        ? {
                            filter: `drop-shadow(0 0 2px var(--color-${year})) drop-shadow(0 0 5px var(--color-${year}))`,
                          }
                        : undefined}
                    />
                  );
                })}
              </LineChart>
            </ChartContainer>
            </div>
          )}
          {seasonalInProgressLabel && (
            <FootnoteList
              items={[`${seasonalInProgressLabel} is still in progress and is not plotted.`]}
            />
          )}
        </CardContent>
        </Card>
      </SelectableBlock>

      {includesFreshAlliance && (
        <SelectableBlock
          cardId="procurement-fresh-alliance-receipt-categories"
          options={{
            ...(freshAllianceTableView ?? {}),
            donorCodes: selectedFreshAllianceDonors,
          }}
        >
        <section className="space-y-3">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-lg font-semibold">Fresh Food Alliance Receipt Categories</h3>
            <p className="text-sm text-muted-foreground">
              Broad categories of products donated through the Fresh Food Alliance.
            </p>
            <FreshAlliancePendingNote pending={summary.freshAlliancePending} className="mt-1" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={freshAllianceDonorOptions.length === 0}>
              <Button variant="outline" className="w-full justify-between sm:w-auto">
                {selectedFreshAllianceDonors.length === freshAllianceDonorOptions.length
                  ? 'All Donors'
                  : selectedFreshAllianceDonors.length === 1
                    ? freshAllianceDonorOptions.find((option) => option.code === selectedFreshAllianceDonors[0])?.label ?? 'All Donors'
                    : `${selectedFreshAllianceDonors.length} donors`}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            {/* DropdownMenu owns this overflow; bound long donor rosters to its available popper height. */}
            <DropdownMenuContent align="end" className="max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setSelectedFreshAllianceDonors(freshAllianceDonorOptions.map((option) => option.code));
                }}
              >
                Select all donors
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setSelectedFreshAllianceDonors([]);
                }}
              >
                Clear all donors
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {freshAllianceDonorOptions.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.code}
                  checked={selectedFreshAllianceDonors.includes(option.code)}
                  onCheckedChange={(checked) => toggleFreshAllianceDonor(option.code, checked === true)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {selectedFreshAllianceDonors.length === 0 && freshAllianceDonorOptions.length > 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border text-sm text-muted-foreground">
            Choose at least one donor.
          </div>
        ) : (
          <EnhancedDataTable
            columns={freshAllianceDonorCategoryColumns}
            data={freshAllianceDonorCategoryRows}
            filterColumn="description"
            filterPlaceholder="Filter receipt categories..."
            enableColumnVisibility
            defaultPageSize={10}
            onViewStateChange={setFreshAllianceTableView}
          />
        )}
        </section>
        </SelectableBlock>
      )}

      {includesWarehouse && (
        <SelectableBlock
          cardId="procurement-warehouse-product-history"
          options={warehouseTableView ?? undefined}
        >
        <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">OFB Warehouse Product History</h3>
          <p className="text-sm text-muted-foreground">OFB ordered products with receiving dates, inbound weight, timing, and charges. Sort by Cost / Paid lb to bring purchased products first.</p>
        </div>
        <EnhancedDataTable
          columns={warehouseProductColumns}
          data={analytics.warehouseProducts}
          filterColumn="description"
          filterPlaceholder="Filter supplier products..."
          enableColumnVisibility
          defaultPageSize={10}
          onViewStateChange={setWarehouseTableView}
        />
        </section>
        </SelectableBlock>
      )}

    </div>
  );
}

function MixDetails({ total, rows }: { total: number; rows: Array<{ label: string; weight: number }> }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-sm text-muted-foreground">{row.label}</dt>
          <dd className="font-medium">
            {total === 0 ? '0%' : `${(row.weight / total * 100).toFixed(1)}%`}
            <span className="ml-1 text-sm font-normal text-muted-foreground">({pounds(row.weight)})</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

const SHAPING_FLAG_LABELS: Record<string, string> = {
  pass_through: 'passthrough to agency partner',
  other_exclusion: 'excluded by your rules',
  at_risk: 'from arrangements you marked fragile',
  estimated: 'recorded at lower resolution',
  program_bound: 'from a time-limited program',
};

/**
 * States what the agency's own rules did to these numbers. An exclusion nobody
 * can see is as dishonest as an inflated total, so whenever a rule removes
 * weight, the amount and the reason are named right beside the figure it
 * changed (D19). Annotations are reported the same way but never subtract.
 */
export function DataShapingNote({
  dataShaping,
  className = '',
}: {
  dataShaping: ProcurementAnalytics['dataShaping'];
  className?: string;
}) {
  if (!dataShaping || dataShaping.flags.length === 0) return null;
  const exclusions = dataShaping.flags.filter((entry) => entry.family === 'exclusion');
  const annotations = dataShaping.flags.filter((entry) => entry.family === 'annotation');
  const describe = (entry: ProcurementAnalytics['dataShaping']['flags'][number]) =>
    `${pounds(entry.weightHundredths)} ${SHAPING_FLAG_LABELS[entry.flag] ?? entry.flag}`;

  return (
    <div className={className}>
      <FootnoteList
        items={[
          exclusions.length > 0
            && `Does not include ${pounds(dataShaping.excludedWeightHundredths)} flagged as `
              + `${exclusions.map((entry) => SHAPING_FLAG_LABELS[entry.flag] ?? entry.flag).join(', ')}.`,
          annotations.length > 0 && `Also noted: ${annotations.map(describe).join(', ')}.`,
        ]}
      />
    </div>
  );
}

/**
 * States how much already-counted weight is still awaiting OFB's review.
 * Deliberately understated: OFB's "Confirmed" checkbox is an audit sign-off
 * on data the agency already reported, not a data-quality gate, so pending
 * weight is included in every total already -- this note explains that
 * fact, it does not correct or caveat a number that needs correcting. See
 * procurement-unification-plan.md D15.
 */
function FreshAlliancePendingNote({
  pending,
  className = '',
}: {
  pending: ProcurementAnalytics['summary']['freshAlliancePending'];
  className?: string;
}) {
  if (!pending) return null;
  return (
    <div className={className}>
      <FootnoteList
        items={[
          `Includes ${pounds(pending.weightHundredths)} of Fresh Food Alliance donations `
            + "still awaiting OFB's confirmation.",
        ]}
      />
    </div>
  );
}

function ProcurementKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="wrap-break-word text-xl font-semibold">{value}</p>
    </div>
  );
}
