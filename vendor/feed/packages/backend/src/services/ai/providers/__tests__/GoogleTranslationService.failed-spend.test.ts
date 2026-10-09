// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Spend on a Gemini translation that failed after the provider billed for it.
 *
 * The third of three. Like OpenAI, Google had no branch around its reply
 * parsing before this: the `JSON.parse` and the `translatedText` check ran
 * bare, and a wrapper had to be introduced to record what a billed-but-
 * unusable reply cost.
 *
 * Google's `extractUsageMetrics` is not shaped like OpenAI's, and the
 * difference is the whole reason this fixture looks the way it does:
 *
 *   promptTokens     = usageMetadata.promptTokenCount
 *   completionTokens = candidatesTokenCount + thoughtsTokenCount
 *
 * Thinking tokens are summed into the completion count, and the fallback is
 * used only when *both* are absent. So a fixture carrying OpenAI-shaped fields
 * would not fail loudly — `extractUsageMetrics` would quietly return FEED's
 * own estimate instead, and every assertion below would pass while proving
 * nothing about the provider's counts.
 *
 * The thinking figure is not hypothetical. Measured live on 2026-09-13,
 * `gemini-3.1-pro-preview` spent 262 completion tokens on a three-word
 * translation, nearly all of it thinking, against 17 for
 * `gemini-3.5-flash-lite` at the same `low` level. If thinking tokens were
 * dropped from the recorded cost, that model's spend would be understated by
 * roughly the whole of it.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AIConfiguration } from '@prisma/client';

vi.mock('../../../../db', () => ({ default: {} }));

vi.mock('../../../limits', () => ({
  limitEnforcement: {
    checkTokenUsage: vi.fn().mockResolvedValue({
      canProceed: true,
      remainingTokens: 0,
      warningLevel: null
    })
  }
}));

vi.mock('../../../usage-record', () => ({
  UsageRecordService: {
    createUsageRecord: vi.fn().mockResolvedValue(undefined)
  }
}));

import { GoogleTranslationService } from '../GoogleTranslationService';
import { UsageRecordService } from '../../../usage-record';

const PROMPT_TOKENS = 4000;
const CANDIDATE_TOKENS = 1500;
const THINKING_TOKENS = 500;
/** The helper sums the two, as Gemini bills them. */
const OUT_TOKENS = CANDIDATE_TOKENS + THINKING_TOKENS;

/** 4000 * 0.75/1e6 + 2000 * 3.75/1e6 */
const EXPECTED_COST = 0.0105;

const buildConfig = (overrides: Partial<AIConfiguration> = {}): AIConfiguration =>
  ({
    id: 1,
    name: 'Google',
    type: 'apikey',
    value: '',
    description: null,
    serviceType: 'Google',
    model: 'gemini-3.8-flash',
    modelName: 'gemini-3.8-flash',
    endpointUrl: '',
    encryptedApiKey: 'encrypted',
    salt: 'salt',
    inputCost: 0.75,
    outputCost: 3.75,
    unitPrice: 'per_1m',
    temperature: 1.0,
    topP: 1.0,
    thinkingLevel: null,
    maxTokens: 4096,
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    dailyCostLimit: null,
    monthlyCostLimit: null,
    tokensPerMinute: null,
    requestsPerMinute: null,
    requestsPerDay: null,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }) as AIConfiguration;

/** One translation whose reply carries `text` and Gemini-shaped usage. */
const translateReturning = async (text: string) => {
  const generateContent = vi.fn().mockResolvedValue({
    text,
    usageMetadata: {
      promptTokenCount: PROMPT_TOKENS,
      candidatesTokenCount: CANDIDATE_TOKENS,
      thoughtsTokenCount: THINKING_TOKENS
    }
  });
  const service = new GoogleTranslationService(buildConfig()) as any;
  vi.spyOn(service, 'getGoogleClient').mockResolvedValue({
    models: { generateContent }
  });
  return service.translateText({ text: 'Hello', targetLanguage: 'Spanish' });
};

const recordedRows = () => vi.mocked(UsageRecordService.createUsageRecord).mock.calls;

beforeEach(() => {
  vi.mocked(UsageRecordService.createUsageRecord).mockClear();
});

describe('a reply Gemini billed for and FEED could not use', () => {
  test('a reply that will not parse is recorded as failed spend', async () => {
    await expect(translateReturning('not json at all')).rejects.toThrow();

    expect(UsageRecordService.createUsageRecord).toHaveBeenCalledTimes(1);
    const metrics = recordedRows()[0][3];
    expect(metrics.success).toBe(false);
    expect(metrics.promptTokens).toBe(PROMPT_TOKENS);
    expect(metrics.totalCost).toBeCloseTo(EXPECTED_COST, 10);
  });

  test('a reply that parses but carries no translation is recorded too', async () => {
    await expect(translateReturning('{"somethingElse": "Hola"}')).rejects.toThrow(
      /translatedText/
    );

    expect(UsageRecordService.createUsageRecord).toHaveBeenCalledTimes(1);
    expect(recordedRows()[0][3].success).toBe(false);
  });

  test('thinking tokens are part of the recorded spend, not dropped', async () => {
    // The cost of a Pro-tier reply is mostly thinking. Recording only
    // `candidatesTokenCount` would understate it by most of the bill.
    await expect(translateReturning('not json at all')).rejects.toThrow();

    const metrics = recordedRows()[0][3];
    expect(metrics.completionTokens).toBe(OUT_TOKENS);
    expect(metrics.completionTokens).not.toBe(CANDIDATE_TOKENS);
  });
});

describe('the flag actually discriminates', () => {
  test('a translation that succeeds is still recorded as success', async () => {
    const result = await translateReturning('{"translatedText": "Hola"}');

    expect(result.translatedText).toBe('Hola');
    expect(UsageRecordService.createUsageRecord).toHaveBeenCalledTimes(1);
    const metrics = recordedRows()[0][3];
    expect(metrics.success).toBe(true);
    expect(metrics.promptTokens).toBe(PROMPT_TOKENS);
  });
});
