// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * What the usage dashboard says about a configuration that has been deleted.
 *
 * The breakdown lists every `type: 'apikey'` configuration and, until now,
 * labelled each one from `isActive` alone. Soft deletion does not clear that
 * flag, so a deleted configuration still carrying `isActive: true` was drawn
 * exactly like a live one — two of them on this deployment, one holding real
 * production spend (ISSUES.md #84).
 *
 * Hiding them would be the wrong repair. The spend happened, it is inside the
 * month's total, and a breakdown that omits it stops reconciling against the
 * database — which is how these two were found. The row stays and says what
 * it is.
 *
 * This tests the mapper rather than the component, as
 * `dashboard-invented-limits.test.ts` does: the labels are three lines of JSX
 * over the field asserted here.
 */

import { describe, expect, test } from 'vitest';

import { multiServiceUsageService } from '@/services/multi-service-usage';

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

const aConfiguration = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'A configuration',
  serviceType: 'OpenAI',
  model: 'gpt-5.6-luna',
  isActive: true,
  deletedAt: null,
  dailyUsage: usage(60, 40),
  monthlyUsage: usage(600, 400),
  allTimeUsage: usage(6000, 4000),
  ...overrides
});

const wireResponse = (configurations: unknown[]) => ({
  metrics: {
    serviceProvider: 'OpenAI',
    configurationCount: configurations.length,
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
    configurations,
    historicalUsage: [],
    averageResponseTime: 0,
    responseTimeRange: { min: 0, max: 0 },
    responseTimeData: [],
    performanceByService: {}
  }
});

const DELETED_AT = '2026-09-01T00:00:00.000Z';

describe('a soft-deleted configuration in the usage breakdown', () => {
  test('carries its deletion through to the dashboard', () => {
    // Without this the row arrives at the component with `isActive: true` and
    // nothing else to go on, and is drawn as live.
    const [configuration] = mapResponse(
      wireResponse([aConfiguration({ deletedAt: DELETED_AT })])
    ).configurations;

    expect(configuration.deletedAt).toBe(DELETED_AT);
  });

  test('keeps the spend it actually made', () => {
    // The other candidate repair — filtering deleted rows out of the endpoint
    // — would drop this from the breakdown while the month's total still
    // counted it, and the two would stop agreeing.
    const [configuration] = mapResponse(
      wireResponse([aConfiguration({ deletedAt: DELETED_AT })])
    ).configurations;

    expect(configuration.totalCost).toBe(0.5);
    expect(configuration.promptTokens).toBe(6000);
  });

  test('is not named as the active configuration', () => {
    // Deletion leaves `isActive` alone, so `find(c => c.isActive)` matched the
    // deleted row — it is first — and reported it as the one in use.
    const mapped = mapResponse(
      wireResponse([
        aConfiguration({ id: 1, name: 'Deleted', deletedAt: DELETED_AT }),
        aConfiguration({ id: 2, name: 'Live', deletedAt: null })
      ])
    );

    expect(mapped.activeConfigurationId).toBe(2);
    expect(mapped.activeServiceId).toBe(2);
  });

  test('leaves a live configuration unmarked', () => {
    const [configuration] = mapResponse(wireResponse([aConfiguration()])).configurations;

    expect(configuration.deletedAt).toBeNull();
  });
});
