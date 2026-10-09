// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// Multi-Service AI Usage Types for Phase 2 Implementation
export type ServiceProvider = 'OpenAI' | 'Anthropic' | 'Google' | 'Azure';

export interface ServiceConfiguration {
  id: number;
  name: string;
  serviceType: ServiceProvider;
  model: string;
  isActive: boolean;
  
  // Rate Limits from AI Configuration
  tokensPerMinute: number;
  requestsPerMinute: number;
  requestsPerDay: number;
  
  // Pricing from AI Configuration
  inputCost: number;  // Cost per token
  outputCost: number; // Cost per token
  unitPrice: 'per_1k' | 'per_1m';
}

export interface ConfigurationUsageMetrics {
  // Configuration Info
  configurationId: number;
  configurationName: string;
  serviceType: ServiceProvider;
  model: string;
  isActive: boolean;
  /**
   * When the configuration was soft-deleted, or null while it still exists.
   *
   * Deleted configurations stay in the breakdown because their spend is real
   * and did happen. `isActive` cannot carry that: a row can be deleted and
   * still hold `isActive: true`, which the dashboard drew as live.
   */
  deletedAt?: string | null;

  // Cost configuration from AI Config (rate limits are below in the
  // structured `rateLimit`, `requestsPerMinute`, and `requestsPerDay`
  // objects). The previous flat `tokensPerMinute?`, `requestsPerMinute?`,
  // and `requestsPerDay?` declarations here duplicated those structured
  // fields and made every access through the structured form report
  // possibly-undefined (TS18048).
  inputCost?: number;
  outputCost?: number;
  
  // Usage Data
  dailyUsage: {
    current: number;
    limit: number;
    remaining: number;
    warningLevel: 'normal' | 'warning' | 'elevated' | 'critical' | null;
  };
  
  monthlyUsage: {
    current: number;
    limit: number;
    remaining: number;
    warningLevel: 'normal' | 'warning' | 'elevated' | 'critical' | null;
  };
  
  // Real-time Rate Limits
  rateLimit: {
    current: number;        // Current TPM
    limit: number;          // TPM limit from configuration
    resetTime: string;
  };
  
  requestsPerMinute: {
    current: number;        // Current RPM
    limit: number;          // RPM limit from configuration
  };
  
  requestsPerDay: {
    current: number;        // Current RPD
    limit: number;          // RPD limit from configuration
  };
  
  // Cost Metrics
  totalCost: number;        // Total cost for this configuration
  promptTokens: number;     // Input tokens used
  completionTokens: number; // Output tokens used

  // Cumulative request count, distinct from `requestsPerDay.current` above.
  // That one is today's volume and drives the rate-limit gauges; this is the
  // all-time figure the Usage Summary reports beside all-time cost and tokens.
  totalRequests: number;
  
  // Performance Metrics
  successRate?: number | null;     // Success rate from usage records (0-1) or null if no data
  
  // Historical Data
  historicalData: {
    date: string;
    usage: number;
    cost: number;
    limit: number;
  }[];
}

// Keep legacy interface for backward compatibility
export interface ServiceUsageMetrics extends ConfigurationUsageMetrics {
  // Legacy compatibility - maps to configurationId/configurationName
  serviceType: ServiceProvider;
  configurationId: number;
  configurationName: string;
  model: string;
}

export interface MultiServiceUsageData {
  configurations: ConfigurationUsageMetrics[];
  services: ServiceUsageMetrics[]; // Legacy compatibility field
  activeConfigurationId?: number;
  activeServiceId?: number; // Legacy compatibility field
  lastUpdated: string;
  
  // Real performance metrics from UsageRecord duration tracking
  performance?: {
    averageResponseTime: number;
    responseTimeRange: {
      min: number;
      max: number;
    };
    responseTimeData: Array<{
      date: string;
      responseTime: number;
    }>;
  };
  
  // Service-specific performance metrics (new)
  performanceByService?: Record<ServiceProvider, {
    averageResponseTime: number;
    responseTimeRange: {
      min: number;
      max: number;
    };
    responseTimeData: Array<{
      date: string;
      responseTime: number;
    }>;
  }>;
}

/**
 * Per-provider display data.
 *
 * This was `SERVICE_SPECIFICATIONS`, "for mock data", and it carried four
 * things besides the colour: `defaultModel`, a `models[]` list, `defaultLimits`
 * and `defaultPricing`. The model ids were 2024-era — `claude-3-haiku-20240307`,
 * `gemini-1.5-flash`, `gpt-3.5-turbo` — and none of them appear in the
 * catalogue any more.
 *
 * ISSUES.md #84 listed this as a stale list "exported to the cost forecast",
 * which turned out to overstate it: `defaultPricing` and `models[]` were read
 * by nothing at all, and the cost forecast imports the constant only to read
 * `.color`. Every figure it displays comes from the backend. So the invented
 * prices were inert, and are deleted rather than corrected.
 *
 * `defaultLimits` has gone too. It fed live fallbacks in
 * `services/multi-service-usage`, so a configuration with no rate limits of
 * its own displayed invented ones and the gauges drew a percentage against
 * them. A missing limit is now zero, meaning "not configured", and each
 * reader guards for it.
 *
 * What remains is the one thing that was never fiction: a colour per
 * provider, pointing at variables defined in index.css for both themes.
 */
export const SERVICE_COLORS: Record<ServiceProvider, string> = {
  OpenAI: 'var(--service-openai)',
  Anthropic: 'var(--service-anthropic)',
  Google: 'var(--service-google)',
  Azure: 'var(--service-azure)'
};

export interface ConfigurationComparisonData {
  configurationId: number;
  serviceType: ServiceProvider;
  configurationName: string;
  model: string;
  isActive: boolean;
  totalCost: number;
  tokensUsed: number;
  averageCostPerToken: number;
  averageResponseTime: number | null;
  successRate: number | null;
  operationsCount: number;
  color: string;
}

// Keep legacy interface for backward compatibility
export interface ServiceComparisonData extends ConfigurationComparisonData {
  serviceType: ServiceProvider;
  configurationName: string;
  model: string;
}

export interface CostOptimizationSuggestion {
  type: 'cost_reduction' | 'performance_improvement' | 'usage_optimization';
  title: string;
  description: string;
  potentialSavings?: number;
  fromService: ServiceProvider;
  toService: ServiceProvider;
  confidence: number;
}
