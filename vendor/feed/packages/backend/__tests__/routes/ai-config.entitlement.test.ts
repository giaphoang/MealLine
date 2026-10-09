// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const verifyProviderEntitlement = vi.hoisted(() => vi.fn());
const clearProviderAccessFailureCache = vi.hoisted(() => vi.fn());

const mockPrisma = vi.hoisted(() => ({
  aIConfiguration: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('../../src/db', () => ({ default: mockPrisma }));
vi.mock('../../src/services/encryption', () => ({
  encryptApiKey: vi.fn().mockResolvedValue({ encrypted: 'encrypted', salt: 'salt' }),
}));
vi.mock('../../src/services/ai/provider-access', () => ({
  verifyProviderEntitlement,
  clearProviderAccessFailureCache,
}));

const storedConfig = (id = 1, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Gemini ${id}`,
  type: 'apikey',
  value: '',
  description: null,
  serviceType: 'Google',
  model: 'gemini-3.5-flash-lite',
  modelName: 'gemini-3.5-flash-lite',
  endpointUrl: 'https://generativelanguage.googleapis.com',
  encryptedApiKey: 'encrypted',
  salt: 'salt',
  inputCost: 0.1,
  outputCost: 0.4,
  unitPrice: 'per_1m',
  temperature: 1,
  topP: 1,
  thinkingLevel: 'minimal',
  maxTokens: 65536,
  inputTokenLimit: 1048576,
  outputTokenLimit: 65536,
  dailyCostLimit: null,
  monthlyCostLimit: null,
  tokensPerMinute: null,
  requestsPerMinute: null,
  requestsPerDay: null,
  isActive: true,
  deletedAt: null,
  createdAt: new Date('2026-09-12T00:00:00.000Z'),
  updatedAt: new Date('2026-09-12T00:00:00.000Z'),
  ...overrides,
});

const buildApp = async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = {
      userId: 'test-admin',
      email: 'admin@williamtemple.org',
      role: 'ADMINISTRATOR',
      accessState: 'ALLOWED',
    };
    next();
  });
  const { default: router } = await import('../../src/routes/ai-config');
  app.use('/api/ai-config', router);
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode || 500).json({ error: { message: err.message, code: err.code } });
  });
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
  verifyProviderEntitlement.mockResolvedValue(undefined);
  mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));
  mockPrisma.aIConfiguration.create.mockResolvedValue(storedConfig());
  mockPrisma.aIConfiguration.update.mockImplementation(async ({ where, data }: any) => ({
    ...storedConfig(where.id),
    ...data,
  }));
});

describe('AI configuration entitlement checks', () => {
  test('checks a real generation before a new configuration is persisted', async () => {
    const app = await buildApp();

    await request(app).post('/api/ai-config').send({
      name: 'Gemini primary',
      type: 'apikey',
      value: '',
      apiKey: 'test-key',
      serviceType: 'Google',
      model: 'gemini-3.5-flash-lite',
    }).expect(201);

    expect(verifyProviderEntitlement).toHaveBeenCalledTimes(1);
    expect(mockPrisma.aIConfiguration.create).toHaveBeenCalledTimes(1);
    expect(clearProviderAccessFailureCache).toHaveBeenCalledTimes(1);
  });

  test('does not persist a configuration the provider refuses to generate with', async () => {
    verifyProviderEntitlement.mockRejectedValue(
      Object.assign(new Error('The account cannot use this model.'), {
        statusCode: 503,
        code: 'AI_TRANSLATION_MISCONFIGURED',
      })
    );
    const app = await buildApp();

    const response = await request(app).post('/api/ai-config').send({
      name: 'Gemini primary',
      type: 'apikey',
      value: '',
      apiKey: 'test-key',
      serviceType: 'Google',
      model: 'gemini-3.5-flash-lite',
    });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AI_TRANSLATION_MISCONFIGURED');
    expect(mockPrisma.aIConfiguration.create).not.toHaveBeenCalled();
  });

  test('checks ordinary saves and activations, but not a deactivation-only update', async () => {
    const app = await buildApp();
    mockPrisma.aIConfiguration.findUnique.mockResolvedValue(storedConfig());

    await request(app).put('/api/ai-config/1').send({ name: 'Gemini renamed' }).expect(200);
    await request(app).put('/api/ai-config/1').send({ isActive: true }).expect(200);
    await request(app).put('/api/ai-config/1').send({ isActive: false }).expect(200);

    expect(verifyProviderEntitlement).toHaveBeenCalledTimes(2);
    expect(clearProviderAccessFailureCache).toHaveBeenCalledTimes(3);
  });

  test('bulk activation reaches the bulk route and verifies every API configuration', async () => {
    const configurations = [storedConfig(1), storedConfig(2)];
    mockPrisma.aIConfiguration.findMany.mockResolvedValue(configurations);
    const app = await buildApp();

    await request(app)
      .put('/api/ai-config/bulk')
      .send({ ids: [1, 2], updates: { isActive: true } })
      .expect(200);

    expect(verifyProviderEntitlement).toHaveBeenCalledTimes(2);
    expect(mockPrisma.aIConfiguration.update).toHaveBeenCalledTimes(2);
  });
});
