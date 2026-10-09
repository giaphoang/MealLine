// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, test, vi } from 'vitest';
import type { BatchTranslationResult } from '../ai/base/AITranslationService';
import {
  __test__
} from '../translation-trigger';

const {
  getBatchSizeForContentType,
  groupQueueItemsByTypeAndLanguage,
  chunkItems,
  translateBatchWithFallback
} = __test__;

describe('TranslationTrigger batching helpers', () => {
  test('getBatchSizeForContentType returns expected sizes', () => {
    expect(getBatchSizeForContentType('FoodItem')).toBe(250);
    expect(getBatchSizeForContentType('Category')).toBe(250);
    expect(getBatchSizeForContentType('Custom')).toBe(15);
    expect(getBatchSizeForContentType('Generated')).toBe(1);
  });

  test('getBatchSizeForContentType throws for unknown types', () => {
    expect(() => getBatchSizeForContentType('Unknown' as any)).toThrow('Unsupported content type');
  });

  test('groupQueueItemsByTypeAndLanguage groups by content type + language', () => {
    const queueItems = [
      {
        contentId: 1,
        contentType: 'FoodItem' as const,
        field: 'name',
        originalText: 'Rice',
        targetLanguages: ['Spanish', 'French']
      },
      {
        contentId: 2,
        contentType: 'Category' as const,
        field: 'name',
        originalText: 'Beans',
        targetLanguages: ['Spanish']
      },
      {
        contentId: 3,
        contentType: 'FoodItem' as const,
        field: 'name',
        originalText: 'Apples',
        targetLanguages: ['Spanish']
      }
    ];

    const grouped = groupQueueItemsByTypeAndLanguage(queueItems);

    expect(grouped.size).toBe(3);
    expect(grouped.get('FoodItem:Spanish')?.items.map(item => item.originalText)).toEqual(['Rice', 'Apples']);
    expect(grouped.get('FoodItem:French')?.items.map(item => item.originalText)).toEqual(['Rice']);
    expect(grouped.get('Category:Spanish')?.items.map(item => item.originalText)).toEqual(['Beans']);
  });

  test('chunkItems splits arrays into expected sizes', () => {
    const chunks = chunkItems([1, 2, 3, 4, 5], 2);
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });

  test('translateBatchWithFallback splits on truncation and preserves order', async () => {
    const translate = vi.fn(async (items: Array<{ id: string; text: string }>): Promise<BatchTranslationResult> => {
      if (items.length > 2) {
        throw new Error('Translation response was truncated due to length');
      }

      return {
        translations: items.map(item => ({
          id: item.id,
          originalText: item.text,
          translatedText: `translated-${item.text}`
        })),
        metrics: {
          duration: 10,
          promptTokens: 1,
          completionTokens: 1,
          totalCost: 0.01
        }
      };
    });

    const items = [
      { id: '1', text: 'A' },
      { id: '2', text: 'B' },
      { id: '3', text: 'C' },
      { id: '4', text: 'D' }
    ];

    const results = await translateBatchWithFallback(
      items,
      translate,
      (error) => error instanceof Error && error.message.includes('truncated')
    );

    expect(translate.mock.calls.map(call => call[0].length)).toEqual([4, 2, 2]);
    expect(results.flatMap(result => result.translations.map(t => t.id))).toEqual(['1', '2', '3', '4']);
  });
});
