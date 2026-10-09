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
  INVENTORY_OUTLOOK_CARDS,
  InventoryOutlookResult,
  ItemOutlook,
} from "@/types/reports";
import {
  ExportCsvButton,
  formatCents,
  formatCount,
  formatDate,
  formatDays,
  KpiStat,
  ReportTabProps,
  seriesChartConfig,
  TabStateGate,
} from "./shared";
import { SelectableBlock } from "./selection";

const coverBandsConfig = seriesChartConfig("itemCount", "Items", 0);
const stockoutConfig = seriesChartConfig("itemCount", "Projected stockouts", 3);

const DATA_STATUS_LABELS: Record<ItemOutlook["dataStatus"], string> = {
  ok: "OK",
  "unknown-quantity": "Unknown quantity",
  "insufficient-history": "Insufficient history",
  "out-of-stock": "Out of stock",
};

export function InventoryOutlookTab(
  props: ReportTabProps<InventoryOutlookResult>
) {
  return (
    <TabStateGate {...props}>
      {(result) => {
        const { kpis } = result;
        return (
          <div className="space-y-4">
            {/* KPI summary: stock, coverage, and risk */}
            <SelectableBlock cardId={INVENTORY_OUTLOOK_CARDS.kpi}><Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Stock, Coverage & Risk</CardTitle>
                  <CardDescription>
                    {kpis.itemsWithComputableCover} of {kpis.inStockItems}{" "}
                    in-stock items have burn-ready history; earlier time is
                    untracked.
                  </CardDescription>
                </div>
                <ExportCsvButton
                  cardId={INVENTORY_OUTLOOK_CARDS.kpi}
                  onExportCsv={props.onExportCsv}
                />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <KpiStat
                    label="In Stock"
                    value={`${kpis.inStockItems} / ${kpis.totalItems}`}
                    hint={
                      kpis.availabilityPercent === null
                        ? undefined
                        : `${kpis.availabilityPercent.toFixed(0)}% availability`
                    }
                  />
                  <KpiStat
                    label="Known Quantities"
                    value={String(kpis.itemsWithKnownQuantity)}
                    hint={`of ${kpis.totalItems} items`}
                  />
                  <KpiStat
                    label="Median Days of Cover"
                    value={
                      kpis.medianDaysOfCover === null
                        ? "Unknown"
                        : kpis.medianDaysOfCover.toFixed(1)
                    }
                    hint={`${kpis.itemsWithComputableCover} calculable items`}
                  />
                  <KpiStat
                    label={`Projected Stockouts (${kpis.horizonDays}d)`}
                    value={String(kpis.projectedStockoutsWithinHorizon)}
                    hint="in-stock items projected to hit zero"
                  />
                </div>
              </CardContent>
            </Card></SelectableBlock>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Chart 1: days-of-cover bands */}
              <SelectableBlock cardId={INVENTORY_OUTLOOK_CARDS.coverBands}><Card>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle>Days-of-Cover Bands</CardTitle>
                    <CardDescription>
                      In-stock items grouped by projected cover
                    </CardDescription>
                  </div>
                  <ExportCsvButton
                    cardId={INVENTORY_OUTLOOK_CARDS.coverBands}
                    onExportCsv={props.onExportCsv}
                  />
                </CardHeader>
                <CardContent>
                  <ChartContainer config={coverBandsConfig} className="h-64 w-full">
                    <BarChart data={result.daysOfCoverBands}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="band" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar isAnimationActive={!prefersReducedMotion()} dataKey="itemCount" fill="var(--color-itemCount)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card></SelectableBlock>

              {/* Chart 2: projected stockout timeline */}
              <SelectableBlock cardId={INVENTORY_OUTLOOK_CARDS.stockoutTimeline}><Card>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle>Projected Stockout Timeline</CardTitle>
                    <CardDescription>
                      Items projected to run out, by week
                    </CardDescription>
                  </div>
                  <ExportCsvButton
                    cardId={INVENTORY_OUTLOOK_CARDS.stockoutTimeline}
                    onExportCsv={props.onExportCsv}
                  />
                </CardHeader>
                <CardContent>
                  <ChartContainer config={stockoutConfig} className="h-64 w-full">
                    <BarChart data={result.stockoutTimeline}>
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
                      <Bar isAnimationActive={!prefersReducedMotion()} dataKey="itemCount" fill="var(--color-itemCount)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card></SelectableBlock>
            </div>

            {/* Detail table: item outlook */}
            <SelectableBlock cardId={INVENTORY_OUTLOOK_CARDS.itemTable}><div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Item Outlook</h3>
                  <p className="text-sm text-muted-foreground">
                    Quantity, burn, cover, and projected stockout per item
                  </p>
                </div>
                <ExportCsvButton
                  cardId={INVENTORY_OUTLOOK_CARDS.itemTable}
                  onExportCsv={props.onExportCsv}
                />
              </div>
              <EnhancedDataTable
                columns={itemOutlookColumns}
                data={result.items}
                isLoading={props.isLoading}
                filterColumn="name"
                filterPlaceholder="Filter items..."
              />
            </div></SelectableBlock>
          </div>
        );
      }}
    </TabStateGate>
  );
}

const itemOutlookColumns: ColumnDef<ItemOutlook>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "categoryName", header: "Category" },
  {
    accessorKey: "estimatedQuantity",
    header: "Quantity",
    cell: ({ row }) => formatCount(row.original.estimatedQuantity),
  },
  {
    accessorKey: "weeklyBurn",
    header: "Weekly Burn",
    cell: ({ row }) =>
      row.original.weeklyBurn === null
        ? "Unknown"
        : row.original.weeklyBurn.toFixed(1),
  },
  {
    accessorKey: "daysOfCover",
    header: "Days of Cover",
    cell: ({ row }) => formatDays(row.original.daysOfCover),
  },
  {
    accessorKey: "projectedStockoutAt",
    header: "Projected Stockout",
    cell: ({ row }) => formatDate(row.original.projectedStockoutAt),
  },
  {
    accessorKey: "purchasesNeeded",
    header: "Purchases Needed",
    cell: ({ row }) => formatCount(row.original.purchasesNeeded),
  },
  {
    accessorKey: "projectedCostCents",
    header: "Projected Cost",
    cell: ({ row }) => {
      const { projectedCostCents, priceType } = row.original;
      if (priceType === "unknown") return "Unknown";
      if (projectedCostCents === null) return "—";
      return formatCents(projectedCostCents);
    },
  },
  {
    accessorKey: "dataStatus",
    header: "Data Status",
    cell: ({ row }) => DATA_STATUS_LABELS[row.original.dataStatus],
  },
];
