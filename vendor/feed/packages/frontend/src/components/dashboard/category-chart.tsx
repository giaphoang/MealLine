// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";
import { prefersReducedMotion } from '@/lib/reduced-motion'
import { TrendingUp, Shapes } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { useCategoryChartData } from "@/hooks/dashboard/useCategoryChartData"
import { useTheme } from "next-themes"
import { getChartColor } from "@/lib/colors"
import { chartConfigPresets } from "@/lib/colors"

interface CategoryChartProps {
  minimumItems?: number;
}

export function CategoryChart({ minimumItems = 1 }: CategoryChartProps = {}) {
  const { data, isLoading, error } = useCategoryChartData(minimumItems);
  const { resolvedTheme } = useTheme();
  const colorScheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center justify-between space-y-0">
            <div>
              <CardTitle>Categories</CardTitle>
              <CardDescription>Distribution by category</CardDescription>
            </div>
            <Shapes className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-[20px] w-full" />
            <Skeleton className="h-[20px] w-[90%]" />
            <Skeleton className="h-[20px] w-[80%]" />
            <Skeleton className="h-[20px] w-[70%]" />
            <Skeleton className="h-[20px] w-[60%]" />
          </div>
        </CardContent>
        <CardFooter>
          <Skeleton className="h-[40px] w-full" />
        </CardFooter>
      </Card>
    )
  }

  if (error || !data || data.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center justify-between space-y-0">
            <div>
              <CardTitle>Categories</CardTitle>
              <CardDescription>Distribution by category</CardDescription>
            </div>
            <Shapes className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
            {error ? 'Failed to load category data' : data.length === 0 ? 'No active categories found' : 'No categories with items found'}
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalItems = data.reduce((sum, cat) => sum + cat.items, 0)
  const highestCategory = data[0]
  const percentageInHighest = ((highestCategory.items / totalItems) * 100).toFixed(1)

  // Adaptive X-axis domain padding to ensure right-side value labels remain visible
  const maxItems = Math.max(0, ...data.map((d) => d.items || 0))
  let xAxisDomain: [number, number]
  if (maxItems === 0) {
    xAxisDomain = [0, 1]
  } else if (maxItems < 5) {
    xAxisDomain = [0, 5]
  } else {
    xAxisDomain = [0, Math.ceil(maxItems * 1.1)]
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between space-y-0">
          <div>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Distribution by category</CardDescription>
          </div>
          <Shapes className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfigPresets.categoryChart} className="w-full">
          <BarChart
            accessibilityLayer
            data={data}
            layout="vertical"
            margin={{
              right: 16,
            }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="category"
              type="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              hide
            />
            <XAxis dataKey="items" type="number" domain={xAxisDomain} hide />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Bar isAnimationActive={!prefersReducedMotion()}
            dataKey="items"
            layout="vertical"
            fill="var(--color-items-fill)"
            radius={4}
            >
              <LabelList
                dataKey="category"
                position="insideLeft"
                offset={8}
                className="fill-background"
                fontSize={12}
              />
              <LabelList
                dataKey="items" 
                position="right"
                offset={8}
                className="fill-foreground"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 font-medium leading-none">
          Most items in {highestCategory.category} <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          {percentageInHighest}% of items are in the {highestCategory.category} category
        </div>
      </CardFooter>
    </Card>
  )
}
