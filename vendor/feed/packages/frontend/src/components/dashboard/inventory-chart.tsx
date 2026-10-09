// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";
import { prefersReducedMotion } from '@/lib/reduced-motion'
import { TrendingUp, Package } from "lucide-react";
import { Pie, PieChart, Cell, Label } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { useInventoryChartData } from "@/hooks/dashboard/useInventoryChartData"
import { chartConfigPresets } from "@/lib/colors"

// A helper to convert camelCase strings to Title Case.
function humanizeStatus(status: string): string {
  return status
    // Insert a space before any uppercase letter (except the first character)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Capitalize the first letter of each word
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

// Custom tooltip content that displays friendly status names.
function CustomTooltipContent(props: any) {
  const { active, payload } = props;
  if (active && payload && payload.length) {
    return (
      <div className="rounded bg-background p-2 shadow">
        {payload.map((entry: any) => (
          <div key={entry.name} className="flex items-center text-sm">
            <span
              className="mr-1 inline-block h-3 w-3 rounded"
              style={{ background: entry.color }}
            />
            <span className="font-medium">{humanizeStatus(entry.name)}</span>: {entry.value}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export function InventoryChart() {
  // Use our updated hook that returns distribution and totalItems
  const { distribution, totalItems, isLoading, error } = useInventoryChartData();

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center justify-between space-y-0">
            <div>
              <CardTitle>Inventory Distribution</CardTitle>
              <CardDescription>Current stock status overview</CardDescription>
            </div>
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
          <Skeleton className="h-[200px] w-[200px] rounded-full" />
        </CardContent>
        <CardFooter>
          <Skeleton className="h-[40px] w-full" />
        </CardFooter>
      </Card>
    );
  }

  if (error || !distribution || totalItems === undefined) {
    return (
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center justify-between space-y-0">
            <div>
              <CardTitle>Inventory Distribution</CardTitle>
              <CardDescription>Current stock status overview</CardDescription>
            </div>
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
            {error ? "Failed to load inventory data" : "No inventory data available"}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate available items (total minus out of stock)
  const outOfStockEntry = distribution.find((d) => d.status === "outOfStock");
  const outOfStockCount = outOfStockEntry?.items || 0;
  const inStockCount = totalItems - outOfStockCount;
  const inStockPercentage = totalItems > 0 ? ((inStockCount / totalItems) * 100).toFixed(0) : "0";
  
  // Generate contextual messaging based on percentage
  const getAvailabilityMessage = (percentage: number): string => {
    if (percentage >= 75) return "Most items available";
    if (percentage >= 50) return "About half available"; 
    if (percentage >= 25) return "Less than half available";
    return "Few items available";
  };
  
  const availabilityMessage = getAvailabilityMessage(parseInt(inStockPercentage));

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between space-y-0">
          <div>
            <CardTitle>Inventory Distribution</CardTitle>
            <CardDescription>Current stock status overview</CardDescription>
          </div>
          <Package className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfigPresets.inventoryChart}
          className="w-full aspect-2/1"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<CustomTooltipContent />}
            />
            <Pie isAnimationActive={!prefersReducedMotion()}
              data={distribution}
              dataKey="items"
              nameKey="status"
              innerRadius="70%"
              outerRadius="100%"
              paddingAngle={5}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-3xl font-bold"
                        >
                          {inStockCount.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground"
                        >
                          Items In Stock
                        </tspan>
                      </text>
                    );
                  }
                  return null;
                }}
              />
              {distribution.map((entry) => (
                <Cell
                  key={entry.status}
                  fill={entry.fill}
                  className="stroke-background"
                  strokeWidth={2}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex gap-2 font-medium leading-none">
          {availabilityMessage} <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          {inStockPercentage}% of items are available
        </div>
      </CardFooter>
    </Card>
  );
}
