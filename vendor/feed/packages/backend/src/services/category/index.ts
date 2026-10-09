// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

/**
 * Atomic Category mutations and append-only operational history.
 * See docs/reports/operational-analytics-design.md.
 */

import { Category, Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../db';

type Tx = Prisma.TransactionClient;
type CategoryRow = Category;

export interface CategoryEventFlags {
  recordsLimit: boolean;
  recordsIdentity: boolean;
}

export type CategoryEventKind =
  | 'migration_baseline'
  | 'created'
  | 'updated'
  | 'deleted';

const ALL_FLAGS: CategoryEventFlags = {
  recordsLimit: true,
  recordsIdentity: true,
};

const NO_FLAGS: CategoryEventFlags = {
  recordsLimit: false,
  recordsIdentity: false,
};

export const categoryEventFlags = (
  before: CategoryRow,
  after: CategoryRow
): CategoryEventFlags => ({
  recordsLimit:
    before.limit !== after.limit || before.limitType !== after.limitType,
  recordsIdentity:
    before.name !== after.name || before.icon !== after.icon,
});

export const hasCategoryEventChange = (flags: CategoryEventFlags) =>
  flags.recordsLimit || flags.recordsIdentity;

export async function writeCategoryInventoryEvent(
  tx: Tx,
  category: CategoryRow,
  eventKind: CategoryEventKind,
  flags: CategoryEventFlags,
  detached = false
) {
  await tx.categoryInventoryEvent.create({
    data: {
      categoryId: detached ? null : category.id,
      sourceCategoryId: category.id,
      categoryName: category.name,
      limit: category.limit,
      limitType: category.limitType,
      icon: category.icon,
      eventKind,
      ...flags,
    },
  });
}

export async function createCategoryWithEvent(
  data: Prisma.CategoryCreateInput,
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    const category = await tx.category.create({ data });
    await writeCategoryInventoryEvent(tx, category, 'created', ALL_FLAGS);
    return category;
  });
}

export async function updateCategoryWithEvent(
  id: number,
  data: Prisma.CategoryUpdateInput,
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    const before = await tx.category.findUnique({ where: { id } });
    if (!before) {
      const error = new Error('Category not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    const category = await tx.category.update({ where: { id }, data });
    const flags = categoryEventFlags(before, category);
    if (hasCategoryEventChange(flags)) {
      await writeCategoryInventoryEvent(tx, category, 'updated', flags);
    }
    return { category, before };
  });
}

export async function deleteCategoryWithEvent(
  id: number,
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    const category = await tx.category.findUnique({
      where: { id },
      include: { _count: { select: { foodItems: true } } },
    });
    if (!category) {
      const error = new Error('Category not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    if (category._count.foodItems > 0) {
      const count = category._count.foodItems;
      const error = new Error(
        `${category.name} cannot be deleted because ${count} food item${count === 1 ? ' is' : 's are'} still assigned. Please delete or reassign the item${count === 1 ? '' : 's'} and try again.`
      ) as Error & { statusCode?: number };
      error.statusCode = 409;
      throw error;
    }
    await writeCategoryInventoryEvent(tx, category, 'deleted', NO_FLAGS, true);
    await tx.translation.deleteMany({
      where: { originalText: category.name, type: 'Category' },
    });
    await tx.category.delete({ where: { id } });
    return category;
  });
}
