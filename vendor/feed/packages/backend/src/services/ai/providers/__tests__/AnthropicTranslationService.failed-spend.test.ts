// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Spend on a translation that failed after the provider billed for it.
 *
 * `trackFailedUsage` sat on `AITranslationService` with exactly one reference
 * in the codebase — its own definition. Nothing called it, so every one of the
 * 27 `UsageRecord` rows on this machine was `success = 1`, and a request the
 * provider answered, charged for, and FEED then could not use cost money that
 * appeared nowhere at all.
 *
 * The distinction that matters is between two kinds of failure:
 *
 *   - Refused before an answer (429, auth, network). Nothing was billed, so
 *     there is nothing to record. These are untouched.
 *   - Answered and billed, then unusable to FEED (a reply that will not parse,
 *     or one that parses without a `translatedText`). Real money, previously
 *     invisible. These are what this file covers.
 *
 * The rows are written `success: false`. `LimitEnforcementService.getCurrentUsage`
 * filters on `success: true`, so this deliberately does not change what the
 * cost limit counts — whether billed-but-failed spend should count against a
 * limit is a separate decision (ISSUES.md #84). Recording it first is what
 * makes that decision answerable: at present nobody can size the problem.
 *
 * Nothing mocked `UsageRecordService` anywhere in this suite before now, so
 * the whole chain — trackFailedUsage -> trackUsage -> createUsageRecord — was
 * untested in either direction.
 *
 * The token counts below (4000 in, 2000 out) are deliberately far from
 * anything tiktoken would return for "Hello", following the precedent in
 * `recorded-cost.test.ts`: an assertion here cannot pass by coincidence if
 * FEED's own estimate ever creeps back in place of the provider's counts.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AIConfiguration } from '@prisma/client';

vi.mock('../../../../db', () => ({ default: {} }));

vi.mock('../../../usage-record', () => ({
  UsageRecordService: {
    createUsageRecord: vi.fn().mockResolvedValue(undefined)
  }
}));

import { AnthropicTranslationService } from '../AnthropicTranslationService';
import { UsageRecordService } from '../../../usage-record';

const IN_TOKENS = 4000;
const OUT_TOKENS = 2000;

/** 4000 * 1.0/1e6 + 2000 * 5.0/1e6 */
const EXPECTED_COST = 0.014;

const buildConfig = (overrides: Partial<AIConfiguration> = {}): AIConfiguration =>
  ({
    id: 1,
    name: 'Anthropic',
    type: 'apikey',
    value: '',
    description: null,
    serviceType: 'Anthropic',
    // Sonnet 5 refuses assistant prefill, so the mocked reply is parsed whole.
    // A prefilling model would have `{` prepended and these fixtures would be
    // testing the parser rather than the recording.
    model: 'claude-sonnet-5',
    modelName: 'claude-sonnet-5',
    endpointUrl: '',
    encryptedApiKey: 'encrypted',
    salt: 'salt',
    inputCost: 1.0,
    outputCost: 5.0,
    unitPrice: 'per_1m',
    temperature: 0.7,
    topP: 1.0,
    thinkingLevel: null,
    maxTokens: 4096,
    inputTokenLimit: 200000,
    outputTokenLimit: 64000,
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

/** Drive one translation whose reply carries `text` and real usage counts. */
const translateReturning = async (text: string) => {
  const create = vi.fn().mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage: { input_tokens: IN_TOKENS, output_tokens: OUT_TOKENS }
  });
  const service = new AnthropicTranslationService(buildConfig()) as any;
  vi.spyOn(service, 'getAnthropicClient').mockResolvedValue({ messages: { create } });
  return service.translateText({ text: 'Hello', targetLanguage: 'Spanish' });
};

const recordedRows = () => vi.mocked(UsageRecordService.createUsageRecord).mock.calls;

beforeEach(() => {
  vi.mocked(UsageRecordService.createUsageRecord).mockClear();
});

describe('a reply the provider billed for and FEED could not use', () => {
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
    // Valid JSON, no `translatedText`. Billed exactly the same.
    await expect(translateReturning('{"somethingElse": "Hola"}')).rejects.toThrow(
      /translatedText/
    );

    expect(UsageRecordService.createUsageRecord).toHaveBeenCalledTimes(1);
    const metrics = recordedRows()[0][3];
    expect(metrics.success).toBe(false);
    expect(metrics.promptTokens).toBe(IN_TOKENS);
  });

  test('the cost comes from the provider counts, not an estimate', async () => {
    // 4000/2000 are nothing like tiktoken's count for "Hello", so this fails
    // if the recorded figure ever reverts to FEED's own estimate.
    await expect(translateReturning('not json at all')).rejects.toThrow();

    const metrics = recordedRows()[0][3];
    expect(metrics.totalCost).toBeCloseTo(EXPECTED_COST, 10);
    expect(metrics.totalCost).not.toBe(0);
  });

  test('one row per failed request, not one per retry attempt', async () => {
    // `isRetryableError` excludes parse and validation errors, so the retry
    // loop does not run again. If that ever changes, a single failure would
    // start writing three rows and overstate spend.
    await expect(translateReturning('not json at all')).rejects.toThrow();

    expect(UsageRecordService.createUsageRecord).toHaveBeenCalledTimes(1);
  });
});

describe('the flag actually discriminates', () => {
  test('a translation that succeeds is still recorded as success', async () => {
    // The negative control. Without it, every assertion above would pass just
    // as well if `success` were hardcoded false.
    const result = await translateReturning('{"translatedText": "Hola"}');

    expect(result.translatedText).toBe('Hola');
    expect(UsageRecordService.createUsageRecord).toHaveBeenCalledTimes(1);
    const metrics = recordedRows()[0][3];
    expect(metrics.success).toBe(true);
    expect(metrics.promptTokens).toBe(IN_TOKENS);
    expect(metrics.totalCost).toBeCloseTo(EXPECTED_COST, 10);
  });
});
