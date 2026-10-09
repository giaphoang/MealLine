// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { PrismaClient, FormattingChoice } from '@prisma/client';
import { createHash } from 'crypto';

interface CachedChoice {
  originalText: string;
  classificationAction: 'skip' | 'include' | 'normal';
  confidence?: number;
}

interface ManualFormattingChoice {
  originalText: string;
  classificationAction: 'skip' | 'include' | 'normal';
}

interface EnhancedCacheStats {
  promptId: number;
  promptName: string;
  cachedChoicesCount: number;
  manualChoicesCount: number;
  aiChoicesCount: number;
  uniqueTextsCount: number;
  cacheHitRate: number;
  estimatedApiCallsSaved: number;
}

interface CacheStats {
  promptId: number;
  promptName: string;
  cachedChoicesCount: number;
  uniqueTextsCount: number;
  cacheHitRate: number;
  estimatedApiCallsSaved: number;
}

interface ClearCacheResult {
  message: string;
  clearedCount: number;
  promptName: string;
}

class FormattingChoiceService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Generates a hash for text for faster lookups
   */
  private generateTextHash(text: string): string {
    return createHash('sha256').update(text.trim().toLowerCase()).digest('hex').substring(0, 16);
  }

  /**
   * Finds cached formatting choices with source precedence (manual first, then AI)
   */
  async findCachedChoicesWithPrecedence(
    texts: string[], 
    systemPromptId: number
  ): Promise<CachedChoice[]> {
    if (texts.length === 0) return [];

    // Query for manual entries first
    const manualChoices = await this.prisma.formattingChoice.findMany({
      where: {
        originalText: { in: texts },
        systemPromptId,
        source: 'manual'
      },
      select: {
        originalText: true,
        classificationAction: true,
        confidence: true
      }
    });
    
    // Get remaining texts not covered by manual choices
    const manualTexts = new Set(manualChoices.map(c => c.originalText));
    const remainingTexts = texts.filter(t => !manualTexts.has(t));
    
    // Query AI choices for remaining texts
    const aiChoices = await this.prisma.formattingChoice.findMany({
      where: {
        originalText: { in: remainingTexts },
        systemPromptId,
        source: 'ai'
      },
      select: {
        originalText: true,
        classificationAction: true,
        confidence: true
      }
    });
    
    const allChoices = [...manualChoices, ...aiChoices];
    return allChoices.map(choice => ({
      originalText: choice.originalText,
      classificationAction: choice.classificationAction as 'skip' | 'include' | 'normal',
      confidence: choice.confidence || undefined
    }));
  }

  /**
   * Finds cached formatting choices for given texts and system prompt (backward compatibility)
   */
  async findCachedChoices(texts: string[], systemPromptId: number): Promise<CachedChoice[]> {
    return this.findCachedChoicesWithPrecedence(texts, systemPromptId);
  }

  /**
   * Finds cached choices by text hash for faster lookups
   */
  async findCachedChoicesByHash(textHashes: string[], systemPromptId: number): Promise<CachedChoice[]> {
    if (textHashes.length === 0) return [];

    const choices = await this.prisma.formattingChoice.findMany({
      where: {
        textHash: { in: textHashes },
        systemPromptId
      },
      select: {
        originalText: true,
        classificationAction: true,
        confidence: true
      }
    });

    return choices.map(choice => ({
      originalText: choice.originalText,
      classificationAction: choice.classificationAction as 'skip' | 'include' | 'normal',
      confidence: choice.confidence || undefined
    }));
  }

  /**
   * Saves manual formatting choices (overrides existing entries)
   */
  async saveManualChoices(
    choices: ManualFormattingChoice[],
    systemPromptId: number,
    documentId?: number
  ): Promise<void> {
    if (choices.length === 0) return;

    // Upsert manual choices, overwriting existing entries
    for (const choice of choices) {
      await this.prisma.formattingChoice.upsert({
        where: {
          originalText_systemPromptId: {
            originalText: choice.originalText,
            systemPromptId
          }
        },
        update: {
          classificationAction: choice.classificationAction,
          source: 'manual',
          updatedAt: new Date()
        },
        create: {
          originalText: choice.originalText,
          classificationAction: choice.classificationAction,
          source: 'manual',
          textHash: this.generateTextHash(choice.originalText),
          systemPromptId,
          documentId: documentId || null
        }
      });
    }
  }

  /**
   * Caches a batch of formatting choices
   * SQLite-compatible implementation with manual duplicate filtering
   */
  async cacheBatchChoices(
    choices: CachedChoice[], 
    systemPromptId: number, 
    documentId?: number
  ): Promise<void> {
    if (choices.length === 0) return;

    // Query existing records to identify duplicates
    const existingChoices = await this.prisma.formattingChoice.findMany({
      where: {
        originalText: { in: choices.map(c => c.originalText) },
        systemPromptId
      },
      select: {
        originalText: true
      }
    });

    // Create a set of existing texts for efficient lookup
    const existingTexts = new Set(existingChoices.map(choice => choice.originalText));

    // Filter out duplicates from the input choices
    const newChoices = choices.filter(choice => !existingTexts.has(choice.originalText));

    // If no new choices to insert, return early
    if (newChoices.length === 0) return;

    // Prepare cache entries for new choices only (default to AI source)
    const cacheEntries = newChoices.map(choice => ({
      originalText: choice.originalText,
      classificationAction: choice.classificationAction,
      confidence: choice.confidence,
      textHash: this.generateTextHash(choice.originalText),
      systemPromptId,
      documentId: documentId || null,
      source: 'ai'
    }));

    try {
      // Use createMany without skipDuplicates for SQLite compatibility
      await this.prisma.formattingChoice.createMany({
        data: cacheEntries
      });
    } catch (error) {
      console.error('Failed to cache formatting choices:', error);
      throw new Error('Failed to save formatting choices to cache');
    }
  }

  /**
   * Gets enhanced cache statistics with source breakdown
   */
  async getEnhancedCacheStats(systemPromptId: number): Promise<EnhancedCacheStats> {
    // Get the system prompt name
    const prompt = await this.prisma.systemPrompt.findUnique({
      where: { id: systemPromptId },
      select: { name: true }
    });

    if (!prompt) {
      throw new Error('System prompt not found');
    }

    // Get manual choices count
    const manualChoicesCount = await this.prisma.formattingChoice.count({
      where: { systemPromptId, source: 'manual' }
    });

    // Get AI choices count
    const aiChoicesCount = await this.prisma.formattingChoice.count({
      where: { systemPromptId, source: 'ai' }
    });

    const cachedChoicesCount = manualChoicesCount + aiChoicesCount;
    const uniqueTextsCount = cachedChoicesCount;
    
    // Calculate cache effectiveness metrics
    const estimatedTotalRequests = Math.max(cachedChoicesCount + Math.floor(cachedChoicesCount * 0.3), 1);
    const cacheHitRate = (cachedChoicesCount / estimatedTotalRequests) * 100;
    const estimatedApiCallsSaved = Math.floor(cachedChoicesCount * 0.8);

    return {
      promptId: systemPromptId,
      promptName: prompt.name,
      cachedChoicesCount,
      manualChoicesCount,
      aiChoicesCount,
      uniqueTextsCount,
      cacheHitRate: Math.round(cacheHitRate * 10) / 10,
      estimatedApiCallsSaved
    };
  }

  /**
   * Gets cache statistics for a system prompt (backward compatibility)
   */
  async getCacheStats(systemPromptId: number): Promise<CacheStats> {
    const enhanced = await this.getEnhancedCacheStats(systemPromptId);
    return {
      promptId: enhanced.promptId,
      promptName: enhanced.promptName,
      cachedChoicesCount: enhanced.cachedChoicesCount,
      uniqueTextsCount: enhanced.uniqueTextsCount,
      cacheHitRate: enhanced.cacheHitRate,
      estimatedApiCallsSaved: enhanced.estimatedApiCallsSaved
    };
  }

  /**
   * Clears all cached formatting choices for a system prompt
   */
  async clearCache(systemPromptId: number): Promise<ClearCacheResult> {
    // Get the system prompt name and count before deletion
    const prompt = await this.prisma.systemPrompt.findUnique({
      where: { id: systemPromptId },
      select: { name: true }
    });

    if (!prompt) {
      throw new Error('System prompt not found');
    }

    // Count entries before deletion
    const cachedCount = await this.prisma.formattingChoice.count({
      where: { systemPromptId }
    });

    // Delete all cached choices for this prompt
    await this.prisma.formattingChoice.deleteMany({
      where: { systemPromptId }
    });

    return {
      message: `Successfully cleared ${cachedCount} cached formatting choices for "${prompt.name}"`,
      clearedCount: cachedCount,
      promptName: prompt.name
    };
  }

  /**
   * Gets all cached choices for a system prompt (for debugging/admin purposes)
   */
  async getAllCachedChoices(systemPromptId: number): Promise<FormattingChoice[]> {
    return this.prisma.formattingChoice.findMany({
      where: { systemPromptId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Deletes specific cached choices by text
   */
  async deleteCachedChoices(texts: string[], systemPromptId: number): Promise<number> {
    const result = await this.prisma.formattingChoice.deleteMany({
      where: {
        originalText: { in: texts },
        systemPromptId
      }
    });

    return result.count;
  }

  /**
   * Updates a cached choice
   */
  async updateCachedChoice(
    originalText: string,
    systemPromptId: number,
    classificationAction: 'skip' | 'include' | 'normal',
    confidence?: number
  ): Promise<FormattingChoice> {
    return this.prisma.formattingChoice.update({
      where: {
        originalText_systemPromptId: {
          originalText,
          systemPromptId
        }
      },
      data: {
        classificationAction,
        confidence,
        textHash: this.generateTextHash(originalText)
      }
    });
  }
}

export default FormattingChoiceService;
export type { ManualFormattingChoice, EnhancedCacheStats };