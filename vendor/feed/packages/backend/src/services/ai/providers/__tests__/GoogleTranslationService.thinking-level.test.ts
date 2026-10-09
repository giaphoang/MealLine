// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AIConfiguration } from '@prisma/client';
import type { ThinkingConfig } from '@google/genai';

import { estimateInputTokensAndCost } from '../../../token';

let GoogleTranslationService: typeof import('../GoogleTranslationService').GoogleTranslationService;

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

vi.mock('../../../token/usage-tracker', () => ({
  default: {
    logApiUsage: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../../encryption', () => ({
  decryptApiKey: vi.fn().mockResolvedValue('api-key')
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
      temperature: 1,
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
    name: 'Gemini',
    type: 'apikey',
    value: '',
    description: null,
    serviceType: 'Google',
    model: 'gemini-3-flash-preview',
    modelName: 'gemini-3-flash-preview',
    endpointUrl: '',
    encryptedApiKey: 'encrypted',
    inputCost: 0.1,
    outputCost: 0.2,
    unitPrice: 'per_1m',
    temperature: 1,
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

describe('GoogleTranslationService thinking level', () => {
  // These cases used to run against a hand-mocked `getModelSpecByModel`. The
  // mock had drifted into fiction — it returned `modelFamily: 'gemini-2.5'`,
  // which is not a member of the `ModelSpec` union at all — so the assertions
  // were checking behaviour against a spec shape that could never exist. They
  // now run against the real catalogue, and `gemini-3-custom` exercises the
  // documented fallback for an id the catalogue has never seen.
  beforeEach(async () => {
    GoogleTranslationService = (await import('../GoogleTranslationService')).GoogleTranslationService;
  });

  test('save-time verification makes one minimal generation request', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: 'OK' });
    const service = new GoogleTranslationService(buildConfig()) as any;
    vi.spyOn(service, 'getGoogleClient').mockResolvedValue({ models: { generateContent } });

    await expect(service.verifyEntitlement()).resolves.toEqual({ ok: true });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0]).toMatchObject({
      model: 'gemini-3-flash-preview',
      contents: 'Reply with OK.',
      config: {
        maxOutputTokens: 64,
        thinkingConfig: { thinkingLevel: 'minimal' }
      }
    });
  });

  test('uses config thinking level when provided', () => {
    const service = new GoogleTranslationService(buildConfig()) as any;
    const result = service.checkAndOverrideParameters('gemini-3-flash-preview', 1, 1, 'low');

    expect(result.thinkingLevel).toBe('low');
  });

  test('falls back to the cheapest level the model accepts when config is null', () => {
    // Was `low`, from a hand-written spec default. The catalogue records that
    // Gemini 3 Flash accepts `minimal`, and thinking is billed as output that
    // translation gains nothing from, so the unset default is now the cheapest
    // value the model actually takes. Gemini 3 Pro, which has no `minimal`,
    // still falls to `low` — see the test below.
    const service = new GoogleTranslationService(buildConfig()) as any;
    const result = service.checkAndOverrideParameters('gemini-3-flash-preview', 1, 1, null);

    expect(result.thinkingLevel).toBe('minimal');
  });

  test('falls back to low when no model default is provided', () => {
    const service = new GoogleTranslationService(buildConfig()) as any;
    const result = service.checkAndOverrideParameters('gemini-3-custom', 1, 1, null);

    expect(result.thinkingLevel).toBe('low');
  });

  test('accepts all thinking levels for Gemini 3 Flash', () => {
    const service = new GoogleTranslationService(buildConfig()) as any;
    const result = service.checkAndOverrideParameters('gemini-3-flash-preview', 1, 1, 'minimal');

    expect(result.thinkingLevel).toBe('minimal');
    expect(result.warnings).toHaveLength(0);
  });

  test('warns and falls back for unsupported Gemini 3 Pro levels', () => {
    const service = new GoogleTranslationService(buildConfig({ model: 'gemini-3-pro-preview' })) as any;
    const result = service.checkAndOverrideParameters('gemini-3-pro-preview', 1, 1, 'medium');

    expect(result.thinkingLevel).toBe('low');
    expect(result.warnings[0]).toContain('medium');
    expect(result.warnings[0]).toContain('low');
  });

  test('ignores thinking level for non-Gemini 3 models', () => {
    const service = new GoogleTranslationService(buildConfig({ model: 'gemini-2.5-flash' })) as any;
    const result = service.checkAndOverrideParameters('gemini-2.5-flash', 1, 1, 'low');

    expect(result.thinkingLevel).toBeUndefined();
  });

  test('includes thinkingConfig for Gemini 3 requests', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({ translatedText: 'Hola' })
    });
    const service = new GoogleTranslationService(buildConfig({ thinkingLevel: 'minimal' })) as any;
    vi.spyOn(service, 'getGoogleClient').mockResolvedValue({
      models: { generateContent }
    });

    await service.translateText({ text: 'Hello', targetLanguage: 'Spanish' });

    const request = generateContent.mock.calls[0][0];
    // `thinkingLevel`, camelCase, is the JS SDK's field name. This asserted
    // `thinking_level` and passed for months while the level never reached
    // Google at all: `@google/genai` 1.11 copied only `includeThoughts` and
    // `thinkingBudget` out of `thinkingConfig` and dropped everything else,
    // silently. A test written against FEED's own request object cannot see
    // that, which is what the type assertion below is for (ISSUES.md #84).
    expect(request.config.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
  });

  test('the SDK in use actually carries thinkingLevel', () => {
    // The guard the previous test cannot be: if a future SDK renames or drops
    // this field, FEED would go back to sending a value the client discards
    // and nothing else would notice.
    const config: ThinkingConfig = { thinkingLevel: 'minimal' as ThinkingConfig['thinkingLevel'] };
    expect(config.thinkingLevel).toBe('minimal');
  });

  test('omits thinkingConfig for non-Gemini 3 models', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({ translatedText: 'Hola' })
    });
    const service = new GoogleTranslationService(
      buildConfig({ model: 'gemini-2.5-flash', thinkingLevel: 'low' })
    ) as any;
    vi.spyOn(service, 'getGoogleClient').mockResolvedValue({
      models: { generateContent }
    });

    await service.translateText({ text: 'Hello', targetLanguage: 'Spanish' });

    const request = generateContent.mock.calls[0][0];
    expect(request.config.thinkingConfig).toBeUndefined();
  });

  test('estimates against the prompt it is about to send', async () => {
    // The estimate feeds the pre-flight limit check. It used to measure a
    // hardcoded stand-in sentence while the real prompt was built further
    // down, inside the retry loop — understating input by 2.8x to 3.5x
    // against real SystemPrompt rows (ISSUES.md #84).
    //
    // This guards the wiring, not the arithmetic. The prompt argument is
    // optional, so dropping it here would still typecheck and every test in
    // token/calculation would still pass.
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({ translatedText: 'Hola' })
    });
    const service = new GoogleTranslationService(buildConfig()) as any;
    vi.spyOn(service, 'getGoogleClient').mockResolvedValue({
      models: { generateContent }
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
