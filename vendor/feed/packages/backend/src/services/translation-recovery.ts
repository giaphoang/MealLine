// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import prisma from '../db';

const STUCK_THRESHOLD_MS = 60000; // 1 minute
const BATCH_SIZE = 30; // Process in larger batches

export class TranslationRecovery {
  private isRunning = false;
  private lastRunTime = 0;
  private runInterval = 30000; // Run every 30 seconds

  /**
   * Checks for and attempts to recover stuck translations
   * Only makes one automatic retry attempt per translation
   * 
   * This is an event-driven method that should be called after translation processing
   * or when API errors are encountered
   */
  async recoverStuckTranslations() {
    // Prevent concurrent runs
    if (this.isRunning) {
      return { recovered: 0, message: 'Recovery already in progress' };
    }

    // Rate limit how often this can run
    const now = Date.now();
    if (now - this.lastRunTime < this.runInterval) {
      return { recovered: 0, message: 'Recovery ran too recently' };
    }

    this.isRunning = true;
    this.lastRunTime = now;

    try {
      // Find translations stuck in pending state for too long
      // that haven't already been retried
      const stuckTranslations = await prisma.translation.findMany({
        where: {
          status: 'pending',
          updatedAt: {
            lt: new Date(Date.now() - STUCK_THRESHOLD_MS)
          },
          metadata: {
            not: {
              contains: 'autoRetried'
            }
          }
        },
        take: BATCH_SIZE,
        orderBy: { createdAt: 'asc' }
      });

      if (stuckTranslations.length === 0) {
        this.isRunning = false;
        return { recovered: 0, message: 'No stuck translations found' };
      }

      console.log(`Found ${stuckTranslations.length} stuck translations, attempting one-time recovery`);

      // Mark these translations as having been auto-retried
      // This prevents multiple retry attempts
      await prisma.translation.updateMany({
        where: {
          id: {
            in: stuckTranslations.map(t => t.id)
          }
        },
        data: {
          metadata: { autoRetried: true, retryTime: new Date().toISOString() }
        }
      });

      // Note: Translation processing now handled by translation-trigger service
      // Stuck translations will be retried on next automatic processing cycle

      this.isRunning = false;
      return { 
        recovered: stuckTranslations.length, 
        message: `Recovered ${stuckTranslations.length} stuck translations` 
      };
    } catch (error) {
      console.error('Error in translation recovery:', error);
      this.isRunning = false;
      throw error;
    }
  }
}

// Export singleton instance
export const translationRecovery = new TranslationRecovery();
