// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * The translation and document routes, when the AI provider refuses.
 *
 * ISSUES.md #84: these routes called `validateApiKey()`, got a boolean, and
 * answered `400 Invalid API key configuration` whatever had actually
 * happened. A working key calling a model the account cannot use read as a
 * bad key, and the provider's real answer reached only the server log.
 *
 * Mounted against the **real** error handler, not a stub. #80 shipped a
 * withheld-message defect precisely because a stub forwarded `error.message`
 * verbatim: curated copy passed in tests and was replaced by generic text in
 * production.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockPrisma = vi.hoisted(() => ({
  translation: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));
vi.mock('../../../src/db', () => ({ default: mockPrisma }));

const mockAlertService = vi.hoisted(() => ({
  checkTokenUsage: vi.fn().mockResolvedValue(undefined),
  checkCostUsage: vi.fn().mockResolvedValue(undefined),
  checkResponseTime: vi.fn().mockResolvedValue(undefined),
  createAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../src/services/alerts', () => ({ alertService: mockAlertService }));

const checkAccess = vi.hoisted(() => vi.fn());
const getConfiguredModel = vi.hoisted(() => vi.fn(() => 'gemini-2.5-flash-lite'));
const getAccessCacheKey = vi.hoisted(() => vi.fn(() => 'Google:1:gemini-2.5-flash-lite:1'));
const createService = vi.hoisted(() => vi.fn());
const createServiceFromConfiguration = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/ai/factory/AIServiceFactory', () => ({
  AIServiceFactory: { createService, createServiceFromConfiguration },
}));

import { resetProviderAlertThrottle } from '../../../src/services/alerts/provider-alerts';
import {
  clearProviderAccessFailureCache,
  PROVIDER_ACCESS_FAILURE_TTL_MS,
  verifyProviderEntitlement,
} from '../../../src/services/ai/provider-access';

/** A provider that answers, but refuses the configured model. */
const refusedModel = Object.assign(
  new Error(
    'models/gemini-2.5-flash-lite is no longer available to new users. '
      + 'Please update your code to use a newer model.',
  ),
  { status: 404 },
);

/** A provider whose account has run out of prepaid credit. */
const depletedAccount = Object.assign(
  new Error('{"error":{"code":429,"message":"Your prepayment credits are depleted.",'
    + '"status":"RESOURCE_EXHAUSTED"}}'),
  { status: 429 },
);

const buildApp = async () => {
  const app = express();
  app.use(express.json());
  const { default: translationsRouter } = await import('../../../src/routes/translations');
  app.use('/api/translations', translationsRouter);
  const { errorHandler } = await import('../../../src/middleware/error-handler');
  app.use(errorHandler);
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
  resetProviderAlertThrottle();
  clearProviderAccessFailureCache();
  getConfiguredModel.mockReturnValue('gemini-2.5-flash-lite');
  createService.mockResolvedValue({ checkAccess, getConfiguredModel, getAccessCacheKey });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/translations when the provider refuses the model', () => {
  test('names the model, does not claim the key is invalid, and answers 503', async () => {
    checkAccess.mockResolvedValue({ ok: false, error: refusedModel });
    const app = await buildApp();

    const response = await request(app)
      .post('/api/translations')
      .send({ originalText: 'Please take one bag of rice.', targetLanguages: ['Spanish'] });

    // 503 rather than 400: FEED is fine, its dependency is not — and
    // Cloudflare replaces an origin 502 with its own page (#80).
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AI_TRANSLATION_MISCONFIGURED');
    expect(response.body.error.message).toContain('gemini-2.5-flash-lite');
    expect(response.body.error.message).not.toContain('Invalid API key configuration');
    // Nothing was created: the point of checking first.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  test('raises one administrator alert, because only they can clear it', async () => {
    checkAccess.mockResolvedValue({ ok: false, error: refusedModel });
    const app = await buildApp();

    await request(app)
      .post('/api/translations')
      .send({ originalText: 'Please take one bag of rice.', targetLanguages: ['Spanish'] });

    expect(mockAlertService.createAlert).toHaveBeenCalledTimes(1);
    expect(mockAlertService.createAlert.mock.calls[0][1]).toContain('gemini-2.5-flash-lite');
  });

  test('remembers a non-transient refusal instead of repeating the provider lookup', async () => {
    checkAccess.mockResolvedValue({ ok: false, error: refusedModel });
    const app = await buildApp();

    await request(app)
      .post('/api/translations')
      .send({ originalText: 'Rice', targetLanguages: ['Spanish'] });
    await request(app)
      .post('/api/translations')
      .send({ originalText: 'Beans', targetLanguages: ['Spanish'] });

    expect(checkAccess).toHaveBeenCalledTimes(1);
  });

  test('checks again after the remembered refusal expires', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    checkAccess.mockResolvedValue({ ok: false, error: refusedModel });
    const app = await buildApp();

    await request(app)
      .post('/api/translations')
      .send({ originalText: 'Rice', targetLanguages: ['Spanish'] });
    now.mockReturnValue(1_000 + PROVIDER_ACCESS_FAILURE_TTL_MS + 1);
    await request(app)
      .post('/api/translations')
      .send({ originalText: 'Beans', targetLanguages: ['Spanish'] });

    expect(checkAccess).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });
});

describe('POST /api/translations when the account is out of credit', () => {
  test('says retrying will not clear it, and carries the quota code', async () => {
    checkAccess.mockResolvedValue({ ok: false, error: depletedAccount });
    const app = await buildApp();

    const response = await request(app)
      .post('/api/translations')
      .send({ originalText: 'Please take one bag of rice.', targetLanguages: ['Spanish'] });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AI_TRANSLATION_QUOTA_EXHAUSTED');
    expect(response.body.error.message).toMatch(/will not clear/);
  });
});

describe('transient runtime failures', () => {
  test.each([
    Object.assign(new Error('Model is overloaded. Try again later.'), { status: 529 }),
    Object.assign(new Error('Rate limit exceeded. Please retry.'), { status: 429 }),
  ])('a busy refusal reaches staff as a retryable 503 without an administrator alert', async error => {
    checkAccess.mockResolvedValue({ ok: false, error });
    const app = await buildApp();
    const response = await request(app).post('/api/translations')
      .send({ originalText: 'Brown rice', targetLanguages: ['Spanish'] });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AI_TRANSLATION_BUSY');
    expect(response.body.error.message).toMatch(/busy|try again/i);
    expect(mockAlertService.createAlert).not.toHaveBeenCalled();
  });
  test('checks the provider again because a busy response may clear', async () => {
    checkAccess.mockResolvedValue({
      ok: false,
      error: Object.assign(new Error('Service temporarily unavailable'), { status: 503 }),
    });
    const app = await buildApp();

    await request(app)
      .post('/api/translations')
      .send({ originalText: 'Rice', targetLanguages: ['Spanish'] });
    await request(app)
      .post('/api/translations')
      .send({ originalText: 'Beans', targetLanguages: ['Spanish'] });

    expect(checkAccess).toHaveBeenCalledTimes(2);
  });
});

describe('save-time entitlement verification', () => {
  test('uses a real-generation check and preserves the provider refusal', async () => {
    const verifyEntitlement = vi.fn().mockResolvedValue({ ok: false, error: refusedModel });
    createServiceFromConfiguration.mockReturnValue({ verifyEntitlement, getConfiguredModel });

    await expect(verifyProviderEntitlement({ model: 'gemini-2.5-flash-lite' } as any))
      .rejects.toMatchObject({
        failure: 'misconfigured',
        code: 'AI_TRANSLATION_MISCONFIGURED',
      });
    expect(verifyEntitlement).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/translations/bulk-retry when the provider refuses', () => {
  test('marks the rows with the reason staff will read, and answers 503 once', async () => {
    checkAccess.mockResolvedValue({ ok: false, error: refusedModel });
    mockPrisma.translation.findMany.mockResolvedValue([
      { id: 1, originalText: 'Rice', language: 'Spanish', type: 'Custom' },
      { id: 2, originalText: 'Beans', language: 'Arabic', type: 'Custom' },
    ]);
    const app = await buildApp();

    const response = await request(app)
      .post('/api/translations/bulk-retry')
      .send({ ids: [1, 2] });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AI_TRANSLATION_MISCONFIGURED');

    const [[update]] = mockPrisma.translation.updateMany.mock.calls;
    expect(update.data.status).toBe('failed');
    expect(update.data.translatedText).toContain('gemini-2.5-flash-lite');

    // Two rows, one provider fault, one alert.
    expect(mockAlertService.createAlert).toHaveBeenCalledTimes(1);
  });
});

describe('when no AI model is switched on at all', () => {
  test('says so, rather than reporting a rejected key', async () => {
    createService.mockRejectedValue(
      new Error('AI configuration required. Please configure AI settings in Tools → AI Configuration.'),
    );
    const app = await buildApp();

    const response = await request(app)
      .post('/api/translations')
      .send({ originalText: 'Please take one bag of rice.', targetLanguages: ['Spanish'] });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AI_TRANSLATION_NOT_CONFIGURED');
    expect(response.body.error.message).toContain('no AI model is switched on');
    // Unfinished setup is not something to alert an administrator about at
    // request time; it is the ordinary state of a restored instance.
    expect(mockAlertService.createAlert).not.toHaveBeenCalled();
  });
});
