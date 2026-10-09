// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";

import { prefersReducedMotion } from '@/lib/reduced-motion'
import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { AlertTriangle, LineChart, TrendingUp, BarChart3 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useProjections } from '@/hooks/cost/useProjections';
import { useMultiServiceUsage } from '@/hooks/dashboard/useMultiServiceUsage';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCostWithCents } from '@/utils/cost-utils';
import { ServiceProvider, ServiceUsageMetrics, ConfigurationUsageMetrics, ConfigurationComparisonData, SERVICE_COLORS } from '@/types/multi-service-usage';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}



function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    signDisplay: 'exceptZero',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value);
}

function formatNumber(value: number, isToken: boolean = false): string {
  if (isToken) {
    value = Math.round(value);
  }
  
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(isToken ? 0 : 1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(isToken ? 0 : 1)}K`;
  }
  return isToken ? Math.round(value).toString() : value.toString();
}

function getServiceColorClass(serviceType: ServiceProvider): string {
  const serviceColorMap = {
    'OpenAI': 'bg-[var(--service-openai)]',
    'Anthropic': 'bg-[var(--service-anthropic)]',
    'Google': 'bg-[var(--service-google)]',
    'Azure': 'bg-[var(--service-azure)]'
  };
  return serviceColorMap[serviceType] || 'bg-primary';
}

/**
 * Transform real configuration usage data to comparison chart format
 * Uses real performance data from backend instead of mock calculations
 */
function transformConfigurationDataForComparison(
  configurations: ConfigurationUsageMetrics[], 
  performanceByService?: Record<string, { averageResponseTime: number }>
): ConfigurationComparisonData[] {
  return configurations.map(config => {
    const totalTokens = config.promptTokens + config.completionTokens;

    // Measured response times only.
    //
    // This fell back to `getServiceBaseResponseTime` — 850ms for OpenAI,
    // 1200 for Anthropic, 650 for Google, 920 for Azure — scaled by a
    // "complexity factor" derived from token count, and the product was
    // displayed as "Avg Response" beside genuinely measured figures. Its own
    // docstring had said DEPRECATED since real data arrived. An invented
    // number presented as a measurement is worse than no number, and the
    // renderer already shows "No data" when this is null.
    const averageResponseTime: number | null =
      performanceByService?.[config.serviceType]?.averageResponseTime ?? null;

    return {
      configurationId: config.configurationId,
      serviceType: config.serviceType,
      configurationName: config.configurationName,
      model: config.model,
      isActive: config.isActive,
      totalCost: config.totalCost,
      tokensUsed: totalTokens,
      averageCostPerToken: totalTokens > 0 ? config.totalCost / totalTokens : 0,
      averageResponseTime,
      successRate: config.successRate,
      operationsCount: config.requestsPerDay.current,
      color: SERVICE_COLORS[config.serviceType] || 'var(--primary)'
    };
  });
}

function ConfigurationComparisonChart({
  data,
  showChart = true,
  useCents = false
}: {
  data: ConfigurationComparisonData[];
  showChart?: boolean;
  useCents?: boolean;
}) {
  const formatChartCost = (value: number, isChartValue: boolean = false): string => {
    const displayValue = isChartValue && useCents ? value / 100 : value;
    return formatCostWithCents(displayValue, { useCents });
  };

  const chartData = data.map(config => ({
    name: config.configurationName,
    service: config.serviceType,
    cost: useCents ? config.totalCost * 100 : config.totalCost,
    tokens: config.tokensUsed / 1000, // Convert to thousands
    operations: config.operationsCount,
    fill: config.color
  }));

  return (
    <div className="space-y-4">
      {showChart && (
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => formatChartCost(value, true)} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'cost') return [formatChartCost(value, true), 'Daily Cost'];
                  if (name === 'tokens') return [`${value.toFixed(1)}K`, 'Tokens (K)'];
                  return [value, name];
                }}
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  borderColor: 'var(--border)',
                  color: 'var(--popover-foreground)'
                }}
                labelStyle={{
                  color: 'var(--popover-foreground)'
                }}
                itemStyle={{
                  color: 'var(--popover-foreground)'
                }}
              />
              <Bar isAnimationActive={!prefersReducedMotion()} dataKey="cost" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      
      <div className="grid gap-3">
        {data.map(config => {
          const hasUsageData = config.operationsCount > 0 || config.tokensUsed > 0 || config.totalCost > 0;

          return (
            <div key={config.configurationId} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${getServiceColorClass(config.serviceType)}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-medium">
                      {config.configurationName}
                      {!config.isActive && (
                        <span className="text-muted-foreground"> (Inactive)</span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{config.serviceType} • {config.model}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-right">
                <div>
                  <div className="font-medium">
                    {hasUsageData ? formatCostWithCents(config.totalCost) : "No data"}
                  </div>
                  <div className="text-xs text-muted-foreground">Daily Cost</div>
                </div>
                <div>
                  <div className="font-medium">
                    {hasUsageData && config.averageResponseTime !== null && config.averageResponseTime > 0
                      ? `${(config.averageResponseTime / 1000).toFixed(1)}s`
                      : "No data"
                    }
                  </div>
                  <div className="text-xs text-muted-foreground">Avg Response</div>
                </div>
                <div>
                  <div className="font-medium">
                    {hasUsageData && config.successRate !== null
                      ? `${(config.successRate * 100).toFixed(1)}%`
                      : "No data"
                    }
                  </div>
                  <div className="text-xs text-muted-foreground">Success Rate</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CostForecast() {
  const { projections, stats, suggestions, isCostFree, hasUsageData, isLoading, error } = useProjections(30);
  const { data: multiServiceData, isLoading: multiServiceLoading, error: multiServiceError } = useMultiServiceUsage();
  const [viewMode, setViewMode] = useState<'forecast' | 'comparison'>('forecast');
  const [selectedService, setSelectedService] = useState<ServiceProvider | 'all'>('all');
  
  // Transform real configuration data for comparison view
  const configurationComparison = useMemo(() => {
    if (!multiServiceData?.configurations) return [];
    return transformConfigurationDataForComparison(
      multiServiceData.configurations,
      multiServiceData.performanceByService
    );
  }, [multiServiceData]);
  const hasConfigurations = Boolean(multiServiceData && multiServiceData.configurations.length > 0);
  const hasAnyComparisonUsage = useMemo(() => (
    configurationComparison.some(config =>
      config.operationsCount > 0 || config.tokensUsed > 0 || config.totalCost > 0
    )
  ), [configurationComparison]);
  const comparisonUseCents = useMemo(() => {
    const maxCost = Math.max(...configurationComparison.map(config => config.totalCost), 0.0001);
    return maxCost < 0.10;
  }, [configurationComparison]);

  const maxProjectionCost = useMemo(() => {
    return Math.max(...projections.map(p => p.upperBound), 0.0001);
  }, [projections]);
  const projectionUseCents = maxProjectionCost < 0.10;
  const maxStatsCost = useMemo(() => {
    if (!stats) return 0;

    const activeDays = Math.max(stats.activeDays || 0, 1);
    const dailyAverageCost = stats.totalSpent / activeDays;
    const peakUsageCost = stats.dailyAverage > 0
      ? (stats.peakUsage / stats.dailyAverage) * dailyAverageCost
      : 0;

    return Math.max(dailyAverageCost, peakUsageCost, stats.totalSpent);
  }, [stats]);
  const statsUseCents = maxStatsCost < 0.10;
  const formatStatsCostValue = (value: number): string => {
    return formatCostWithCents(value, { useCents: statsUseCents });
  };
  const formatChartCostValue = (value: number): string => {
    const displayValue = projectionUseCents ? value / 100 : value;
    return formatCostWithCents(displayValue, { useCents: projectionUseCents });
  };

  const chartData = useMemo(() => {
    const baseData = projections.map(p => ({
      date: formatDate(p.date),
      upper: p.upperBound,
      projected: p.projectedCost,
      lower: p.lowerBound,
    }));
    
    if (!projectionUseCents) return baseData;

    return baseData.map(item => ({
      ...item,
      upper: item.upper * 100,
      projected: item.projected * 100,
      lower: item.lower * 100
    }));
  }, [projections, projectionUseCents]);

  // Handle loading states based on view mode
  const isComponentLoading = viewMode === 'forecast' ? isLoading : multiServiceLoading;
  const componentError = viewMode === 'forecast' ? error : multiServiceError;

  if (isComponentLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Cost {viewMode === 'forecast' ? 'Forecast' : 'Comparison'}
              </CardTitle>
              <CardDescription>
                {viewMode === 'forecast' ? 'Projected translation costs' : 'Multi-service cost analysis'}
              </CardDescription>
            </div>
            <LineChart className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            Loading {viewMode === 'forecast' ? 'forecast' : 'comparison'} data...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (componentError) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Cost {viewMode === 'forecast' ? 'Forecast' : 'Comparison'}
              </CardTitle>
              <CardDescription>
                {viewMode === 'forecast' ? 'Projected translation costs' : 'Multi-service cost analysis'}
              </CardDescription>
            </div>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load {viewMode === 'forecast' ? 'forecast' : 'service comparison'} data. Please try again later.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (viewMode === 'forecast' && multiServiceData && !hasConfigurations) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Cost Forecast
              </CardTitle>
              <CardDescription>Projected translation costs</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'forecast' | 'comparison')}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forecast">Forecast</SelectItem>
                  <SelectItem value="comparison">Compare</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No Services Configured</AlertTitle>
            <AlertDescription>
              Configure AI services in the AI Configuration section to see cost forecast.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Show message when no configurations are configured for comparison view
  if (viewMode === 'comparison' && configurationComparison.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Cost Comparison
              </CardTitle>
              <CardDescription>Multi-service cost analysis</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'forecast' | 'comparison')}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forecast">Forecast</SelectItem>
                  <SelectItem value="comparison">Compare</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No Services Configured</AlertTitle>
            <AlertDescription>
              Configure AI services in the AI Configuration section to see cost comparisons.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (viewMode === 'comparison' && configurationComparison.length > 0 && !hasAnyComparisonUsage) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Cost Comparison
              </CardTitle>
              <CardDescription>Multi-service cost analysis</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'forecast' | 'comparison')}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forecast">Forecast</SelectItem>
                  <SelectItem value="comparison">Compare</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Usage Data Yet</AlertTitle>
              <AlertDescription>
                Configure and run translations to generate usage data. Cost comparison will appear after activity begins.
              </AlertDescription>
            </Alert>
            <ConfigurationComparisonChart
              data={configurationComparison}
              showChart={false}
              useCents={comparisonUseCents}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (viewMode === 'forecast' && !isCostFree && !hasUsageData) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Cost Forecast
              </CardTitle>
              <CardDescription>Projected translation costs</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'forecast' | 'comparison')}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forecast">Forecast</SelectItem>
                  <SelectItem value="comparison">Compare</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No Usage Data Yet</AlertTitle>
            <AlertDescription>
              Configure and run translations to generate usage data. Cost projections will appear after activity begins.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (viewMode === 'forecast' && isCostFree) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Cost Forecast
              </CardTitle>
              <CardDescription>Projected translation costs</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'forecast' | 'comparison')}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forecast">Forecast</SelectItem>
                  <SelectItem value="comparison">Compare</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No Forecast Available</AlertTitle>
            <AlertDescription>
              This configuration is priced at $0, no cost projections are available.
              Usage stats are still tracked for reporting purposes.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }


  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {viewMode === 'forecast' ? <TrendingUp className="h-5 w-5" /> : <BarChart3 className="h-5 w-5" />}
              Cost {viewMode === 'forecast' ? 'Forecast' : 'Comparison'}
            </CardTitle>
            <CardDescription>
              {viewMode === 'forecast' ? 'Projected translation costs' : 'Multi-service cost analysis'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'forecast' | 'comparison')}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="forecast">Forecast</SelectItem>
                <SelectItem value="comparison">Compare</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Chart Display */}
          {viewMode === 'forecast' ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ left: 20 }}>
                  <defs>
                    <linearGradient id="colorUpper" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    domain={[0, 'auto']}
                    tickFormatter={(value) => (
                      formatChartCostValue(value)
                    )}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const displayName = name === 'upper' ? 'Upper' : 
                                         name === 'projected' ? 'Projected' : 
                                         name === 'lower' ? 'Lower' : name;
                      const formattedValue = formatChartCostValue(value);
                      return [formattedValue, displayName];
                    }}
                    labelFormatter={(label) => label}
                    itemSorter={(item) => {
                      // Ensure vertical order: upper -> projected -> lower
                      const order = { 'upper': 0, 'projected': 1, 'lower': 2 };
                      return order[item.dataKey as keyof typeof order] ?? 999;
                    }}
                    contentStyle={{
                      backgroundColor: 'var(--popover)',
                      borderColor: 'var(--border)',
                      color: 'var(--popover-foreground)'
                    }}
                    labelStyle={{
                      color: 'var(--popover-foreground)'
                    }}
                    itemStyle={{
                      color: 'var(--popover-foreground)'
                    }}
                  />
                  <Area isAnimationActive={!prefersReducedMotion()}
                    type="monotone"
                    dataKey="lower"
                    stackId="1"
                    stroke="none"
                    fill="url(#colorUpper)"
                  />
                  <Area isAnimationActive={!prefersReducedMotion()}
                    type="monotone"
                    dataKey="projected"
                    stackId="2"
                    stroke="var(--primary)"
                    fill="none"
                  />
                  <Area isAnimationActive={!prefersReducedMotion()}
                    type="monotone"
                    dataKey="upper"
                    stackId="3"
                    stroke="none"
                    fill="url(#colorUpper)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ConfigurationComparisonChart
              data={configurationComparison}
              useCents={comparisonUseCents}
            />
          )}

          {/* Stats Summary */}
          {stats && viewMode === 'forecast' && (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 lg:grid-cols-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Daily Average Cost</p>
                <p className="text-2xl font-bold">
                  {formatStatsCostValue(stats.totalSpent / Math.max(stats.activeDays || 0, 1))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(stats.dailyAverage, true)} tokens/day
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">Peak Usage Cost</p>
                <p className="text-2xl font-bold">
                  {formatStatsCostValue(
                    stats.dailyAverage > 0
                      ? (stats.peakUsage / stats.dailyAverage) * (stats.totalSpent / Math.max(stats.activeDays || 0, 1))
                      : 0
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(stats.peakUsage, true)} tokens/day
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Total Spent</p>
                <p className="text-2xl font-bold">
                  {formatStatsCostValue(stats.totalSpent)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last 30 days
                </p>
              </div>
            </div>
          )}

          {/* Optimization Suggestions - Only show for forecast mode */}
          {viewMode === 'forecast' && suggestions && suggestions.length > 0 && (
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {suggestions.map((suggestion, index) => (
                  <Alert key={index}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Optimization Suggestion</AlertTitle>
                    <AlertDescription>{suggestion}</AlertDescription>
                  </Alert>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
