// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, test, vi } from 'vitest';
import type { AIConfiguration } from '@prisma/client';

vi.mock('../../../../db', () => ({
  default: {}
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

describe('AnthropicTranslationService max token limits', () => {
  test('clamps to configured output token limit', () => {
    const service = new AnthropicTranslationService(
      buildConfig({
        maxTokens: 70000
      })
    ) as any;
    const resolved = service.resolveMaxTokens('claude-haiku-4-5-20251001', 70000, 2048);

    expect(resolved).toBe(64000);
  });

  test('respects lower prompt config limit', () => {
    const service = new AnthropicTranslationService(buildConfig()) as any;
    const resolved = service.resolveMaxTokens('claude-haiku-4-5-20251001', 4096, 2048);

    expect(resolved).toBe(4096);
  });

  test('uses model spec output limit when config is missing', () => {
    const service = new AnthropicTranslationService(
      buildConfig({
        outputTokenLimit: null,
        maxTokens: null
      })
    ) as any;
    const resolved = service.resolveMaxTokens('claude-haiku-4-5-20251001', undefined, 2048);

    expect(resolved).toBe(64000);
  });

  test('falls back when no limits are available', () => {
    const service = new AnthropicTranslationService(
      buildConfig({
        model: 'unknown-model',
        outputTokenLimit: null,
        maxTokens: null
      })
    ) as any;
    const resolved = service.resolveMaxTokens('unknown-model', undefined, 2048);

    expect(resolved).toBe(2048);
  });
});
