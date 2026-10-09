// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import { prefersReducedMotion } from '@/lib/reduced-motion'
import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react";
import { 
  useMultiServiceTranslationPerformance, 
  getFilteredPerformanceData, 
  getServiceTotals
} from "@/hooks/translation/useMultiServiceTranslationPerformance"
import { ServiceProvider } from "@/types/multi-service-usage"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCostWithCents } from '@/utils/cost-utils'

const formatResponseTime = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} sec`;
  }
  return `${value.toFixed(0)} ms`;
};

// Granular tiered scaling strategy for response time metrics (adapted from translation-metrics.tsx)
const calculateResponseTimeDomain = (maxResponseTimeMs: number): [number, number] => {
  // Convert to seconds for scaling calculation
  const maxResponseTimeSec = maxResponseTimeMs / 1000;
  
  if (maxResponseTimeSec < 0.05) {
    // Ultra-fast responses: scale 0–0.1s
    return [0, 0.1 * 1000]; // Convert back to milliseconds
  } else if (maxResponseTimeSec < 0.1) {
    // Super-fast responses: scale 0–0.25s
    return [0, 0.25 * 1000];
  } else if (maxResponseTimeSec < 0.25) {
    // Very fast responses: scale 0–0.5s
    return [0, 0.5 * 1000];
  } else if (maxResponseTimeSec < 0.5) {
    // Fast responses: scale 0–1s
    return [0, 1 * 1000];
  } else if (maxResponseTimeSec <= 5) {
    // Multi-second: add 50% buffer
    return [0, Math.ceil(maxResponseTimeSec * 1.5) * 1000];
  } else {
    // Long responses: add 1 second buffer
    return [0, (Math.ceil(maxResponseTimeSec) + 1) * 1000];
  }
};

// Granular tiered scaling strategy for cost metrics
const calculateCostDomain = (maxCost: number): [number, number] => {
  if (maxCost < 0.0001) {
    // Ultra-small costs: scale 0–0.0002
    return [0, 0.0002];
  } else if (maxCost < 0.001) {
    // Very small costs: scale 0–0.002
    return [0, 0.002];
  } else if (maxCost < 0.01) {
    // Small costs: scale 0–0.02
    return [0, 0.02];
  } else if (maxCost < 0.1) {
    // Medium costs: add 50% buffer
    return [0, Math.ceil(maxCost * 1.5 * 100) / 100];
  } else {
    // Large costs: add 20% buffer
    return [0, Math.ceil(maxCost * 1.2 * 10) / 10];
  }
};

// Calculate adaptive tick count based on domain range
const getAdaptiveTickCount = (domain: [number, number], metric: 'cost' | 'responseTime'): number => {
  const range = domain[1] - domain[0];
  
  if (metric === 'responseTime') {
    // For response times in milliseconds
    if (range <= 100) return 5; // Very small ranges
    if (range <= 500) return 6;
    if (range <= 1000) return 7;
    return 8;
  } else {
    // For costs
    if (range <= 0.001) return 5;
    if (range <= 0.01) return 6;
    if (range <= 0.1) return 7;
    return 8;
  }
};

// Custom formatter for Y axis with enhanced cost formatting
const formatYAxis = (value: number, metric: 'cost' | 'responseTime') => {
  if (metric === 'cost') {
    return formatCostWithCents(value);
  }
  return formatResponseTime(value);
};

// Custom tooltip component with proper formatting and service context
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) {
    return null;
  }

  // Backend provides timezone-aware dates - use directly without conversion
  const dateString = label.split('T')[0]; // Extract YYYY-MM-DD
  const date = new Date(dateString + 'T12:00:00.000Z'); // Noon UTC to avoid timezone shifts
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const entry = payload[0]; // Since we're only showing one metric at a time
  const value = entry.dataKey === 'cost' 
    ? formatCostWithCents(entry.value)
    : formatResponseTime(entry.value);
  const label_text = entry.dataKey === 'cost' ? 'Cost: ' : 'Response Time: ';

  return (
    <div className="grid min-w-32 items-start gap-1.5 rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium text-popover-foreground">{formattedDate}</div>
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: entry.color }}
          />
          <div className="flex flex-1 justify-between items-center">
            <span className="text-muted-foreground">
              {label_text}
            </span>
            <span className="font-mono font-medium tabular-nums text-popover-foreground">
              {value}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Ranges are calendar-based, not rolling: "This Month" means since the 1st, not
 * the last 30 days. Naming the selected period in the empty state is what makes
 * an empty card self-explanatory instead of alarming.
 */
const TIME_RANGE_LABELS: Record<string, string> = {
  today: 'today',
  'this-week': 'this week',
  'this-month': 'this month',
  'this-year': 'this year',
};

// Service-specific color configuration
const getServiceColor = (serviceType: ServiceProvider | 'all') => {
  const serviceColors = {
    'OpenAI': 'var(--service-openai)',
    'Anthropic': 'var(--service-anthropic)',
    'Google': 'var(--service-google)',
    'Azure': 'var(--service-azure)',
    'all': 'var(--primary)'
  };
  return serviceColors[serviceType] || 'var(--primary)';
};

const chartConfig = {
  metrics: {
    label: "Metrics",
  },
  responseTime: {
    label: "Response Time",
  },
  cost: {
    label: "Cost",
  },
} satisfies ChartConfig

export function TranslationPerformance() {
  const [timeRange, setTimeRange] = React.useState("this-month")
  const [selectedService, setSelectedService] = React.useState<ServiceProvider | 'all'>('all')
  const { data, isLoading, error } = useMultiServiceTranslationPerformance(timeRange)
  const [activeMetric, setActiveMetric] = React.useState<'cost' | 'responseTime'>('responseTime')

  // Get filtered data and totals based on selected service
  const filteredData = React.useMemo(() => {
    return getFilteredPerformanceData(data, selectedService);
  }, [data, selectedService]);

  const serviceTotals = React.useMemo(() => {
    return getServiceTotals(data, selectedService);
  }, [data, selectedService]);

  // Calculate max values and domains for chart scaling
  const metricStats = React.useMemo(() => {
    if (!filteredData?.length) {
      return { 
        maxResponseTime: 0, 
        maxCost: 0,
        responseTimeDomain: [0, 1000] as [number, number],
        costDomain: [0, 0.01] as [number, number],
        responseTimeTickCount: 5,
        costTickCount: 5
      };
    }
    
    const maxResponseTime = Math.max(...filteredData.map(item => item.responseTime || 0));
    const maxCost = Math.max(...filteredData.map(item => item.cost || 0));
    
    // Calculate optimal domains using granular tiered scaling
    const responseTimeDomain = calculateResponseTimeDomain(maxResponseTime);
    const costDomain = calculateCostDomain(maxCost);
    
    // Calculate adaptive tick counts
    const responseTimeTickCount = getAdaptiveTickCount(responseTimeDomain, 'responseTime');
    const costTickCount = getAdaptiveTickCount(costDomain, 'cost');
    
    return { 
      maxResponseTime, 
      maxCost,
      responseTimeDomain,
      costDomain,
      responseTimeTickCount,
      costTickCount
    };
  }, [filteredData]);

  // Get available services for tabs
  const availableServices = React.useMemo(() => {
    if (!data) return [];
    const fromUsage = [...new Set(data.services.map(service => service.serviceType))];
    if (fromUsage.length > 0) return fromUsage;
    // A quiet period has no services *in the data*, but the configurations are
    // still there — so the filter lists what is configured rather than
    // collapsing to a single dead "All Services" entry.
    return [...new Set(
      data.configurations
        .map(configuration => configuration.serviceType)
        .filter((value): value is ServiceProvider => Boolean(value))
    )];
  }, [data]);

  /**
   * Period and Service, rendered by every state that can act on them.
   *
   * These used to live only in the populated branch, so the empty state said
   * "try a longer range" beside no control to change it — advice the user could
   * not take. Defining them once means a new state cannot inherit that problem
   * by forgetting to copy them in.
   */
  const filters = (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Period:</label>
        <Select value={timeRange} onValueChange={(value) => setTimeRange(value)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this-week">This Week</SelectItem>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="this-year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Service:</label>
        <Select
          value={selectedService}
          onValueChange={(value) => setSelectedService(value as ServiceProvider | 'all')}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Services</SelectItem>
            {availableServices.map((service, index) => (
              <SelectItem key={`${service}-${index}`} value={service}>
                {service}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
          <div className="grid flex-1 gap-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-48" />
            </div>
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-[160px]" />
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[250px] w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
          <div className="grid flex-1 gap-1 text-center sm:text-left">
            <div className="flex items-center gap-2">
              <CardTitle>Translation Performance</CardTitle>
            </div>
            <CardDescription className="text-red-500">
              Error loading performance data
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    )
  }

  // No AI configurations configured
  if (!data || data.configurations.length === 0) {
    return (
      <Card>
        <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
          <div className="grid flex-1 gap-1">
            <div className="flex items-center gap-2">
              <CardTitle>Translation Performance</CardTitle>
            </div>
            <CardDescription>
              Performance metrics across translation services
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No Services Configured</AlertTitle>
            <AlertDescription>
              Configure AI services in the AI Configuration section and run translation services to see translation performance metrics.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  // Configurations exist, but nothing was recorded inside the selected period.
  //
  // The previous copy here said "No Usage Data Yet ... performance data will
  // appear after translation activity begins", which reads as *never any* and
  // sent at least one person looking for data loss. The period is the whole
  // explanation: the ranges are calendar-based (This Month starts on the 1st,
  // not 30 days ago), so on the 4th of a quiet month a busy previous month
  // shows nothing at all.
  if (data.configurations.length > 0 && data.services.length === 0) {
    const periodLabel = TIME_RANGE_LABELS[timeRange] ?? 'this period';

    return (
      <Card>
        <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
          <div className="grid flex-1 gap-1">
            <div className="flex items-center gap-2">
              <CardTitle>Translation Performance</CardTitle>
            </div>
            <CardDescription>
              Performance metrics across translation services
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-2 pt-4 sm:px-6 sm:pt-6">
          {filters}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No activity {periodLabel}</AlertTitle>
            <AlertDescription>
              Nothing was translated in this period. Choose a longer period above to see earlier
              activity.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
          <div className="flex items-center gap-2">
            <CardTitle>Translation Performance</CardTitle>
          </div>
          <CardDescription>
            {selectedService === 'all' 
              ? 'Showing aggregated performance across all services'
              : `Showing ${selectedService} service performance metrics`
            }
          </CardDescription>
        </div>
        <div className="flex">
          {(['responseTime', 'cost'] as const).map((metric) => (
            <button
              key={metric}
              data-active={activeMetric === metric}
              className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-l sm:border-t-0 sm:px-8 sm:py-6"
              onClick={() => setActiveMetric(metric)}
            >
              <span className="text-xs text-muted-foreground">
                {chartConfig[metric].label}
              </span>
              <span className="text-lg font-bold leading-none sm:text-3xl">
                {metric === 'cost' 
                  ? formatCostWithCents(serviceTotals.cost)
                  : formatResponseTime(serviceTotals.responseTime)}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <div className="space-y-4">
          {filters}

          {/* Chart Display */}
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <BarChart
              data={filteredData}
              margin={{
                top: 5,
                right: 20,
                left: activeMetric === 'cost' ? 70 : 50,
                bottom: 5,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  // Backend provides timezone-aware dates - use directly without conversion
                  const dateString = value.split('T')[0]; // Extract YYYY-MM-DD
                  const date = new Date(dateString + 'T12:00:00.000Z'); // Noon UTC to avoid timezone shifts
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => formatYAxis(value, activeMetric)}
                domain={activeMetric === 'responseTime' ? 
                  metricStats.responseTimeDomain : 
                  metricStats.costDomain}
                tickCount={activeMetric === 'responseTime' ? 
                  metricStats.responseTimeTickCount : 
                  metricStats.costTickCount}
                scale="linear"
                width={activeMetric === 'cost' ? 65 : 45}
              />
              <ChartTooltip
                content={<CustomTooltip />}
              />
              <Bar isAnimationActive={!prefersReducedMotion()} 
                dataKey={activeMetric} 
                fill={getServiceColor(selectedService)}
              />
            </BarChart>
          </ChartContainer>

          {/* Service Summary Stats */}
          {selectedService !== 'all' && data && (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Operations</p>
                <p className="font-medium">{serviceTotals.operations.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Total Tokens</p>
                <p className="font-medium">{(serviceTotals.tokens / 1000).toFixed(1)}K</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Avg Response</p>
                <p className="font-medium">{formatResponseTime(serviceTotals.responseTime)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Total Cost</p>
                <p className="font-medium">{formatCostWithCents(serviceTotals.cost)}</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
