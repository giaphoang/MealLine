// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AIConfiguration, SystemPrompt } from '@prisma/client';

const mockDb = vi.hoisted(() => ({
  systemPrompt: {
    findFirst: vi.fn()
  }
}));

vi.mock('../../../../db', () => ({
  default: mockDb
}));

import { PromptBuilder } from '../PromptBuilder';

const buildConfig = (): AIConfiguration =>
  ({
    id: 42,
    name: 'Anthropic Config',
    type: 'apikey',
    value: '',
    description: null,
    serviceType: 'Anthropic',
    model: 'claude-haiku-4-5-20251001',
    modelName: 'claude-haiku-4.5',
    endpointUrl: null,
    encryptedApiKey: 'encrypted',
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
    tokensPerMinute: 50000,
    requestsPerMinute: 50,
    requestsPerDay: null,
    thinkingLevel: null,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    salt: 'salt'
  }) as AIConfiguration;

const buildPrompt = (overrides: Partial<SystemPrompt>): SystemPrompt =>
  ({
    id: 1,
    name: 'Prompt',
    promptType: 'FOOD_TRANSLATION',
    isActive: true,
    isDefault: false,
    description: null,
    serviceDescription: 'Specialized food inventory translator.',
    translationApproach: 'the closest natural equivalent',
    contextGuidance: 'In a food pantry context.',
    additionalGuidance: 'Do not add commentary.',
    skipTranslation: null,
    includeEnglish: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    includeEnglishThreshold: 0.7,
    skipTranslationThreshold: 0.7,
    temperature: 0.4,
    topP: 1.0,
    rememberFormattingChoices: true,
    ...overrides
  }) as SystemPrompt;

describe('PromptBuilder batch translation context selection', () => {
  beforeEach(() => {
    mockDb.systemPrompt.findFirst.mockReset();
    PromptBuilder.clearCache();
  });

  test('uses FOOD_TRANSLATION prompt data with batch translation template for food context', async () => {
    const foodPrompt = buildPrompt({ promptType: 'FOOD_TRANSLATION' });

    mockDb.systemPrompt.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.promptType === 'FOOD_TRANSLATION') {
        return foodPrompt;
      }
      return null;
    });

    const result = await PromptBuilder.getPromptConfiguration(buildConfig(), 'batch_translation', 'food');

    expect(mockDb.systemPrompt.findFirst).toHaveBeenCalledWith({
      where: {
        promptType: 'FOOD_TRANSLATION',
        isActive: true
      }
    });
    expect(result.systemPrompt).toContain('Return valid JSON with an array of translations');
    expect(result.systemPrompt).toContain('Specialized food inventory translator.');
    expect(result.systemPrompt).toContain('Translate each text segment to {{targetLanguage}}');
  });

  test('uses BATCH_TRANSLATION prompt data for document context', async () => {
    const batchPrompt = buildPrompt({
      promptType: 'BATCH_TRANSLATION',
      serviceDescription: 'Document translator.'
    });

    mockDb.systemPrompt.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.promptType === 'BATCH_TRANSLATION') {
        return batchPrompt;
      }
      return null;
    });

    const result = await PromptBuilder.getPromptConfiguration(buildConfig(), 'batch_translation', 'document');

    expect(mockDb.systemPrompt.findFirst).toHaveBeenCalledWith({
      where: {
        promptType: 'BATCH_TRANSLATION',
        isActive: true
      }
    });
    expect(result.systemPrompt).toContain('Document translator.');
  });
});
