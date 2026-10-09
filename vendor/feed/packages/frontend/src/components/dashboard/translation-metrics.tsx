// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";
import { prefersReducedMotion } from '@/lib/reduced-motion'
import type { ReactNode } from "react";
import { Timer, Zap, AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis, RadialBar, RadialBarChart, PolarRadiusAxis, Label } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useTranslationMetricsData } from "@/hooks/dashboard/useTranslationMetricsData"
import { useMultiServiceUsage } from "@/hooks/dashboard/useMultiServiceUsage"

function TranslationSuccessCard({ children }: { children: ReactNode }) {
  return <Card className="flex h-full flex-col">{children}</Card>;
}

const successConfig = {
  success: {
    label: "Success",
    theme: {
      light: 'var(--chart-success)',
      dark: 'var(--chart-success)'
    }
  },
  pending: {
    label: "Pending",
    theme: {
      light: 'var(--chart-warning)',
      dark: 'var(--chart-warning)'
    }
  },
  failed: {
    label: "Failed",
    theme: {
      light: 'var(--chart-danger)',
      dark: 'var(--chart-danger)'
    }
  }
} satisfies ChartConfig

const responseConfig = {
  time: {
    label: "Response Time",
    theme: {
      light: 'var(--color-time)',
      dark: 'var(--color-time)'
    }
  },
  label: {
    theme: {
      light: 'var(--color-label)',
      dark: 'var(--color-label)'
    }
  },
} satisfies ChartConfig

export function TranslationMetrics() {
  const { data, isLoading, error } = useTranslationMetricsData();
  const { data: multiServiceData, isLoading: multiServiceLoading } = useMultiServiceUsage();

  if (isLoading || multiServiceLoading) {
    return (
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <TranslationSuccessCard>
          <CardHeader className="items-center pb-0">
            <div className="flex items-center justify-between w-full">
              <div>
                <CardTitle>Translation Success</CardTitle>
                <CardDescription>Overall success rate</CardDescription>
              </div>
              <Zap className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 items-center pb-0">
            <Skeleton className="h-[250px] w-[250px] rounded-full" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-[40px] w-full" />
          </CardFooter>
        </TranslationSuccessCard>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Response Times</CardTitle>
                <CardDescription>Average by language</CardDescription>
              </div>
              <Timer className="h-4 w-4 text-muted-foreground" />
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
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <TranslationSuccessCard>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div>
                <CardTitle>Translation Success</CardTitle>
                <CardDescription>Overall success rate</CardDescription>
              </div>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              Failed to load success data
            </div>
          </CardContent>
        </TranslationSuccessCard>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Response Times</CardTitle>
                <CardDescription>Average by language</CardDescription>
              </div>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              Failed to load response time data
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No AI configurations configured
  if (!multiServiceData || multiServiceData.configurations.length === 0) {
    return (
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <TranslationSuccessCard>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div>
                <CardTitle>Translation Success</CardTitle>
                <CardDescription>Overall success rate</CardDescription>
              </div>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Services Configured</AlertTitle>
              <AlertDescription>
                Configure AI services in the AI Configuration section to see translation metrics.
              </AlertDescription>
            </Alert>
          </CardContent>
        </TranslationSuccessCard>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Response Times</CardTitle>
                <CardDescription>Average by language</CardDescription>
              </div>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Services Configured</AlertTitle>
              <AlertDescription>
                Configure AI services in the AI Configuration section to see response time data.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Services configured but no usage data yet
  if (!data || data.responseTimes.length === 0) {
    return (
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <TranslationSuccessCard>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div>
                <CardTitle>Translation Success</CardTitle>
                <CardDescription>Overall success rate</CardDescription>
              </div>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Usage Data Yet</AlertTitle>
              <AlertDescription>
                Run translation operations to generate metrics. Data will appear after translation activity begins.
              </AlertDescription>
            </Alert>
          </CardContent>
        </TranslationSuccessCard>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Response Times</CardTitle>
                <CardDescription>Average by language</CardDescription>
              </div>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Usage Data Yet</AlertTitle>
              <AlertDescription>
                Run translation operations to generate response time data. Data will appear after translation activity begins.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalSuccess = data.success[0].success + data.success[0].pending
  // Find maximum response time across all languages
  const maxResponseTime = Math.max(...data.responseTimes.map(item => item.time || 0));
  
  // Granular tiered scaling strategy for optimal visualization
  let xAxisDomain: [number, number];
  
  if (maxResponseTime < 0.05) {
    // Ultra-fast responses: scale 0–0.1s
    xAxisDomain = [0, 0.1];
  } else if (maxResponseTime < 0.1) {
    // Super-fast responses: scale 0–0.25s
    xAxisDomain = [0, 0.25];
  } else if (maxResponseTime < 0.25) {
    // Very fast responses: scale 0–0.5s
    xAxisDomain = [0, 0.5];
  } else if (maxResponseTime < 0.5) {
    // Fast responses: scale 0–1s
    xAxisDomain = [0, 1];
  } else if (maxResponseTime <= 5) {
    // Multi-second: add 50% buffer
    xAxisDomain = [0, Math.ceil(maxResponseTime * 1.5)];
  } else {
    // Long responses: add 1 second buffer
    xAxisDomain = [0, Math.ceil(maxResponseTime) + 1];
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      {/* Success Rate Gauge */}
      <TranslationSuccessCard>
        <CardHeader className="items-center pb-0">
          <div className="flex items-center justify-between w-full">
            <div>
              <CardTitle>Translation Success</CardTitle>
              <CardDescription>Overall success rate</CardDescription>
            </div>
            <Zap className="h-4 w-4 text-green-500" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 items-center pb-0">
          <ChartContainer
            config={successConfig}
            className="mx-auto aspect-square w-full max-w-[250px]"
          >
            <RadialBarChart
              data={data.success}
              endAngle={180}
              innerRadius={80}
              outerRadius={130}
            >
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) - 16}
                            className="fill-foreground text-2xl font-bold"
                          >
                            {data.success[0].success.toFixed(1)}%
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 4}
                            className="fill-muted-foreground"
                          >
                            Success Rate
                          </tspan>
                        </text>
                      )
                    }
                  }}
                />
              </PolarRadiusAxis>
              <RadialBar isAnimationActive={!prefersReducedMotion()}
                dataKey="success"
                stackId="a"
                cornerRadius={5}
                fill="var(--chart-success)"
                className="stroke-transparent stroke-2"
              />
              <RadialBar isAnimationActive={!prefersReducedMotion()}
                dataKey="pending"
                fill="var(--chart-warning)"
                stackId="a"
                cornerRadius={5}
                className="stroke-transparent stroke-2"
              />
              <RadialBar isAnimationActive={!prefersReducedMotion()}
                dataKey="failed"
                fill="var(--chart-danger)"
                stackId="a"
                cornerRadius={5}
                className="stroke-transparent stroke-2"
              />
          </RadialBarChart>
          </ChartContainer>
        </CardContent>
        <CardFooter className="flex-col gap-2 text-sm">
          <div className="leading-none text-muted-foreground">
            {data.success[0].success.toFixed(1)}% overall success rate
          </div>
          {data.statusCounts && (
            <div className="text-xs text-muted-foreground">
              Completed: {data.statusCounts.completed} 
              {" • "}
              Pending: {data.statusCounts.pending} 
              {" • "}
              Failed: {data.statusCounts.failed}
            </div>
          )}
        </CardFooter>
      </TranslationSuccessCard>

      {/* Response Time Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Response Times</CardTitle>
              <CardDescription>Average by language</CardDescription>
            </div>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {/* Fixed-height scroll region (shadcn ScrollArea; definite height so
              the chart, which grows ~40px per language, scrolls — see AGENTS.md). */}
          <ScrollArea className="h-[250px]">
            <ChartContainer
              config={responseConfig}
              // Calculate dynamic height based on the number of languages
              // Each language bar needs ~40px of height minimum
              style={{ 
                height: `${Math.max(250, data.responseTimes.length * 40)}px`,
                width: '100%'
              }}
            >
              <BarChart
                accessibilityLayer
                data={data.responseTimes}
                layout="vertical"
                margin={{
                  left: 5,
                  right: 20,
                  bottom: 24,
                  top: 5
                }}
              >
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="language"
                  type="category"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  // Don't hide the axis anymore
                  hide={false}
                  // Set a width for the labels
                  width={100}
                />
                <XAxis 
                  dataKey="time" 
                  type="number" 
                  domain={xAxisDomain}
                  tickCount={Math.min(7, xAxisDomain[1] + 1)} // Adaptive tick count based on domain range
                  unit="s"
                  height={24}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="line" />}
                />
                <Bar isAnimationActive={!prefersReducedMotion()}
                  dataKey="time"
                  layout="vertical"
                  fill="var(--color-time-fill)"
                  radius={4}
                  barSize={24} // Fixed bar height for consistency
                >
                  <LabelList
                    dataKey={(entry) => `${entry.time.toFixed(1)}s`}
                    position="right"
                    offset={8}
                    className="fill-foreground"
                    fontSize={12}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </ScrollArea>
        </CardContent>
        <CardFooter className="flex-col items-start gap-2 text-sm">
          <div className="leading-none text-muted-foreground">
            Average response time: {data.responseTimes.length > 0 ? 
              (data.responseTimes.reduce((acc, r) => acc + (r.time || 0), 0) / data.responseTimes.length).toFixed(2) : 
              '0.00'}s
          </div>
          {/* Add information about scrolling if there are many languages */}
          {data.responseTimes.length > 5 && (
            <div className="text-xs text-muted-foreground/70">
              Scroll to view all {data.responseTimes.length} languages
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
