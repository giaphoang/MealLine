// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import type { PrismaClient } from '@prisma/client';

import {
  EXAMPLE_SAVED_COMPONENTS,
  EXAMPLE_TEMPLATE_NAME,
  buildExampleTemplateData,
} from './example-template';
import { SEED_SYSTEM_PROMPTS } from './system-prompts';
import {
  ILLUSTRATIVE_CATEGORIES,
  ILLUSTRATIVE_FOOD_ITEMS,
  REFERENCE_LANGUAGES,
  STRUCTURAL,
} from './layers';

/**
 * Populate a database with a clean slate.
 *
 * Takes a client rather than importing the singleton, because the clean-slate
 * action runs this against a *scratch* database that is not live yet — the same
 * build-and-swap sequence restore uses. Writing to the live client would defeat
 * the entire mechanism.
 *
 * Idempotent by `nameSearch` / `name`, so running it twice is a no-op rather
 * than a duplicate set.
 */

export interface SeedOptions {
  /**
   * Include the illustrative layer — example categories, items, and the
   * builder template that binds to them.
   *
   * Default true: a first-run instance is the case where the choice matters
   * most, and example data is easy to clear once someone has their feet wet
   * (Delete is a bulk action). An established pantry resetting its own instance
   * wants false — it knows its categories, and seeded ones are work to remove.
   */
  withExamples?: boolean;
}

export interface SeedSummary {
  languages: number;
  enabledLanguages: number;
  categories: number;
  foodItems: number;
  /** AI system prompts — reference data, present in every clean slate. */
  systemPrompts: number;
  /** The example Builder template, when the illustrative layer is included. */
  templates: number;
  /** Reusable Builder blocks that ship with it. */
  savedComponents: number;
  globalLimit: number;
}

const normalize = (name: string) => name.trim().replace(/\s+/g, ' ');

export class SeedService {
  static async apply(
    prisma: PrismaClient,
    options: SeedOptions = {}
  ): Promise<SeedSummary> {
    const withExamples = options.withExamples ?? true;

    // --- Structural: what makes FEED work rather than merely be empty. ---
    // The column is `value`, not `limit` — the singleton row is id 1.
    await prisma.globalLimit.upsert({
      where: { id: 1 },
      update: { value: STRUCTURAL.globalLimit },
      create: { id: 1, value: STRUCTURAL.globalLimit },
    });

    // --- Reference: facts, not choices. Available, not enabled. ---
    for (const language of REFERENCE_LANGUAGES) {
      const isEnabled = language.name === STRUCTURAL.enabledLanguage;
      await prisma.language.upsert({
        where: { name: language.name },
        update: { sortOrder: language.sortOrder },
        // Only English arrives enabled. Enabling the rest is an agency
        // decision, and 59 columns of untranslated text on day one is not a
        // helpful starting point.
        create: {
          name: language.name,
          sortOrder: language.sortOrder,
          isEnabled,
        },
      });
    }

    // System prompts are reference data too: they describe how FEED talks to a
    // translation provider, not what the agency stocks. Without them a reset
    // would leave the instance with no prompts at all, because the backup
    // contract clears SystemPrompt.
    for (const prompt of SEED_SYSTEM_PROMPTS) {
      const fields = {
        promptType: prompt.promptType,
        isActive: prompt.isActive,
        isDefault: prompt.isDefault,
        description: prompt.description ?? null,
        serviceDescription: prompt.serviceDescription ?? null,
        translationApproach: prompt.translationApproach ?? null,
        contextGuidance: prompt.contextGuidance ?? null,
        additionalGuidance: prompt.additionalGuidance ?? null,
        skipTranslation: prompt.skipTranslation ?? null,
        includeEnglish: prompt.includeEnglish ?? null,
        skipTranslationThreshold: prompt.skipTranslationThreshold ?? null,
        includeEnglishThreshold: prompt.includeEnglishThreshold ?? null,
        temperature: prompt.temperature ?? null,
        topP: prompt.topP ?? null,
        rememberFormattingChoices: prompt.rememberFormattingChoices ?? false,
      };

      await prisma.systemPrompt.upsert({
        where: { name: prompt.name },
        update: fields,
        create: { name: prompt.name, ...fields },
      });
    }

    let categories = 0;
    let foodItems = 0;
    let templates = 0;
    let savedComponents = 0;

    // --- Illustrative: opinions about a pantry that may not be this one. ---
    if (withExamples) {
      // Names are the stable key between the seed and the example template:
      // ids are assigned here and cannot be known in advance.
      const categoryIds = new Map<string, number>();
      const itemIds = new Map<string, number>();

      for (const category of ILLUSTRATIVE_CATEGORIES) {
        const name = normalize(category.name);
        const nameSearch = name.toLowerCase();
        const created = await prisma.category.upsert({
          where: { nameSearch },
          update: {
            limit: category.limit,
            limitType: category.limitType,
            icon: category.icon,
          },
          create: {
            name,
            nameSearch,
            limit: category.limit,
            limitType: category.limitType,
            icon: category.icon,
          },
        });
        categoryIds.set(category.name, created.id);
        categories += 1;
      }

      for (const item of ILLUSTRATIVE_FOOD_ITEMS) {
        const categoryId = categoryIds.get(item.categoryName);
        if (!categoryId) {
          throw new Error(
            `Seed item "${item.name}" names category "${item.categoryName}", which is not seeded.`
          );
        }

        const name = normalize(item.name);
        const nameSearch = name.toLowerCase();
        const fields = {
          limit: item.limit,
          isLimited: item.isLimited,
          isInStock: item.isInStock,
          isClearance: item.isClearance,
          categoryId,
          vegan: item.vegan,
          vegetarian: item.vegetarian,
          glutenFree: item.glutenFree,
          organic: item.organic,
          halal: item.halal,
          kosher: item.kosher,
          readyToEat: item.readyToEat,
        };

        const created = await prisma.foodItem.upsert({
          where: { nameSearch },
          update: fields,
          create: { name, nameSearch, ...fields },
        });
        itemIds.set(item.name, created.id);
        foodItems += 1;
      }

      // The template and the inventory ship as one unit. A template
      // demonstrating a real inventory-backed section table teaches far more
      // than one built from base components alone — and it needs categories and
      // items to bind to. Choosing examples gets both; structure-only gets
      // neither.
      templates = await seedExampleTemplate(prisma, categoryIds, itemIds);
      savedComponents = await seedSavedComponents(prisma);
    }

    const enabledLanguages = await prisma.language.count({ where: { isEnabled: true } });

    return {
      languages: REFERENCE_LANGUAGES.length,
      enabledLanguages,
      systemPrompts: SEED_SYSTEM_PROMPTS.length,
      categories,
      foodItems,
      templates,
      savedComponents,
      globalLimit: STRUCTURAL.globalLimit,
    };
  }
}

/**
 * Upsert the example template by name.
 *
 * Neither Builder table has a unique constraint on `name`, so this looks the
 * row up first rather than using `upsert`. Seeding twice must not leave two
 * templates called the same thing — a duplicate here is worse than untidy,
 * because the Builder lists them side by side with no way to tell them apart.
 */
const seedExampleTemplate = async (
  prisma: PrismaClient,
  categoryIds: ReadonlyMap<string, number>,
  itemIds: ReadonlyMap<string, number>
): Promise<number> => {
  const templateData = buildExampleTemplateData(categoryIds, itemIds) as object;

  const existing = await prisma.shoppingListBuilderTemplate.findFirst({
    where: { name: EXAMPLE_TEMPLATE_NAME },
    select: { id: true },
  });

  if (existing) {
    await prisma.shoppingListBuilderTemplate.update({
      where: { id: existing.id },
      data: { templateData },
    });
  } else {
    await prisma.shoppingListBuilderTemplate.create({
      data: { name: EXAMPLE_TEMPLATE_NAME, templateData },
    });
  }

  return 1;
};

/** The reusable blocks the example template was assembled from. */
const seedSavedComponents = async (prisma: PrismaClient): Promise<number> => {
  for (const component of EXAMPLE_SAVED_COMPONENTS) {
    const existing = await prisma.shoppingListBuilderComponent.findFirst({
      where: { name: component.name },
      select: { id: true },
    });

    const data = {
      name: component.name,
      componentType: component.componentType,
      componentData: component.componentData as object,
    };

    if (existing) {
      await prisma.shoppingListBuilderComponent.update({ where: { id: existing.id }, data });
    } else {
      await prisma.shoppingListBuilderComponent.create({ data });
    }
  }

  return EXAMPLE_SAVED_COMPONENTS.length;
};
