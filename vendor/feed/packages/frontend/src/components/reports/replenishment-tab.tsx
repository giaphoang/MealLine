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
  REPLENISHMENT_CARDS,
  ReplenishmentPlanRow,
  ReplenishmentResult,
} from "@/types/reports";
import {
  ExportCsvButton,
  formatCents,
  formatCount,
  formatDays,
  KpiStat,
  ReportTabProps,
  seriesChartConfig,
  TabStateGate,
} from "./shared";
import { SelectableBlock } from "./selection";

const priorityConfig = seriesChartConfig("priorityValue", "Days of cover", 3);
const spendConfig = seriesChartConfig("knownSpendCents", "Known spend (¢)", 0);

const MISSING_INPUT_LABELS: Record<
  ReplenishmentPlanRow["missingInputs"][number],
  string
> = {
  quantity: "Quantity",
  "burn-history": "Burn history",
  price: "Price",
};

export function ReplenishmentTab(props: ReportTabProps<ReplenishmentResult>) {
  return (
    <TabStateGate {...props}>
      {(result) => (
        <div className="space-y-4">
          <SelectableBlock cardId={REPLENISHMENT_CARDS.kpi}><Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>Urgency, Spend & Missing Inputs</CardTitle>
                <CardDescription>
                  {result.kpis.horizonDays}-day planning horizon. Known spend
                  covers purchased items only; donated and unknown-cost demand
                  are excluded.
                </CardDescription>
              </div>
              <ExportCsvButton
                cardId={REPLENISHMENT_CARDS.kpi}
                onExportCsv={props.onExportCsv}
              />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <KpiStat
                  label="Items Needing Purchase"
                  value={String(result.kpis.itemsNeedingPurchase)}
                />
                <KpiStat
                  label="Urgent (≤7d cover)"
                  value={String(result.kpis.urgentItems)}
                />
                <KpiStat
                  label="Known Spend"
                  value={formatCents(result.kpis.knownSpendCents)}
                  hint={
                    result.kpis.donatedDemandItems > 0
                      ? `${result.kpis.donatedDemandItems} donated items excluded`
                      : undefined
                  }
                />
                <KpiStat
                  label="Missing Inputs"
                  value={String(result.kpis.missingInputItems)}
                  hint="items lacking quantity, history, or price"
                />
              </div>
            </CardContent>
          </Card></SelectableBlock>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectableBlock cardId={REPLENISHMENT_CARDS.reorderPriority}><Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Reorder Priority</CardTitle>
                  <CardDescription>
                    Soonest-out items needing purchases (days of cover)
                  </CardDescription>
                </div>
                <ExportCsvButton
                  cardId={REPLENISHMENT_CARDS.reorderPriority}
                  onExportCsv={props.onExportCsv}
                />
              </CardHeader>
              <CardContent>
                {result.reorderPriority.length === 0 ? (
                  <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No items need purchases within this horizon.
                  </p>
                ) : (
                  <ChartContainer config={priorityConfig} className="h-64 w-full">
                    <BarChart
                      data={result.reorderPriority.map((row) => ({
                        ...row,
                        displayName: row.isInStock ? row.name : `${row.name} (Out)`,
                        // Out-of-stock is a real zero-stock urgency signal;
                        // daysOfCover remains null in the canonical data when
                        // burn history is insufficient.
                        priorityValue: row.isInStock ? row.daysOfCover : 0,
                      }))}
                      layout="vertical"
                    >
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} />
                      <YAxis
                        type="category"
                        dataKey="displayName"
                        tickLine={false}
                        axisLine={false}
                        width={130}
                        fontSize={12}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar isAnimationActive={!prefersReducedMotion()} dataKey="priorityValue" fill="var(--color-priorityValue)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card></SelectableBlock>

            <SelectableBlock cardId={REPLENISHMENT_CARDS.spendByCategory}><Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Projected Spend by Category</CardTitle>
                  <CardDescription>
                    Known paid spend (¢) over the horizon
                  </CardDescription>
                </div>
                <ExportCsvButton
                  cardId={REPLENISHMENT_CARDS.spendByCategory}
                  onExportCsv={props.onExportCsv}
                />
              </CardHeader>
              <CardContent>
                {result.spendByCategory.length === 0 ? (
                  <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No projected purchases in this horizon.
                  </p>
                ) : (
                  <ChartContainer config={spendConfig} className="h-64 w-full">
                    <BarChart data={result.spendByCategory}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="categoryName" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} width={64} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar isAnimationActive={!prefersReducedMotion()} dataKey="knownSpendCents" fill="var(--color-knownSpendCents)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card></SelectableBlock>
          </div>

          <SelectableBlock cardId={REPLENISHMENT_CARDS.planTable}><div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Replenishment Plan</h3>
                <p className="text-sm text-muted-foreground">
                  Required units, whole packages, and projected cost per item
                </p>
              </div>
              <ExportCsvButton
                cardId={REPLENISHMENT_CARDS.planTable}
                onExportCsv={props.onExportCsv}
              />
            </div>
            <EnhancedDataTable
              columns={planColumns}
              data={result.plan}
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

const planColumns: ColumnDef<ReplenishmentPlanRow>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "isInStock",
    header: "Status",
    cell: ({ row }) => row.original.isInStock ? "In Stock" : "Out of Stock",
  },
  { accessorKey: "categoryName", header: "Category" },
  {
    accessorKey: "estimatedQuantity",
    header: "Quantity",
    cell: ({ row }) => formatCount(row.original.estimatedQuantity),
  },
  {
    accessorKey: "daysOfCover",
    header: "Days of Cover",
    cell: ({ row }) => formatDays(row.original.daysOfCover),
  },
  {
    accessorKey: "requiredUnits",
    header: "Required Units",
    cell: ({ row }) => formatCount(row.original.requiredUnits),
  },
  {
    accessorKey: "purchasesNeeded",
    header: "Purchases",
    cell: ({ row }) => formatCount(row.original.purchasesNeeded),
  },
  {
    accessorKey: "projectedCostCents",
    header: "Projected Cost",
    cell: ({ row }) => {
      const { priceType, projectedCostCents } = row.original;
      if (priceType === "unknown") return "Unknown";
      if (projectedCostCents === null) return "—";
      return formatCents(projectedCostCents);
    },
  },
  {
    accessorKey: "missingInputs",
    header: "Missing Inputs",
    cell: ({ row }) =>
      row.original.missingInputs.length === 0
        ? "—"
        : row.original.missingInputs
            .map((input) => MISSING_INPUT_LABELS[input])
            .join(", "),
  },
];
