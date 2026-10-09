// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * `GET /api/ai-config/models` — the server-authoritative catalogue the
 * dialogs will read instead of a second copy of `model-specs.ts`.
 *
 * The first test here earns its place: Express matches routes in declaration
 * order, and `/:id` sits a few lines below `/models`. Declared the other way
 * round, this endpoint returns `400 Invalid configuration ID` — a failure
 * that reads as a broken client rather than a mis-ordered router, and one no
 * unit test of the catalogue module could catch.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockPrisma = vi.hoisted(() => ({
  aIConfiguration: { findMany: vi.fn(), findUnique: vi.fn() },
  systemPrompt: { findMany: vi.fn() },
}));
vi.mock('../../../src/db', () => ({ default: mockPrisma }));
vi.mock('../../../src/services/encryption', () => ({
  encryptApiKey: vi.fn(),
  decryptApiKey: vi.fn(),
}));

const buildApp = async () => {
  const app = express();
  app.use(express.json());
  const { default: router } = await import('../../../src/routes/ai-config');
  app.use('/api/ai-config', router);
  const { errorHandler } = await import('../../../src/middleware/error-handler');
  app.use(errorHandler);
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/ai-config/models', () => {
  test('is not swallowed by the /:id route declared below it', async () => {
    const response = await request(await buildApp()).get('/api/ai-config/models');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('models');
    // The failure this guards against.
    expect(JSON.stringify(response.body)).not.toContain('Invalid configuration ID');
    // And it must not have reached the database on the way.
    expect(mockPrisma.aIConfiguration.findUnique).not.toHaveBeenCalled();
  });

  test('serves entries with the lifecycle and capability facts the UI needs', async () => {
    const response = await request(await buildApp()).get('/api/ai-config/models');
    const haiku = response.body.models.find(
      (m: any) => m.id === 'claude-haiku-4-5-20251001'
    );

    expect(haiku).toBeDefined();
    expect(haiku.pricing).toMatchObject({ input: 1, output: 5 });
    expect(haiku.pricing.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(haiku.capabilities.sampling).toBe('temperature-or-top-p');
    expect(haiku.capabilities.prefill).toBe('allowed');
    expect(haiku.lifecycle.status).toBe('active');
    expect(haiku.languages.Spanish).toBe('supported');
    expect(haiku.languages.Somali).toBe('unsupported');
  });

  test('omits retired models, so nothing shut down can be chosen', async () => {
    const response = await request(await buildApp()).get('/api/ai-config/models');
    const ids = response.body.models.map((m: any) => m.id);

    // Shut down 2026-03-09, and selectable in the interface until now.
    expect(ids).not.toContain('gemini-3-pro-preview');
  });

  test('carries the service endpoints the dialog pre-fills', async () => {
    const response = await request(await buildApp()).get('/api/ai-config/models');

    expect(response.body.endpoints).toMatchObject({
      OpenAI: 'https://api.openai.com/v1',
      Anthropic: 'https://api.anthropic.com/v1',
      Google: 'https://generativelanguage.googleapis.com',
    });
  });

  test('a withdrawn model is not offered as a new choice', async () => {
    // The 2026 refresh drops it as a preset. It used to be FEED's default.
    const response = await request(await buildApp()).get('/api/ai-config/models');
    const ids = response.body.models.map((m: any) => m.id);

    expect(ids).not.toContain('gemini-2.5-flash-lite');
    expect(ids).toContain('gemini-3.5-flash-lite');
  });

  test('but it is still served, and still says what to move to', async () => {
    // This asserted the withdrawn model appeared in `models`, and it did until
    // the refresh withheld it — at which point the dialog lost the only way to
    // explain a configuration already pointing at it. The entry never left the
    // catalogue and `findCatalogueEntry` still resolves it, but in-process
    // resolvable is not the same as reachable over HTTP, which is what the
    // interface has. Hence a second list rather than a deleted assertion.
    const response = await request(await buildApp()).get('/api/ai-config/models');
    const withdrawn = response.body.withdrawn.find(
      (m: any) => m.id === 'gemini-2.5-flash-lite'
    );

    expect(withdrawn).toBeDefined();
    expect(withdrawn.lifecycle.status).toBe('deprecated');
    expect(withdrawn.lifecycle.replacement).toBe('gemini-3.5-flash-lite');
    expect(withdrawn.lifecycle.note).toMatch(/no longer available to new users/);
  });

  test('production’s model can still be explained, six weeks before it dies', async () => {
    // gpt-5-mini is what production runs and it shuts down 2026-12-11. A saved
    // configuration on it has to render that date and its replacement, so the
    // one preset whose withdrawal matters most must not be the one that goes
    // silent.
    const response = await request(await buildApp()).get('/api/ai-config/models');
    const mini = response.body.withdrawn.find(
      (m: any) => m.id === 'gpt-5-mini-2025-08-07'
    );

    expect(mini).toBeDefined();
    expect(mini.lifecycle.shutdownDate).toBe('2026-12-11');
    expect(mini.lifecycle.replacement).toBe('gpt-5.6-terra');
    // And it is genuinely gone from the choices.
    expect(response.body.models.map((m: any) => m.id)).not.toContain('gpt-5-mini-2025-08-07');
  });

  test('every catalogue entry is in exactly one of the two lists', async () => {
    // The split must partition, not sample: an entry in neither list is one
    // the interface can neither offer nor explain.
    const response = await request(await buildApp()).get('/api/ai-config/models');
    const offered = response.body.models.map((m: any) => m.id);
    const withdrawn = response.body.withdrawn.map((m: any) => m.id);

    expect(offered.filter((id: string) => withdrawn.includes(id))).toEqual([]);
    expect(new Set([...offered, ...withdrawn]).size).toBe(offered.length + withdrawn.length);
  });
});
