import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const verifyProviderEntitlement = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/ai/provider-access', () => ({
  verifyProviderEntitlement,
  clearProviderAccessFailureCache: vi.fn(),
}));

const mockPrisma = {
  aIConfiguration: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  $transaction: vi.fn()
};

vi.mock('../../../src/db', () => ({
  default: mockPrisma
}));

describe('AI Configuration Update', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());

    const aiConfigRouter = (await import('../../../src/routes/ai-config')).default;
    // AI configuration mutations require administrator authority as of
    // beta.5 (ISSUES.md #50a). `jwtAuthMiddleware` populates req.auth from a
    // per-request database read in the real app; these route tests stand that
    // in so the subject under test stays the route, not the guard.
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
  });

  test('persists costs and token limits without dropping zero values', async () => {
    const existingConfig = {
      id: 1,
      name: 'Gemini Test',
      type: 'apikey',
      value: '',
      description: null,
      serviceType: 'Google',
      model: 'gemini-2.5-flash-lite',
      modelName: 'gemini-2.5-flash-lite',
      endpointUrl: 'https://generativelanguage.googleapis.com',
      encryptedApiKey: 'encrypted',
      inputCost: null,
      outputCost: null,
      unitPrice: 'per_1m',
      temperature: 0.7,
      topP: 1.0,
      maxTokens: null,
      inputTokenLimit: null,
      outputTokenLimit: null,
      tokensPerMinute: null,
      requestsPerMinute: null,
      requestsPerDay: null,
      isActive: true,
      deletedAt: null,
      createdAt: new Date('2025-12-24T00:00:00.000Z'),
      updatedAt: new Date('2025-12-24T00:00:00.000Z'),
      salt: 'salt'
    };

    const updatedConfig = {
      ...existingConfig,
      inputCost: 0,
      outputCost: 0.4,
      inputTokenLimit: 1000,
      outputTokenLimit: 8192,
      maxTokens: 8192,
      tokensPerMinute: 0,
      requestsPerMinute: 0,
      requestsPerDay: 0
    };

    mockPrisma.aIConfiguration.findUnique.mockResolvedValue(existingConfig);
    mockPrisma.aIConfiguration.update.mockResolvedValue(updatedConfig);
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));

    const response = await request(app)
      .put('/api/ai-config/1')
      .send({
        id: 1,
        name: 'Gemini Test',
        type: 'apikey',
        value: '',
        inputCost: 0,
        outputCost: 0.4,
        unitPrice: 'per_1m',
        inputTokenLimit: 1000,
        outputTokenLimit: 8192,
        tokensPerMinute: 0,
        requestsPerMinute: 0,
        requestsPerDay: 0
      })
      .expect(200);

    expect(mockPrisma.aIConfiguration.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        inputCost: 0,
        outputCost: 0.4,
        inputTokenLimit: 1000,
        outputTokenLimit: 8192,
        maxTokens: 8192,
        tokensPerMinute: 0,
        requestsPerMinute: 0,
        requestsPerDay: 0
      })
    });

    expect(response.body.configuration).toMatchObject({
      inputCost: 0,
      outputCost: 0.4,
      inputTokenLimit: 1000,
      outputTokenLimit: 8192,
      maxTokens: 8192,
      tokensPerMinute: 0,
      requestsPerMinute: 0,
      requestsPerDay: 0
    });
    expect(verifyProviderEntitlement).toHaveBeenCalledTimes(1);
  });
});
