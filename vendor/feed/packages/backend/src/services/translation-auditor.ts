// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import prisma from '../db';
import { translationTriggerService } from './translation-trigger';
import {
  extractBuilderTranslatableStrings,
  type ShoppingListBuilderTemplate,
} from '../routes/shopping-list-builder';
import { BUILDER_TRANSLATION_TYPE } from './builder-translation';

// Define timeout threshold for pending translations (1 minute)
const PENDING_TIMEOUT_MS = 60 * 1000; // 1 minute in milliseconds

interface AuditResult {
  needsTranslation: Array<{
    originalText: string;
    type: string;
    language: string;
  }>;
  duplicates: Array<{
    originalText: string;
    type: string;
    language: string;
    count: number;
  }>;
}

interface MissingTranslationDetails {
  byType: {
    [key: string]: number;
  };
  byLanguage: {
    [key: string]: number;
  };
  totalItems: number;
  sampleItems?: {
    [key: string]: string[];
  };
}

interface FindMissingResult {
  count: number;
  details: MissingTranslationDetails;
  staleCount?: number; // Count of stale pending translations
}

export class TranslationAuditor {
  /**
   * Checks for missing translations and duplicates
   */
  async auditTranslations(): Promise<AuditResult> {
    const result: AuditResult = {
      needsTranslation: [],
      duplicates: []
    };

    // Get all enabled languages except English
    const enabledLanguages = await prisma.language.findMany({
      where: {
        isEnabled: true,
        name: { not: 'English' } // Exclude English
      },
      select: {
        id: true,
        name: true
      }
    });

    // Get all unique original texts
    const uniqueTexts = await prisma.translation.findMany({
      distinct: ['originalText', 'type']
    });

    // Check for missing translations
    for (const text of uniqueTexts) {
      for (const language of enabledLanguages) {
        // Count translations using language name
        const count = await prisma.translation.count({
          where: {
            originalText: text.originalText,
            type: text.type,
            language: language.name
          }
        });

        if (count === 0) {
          result.needsTranslation.push({
            originalText: text.originalText,
            type: text.type,
            language: language.name
          });
        } else if (count > 1) {
          result.duplicates.push({
            originalText: text.originalText,
            type: text.type,
            language: language.name,
            count: count
          });
        }
      }
    }

    return result;
  }

  /**
   * Finds missing translations with detailed breakdown, optionally creating them
   * @param process Whether to create and queue the missing translations
   * @param types Optional array of types to filter (e.g., only process FoodItem)
   * @returns Object with count and details
   */
  async findMissingTranslations(process: boolean = true, types?: string[]): Promise<FindMissingResult> {
    // Get all enabled languages except English
    const enabledLanguages = await prisma.language.findMany({
      where: {
        isEnabled: true,
        name: { not: 'English' } // Exclude English
      },
      select: {
        id: true, 
        name: true
      }
    });

    if (enabledLanguages.length === 0) {
      return { count: 0, details: { byType: {}, byLanguage: {}, totalItems: 0 } }; 
    }

    console.log(`Finding missing translations for ${enabledLanguages.length} enabled languages`);

    // Get all translatable content
    const [foodItems, categories, customTexts, generatedTexts, builderTemplates] = await Promise.all([
      // Get all food items
      prisma.foodItem.findMany({
        select: { id: true, name: true }
      }),
      // Get all categories
      prisma.category.findMany({
        select: { id: true, name: true }
      }),
      // Get all custom texts that have at least one translation
      prisma.translation.findMany({
        where: { type: 'Custom' },
        distinct: ['originalText']
      }),
      // Get all generated texts from documents
      prisma.translation.findMany({
        where: { type: 'Generated' },
        distinct: ['originalText']
      }),
      // Get all saved Shopping List Builder templates. Their `templateData`
      // JSON is fed to extractBuilderTranslatableStrings to enumerate the
      // English strings that should have a `'Generated (List)'` cache row
      // per enabled language. Per AGENTS.md §"Translation rules", the
      // route's extractor is the single point of enumeration; we reuse it
      // here so a new slice (form-fields, section tables, etc.) extends
      // both render and audit in one change.
      prisma.shoppingListBuilderTemplate.findMany({
        select: { id: true, templateData: true }
      })
    ]);

    // Deduplicate strings across all saved templates before language
    // expansion. Many templates share boilerplate ("Please call ahead",
    // section titles, etc.); checking the same string per template per
    // language would blow up the count.
    const builderTextSet = new Set<string>();
    for (const row of builderTemplates) {
      try {
        const template = row.templateData as unknown as ShoppingListBuilderTemplate;
        if (!template || !Array.isArray(template.components)) continue;
        for (const text of extractBuilderTranslatableStrings(template)) {
          builderTextSet.add(text);
        }
      } catch (error) {
        console.warn(`Failed to extract builder strings from template ${row.id}:`, error);
      }
    }
    const builderTexts = Array.from(builderTextSet);

    console.log(`Found ${foodItems.length} food items, ${categories.length} categories, ${customTexts.length} custom texts, ${generatedTexts.length} generated texts, and ${builderTexts.length} unique builder template strings across ${builderTemplates.length} templates`);

    // First get all existing translations to avoid querying the database repeatedly
    const existingTranslations = await prisma.translation.findMany({
      select: {
        originalText: true,
        type: true,
        language: true,
        status: true,
        createdAt: true  // Include createdAt for stale detection
      }
    });

    // Create a lookup map for quick existence checking
    const translationMap = new Map();
    const translationDataMap = new Map();
    const now = new Date().getTime();
    let staleCount = 0;
    
    existingTranslations.forEach(trans => {
      const key = `${trans.originalText}|${trans.type}|${trans.language}`;
      translationMap.set(key, trans.status);
      translationDataMap.set(key, trans);
      
      // Check if this is a stale pending translation
      if (trans.status === 'pending' && 
          (now - new Date(trans.createdAt).getTime() > PENDING_TIMEOUT_MS)) {
        // Count as stale
        staleCount++;
      }
    });

    let missingTranslationsCount = 0;
    let itemsProcessed = 0;

    // Track missing translations by type and language for detailed reporting
    const missingTranslations = [];
    const byType: {[key: string]: number} = {};
    const byLanguage: {[key: string]: number} = {};
    const sampleItems: {[key: string]: string[]} = {};
    const MAX_SAMPLES = 5; // Max number of samples per type

    // Check food items
    if (!types || types.includes('FoodItem')) {
      for (const item of foodItems) {
        for (const language of enabledLanguages) {
          const key = `${item.name}|FoodItem|${language.name}`;
          const status = translationMap.get(key);
          const transData = translationDataMap.get(key);
          
          // Check if this is a stale pending translation
          const isStale = status === 'pending' && 
            transData && 
            (now - new Date(transData.createdAt).getTime() > PENDING_TIMEOUT_MS);
          
          // Check for missing, failed, or stale status
          if (!status || status === 'failed' || isStale) {
            missingTranslations.push({
              originalText: item.name,
              type: 'FoodItem',
              language: language.name
            });
            
            // Update counts
            byType['FoodItem'] = (byType['FoodItem'] || 0) + 1;
            byLanguage[language.name] = (byLanguage[language.name] || 0) + 1;
            
            // Add sample item
            if (!sampleItems['FoodItem']) {
              sampleItems['FoodItem'] = [];
            }
            if (sampleItems['FoodItem'].length < MAX_SAMPLES && 
                !sampleItems['FoodItem'].includes(item.name)) {
              sampleItems['FoodItem'].push(item.name);
            }
          }
        }
        itemsProcessed++;
      }
    }

    // Check categories
    if (!types || types.includes('Category')) {
      for (const category of categories) {
        for (const language of enabledLanguages) {
          const key = `${category.name}|Category|${language.name}`;
          const status = translationMap.get(key);
          const transData = translationDataMap.get(key);
          
          // Check if this is a stale pending translation
          const isStale = status === 'pending' && 
            transData && 
            (now - new Date(transData.createdAt).getTime() > PENDING_TIMEOUT_MS);
          
          // Check for missing, failed, or stale status
          if (!status || status === 'failed' || isStale) {
            missingTranslations.push({
              originalText: category.name,
              type: 'Category',
              language: language.name
            });
            
            // Update counts
            byType['Category'] = (byType['Category'] || 0) + 1;
            byLanguage[language.name] = (byLanguage[language.name] || 0) + 1;
            
            // Add sample item
            if (!sampleItems['Category']) {
              sampleItems['Category'] = [];
            }
            if (sampleItems['Category'].length < MAX_SAMPLES && 
                !sampleItems['Category'].includes(category.name)) {
              sampleItems['Category'].push(category.name);
            }
          }
        }
        itemsProcessed++;
      }
    }

    // Check custom texts
    if (!types || types.includes('Custom')) {
      for (const customText of customTexts) {
        for (const language of enabledLanguages) {
          const key = `${customText.originalText}|Custom|${language.name}`;
          const status = translationMap.get(key);
          const transData = translationDataMap.get(key);
          
          // Check if this is a stale pending translation
          const isStale = status === 'pending' && 
            transData && 
            (now - new Date(transData.createdAt).getTime() > PENDING_TIMEOUT_MS);
          
          // Check for missing, failed, or stale status
          if (!status || status === 'failed' || isStale) {
            missingTranslations.push({
              originalText: customText.originalText,
              type: 'Custom',
              language: language.name
            });
            
            // Update counts
            byType['Custom'] = (byType['Custom'] || 0) + 1;
            byLanguage[language.name] = (byLanguage[language.name] || 0) + 1;
            
            // Add sample item
            if (!sampleItems['Custom']) {
              sampleItems['Custom'] = [];
            }
            if (sampleItems['Custom'].length < MAX_SAMPLES && 
                !sampleItems['Custom'].includes(customText.originalText)) {
              sampleItems['Custom'].push(customText.originalText);
            }
          }
        }
        itemsProcessed++;
      }
    }

    // Check Shopping List Builder template strings (Generated (List)). These
    // are the user-typed strings inside saved templates -- text-component
    // content, form-field labels, section-table titles, etc. We do NOT
    // queue-process them here because builder strings live behind the
    // builder's per-template translation flow ("Translate & Download PDF"
    // in the saved-template row menu); the audit dialog surfaces counts so
    // staff know coverage is incomplete, and matches the read-only
    // treatment used for `'Generated'` (DOCX) translations.
    if (!types || types.includes(BUILDER_TRANSLATION_TYPE)) {
      for (const builderText of builderTexts) {
        for (const language of enabledLanguages) {
          const key = `${builderText}|${BUILDER_TRANSLATION_TYPE}|${language.name}`;
          const status = translationMap.get(key);
          const transData = translationDataMap.get(key);

          const isStale = status === 'pending' &&
            transData &&
            (now - new Date(transData.createdAt).getTime() > PENDING_TIMEOUT_MS);

          if (!status || status === 'failed' || isStale) {
            missingTranslations.push({
              originalText: builderText,
              type: BUILDER_TRANSLATION_TYPE,
              language: language.name
            });

            byType[BUILDER_TRANSLATION_TYPE] = (byType[BUILDER_TRANSLATION_TYPE] || 0) + 1;
            byLanguage[language.name] = (byLanguage[language.name] || 0) + 1;

            if (!sampleItems[BUILDER_TRANSLATION_TYPE]) {
              sampleItems[BUILDER_TRANSLATION_TYPE] = [];
            }
            const truncatedText = builderText.length > 100
              ? builderText.substring(0, 100) + '...'
              : builderText;
            if (sampleItems[BUILDER_TRANSLATION_TYPE].length < MAX_SAMPLES &&
                !sampleItems[BUILDER_TRANSLATION_TYPE].includes(truncatedText)) {
              sampleItems[BUILDER_TRANSLATION_TYPE].push(truncatedText);
            }
          }
        }
        itemsProcessed++;
      }
    }

    // Check generated texts
    if (!types || types.includes('Generated')) {
      for (const generatedText of generatedTexts) {
        for (const language of enabledLanguages) {
          const key = `${generatedText.originalText}|Generated|${language.name}`;
          const status = translationMap.get(key);
          const transData = translationDataMap.get(key);
          
          // Check if this is a stale pending translation
          const isStale = status === 'pending' && 
            transData && 
            (now - new Date(transData.createdAt).getTime() > PENDING_TIMEOUT_MS);
          
          // Check for missing, failed, or stale status
          if (!status || status === 'failed' || isStale) {
            missingTranslations.push({
              originalText: generatedText.originalText,
              type: 'Generated',
              language: language.name
            });
            
            // Update counts
            byType['Generated'] = (byType['Generated'] || 0) + 1;
            byLanguage[language.name] = (byLanguage[language.name] || 0) + 1;
            
            // Add sample item
            if (!sampleItems['Generated']) {
              sampleItems['Generated'] = [];
            }
            
            // Truncate long document text for samples
            const truncatedText = generatedText.originalText.length > 100 
              ? generatedText.originalText.substring(0, 100) + '...' 
              : generatedText.originalText;
              
            if (sampleItems['Generated'].length < MAX_SAMPLES && 
                !sampleItems['Generated'].some(sample => 
                  sample.startsWith(truncatedText.substring(0, 50)))) {
              sampleItems['Generated'].push(truncatedText);
            }
          }
        }
        itemsProcessed++;
      }
    }

    console.log(`Found ${missingTranslations.length} missing translations out of ${itemsProcessed} total items`);

    // Prepare details for response
    const details: MissingTranslationDetails = {
      byType,
      byLanguage,
      totalItems: itemsProcessed,
      sampleItems
    };

    // If not processing or nothing to process, return details only
    if (missingTranslations.length === 0 || !process) {
      return { 
        count: missingTranslations.length,
        details,
        staleCount
      };
    }

    // Dispatch processing per type, following established patterns:
    // - FoodItem & Category: use translationTriggerService queue (async processor)
    // - Custom: create and translate inline in small batches
    // - Generated: do not process here (document service handles it)

    // Build quick lookup maps for resolving IDs
    const foodItemIdByName = new Map(foodItems.map(fi => [fi.name, fi.id]));
    const categoryIdByName = new Map(categories.map(c => [c.name, c.id]));

    // Dedupe by (type, originalText) for queue-backed types to avoid redundant queuing per-language
    const queuedKeys = new Set<string>();

    // Helper: process Custom translations inline (create pending then translate)
    const processCustomBatch = async (batch: { originalText: string; language: string }[]) => {
      for (const item of batch) {
        // Final verification: skip if a non-failed translation already exists
        const existing = await prisma.translation.findFirst({
          where: {
            originalText: item.originalText,
            type: 'Custom',
            language: item.language
          }
        });

        if (existing && existing.status !== 'failed') {
          continue;
        }

        // Create or reset to pending
        const translation = await prisma.translation.upsert({
          where: {
            translation_unique_combo: {
              originalText: item.originalText,
              language: item.language,
              type: 'Custom'
            }
          },
          create: {
            originalText: item.originalText,
            language: item.language,
            type: 'Custom',
            status: 'pending'
          },
          update: {
            status: 'pending',
            translatedText: null
          }
        });
        missingTranslationsCount++;

        try {
          const service = await (await import('./ai/factory/AIServiceFactory')).AIServiceFactory.createService();
          const result = await service.translateText({
            text: item.originalText,
            targetLanguage: item.language,
            context: 'custom'
          });

          await prisma.translation.update({
            where: { id: translation.id },
            data: {
              translatedText: result.translatedText,
              status: 'completed'
            }
          });
        } catch (error) {
          await prisma.translation.update({
            where: { id: translation.id },
            data: {
              status: 'failed',
              translatedText: error instanceof Error ? error.message : 'Translation failed'
            }
          });
        }
      }
    };

    // Partition missing translations by type
    const customItems: { originalText: string; language: string }[] = [];

    for (const item of missingTranslations) {
      if (types && !types.includes(item.type)) continue;

      if (item.type === 'FoodItem') {
        const key = `FoodItem|${item.originalText}`;
        if (!queuedKeys.has(key)) {
          const id = foodItemIdByName.get(item.originalText);
          if (id) {
            try {
              await translationTriggerService.queueContentTranslation(id, 'FoodItem', 'name', item.originalText);
              queuedKeys.add(key);
              // Note: translationTriggerService performs its own upsert and processing
              missingTranslationsCount++;
            } catch (e) {
              console.error(`Failed to queue FoodItem "${item.originalText}":`, e);
            }
          }
        }
      } else if (item.type === 'Category') {
        const key = `Category|${item.originalText}`;
        if (!queuedKeys.has(key)) {
          const id = categoryIdByName.get(item.originalText);
          if (id) {
            try {
              await translationTriggerService.queueContentTranslation(id, 'Category', 'name', item.originalText);
              queuedKeys.add(key);
              missingTranslationsCount++;
            } catch (e) {
              console.error(`Failed to queue Category "${item.originalText}":`, e);
            }
          }
        }
      } else if (item.type === 'Custom') {
        customItems.push({ originalText: item.originalText, language: item.language });
      } else if (item.type === 'Generated') {
        // Skip processing here; document translations are handled by DocxTranslationService
        continue;
      } else if (item.type === BUILDER_TRANSLATION_TYPE) {
        // Skip processing here; builder strings are filled by the Shopping
        // List Builder's per-template "Translate & Download PDF" flow,
        // which routes through translateBuilderStrings with the correct
        // template context. The auditor surfaces missing counts only.
        continue;
      }
    }

    // Process Custom items in small batches to avoid long transactions
    const CUSTOM_BATCH_SIZE = 10;
    for (let i = 0; i < customItems.length; i += CUSTOM_BATCH_SIZE) {
      const batch = customItems.slice(i, i + CUSTOM_BATCH_SIZE);
      await processCustomBatch(batch);
      console.log(`Processed Custom batch ${i + 1}-${Math.min(i + CUSTOM_BATCH_SIZE, customItems.length)} of ${customItems.length}`);
    }

    console.log(`Dispatched/processed ${missingTranslationsCount} missing translations in total (by type-dispatch)`);

    return {
      count: missingTranslationsCount,
      details,
      staleCount
    };
  }

  /**
   * Finds all missing translations for content across the system
   * @returns Number of missing translations created and queued
   */
  async findAndQueueMissingTranslations(): Promise<number> {
    // Use our new method with process=true
    const result = await this.findMissingTranslations(true);
    return result.count;
  }

  /**
   * Creates missing translations for newly enabled languages
   * @param languageName - Language name
   */
  async handleLanguageEnabled(languageName: string): Promise<void> {
    // Skip if English
    if (languageName === 'English') return;

    console.log(`Creating translations for newly enabled language: ${languageName}`);

    // Get all unique content that needs translation (from categories, food items, and custom texts)
    // instead of using the translations table which might have duplicates
    // Intentionally NOT including 'Generated' type translations
    const [categories, foodItems, customTexts] = await Promise.all([
      prisma.category.findMany({ select: { name: true, id: true } }),
      prisma.foodItem.findMany({ select: { name: true, id: true } }),
      prisma.translation.findMany({
        where: { type: 'Custom', status: 'completed' },
        distinct: ['originalText'],
        select: { originalText: true }
      })
    ]);

    // Prepare the unique texts with their types (excluding 'Generated' type)
    const uniqueTexts = [
      ...categories.map(cat => ({ originalText: cat.name, type: 'Category' })),
      ...foodItems.map(item => ({ originalText: item.name, type: 'FoodItem' })),
      ...customTexts.map(text => ({ originalText: text.originalText, type: 'Custom' }))
    ];

    // Count how many translations we'll be creating
    const translationCount = uniqueTexts.length;
    console.log(`Found ${translationCount} unique items that may need translation for language ${languageName}`);

    // First check which items already have translations to avoid duplicates
    const existingTranslations = await prisma.translation.findMany({
      where: {
        language: languageName
      },
      select: {
        originalText: true,
        type: true,
        status: true
      }
    });

    console.log(`Found ${existingTranslations.length} existing translations for language ${languageName}`);

    // Create a lookup map for quick checking
    const existingMap = new Map();
    existingTranslations.forEach(trans => {
      const key = `${trans.originalText}|${trans.type}`;
      existingMap.set(key, trans.status);
    });

    // Filter out items that already have completed translations
    const itemsToTranslate = uniqueTexts.filter(item => {
      const key = `${item.originalText}|${item.type}`;
      const status = existingMap.get(key);
      // Only create new translations if none exist or if they failed previously
      return !status || status === 'failed';
    });

    console.log(`Creating ${itemsToTranslate.length} new translations for language ${languageName}`);

    if (itemsToTranslate.length === 0) {
      console.log(`No new translations needed for language ${languageName}`);
      return;
    }

    // Queue translations using translation-trigger service
    let queuedCount = 0;

    // Process items by type using translation-trigger service
    for (const item of itemsToTranslate) {
      try {
        if (item.type === 'FoodItem') {
          // Find the food item ID
          const foodItem = foodItems.find(fi => fi.name === item.originalText);
          if (foodItem) {
            await translationTriggerService.queueContentTranslation(
              foodItem.id,
              'FoodItem',
              'name',
              item.originalText
            );
            queuedCount++;
          }
        } else if (item.type === 'Category') {
          // Find the category ID
          const category = categories.find(cat => cat.name === item.originalText);
          if (category) {
            await translationTriggerService.queueContentTranslation(
              category.id,
              'Category',
              'name',
              item.originalText
            );
            queuedCount++;
          }
        } else if (item.type === 'Custom') {
          // Handle custom texts directly (translation-trigger doesn't support Custom type)
          const existing = await prisma.translation.findFirst({
            where: {
              originalText: item.originalText,
              type: item.type,
              language: languageName
            }
          });

          if (!existing) {
            await prisma.translation.create({
              data: {
                originalText: item.originalText,
                type: item.type,
                language: languageName,
                status: 'pending'
              }
            });
            queuedCount++;
          }
        }
      } catch (error) {
        console.error(`Failed to queue translation for ${item.type} "${item.originalText}":`, error);
      }
    }

    console.log(`Queued ${queuedCount} translations for language ${languageName}`);
  }

  /**
   * Cleans up translations for disabled languages
   * @param languageName - Language name
   */
  async handleLanguageDisabled(languageName: string): Promise<void> {
    // Skip if English
    if (languageName === 'English') return;

    // Delete translations for this language
    const deleteResult = await prisma.translation.deleteMany({
      where: {
        language: languageName
      }
    });

    console.log(`Deleted ${deleteResult.count} translations for language ${languageName}`);
  }

  /**
   * Cleans up duplicate translations
   */
  async cleanupDuplicates(): Promise<void> {
    const { duplicates } = await this.auditTranslations();
    let totalDuplicatesRemoved = 0;

    for (const dup of duplicates) {
      // Get all duplicates for this text, type, and language
      const translations = await prisma.translation.findMany({
        where: {
          originalText: dup.originalText,
          type: dup.type,
          language: dup.language
        },
        orderBy: {
          id: 'asc' // Keep the oldest one
        }
      });

      // Keep the first one, delete the rest
      if (translations.length > 1) {
        const [keep, ...remove] = translations;
        const deleteResult = await prisma.translation.deleteMany({
          where: {
            id: {
              in: remove.map(t => t.id)
            }
          }
        });
        totalDuplicatesRemoved += deleteResult.count;
        console.log(`Removed ${deleteResult.count} duplicates for text "${dup.originalText.substring(0, 30)}..." in ${dup.language}`);
      }
    }
    
    if (totalDuplicatesRemoved > 0) {
      console.log(`Total duplicates removed: ${totalDuplicatesRemoved}`);
    } else {
      console.log('No duplicates found to clean up');
    }
  }
}

// Export singleton instance
export const translationAuditor = new TranslationAuditor();
