// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

// Fresh Food Alliance partner observations.
//
// Donor identity comes only from the OFB Agency Pickups export, which is the
// sole source that reports it. FEED records the partner OFB names and never
// infers one from dates, references, category mixes, or operational history.
//
// These are descriptive observations, not an assessment. FEED does not rank
// partners, score them, or explain why a partner's volume moved — a decline may
// reflect a store's own supply, a schedule change, another agency taking a
// route, or nothing at all. Staff know their partners; the software's job is to
// report what arrived.

import { prefersReducedMotion } from '@/lib/reduced-motion'
import { trimSeriesToData } from '@/lib/chart-series'
import { FootnoteList } from '@/components/analytics/footnote'
import { bucketLabeller, type BucketGranularity } from '@/lib/formatting/bucket-label'
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SelectableBlock } from '@/components/reports/selection';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { carbonCategoricalTheme, carbonTheme } from '@/lib/colors';
import { formatAxisNumber } from '@/lib/formatting/number';
import type { DonorSummary, DonorValueSummary } from '@/types/procurement';

interface DonorAnalyticsProps {
  donors: DonorSummary[];
  donorValue: DonorValueSummary;
  donorMonthlyWeight: Array<{ bucket: string; donorCode: string; weightHundredths: number }>;
  /** The grain those buckets carry, so the axis labels them correctly. */
  bucketGranularity?: BucketGranularity;
  /** FFA partners' pre-Primarius monthly history, shown when "Show Legacy Data"
   *  is on. Keyed by the live donor code, so it extends the same lines back. */
  legacyMonthlyWeight?: Array<{ bucket: string; donorCode: string; weightHundredths: number }>;
  formatDate: (isoDate: string) => string;
}

const pounds = (hundredths: number) => Math.round(hundredths / 100);
const poundLabel = (hundredths: number) => `${pounds(hundredths).toLocaleString()} lb`;
const dollars = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString()}`;

// Matches the Carbon data-viz convention the other procurement charts use;
// a raw CSS variable renders black against the dark theme.
const donorMixConfig = {
  weight: { label: 'Received Pounds', theme: carbonTheme('teal') },
} satisfies ChartConfig;

export function DonorAnalytics({
  donors,
  donorValue,
  donorMonthlyWeight,
  legacyMonthlyWeight,
  bucketGranularity = 'month',
  formatDate,
}: DonorAnalyticsProps) {
  const legacyRows = React.useMemo(() => legacyMonthlyWeight ?? [], [legacyMonthlyWeight]);
  const hasLegacy = legacyRows.length > 0;
  const [showLegacy, setShowLegacy] = React.useState(false);
  // Tolerates an analytics payload without donor fields — an older cached
  // response, or a session held open across a backend deploy. A missing
  // section is not worth taking the whole Analytics page down for.
  const safeDonors = React.useMemo(() => donors ?? [], [donors]);

  const mix = React.useMemo(
    () => safeDonors.map((donor) => ({
      donor: donor.donorName,
      weight: pounds(donor.weightHundredths),
    })),
    [safeDonors]
  );

  const safeMonthly = React.useMemo(() => donorMonthlyWeight ?? [], [donorMonthlyWeight]);

  /**
   * Labels the axis at the grain the buckets actually carry. A month formatter
   * handed a day key throws inside Recharts and unmounts the lens, so this
   * always goes through the guarded shared labeller.
   */
  const bucketLabel = React.useMemo(() => {
    const all = [...(legacyMonthlyWeight ?? []), ...(donorMonthlyWeight ?? [])]
      .map((row) => row.bucket).sort();
    const spansYears = all.length === 0
      || all[0].slice(0, 4) !== all[all.length - 1].slice(0, 4);
    return bucketLabeller(bucketGranularity, spansYears);
  }, [bucketGranularity, donorMonthlyWeight, legacyMonthlyWeight]);

  // Partner selection is a view over data already fetched, so it filters here
  // rather than through the server. Keeping it client-side also means it never
  // interacts with the channel and acquisition filters, whose whole-event
  // semantics would make a combined result hard to reason about.
  const [hiddenDonors, setHiddenDonors] = React.useState<string[]>([]);
  const visibleDonors = React.useMemo(
    () => safeDonors.filter((donor) => !hiddenDonors.includes(donor.donorCode)),
    [safeDonors, hiddenDonors]
  );

  const trend = React.useMemo(() => {
    // With the toggle on, partners' pre-Primarius months extend the same lines
    // back. They abut the live data (legacy ends May 2023, Fresh Alliance starts
    // June 2023) with no overlap, so no month is double-counted.
    const rows = showLegacy ? [...legacyRows, ...safeMonthly] : safeMonthly;
    const months = [...new Set(rows.map((entry) => entry.bucket))].sort();
    const visibleCodes = new Set(visibleDonors.map((donor) => donor.donorCode));
    const dense = months.map((month) => {
      const row: Record<string, string | number> = { bucket: month };
      for (const entry of rows) {
        if (entry.bucket !== month || !visibleCodes.has(entry.donorCode)) continue;
        row[entry.donorCode] = (Number(row[entry.donorCode]) || 0) + Math.round(entry.weightHundredths / 100);
      }
      // Recharts needs an explicit 0 for a month a partner did not deliver in,
      // otherwise the line bridges the gap and implies a delivery that did not
      // happen. `trimSeriesToData` then nulls the leading and trailing zeros,
      // so a partner who stopped in May 2023 ends there instead of running
      // along the axis for every month since.
      for (const donor of visibleDonors) {
        if (row[donor.donorCode] === undefined) row[donor.donorCode] = 0;
      }
      return row;
    });
    return trimSeriesToData(dense, visibleDonors.map((donor) => donor.donorCode));
  }, [safeMonthly, legacyRows, showLegacy, visibleDonors]);

  const trendConfig = React.useMemo(
    () => Object.fromEntries(
      safeDonors.map((donor, index) => [
        donor.donorCode,
        { label: donor.donorName, theme: carbonCategoricalTheme(index) },
      ])
    ) satisfies ChartConfig,
    [safeDonors]
  );

  const toggleDonor = (donorCode: string, visible: boolean) => {
    setHiddenDonors((current) => visible
      ? current.filter((code) => code !== donorCode)
      : [...new Set([...current, donorCode])]);
  };

  const totalWeightHundredths = React.useMemo(
    () => safeDonors.reduce((total, donor) => total + donor.weightHundredths, 0),
    [safeDonors]
  );

  const valuationCoverage = !donorValue || donorValue.totalWeightHundredths === 0
    ? null
    : Math.round(100 * donorValue.valuedWeightHundredths / donorValue.totalWeightHundredths);

  if (safeDonors.length === 0 || !donorValue) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Grocery Partners</CardTitle>
          <CardDescription>
            Partner identity comes from the OFB Agency Pickups export
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
            No Agency Pickups observations match this range and filter. Import an
            Agency Pickups export from Data Management to see partner detail.
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sent only when the picker has actually narrowed the roster. Absent means
  // "every partner", which is the screen's default — and it keeps the printed
  // card from claiming a filter the user never applied.
  const selectedDonorCodes = hiddenDonors.length > 0
    ? visibleDonors.map((donor) => donor.donorCode)
    : undefined;

  return (
    <>
      <SelectableBlock cardId="procurement-grocery-partner-mix">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Grocery Partner Mix</CardTitle>
          <CardDescription>
            Received pounds by partner, as reported by Oregon Food Bank
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={donorMixConfig} className="h-80 min-w-0 w-full">
            <BarChart accessibilityLayer data={mix} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
              <YAxis dataKey="donor" type="category" width={190} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar isAnimationActive={!prefersReducedMotion()} dataKey="weight" fill="var(--color-weight)" radius={3} />
            </BarChart>
          </ChartContainer>
          <FootnoteList items={['Does not include legacy donations data.']} />
        </CardContent>
      </Card>
      </SelectableBlock>

      <SelectableBlock cardId="procurement-donated-value">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Recorded Donated Value</CardTitle>
          <CardDescription>
            {valuationCoverage === null
              ? 'Oregon Food Bank records a donor value per pound on some receipts'
              // The coverage figure is not a footnote. OFB leaves the rate blank
              // on a large share of historical rows, so the total is a partial
              // sum and must never be read as the value of all donated supply.
              : 'From Oregon Food Bank recorded rates.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">Recorded value</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {dollars(donorValue.recordedValueCents)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Pounds with a recorded rate</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {poundLabel(donorValue.valuedWeightHundredths)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Pounds without a recorded rate</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {poundLabel(donorValue.unvaluedWeightHundredths)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">
            FEED reports the value Oregon Food Bank reported and does not estimate
            a rate for other donations.
          </p>
        </CardContent>
      </Card>
      </SelectableBlock>

      <SelectableBlock
        cardId="procurement-fresh-alliance-donations-over-time"
        options={{ donorCodes: selectedDonorCodes, showLegacy }}
      >
      <Card className="min-w-0">
        <CardHeader className="flex flex-col items-start justify-between gap-3 space-y-0 sm:flex-row sm:items-center">
          <div>
            <CardTitle>Fresh Food Alliance Donations Over Time</CardTitle>
            <CardDescription>
              Monthly received pounds per partner within the selected range
              {showLegacy && ', extended before June 2023 with legacy records'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
          {hasLegacy && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={showLegacy} onCheckedChange={setShowLegacy} aria-label="Show legacy data" />
              Show Legacy Data
            </label>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Choose partners">
                {hiddenDonors.length === 0
                  ? 'All partners'
                  : visibleDonors.length === 1
                    ? visibleDonors[0].donorName
                    : `${visibleDonors.length} partners`}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            {/* DropdownMenu owns this overflow; bound long rosters to the popper height. */}
            <DropdownMenuContent align="end" className="max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setHiddenDonors([]);
                }}
              >
                Select all partners
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setHiddenDonors(safeDonors.map((donor) => donor.donorCode));
                }}
              >
                Clear all partners
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {safeDonors.map((donor) => (
                <DropdownMenuCheckboxItem
                  key={donor.donorCode}
                  checked={!hiddenDonors.includes(donor.donorCode)}
                  onCheckedChange={(checked) => toggleDonor(donor.donorCode, checked === true)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {donor.donorName}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {visibleDonors.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              Choose at least one partner.
            </div>
          ) : trend.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              No partner deliveries fall in this range.
            </div>
          ) : (
            <ChartContainer config={trendConfig} className="h-80 min-w-0 w-full">
              <LineChart accessibilityLayer data={trend} margin={{ left: 8, right: 16 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="bucket"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={bucketLabel}
                />
                <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={formatAxisNumber} />
                <ChartTooltip content={<ChartTooltipContent sortByValue />} />
                <ChartLegend content={<ChartLegendContent />} />
                {visibleDonors.map((donor) => (
                  <Line isAnimationActive={!prefersReducedMotion()}
                    key={donor.donorCode}
                    type="monotone"
                    dataKey={donor.donorCode}
                    stroke={`var(--color-${donor.donorCode})`}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
      </SelectableBlock>

      <SelectableBlock cardId="procurement-fresh-alliance-pickup-history">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Fresh Food Alliance Pickup History</CardTitle>
          <CardDescription>
            Fresh Food Alliance Pickups only. Does not include legacy data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead className="text-right">Pickups</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Average load</TableHead>
                  <TableHead className="text-right">Categories</TableHead>
                  <TableHead className="whitespace-nowrap">Observed range</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeDonors.map((donor) => (
                  <TableRow key={donor.donorCode}>
                    <TableCell className="font-medium">{donor.donorName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {donor.pickupCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {poundLabel(donor.weightHundredths)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalWeightHundredths === 0
                        ? '—'
                        : `${Math.round(100 * donor.weightHundredths / totalWeightHundredths)}%`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {poundLabel(donor.averageWeightPerPickupHundredths)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {donor.categories.length}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(donor.firstReceivedDate)} – {formatDate(donor.lastReceivedDate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </SelectableBlock>
    </>
  );
}
