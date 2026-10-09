// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import prisma from '../../db';

type DietaryFilterMode = 'include_all' | 'include_only' | 'exclude' | 'custom';

interface DietaryFilters {
  filterMode?: DietaryFilterMode;
  includedFlags?: Array<
    'vegan' | 'vegetarian' | 'glutenFree' | 'organic' | 'halal' | 'kosher' | 'readyToEat'
  >;
  excludedFlags?: Array<
    'vegan' | 'vegetarian' | 'glutenFree' | 'organic' | 'halal' | 'kosher' | 'readyToEat'
  >;
}

interface ProceduralElements {
  includeListNumber?: boolean;
  includeFlipInstructions?: boolean;
  includeCategoryLimits?: boolean;
  includeDietaryFlags?: boolean;
  includeInventoryFlags?: boolean;
}

interface TranslationOptions {
  skipElements?: string[];
  includeEnglishElements?: string[];
  useCacheElements?: string[];
  saveFormattingChoices?: boolean;
}

export interface GenerateOptionsRequest {
  templateId: number;
  title: string;
  generatedBy?: string;
  languages?: string[];
  translationOptions?: TranslationOptions;
  proceduralElements?: ProceduralElements;
  dietaryFilters?: DietaryFilters;
  header?: {
    includeDate?: boolean;
  };
}

export class ShoppingListGenerationService {
  /**
   * Generates shopping list data server-side from a template and options.
   * Mirrors the frontend data shape to preserve rendering and print flows.
   */
  static async generateFromTemplate(options: GenerateOptionsRequest) {
    const template = await prisma.shoppingListTemplate.findUnique({
      where: { id: options.templateId },
      include: {
        sections: {
          orderBy: { displayOrder: 'asc' },
          include: { category: true }
        }
      }
    });

    if (!template) {
      const error = new Error('Template not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }

    const globalLimitRec = await prisma.globalLimit.findFirst();
    const globalLimit = globalLimitRec?.value ?? 10;

    const sections: any[] = [];
    for (const section of template.sections) {
      const base: any = {
        id: section.id.toString(),
        sectionType: section.sectionType,
        title: section.title ?? undefined,
        subtitle: section.subtitle ?? undefined,
        displayOrder: section.displayOrder,
        isEnabled: section.isEnabled,
        configuration: section.configuration ?? {}
      };

      if (section.sectionType === 'category' && section.categoryId) {
        const categoryId = section.categoryId;
        const category = section.category;
        // Fetch in-stock items for this category
        const foodItems = await prisma.foodItem.findMany({
          where: { categoryId, isInStock: true },
          orderBy: { name: 'asc' }
        });

        // Apply dietary filters (graceful degradation: if anything fails, use unfiltered)
        const filteredItems = this.applyDietaryFiltersSafe(foodItems, options.dietaryFilters);

        const items = filteredItems.map((item) => {
          let limit = globalLimit;
          let limitSource: 'item' | 'category' | 'global' = 'global';

          // No-Limit sentinel aligns with FE (100 = No Limit)
          if (item.limit && item.limit !== 100) {
            limit = item.limit;
            limitSource = 'item';
          } else if (category?.limit && category.limit !== 100) {
            limit = category.limit;
            limitSource = 'category';
          }

          return {
            id: item.id,
            name: item.name,
            limit,
            limitSource,
            isInStock: item.isInStock === true,
            included: true
          };
        });

        sections.push({
          ...base,
          categoryId,
          categoryName: category?.name ?? 'Unknown Category',
          categoryIcon: category?.icon ?? 'Package',
          items
        });
        continue;
      }

      if (section.sectionType === 'custom-text') {
        // Title section uses title as display text when configured as title
        const cfg = section.configuration as any;
        if (section.displayOrder === 0 && cfg?.textStyle === 'title') {
          base.textContent = section.title ?? '';
        } else {
          base.textContent = cfg?.textContent || section.title || '';
        }
        base.textStyle = cfg?.textStyle || 'body';
        base.alignment = cfg?.alignment || 'left';
      } else if (section.sectionType === 'form') {
        const cfg = section.configuration as any;
        base.formFields = cfg?.formFields || [];
      }

      sections.push(base);
    }

    // Preserve FE data contract; optional metadata carries options for auditing
    const generatedData = {
      templateName: template.name,
      layoutType: template.layoutType,
      generatedAt: new Date().toISOString(),
      sections,
      // Non-breaking extras (ignored by FE types but stored for reference)
      _options: {
        languages: options.languages,
        translationOptions: options.translationOptions,
        proceduralElements: options.proceduralElements,
        dietaryFilters: options.dietaryFilters,
        header: {
          includeDate: Boolean(options.header?.includeDate),
        },
      }
    };

    return generatedData;
  }

  private static applyDietaryFiltersSafe(items: any[], filters?: DietaryFilters) {
    try {
      return this.applyDietaryFilters(items, filters);
    } catch (err) {
      // Graceful degradation: return unfiltered
      return items;
    }
  }

  private static applyDietaryFilters(items: any[], filters?: DietaryFilters) {
    if (!filters || !filters.filterMode || filters.filterMode === 'include_all') {
      return items;
    }

    const hasFlag = (item: any, flag: string) => Boolean((item as any)[flag] ?? item?.dietaryFlags?.[flag]);

    if (filters.filterMode === 'include_only' && filters.includedFlags && filters.includedFlags.length > 0) {
      return items.filter((item) => filters.includedFlags!.every((f) => hasFlag(item, f)));
    }

    if (filters.filterMode === 'exclude' && filters.excludedFlags && filters.excludedFlags.length > 0) {
      return items.filter((item) => filters.excludedFlags!.every((f) => !hasFlag(item, f)));
    }

    if (filters.filterMode === 'custom') {
      const inc = filters.includedFlags || [];
      const exc = filters.excludedFlags || [];
      return items.filter((item) =>
        inc.every((f) => hasFlag(item, f)) && exc.every((f) => !hasFlag(item, f))
      );
    }

    return items;
  }
}

export default ShoppingListGenerationService;
