// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * What FEED sends a Claude 5 model so it thinks as little as the work needs.
 *
 * Adaptive thinking is on by default at effort `high`, and thinking is billed
 * as output — so on Opus 5 and Fable 5.1, at $25 and $50 per million, getting
 * this wrong is expensive on every request rather than visibly broken. Until
 * these models were catalogued, `resolveThinking` returned `{}` for every
 * model in existence and the whole branch was unreachable: the suite was green
 * and proved nothing about it.
 *
 * The three cases below were measured against the API on 2026-09-12:
 *
 *   claude-sonnet-5   thinking:{type:'disabled'}  -> OK
 *   claude-opus-5     thinking:{type:'disabled'}  -> OK
 *   claude-fable-5-1  thinking:{type:'disabled'}  -> 400 "not supported for
 *     this model. Use thinking.type.adaptive and output_config.effort"
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
    model: 'claude-sonnet-5',
    modelName: 'claude-sonnet-5',
    endpointUrl: '',
    encryptedApiKey: 'encrypted',
    salt: 'salt',
    inputCost: 2.0,
    outputCost: 10.0,
    unitPrice: 'per_1m',
    temperature: 0.7,
    topP: 1.0,
    maxTokens: 4096,
    inputTokenLimit: 1000000,
    outputTokenLimit: 128000,
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
    ...overrides,
  }) as AIConfiguration;

/** `resolveThinking` is private; these assertions are the reason it exists. */
const thinkingFor = (model: string, thinkingLevel: string | null = null) => {
  const service = new AnthropicTranslationService(
    buildConfig({ model, thinkingLevel } as Partial<AIConfiguration>)
  ) as any;
  return service.resolveThinking(model);
};

describe('what a Claude model is told about thinking', () => {
  test('a model that can switch thinking off has it switched off', () => {
    // D2 asks for off *or* the lowest level. Sending effort `low` instead
    // would still buy thinking tokens on every request; disabling buys none.
    expect(thinkingFor('claude-sonnet-5')).toEqual({ thinking: { type: 'disabled' } });
    expect(thinkingFor('claude-opus-5')).toEqual({ thinking: { type: 'disabled' } });
  });

  test('a model that cannot be switched off gets its cheapest effort instead', () => {
    // Fable 5.1 answers 400 to a disable and names the replacement parameters.
    expect(thinkingFor('claude-fable-5-1')).toEqual({ output_config: { effort: 'low' } });
  });

  test('an administrator’s chosen level wins over the default', () => {
    expect(thinkingFor('claude-sonnet-5', 'high')).toEqual({
      output_config: { effort: 'high' },
    });
    expect(thinkingFor('claude-fable-5-1', 'max')).toEqual({
      output_config: { effort: 'max' },
    });
  });

  test('a level the model refuses is substituted rather than sent', () => {
    // `minimal` belongs to OpenAI's 2025 snapshots and Gemini; Claude 5 has no
    // such level, so it falls back to the cheapest this model does accept.
    expect(thinkingFor('claude-sonnet-5', 'minimal')).toEqual({
      output_config: { effort: 'low' },
    });
  });

  test('the models FEED has always used are still sent nothing', () => {
    // Haiku 4.5 and the 4.5 line are `extended` — manual thinking, off unless
    // a budget is sent. Sending an effort there would be a 400.
    expect(thinkingFor('claude-haiku-4-5-20251001')).toEqual({});
    expect(thinkingFor('claude-sonnet-4-5-20250929')).toEqual({});
  });

  test('an uncatalogued Claude id is sent nothing', () => {
    // `capabilitiesFor` infers `extended` for anything it has not seen, which
    // is the conservative guess: no parameter is never a 400.
    expect(thinkingFor('claude-something-unreleased')).toEqual({});
  });
});

describe('the request Claude 5 actually receives', () => {
  const translate = async (model: string) => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"translatedText": "Hola"}' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const service = new AnthropicTranslationService(buildConfig({ model })) as any;
    vi.spyOn(service, 'getAnthropicClient').mockResolvedValue({ messages: { create } });
    await service.translateText({ text: 'Hello', targetLanguage: 'Spanish' });
    return create.mock.calls[0][0];
  };

  test('Sonnet 5 gets thinking disabled, no sampling, and no prefill', async () => {
    const request = await translate('claude-sonnet-5');

    expect(request.thinking).toEqual({ type: 'disabled' });
    expect(request).not.toHaveProperty('output_config');
    // The other two Claude 5 refusals, still holding.
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('top_p');
    expect(request.messages).toHaveLength(1);
  });

  test('save-time verification makes one minimal generation request', async () => {
    const create = vi.fn().mockResolvedValue({ content: [] });
    const service = new AnthropicTranslationService(buildConfig()) as any;
    vi.spyOn(service, 'getAnthropicClient').mockResolvedValue({ messages: { create } });

    await expect(service.verifyEntitlement()).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      model: 'claude-sonnet-5',
      max_tokens: 16,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: 'Reply with OK.' }]
    });
  });

  test('Fable 5.1 gets an effort instead, since it cannot be disabled', async () => {
    const request = await translate('claude-fable-5-1');

    expect(request.output_config).toEqual({ effort: 'low' });
    expect(request).not.toHaveProperty('thinking');
  });

  test('Haiku 4.5 is unchanged — no thinking parameter, and it keeps its prefill', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '"translatedText": "Hola"}' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const service = new AnthropicTranslationService(
      buildConfig({ model: 'claude-haiku-4-5-20251001' })
    ) as any;
    vi.spyOn(service, 'getAnthropicClient').mockResolvedValue({ messages: { create } });

    await service.translateText({ text: 'Hello', targetLanguage: 'Spanish' });
    const request = create.mock.calls[0][0];

    expect(request).not.toHaveProperty('thinking');
    expect(request).not.toHaveProperty('output_config');
    expect(request.temperature).toBe(0.7);
    expect(request.messages).toHaveLength(2);
  });
});
