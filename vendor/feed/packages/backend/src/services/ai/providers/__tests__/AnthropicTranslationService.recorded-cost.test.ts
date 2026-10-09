// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * What Anthropic records as the cost of a call.
 *
 * `metrics.totalCost` becomes `UsageRecord.totalCost`, and that column is the
 * one `LimitEnforcementService` sums into `usage.dailyCost` and compares
 * against the daily and monthly cost limits. A wrong number here does not
 * merely misreport spend — it moves the point at which FEED stops spending.
 *
 * Two defects fed it, both invisible to a green suite because nothing
 * asserted on the money. The three existing Anthropic test files all set
 * `inputCost` and `unitPrice` in their fixtures and then check only the
 * request shape.
 *
 * 1. The translation path recorded FEED's own tiktoken estimate
 *    (`inputMetrics.cost + outputMetrics.cost`) while the provider's real
 *    counts sat twenty lines below in `response.usage`. Every estimate uses
 *    an OpenAI encoding, and Anthropic's tokenizer is documented as counting
 *    ~30% more for the same text, so this was the worst provider to guess for.
 *
 * 2. The batch and classification paths did use the real counts, but priced
 *    them with a hardcoded `/ 1000000` that ignored `unitPrice` — so a
 *    `per_1k` configuration recorded a thousandth of what it spent.
 *
 * The token counts below (4000 in, 2000 out) are deliberately far from
 * anything tiktoken would return for "Hello", so an assertion cannot pass by
 * coincidence if the estimate ever creeps back in.
 */

import { describe, expect, test, vi } from 'vitest';
import type { AIConfiguration } from '@prisma/client';

vi.mock('../../../../db', () => ({ default: {} }));

import { AnthropicTranslationService } from '../AnthropicTranslationService';

const buildConfig = (overrides: Partial<AIConfiguration> = {}): AIConfiguration =>
  ({
    id: 1,
    name: 'Anthropic',
    type: 'apikey',
    value: '',
    description: null,
    serviceType: 'Anthropic',
    model: 'claude-haiku-4-5-20251001',
    modelName: 'claude-haiku-4.5',
    endpointUrl: '',
    encryptedApiKey: 'encrypted',
    inputCost: 1.0,
    outputCost: 5.0,
    unitPrice: 'per_1m',
    temperature: 0.7,
    topP: 1.0,
    maxTokens: 10000,
    inputTokenLimit: 200000,
    outputTokenLimit: 64000,
    dailyCostLimit: null,
    monthlyCostLimit: null,
    tokensPerMinute: 50000,
    requestsPerMinute: 50,
    requestsPerDay: null,
    thinkingLevel: null,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    salt: 'salt',
    ...overrides
  }) as AIConfiguration;

const PROVIDER_INPUT_TOKENS = 4000;
const PROVIDER_OUTPUT_TOKENS = 2000;

/**
 * Drives the real translate path with a stubbed client, as the sibling suites do.
 *
 * The mocked content omits its opening brace on purpose. Haiku 4.5 still
 * accepts assistant prefill, so the service sends `{` as the start of the
 * reply and reassembles the JSON as `"{" + textContent.text`. Returning a
 * complete object here produces `{{"translatedText": …}` and fails to parse —
 * which is exactly what the first draft of this file did.
 */
const translate = async (overrides: Partial<AIConfiguration> = {}) => {
  const create = vi.fn().mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: '"translatedText": "Hola"}' }],
    usage: { input_tokens: PROVIDER_INPUT_TOKENS, output_tokens: PROVIDER_OUTPUT_TOKENS }
  });
  const service = new AnthropicTranslationService(buildConfig(overrides)) as any;
  vi.spyOn(service, 'getAnthropicClient').mockResolvedValue({ messages: { create } });
  return service.translateText({ text: 'Hello', targetLanguage: 'Spanish' });
};

describe('the cost Anthropic records against the spend limits', () => {
  test('prices the provider’s own token counts, not FEED’s estimate', async () => {
    const result = await translate();

    // 4000 * $1/1M + 2000 * $5/1M
    expect(result.metrics.totalCost).toBeCloseTo(0.014, 10);
  });

  test('records the provider’s counts rather than the encoder’s', async () => {
    const result = await translate();

    expect(result.metrics.promptTokens).toBe(PROVIDER_INPUT_TOKENS);
    expect(result.metrics.completionTokens).toBe(PROVIDER_OUTPUT_TOKENS);
  });

  test('the recorded cost is consistent with the counts recorded beside it', async () => {
    // The defect stated as an invariant: cost and counts came from different
    // sources, so they could disagree without anything looking wrong.
    const result = await translate();
    const { promptTokens, completionTokens, totalCost } = result.metrics;

    expect(totalCost).toBeCloseTo(
      (promptTokens * 1.0) / 1_000_000 + (completionTokens * 5.0) / 1_000_000,
      10
    );
  });

  test('honours a per_1k configuration instead of assuming per 1M', async () => {
    const result = await translate({ unitPrice: 'per_1k' });

    // 4000 * $1/1K + 2000 * $5/1K. The hardcoded divisor recorded 0.014 here
    // — a thousandth of the real cost, on a configuration priced per 1K.
    expect(result.metrics.totalCost).toBeCloseTo(14, 10);
  });

  test('an unpriced configuration records zero rather than a guess', async () => {
    // Distinct from defect 6, which is that zero recorded spend means the cost
    // limits never trip. Zero is still the correct number to record when no
    // price is configured; inventing one would be worse.
    const result = await translate({ inputCost: null, outputCost: null });

    expect(result.metrics.totalCost).toBe(0);
  });
});
