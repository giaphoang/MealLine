// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AIConfiguration } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  usageRecord: {
    aggregate: vi.fn()
  },
  aIConfiguration: {
    findFirst: vi.fn()
  }
}));

vi.mock('@prisma/client', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>('@prisma/client');
  return {
    ...actual,
    PrismaClient: vi.fn(() => mockPrisma)
  };
});

vi.mock('../../alerts', () => ({
  alertService: {
    createAlert: vi.fn()
  }
}));

import { LimitEnforcementService } from '../index';
import { alertService } from '../../alerts';

const createConfig = (overrides: Partial<AIConfiguration> = {}): AIConfiguration => {
  return {
    id: 1,
    model: 'gpt-4o-mini',
    inputCost: 0.15,
    outputCost: 0.6,
    unitPrice: 'per_1m',
    requestsPerDay: 10000,
    dailyCostLimit: null,
    monthlyCostLimit: null,
    ...overrides
  } as AIConfiguration;
};

const setUsage = (daily: { promptTokens: number; completionTokens: number; totalCost: number }, monthly: {
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
}) => {
  mockPrisma.usageRecord.aggregate
    .mockResolvedValueOnce({
      _sum: {
        promptTokens: daily.promptTokens,
        completionTokens: daily.completionTokens,
        totalCost: daily.totalCost
      }
    })
    .mockResolvedValueOnce({
      _sum: {
        promptTokens: monthly.promptTokens,
        completionTokens: monthly.completionTokens,
        totalCost: monthly.totalCost
      }
    });
};

describe('LimitEnforcementService cost limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.usageRecord.aggregate.mockResolvedValue({
      _sum: { promptTokens: 0, completionTokens: 0, totalCost: 0 }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('throws when model configuration is missing', async () => {
    const service = LimitEnforcementService.getInstance();
    // Deliberately invalid: the guard under test is `!config.model ||
    // !config.id`, so the whole point is a configuration that is not one.
    // `as unknown as` rather than filling the fixture in, which would remove
    // the condition being tested.
    const notAConfiguration = { id: undefined } as unknown as AIConfiguration;
    await expect(service.checkTokenUsage(10, notAConfiguration)).rejects.toThrow(
      'Model configuration required for limit enforcement.'
    );
  });

  test('allows usage when daily and monthly cost limits are null', async () => {
    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 500 },
      { promptTokens: 0, completionTokens: 0, totalCost: 1000 }
    );

    const service = LimitEnforcementService.getInstance();
    const result = await service.checkTokenUsage(100, createConfig());

    expect(result.canProceed).toBe(true);
  });

  test('treats zero cost limits as unlimited', async () => {
    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 500 },
      { promptTokens: 0, completionTokens: 0, totalCost: 1000 }
    );

    const service = LimitEnforcementService.getInstance();
    const result = await service.checkTokenUsage(
      100,
      createConfig({ dailyCostLimit: 0, monthlyCostLimit: 0 })
    );

    expect(result.canProceed).toBe(true);
  });

  test('allows usage when estimated cost stays within limits', async () => {
    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 0.5 },
      { promptTokens: 0, completionTokens: 0, totalCost: 0.5 }
    );

    const service = LimitEnforcementService.getInstance();
    const result = await service.checkTokenUsage(
      39,
      createConfig({
        inputCost: 1,
        outputCost: 1,
        unitPrice: 'per_1k',
        dailyCostLimit: 1,
        monthlyCostLimit: 1
      })
    );

    expect(result.canProceed).toBe(true);
  });

  test('blocks when daily cost limit would be exceeded', async () => {
    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 0.9 },
      { promptTokens: 0, completionTokens: 0, totalCost: 0.9 }
    );

    const service = LimitEnforcementService.getInstance();
    const result = await service.checkTokenUsage(
      1000,
      createConfig({
        inputCost: 1,
        outputCost: 1,
        unitPrice: 'per_1k',
        dailyCostLimit: 1,
        monthlyCostLimit: 10
      })
    );

    expect(result.canProceed).toBe(false);
    expect(result.reason).toBe('Daily cost limit would be exceeded');
  });

  test('allows usage that reaches the daily cost limit exactly', async () => {
    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 0.9 },
      { promptTokens: 0, completionTokens: 0, totalCost: 0.9 }
    );

    const service = LimitEnforcementService.getInstance();
    const result = await service.checkTokenUsage(
      39,
      createConfig({
        inputCost: 1,
        outputCost: 1,
        unitPrice: 'per_1k',
        dailyCostLimit: 1,
        monthlyCostLimit: 1
      })
    );

    expect(result.canProceed).toBe(true);
  });

  test('blocks when monthly cost limit would be exceeded', async () => {
    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 0.2 },
      { promptTokens: 0, completionTokens: 0, totalCost: 0.9 }
    );

    const service = LimitEnforcementService.getInstance();
    const result = await service.checkTokenUsage(
      1000,
      createConfig({
        inputCost: 1,
        outputCost: 1,
        unitPrice: 'per_1k',
        dailyCostLimit: 10,
        monthlyCostLimit: 1
      })
    );

    expect(result.canProceed).toBe(false);
    expect(result.reason).toBe('Monthly cost limit would be exceeded');
  });

  test('evaluates limits independently per configuration', async () => {
    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 0.9 },
      { promptTokens: 0, completionTokens: 0, totalCost: 0.9 }
    );
    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 0.1 },
      { promptTokens: 0, completionTokens: 0, totalCost: 0.1 }
    );

    const service = LimitEnforcementService.getInstance();

    const blocked = await service.checkTokenUsage(
      139,
      createConfig({
        id: 1,
        inputCost: 1,
        outputCost: 1,
        unitPrice: 'per_1k',
        dailyCostLimit: 1,
        monthlyCostLimit: 1
      })
    );

    const allowed = await service.checkTokenUsage(
      39,
      createConfig({
        id: 2,
        inputCost: 1,
        outputCost: 1,
        unitPrice: 'per_1k',
        dailyCostLimit: 1,
        monthlyCostLimit: 1
      })
    );

    expect(blocked.canProceed).toBe(false);
    expect(blocked.reason).toBe('Daily cost limit would be exceeded');
    expect(allowed.canProceed).toBe(true);

    const [dailyCallA, monthlyCallA, dailyCallB, monthlyCallB] =
      mockPrisma.usageRecord.aggregate.mock.calls.map((call) => call[0]);

    expect(dailyCallA.where.aiConfigurationId).toBe(1);
    expect(monthlyCallA.where.aiConfigurationId).toBe(1);
    expect(dailyCallB.where.aiConfigurationId).toBe(2);
    expect(monthlyCallB.where.aiConfigurationId).toBe(2);
  });

  test('uses precise per-1m rates when evaluating cost limits', async () => {
    const tokens = 1000;
    const inputCost = 0.05;
    const outputCost = 0.15;
    // Input priced whole, output at the documented ratio. This used to read
    // `(61 + tokens * 0.5)` for the input half, mirroring the implementation
    // line for line — so it asserted that the code did what it did, and would
    // have gone on passing had the constant been any other number.
    const expectedCost =
      (tokens * (inputCost / 1_000_000)) +
      ((tokens * 0.5) * (outputCost / 1_000_000));

    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 0 },
      { promptTokens: 0, completionTokens: 0, totalCost: 0 }
    );

    const service = LimitEnforcementService.getInstance();
    const blocked = await service.checkTokenUsage(
      tokens,
      createConfig({
        inputCost,
        outputCost,
        unitPrice: 'per_1m',
        dailyCostLimit: expectedCost - 0.000001,
        monthlyCostLimit: 10
      })
    );

    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 0 },
      { promptTokens: 0, completionTokens: 0, totalCost: 0 }
    );

    const allowed = await service.checkTokenUsage(
      tokens,
      createConfig({
        inputCost,
        outputCost,
        unitPrice: 'per_1m',
        dailyCostLimit: expectedCost + 0.000001,
        monthlyCostLimit: 10
      })
    );

    expect(blocked.canProceed).toBe(false);
    expect(blocked.reason).toBe('Daily cost limit would be exceeded');
    expect(allowed.canProceed).toBe(true);
  });

  test('prices the whole input, without a second helping of the system prompt', async () => {
    // The estimate handed in already contains the system prompt that will be
    // sent. With no output rate, the answer must be exactly input x rate.
    //
    // Sharp on purpose. The arithmetic this replaced returned
    // (61 + 1000 * 0.5) * 0.001 = $0.561 for this request, which a $0.9 limit
    // waves through; priced honestly it is $1.00 and the limit stops it. A
    // regression to either the flat 61 or the halved input flips this back.
    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 0 },
      { promptTokens: 0, completionTokens: 0, totalCost: 0 }
    );

    const service = LimitEnforcementService.getInstance();
    const result = await service.checkTokenUsage(
      1000,
      createConfig({
        id: 7001,
        inputCost: 1,
        outputCost: 0,
        unitPrice: 'per_1k',
        dailyCostLimit: 0.9,
        monthlyCostLimit: 100
      })
    );

    expect(result.canProceed).toBe(false);
    expect(result.reason).toBe('Daily cost limit would be exceeded');
  });

  test('charges nothing for an empty input', async () => {
    // The flat 61 was added whatever came in, so a request with no measurable
    // input still accrued 61 tokens of spend against the limit.
    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 0 },
      { promptTokens: 0, completionTokens: 0, totalCost: 0 }
    );

    const service = LimitEnforcementService.getInstance();
    const result = await service.checkTokenUsage(
      0,
      createConfig({
        id: 7002,
        inputCost: 1,
        outputCost: 1,
        unitPrice: 'per_1k',
        dailyCostLimit: 0.0001,
        monthlyCostLimit: 100
      })
    );

    // Nothing in, nothing charged. The old code booked 61 x 0.001 = $0.061
    // and blocked on a limit this size.
    expect(result.canProceed).toBe(true);
  });

  test('does not convert tokens per minute into a daily token budget', async () => {
    setUsage(
      { promptTokens: 700, completionTokens: 739, totalCost: 0 },
      { promptTokens: 700, completionTokens: 739, totalCost: 0 }
    );

    const service = LimitEnforcementService.getInstance();
    const result = await service.checkTokenUsage(
      2,
      createConfig({
        tokensPerMinute: 1,
        dailyCostLimit: null,
        monthlyCostLimit: null
      })
    );

    expect(result).toEqual({
      canProceed: true,
      remainingTokens: 0,
      warningLevel: null
    });
  });

  test('does not fall back to a model-specific daily token budget', async () => {
    setUsage(
      { promptTokens: 700, completionTokens: 730, totalCost: 0 },
      { promptTokens: 0, completionTokens: 0, totalCost: 0 }
    );

    const service = LimitEnforcementService.getInstance();
    const result = await service.checkTokenUsage(
      2,
      createConfig({ tokensPerMinute: null, model: 'gpt-4o-mini' })
    );

    expect(result).toEqual({
      canProceed: true,
      remainingTokens: 0,
      warningLevel: null
    });
  });

  test('queries usage records with daily and monthly boundaries', async () => {
    vi.useFakeTimers();
    const now = new Date('2025-12-28T12:34:56.000Z');
    vi.setSystemTime(now);

    setUsage(
      { promptTokens: 0, completionTokens: 0, totalCost: 0 },
      { promptTokens: 0, completionTokens: 0, totalCost: 0 }
    );

    const service = LimitEnforcementService.getInstance();
    await service.checkTokenUsage(10, createConfig({ id: 42 }));

    const [dailyCall, monthlyCall] = mockPrisma.usageRecord.aggregate.mock.calls.map((call) => call[0]);
    const expectedStartOfDay = new Date(now);
    expectedStartOfDay.setHours(0, 0, 0, 0);
    const expectedStartOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    expect(dailyCall.where.aiConfigurationId).toBe(42);
    expect(dailyCall.where.success).toBe(true);
    expect(dailyCall.where.timestamp.gte.getTime()).toBe(expectedStartOfDay.getTime());

    expect(monthlyCall.where.aiConfigurationId).toBe(42);
    expect(monthlyCall.where.success).toBe(true);
    expect(monthlyCall.where.timestamp.gte.getTime()).toBe(expectedStartOfMonth.getTime());
  });
});

/**
 * A cost limit with no price behind it (defect 6, ISSUES.md #84).
 *
 * `estimatedCost` is zero and `usage.dailyCost` sums a `totalCost` written at
 * the same zero rate, so both cost comparisons reduce to `0 + 0 > limit` on
 * every request. The limit reads as protection and stops nothing. The API now
 * refuses to save that pair, but rows saved before it did still exist, and
 * restore-from-backup and the scripts directory write configurations without
 * passing through the route — so enforcement says so loudly and carries on.
 *
 * Carrying on is the deliberate half. Halting the pantry's translations over a
 * configuration defect is a worse outcome than spend that is uncapped but now
 * visible in the alert list.
 *
 * NOTE for anyone adding cases here: the service is a singleton and the
 * "already warned" set is an instance field, so it survives
 * `vi.clearAllMocks()` and every test in this file shares it. Give each test a
 * distinct `id`, or a later test will see its alert silently suppressed by an
 * earlier one and read as "the alert never fires".
 */
describe('a cost limit that cannot be measured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.usageRecord.aggregate.mockResolvedValue({
      _sum: { promptTokens: 0, completionTokens: 0, totalCost: 0 }
    });
  });

  const unpriced = (id: number) =>
    createConfig({
      id,
      name: 'Custom model',
      inputCost: null,
      outputCost: null,
      dailyCostLimit: 5,
      tokensPerMinute: null,
      model: 'Custom'
    } as Partial<AIConfiguration>);

  test('raises a critical alert naming the configuration', async () => {
    const service = LimitEnforcementService.getInstance();
    await service.checkTokenUsage(100, unpriced(9001));

    expect(alertService.createAlert).toHaveBeenCalledTimes(1);
    const [level, message] = vi.mocked(alertService.createAlert).mock.calls[0];
    expect(level).toBe('critical');
    // Without a name the alert would read `"undefined" has a cost limit`,
    // which tells staff nothing about which configuration to open.
    expect(message).toContain('Custom model');
    expect(message).toMatch(/cost limit but no input or output rate/);
  });

  test('still lets the translation through', async () => {
    const service = LimitEnforcementService.getInstance();
    const result = await service.checkTokenUsage(100, unpriced(9002));

    expect(result.canProceed).toBe(true);
  });

  test('warns once per configuration, not once per translation', async () => {
    // This check runs before every request, and `createAlert` writes a row and
    // emits an event. Alerting per call would bury the alert list during a
    // bulk import — the alert would be true and useless.
    const service = LimitEnforcementService.getInstance();
    const config = unpriced(9003);

    await service.checkTokenUsage(100, config);
    await service.checkTokenUsage(100, config);
    await service.checkTokenUsage(100, config);

    expect(alertService.createAlert).toHaveBeenCalledTimes(1);
  });

  test('says nothing when the configuration is priced', async () => {
    const service = LimitEnforcementService.getInstance();
    await service.checkTokenUsage(
      100,
      createConfig({ id: 9004, name: 'Priced', dailyCostLimit: 5, tokensPerMinute: null })
    );

    expect(alertService.createAlert).not.toHaveBeenCalled();
  });

  test('says nothing when there is no limit to be inert', async () => {
    // An unpriced configuration with no cost limit is a legitimate state the
    // Cost step offers outright. Alerting on it would be noise.
    const service = LimitEnforcementService.getInstance();
    await service.checkTokenUsage(
      100,
      createConfig({
        id: 9005,
        name: 'Unpriced, unlimited',
        inputCost: null,
        outputCost: null,
        dailyCostLimit: null,
        monthlyCostLimit: null,
        tokensPerMinute: null
      } as Partial<AIConfiguration>)
    );

    expect(alertService.createAlert).not.toHaveBeenCalled();
  });

  test('a monthly-only limit is caught too', async () => {
    const service = LimitEnforcementService.getInstance();
    await service.checkTokenUsage(
      100,
      createConfig({
        id: 9006,
        name: 'Monthly only',
        inputCost: null,
        outputCost: null,
        dailyCostLimit: null,
        monthlyCostLimit: 30,
        tokensPerMinute: null
      } as Partial<AIConfiguration>)
    );

    expect(alertService.createAlert).toHaveBeenCalledTimes(1);
  });
});
