// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted prisma mock. We only mock the `translation` model since that is
// the only one builder-translation.ts touches.
const mockPrisma = vi.hoisted(() => ({
  translation: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('../db', () => ({
  default: mockPrisma,
}));

// Hoisted AI service mock. We return a single async `translateTextBatch`
// that we can program per-test to simulate success / failure / partial.
const mockTranslateTextBatch = vi.hoisted(() => vi.fn());

vi.mock('./ai/factory/AIServiceFactory', () => ({
  AIServiceFactory: {
    createService: vi.fn(async () => ({
      translateTextBatch: mockTranslateTextBatch,
    })),
  },
}));

// Hoisted alertService mock so tests can assert the response-time alert
// fires per batch, without touching the real Prisma path.
//
// `checkTokenUsage` and `checkCostUsage` were mocked here too, until d203c77
// deleted them: both aggregated the day's rows against a fixed
// DAILY_TOKEN_LIMIT, which is the invented daily budget that commit abolished.
// Spend is enforced from the request's own configuration before the provider
// call. Keeping dead spies would be worse than useless — see the swallow test
// below, which passed for a while by rejecting a method nothing calls.
const mockAlertService = vi.hoisted(() => ({
  checkResponseTime: vi.fn(),
}));

vi.mock('./alerts', () => ({
  alertService: mockAlertService,
}));

// Import AFTER mocks are registered.
import {
  BUILDER_TRANSLATION_TYPE,
  lookupBuilderTranslations,
  translateBuilderStrings,
} from './builder-translation';

const resetMocks = () => {
  mockPrisma.translation.findMany.mockReset();
  mockPrisma.translation.upsert.mockReset();
  mockPrisma.translation.update.mockReset();
  mockPrisma.translation.updateMany.mockReset();
  mockTranslateTextBatch.mockReset();
  mockAlertService.checkResponseTime.mockReset();
  mockAlertService.checkResponseTime.mockResolvedValue(undefined);
};

beforeEach(resetMocks);

describe('builder-translation', () => {
  describe('constants', () => {
    it('uses the "Generated (List)" Translation type so the cache is distinct from "Generated" DOCX entries', () => {
      expect(BUILDER_TRANSLATION_TYPE).toBe('Generated (List)');
    });
  });

  describe('lookupBuilderTranslations', () => {
    it('returns empty cached + empty missing when given no strings', async () => {
      const result = await lookupBuilderTranslations([], 'Spanish');
      expect(result).toEqual({ cached: {}, missing: [] });
      expect(mockPrisma.translation.findMany).not.toHaveBeenCalled();
    });

    it('returns empty when language is empty', async () => {
      const result = await lookupBuilderTranslations(['Hello'], '');
      expect(result).toEqual({ cached: {}, missing: [] });
      expect(mockPrisma.translation.findMany).not.toHaveBeenCalled();
    });

    it('skips empty / whitespace-only strings without querying the cache', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      const result = await lookupBuilderTranslations(['', '   ', '\n\t'], 'Spanish');
      expect(result).toEqual({ cached: {}, missing: [] });
      expect(mockPrisma.translation.findMany).not.toHaveBeenCalled();
    });

    it('de-duplicates input strings before querying the cache', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      await lookupBuilderTranslations(['Hello', 'Hello', 'Hello'], 'Spanish');
      expect(mockPrisma.translation.findMany).toHaveBeenCalledTimes(1);
      const callArgs = mockPrisma.translation.findMany.mock.calls[0][0];
      expect(callArgs.where.originalText.in).toEqual(['Hello']);
    });

    it('queries with type=Generated (List) and only counts completed rows', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Hello', translatedText: 'Hola' },
      ]);
      await lookupBuilderTranslations(['Hello', 'World'], 'Spanish');
      const where = mockPrisma.translation.findMany.mock.calls[0][0].where;
      expect(where.type).toBe('Generated (List)');
      expect(where.language).toBe('Spanish');
      expect(where.status).toBe('completed');
    });

    it('splits the input into cached and missing based on cache hits', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Hello', translatedText: 'Hola' },
      ]);
      const result = await lookupBuilderTranslations(['Hello', 'World'], 'Spanish');
      expect(result.cached).toEqual({ Hello: 'Hola' });
      expect(result.missing).toEqual(['World']);
    });

    it('treats rows with empty translatedText as missing', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Hello', translatedText: '' },
        { originalText: 'World', translatedText: null },
      ]);
      const result = await lookupBuilderTranslations(['Hello', 'World'], 'Spanish');
      expect(result.cached).toEqual({});
      expect(result.missing).toEqual(['Hello', 'World']);
    });
  });

  describe('translateBuilderStrings', () => {
    it('returns empty when given no strings', async () => {
      const result = await translateBuilderStrings([], 'Spanish');
      expect(result).toEqual({});
      expect(mockTranslateTextBatch).not.toHaveBeenCalled();
    });

    it('returns cached entries without calling the AI provider when nothing is missing', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Hello', translatedText: 'Hola' },
        { originalText: 'World', translatedText: 'Mundo' },
      ]);
      const result = await translateBuilderStrings(['Hello', 'World'], 'Spanish');
      expect(result).toEqual({ Hello: 'Hola', World: 'Mundo' });
      expect(mockTranslateTextBatch).not.toHaveBeenCalled();
      expect(mockPrisma.translation.upsert).not.toHaveBeenCalled();
    });

    it('upserts pending rows for missing strings, calls the AI provider, then updates rows to completed', async () => {
      // No cache hits.
      mockPrisma.translation.findMany.mockResolvedValue([]);
      // Two missing strings -> two pending upserts -> ids 101 and 102.
      mockPrisma.translation.upsert
        .mockResolvedValueOnce({ id: 101 })
        .mockResolvedValueOnce({ id: 102 });
      mockTranslateTextBatch.mockResolvedValue({
        translations: [
          { id: '101', translatedText: 'Hola' },
          { id: '102', translatedText: 'Mundo' },
        ],
      });
      mockPrisma.translation.update.mockResolvedValue({});

      const result = await translateBuilderStrings(['Hello', 'World'], 'Spanish');

      // AI provider was called once with both strings.
      expect(mockTranslateTextBatch).toHaveBeenCalledTimes(1);
      expect(mockTranslateTextBatch.mock.calls[0][0]).toMatchObject({
        targetLanguage: 'Spanish',
        context: 'custom',
        texts: [
          { id: '101', text: 'Hello' },
          { id: '102', text: 'World' },
        ],
      });
      // Two rows promoted to completed.
      expect(mockPrisma.translation.update).toHaveBeenCalledTimes(2);
      // Result combines both freshly translated strings.
      expect(result).toEqual({ Hello: 'Hola', World: 'Mundo' });
    });

    it('upsert payloads use the Generated (List) type and pending status', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.translation.upsert.mockResolvedValueOnce({ id: 7 });
      mockTranslateTextBatch.mockResolvedValue({
        translations: [{ id: '7', translatedText: 'Hola' }],
      });
      mockPrisma.translation.update.mockResolvedValue({});

      await translateBuilderStrings(['Hello'], 'Spanish');

      const upsertCall = mockPrisma.translation.upsert.mock.calls[0][0];
      expect(upsertCall.create.type).toBe('Generated (List)');
      expect(upsertCall.create.status).toBe('pending');
      expect(upsertCall.update.status).toBe('pending');
      expect(upsertCall.where.translation_unique_combo).toEqual({
        originalText: 'Hello',
        language: 'Spanish',
        type: 'Generated (List)',
      });
    });

    it('combines cache hits with freshly translated strings', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Hello', translatedText: 'Hola' },
      ]);
      mockPrisma.translation.upsert.mockResolvedValueOnce({ id: 55 });
      mockTranslateTextBatch.mockResolvedValue({
        translations: [{ id: '55', translatedText: 'Mundo' }],
      });
      mockPrisma.translation.update.mockResolvedValue({});

      const result = await translateBuilderStrings(['Hello', 'World'], 'Spanish');

      expect(result).toEqual({ Hello: 'Hola', World: 'Mundo' });
      // Only the missing string went through the AI provider.
      const aiCall = mockTranslateTextBatch.mock.calls[0][0];
      expect(aiCall.texts).toEqual([{ id: '55', text: 'World' }]);
    });

    it('marks rows the provider did not return as failed', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.translation.upsert
        .mockResolvedValueOnce({ id: 10 })
        .mockResolvedValueOnce({ id: 11 });
      // Provider returns only one of the two strings.
      mockTranslateTextBatch.mockResolvedValue({
        translations: [{ id: '10', translatedText: 'Hola' }],
      });
      mockPrisma.translation.update.mockResolvedValue({});
      mockPrisma.translation.updateMany.mockResolvedValue({ count: 1 });

      const result = await translateBuilderStrings(['Hello', 'World'], 'Spanish');

      expect(result).toEqual({ Hello: 'Hola' });
      // The unreturned row was flipped to failed.
      expect(mockPrisma.translation.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [11] } },
        data: { status: 'failed' },
      });
    });

    it('de-duplicates input strings before translating', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.translation.upsert.mockResolvedValueOnce({ id: 1 });
      mockTranslateTextBatch.mockResolvedValue({
        translations: [{ id: '1', translatedText: 'Hola' }],
      });
      mockPrisma.translation.update.mockResolvedValue({});

      const result = await translateBuilderStrings(['Hello', 'Hello', 'Hello'], 'Spanish');

      expect(mockPrisma.translation.upsert).toHaveBeenCalledTimes(1);
      expect(mockTranslateTextBatch).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ Hello: 'Hola' });
    });

    it('propagates AI provider errors so the caller can surface them', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.translation.upsert.mockResolvedValueOnce({ id: 99 });
      mockTranslateTextBatch.mockRejectedValueOnce(new Error('AI provider unavailable'));

      await expect(translateBuilderStrings(['Hello'], 'Spanish')).rejects.toThrow('AI provider unavailable');
    });
  });

  describe('translateBuilderStrings — token-usage tracking', () => {
    it('distributes batch metrics across the rows returned by the AI call (Math.ceil for token counts, even split for cost)', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.translation.upsert
        .mockResolvedValueOnce({ id: 201 })
        .mockResolvedValueOnce({ id: 202 });
      // Provider returns BOTH translations with non-trivial metrics.
      mockTranslateTextBatch.mockResolvedValue({
        translations: [
          { id: '201', translatedText: 'Hola' },
          { id: '202', translatedText: 'Mundo' },
        ],
        metrics: {
          duration: 500,
          promptTokens: 11, // ceil(11/2) = 6 per row
          completionTokens: 9, // ceil(9/2) = 5 per row
          totalCost: 0.001, // 0.0005 per row
        },
      });
      mockPrisma.translation.update.mockResolvedValue({});

      await translateBuilderStrings(['Hello', 'World'], 'Spanish');

      expect(mockPrisma.translation.update).toHaveBeenCalledTimes(2);
      const firstUpdate = mockPrisma.translation.update.mock.calls[0][0];
      const secondUpdate = mockPrisma.translation.update.mock.calls[1][0];
      expect(firstUpdate.data).toMatchObject({
        translatedText: 'Hola',
        status: 'completed',
        promptTokens: 6,
        completionTokens: 5,
        totalCost: 0.0005,
      });
      expect(secondUpdate.data).toMatchObject({
        translatedText: 'Mundo',
        status: 'completed',
        promptTokens: 6,
        completionTokens: 5,
        totalCost: 0.0005,
      });
    });

    it('defaults missing metrics to zero so legacy test mocks without a metrics field still work', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.translation.upsert.mockResolvedValueOnce({ id: 301 });
      // No metrics field at all.
      mockTranslateTextBatch.mockResolvedValue({
        translations: [{ id: '301', translatedText: 'Hola' }],
      });
      mockPrisma.translation.update.mockResolvedValue({});

      await translateBuilderStrings(['Hello'], 'Spanish');

      const update = mockPrisma.translation.update.mock.calls[0][0];
      expect(update.data).toMatchObject({
        translatedText: 'Hola',
        status: 'completed',
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
      });
    });

    it('fires alertService.checkResponseTime once per AI batch result', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.translation.upsert.mockResolvedValueOnce({ id: 401 });
      mockTranslateTextBatch.mockResolvedValue({
        translations: [{ id: '401', translatedText: 'Hola' }],
        metrics: { duration: 750, promptTokens: 10, completionTokens: 4, totalCost: 0.0008 },
      });
      mockPrisma.translation.update.mockResolvedValue({});

      await translateBuilderStrings(['Hello'], 'Spanish');

      expect(mockAlertService.checkResponseTime).toHaveBeenCalledTimes(1);
      expect(mockAlertService.checkResponseTime).toHaveBeenCalledWith(750);
    });

    it('does not call alertService when nothing is missing (cache fully hot)', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Hello', translatedText: 'Hola' },
      ]);

      await translateBuilderStrings(['Hello'], 'Spanish');

      expect(mockTranslateTextBatch).not.toHaveBeenCalled();
      expect(mockAlertService.checkResponseTime).not.toHaveBeenCalled();
    });

    it('swallows alertService failures so a broken alert path does not break translation', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.translation.upsert.mockResolvedValueOnce({ id: 501 });
      mockTranslateTextBatch.mockResolvedValue({
        translations: [{ id: '501', translatedText: 'Hola' }],
        metrics: { duration: 100, promptTokens: 5, completionTokens: 3, totalCost: 0.0001 },
      });
      mockPrisma.translation.update.mockResolvedValue({});
      // Must reject the method the code actually calls. This rejected
      // `checkTokenUsage` after that method was deleted, so the test passed
      // while exercising no alert failure at all — green, and proving nothing.
      mockAlertService.checkResponseTime.mockRejectedValueOnce(new Error('alert subsystem down'));

      // Translation itself must still resolve with the freshly-translated map.
      await expect(translateBuilderStrings(['Hello'], 'Spanish')).resolves.toEqual({
        Hello: 'Hola',
      });
    });
  });
});
