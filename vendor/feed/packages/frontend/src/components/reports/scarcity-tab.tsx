// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

import { prefersReducedMotion } from '@/lib/reduced-motion'
import { ColumnDef } from "@tanstack/react-table";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { EnhancedDataTable } from "@/components/ui/enhanced-data-table";
import {
  SCARCITY_CARDS,
  ScarcityResult,
  StockoutEpisode,
} from "@/types/reports";
import {
  ExportCsvButton,
  formatDateTime,
  formatDays,
  formatPercent,
  KpiStat,
  ReportTabProps,
  seriesChartConfig,
  TabStateGate,
} from "./shared";
import { SelectableBlock } from "./selection";

const availabilityConfig = seriesChartConfig(
  "availabilityPercent",
  "Availability %",
  1
);
const frequencyConfig = seriesChartConfig("episodeCount", "Stockouts", 2);

const ENDED_BY_LABELS: Record<StockoutEpisode["endedBy"], string> = {
  restock: "Restocked",
  deletion: "Item deleted",
  "range-end": "Ongoing at range end",
};

export function ScarcityTab(props: ReportTabProps<ScarcityResult>) {
  return (
    <TabStateGate {...props}>
      {(result) => (
        <div className="space-y-4">
          <SelectableBlock cardId={SCARCITY_CARDS.kpi}><Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>Availability, Stockouts & Restock</CardTitle>
                <CardDescription>
                  Item-day weighted availability across the tracked range
                </CardDescription>
              </div>
              <ExportCsvButton
                cardId={SCARCITY_CARDS.kpi}
                onExportCsv={props.onExportCsv}
              />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <KpiStat
                  label="Availability"
                  value={formatPercent(result.kpis.availabilityItemDaysPercent)}
                  hint="share of tracked item-days in stock"
                />
                <KpiStat
                  label="Stockout Episodes"
                  value={String(result.kpis.stockoutEpisodes)}
                  hint={`${result.kpis.itemsWithStockout} items affected`}
                />
                <KpiStat
                  label="Ongoing Stockouts"
                  value={String(result.kpis.ongoingStockouts)}
                />
                <KpiStat
                  label="Avg. Days to Restock"
                  value={
                    result.kpis.averageRestockDays === null
                      ? "Unknown"
                      : result.kpis.averageRestockDays.toFixed(1)
                  }
                  hint="actual restocks only"
                />
              </div>
            </CardContent>
          </Card></SelectableBlock>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectableBlock cardId={SCARCITY_CARDS.availabilityOverTime}><Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Availability Over Time</CardTitle>
                  <CardDescription>
                    Percent of tracked items in stock
                  </CardDescription>
                </div>
                <ExportCsvButton
                  cardId={SCARCITY_CARDS.availabilityOverTime}
                  onExportCsv={props.onExportCsv}
                />
              </CardHeader>
              <CardContent>
                <ChartContainer config={availabilityConfig} className="h-64 w-full">
                  <AreaChart data={result.availabilityOverTime}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      tickFormatter={(value: string) =>
                        format(new Date(`${value}T00:00:00`), "MMM d")
                      }
                    />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={34} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area isAnimationActive={!prefersReducedMotion()}
                      dataKey="availabilityPercent"
                      type="monotone"
                      stroke="var(--color-availabilityPercent)"
                      fill="var(--color-availabilityPercent)"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card></SelectableBlock>

            <SelectableBlock cardId={SCARCITY_CARDS.stockoutFrequency}><Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Stockout Frequency</CardTitle>
                  <CardDescription>Most-affected items</CardDescription>
                </div>
                <ExportCsvButton
                  cardId={SCARCITY_CARDS.stockoutFrequency}
                  onExportCsv={props.onExportCsv}
                />
              </CardHeader>
              <CardContent>
                {result.stockoutFrequency.length === 0 ? (
                  <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No stockout episodes in this range.
                  </p>
                ) : (
                  <ChartContainer config={frequencyConfig} className="h-64 w-full">
                    <BarChart data={result.stockoutFrequency} layout="vertical">
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                      <YAxis
                        type="category"
                        dataKey="itemName"
                        tickLine={false}
                        axisLine={false}
                        width={130}
                        fontSize={12}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar isAnimationActive={!prefersReducedMotion()} dataKey="episodeCount" fill="var(--color-episodeCount)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card></SelectableBlock>
          </div>

          <SelectableBlock cardId={SCARCITY_CARDS.episodesTable}><div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Stockout Episodes</h3>
                <p className="text-sm text-muted-foreground">
                  Start, end, and duration of each out-of-stock period
                </p>
              </div>
              <ExportCsvButton
                cardId={SCARCITY_CARDS.episodesTable}
                onExportCsv={props.onExportCsv}
              />
            </div>
            <EnhancedDataTable
              columns={episodeColumns}
              data={result.episodes}
              isLoading={props.isLoading}
              filterColumn="itemName"
              filterPlaceholder="Filter items..."
            />
          </div></SelectableBlock>
        </div>
      )}
    </TabStateGate>
  );
}

const episodeColumns: ColumnDef<StockoutEpisode>[] = [
  { accessorKey: "itemName", header: "Name" },
  { accessorKey: "categoryName", header: "Category" },
  {
    accessorKey: "startAt",
    header: "Out of Stock Since",
    cell: ({ row }) => formatDateTime(row.original.startAt),
  },
  {
    accessorKey: "endAt",
    header: "Back in Stock",
    cell: ({ row }) => formatDateTime(row.original.endAt),
  },
  {
    accessorKey: "durationDays",
    header: "Duration",
    cell: ({ row }) => formatDays(row.original.durationDays),
  },
  {
    accessorKey: "endedBy",
    header: "Ended By",
    cell: ({ row }) => ENDED_BY_LABELS[row.original.endedBy],
  },
];
