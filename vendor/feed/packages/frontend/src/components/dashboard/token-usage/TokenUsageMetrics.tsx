// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, Activity, Server, AlertTriangle } from "lucide-react";
import { TokenUsageRadialChart } from './TokenUsageRadialChart';
import { useMultiServiceUsage, getFilteredUsageData, getAggregatedMetrics } from '@/hooks/dashboard/useMultiServiceUsage';
import { ServiceProvider, ConfigurationUsageMetrics } from '@/types/multi-service-usage';
import { formatLargeNumber, getServiceColor } from '@/utils/service-utils';
import { formatCostWithCents } from '@/utils/cost-utils';

interface TokenUsageMetricsProps {
  // Legacy props for backward compatibility
  dailyUsage?: any;
  monthlyUsage?: any;
  modelUsage?: any;
  rateLimit?: any;
  requestsPerMinute?: number;
  requestsPerDay?: number;
  historicalData?: any;
  isLoading?: boolean;
}

export function TokenUsageMetrics({
  // Legacy props ignored - using new multi-service data
  isLoading: legacyLoading = false
}: TokenUsageMetricsProps) {
  const { data, selectedService, isLoading, error, setSelectedService } = useMultiServiceUsage();
  const [viewMode, setViewMode] = useState<'individual' | 'comparison'>('individual');

  const filteredData = getFilteredUsageData(data, selectedService);
  const aggregatedMetrics = getAggregatedMetrics(data);

  if (isLoading || legacyLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Multi-Service AI Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full bg-muted/20 animate-pulse rounded-md"></div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Multi-Service AI Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Failed to load usage data. Please try again later.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // No AI configurations configured
  if (!data || data.configurations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Multi-Service AI Usage
          </CardTitle>
          <CardDescription>
            Real-time usage across configured AI models
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No Services Configured</AlertTitle>
            <AlertDescription>
              Configure AI services in the AI Configuration section to see real-time usage metrics.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const hasWarnings = filteredData.some(service => 
    service.dailyUsage.warningLevel === 'elevated' || 
    service.dailyUsage.warningLevel === 'critical'
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Multi-Service AI Usage
            </CardTitle>
            <CardDescription>
              Real-time usage across {data?.configurations.length || 0} configured AI models
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {formatCostWithCents(aggregatedMetrics.totalCost)} today
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Service Selection and View Mode */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
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
                    <SelectItem value="all">All Configurations</SelectItem>
                    {[...new Set(data?.configurations.map(config => config.serviceType) || [])].map(serviceType => (
                      <SelectItem key={serviceType} value={serviceType}>
                        {serviceType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">View:</label>
                <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'individual' | 'comparison')}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="comparison">Comparison</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {selectedService === 'all' && (
              <div className="text-sm text-muted-foreground">
                {aggregatedMetrics.configurationsActive} configurations • {formatLargeNumber(aggregatedMetrics.totalTokens)} tokens
              </div>
            )}
          </div>

          {/* Usage Warning Alert */}
          {hasWarnings && (
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertTitle>Usage Warning</AlertTitle>
              <AlertDescription>
                One or more services are approaching rate limits. Consider optimizing usage or switching providers.
              </AlertDescription>
            </Alert>
          )}

          {/* Configuration Metrics Display */}
          {viewMode === 'individual' ? (
            <IndividualConfigurationView configurations={filteredData} selectedService={selectedService} />
          ) : (
            <ComparisonConfigurationView configurations={data?.configurations || []} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function IndividualConfigurationView({ 
  configurations, 
  selectedService 
}: { 
  configurations: ConfigurationUsageMetrics[], 
  selectedService: ServiceProvider | 'all' 
}) {
  if (selectedService === 'all') {
    return (
      <div className="space-y-6">
        {configurations.map(config => (
          <ConfigurationMetricsCard key={config.configurationId} configuration={config} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {configurations.map(config => (
        <ConfigurationMetricsCard key={config.configurationId} configuration={config} expanded />
      ))}
    </div>
  );
}

function ConfigurationMetricsCard({ configuration, expanded = false }: { configuration: ConfigurationUsageMetrics, expanded?: boolean }) {
  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: getServiceColor(configuration.serviceType) }}
          />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium">
                {configuration.configurationName}
                {!configuration.isActive && (
                  <span className="text-muted-foreground"> (Inactive)</span>
                )}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">{configuration.serviceType} • {configuration.model}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-medium">{formatCostWithCents(configuration.totalCost)}</div>
          <div className="text-sm text-muted-foreground">
            {formatLargeNumber(configuration.promptTokens + configuration.completionTokens)} tokens
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <TokenUsageRadialChart 
          title="Tokens Per Minute"
          currentValue={configuration.rateLimit.current}
          maxValue={configuration.rateLimit.limit}
          label="TPM"
          footer={
            <div className="text-xs text-muted-foreground">
              <div className="font-medium text-foreground">
                {configuration.rateLimit.limit > 0
                  ? `Limit: ${formatLargeNumber(configuration.rateLimit.limit)} TPM`
                  : 'No TPM limit set'}
              </div>
            </div>
          }
        />

        <TokenUsageRadialChart 
          title="Requests Per Minute"
          currentValue={configuration.requestsPerMinute.current}
          maxValue={configuration.requestsPerMinute.limit}
          label="RPM"
          footer={
            <div className="text-xs text-muted-foreground">
              <div className="font-medium text-foreground">
                {configuration.requestsPerMinute.limit > 0
                  ? `Limit: ${configuration.requestsPerMinute.limit} RPM`
                  : 'No RPM limit set'}
              </div>
            </div>
          }
        />

        <TokenUsageRadialChart 
          title="Requests Per Day"
          currentValue={configuration.requestsPerDay.current}
          maxValue={configuration.requestsPerDay.limit}
          label="RPD"
          footer={
            <div className="text-xs text-muted-foreground">
              <div className="font-medium text-foreground">
                {configuration.requestsPerDay.limit > 0
                  ? `Limit: ${formatLargeNumber(configuration.requestsPerDay.limit)} RPD`
                  : 'No RPD limit set'}
              </div>
            </div>
          }
        />
      </div>

      {expanded && (
        <div className="grid gap-4 md:grid-cols-2 pt-4 border-t">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Today's Usage</h4>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Input Tokens:</span>
                <span>{formatLargeNumber(configuration.promptTokens)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Output Tokens:</span>
                <span>{formatLargeNumber(configuration.completionTokens)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>Total Cost:</span>
                <span>{formatCostWithCents(configuration.totalCost)}</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Performance</h4>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Success Rate:</span>
                <span>{((configuration.successRate || 0.985) * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Status:</span>
                <span className={configuration.isActive ? "text-green-600" : "text-muted-foreground"}>
                  {configuration.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Operations:</span>
                <span>{formatLargeNumber(configuration.requestsPerDay.current)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ComparisonConfigurationView({ configurations }: { configurations: ConfigurationUsageMetrics[] }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Configuration Cost Comparison</h3>
      
      <div className="grid gap-4">
        {configurations.map(config => (
          <div key={config.configurationId} className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: getServiceColor(config.serviceType) }}
              />
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
            
            <div className="grid grid-cols-3 gap-6 text-right">
              <div>
                <div className="font-medium">{formatCostWithCents(config.totalCost)}</div>
                <div className="text-xs text-muted-foreground">Total Cost</div>
              </div>
              <div>
                <div className="font-medium">{formatLargeNumber(config.promptTokens + config.completionTokens)}</div>
                <div className="text-xs text-muted-foreground">Tokens Used</div>
              </div>
              <div>
                <div className="font-medium">
                  {config.rateLimit.limit > 0
                    ? `${((config.rateLimit.current / config.rateLimit.limit) * 100).toFixed(1)}%`
                    : 'No data'}
                </div>
                <div className="text-xs text-muted-foreground">Rate Usage</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
