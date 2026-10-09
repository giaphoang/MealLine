// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.


import { Router } from 'express';
import { AIServiceFactory } from '../services/ai/factory/AIServiceFactory';
import { ensureProviderAccess } from '../services/ai/provider-access';
import { alertService } from '../services/alerts';
import { translationAuditor } from '../services/translation-auditor';

import { translationRecovery } from '../services/translation-recovery';
import { DateRangeResolver } from '../utils/dateRangeResolver';
import prisma from '../db';
import { getCapabilities, isActionAllowed } from '../services/translation-action-policy';
import { SUPPORT_CONTACT_SENTENCE } from '../lib/support';

// Helper function to escape special characters in regex patterns
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const router = Router();

/**
 * GET /api/translations/capabilities
 * Returns allowed translation actions by type
 */
router.get('/capabilities', async (_req, res) => {
  try {
    const caps = getCapabilities();
    res.json({ capabilities: caps });
  } catch (error) {
    console.error('Error fetching translation capabilities:', error);
    res.status(500).json({ error: 'We could not load translation capabilities. Please try again.' });
  }
});

/**
 * POST /api/translations/recover-stuck
 * Manually check for and recover stuck translations
 */
router.post('/recover-stuck', async (req, res) => {
  try {
    // This is an on-demand event-driven approach rather than a scheduled task
    const result = await translationRecovery.recoverStuckTranslations();
    
    res.json({
      message: result.message,
      recovered: result.recovered
    });
  } catch (error) {
    console.error('Error recovering stuck translations:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : `We couldn't recover your pending translations. Please try again later. ${SUPPORT_CONTACT_SENTENCE}` 
    });
  }
});

/**
 * POST /api/translations/find-missing
 * Finds and optionally queues missing translations
 */
router.post('/find-missing', async (req, res) => {
  try {
    const { process = true, types } = req.body;
    
    // Find missing translations and get details, but don't automatically queue them if process is false
    const result = await translationAuditor.findMissingTranslations(process, types);

    // Translation processing handled automatically by AI service layer - no manual triggering needed

    // Prepare response message based on whether we just scanned or actually processed
    const actionVerb = process ? 'Found and queued' : 'Found';
    
    // Improve clarity when nothing is queued due to non-queueable types (e.g., Generated)
    let message: string;
    if (result.count > 0) {
      message = `${actionVerb} ${result.count} missing ${result.count === 1 ? 'translation' : 'translations'}`;
    } else if (process) {
      const byType = result.details?.byType || {} as Record<string, number>;
      const totalAll = Object.values(byType).reduce((a, b) => a + (b || 0), 0);
      const queueableTypes = ['FoodItem', 'Category', 'Custom'];
      const totalQueueable = queueableTypes.reduce((sum, t) => sum + (byType[t] || 0), 0);

      // If there are missing items but none are queueable, provide actionable guidance
      if (totalAll > 0 && totalQueueable === 0) {
        // If the caller explicitly asked for Generated, clarify routing to Document Translator
        const onlyGenerated = Array.isArray(types) && types.length > 0 && types.every((t: string) => t === 'Generated');
        const onlyGeneratedList = Array.isArray(types) && types.length > 0 && types.every((t: string) => t === 'Generated (List)');
        if (onlyGenerated) {
          message = 'No queueable translations for selected types. Generated (Document) items are handled by the Document Translator.';
        } else if (onlyGeneratedList) {
          message = 'No queueable translations for selected types. Generated (Shopping List) items are filled by the Shopping List Builder\'s Translate & Download PDF flow.';
        } else {
          message = 'No queueable translations found for the selected types.';
        }
      } else {
        message = 'No missing translations found';
      }
    } else {
      message = 'No missing translations found';
    }

    res.json({
      count: result.count,
      details: result.details,
      message
    });
  } catch (error) {
    console.error('Error finding missing translations:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : `We couldn't locate missing translations. Please try again later. ${SUPPORT_CONTACT_SENTENCE}` 
    });
  }
});

/**
 * GET /api/translations/metrics
 * Returns translation performance metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    // Get metrics for all translations
    const [translations, successRates, averageTimes] = await Promise.all([
      prisma.translation.findMany(),
      prisma.translation.groupBy({
        by: ['language'],
        _count: {
          _all: true
        },
        where: {
          status: 'completed'
        }
      }),
      prisma.usageRecord.groupBy({
        by: ['language'],
        _avg: {
          duration: true,
          promptTokens: true,
          completionTokens: true,
          totalCost: true
        },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalCost: true
        },
        where: {
          success: true,
          duration: { not: null },
          language: { not: null }
        }
      })
    ]);

    // Calculate success rate
    const totalTranslations = translations.length;
    const completedTranslations = translations.filter(t => t.status === 'completed').length;
    const overallSuccessRate = totalTranslations > 0 ? (completedTranslations / totalTranslations) * 100 : 0;

    // Get language display names
    const languages = await prisma.language.findMany({
      select: {
        name: true
      }
    });

    // Process response times
    const responseTimeData = averageTimes.map(lang => {
      const duration = lang._avg.duration;
      const timeInSeconds = duration ? Math.round(duration / 100) / 10 : 0;
      // Find the matching language name or use the language value as-is
      const languageName = lang.language;
      const metrics = lang._sum;
      return {
        language: languageName,
        time: timeInSeconds,
        requests: successRates.find(r => r.language === lang.language)?._count._all || 0,
        tokens: (metrics.promptTokens || 0) + (metrics.completionTokens || 0),
        cost: metrics.totalCost || 0
      };
    });

    responseTimeData.sort((a, b) => b.requests - a.requests);

    res.json({
      metrics: {
        success: [
          {
            success: overallSuccessRate,
            pending: 100 - overallSuccessRate
          }
        ],
        responseTimes: responseTimeData
      }
    });
  } catch (error) {
    console.error('Error fetching translation metrics:', error);
    res.status(500).json({ error: 'We couldn\'t load the translation statistics. Please refresh your browser or try again later.' });
  }
});

/**
 * GET /api/translations/performance
 * Returns translation performance metrics over time
 */
router.get('/performance', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    const dateRange = DateRangeResolver.resolveTimeRange(timeRange as string);
    const startDate = dateRange.startDate;

    const metrics = await prisma.usageRecord.groupBy({
      by: ['timestamp'],
      _avg: {
        duration: true,
        totalCost: true,
        promptTokens: true,
        completionTokens: true
      },
      where: {
        timestamp: {
          gte: startDate
        },
        success: true,
        operationType: 'translation'
      }
    });

    const formattedMetrics = metrics.map(metric => ({
      date: metric.timestamp.toISOString(),
      responseTime: Math.round(metric._avg.duration || 0),
      cost: metric._avg.totalCost || 0,
      promptTokens: Math.round(metric._avg.promptTokens || 0),
      completionTokens: Math.round(metric._avg.completionTokens || 0)
    }));

    formattedMetrics.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json({ metrics: formattedMetrics });
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({ error: 'We couldn\'t load the performance data. Please refresh your browser or try again later.' });
  }
});

/**
 * GET /api/translations
 * Returns all translations
 */
router.get('/', async (req, res) => {
  try {
    const translations = await prisma.translation.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({ translations });
  } catch (error) {
    console.error('Error fetching translations:', error);
    res.status(500).json({ error: 'We couldn\'t retrieve your translations. Please refresh your browser or try again later.' });
  }
});

/**
 * POST /api/translations
 * Creates new translation entries
 */
router.post('/', async (req, res, next) => {
  try {
    const { originalText, targetLanguages } = req.body;

    // Basic validation
    if (!originalText?.trim()) {
      return res.status(400).json({ error: 'Please enter the text you want to translate before submitting.' });
    }
    if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return res.status(400).json({ error: 'Please select at least one language to translate your text into.' });
    }

    // Confirm the provider will answer before creating translations that are
    // certain to fail. A refusal here says which of the possible failures it
    // was, names the model, and carries a code — it is no longer reported as
    // a bad API key whatever the provider actually said (ISSUES.md #84).
    try {
      await ensureProviderAccess('these translations');
    } catch (error) {
      return next(error);
    }

    // First create all pending translations in a transaction
    // Filter out English translations - use only full language name
    const nonEnglishLanguages = targetLanguages.filter(lang => 
      lang?.toLowerCase() !== 'english'
    );

    if (nonEnglishLanguages.length === 0) {
      return res.json({ translations: [] });
    }

    const pendingTranslations = await prisma.$transaction(async (tx) => {
      return Promise.all(nonEnglishLanguages.map(language =>
        tx.translation.create({
          data: {
            originalText,
            language,
            type: 'Custom',
            status: 'pending',
            translatedText: null
          }
        })
      ));
    });

    // Then process translations outside transaction with extended timeout
    const translationPromises = pendingTranslations.map(async (translation) => {
      try {
        // Attempt translation
        console.log(`Starting translation for language: ${translation.language}`);
        const service = await AIServiceFactory.createService();
        const result = await service.translateText({
          text: originalText,
          targetLanguage: translation.language,
          context: 'custom'
        });
        console.log(`Translation completed for language: ${translation.language}`);

        // Update metrics
        if (result.metrics.duration) {
          await alertService.checkResponseTime(result.metrics.duration);
        }

        // Update translation with result (metrics tracked in UsageRecord via AI service)
        return await prisma.translation.update({
          where: { id: translation.id },
          data: {
            translatedText: result.translatedText,
            status: 'completed'
          }
        });
      } catch (error) {
        console.error(`Translation failed for language ${translation.language}:`, error);
        // Update translation as failed
        return await prisma.translation.update({
          where: { id: translation.id },
          data: { 
            status: 'failed',
            translatedText: error instanceof Error ? error.message : 'Translation failed'
          }
        });
      }
    });

    // Wait for all translations to complete
    const translations = await Promise.all(translationPromises);

    res.status(201).json({ translations });
  } catch (error) {
    console.error('Error creating translations:', error);
    if (error instanceof Error) {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: `We had trouble creating your translations. Please try again with smaller text. ${SUPPORT_CONTACT_SENTENCE}` });
    }
  }
});

/**
 * POST /api/translations/:id/retry
 * Retries a failed translation
 */
router.post('/:id/retry', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'The translation ID is not valid. Please check and try again.' });
    }

    // Find the translation
    const translation = await prisma.translation.findUnique({
      where: { id }
    });
    
    // This is already checked above - we know the translation exists
    
    // Update status to pending
    await prisma.translation.update({
      where: { id },
      data: { status: 'pending' }
    });

    if (!translation) {
      return res.status(404).json({ error: 'We couldn\'t find this translation. It may have been deleted or never existed.' });
    }

    // Confirm the provider will answer before retrying. When it will not, the
    // row records why in the words staff will read, rather than asserting a
    // bad API key for every kind of refusal (ISSUES.md #84).
    try {
      let service;
      try {
        service = await ensureProviderAccess('this translation');
      } catch (accessError) {
        const message = accessError instanceof Error
          ? accessError.message
          : 'The AI service could not be reached.';
        await prisma.translation.update({
          where: { id },
          data: { status: 'failed', translatedText: message },
        });
        return next(accessError);
      }

      // Determine context based on translation type
      let context: 'food' | 'custom' | 'document' = 'custom';
      if (translation.type === 'Category' || translation.type === 'FoodItem') {
        context = 'food';
      } else if (translation.type === 'Document') {
        context = 'document';
      }

      const result = await service.translateText({
        text: translation.originalText,
        targetLanguage: translation.language,
        context
      });

      // Update translation with new result (metrics tracked in UsageRecord via AI service)
      const updatedTranslation = await prisma.translation.update({
        where: { id },
        data: {
          translatedText: result.translatedText,
          status: 'completed'
        }
      });

      res.json({ translation: updatedTranslation });
    } catch (error) {
      // Log the actual error details
      console.error('Translation retry error:', error);
      
      // Update as failed with error message
      const failedTranslation = await prisma.translation.update({
        where: { id },
        data: { 
          status: 'failed',
          translatedText: error instanceof Error ? error.message : 'Translation retry failed'
        }
      });

      // Send back both the error and updated translation
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Translation retry failed',
        translation: failedTranslation
      });
    }
  } catch (error) {
    console.error('Error retrying translation:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : `We couldn't retry this translation. Please try again. ${SUPPORT_CONTACT_SENTENCE}`
    });
  }
});

/**
 * POST /api/translations/bulk-retry
 * Retries multiple translations
 */
router.post('/bulk-retry', async (req, res, next) => {
  console.log('BULK RETRY ENDPOINT HIT - NEW LOG');
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Please select at least one translation to process.' });
    }

    // First set all selected translations to pending
    const translations = await prisma.translation.findMany({
      where: { id: { in: ids } }
    });
    
    if (translations.length === 0) {
      return res.status(404).json({ error: 'None of the selected translations could be found. They may have been deleted already.' });
    }
    
    // One check for the whole batch: if the provider will not answer, every
    // row would fail the same way, and nine identical failures are one fact.
    try {
      await ensureProviderAccess('these translations');
    } catch (accessError) {
      const message = accessError instanceof Error
        ? accessError.message
        : 'The AI service could not be reached.';
      await prisma.translation.updateMany({
        where: { id: { in: ids } },
        data: { status: 'failed', translatedText: message },
      });
      return next(accessError);
    }

    // Update all to pending status first
    await prisma.translation.updateMany({
      where: { id: { in: ids } },
      data: { status: 'pending' }
    });

    // Process each translation
    const results = await Promise.allSettled(
      translations.map(async (translation) => {
        try {
          const service = await AIServiceFactory.createService();
          // Determine context based on translation type
          let context: 'food' | 'custom' | 'document' = 'custom';
          if (translation.type === 'Category' || translation.type === 'FoodItem') {
            context = 'food';
          } else if (translation.type === 'Document') {
            context = 'document';
          }

          const result = await service.translateText({
            text: translation.originalText,
            targetLanguage: translation.language,
            context
          });

          // Update translation with new result (metrics tracked in UsageRecord via AI service)
          await prisma.translation.update({
            where: { id: translation.id },
            data: {
              translatedText: result.translatedText,
              status: 'completed'
            }
          });

          // Update metrics
          if (result.metrics.duration) {
            await alertService.checkResponseTime(result.metrics.duration);
          }

          return translation.id;
        } catch (error) {
          try {
            console.error(`Bulk retry failed for translation ${translation.id}:`, error);
          } catch (e) {
            // ignore
          }

          // Update as failed
          await prisma.translation.update({
            where: { id: translation.id },
            data: { 
              status: 'failed',
              translatedText: error instanceof Error ? error.message : 'Translation retry failed'
            }
          });

          const truncatedText = translation.originalText.substring(0, 15);
          throw new Error(`Failed to retry translation for '${truncatedText}...'. Please check your AI Configuration and try again`);
        }
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<number>[];
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    console.log('Bulk retry results:', JSON.stringify(results, null, 2));

    const response = {
      success: successful.length,
      failed: failed.length,
      errors: failed.map((r) => r.reason?.message || 'Unknown error')
    };

    res.json(response);
  } catch (error) {
    console.error('Error bulk retrying translations:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to bulk retry translations',
      success: 0,
      failed: req.body.ids?.length || 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    });
  }
});

/**
 * POST /api/translations/bulk-include-original
 * Updates translations to include original text in parentheses
 */
router.post('/bulk-include-original', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No translation IDs provided' });
    }

    // Find all translations to update
    const translations = await prisma.translation.findMany({
      where: { id: { in: ids } }
    });
    
    if (translations.length === 0) {
      return res.status(404).json({ error: 'No translations found with the provided IDs' });
    }

    // Enforce action policy: filter allowed translations, collect disallowed as failures
    const allowed = translations.filter(t => isActionAllowed(t.type, 'includeOriginal'));
    const disallowed = translations.filter(t => !isActionAllowed(t.type, 'includeOriginal'));

    // If none are allowed, return helpful 400
    if (allowed.length === 0) {
      const types = [...new Set(disallowed.map(t => t.type))].join(', ');
      return res.status(400).json({
        error: `Include English is not available for the selected types (${types}). Please select Custom or Generated translations.`,
        success: 0,
        failed: disallowed.length,
        errors: disallowed.map(t => `Include English not allowed for type ${t.type} (id: ${t.id})`)
      });
    }

    // Process each translation to include the original text
    const results = await Promise.allSettled(
      allowed.map(async (translation) => {
        try {
          // Skip if translation has no valid translatedText
          if (!translation.translatedText) {
            throw new Error(`Translation ${translation.id} has no translated text`);
          }

          // Skip if original text is already included (detect by checking for parentheses with original text)
          if (translation.translatedText.includes(`(${translation.originalText})`)) {
            return { id: translation.id, changed: false }; // Already has original text, count as success without changes
          }

          // Update translation to include original text in parentheses
          await prisma.translation.update({
            where: { id: translation.id },
            data: {
              translatedText: `${translation.translatedText} (${translation.originalText})`
            }
          });

          return { id: translation.id, changed: true };
        } catch (error) {
          console.error(`Failed to update translation ${translation.id}:`, error);
          throw new Error(`Failed to update translation ${translation.id}`);
        }
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{id: number, changed: boolean}>[];
    const changedResults = successful.filter(r => r.value.changed);
    const skippedResults = successful.filter(r => !r.value.changed);
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    // Add disallowed items as failures with clear messages
    const disallowedErrors = disallowed.map((t) => ({ message: `Include English not allowed for type ${t.type} (id: ${t.id})` }));

    const response = {
      success: successful.length,
      changed: changedResults.length,
      skipped: skippedResults.length,
      failed: failed.length + disallowed.length,
      errors: [
        ...failed.map((r) => r.reason?.message || 'Unknown error'),
        ...disallowedErrors.map(e => e.message)
      ]
    };

    res.json(response);
  } catch (error) {
    console.error('Error updating translations to include original text:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to update translations',
      success: 0,
      failed: req.body.ids?.length || 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    });
  }
});

/*
 DEPRECATED (2025-09-01): Skip/Enable Translation actions are removed from the project.
 The following endpoint implementation is preserved for historical reference only.
 
 /**
  * POST /api/translations/bulk-skip-translation
  * Marks multiple translations to be skipped and uses original text
  */
// router.post('/bulk-skip-translation', async (req, res) => {
/*  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No translation IDs provided' });
    }

    // Find all translations to update
    const translations = await prisma.translation.findMany({
      where: { id: { in: ids } }
    });
    
    if (translations.length === 0) {
      return res.status(404).json({ error: 'No translations found with the provided IDs' });
    }

    // Process each translation to mark as skipped
    const results = await Promise.allSettled(
      translations.map(async (translation) => {
        try {
          // Skip if already marked for skipping
          if (translation.skipTranslation) {
            return { id: translation.id, changed: false }; // Already skipped
          }

          // Update translation to mark as skipped and use original text
          await prisma.translation.update({
            where: { id: translation.id },
            data: {
              skipTranslation: true,
              translatedText: translation.originalText, // Replace with original text
              status: 'completed' // Ensure status is completed
            }
          });

          return { id: translation.id, changed: true };
        } catch (error) {
          console.error(`Failed to mark translation ${translation.id} as skipped:`, error);
          throw new Error(`Failed to mark translation ${translation.id} as skipped`);
        }
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{id: number, changed: boolean}>[];
    const changedResults = successful.filter(r => r.value.changed);
    const skippedResults = successful.filter(r => !r.value.changed);
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    const response = {
      success: successful.length,
      changed: changedResults.length,
      skipped: skippedResults.length,
      failed: failed.length,
      errors: failed.map((r) => r.reason?.message || 'Unknown error')
    };

    res.json(response);
  } catch (error) {
    console.error('Error marking translations to skip:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to mark translations as skipped',
      success: 0,
      failed: req.body.ids?.length || 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    });
  }
*/
// });

/**
 * DEPRECATED (2025-09-01): Skip/Enable Translation actions are removed.
 * Preserved below as commented reference.
 */
// router.post('/bulk-enable-translation', async (req, res) => {
/*  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No translation IDs provided' });
    }

    // Find all translations to update
    const translations = await prisma.translation.findMany({
      where: { id: { in: ids } }
    });
    
    if (translations.length === 0) {
      return res.status(404).json({ error: 'No translations found with the provided IDs' });
    }

    // Process each translation to re-enable
    const results = await Promise.allSettled(
      translations.map(async (translation) => {
        try {
          // Skip if not marked for skipping
          if (!translation.skipTranslation) {
            return { id: translation.id, changed: false }; // Not skipped, no change needed
          }

          // Determine if we need to re-translate
          const needsTranslation = translation.translatedText === translation.originalText;
          
          if (needsTranslation) {
            // Set to pending for re-translation
            await prisma.translation.update({
              where: { id: translation.id },
              data: {
                skipTranslation: false,
                status: 'pending' // Mark for re-translation
              }
            });
          } else {
            // Just unmark skipping but keep existing translation
            await prisma.translation.update({
              where: { id: translation.id },
              data: {
                skipTranslation: false
              }
            });
          }

          return { id: translation.id, changed: true, needsTranslation };
        } catch (error) {
          console.error(`Failed to enable translation ${translation.id}:`, error);
          throw new Error(`Failed to enable translation ${translation.id}`);
        }
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{id: number, changed: boolean, needsTranslation?: boolean}>[];
    const changedResults = successful.filter(r => r.value.changed);
    const needsTranslationCount = changedResults.filter(r => r.value.needsTranslation).length;
    const skippedResults = successful.filter(r => !r.value.changed);
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    const response = {
      success: successful.length,
      changed: changedResults.length,
      needsTranslation: needsTranslationCount,
      skipped: skippedResults.length,
      failed: failed.length,
      errors: failed.map((r) => r.reason?.message || 'Unknown error')
    };

    // Translation processing handled automatically by AI service layer - no manual triggering needed

    res.json(response);
  } catch (error) {
    console.error('Error enabling translations:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to enable translations',
      success: 0,
      failed: req.body.ids?.length || 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    });
  }
*/
// });

/**
 * DEPRECATED (2025-09-01): Skip/Enable Translation actions are removed.
 * The single-item skip endpoint is preserved as commented code.
 */
// router.post('/:id/skip-translation', async (req, res) => {
/*  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid translation ID' });
    }

    // Find the translation
    const translation = await prisma.translation.findUnique({
      where: { id }
    });
    
    if (!translation) {
      return res.status(404).json({ error: 'Translation not found' });
    }

    // Skip if already marked
    if (translation.skipTranslation) {
      return res.json({ 
        translation, 
        message: 'Translation was already marked to skip', 
        changed: false 
      });
    }

    // Update translation
    const updatedTranslation = await prisma.translation.update({
      where: { id },
      data: {
        skipTranslation: true,
        translatedText: translation.originalText,
        status: 'completed'
      }
    });

    res.json({ 
      translation: updatedTranslation, 
      message: 'Translation marked to skip and will use original text', 
      changed: true 
    });
  } catch (error) {
    console.error('Error marking translation to skip:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to mark translation as skipped'
    });
  }
*/
// });

/**
 * DEPRECATED (2025-09-01): Skip/Enable Translation actions are removed.
 * The single-item enable endpoint is preserved as commented code.
 */
// router.post('/:id/enable-translation', async (req, res) => {
/*  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid translation ID' });
    }

    // Find the translation
    const translation = await prisma.translation.findUnique({
      where: { id }
    });
    
    if (!translation) {
      return res.status(404).json({ error: 'Translation not found' });
    }

    // Skip if not marked for skipping
    if (!translation.skipTranslation) {
      return res.json({ 
        translation, 
        message: 'Translation was not marked to skip', 
        changed: false 
      });
    }

    // Determine if we need to re-translate
    const needsTranslation = translation.translatedText === translation.originalText;
    let updatedTranslation;
    
    if (needsTranslation) {
      // Mark for re-translation
      updatedTranslation = await prisma.translation.update({
        where: { id },
        data: {
          skipTranslation: false,
          status: 'pending'
        }
      });
      
      // Trigger translation process
      // translationEvents.requestTranslations();
    } else {
      // Just unmark skipping
      updatedTranslation = await prisma.translation.update({
        where: { id },
        data: {
          skipTranslation: false
        }
      });
    }

    res.json({ 
      translation: updatedTranslation, 
      message: needsTranslation ? 'Translation enabled and queued for re-translation' : 'Translation enabled',
      changed: true,
      needsTranslation 
    });
  } catch (error) {
    console.error('Error enabling translation:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to enable translation'
    });
  }
*/
// });

/**
 * POST /api/translations/bulk-remove-original
 * Updates translations to remove original English text in parentheses
 */
router.post('/bulk-remove-original', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No translation IDs provided' });
    }

    // Find all translations to update
    const translations = await prisma.translation.findMany({
      where: { id: { in: ids } }
    });
    
    if (translations.length === 0) {
      return res.status(404).json({ error: 'No translations found with the provided IDs' });
    }

    // Enforce action policy: filter allowed translations, collect disallowed as failures
    const allowed = translations.filter(t => isActionAllowed(t.type, 'removeOriginal'));
    const disallowed = translations.filter(t => !isActionAllowed(t.type, 'removeOriginal'));

    // If none are allowed, return helpful 400
    if (allowed.length === 0) {
      const types = [...new Set(disallowed.map(t => t.type))].join(', ');
      return res.status(400).json({
        error: `Remove English is not available for the selected types (${types}). Please select Custom or Generated translations.`,
        success: 0,
        failed: disallowed.length,
        errors: disallowed.map(t => `Remove English not allowed for type ${t.type} (id: ${t.id})`)
      });
    }

    // Process each translation to remove the original text
    const results = await Promise.allSettled(
      allowed.map(async (translation) => {
        try {
          // Skip if translation has no valid translatedText
          if (!translation.translatedText) {
            throw new Error(`Translation ${translation.id} has no translated text`);
          }

          let updatedText = translation.translatedText;
          const originalText = translation.originalText;
          let changed = false;
          
          // Apply exact matching - look for the exact original text in parentheses at the end
          const exactPattern = new RegExp(` \\(${escapeRegExp(originalText)}\\)$`);
          if (exactPattern.test(updatedText)) {
            // Remove the exact match at the end of the string
            updatedText = updatedText.replace(exactPattern, '');
            changed = true;
          } else {
            // If exact match at end is not found, check for original text in parentheses anywhere
            const anywherePattern = new RegExp(` \\(${escapeRegExp(originalText)}\\)`);
            if (anywherePattern.test(updatedText)) {
              updatedText = updatedText.replace(anywherePattern, '');
              changed = true;
            } else {
              // No match found, return as success without changes
              return { id: translation.id, changed: false };
            }
          }

          // Update translation to remove original text
          await prisma.translation.update({
            where: { id: translation.id },
            data: {
              translatedText: updatedText
            }
          });

          return { id: translation.id, changed: true };
        } catch (error) {
          console.error(`Failed to update translation ${translation.id}:`, error);
          throw new Error(`Failed to update translation ${translation.id}`);
        }
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{id: number, changed: boolean}>[];
    const changedResults = successful.filter(r => r.value.changed);
    const skippedResults = successful.filter(r => !r.value.changed);
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    const response = {
      success: successful.length,
      changed: changedResults.length,
      skipped: skippedResults.length,
      failed: failed.length + disallowed.length,
      errors: [
        ...failed.map((r) => r.reason?.message || 'Unknown error'),
        ...disallowed.map((t) => `Remove English not allowed for type ${t.type} (id: ${t.id})`)
      ]
    };

    res.json(response);
  } catch (error) {
    console.error('Error updating translations to remove original text:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to update translations',
      success: 0,
      failed: req.body.ids?.length || 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    });
  }
});

/**
 * POST /api/translations/bulk-delete
 * Deletes multiple translations
 */
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No translation IDs provided' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const deleteResults = await Promise.allSettled(
        ids.map(async (id) => {
          await tx.translation.delete({ where: { id } });
          return id;
        })
      );

      const success = deleteResults.filter((r) => r.status === 'fulfilled').length;
      const failed = deleteResults.filter((r) => r.status === 'rejected').length;
      const errors = deleteResults
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => r.reason?.message || 'Unknown error');

      return {
        success,
        failed,
        errors
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error bulk deleting translations:', error);
    res.status(500).json({ error: `We couldn't delete the selected translations. Please try again. ${SUPPORT_CONTACT_SENTENCE}` });
  }
});

/**
 * DELETE /api/translations/:id
 * Deletes a translation
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid translation ID' });
    }

    const translation = await prisma.translation.findUnique({
      where: { id }
    });

    if (!translation) {
      return res.status(404).json({ error: 'Translation not found' });
    }

    await prisma.translation.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting translation:', error);
    res.status(500).json({ error: 'Failed to delete translation' });
  }
});

/**
 * PUT /api/translations/:id
 * Updates a translation
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { translatedText } = req.body;
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid translation ID' });
    }

    if (typeof translatedText !== 'string') {
      return res.status(400).json({ error: 'Please provide valid text for your translation.' });
    }

    const translation = await prisma.translation.update({
      where: { id },
      data: {
        translatedText,
        status: 'completed'
      }
    });

    res.json({ translation });
  } catch (error) {
    console.error('Error updating translation:', error);
    res.status(500).json({ error: `We couldn't save your changes to this translation. Please try again. ${SUPPORT_CONTACT_SENTENCE}` });
  }
});

export default router;
