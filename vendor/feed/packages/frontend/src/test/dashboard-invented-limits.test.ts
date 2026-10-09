// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * What the dashboard says when a configuration has no rate limits.
 *
 * ISSUES.md #84 listed `SERVICE_SPECIFICATIONS` as a stale list "exported to
 * the cost forecast". That overstated one thing and missed another. The
 * forecast imported it only for `.color`; its `defaultPricing` and `models[]`
 * — `claude-3-haiku-20240307`, `gemini-1.5-flash`, `gpt-3.5-turbo` — were read
 * by nothing at all, so the invented prices were inert.
 *
 * What was live went unmentioned: `defaultLimits` supplied a rate limit for
 * any configuration that had none, so the gauges drew a percentage of a
 * ceiling nobody had set, and the history chart drew a limit line derived from
 * no configuration whatsoever. A limit is now zero when none is configured,
 * and readers guard for it.
 *
 * The distinction this file exists to keep is the one `chart-series.test.ts`
 * already makes for series data: a zero that is a real observation, versus a
 * zero standing in for an absence. Here the absence is the honest answer, and
 * the invented number was the lie.
 */

import { describe, expect, test } from 'vitest';

import { multiServiceUsageService } from '@/services/multi-service-usage';
import { SERVICE_COLORS } from '@/types/multi-service-usage';

/** The mapper is private; the singleton is what the app uses. */
const mapResponse = (response: unknown) =>
  (multiServiceUsageService as any).mapBackendResponseToFrontend(response);

const usage = (promptTokens = 0, completionTokens = 0) => ({
  promptTokens,
  completionTokens,
  totalCost: 0.5,
  requestCount: 4,
  successRate: 1
});

const wireResponse = (
  configOverrides: Record<string, unknown> = {},
  historicalUsage: unknown[] = []
) => ({
  metrics: {
    serviceProvider: 'OpenAI',
    configurationCount: 1,
    dailyTokens: 100,
    monthlyTokens: 1000,
    monthlyCost: 1,
    dailyTokenLimit: 0,
    monthlyTokenLimit: 0,
    tpmLimit: 0,
    rpmLimit: 0,
    rpdLimit: 0,
    dailyTokensRemaining: 0,
    monthlyTokensRemaining: 0,
    dailyWarningLevel: 'NONE',
    monthlyWarningLevel: 'NONE',
    currentRatePerMinute: 10,
    requestsPerMinute: 2,
    requestsPerDay: 20,
    overallSuccessRate: 1,
    configurations: [
      {
        id: 1,
        name: 'Unlimited config',
        serviceType: 'OpenAI',
        model: 'gpt-5.6-luna',
        isActive: true,
        dailyUsage: usage(60, 40),
        monthlyUsage: usage(600, 400),
        allTimeUsage: usage(6000, 4000),
        ...configOverrides
      }
    ],
    historicalUsage,
    averageResponseTime: 0,
    responseTimeRange: { min: 0, max: 0 },
    responseTimeData: [],
    performanceByService: {}
  }
});

describe('a configuration with no rate limits of its own', () => {
  test('reports no limit rather than an invented one', () => {
    // Previously 200000 / 500 / 10000, invented per provider in
    // SERVICE_SPECIFICATIONS and then generically. A configuration with
    // nothing set displayed a ceiling it did not have.
    const [configuration] = mapResponse(wireResponse()).configurations;

    expect(configuration.rateLimit.limit).toBe(0);
    expect(configuration.requestsPerMinute.limit).toBe(0);
    expect(configuration.requestsPerDay.limit).toBe(0);
  });

  test('does not derive a daily or monthly ceiling from a limit it does not have', () => {
    const [configuration] = mapResponse(wireResponse()).configurations;

    expect(configuration.dailyUsage.limit).toBe(0);
    expect(configuration.monthlyUsage.limit).toBe(0);
  });

  test('keeps configured provider rate allowances without turning them into budgets', () => {
    const [configuration] = mapResponse(
      wireResponse({ tokensPerMinute: 200000, requestsPerMinute: 500, requestsPerDay: 10000 })
    ).configurations;

    expect(configuration.rateLimit.limit).toBe(200000);
    expect(configuration.requestsPerMinute.limit).toBe(500);
    expect(configuration.requestsPerDay.limit).toBe(10000);
    expect(configuration.dailyUsage.limit).toBe(0);
    expect(configuration.monthlyUsage.limit).toBe(0);
  });

  test('a blank model is unknown, not a retired id', () => {
    // The fallback was `specs?.defaultModel` — claude-3-haiku-20240307 for
    // Anthropic, gemini-1.5-flash for Google. Naming a model the
    // configuration is not using is worse than admitting we do not know.
    const [configuration] = mapResponse(wireResponse({ model: '' })).configurations;

    expect(configuration.model).toBe('unknown');
  });
});

describe('the history chart', () => {
  const day = {
    date: '2026-09-12',
    totalTokens: 900,
    totalCost: 0.9,
    services: { OpenAI: { tokens: 900, cost: 0.9 } }
  };

  test('draws no limit line when no limit is known', () => {
    // This was `(specs?.defaultLimits.tokensPerMinute || 200000) * 1440`,
    // which consulted no configuration at all — every provider got the same
    // invented ceiling drawn across its history.
    const [configuration] = mapResponse(wireResponse({}, [day])).configurations;

    expect(configuration.historicalData).toHaveLength(1);
    expect(configuration.historicalData[0].limit).toBe(0);
    expect(configuration.historicalData[0].usage).toBe(900);
  });

  test('is empty when the backend sends no history', () => {
    const [configuration] = mapResponse(wireResponse()).configurations;

    expect(configuration.historicalData).toEqual([]);
  });
});

describe('what is left of SERVICE_SPECIFICATIONS', () => {
  test('is a colour per provider, and nothing else', () => {
    expect(Object.keys(SERVICE_COLORS).sort()).toEqual([
      'Anthropic',
      'Azure',
      'Google',
      'OpenAI'
    ]);
    for (const value of Object.values(SERVICE_COLORS)) {
      expect(value).toMatch(/^var\(--service-/);
    }
  });

  test('carries no model ids, prices or limits', () => {
    // The guard against this growing back. Every entry is a plain string, so
    // there is nowhere for a defaultModel or a defaultPricing to return to.
    for (const value of Object.values(SERVICE_COLORS)) {
      expect(typeof value).toBe('string');
    }
  });
});
