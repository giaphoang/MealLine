// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  aIConfiguration: { findFirst: vi.fn() },
  language: { findMany: vi.fn() },
  translation: { count: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../../src/db', () => ({ default: mockPrisma }));
vi.mock('../../src/services/translation-auditor', () => ({
  translationAuditor: {
    handleLanguageDisabled: vi.fn(),
    handleLanguageEnabled: vi.fn(),
    cleanupDuplicates: vi.fn(),
  },
}));

const buildApp = async () => {
  const app = express();
  app.use(express.json());
  const { default: router } = await import('../../src/routes/languages');
  app.use('/api/languages', router);
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/languages/model-coverage', () => {
  test('returns the active model and all catalogue coverage states', async () => {
    mockPrisma.aIConfiguration.findFirst.mockResolvedValue({
      model: 'gemini-3.5-flash-lite',
      serviceType: 'Google',
    });

    const response = await request(await buildApp()).get('/api/languages/model-coverage');

    expect(response.status).toBe(200);
    expect(response.body.model).toMatchObject({
      id: 'gemini-3.5-flash-lite',
      provider: 'Google',
    });
    expect(Object.keys(response.body.model.languages)).toHaveLength(59);
    expect(response.body.model.languages.Spanish).toBe('supported');
    expect(response.body.model.languages.Somali).toBe('unsupported');
  });

  test('returns no warning context when no supported active provider is configured', async () => {
    mockPrisma.aIConfiguration.findFirst.mockResolvedValue(null);

    const response = await request(await buildApp()).get('/api/languages/model-coverage');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ model: null });
  });
});
