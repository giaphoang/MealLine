// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AIConfiguration } from '@prisma/client';

import { estimateInputTokensAndCost } from '../../../token';

let OpenAITranslationService: typeof import('../OpenAITranslationService').OpenAITranslationService;

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

vi.mock('../../../token/calculation', () => ({
  convertToPerTokenRate: vi.fn().mockReturnValue(0)
}));

vi.mock('../../../token/usage-tracker', () => ({
  default: {
    logApiUsage: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../../encryption', () => ({
  decryptApiKey: vi.fn().mockResolvedValue('api-key')
}));

vi.mock('../../translation-recovery', () => ({
  translationRecovery: {
    recoverStuckTranslations: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../base/AITranslationService', () => ({
  AITranslationService: class {
    protected config: any;
    protected serviceType: string;
    constructor(config: any) {
      this.config = config;
      this.serviceType = config.serviceType;
    }
    protected shouldSkipTranslation() {
      return false;
    }
    protected createSkippedTranslationResult(text: string) {
      return {
        translatedText: text,
        metrics: {
          duration: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalCost: 0
        }
      };
    }
    protected async trackSuccessfulUsage() {
      return;
    }
    protected getModel() {
      if (!this.config.model) {
        throw new Error('AI model not configured');
      }
      return this.config.model;
    }
  }
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

const buildConfig = (overrides: Partial<AIConfiguration> = {}): AIConfiguration =>
  ({
    id: 1,
    name: 'OpenAI',
    type: 'apikey',
    value: '',
    description: null,
    serviceType: 'OpenAI',
    model: 'gpt-5-2025-08-07',
    modelName: 'gpt-5',
    endpointUrl: '',
    encryptedApiKey: 'encrypted',
    inputCost: 1,
    outputCost: 2,
    unitPrice: 'per_1m',
    temperature: 0.7,
    topP: 1,
    maxTokens: 100,
    inputTokenLimit: null,
    outputTokenLimit: null,
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
    salt: 'salt',
    ...overrides
  }) as AIConfiguration;

describe('OpenAITranslationService thinking level', () => {
  beforeEach(async () => {
    OpenAITranslationService = (await import('../OpenAITranslationService')).OpenAITranslationService;
  });

  test('uses config thinking level when provided for GPT-5', () => {
    const service = new OpenAITranslationService(buildConfig()) as any;
    const result = service.checkAndOverrideParameters('gpt-5-2025-08-07', 1, 1, 'high');

    expect(result.reasoningEffort).toBe('high');
  });

  test('save-time verification makes one minimal generation request', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [] });
    const service = new OpenAITranslationService(buildConfig()) as any;
    vi.spyOn(service, 'getOpenAIClient').mockResolvedValue({
      chat: { completions: { create } }
    });

    await expect(service.verifyEntitlement()).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      model: 'gpt-5-2025-08-07',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_completion_tokens: 16
    });
  });

  test('falls back to model default when config is null', () => {
    const service = new OpenAITranslationService(buildConfig()) as any;
    const result = service.checkAndOverrideParameters('gpt-5-nano-2025-08-07', 1, 1, null);

    expect(result.reasoningEffort).toBe('minimal');
  });

  test('an id the catalogue has never seen falls back to low', () => {
    // This needed a hand-mocked spec to exist at all. It does not any more:
    // `gpt-5-custom` is exactly the Custom-field case `capabilitiesFor`
    // handles, and `low` — not `minimal` — is deliberate. `minimal` is valid
    // on the 2025-08-07 snapshots and refused by gpt-5.6-luna, so a guess
    // about an unrecognised id may only offer what the whole family accepts.
    const service = new OpenAITranslationService(buildConfig()) as any;

    const result = service.checkAndOverrideParameters('gpt-5-custom', 1, 1, null);

    expect(result.reasoningEffort).toBe('low');
  });

  test('ignores thinking level for non-GPT-5 models', () => {
    const service = new OpenAITranslationService(buildConfig()) as any;
    const result = service.checkAndOverrideParameters('gpt-4o-mini-2024-07-18', 1, 1, 'low');

    expect(result.reasoningEffort).toBeUndefined();
  });

  test('includes reasoning_effort for GPT-5 API calls', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ translatedText: 'Hola' }) }
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    });
    const service = new OpenAITranslationService(
      buildConfig({ thinkingLevel: 'minimal' })
    ) as any;
    vi.spyOn(service, 'getOpenAIClient').mockResolvedValue({
      chat: { completions: { create } }
    });

    await service.translateText({ text: 'Hello', targetLanguage: 'Spanish' });

    const request = create.mock.calls[0][0];
    expect(request.reasoning_effort).toBe('minimal');
  });

  test('omits reasoning_effort for non-GPT-5 API calls', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ translatedText: 'Hola' }) }
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    });
    const service = new OpenAITranslationService(
      buildConfig({
        model: 'gpt-4o-mini-2024-07-18',
        modelName: 'gpt-4o-mini',
        thinkingLevel: 'high'
      })
    ) as any;
    vi.spyOn(service, 'getOpenAIClient').mockResolvedValue({
      chat: { completions: { create } }
    });

    await service.translateText({ text: 'Hello', targetLanguage: 'Spanish' });

    const request = create.mock.calls[0][0];
    expect(request.reasoning_effort).toBeUndefined();
  });

  test('estimates against the prompt it is about to send', async () => {
    // The estimate feeds the pre-flight limit check. It used to measure a
    // hardcoded stand-in sentence while the real prompt was built further
    // down, inside the retry loop — understating input by 2.8x to 3.5x
    // against real SystemPrompt rows (ISSUES.md #84).
    //
    // This assertion guards the wiring rather than the arithmetic. Without it
    // the hoist could be undone and every test in token/calculation would
    // still pass, because the function would remain correct while nothing
    // handed it the prompt any more.
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ translatedText: 'Hola' }) }
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    });
    const service = new OpenAITranslationService(buildConfig()) as any;
    vi.spyOn(service, 'getOpenAIClient').mockResolvedValue({
      chat: { completions: { create } }
    });
    vi.mocked(estimateInputTokensAndCost).mockClear();

    await service.translateText({ text: 'Hello', targetLanguage: 'Spanish' });

    // 'system' is what the mocked TemplateEngine returns above.
    expect(estimateInputTokensAndCost).toHaveBeenCalledWith(
      'Hello',
      'Spanish',
      expect.anything(),
      'system'
    );
  });
});
