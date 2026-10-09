// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// Client Analytics — the fourth lens, beside Operations, Procurement and
// Service.
//
// Service answers what happened on a service day; Clients answers who the
// people are. The two shared a tab while they shared an import, which is a
// reason about plumbing rather than about the questions being asked — a
// household-size distribution and a count of turned-away households are not
// the same kind of fact and do not belong under one heading.
//
// The date range still applies. These cards join demographics to encounters
// through the client id, so "how many non-English-speaking households did we
// serve in March 2023" is a question this lens can answer and a roster of
// everyone on file cannot.
//
// Today this reads the same Service analytics payload, because the Link2Feed
// and SIMC client exports are not imported yet. When they are, the payload
// changes and these cards keep their ids.

import * as React from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SelectableBlock } from '@/components/reports/selection';
import { FootnoteList, type FootnoteEntry } from '@/components/analytics/footnote';
import { Map, MapControls, MapMarker, MarkerContent, MarkerTooltip } from '@/components/ui/map';
import { useTheme } from 'next-themes';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { carbonChartColors } from '@/lib/colors';
import { useCategoryAxis } from '@/lib/chart-axis';
import { formatAxisNumber, formatNumber } from '@/lib/formatting/number';
import {
  serviceApi,
  type DemographicBreakdown,
  type ServiceAnalytics,
} from '@/services/service';
import type { AnalyticsDateRange } from '@/types/analytics';
import { MealLineClientAnalytics } from './mealline-clients';

const count = (value: number) => formatNumber(value);
const seriesColor = (configKey: string) => `var(--color-${configKey})`;

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



/**
 * One demographic question as ranked bars.
 *
 * Ethnicity, gender identity and housing type differ only in which answers
 * they hold, so they share a component rather than three near-copies. The
 * denominators travel with it: a bar is meaningless without how many were
 * asked, and a multi-answer question needs to say why its bars sum above the
 * people counted.
 */
function BreakdownCard({
  cardId, title, description, breakdown, color, notes = [],
}: {
  cardId: string;
  title: string;
  description: string;
  breakdown: DemographicBreakdown;
  color: string;
  /** Extra caveats, appended below the shared denominator lines. */
  notes?: FootnoteEntry[];
}) {
  if (breakdown.values.length === 0) return null;
  const percent = breakdown.asked > 0
    ? Math.round((breakdown.answered / breakdown.asked) * 100)
    : 0;
  const unit = breakdown.unit === 'people' ? 'people' : 'households';

  /**
   * Height follows the row count rather than a fixed figure per card.
   *
   * A category axis divides whatever height it is given by however many rows
   * it has, so a card sized for eight answers crushes fourteen into the same
   * space and the labels overlap — "American Indian or Alaska Native" wraps to
   * two lines and collides with its neighbours. 34px a row leaves space for a
   * wrapped label; the floor keeps a two-answer card from looking broken.
   */
  const chartHeight = Math.max(220, breakdown.values.length * 34 + 48);

  return (
    <SelectableBlock cardId={cardId}>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          <SourcePills sources={breakdown.sources.map(sourceLabel)} />
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ count: { label: unit === 'people' ? 'People' : 'Households', color } } satisfies ChartConfig}
            className="w-full"
            style={{ height: `${chartHeight}px` }}
          >
            <BarChart data={breakdown.values} layout="vertical" margin={{ left: 8, right: 24, top: 4 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
              <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={176} interval={0} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill={seriesColor('count')} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ChartContainer>
          <FootnoteList
            items={[
              `About ${percent}% of ${unit} answered this question `
                + `(${count(breakdown.answered)} of ${count(breakdown.asked)}).`,
              breakdown.multiValue
                && `A ${unit === 'people' ? 'person' : 'household'} can give more than one `
                  + 'answer, so the bars sum above that total.',
              ...notes,
            ]}
          />
        </CardContent>
      </Card>
    </SelectableBlock>
  );
}

/** Record names as staff know them, not as the importer spells them. */
const sourceLabel = (source: string) =>
  source === 'link2feed' ? 'Link2Feed' : source === 'simc' ? 'SIMC' : source;

export function ClientAnalyticsLens({ range }: { range: AnalyticsDateRange }) {
  return <div className="space-y-8"><MealLineClientAnalytics range={range}/><ImportedClientAnalyticsLens range={range}/></div>;
}
function ImportedClientAnalyticsLens({ range }: { range: AnalyticsDateRange }) {
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
      .catch((error) => ErrorHandlerService.handleError(error, 'clientAnalytics'))
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [range.preset, range.startDate, range.endDate]);

  if (isLoading && !analytics) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!analytics || !analytics.coverage.hasIntake) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>No client records in this range</CardTitle>
          <CardDescription>
            Client details come from intake. No Link2Feed or SIMC records cover these
            dates — widen the date range, or import visit data from Information &rarr;
            Data.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <ClientAnalyticsWorkspace analytics={analytics} />;
}

export function ClientAnalyticsWorkspace({ analytics }: { analytics: ServiceAnalytics }) {
  const {
    coverage, householdSize, languages, responseCoverage, ageBands, geography, demographics,
  } = analytics;
  // `resolvedTheme`, not `theme`: the latter can be "system", which the map
  // has no palette for. This resolves it to light or dark.
  const { resolvedTheme } = useTheme();

  /**
   * Only the records this range contains. `coverage.sources` is range-scoped,
   * so a window after the June 2026 changeover names SIMC alone rather than
   * offering a Link2Feed pill with nothing behind it.
   */
  const presentSources = React.useMemo(
    () => new Set(coverage.sources.map((entry) => entry.source)),
    [coverage.sources],
  );
  const intakePills = React.useMemo(() => [
    ...(presentSources.has('link2feed') ? ['Link2Feed'] : []),
    ...(presentSources.has('simc') ? ['SIMC'] : []),
  ], [presentSources]);

  // The tail past seven is thin and reaches twelve, so it folds into one 8+
  // bucket rather than drawing five bars that round to nothing.
  const sizeData = React.useMemo(() => {
    const grouped: Array<{ label: string; visits: number }> = [];
    for (const row of householdSize) {
      const label = row.people >= 8 ? '8+' : String(row.people);
      const existing = grouped.find((entry) => entry.label === label);
      if (existing) existing.visits += row.visits;
      else grouped.push({ label, visits: row.visits });
    }
    return grouped;
  }, [householdSize]);

  const sizeTotal = sizeData.reduce((total, row) => total + row.visits, 0);
  const singlePersonShare = sizeTotal > 0
    ? Math.round((sizeData.find((row) => row.label === '1')?.visits ?? 0) / sizeTotal * 100)
    : 0;

  /**
   * Fifty answers down to counts of one is not a chart. The most common are
   * plotted and the rest stated in the footnote — a display limit, not a
   * merge: the export carries every answer.
   */
  const LANGUAGES_PLOTTED = 15;
  const languageRows = languages.values.slice(0, LANGUAGES_PLOTTED);
  const languageOverflow = Math.max(0, languages.values.length - languageRows.length);
  /**
   * Postal codes are a long tail — 272 of them, most with a handful of
   * households. The named rows are the ones a reader can act on; the rest are
   * summed into one row rather than dropped, so the bars still account for
   * every household with a recorded address.
   */
  /**
   * Postal codes as points, sized by how many households they hold.
   *
   * Circle area is proportional to the count — radius scales with its square
   * root — because the eye compares areas, and scaling the radius directly
   * would make a code with twice the households look four times as large.
   */
  const mapPoints = React.useMemo(() => {
    const placed = geography.postalCodes.filter(
      (row): row is typeof row & { latitude: number; longitude: number } =>
        row.latitude !== null && row.longitude !== null,
    );
    const largest = Math.max(1, ...placed.map((row) => row.clients));
    return placed.map((row) => ({
      ...row,
      size: 8 + 46 * Math.sqrt(row.clients / largest),
    }));
  }, [geography.postalCodes]);

  /**
   * The household-weighted *median*, not the mean. A mean is dragged by the
   * handful of postal codes reaching Hawaii and the east coast, and opened the
   * map on farmland south of the city. A median cannot be moved by how far an
   * outlier sits, only by how many households sit there, so it lands on the
   * neighbourhoods the pantry actually serves.
   */
  const mapCenter = React.useMemo((): [number, number] => {
    const total = mapPoints.reduce((sum, row) => sum + row.clients, 0);
    if (total === 0) return [-122.68, 45.52];
    const weightedMedian = (pick: (row: (typeof mapPoints)[number]) => number) => {
      const sorted = [...mapPoints].sort((left, right) => pick(left) - pick(right));
      let seen = 0;
      for (const row of sorted) {
        seen += row.clients;
        if (seen >= total / 2) return pick(row);
      }
      return pick(sorted[sorted.length - 1]);
    };
    return [weightedMedian((row) => row.longitude), weightedMedian((row) => row.latitude)];
  }, [mapPoints]);

  const languageAnsweredPercent = languages.householdsAsked > 0
    ? Math.round((languages.householdsAnswered / languages.householdsAsked) * 100)
    : 0;

  /**
   * Eight age bands with `interval={0}` collide once the card is narrow, so
   * the axis is measured and the labels tilt only when they have to. The chart
   * grows by whatever the tilted labels need, rather than the bars giving up
   * the space.
   */
  const [ageChartRef, ageAxisProps, ageAxisExtraHeight] = useCategoryAxis(
    ageBands.bands.map((band) => band.label),
  );

  /** Short labels, but the same treatment so a long one never runs together. */
  const [sizeChartRef, sizeAxisProps, sizeAxisExtraHeight] = useCategoryAxis(
    sizeData.map((row) => String(row.label)),
  );

  return (
    <div className="space-y-4">
      {/* ---- Household Size ----------------------------------------------- */}
      {sizeData.length > 0 && (
        <SelectableBlock cardId="clients-household-size">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Household Size</CardTitle>
              <CardDescription>
                People per household as reported at intake, counted per visit.
              </CardDescription>
              <SourcePills sources={intakePills} />
            </CardHeader>
            <CardContent>
              <div ref={sizeChartRef}>
              <ChartContainer
                config={{ visits: { label: 'Visits', color: carbonChartColors.blue.primary.light } } satisfies ChartConfig}
                className="w-full"
                style={{ height: `${240 + sizeAxisExtraHeight}px` }}
              >
                <BarChart data={sizeData} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} {...sizeAxisProps} />
                  <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={formatAxisNumber} />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => `${value} ${value === '1' ? 'person' : 'people'}`} />} />
                  <Bar dataKey="visits" fill={seriesColor('visits')} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartContainer>
              </div>
              <FootnoteList
                items={[
                  `${singlePersonShare}% of visits are by a household of one.`,
                  'Excludes outliers marked as special events, flagged during data import.',
                  'Not every household discloses its size, treat these figures as an undercount.',
                ]}
              />
            </CardContent>
          </Card>
        </SelectableBlock>
      )}

      {/* ---- Age ----------------------------------------------------------- */}
      <SelectableBlock cardId="clients-age-bands">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Age of People Served</CardTitle>
            <CardDescription>Grouped age ranges for clients.</CardDescription>
            <SourcePills sources={ageBands.sources.map(sourceLabel)} />
          </CardHeader>
          <CardContent>
            {!ageBands.available ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No ages recorded in this range.
              </p>
            ) : (
              <>
                <div ref={ageChartRef}>
                <ChartContainer
                  config={{ count: { label: 'People', color: carbonChartColors.purple.primary.light } } satisfies ChartConfig}
                  className="w-full"
                  style={{ height: `${260 + ageAxisExtraHeight}px` }}
                >
                  <BarChart data={ageBands.bands} margin={{ left: 4, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    {/* Every band labelled. Recharts thins ticks when they
                        crowd, which silently dropped half of them — a band
                        chart whose axis reads 18-29, 45-59, 75-89, 105+ invites
                        the reader to think those are the bands. Forcing all
                        eight then collides them at narrow widths, so they tilt
                        when there is not room to sit flat. */}
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      {...ageAxisProps}
                    />
                    <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={formatAxisNumber} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill={seriesColor('count')} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>
                </div>
                <FootnoteList
                  items={[
                    ageBands.withoutBirthYear > 0
                      && `${count(ageBands.withoutBirthYear)} have no birth year on file `
                        + 'and are not counted.',
                    ageBands.estimatedBirthYears > 0
                      && `${count(ageBands.estimatedBirthYears)} were flagged as estimated.`,
                    ageBands.implausibleBirthYears > 0
                      && `${count(ageBands.implausibleBirthYears)} placeholder birth years `
                        + '(1901 or earlier) are shown rather than hidden.',
                    // Kept, shortened: without it the chart reads as one age
                    // distribution when it is two records counted differently.
                    'Link2Feed records one birth year per household, SIMC one per member.',
                  ]}
                />
              </>
            )}
          </CardContent>
        </Card>
      </SelectableBlock>

      {/* ---- Ethnicity, gender, housing ------------------------------------ */}
      <BreakdownCard
        cardId="clients-ethnicity"
        title="Ethnicity"
        description="As households reported it at intake."
        breakdown={demographics.ethnicity}
        color={carbonChartColors.magenta.primary.light}
        notes={['Link2Feed only \u2014 SIMC asks a different question.']}
      />

      <BreakdownCard
        cardId="clients-race-simc"
        title="Race or Ethnicity (SIMC)"
        description="As each household member reported it at intake."
        breakdown={demographics.simcRaceOrEthnicity}
        color={carbonChartColors.orange.primary.light}
        notes={['Counted in people, not households. Not comparable with Ethnicity above.']}
      />

      <BreakdownCard
        cardId="clients-gender-identity"
        title="Gender Identity"
        description="As households reported it at intake."
        breakdown={demographics.genderIdentity}
        color={carbonChartColors.cyan.primary.light}
        notes={['Link2Feed only \u2014 SIMC records this per person, shown below.']}
      />

      {/* Kept apart from the Link2Feed card above rather than summed: SIMC
          records gender for every household member and Link2Feed for whoever
          registered, so adding them would weight a SIMC household by its size
          and a Link2Feed household by one. The categories differ in wording
          too — "Trans Male/Trans Man" against "Transgender man". */}
      <BreakdownCard
        cardId="clients-gender-identity-simc"
        title="Gender Identity (SIMC)"
        description="As each household member reported it at intake."
        breakdown={demographics.simcGenderIdentity}
        color={carbonChartColors.purple.primary.light}
        notes={['Counted in people, not households. Not comparable with Gender Identity above.']}
      />

      <BreakdownCard
        cardId="clients-housing-type"
        title="Housing Type"
        description="Where households said they were living."
        breakdown={demographics.housingType}
        color={carbonChartColors.green.primary.light}
        notes={['Pairs with the no-fixed-address figure on Where Households Live.']}
      />

      {/* ---- Geography ------------------------------------------------------ */}
      {mapPoints.length > 0 && (
        <SelectableBlock cardId="clients-geography">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Where Households Live</CardTitle>
              <CardDescription>
                Households by postal code. Each circle covers a whole postal code,
                not an address.
              </CardDescription>
              <SourcePills sources={intakePills} />
            </CardHeader>
            <CardContent>
              <div className="h-[460px] overflow-hidden rounded-lg border">
                {/* Centred on where the households actually are rather than on
                    the extent of the data: a handful of out-of-state postal
                    codes reach Hawaii and the east coast, and fitting those
                    would zoom out to the whole country and render the local
                    picture — which is the entire point — unreadable. They are
                    still plotted, a pan away. */}
                <Map center={mapCenter} zoom={9} theme={resolvedTheme === 'dark' ? 'dark' : 'light'}>
                  <MapControls />
                  {mapPoints.map((point) => (
                    <MapMarker
                      key={point.postalCode}
                      longitude={point.longitude}
                      latitude={point.latitude}
                    >
                      <MarkerContent>
                        {/* Area scales with the count, not radius: doubling a
                            radius quadruples the ink, and the eye reads area. */}
                        <span
                          className="block rounded-full border border-white/70 bg-emerald-500/55"
                          style={{ width: point.size, height: point.size }}
                          aria-hidden="true"
                        />
                      </MarkerContent>
                      <MarkerTooltip>
                        {point.postalCode} · {count(point.clients)} households
                      </MarkerTooltip>
                    </MapMarker>
                  ))}
                </Map>
              </div>
              <FootnoteList
                items={[
                  'Postal codes only. No addresses are stored or shown.',
                  geography.noFixedAddressAsked && geography.noFixedAddress > 0
                    && `${count(geography.noFixedAddress)} households have no fixed address `
                      + 'and are not on the map.',
                  // Named from the data, never hardcoded: it is the code most
                  // often recorded for a household with no fixed address, so
                  // this follows the agency rather than going stale if it moves.
                  geography.agencyPostalCode
                    && `${geography.agencyPostalCode} is the agency's own code, entered when a `
                      + 'household has none to give, and is over-represented.',
                  geography.clientsWithoutPlace > 0
                    && `${count(geography.clientsWithoutPlace)} gave a postal code with no map `
                      + 'location, such as a PO-box-only code.',
                  geography.clientsWithoutPostalCode > 0
                    && `${count(geography.clientsWithoutPostalCode)} gave no postal code.`,
                ]}
              />
            </CardContent>
          </Card>
        </SelectableBlock>
      )}

      {/* ---- Languages ---------------------------------------------------- */}
      {languageRows.length > 0 && (
        <SelectableBlock cardId="clients-languages">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Languages Spoken at Home</CardTitle>
              <CardDescription>
                As households recorded them, in their own words.
              </CardDescription>
              <SourcePills sources={intakePills} />
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{ households: { label: 'Households', color: carbonChartColors.teal.primary.light } } satisfies ChartConfig}
                className="h-[420px] w-full"
              >
                <BarChart data={languageRows} layout="vertical" margin={{ left: 8, right: 24, top: 4 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
                  <YAxis
                    type="category"
                    dataKey="language"
                    tickLine={false}
                    axisLine={false}
                    width={132}
                    interval={0}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="households" fill={seriesColor('households')} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ChartContainer>
              <FootnoteList
                items={[
                  `About ${languageAnsweredPercent}% of households answered this question.`,
                  languageOverflow > 0
                    && `${count(languages.values.length)} answers in total; the `
                      + `${count(languageOverflow)} rarest are in the exported data.`,
                  '\u201CMandarin Chinese\u201D counts as \u201CMandarin\u201D; the export '
                    + 'keeps every answer as recorded.',
                ]}
              />
            </CardContent>
          </Card>
        </SelectableBlock>
      )}

      {/* ---- Response Coverage -------------------------------------------- */}
      {responseCoverage.length > 0 && (
        <SelectableBlock cardId="clients-response-coverage">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Demographics Questions Response Rate</CardTitle>
              <CardDescription>
                The denominator behind every other demographic figure.
              </CardDescription>
              <SourcePills sources={intakePills} />
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  provided: { label: 'Answered', color: carbonChartColors.blue.primary.light },
                  notProvided: { label: 'Not answered', color: carbonChartColors.warmGray.primary.light },
                } satisfies ChartConfig}
                className="h-[520px] w-full"
              >
                <BarChart data={responseCoverage} layout="vertical" margin={{ left: 8, right: 24, top: 4 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={formatAxisNumber} />
                  <YAxis
                    type="category"
                    dataKey="displayName"
                    tickLine={false}
                    axisLine={false}
                    width={168}
                    interval={0}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="provided" stackId="a" fill={seriesColor('provided')} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="notProvided" stackId="a" fill={seriesColor('notProvided')} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ChartContainer>
              <FootnoteList
                items={[
                  'Questions asked during intake.',
                  'Not all households have been asked the same questions.',
                  'Declining to answer counts as not answered.',
                ]}
              />
            </CardContent>
          </Card>
        </SelectableBlock>
      )}

    </div>
  );
}
