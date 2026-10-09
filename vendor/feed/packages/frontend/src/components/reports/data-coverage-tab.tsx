// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

import { prefersReducedMotion } from '@/lib/reduced-motion'
import { ColumnDef } from "@tanstack/react-table";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
  CoverageResult,
  DATA_COVERAGE_CARDS,
  DataGapRow,
} from "@/types/reports";
import {
  ExportCsvButton,
  formatDateTime,
  formatPercent,
  KpiStat,
  ReportTabProps,
  seriesChartConfig,
  TabStateGate,
} from "./shared";
import { SelectableBlock } from "./selection";

const readinessConfig = seriesChartConfig("itemCount", "Items", 4);
const activityConfig = seriesChartConfig("eventCount", "Ledger events", 1);

export function DataCoverageTab(props: ReportTabProps<CoverageResult>) {
  return (
    <TabStateGate {...props}>
      {(result) => (
        <div className="space-y-4">
          <SelectableBlock cardId={DATA_COVERAGE_CARDS.kpi}><Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>Recording Coverage</CardTitle>
                <CardDescription>
                  How complete the logistics inputs are; earlier time is
                  untracked, never estimated.
                </CardDescription>
              </div>
              <ExportCsvButton
                cardId={DATA_COVERAGE_CARDS.kpi}
                onExportCsv={props.onExportCsv}
              />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <KpiStat
                  label="Quantity Coverage"
                  value={formatPercent(result.kpis.quantityCoveragePercent)}
                  hint={`of ${result.kpis.liveItems} items`}
                />
                <KpiStat
                  label="Price Coverage"
                  value={formatPercent(result.kpis.priceCoveragePercent)}
                />
                <KpiStat
                  label="Burn-Ready"
                  value={formatPercent(result.kpis.burnReadyPercent)}
                  hint="items with usable burn history"
                />
                <KpiStat
                  label="Ledger Events"
                  value={String(result.kpis.eventsInRange)}
                  hint="recorded in this range"
                />
              </div>
            </CardContent>
          </Card></SelectableBlock>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectableBlock cardId={DATA_COVERAGE_CARDS.burnReadiness}><Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Burn-Rate Readiness</CardTitle>
                  <CardDescription>
                    Items by projection data status
                  </CardDescription>
                </div>
                <ExportCsvButton
                  cardId={DATA_COVERAGE_CARDS.burnReadiness}
                  onExportCsv={props.onExportCsv}
                />
              </CardHeader>
              <CardContent>
                <ChartContainer config={readinessConfig} className="h-64 w-full">
                  <BarChart data={result.burnReadiness}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="status" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar isAnimationActive={!prefersReducedMotion()} dataKey="itemCount" fill="var(--color-itemCount)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card></SelectableBlock>

            <SelectableBlock cardId={DATA_COVERAGE_CARDS.recordingActivity}><Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Recording Activity</CardTitle>
                  <CardDescription>Ledger events per week</CardDescription>
                </div>
                <ExportCsvButton
                  cardId={DATA_COVERAGE_CARDS.recordingActivity}
                  onExportCsv={props.onExportCsv}
                />
              </CardHeader>
              <CardContent>
                <ChartContainer config={activityConfig} className="h-64 w-full">
                  <BarChart data={result.recordingActivity}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="weekStart"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      tickFormatter={(value: string) =>
                        format(new Date(`${value}T00:00:00`), "MMM d")
                      }
                    />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar isAnimationActive={!prefersReducedMotion()} dataKey="eventCount" fill="var(--color-eventCount)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card></SelectableBlock>
          </div>

          <SelectableBlock cardId={DATA_COVERAGE_CARDS.gapsTable}><div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Item-Level Data Gaps</h3>
                <p className="text-sm text-muted-foreground">
                  Which inputs each item is missing, most-incomplete first
                </p>
              </div>
              <ExportCsvButton
                cardId={DATA_COVERAGE_CARDS.gapsTable}
                onExportCsv={props.onExportCsv}
              />
            </div>
            <EnhancedDataTable
              columns={gapColumns}
              data={result.gaps}
              isLoading={props.isLoading}
              filterColumn="name"
              filterPlaceholder="Filter items..."
            />
          </div></SelectableBlock>
        </div>
      )}
    </TabStateGate>
  );
}

const yesNo = (value: boolean) => (value ? "Yes" : "No");

const gapColumns: ColumnDef<DataGapRow>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "categoryName", header: "Category" },
  {
    accessorKey: "hasQuantity",
    header: "Quantity",
    cell: ({ row }) => yesNo(row.original.hasQuantity),
  },
  {
    accessorKey: "hasPrice",
    header: "Price",
    cell: ({ row }) => yesNo(row.original.hasPrice),
  },
  {
    accessorKey: "burnReady",
    header: "Burn-Ready",
    cell: ({ row }) => yesNo(row.original.burnReady),
  },
  {
    accessorKey: "lastQuantityChangeAt",
    header: "Last Quantity Change",
    cell: ({ row }) => formatDateTime(row.original.lastQuantityChangeAt),
  },
];
