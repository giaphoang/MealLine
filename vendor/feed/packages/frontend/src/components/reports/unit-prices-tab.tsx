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
  PriceHistoryRow,
  UNIT_PRICES_CARDS,
  UnitPricesResult,
} from "@/types/reports";
import {
  ExportCsvButton,
  formatCents,
  formatDateTime,
  KpiStat,
  ReportTabProps,
  seriesChartConfig,
  TabStateGate,
} from "./shared";
import { SelectableBlock } from "./selection";

const costChangeConfig = {
  ...seriesChartConfig("previousUnitCostCents", "Previous unit cost", 5),
  ...seriesChartConfig("latestUnitCostCents", "Latest unit cost", 0),
};

const impactConfig = seriesChartConfig("impactCents", "Cost impact", 3);

const PRICE_TYPE_LABELS: Record<PriceHistoryRow["priceType"], string> = {
  paid: "Purchased",
  donated: "Donated/Free",
  unknown: "Unknown",
};

export function UnitPricesTab(props: ReportTabProps<UnitPricesResult>) {
  return (
    <TabStateGate {...props}>
      {(result) => (
        <div className="space-y-4">
          <SelectableBlock cardId={UNIT_PRICES_CARDS.kpi}><Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>Price Coverage & Changes</CardTitle>
                <CardDescription>
                  Purchased, donated, and unknown-cost supply stay separate.
                </CardDescription>
              </div>
              <ExportCsvButton
                cardId={UNIT_PRICES_CARDS.kpi}
                onExportCsv={props.onExportCsv}
              />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <KpiStat
                  label="Purchased"
                  value={String(result.kpis.paidItems)}
                  hint={`of ${result.kpis.totalItems} items`}
                />
                <KpiStat
                  label="Donated/Free"
                  value={String(result.kpis.donatedItems)}
                />
                <KpiStat
                  label="Unknown Price"
                  value={String(result.kpis.unknownPriceItems)}
                />
                <KpiStat
                  label="Recent Price Changes"
                  value={String(result.kpis.priceChangesInRange)}
                  hint={`${result.kpis.itemsWithPriceChangeInRange} items in range`}
                />
              </div>
            </CardContent>
          </Card></SelectableBlock>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectableBlock cardId={UNIT_PRICES_CARDS.costTrends}><Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Unit Cost Trends</CardTitle>
                  <CardDescription>
                    Latest vs preceding paid unit cost (¢), largest recent
                    changes first
                  </CardDescription>
                </div>
                <ExportCsvButton
                  cardId={UNIT_PRICES_CARDS.costTrends}
                  onExportCsv={props.onExportCsv}
                />
              </CardHeader>
              <CardContent>
                {result.unitCostChanges.length === 0 ? (
                  <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No paid unit-cost changes in this range.
                  </p>
                ) : (
                  <ChartContainer config={costChangeConfig} className="h-64 w-full">
                    <BarChart data={result.unitCostChanges}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="itemName" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} width={44} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar isAnimationActive={!prefersReducedMotion()} dataKey="previousUnitCostCents" fill="var(--color-previousUnitCostCents)" radius={4} />
                      <Bar isAnimationActive={!prefersReducedMotion()} dataKey="latestUnitCostCents" fill="var(--color-latestUnitCostCents)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card></SelectableBlock>

            <SelectableBlock cardId={UNIT_PRICES_CARDS.costImpact}><Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Paid Replacement Cost Impact</CardTitle>
                  <CardDescription>
                    Projected demand × latest-vs-preceding paid cost (¢)
                  </CardDescription>
                </div>
                <ExportCsvButton
                  cardId={UNIT_PRICES_CARDS.costImpact}
                  onExportCsv={props.onExportCsv}
                />
              </CardHeader>
              <CardContent>
                {result.costImpacts.length === 0 ? (
                  <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No items have both burn history and a paid price change.
                  </p>
                ) : (
                  <ChartContainer config={impactConfig} className="h-64 w-full">
                    <BarChart data={result.costImpacts}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="itemName" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} width={54} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar isAnimationActive={!prefersReducedMotion()} dataKey="impactCents" fill="var(--color-impactCents)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card></SelectableBlock>
          </div>

          <SelectableBlock cardId={UNIT_PRICES_CARDS.historyTable}><div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Price History</h3>
                <p className="text-sm text-muted-foreground">
                  Price-recording ledger events in this range
                </p>
              </div>
              <ExportCsvButton
                cardId={UNIT_PRICES_CARDS.historyTable}
                onExportCsv={props.onExportCsv}
              />
            </div>
            <EnhancedDataTable
              columns={priceHistoryColumns}
              data={result.priceHistory}
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

const priceHistoryColumns: ColumnDef<PriceHistoryRow>[] = [
  {
    accessorKey: "at",
    header: "Recorded",
    cell: ({ row }) => formatDateTime(row.original.at),
  },
  { accessorKey: "itemName", header: "Name" },
  { accessorKey: "categoryName", header: "Category" },
  {
    accessorKey: "priceType",
    header: "Price Type",
    cell: ({ row }) => PRICE_TYPE_LABELS[row.original.priceType],
  },
  {
    accessorKey: "purchasePriceCents",
    header: "Purchase Price",
    cell: ({ row }) => formatCents(row.original.purchasePriceCents),
  },
  { accessorKey: "unitsPerPurchase", header: "Units" },
  {
    accessorKey: "unitCostCents",
    header: "Unit Cost",
    cell: ({ row }) => formatCents(row.original.unitCostCents),
  },
  {
    accessorKey: "changeCents",
    header: "Change",
    cell: ({ row }) => {
      const change = row.original.changeCents;
      if (change === null) return "—";
      const sign = change > 0 ? "+" : change < 0 ? "−" : "";
      return `${sign}${formatCents(Math.abs(change))}`;
    },
  },
];
