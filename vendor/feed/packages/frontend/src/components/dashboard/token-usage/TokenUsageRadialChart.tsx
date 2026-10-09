// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { prefersReducedMotion } from '@/lib/reduced-motion'
import React from 'react';
import {
  Label,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface TokenUsageRadialChartProps {
  title: string;
  description?: string;
  currentValue: number;
  maxValue: number;
  label: string;
  warningLevel?: 'normal' | 'warning' | 'elevated' | 'critical';
  footer?: React.ReactNode;
}

export function TokenUsageRadialChart({
  title,
  description,
  currentValue,
  maxValue,
  label,
  warningLevel = 'normal',
  footer
}: TokenUsageRadialChartProps) {
  // Ensure values are numbers
  const safeCurrentValue = typeof currentValue === 'number' ? currentValue : 0;
  const safeMaxValue = typeof maxValue === 'number' ? maxValue : 0;

  /**
   * Zero means the configuration has no limit set — not that its ceiling is
   * zero. The guard above caught only non-numbers, so a zero reached the
   * division and `0 / 0` gave NaN, which became
   * `endAngle={180 + (360 * (NaN / 100))}` and broke the arc outright. That
   * is why callers invented a limit rather than pass the truth; now they can.
   */
  const hasLimit = safeMaxValue > 0;

  // Calculate percentage (capped at 100%)
  const percentage = hasLimit
    ? Math.min(100, (safeCurrentValue / safeMaxValue) * 100)
    : 0;
  
  // Format with commas
  const formattedCurrent = safeCurrentValue.toLocaleString();
  const formattedMax = safeMaxValue.toLocaleString();
  
  // Color based on warning level
  const getColor = () => {
    switch(warningLevel) {
      case 'critical': return 'var(--chart-danger)';
      case 'elevated': return 'var(--chart-warning)';
      case 'warning': return 'var(--chart-warning)';
      default: return 'var(--chart-success)';
    }
  };
  
  const chartData = [
    { name: label, value: percentage, fill: getColor() }
  ];
  
  const chartConfig = {
    [label]: {
      label: label,
      theme: {
        light: getColor(),
        dark: getColor()
      }
    }
  } as ChartConfig;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="items-center pb-0">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[200px]"
        >
          <RadialBarChart
            data={chartData}
            startAngle={180}
            endAngle={180 + (360 * (percentage / 100))}
            innerRadius={80}
            outerRadius={110}
            barSize={12}
          >
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              className="first:fill-muted last:fill-background"
              polarRadius={[86, 74]}
            />
            <RadialBar isAnimationActive={!prefersReducedMotion()} 
              dataKey="value" 
              background={{ fill: 'var(--chart-background)' }}
              cornerRadius={10} 
            />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
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
                          y={(viewBox.cy || 0) - 10}
                          className="fill-foreground text-xl font-bold"
                        >
                          {formattedCurrent}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 10}
                          className="fill-muted-foreground text-xs"
                          style={{ letterSpacing: '0.5px' }}
                        >
                          {hasLimit
                            ? <>of<tspan>&nbsp;</tspan>{formattedMax}<tspan>&nbsp;</tspan>{label}</>
                            : <>{label}<tspan>&nbsp;</tspan>&mdash;<tspan>&nbsp;</tspan>no limit set</>}
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      {footer && (
        <CardFooter className="flex-col gap-2 text-sm mt-2">
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}