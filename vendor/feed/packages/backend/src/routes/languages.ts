// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import {
  validateLanguageName,
  validateBulkUpdate,
  formatBulkUpdateMessage,
  BulkUpdateLanguageState,
  BulkUpdateResult
} from '../utils/languageUtils';

import { translationAuditor } from '../services/translation-auditor';
import prisma from '../db';
import {
  findCatalogueEntry,
  isCatalogueProvider,
  languageCoverageFor,
} from '../services/ai/catalogue';
import { SUPPORTED_LANGUAGES } from '../services/seed/supported-languages';

interface LanguageUpdate extends BulkUpdateLanguageState {
  preserveTranslations?: boolean;
}

const router = Router();

/**
 * GET /api/languages
 * Returns all languages
 */
router.get('/', async (req, res) => {
  try {
    const languages = await prisma.language.findMany({
      orderBy: { sortOrder: 'asc' }
    });
    res.json({ languages });
  } catch (error) {
    console.error('Error fetching languages:', error);
    res.status(500).json({ error: 'Failed to fetch languages' });
  }
});

/**
 * GET /api/languages/enabled
 * Returns only enabled languages
 */
router.get('/enabled', async (req, res) => {
  try {
    const languages = await prisma.language.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: 'asc' }
    });
    res.json({ languages });
  } catch (error) {
    console.error('Error fetching enabled languages:', error);
    res.status(500).json({ error: 'Failed to fetch enabled languages' });
  }
});

/**
 * GET /api/languages/model-coverage
 * Returns the active model's catalogue coverage for the language selector.
 */
router.get('/model-coverage', async (_req, res) => {
  try {
    const config = await prisma.aIConfiguration.findFirst({
      where: { type: 'apikey', isActive: true, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });

    if (!config?.model || !isCatalogueProvider(config.serviceType)) {
      return res.json({ model: null });
    }

    const provider = config.serviceType;
    const entry = findCatalogueEntry(config.model);
    const languages = entry?.provider === provider && entry.languages
      ? entry.languages
      : Object.fromEntries(
          SUPPORTED_LANGUAGES.map(({ name }) => [
            name,
            languageCoverageFor(provider, config.model, name),
          ])
        );

    res.json({
      model: {
        id: config.model,
        displayName: entry?.displayName ?? config.model,
        provider,
        languages,
      },
    });
  } catch (error) {
    console.error('Error fetching active model language coverage:', error);
    res.status(500).json({ error: 'Failed to fetch active model language coverage' });
  }
});

/**
 * POST /api/languages/translation-count
 * Gets translation count for specified languages
 */
router.post('/translation-count', async (req, res) => {
  try {
    const { languageNames } = req.body;
    
    if (!Array.isArray(languageNames) || languageNames.length === 0) {
      return res.json({ count: 0 });
    }

    const count = await prisma.translation.count({
      where: {
        language: {
          in: languageNames
        }
      }
    });

    res.json({ count });
  } catch (error) {
    console.error('Error counting translations:', error);
    res.status(500).json({ error: 'Failed to count translations' });
  }
});

/**
 * PUT /api/languages/bulk
 * Bulk updates language states
 */
router.put('/bulk', async (req, res) => {
  try {
    const updates: LanguageUpdate[] = req.body;

    // Validate request body
    validateBulkUpdate(updates);

    const result: BulkUpdateResult = {
      success: { count: 0, items: [], enabledCount: 0 },
      failure: { count: 0, items: [] }
    };

    // Process each update in a transaction
    await prisma.$transaction(async (tx) => {
      // Handle language updates
      for (const update of updates) {
        try {
          await tx.language.update({
            where: { name: update.name },
            data: { isEnabled: update.isEnabled }
          });
          result.success.count++;
          result.success.items.push(update.name);
          if (update.isEnabled) {
            result.success.enabledCount++;
          }
        } catch (error) {
          console.error(`Failed to update language ${update.name}:`, error);
          result.failure.count++;
          result.failure.items.push(update.name);
        }
      }
    });

    // After transaction, handle translation updates
    const enabledLanguages = updates.filter(u => u.isEnabled).map(u => u.name);
    const disabledLanguages = updates.filter(u => !u.isEnabled).map(u => u.name);

    // Handle disabled languages
    for (const update of updates.filter(u => !u.isEnabled)) {
      if (update.preserveTranslations) {
        // Just mark the language as disabled, keep translations
        console.log(`Language ${update.name} disabled but translations preserved`);
      } else {
        // Delete translations for this language
        const translationCount = await prisma.translation.count({
          where: {
            language: update.name
          }
        });
        
        console.log(`Deleting ${translationCount} translations for language ${update.name}`);
        await translationAuditor.handleLanguageDisabled(update.name);
      }
    }

    // Then handle newly enabled languages
    for (const lang of enabledLanguages) {
      await translationAuditor.handleLanguageEnabled(lang);
    }

    // Clean up any duplicates
    await translationAuditor.cleanupDuplicates();

    // Translations will be processed via AI service layer through existing queuing mechanisms

    // Generate response message
    const message = formatBulkUpdateMessage(result);

    res.json({
      message,
      result
    });
  } catch (error) {
    console.error('Error processing bulk language update:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid request'
    });
  }
});

export default router;
