// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Spend on an OpenAI translation that failed after the provider billed for it.
 *
 * The companion to `AnthropicTranslationService.failed-spend.test.ts`, and the
 * more important of the two to cover. Anthropic already had a `try`/`catch`
 * around its reply parsing, so wiring `trackFailedUsage` there added calls to
 * an existing branch. OpenAI and Google had no such branch: the parse and the
 * `translatedText` check ran bare, and a wrapper had to be introduced. A new
 * branch is the one more likely to be wrong, so it is the one that should not
 * go untested.
 *
 * Same distinction as the Anthropic file: a request refused before an answer
 * (429, auth, network) was never billed and records nothing; a request the
 * provider answered and charged for, which FEED then could not use, is real
 * spend and is recorded `success: false`.
 *
 * 4000/2000 are deliberately unlike anything tiktoken returns for "Hello", so
 * these assertions cannot pass if FEED's own estimate replaces the provider's
 * reported counts.
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

import { OpenAITranslationService } from '../OpenAITranslationService';
import { UsageRecordService } from '../../../usage-record';

const IN_TOKENS = 4000;
const OUT_TOKENS = 2000;

/** 4000 * 2.0/1e6 + 2000 * 12.0/1e6 */
const EXPECTED_COST = 0.032;

const buildConfig = (overrides: Partial<AIConfiguration> = {}): AIConfiguration =>
  ({
    id: 1,
    name: 'OpenAI',
    type: 'apikey',
    value: '',
    description: null,
    serviceType: 'OpenAI',
    model: 'gpt-5.6-terra',
    modelName: 'gpt-5.6-terra',
    endpointUrl: '',
    encryptedApiKey: 'encrypted',
    salt: 'salt',
    inputCost: 2.0,
    outputCost: 12.0,
    unitPrice: 'per_1m',
    temperature: 0.7,
    topP: 1.0,
    thinkingLevel: null,
    maxTokens: 4096,
    inputTokenLimit: 400000,
    outputTokenLimit: 128000,
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

/** One translation whose reply carries `content` and real usage counts. */
const translateReturning = async (content: string) => {
  const create = vi.fn().mockResolvedValue({
    choices: [{ finish_reason: 'stop', message: { content } }],
    usage: { prompt_tokens: IN_TOKENS, completion_tokens: OUT_TOKENS }
  });
  const service = new OpenAITranslationService(buildConfig()) as any;
  vi.spyOn(service, 'getOpenAIClient').mockResolvedValue({
    chat: { completions: { create } }
  });
  return service.translateText({ text: 'Hello', targetLanguage: 'Spanish' });
};

const recordedRows = () => vi.mocked(UsageRecordService.createUsageRecord).mock.calls;

beforeEach(() => {
  vi.mocked(UsageRecordService.createUsageRecord).mockClear();
});

describe('a reply OpenAI billed for and FEED could not use', () => {
  test('a reply that will not parse is recorded as failed spend', async () => {
    await expect(translateReturning('not json at all')).rejects.toThrow();

    expect(UsageRecordService.createUsageRecord).toHaveBeenCalledTimes(1);
    const metrics = recordedRows()[0][3];
    expect(metrics.success).toBe(false);
    expect(metrics.promptTokens).toBe(IN_TOKENS);
    expect(metrics.completionTokens).toBe(OUT_TOKENS);
    expect(metrics.totalCost).toBeCloseTo(EXPECTED_COST, 10);
  });

  test('a reply that parses but carries no translation is recorded too', async () => {
    await expect(translateReturning('{"somethingElse": "Hola"}')).rejects.toThrow(
      /translatedText/
    );

    expect(UsageRecordService.createUsageRecord).toHaveBeenCalledTimes(1);
    const metrics = recordedRows()[0][3];
    expect(metrics.success).toBe(false);
    expect(metrics.promptTokens).toBe(IN_TOKENS);
  });

  test('the cost comes from the provider counts, not an estimate', async () => {
    await expect(translateReturning('not json at all')).rejects.toThrow();

    const metrics = recordedRows()[0][3];
    expect(metrics.totalCost).toBeCloseTo(EXPECTED_COST, 10);
    expect(metrics.totalCost).not.toBe(0);
  });
});

describe('the flag actually discriminates', () => {
  test('a translation that succeeds is still recorded as success', async () => {
    const result = await translateReturning('{"translatedText": "Hola"}');

    expect(result.translatedText).toBe('Hola');
    expect(UsageRecordService.createUsageRecord).toHaveBeenCalledTimes(1);
    const metrics = recordedRows()[0][3];
    expect(metrics.success).toBe(true);
    expect(metrics.promptTokens).toBe(IN_TOKENS);
  });
});
