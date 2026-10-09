// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client";
import { BarChart, Coins, Bot, FileText, Server, Activity, History, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useProjections } from "@/hooks/cost/useProjections";
import { useTokenMetrics } from "@/hooks/dashboard/useTokenMetrics";
import { useMultiServiceUsage, getAggregatedMetrics } from "@/hooks/dashboard/useMultiServiceUsage";
import { ServiceProvider } from "@/types/multi-service-usage";
import { formatServiceCost, formatLargeNumber, getServiceColor } from "@/utils/service-utils";
import { formatCostWithCents } from "@/utils/cost-utils";
import { useState, useMemo, useEffect } from "react";

// Format response time in milliseconds
function formatResponseTime(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} sec`;
  }
  return `${value.toFixed(0)} ms`;
}

// Formats numbers with K/M suffixes, ensuring whole numbers for tokens
function formatNumber(num: number, isToken: boolean = false): string {
  // For token counts, always round to whole numbers
  if (isToken) {
    num = Math.round(num);
  }

  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(isToken ? 0 : 1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(isToken ? 0 : 1)}K`;
  }
  return isToken ? Math.round(num).toString() : num.toString();
}



export function UsageSummary() {
  const { stats, isLoading: projLoading, error: projError } = useProjections();
  const { data: tokenMetrics, isLoading: tokenLoading, error: tokenError } = useTokenMetrics();
  const { data: multiServiceData, isLoading: multiLoading } = useMultiServiceUsage();
  const [selectedService, setSelectedService] = useState<ServiceProvider | 'all'>('all');
  const [selectedConfigurationId, setSelectedConfigurationId] = useState<string>('');
  
  const isLoading = projLoading || tokenLoading || multiLoading;
  const error = projError || tokenError;

  const aggregatedMetrics = getAggregatedMetrics(multiServiceData);
  const serviceConfigurations = useMemo(() => {
    if (!multiServiceData || selectedService === 'all') {
      return [];
    }
    return multiServiceData.configurations.filter(
      (config) => config.serviceType === selectedService
    );
  }, [multiServiceData, selectedService]);

  const selectedConfiguration = useMemo(() => {
    if (selectedService === 'all' || serviceConfigurations.length === 0) {
      return null;
    }
    return (
      serviceConfigurations.find(
        (config) => String(config.configurationId) === selectedConfigurationId
      ) || serviceConfigurations[0]
    );
  }, [selectedService, serviceConfigurations, selectedConfigurationId]);

  useEffect(() => {
    if (selectedService === 'all' || serviceConfigurations.length === 0) {
      if (selectedConfigurationId !== '') {
        setSelectedConfigurationId('');
      }
      return;
    }

    const firstId = String(serviceConfigurations[0].configurationId);
    const hasMatch = serviceConfigurations.some(
      (config) => String(config.configurationId) === selectedConfigurationId
    );

    if (!selectedConfigurationId || !hasMatch) {
      setSelectedConfigurationId(firstId);
    }
  }, [selectedService, serviceConfigurations, selectedConfigurationId]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Usage Summary</CardTitle>
              <CardDescription>Translation service metrics</CardDescription>
            </div>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Loading usage data...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Usage Summary</CardTitle>
              <CardDescription>Translation service metrics</CardDescription>
            </div>
            <FileText className="h-4 w-4 text-destructive" />
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load usage data. Please try again later.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Show startup message when no AI configurations exist
  if (!multiServiceData || multiServiceData.configurations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Multi-Service AI Usage</CardTitle>
              <CardDescription>Translation service metrics</CardDescription>
            </div>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No Services Configured</AlertTitle>
            <AlertDescription>
              Configure AI services in the AI Configuration section to see usage metrics.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Services configured but no usage data yet
  if (multiServiceData.configurations.length > 0 && !stats) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Multi-Service AI Usage</CardTitle>
              <CardDescription>Translation service metrics</CardDescription>
            </div>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No Usage Data Yet</AlertTitle>
            <AlertDescription>
              Run translation operations to generate usage metrics. Data will appear after translation activity begins.
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
              <Server className="h-5 w-5" />
              Usage Summary
            </CardTitle>
            <CardDescription>
              {selectedService === 'all' ? 'Multi-service metrics' : `${selectedService} metrics`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {aggregatedMetrics.configurationsActive} configurations active
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Service Selection */}
          <div className="flex flex-wrap items-center gap-2">
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
                {[...new Set(multiServiceData?.configurations.map(config => config.serviceType) || [])].map((serviceType, index) => (
                  <SelectItem key={`${serviceType}-${index}`} value={serviceType}>
                    {serviceType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedService !== 'all' && (
              <>
                <label className="text-sm font-medium">Configuration:</label>
                <Select
                  value={selectedConfigurationId}
                  onValueChange={setSelectedConfigurationId}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Select configuration" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceConfigurations.map((config) => (
                      <SelectItem
                        key={config.configurationId}
                        value={String(config.configurationId)}
                      >
                        {config.configurationName}
                        {config.deletedAt ? ' (Deleted)' : !config.isActive ? ' (Inactive)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          {/* Service-Specific or Aggregated Metrics */}
          {selectedService === 'all' ? (
            <AggregatedMetricsView 
              configurations={multiServiceData?.configurations || []}
              aggregatedMetrics={aggregatedMetrics}
              stats={stats}
            />
          ) : (
            <IndividualServiceView 
              configuration={selectedConfiguration}
              stats={stats}
              multiServiceData={multiServiceData}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AggregatedMetricsView({ configurations, aggregatedMetrics, stats }: any) {
  return (
    <div className="grid gap-6">
      {/* Overall Usage Summary */}
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <BarChart className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Overall Usage</h3>
        </div>
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">All-time Cost</span>
            <span className="font-medium">{formatCostWithCents(aggregatedMetrics.totalCost)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Tokens</span>
            <span className="font-medium">{formatLargeNumber(aggregatedMetrics.totalTokens)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Requests</span>
            <span className="font-medium">{formatLargeNumber(aggregatedMetrics.totalRequests)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Average Success Rate</span>
            <span className="font-medium">{(aggregatedMetrics.averageSuccessRate * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Configuration Breakdown */}
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Configuration Breakdown</h3>
        </div>
        <div className="space-y-2">
          {configurations.map((config: any) => (
            <div key={config.configurationId} className="flex items-center justify-between p-2 border rounded">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: getServiceColor(config.serviceType) }}
                />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {config.configurationName}
                    {config.deletedAt ? (
                      <span className="text-muted-foreground"> (Deleted)</span>
                    ) : !config.isActive ? (
                      <span className="text-muted-foreground"> (Inactive)</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{config.serviceType} • {config.model}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-right">
                <div>
                  <div className="text-sm font-medium">{formatCostWithCents(config.totalCost)}</div>
                  <div className="text-xs text-muted-foreground">Cost</div>
                </div>
                <div>
                  <div className="text-sm font-medium">
                    {formatLargeNumber(config.promptTokens + config.completionTokens)}
                  </div>
                  <div className="text-xs text-muted-foreground">Tokens</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Efficiency Metrics */}
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Efficiency Metrics</h3>
        </div>
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cost per 1K Tokens</span>
            <span className="font-medium">
              {formatCostWithCents((aggregatedMetrics.totalCost / aggregatedMetrics.totalTokens) * 1000)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Average Tokens per Request (All-Time)</span>
            <span className="font-medium">
              {Math.round(aggregatedMetrics.totalTokens / aggregatedMetrics.totalRequests)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Most Efficient Service</span>
            <span className="font-medium">Google</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function IndividualServiceView({ configuration, stats, multiServiceData }: any) {
  // Calculated before the early return below: a hook after a conditional
  // return changes the hook order between renders, which React treats as a
  // corrupted component ("rendered fewer hooks than expected"). Selecting a
  // service with no configuration and then one with a configuration is exactly
  // the sequence that triggers it.
  const maxCost = useMemo(() => {
    return Math.max(configuration?.totalCost ?? 0, 0.0001);
  }, [configuration]);

  if (!configuration) {
    return <div className="text-center text-muted-foreground">No data available for selected service.</div>;
  }

  const useCents = maxCost < 0.10;
  
  // Formatter function for costs in this view
  const formatCost = (value: number): string => {
    return formatCostWithCents(value, { useCents });
  };
  
  // Get service-specific performance data from backend, fall back to overall performance
  const serviceSpecificPerformance = multiServiceData?.performanceByService?.[configuration.serviceType];
  const averageResponseTime = serviceSpecificPerformance?.averageResponseTime || 
                             multiServiceData?.performance?.averageResponseTime || 
                             0;

  return (
    <div className="grid gap-6">
      {/* Configuration Header */}
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div className="flex items-center gap-3">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: getServiceColor(configuration.serviceType) }}
          />
          <div>
            <div className="font-medium">
              {configuration.configurationName}
              {configuration.deletedAt ? (
                <span className="text-muted-foreground"> (Deleted)</span>
              ) : !configuration.isActive ? (
                <span className="text-muted-foreground"> (Inactive)</span>
              ) : null}
            </div>
            <div className="text-sm text-muted-foreground">{configuration.serviceType} • {configuration.model}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-medium">{formatCost(configuration.totalCost)}</div>
          <div className="text-sm text-muted-foreground">All-time Cost</div>
        </div>
      </div>

      {/* Token Usage */}
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <BarChart className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Token Usage</h3>
        </div>
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Input Tokens</span>
            <span className="font-medium">{formatLargeNumber(configuration.promptTokens)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Output Tokens</span>
            <span className="font-medium">{formatLargeNumber(configuration.completionTokens)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Tokens</span>
            <span className="font-medium">
              {formatLargeNumber(configuration.promptTokens + configuration.completionTokens)}
            </span>
          </div>
        </div>
      </div>

      {/* Rate Limit Usage */}
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Rate Limits</h3>
        </div>
        <div className="grid gap-1">
          {/*
            A limit of zero means none is configured. These divisions had no
            guard, so once the invented per-provider defaults were removed
            they would have rendered NaN% — and 0/0 at that, since a
            configuration with no limit also has no usage attributed to it.
          */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">TPM Usage</span>
            <span className="font-medium">
              {configuration.rateLimit.limit > 0
                ? `${((configuration.rateLimit.current / configuration.rateLimit.limit) * 100).toFixed(1)}%`
                : 'No data'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">RPM Usage</span>
            <span className="font-medium">
              {configuration.requestsPerMinute.limit > 0
                ? `${((configuration.requestsPerMinute.current / configuration.requestsPerMinute.limit) * 100).toFixed(1)}%`
                : 'No data'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">RPD Usage</span>
            <span className="font-medium">
              {configuration.requestsPerDay.limit > 0
                ? `${((configuration.requestsPerDay.current / configuration.requestsPerDay.limit) * 100).toFixed(1)}%`
                : 'No data'}
            </span>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Performance</h3>
        </div>
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Success Rate</span>
            <span className="font-medium">
              {configuration.successRate !== null && configuration.successRate !== undefined
                ? `${(configuration.successRate * 100).toFixed(1)}%`
                : 'No data'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Avg Response Time</span>
            <span className="font-medium">
              {averageResponseTime > 0 ? formatResponseTime(averageResponseTime) : 'No data'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Operations Today</span>
            <span className="font-medium">
              {formatLargeNumber(configuration.requestsPerDay.current)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
