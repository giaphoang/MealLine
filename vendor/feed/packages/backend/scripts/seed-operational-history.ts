// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

/**
 * Deterministic development fixture for Availability & Service Pressure.
 *
 * This script intentionally models operational observations rather than
 * consumption. It uses FEED's production catalog, the April–July 2026 OFB
 * delivery cadence derived from the intentionally untracked internal workbook
 * OFB_Orders.xlsx held outside the repository, and the pantry schedule documented in
 * docs/reports/development-history-fixture.md.
 *
 * Usage:
 *   NODE_ENV=development DATABASE_URL=file:/path/to/dev.db \
 *     npx ts-node scripts/seed-operational-history.ts \
 *     --confirm-development-fixture --end-date=2026-07-11
 */

import { Prisma, PrismaClient } from '@prisma/client';
import {
  localDateStartUtc,
  shiftLocalDate,
} from '../src/services/inventory-analytics/timezone';

const prisma = new PrismaClient();
const TIME_ZONE = 'America/Los_Angeles';
const DAYS_OF_HISTORY = 90;
const NO_LIMIT = 100;

const args = new Set(process.argv.slice(2));
const endDateArg = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--end-date='))
  ?.split('=')[1];

if (!args.has('--confirm-development-fixture')) {
  throw new Error(
    'Refusing to replace operational history without --confirm-development-fixture.'
  );
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('This development fixture must never run in production.');
}

const endDate = endDateArg ?? '2026-07-11';
const startDate = shiftLocalDate(endDate, -(DAYS_OF_HISTORY - 1));

const atLocal = (date: string, hour: number, minute: number) =>
  new Date(
    localDateStartUtc(date, TIME_ZONE).getTime() +
      (hour * 60 + minute) * 60_000
  );

const localWeekday = (date: string) =>
  new Date(`${date}T12:00:00.000Z`).getUTCDay();

const deterministic = (itemId: number, week: number, salt: number) => {
  let value = (itemId * 73_856_093) ^ (week * 19_349_663) ^ (salt * 83_492_791);
  value = Math.imul(value ^ (value >>> 13), 1_274_126_177);
  return (value ^ (value >>> 16)) >>> 0;
};

/**
 * The presence matrix is derived from the intentionally untracked internal
 * OFB workbook. Workbook dates are predominantly Mondays; each entry controls
 * the following Tuesday restock. No item-level quantity or causation is
 * inferred from the workbook, and the source workbook is not needed at run
 * time.
 */
const OFB_STAPLE_AVAILABILITY: Record<string, Set<string>> = {
  '2026-04-14': new Set(['egg', 'milk', 'bread', 'rice', 'pasta', 'soup', 'tuna']),
  '2026-04-21': new Set(['egg', 'milk', 'bread', 'rice', 'soup', 'tuna']),
  '2026-04-28': new Set(['egg', 'bread', 'rice', 'pasta', 'soup', 'tuna']),
  '2026-05-05': new Set(['egg', 'milk', 'bread', 'rice', 'pasta', 'soup', 'tuna']),
  '2026-05-12': new Set(['milk', 'bread', 'rice', 'pasta', 'tuna']),
  '2026-05-19': new Set(['egg', 'milk', 'bread', 'rice', 'pasta', 'soup', 'tuna']),
  // Memorial Day week uses the workbook's Thursday 2026-05-21 delivery.
  '2026-05-26': new Set(['milk', 'pasta', 'soup']),
  '2026-06-02': new Set(['egg', 'milk', 'bread', 'rice', 'pasta', 'tuna']),
  '2026-06-09': new Set(['egg', 'milk', 'bread', 'rice', 'pasta']),
  '2026-06-16': new Set(['egg', 'milk', 'bread', 'pasta']),
  '2026-06-23': new Set(['egg', 'milk', 'bread']),
  '2026-06-30': new Set(['egg', 'milk', 'bread', 'rice', 'pasta', 'soup', 'tuna']),
  '2026-07-07': new Set(['egg', 'milk', 'bread', 'rice', 'soup', 'tuna']),
};

const STAPLES: Record<string, string> = {
  egg: 'Eggs',
  milk: 'Milk',
  bread: 'Bread',
  rice: 'Rice',
  pasta: 'Spaghetti',
  soup: 'Vegetable Soup',
  tuna: 'Tuna',
};

const TRADER_JOES_NAMES = new Set([
  'Apples',
  'Asian Pears',
  'Avocado',
  'Bagged Salad',
  'Bananas',
  'Berries',
  'Blackberries',
  'Blueberries',
  'Broccoli',
  'California Rolls',
  'Cherries',
  'Fresh Herbs',
  'Fruit Flavored Greek Yogurt',
  'Guacamole',
  'Juice',
  'Lettuce',
  'Pre-Cut Pineapple',
  'Roasted Veggies',
  'Roma Tomatoes',
  'Salad Greens',
  'Sliced Bread',
  'Strawberries',
]);

const FRED_MEYER_NAMES = new Set([
  'Beef',
  'Butter',
  'Cheese',
  'Chicken',
  'Fish',
  'Frozen Berries',
  'Frozen Pasta Dinner',
  'Fruit Flavored Yogurt',
  'Ham Steak (precooked)',
  'Misc. Frozen',
  'Pork',
  'Shrimp Dumplings',
  'Turkey',
]);

const CLEARANCE_NAMES = new Set([
  'Butternut Squash',
  'Cabbage',
  'Organic Pumpkin Pie Mix',
  'Parsnips',
  'Red Potatoes',
  'Russett Potatoes',
  'Rutabagas',
  'Scalloped Potatoes',
  'Sweet Potato Pie Mix',
]);

const CATEGORY_BASELINE_LIMITS: Record<string, number> = {
  Beans: NO_LIMIT,
  'Canned Goods': NO_LIMIT,
  Dairy: NO_LIMIT,
  'Dry Goods': NO_LIMIT,
  Frozen: 2,
  'Grab & Go': 2,
  'Hygiene Items': 5,
  Meats: 1,
  Produce: NO_LIMIT,
};

type FoodItemRow = Prisma.FoodItemGetPayload<{ include: { category: true } }>;
type FoodState = {
  isInStock: boolean;
  isLimited: boolean;
  isClearance: boolean;
  limit: number;
  limitType: string;
  estimatedQuantity: number | null;
  supplySource: string | null;
};

type CategoryState = {
  limit: number;
  limitType: string;
};

const baselineItemLimit = (item: FoodItemRow) => {
  if (
    TRADER_JOES_NAMES.has(item.name) ||
    FRED_MEYER_NAMES.has(item.name) ||
    CLEARANCE_NAMES.has(item.name)
  ) return NO_LIMIT;
  if (Object.values(STAPLES).includes(item.name)) return 1;
  if (['Produce', 'Grab & Go'].includes(item.category.name)) return NO_LIMIT;
  if (item.category.name === 'Meats') return 1;
  if (item.category.name === 'Frozen') return 2;
  return deterministic(item.id, 0, 30) % 100 < 58 ? 1 : NO_LIMIT;
};

const main = async () => {
  const [items, categories] = await Promise.all([
    prisma.foodItem.findMany({ include: { category: true }, orderBy: { id: 'asc' } }),
    prisma.category.findMany({ orderBy: { id: 'asc' } }),
  ]);

  const itemsByName = new Map(items.map((item) => [item.name, item]));
  const missingStaples = Object.values(STAPLES).filter(
    (name) => !itemsByName.has(name)
  );
  if (missingStaples.length > 0) {
    throw new Error(`Required catalog items are missing: ${missingStaples.join(', ')}`);
  }

  const foodStates = new Map<number, FoodState>();
  const categoryStates = new Map<number, CategoryState>();
  const foodEvents: Prisma.FoodItemInventoryEventCreateManyInput[] = [];
  const categoryEvents: Prisma.CategoryInventoryEventCreateManyInput[] = [];
  const baselineAt = atLocal(startDate, 8, 45);

  const foodSnapshot = (
    item: FoodItemRow,
    state: FoodState,
    recordedAt: Date,
    eventKind: string,
    flags: {
      recordsQuantity?: boolean;
      recordsSupply?: boolean;
      recordsStatus?: boolean;
      recordsLimit?: boolean;
      recordsIdentity?: boolean;
    }
  ): Prisma.FoodItemInventoryEventCreateManyInput => ({
    foodItemId: item.id,
    sourceFoodItemId: item.id,
    itemName: item.name,
    categoryId: item.categoryId,
    categoryName: item.category.name,
    ...state,
    eventKind,
    recordsQuantity: flags.recordsQuantity ?? false,
    recordsSupply: flags.recordsSupply ?? false,
    recordsStatus: flags.recordsStatus ?? false,
    recordsLimit: flags.recordsLimit ?? false,
    recordsIdentity: flags.recordsIdentity ?? false,
    recordedAt,
  });

  const recordFood = (
    item: FoodItemRow,
    recordedAt: Date,
    patch: Partial<FoodState>
  ) => {
    const before = foodStates.get(item.id)!;
    const after: FoodState = { ...before, ...patch };
    if (!after.isInStock) {
      after.isLimited = false;
      after.isClearance = false;
    }
    const recordsQuantity = before.estimatedQuantity !== after.estimatedQuantity;
    const recordsSupply = before.supplySource !== after.supplySource;
    const recordsStatus =
      before.isInStock !== after.isInStock ||
      before.isLimited !== after.isLimited ||
      before.isClearance !== after.isClearance;
    const recordsLimit =
      before.limit !== after.limit || before.limitType !== after.limitType;
    if (!recordsQuantity && !recordsSupply && !recordsStatus && !recordsLimit) return;
    foodStates.set(item.id, after);
    foodEvents.push(
      foodSnapshot(item, after, recordedAt, 'updated', {
        recordsQuantity,
        recordsSupply,
        recordsStatus,
        recordsLimit,
      })
    );
  };

  const recordCategory = (
    category: (typeof categories)[number],
    recordedAt: Date,
    patch: Partial<CategoryState>
  ) => {
    const before = categoryStates.get(category.id)!;
    const after = { ...before, ...patch };
    if (before.limit === after.limit && before.limitType === after.limitType) return;
    categoryStates.set(category.id, after);
    categoryEvents.push({
      categoryId: category.id,
      sourceCategoryId: category.id,
      categoryName: category.name,
      icon: category.icon,
      ...after,
      eventKind: 'updated',
      recordsLimit: true,
      recordsIdentity: false,
      recordedAt,
    });
  };

  for (const item of items) {
    const isDonationItem = TRADER_JOES_NAMES.has(item.name) || FRED_MEYER_NAMES.has(item.name);
    const isStaple = Object.values(STAPLES).includes(item.name);
    const initialAvailable =
      !isDonationItem && !isStaple && deterministic(item.id, 0, 1) % 100 < 62;
    const initialLimited = initialAvailable && deterministic(item.id, 0, 2) % 100 < 12;
    const initialClearance = false;
    const state: FoodState = {
      isInStock: initialAvailable,
      isLimited: initialLimited,
      isClearance: initialClearance,
      limit: baselineItemLimit(item),
      limitType: 'household',
      estimatedQuantity: null,
      supplySource: null,
    };
    foodStates.set(item.id, state);
    foodEvents.push(
      foodSnapshot(item, state, baselineAt, 'migration_baseline', {
        recordsStatus: true,
        recordsLimit: true,
        recordsIdentity: true,
      })
    );
  }

  for (const category of categories) {
    const state = {
      limit: CATEGORY_BASELINE_LIMITS[category.name] ?? NO_LIMIT,
      limitType: 'household',
    };
    categoryStates.set(category.id, state);
    categoryEvents.push({
      categoryId: category.id,
      sourceCategoryId: category.id,
      categoryName: category.name,
      icon: category.icon,
      ...state,
      eventKind: 'migration_baseline',
      recordsLimit: true,
      recordsIdentity: true,
      recordedAt: baselineAt,
    });
  }

  const traderItems = items.filter((item) => TRADER_JOES_NAMES.has(item.name));
  const fredItems = items.filter((item) => FRED_MEYER_NAMES.has(item.name));
  const clearanceItems = items.filter((item) => CLEARANCE_NAMES.has(item.name));
  const stapleIds = new Set(
    Object.values(STAPLES).map((name) => itemsByName.get(name)!.id)
  );
  const generalItems = items.filter(
    (item) =>
      !stapleIds.has(item.id) &&
      !TRADER_JOES_NAMES.has(item.name) &&
      !FRED_MEYER_NAMES.has(item.name) &&
      ['Beans', 'Canned Goods', 'Dry Goods'].includes(item.category.name)
  );
  const categoriesByName = new Map(categories.map((category) => [category.name, category]));

  let tuesday = startDate;
  while (localWeekday(tuesday) !== 2) tuesday = shiftLocalDate(tuesday, 1);

  let week = 0;
  while (tuesday <= endDate) {
    const wednesday = shiftLocalDate(tuesday, 1);
    const thursday = shiftLocalDate(tuesday, 2);
    const availableStaples = OFB_STAPLE_AVAILABILITY[tuesday] ?? new Set<string>();

    // OFB staples: Monday receipt is reflected in Tuesday's 9am update.
    Object.entries(STAPLES).forEach(([key, name], index) => {
      const item = itemsByName.get(name)!;
      if (!availableStaples.has(key)) return;
      recordFood(item, atLocal(tuesday, 9, index * 2), {
        isInStock: true,
        isLimited: false,
        isClearance: false,
        limit: index % 3 === 0 ? 2 : 1,
        limitType: 'household',
        supplySource: 'mixed_other',
      });

      if (wednesday <= endDate) {
        recordFood(item, atLocal(wednesday, 9, index * 2), {
          isLimited: true,
          isClearance: false,
          limit: 1,
        });
      }

      const runsOutWednesday = ['egg', 'milk', 'bread'].includes(key)
        ? deterministic(item.id, week, 10) % 100 < 72
        : deterministic(item.id, week, 11) % 100 < 34;
      const outDate = runsOutWednesday ? wednesday : thursday;
      if (outDate <= endDate) {
        const outHour = runsOutWednesday ? 13 : 9;
        const outMinute = runsOutWednesday ? 18 + index * 4 : index * 3;
        recordFood(item, atLocal(outDate, outHour, outMinute), {
          isInStock: false,
          isLimited: false,
          isClearance: false,
        });
      }
    });

    // Trader Joe's: rotating Tuesday donation, normally gone by early afternoon.
    const traderCount = Math.min(6, traderItems.length);
    for (let index = 0; index < traderCount; index++) {
      const item = traderItems[(week * 5 + index * 3) % traderItems.length];
      recordFood(item, atLocal(tuesday, 9, 10 + index * 2), {
        isInStock: true,
        isLimited: true,
        isClearance: false,
        limit: 1,
        limitType: 'household',
        supplySource: 'donated',
      });
      if (index % 3 === 0) {
        recordFood(item, atLocal(tuesday, 12, 25 + index), {
          isLimited: false,
          isClearance: true,
        });
      }
      recordFood(item, atLocal(tuesday, 13, 20 + index * 4), {
        isInStock: false,
        isLimited: false,
        isClearance: false,
        limit: NO_LIMIT,
      });
    }

    // Fred Meyer: smaller Thursday frozen/meat/dairy donation.
    if (thursday <= endDate) {
      const fredCount = Math.min(4, fredItems.length);
      for (let index = 0; index < fredCount; index++) {
        const item = fredItems[(week * 3 + index * 2) % fredItems.length];
        recordFood(item, atLocal(thursday, 9, 10 + index * 3), {
          isInStock: true,
          isLimited: true,
          isClearance: false,
          limit: 1,
          limitType: 'household',
          supplySource: 'donated',
        });
        if (index === 0 && week % 2 === 0) {
          recordFood(item, atLocal(thursday, 12, 40), {
            isLimited: false,
            isClearance: true,
          });
        }
        recordFood(item, atLocal(thursday, 13, 18 + index * 6), {
          isInStock: false,
          isLimited: false,
          isClearance: false,
          limit: NO_LIMIT,
        });
      }
    }

    // Visible surplus/clearance episodes for bulky or seasonal products.
    const clearanceCount = Math.min(2, clearanceItems.length);
    for (let index = 0; index < clearanceCount; index++) {
      const item = clearanceItems[(week * 2 + index * 4) % clearanceItems.length];
      recordFood(item, atLocal(tuesday, 9, 42 + index * 3), {
        isInStock: true,
        isLimited: false,
        isClearance: true,
        limit: NO_LIMIT,
        supplySource: 'donated',
      });
      if (thursday <= endDate) {
        recordFood(item, atLocal(thursday, 13, 48 + index * 4), {
          isInStock: false,
          isLimited: false,
          isClearance: false,
        });
      }
    }

    // Broader OFB pantry mix: modest rotating availability beyond the staples.
    const generalCount = Math.min(9, generalItems.length);
    for (let index = 0; index < generalCount; index++) {
      const item = generalItems[(week * 7 + index * 5) % generalItems.length];
      recordFood(item, atLocal(tuesday, 9, 28 + index), {
        isInStock: true,
        isLimited: false,
        isClearance: false,
        limit: index % 4 === 0 ? 2 : baselineItemLimit(item),
        supplySource: item.supplySource,
      });
      if (wednesday <= endDate && index % 2 === 0) {
        recordFood(item, atLocal(wednesday, 9, 25 + index), {
          isLimited: true,
          limit: 1,
        });
      }
      if (thursday <= endDate && deterministic(item.id, week, 20) % 100 < 58) {
        recordFood(item, atLocal(thursday, 9, 25 + index), {
          isInStock: false,
          isLimited: false,
          isClearance: false,
          limit: NO_LIMIT,
        });
      }
    }

    // Category-level rationing moves independently of individual item limits.
    const constrainedCategories = ['Canned Goods', 'Dairy', 'Dry Goods'];
    constrainedCategories.forEach((name, index) => {
      const category = categoriesByName.get(name);
      if (!category) return;
      recordCategory(category, atLocal(tuesday, 9, 48 + index), {
        limit: NO_LIMIT,
        limitType: 'household',
      });
      const missingCount = Object.keys(STAPLES).length - availableStaples.size;
      if (wednesday <= endDate && (missingCount >= 2 || (week + index) % 3 !== 0)) {
        recordCategory(category, atLocal(wednesday, 9, 48 + index), {
          limit: name === 'Dairy' ? 1 : 2,
          limitType: 'household',
        });
      }
      if (thursday <= endDate && (week + index) % 2 === 0) {
        recordCategory(category, atLocal(thursday, 9, 48 + index), {
          limit: 1,
          limitType: 'household',
        });
      }
    });

    week += 1;
    tuesday = shiftLocalDate(tuesday, 7);
  }

  await prisma.$transaction(async (tx) => {
    await tx.foodItemInventoryEvent.deleteMany();
    await tx.categoryInventoryEvent.deleteMany();
    await tx.foodItemInventoryEvent.createMany({ data: foodEvents });
    await tx.categoryInventoryEvent.createMany({ data: categoryEvents });

    for (const item of items) {
      const state = foodStates.get(item.id)!;
      await tx.foodItem.update({
        where: { id: item.id },
        data: state,
      });
    }
    for (const category of categories) {
      const state = categoryStates.get(category.id)!;
      await tx.category.update({
        where: { id: category.id },
        data: state,
      });
    }
  });

  const statusEvents = foodEvents.filter((event) => event.recordsStatus).length;
  const limitEvents =
    foodEvents.filter((event) => event.recordsLimit).length +
    categoryEvents.filter((event) => event.recordsLimit).length;
  console.log(
    JSON.stringify(
      {
        startDate,
        endDate,
        foodItems: items.length,
        categories: categories.length,
        foodEvents: foodEvents.length,
        categoryEvents: categoryEvents.length,
        statusEvents,
        limitEvents,
        weeks: week,
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
