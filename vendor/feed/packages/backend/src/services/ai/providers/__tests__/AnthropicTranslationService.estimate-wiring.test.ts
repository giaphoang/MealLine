// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * That Anthropic estimates against the prompt it is about to send.
 *
 * Every translation is gated by a limit check priced from a pre-flight
 * estimate. That estimate used to measure a hardcoded one-sentence stand-in
 * while the real prompt was built further down, inside the retry loop — so the
 * check ran on a number that had never described the request. Against this
 * deployment's own SystemPrompt rows it understated input by 2.8x to 3.5x
 * (ISSUES.md #84).
 *
 * This file exists because the argument that fixes it is **optional**. Drop it
 * from a provider and the code still typechecks, and every test in
 * `token/calculation` still passes, because the function stays correct while
 * nothing hands it the prompt any more. Only an assertion at the call site can
 * see that.
 *
 * The other two providers get the same assertion inside their `thinking-level`
 * suites, which already carry these mocks. Anthropic's four suites mock
 * neither the token module nor `TemplateEngine` — `claude5` and `adaptive`
 * deliberately run the real estimate — so adding it there would change what
 * those tests exercise. Hence a separate file rather than a fourth set of
 * mocks bolted onto an existing one.
 *
 * Not covered: that the prompt is resolved *once* rather than once per retry.
 * Hoisting it out of the retry loop is a real side benefit, but proving it
 * needs an error `isRetryableError` accepts, and that same error also drives
 * `translationRecovery.recoverStuckTranslations()`, plus a real one-second
 * backoff — a lot of machinery for a benefit that is not the fix. If a future
 * edit moves resolution back into the loop while leaving a copy above for the
 * estimate, the assertion below still holds and the duplication goes unseen.
 */

import { describe, expect, test, vi } from 'vitest';
import type { AIConfiguration } from '@prisma/client';

import { estimateInputTokensAndCost } from '../../../token';

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

vi.mock('../../../token', () => ({
  estimateInputTokensAndCost: vi.fn().mockReturnValue({ tokenCount: 10, cost: 0.0001 }),
  estimateOutputTokensAndCost: vi.fn().mockReturnValue({ tokenCount: 5, cost: 0.00005 })
}));

vi.mock('../../prompts/PromptBuilder', () => ({
  PromptBuilder: {
    getPromptConfiguration: vi.fn().mockResolvedValue({
      systemPrompt: 'Translate to {{targetLanguage}}',
      temperature: 0.7,
      topP: 1,
      maxTokens: 100,
      isCustom: false
    })
  }
}));

vi.mock('../../prompts/TemplateEngine', () => ({
  TemplateEngine: {
    substituteVariables: vi.fn().mockReturnValue('system')
  }
}));

import { AnthropicTranslationService } from '../AnthropicTranslationService';

const buildConfig = (overrides: Partial<AIConfiguration> = {}): AIConfiguration =>
  ({
    id: 1,
    name: 'Anthropic',
    type: 'apikey',
    value: '',
    description: null,
    serviceType: 'Anthropic',
    // Sonnet 5 refuses assistant prefill, so the service parses the whole JSON
    // object the mock returns. A prefilling model (Haiku 4.5) would have the
    // service prepend `{` to the reply, and a mock returning a complete object
    // then parses as `{{"translatedText"...`. This file is about estimate
    // wiring, so it picks the model that keeps parsing out of the way.
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
    maxTokens: 4096,
    inputTokenLimit: 200000,
    outputTokenLimit: 64000,
    dailyCostLimit: null,
    monthlyCostLimit: null,
    tokensPerMinute: null,
    requestsPerMinute: null,
    requestsPerDay: null,
    thinkingLevel: null,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }) as AIConfiguration;

describe('the Anthropic pre-flight estimate', () => {
  const translate = async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"translatedText": "Hola"}' }],
      usage: { input_tokens: 10, output_tokens: 5 }
    });
    const service = new AnthropicTranslationService(buildConfig()) as any;
    vi.spyOn(service, 'getAnthropicClient').mockResolvedValue({ messages: { create } });
    vi.mocked(estimateInputTokensAndCost).mockClear();
    await service.translateText({ text: 'Hello', targetLanguage: 'Spanish' });
  };

  test('is measured against the prompt that will actually be sent', async () => {
    await translate();

    // 'system' is what the mocked TemplateEngine returns above — that is, the
    // resolved prompt, not a stand-in assembled inside the estimate.
    expect(estimateInputTokensAndCost).toHaveBeenCalledWith(
      'Hello',
      'Spanish',
      expect.anything(),
      'system'
    );
  });

});
