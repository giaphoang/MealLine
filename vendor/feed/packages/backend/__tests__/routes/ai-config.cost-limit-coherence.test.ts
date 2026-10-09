// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * A cost limit that cannot be enforced is refused at the API.
 *
 * Defect 6 of ISSUES.md #84. A daily or monthly cost limit is compared against
 * `UsageRecord.totalCost`, which is tokens x price. With no price the product
 * is zero, recorded spend never moves, and `LimitEnforcementService` evaluates
 * `0 + 0 > limit` on every request — so the limit an administrator set is
 * inert while looking like protection.
 *
 * What is deliberately still allowed: an unpriced configuration with no limit.
 * The Cost step offers "Leave empty to skip cost tracking" on purpose, and a
 * Custom model whose prices nobody knows is a legitimate thing to save. Only
 * the contradiction is refused — asking FEED to cap a number it has no way to
 * measure.
 *
 * The update cases matter more than the create one. Each field on that route
 * is guarded by its own `!== undefined`, so an edit can reach the same
 * unenforceable pair from either side: adding a limit to a configuration with
 * no prices, or clearing the prices from one that already has a limit. A check
 * reading only the request body would pass both.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const verifyProviderEntitlement = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/ai/provider-access', () => ({
  verifyProviderEntitlement,
  clearProviderAccessFailureCache: vi.fn(),
}));

const mockPrisma = {
  aIConfiguration: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  },
  $transaction: vi.fn()
};

vi.mock('../../src/db', () => ({
  default: mockPrisma
}));

vi.mock('../../src/services/encryption', () => ({
  encryptApiKey: vi.fn().mockResolvedValue({ encrypted: 'encrypted', salt: 'salt' })
}));

const storedConfig = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Custom model',
  type: 'apikey',
  value: '',
  description: null,
  serviceType: 'OpenAI',
  model: 'Custom',
  modelName: 'Custom',
  endpointUrl: '',
  encryptedApiKey: 'encrypted',
  inputCost: null,
  outputCost: null,
  unitPrice: 'per_1m',
  temperature: 0.7,
  topP: 1.0,
  thinkingLevel: null,
  maxTokens: null,
  inputTokenLimit: null,
  outputTokenLimit: null,
  dailyCostLimit: null,
  monthlyCostLimit: null,
  tokensPerMinute: null,
  requestsPerMinute: null,
  requestsPerDay: null,
  isActive: true,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  salt: 'salt',
  ...overrides
});

describe('a cost limit with nothing to measure against', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));
    mockPrisma.aIConfiguration.create.mockResolvedValue({ id: 1, name: 'Custom model' });
    mockPrisma.aIConfiguration.update.mockResolvedValue({ id: 1, name: 'Custom model' });

    app = express();
    app.use(express.json());

    const aiConfigRouter = (await import('../../src/routes/ai-config')).default;
    // Standing in for `jwtAuthMiddleware`, as the sibling route suites do, so
    // the subject stays the route rather than the guard.
    app.use((req, _res, next) => {
      req.auth = {
        userId: 'test-admin',
        email: 'admin@williamtemple.org',
        role: 'ADMINISTRATOR',
        accessState: 'ALLOWED',
      };
      next();
    });
    app.use('/api/ai-config', aiConfigRouter);
    // Without this the 400s below arrive as express's default 500 HTML page.
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
    });
  });

  const create = (body: Record<string, unknown>) =>
    request(app)
      .post('/api/ai-config')
      .send({
        name: 'Custom model',
        type: 'apikey',
        value: '',
        apiKey: 'test-key',
        serviceType: 'OpenAI',
        model: 'Custom',
        ...body
      });

  test('refuses to create one, naming what to do about it', async () => {
    const response = await create({ dailyCostLimit: 5 }).expect(400);

    expect(response.body.code).toBe('AI_CONFIGURATION_UNENFORCEABLE_COST_LIMIT');
    expect(response.body.error).toMatch(/cost limit needs a price/i);
    expect(mockPrisma.aIConfiguration.create).not.toHaveBeenCalled();
  });

  test('a monthly limit is refused on the same grounds', async () => {
    await create({ monthlyCostLimit: 30 }).expect(400);

    expect(mockPrisma.aIConfiguration.create).not.toHaveBeenCalled();
  });

  test('an unpriced configuration with no limit is still perfectly legal', async () => {
    // The Cost step offers exactly this, and a Custom model nobody has prices
    // for is a real thing to save. Refusing it would be a worse defect.
    await create({}).expect(201);

    expect(mockPrisma.aIConfiguration.create).toHaveBeenCalled();
  });

  test('a limit of zero means unlimited, not unenforceable', async () => {
    // `dailyCostLimit > 0 ? … : null` already treats zero as no limit, so it
    // must not be caught by the coherence check.
    await create({ dailyCostLimit: 0 }).expect(201);

    expect(mockPrisma.aIConfiguration.create).toHaveBeenCalled();
  });

  test('a priced configuration may set whatever limit it likes', async () => {
    await create({ dailyCostLimit: 5, inputCost: 0.25, outputCost: 2, unitPrice: 'per_1m' })
      .expect(201);

    expect(mockPrisma.aIConfiguration.create).toHaveBeenCalled();
  });

  test('one price is enough — a partly priced configuration still measures something', async () => {
    // Output spend would go uncounted, which is imperfect but not inert. Only
    // the provably unmeasurable case is refused.
    await create({ dailyCostLimit: 5, inputCost: 0.25 }).expect(201);

    expect(mockPrisma.aIConfiguration.create).toHaveBeenCalled();
  });
});

describe('an edit that would leave the limit unenforceable', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));
    mockPrisma.aIConfiguration.update.mockResolvedValue({ id: 1, name: 'Custom model' });

    app = express();
    app.use(express.json());
    const aiConfigRouter = (await import('../../src/routes/ai-config')).default;
    app.use((req, _res, next) => {
      req.auth = {
        userId: 'test-admin',
        email: 'admin@williamtemple.org',
        role: 'ADMINISTRATOR',
        accessState: 'ALLOWED',
      };
      next();
    });
    app.use('/api/ai-config', aiConfigRouter);
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
    });
  });

  test('adding a limit to an unpriced configuration is refused', async () => {
    mockPrisma.aIConfiguration.findUnique.mockResolvedValue(storedConfig());

    await request(app).put('/api/ai-config/1').send({ dailyCostLimit: 5 }).expect(400);

    expect(mockPrisma.aIConfiguration.update).not.toHaveBeenCalled();
  });

  test('clearing the prices from a configuration that has a limit is refused', async () => {
    // The case a body-only check would miss entirely: the request carries no
    // limit at all, and the stored row supplies it.
    mockPrisma.aIConfiguration.findUnique.mockResolvedValue(
      storedConfig({ inputCost: 0.25, outputCost: 2, dailyCostLimit: 5 })
    );

    await request(app)
      .put('/api/ai-config/1')
      .send({ inputCost: null, outputCost: null })
      .expect(400);

    expect(mockPrisma.aIConfiguration.update).not.toHaveBeenCalled();
  });

  test('clearing the limit alongside the prices is allowed', async () => {
    // Removing both at once is coherent — nothing is being asked for.
    mockPrisma.aIConfiguration.findUnique.mockResolvedValue(
      storedConfig({ inputCost: 0.25, outputCost: 2, dailyCostLimit: 5 })
    );

    await request(app)
      .put('/api/ai-config/1')
      .send({ inputCost: null, outputCost: null, dailyCostLimit: 0 })
      .expect(200);

    expect(mockPrisma.aIConfiguration.update).toHaveBeenCalled();
  });

  test('an unrelated edit to an already-priced configuration is untouched', async () => {
    mockPrisma.aIConfiguration.findUnique.mockResolvedValue(
      storedConfig({ inputCost: 0.25, outputCost: 2, dailyCostLimit: 5 })
    );

    await request(app).put('/api/ai-config/1').send({ description: 'renamed' }).expect(200);

    expect(mockPrisma.aIConfiguration.update).toHaveBeenCalled();
  });
});
