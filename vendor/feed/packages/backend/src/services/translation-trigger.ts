// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { EventEmitter } from 'events';
import { AIServiceFactory } from './ai/factory/AIServiceFactory';
import { alertService } from './alerts';
import prisma from '../db';
import type { TranslationContext, BatchTranslationResult } from './ai/base/AITranslationService';

export type QueueContentType = 'FoodItem' | 'Category' | 'Custom' | 'Generated';

interface TranslationQueueItem {
  contentId: number;
  contentType: QueueContentType;
  field: string;
  originalText: string;
  targetLanguages: string[];
}

interface BatchQueueItem {
  contentId: number;
  contentType: QueueContentType;
  field: string;
  originalText: string;
  language: string;
}

interface BatchGroup {
  contentType: QueueContentType;
  language: string;
  items: BatchQueueItem[];
}

const BATCH_SIZES: Record<QueueContentType, number> = {
  FoodItem: 250,
  Category: 250,
  Custom: 15,
  Generated: 1
};

const getContextForContentType = (contentType: QueueContentType): TranslationContext => {
  switch (contentType) {
    case 'FoodItem':
    case 'Category':
      return 'food';
    case 'Custom':
      return 'custom';
    case 'Generated':
      return 'document';
    default:
      return 'custom';
  }
};

const getBatchSizeForContentType = (contentType: QueueContentType): number => {
  const size = BATCH_SIZES[contentType];
  if (!size) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }
  return size;
};

const groupQueueItemsByTypeAndLanguage = (
  queueItems: TranslationQueueItem[]
): Map<string, BatchGroup> => {
  const grouped = new Map<string, BatchGroup>();

  for (const item of queueItems) {
    for (const language of item.targetLanguages) {
      const key = `${item.contentType}:${language}`;
      const existing = grouped.get(key);
      const batchItem: BatchQueueItem = {
        contentId: item.contentId,
        contentType: item.contentType,
        field: item.field,
        originalText: item.originalText,
        language
      };

      if (existing) {
        existing.items.push(batchItem);
      } else {
        grouped.set(key, {
          contentType: item.contentType,
          language,
          items: [batchItem]
        });
      }
    }
  }

  return grouped;
};

const chunkItems = <T>(items: T[], chunkSize: number): T[][] => {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
};

const isTruncationError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('max_tokens') || message.includes('truncated');
};

const translateBatchWithFallback = async (
  items: Array<{ id: string; text: string; instructions?: string }>,
  translate: (items: Array<{ id: string; text: string; instructions?: string }>) => Promise<BatchTranslationResult>,
  shouldSplit: (error: unknown) => boolean
): Promise<BatchTranslationResult[]> => {
  try {
    const result = await translate(items);
    return [result];
  } catch (error) {
    if (!shouldSplit(error) || items.length <= 1) {
      throw error;
    }

    const midpoint = Math.ceil(items.length / 2);
    const first = items.slice(0, midpoint);
    const second = items.slice(midpoint);
    const firstResults = await translateBatchWithFallback(first, translate, shouldSplit);
    const secondResults = await translateBatchWithFallback(second, translate, shouldSplit);
    return [...firstResults, ...secondResults];
  }
};

class TranslationTriggerService {
  private queue: TranslationQueueItem[] = [];
  private isProcessing = false;

  async queueContentTranslation(
    contentId: number,
    contentType: QueueContentType,
    field: string,
    originalText: string
  ) {
    try {
      const enabledLanguages = await prisma.language.findMany({
        where: { 
          isEnabled: true,
          name: { not: { in: ['English'] } }
        },
        select: { name: true }
      });

      if (enabledLanguages.length === 0) {
        console.log('No enabled languages found for translation');
        return;
      }

      await this.queueBulkTranslations(
        [
          {
            contentId,
            contentType,
            field,
            originalText
          }
        ],
        enabledLanguages.map(lang => lang.name)
      );
    } catch (error) {
      console.error('Error queuing translation:', error);
      await alertService.createAlert('error', 'Failed to queue content for translation');
    }
  }

  async queueBulkTranslations(
    items: Array<Omit<TranslationQueueItem, 'targetLanguages'>>,
    targetLanguages: string[]
  ) {
    for (const item of items) {
      this.queue.push({
        ...item,
        targetLanguages
      });
    }

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const queueItems = this.queue.splice(0, this.queue.length);
        const grouped = groupQueueItemsByTypeAndLanguage(queueItems);

        for (const group of grouped.values()) {
          await this.processBatchGroup(group);
        }
      }
    } catch (error) {
      console.error('Error processing translation queue:', error);
      await alertService.createAlert('error', 'Failed to process translation queue');
    } finally {
      this.isProcessing = false;
    }
  }

  private async processBatchGroup(group: BatchGroup) {
    const chunkSize = getBatchSizeForContentType(group.contentType);
    const chunks = chunkItems(group.items, chunkSize);
    const context = getContextForContentType(group.contentType);

    for (const chunk of chunks) {
      let pendingTranslations: Awaited<ReturnType<typeof this.prepareBatchTranslations>> | null = null;
      try {
        pendingTranslations = await this.prepareBatchTranslations(group, chunk);

        if (pendingTranslations.requestItems.length === 0) {
          continue;
        }

        const aiService = await AIServiceFactory.createService();

        const batchResults = await translateBatchWithFallback(
          pendingTranslations.requestItems,
          (items) =>
            aiService.translateTextBatch({
              texts: items,
              targetLanguage: group.language,
              context
            }),
          isTruncationError
        );

        for (const result of batchResults) {
          await this.applyBatchResults(group, result, pendingTranslations.translationTargets);
        }
      } catch (error) {
        console.error(`Batch translation failed for ${group.contentType} ${group.language}:`, error);
        const failedTexts = pendingTranslations?.requestItems.map(item => item.text) ?? [];
        await this.markBatchFailed(group, failedTexts, error);
      }
    }
  }

  private async prepareBatchTranslations(
    group: BatchGroup,
    chunk: BatchQueueItem[]
  ): Promise<{
    requestItems: Array<{ id: string; text: string }>;
    translationTargets: Map<number, BatchQueueItem[]>;
  }> {
    const texts = [...new Set(chunk.map(item => item.originalText))];

    const existingTranslations = await prisma.translation.findMany({
      where: {
        originalText: { in: texts },
        language: group.language,
        type: group.contentType
      }
    });

    const existingByText = new Map(existingTranslations.map(translation => [translation.originalText, translation]));
    const itemsByText = new Map<string, BatchQueueItem[]>();
    for (const item of chunk) {
      const existing = itemsByText.get(item.originalText);
      if (existing) {
        existing.push(item);
      } else {
        itemsByText.set(item.originalText, [item]);
      }
    }

    const requestItems: Array<{ id: string; text: string }> = [];
    const translationTargets = new Map<number, BatchQueueItem[]>();

    for (const [text, items] of itemsByText.entries()) {
      const existingTranslation = existingByText.get(text);

      if (existingTranslation && existingTranslation.status !== 'failed') {
        continue;
      }

      const translation = await prisma.translation.upsert({
        where: {
          translation_unique_combo: {
            originalText: text,
            language: group.language,
            type: group.contentType
          }
        },
        create: {
          originalText: text,
          language: group.language,
          type: group.contentType,
          status: 'pending'
        },
        update: {
          status: 'pending',
          translatedText: null
        }
      });

      requestItems.push({
        id: translation.id.toString(),
        text
      });
      translationTargets.set(translation.id, items);
    }

    return { requestItems, translationTargets };
  }

  private async applyBatchResults(
    group: BatchGroup,
    result: BatchTranslationResult,
    translationTargets: Map<number, BatchQueueItem[]>
  ) {
    const completedIds: number[] = [];

    for (const translation of result.translations) {
      const translationId = Number(translation.id);
      if (!Number.isFinite(translationId)) {
        continue;
      }

      await prisma.translation.update({
        where: { id: translationId },
        data: {
          translatedText: translation.translatedText,
          status: 'completed'
        }
      });

      completedIds.push(translationId);

      const targets = translationTargets.get(translationId);
      if (!targets) continue;

      for (const target of targets) {
        if (group.contentType === 'FoodItem') {
          await prisma.foodItemTranslation.upsert({
            where: {
              foodItemId_language: {
                foodItemId: target.contentId,
                language: group.language
              }
            },
            create: {
              foodItemId: target.contentId,
              language: group.language,
              name: translation.translatedText
            },
            update: {
              name: translation.translatedText
            }
          });
        } else if (group.contentType === 'Category') {
          await prisma.categoryTranslation.upsert({
            where: {
              categoryId_language: {
                categoryId: target.contentId,
                language: group.language
              }
            },
            create: {
              categoryId: target.contentId,
              language: group.language,
              name: translation.translatedText
            },
            update: {
              name: translation.translatedText
            }
          });
        }
      }
    }

    if (completedIds.length > 0) {
      await alertService.checkResponseTime(result.metrics.duration);
    }
  }

  private async markBatchFailed(group: BatchGroup, texts: string[], error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Translation failed';
    const uniqueTexts = [...new Set(texts)];

    if (uniqueTexts.length === 0) {
      return;
    }

    await Promise.all(
      uniqueTexts.map((text) =>
        prisma.translation.upsert({
          where: {
            translation_unique_combo: {
              originalText: text,
              language: group.language,
              type: group.contentType
            }
          },
          create: {
            originalText: text,
            language: group.language,
            type: group.contentType,
            status: 'failed',
            translatedText: errorMessage
          },
          update: {
            status: 'failed',
            translatedText: errorMessage
          }
        })
      )
    );

    await alertService.createAlert(
      'warning',
      `Some translations failed. ${group.contentType} (${group.language})`
    );
  }
}

export const translationTriggerService = new TranslationTriggerService();

export const __test__ = {
  getBatchSizeForContentType,
  groupQueueItemsByTypeAndLanguage,
  chunkItems,
  translateBatchWithFallback
};
