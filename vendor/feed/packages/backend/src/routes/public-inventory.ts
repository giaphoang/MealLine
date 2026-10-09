// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { NextFunction, Request, Response, Router } from 'express';
import prisma from '../db';
import { version } from '../../package.json';
import { resolveBrand } from '../services/brand-config';
import { getDeploymentSettings } from '../services/deployment-settings';

const router = Router();

type PublicInventoryFoodItem = {
  id: number;
  name: string;
  translations: Record<string, string>;
  limit: number;
  limitType: string;
  statusTags: {
    inStock: true;
    limited: boolean;
    clearance: boolean;
  };
  dietaryFlags: {
    vegan: boolean;
    vegetarian: boolean;
    glutenFree: boolean;
    organic: boolean;
    halal: boolean;
    kosher: boolean;
    readyToEat: boolean;
  };
  updatedAt: string;
};

type PublicInventoryCategory = {
  id: number;
  name: string;
  translations: Record<string, string>;
  icon: string | null;
  limit: number;
  limitType: string;
  itemCount: number;
  items: PublicInventoryFoodItem[];
};

// Index generic `Translation` rows as englishName -> (language -> translatedText)
// so feed entries can fall back to the canonical translation store for any
// enabled language the denormalized tables are missing.
function indexGenericTranslations(
  rows: Array<{ originalText: string; language: string; translatedText: string | null }>
): Map<string, Map<string, string>> {
  const byName = new Map<string, Map<string, string>>();
  for (const row of rows) {
    if (typeof row.translatedText !== 'string' || row.translatedText.length === 0) continue;
    let byLanguage = byName.get(row.originalText);
    if (!byLanguage) {
      byLanguage = new Map<string, string>();
      byName.set(row.originalText, byLanguage);
    }
    byLanguage.set(row.language, row.translatedText);
  }
  return byName;
}

// Denormalized CategoryTranslation/FoodItemTranslation rows win; any enabled
// language still missing is filled from the generic `Translation` cache. The
// denormalized tables can have gaps (translations completed via a path that
// only wrote the generic table), so the generic store is the backstop. See
// ISSUES.md #41 (this fix) and #42 (the underlying two-store drift).
function resolveTranslations(
  denormalized: Array<{ language: string; name: string }>,
  fallbackByLanguage: Map<string, string> | undefined
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const translation of denormalized) {
    result[translation.language] = translation.name;
  }
  if (fallbackByLanguage) {
    for (const [language, translatedText] of fallbackByLanguage) {
      if (!(language in result)) {
        result[language] = translatedText;
      }
    }
  }
  return result;
}

function setPublicInventoryHeaders(res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/json');
}

router.use((_req: Request, res: Response, next: NextFunction) => {
  setPublicInventoryHeaders(res);
  next();
});

router.options('/inventory.json', (_req: Request, res: Response) => {
  res.status(204).end();
});

router.get('/inventory.json', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Read the deployment capability, not the appearance. Whether this feed is
    // published is an operational decision an administrator owns in Data
    // Management; it must stay answerable while FEED runs its built-in identity,
    // which has no stored appearance row to carry a flag.
    const { publicInventoryEnabled } = await getDeploymentSettings();
    // Identity for the payload still comes from the brand; only the decision to
    // publish at all moved out of it.
    const brand = await resolveBrand();
    if (!publicInventoryEnabled) {
      return res.status(404).json({
        error: {
          message: 'This organization does not publish a public inventory feed.',
          code: 'PUBLIC_INVENTORY_DISABLED',
        },
      });
    }
    const enabledLanguages = await prisma.language.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        name: true,
      },
    });
    const enabledLanguageNames = enabledLanguages.map((language) => language.name);

    const categories = await prisma.category.findMany({
      include: {
        translations: {
          where: {
            language: { in: enabledLanguageNames },
          },
          select: {
            language: true,
            name: true,
          },
        },
        foodItems: {
          where: { isInStock: true },
          include: {
            translations: {
              where: {
                language: { in: enabledLanguageNames },
              },
              select: {
                language: true,
                name: true,
              },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const inStockCategories = categories.filter((category) => category.foodItems.length > 0);

    // Backstop the denormalized translations with the generic `Translation`
    // cache for any enabled-language gap. Names are unique (Category.nameSearch
    // and FoodItem.nameSearch are @unique), so matching on the English name is
    // unambiguous. Only completed rows are read so failed-row error strings
    // never reach the public feed.
    const categoryNames = Array.from(new Set(inStockCategories.map((category) => category.name)));
    const foodItemNames = Array.from(
      new Set(inStockCategories.flatMap((category) => category.foodItems.map((item) => item.name)))
    );

    const [genericCategoryRows, genericFoodItemRows] = await Promise.all([
      categoryNames.length > 0
        ? prisma.translation.findMany({
          where: {
            type: 'Category',
            status: 'completed',
            language: { in: enabledLanguageNames },
            originalText: { in: categoryNames },
          },
          select: { originalText: true, language: true, translatedText: true },
        })
        : Promise.resolve([]),
      foodItemNames.length > 0
        ? prisma.translation.findMany({
          where: {
            type: 'FoodItem',
            status: 'completed',
            language: { in: enabledLanguageNames },
            originalText: { in: foodItemNames },
          },
          select: { originalText: true, language: true, translatedText: true },
        })
        : Promise.resolve([]),
    ]);

    const genericCategoryByName = indexGenericTranslations(genericCategoryRows);
    const genericFoodItemByName = indexGenericTranslations(genericFoodItemRows);

    const publicCategories: PublicInventoryCategory[] = inStockCategories
      .map((category) => {
        const items = category.foodItems.map((item): PublicInventoryFoodItem => ({
          id: item.id,
          name: item.name,
          translations: resolveTranslations(item.translations, genericFoodItemByName.get(item.name)),
          limit: item.limit,
          limitType: item.limitType,
          statusTags: {
            inStock: true,
            limited: item.isLimited,
            clearance: item.isClearance,
          },
          dietaryFlags: {
            vegan: item.vegan,
            vegetarian: item.vegetarian,
            glutenFree: item.glutenFree,
            organic: item.organic,
            halal: item.halal,
            kosher: item.kosher,
            readyToEat: item.readyToEat,
          },
          updatedAt: item.updatedAt.toISOString(),
        }));

        return {
          id: category.id,
          name: category.name,
          translations: resolveTranslations(category.translations, genericCategoryByName.get(category.name)),
          icon: category.icon,
          limit: category.limit,
          limitType: category.limitType,
          itemCount: items.length,
          items,
        };
      });

    res.json({
      generatedAt: new Date().toISOString(),
      version,
      organization: {
        name: brand.config.identity.organizationName,
        appName: brand.config.identity.appName,
      },
      languages: enabledLanguageNames,
      categories: publicCategories,
      totals: {
        categories: publicCategories.length,
        foodItems: publicCategories.reduce((sum, category) => sum + category.itemCount, 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
