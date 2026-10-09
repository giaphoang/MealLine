// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Centralized food-item mutation service
 * (docs/reports/operational-analytics-design.md).
 *
 * All FoodItem writes flow through here so that (a) the stock/count
 * consistency rules in `stock-consistency.ts` apply on every pathway and
 * (b) every effective tracked change writes the item and its append-only
 * `FoodItemInventoryEvent` atomically in one Prisma transaction. A deletion
 * writes its final event before removing the item; the FK's `SetNull`
 * detaches the live pointer while `sourceFoodItemId` preserves history.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../db';
import {
  DietaryFlags,
  StatusFlags,
} from '../../utils/foodItemUtils';
import {
  computeEventRecordFlags,
  isEffectiveTrackedChange,
  resolveStockAndQuantity,
  EventRecordFlags,
  TrackedItemState,
} from './stock-consistency';

type Tx = Prisma.TransactionClient;

export type InventoryEventKind =
  | 'migration_baseline'
  | 'created'
  | 'updated'
  | 'deleted';

export interface SupplyRequest {
  estimatedQuantity?: number | null;
  supplySource?: 'donated' | 'purchased' | 'mixed_other' | null;
  /** True when the request explicitly carried an estimatedQuantity key. */
  estimatedQuantityProvided: boolean;
}

export interface CreateFoodItemInput {
  fulfilment?: { quantity: number; unit: string; requiresStove: boolean; requiresFridge: boolean };
  name: string;
  limit: number;
  limitType: 'person' | 'household';
  categoryId: number;
  statusFlags?: Partial<StatusFlags>;
  dietaryFlags?: Partial<DietaryFlags>;
  supply?: SupplyRequest;
}

export interface UpdateFoodItemInput {
  fulfilment?: { quantity: number; unit: string; requiresStove: boolean; requiresFridge: boolean };
  name?: string;
  limit?: number;
  limitType?: 'person' | 'household';
  categoryId?: number;
  statusFlags?: Partial<StatusFlags>;
  dietaryFlags?: Partial<DietaryFlags>;
  supply?: SupplyRequest;
}

type FoodItemWithCategory = Prisma.FoodItemGetPayload<{
  include: { category: true };
}>;

const routeError = (message: string, statusCode: number) => {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
};

const trackedState = (item: FoodItemWithCategory): TrackedItemState => ({
  name: item.name,
  categoryId: item.categoryId,
  isInStock: item.isInStock,
  isLimited: item.isLimited,
  isClearance: item.isClearance,
  limit: item.limit,
  limitType: item.limitType,
  estimatedQuantity: item.estimatedQuantity,
  supplySource: item.supplySource,
});

const ALL_RECORD_FLAGS: EventRecordFlags = {
  recordsQuantity: true,
  recordsSupply: true,
  recordsStatus: true,
  recordsLimit: true,
  recordsIdentity: true,
};

// A deletion preserves the final state for historical lifetime boundaries,
// but it is not itself a quantity, price, status, or identity observation.
const NO_RECORD_FLAGS: EventRecordFlags = {
  recordsQuantity: false,
  recordsSupply: false,
  recordsStatus: false,
  recordsLimit: false,
  recordsIdentity: false,
};

export async function writeInventoryEvent(
  tx: Tx,
  item: FoodItemWithCategory,
  eventKind: InventoryEventKind,
  flags: EventRecordFlags,
  options: { detached?: boolean } = {}
): Promise<void> {
  await tx.foodItemInventoryEvent.create({
    data: {
      // For 'deleted' events the item row is removed in the same
      // transaction; SQLite's SET NULL would detach the pointer anyway,
      // but writing null directly keeps the ledger unambiguous.
      foodItemId: options.detached ? null : item.id,
      sourceFoodItemId: item.id,
      itemName: item.name,
      categoryId: item.categoryId,
      categoryName: item.category.name,
      isInStock: item.isInStock,
      isLimited: item.isLimited,
      isClearance: item.isClearance,
      limit: item.limit,
      limitType: item.limitType,
      estimatedQuantity: item.estimatedQuantity,
      supplySource: item.supplySource,
      eventKind,
      ...flags,
    },
  });
}

async function requireCategory(tx: Tx, categoryId: number) {
  const category = await tx.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw routeError('Category not found', 404);
  }
  return category;
}

/**
 * Create a food item plus its 'created' ledger event.
 *
 * New-item Supply defaults are Unknown quantity and Unknown source.
 */
export async function createFoodItemWithEvent(
  input: CreateFoodItemInput,
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    await requireCategory(tx, input.categoryId);

    const resolved = resolveStockAndQuantity(
      {
        // A brand-new item has no prior state; treat the requested availability
        // and optional quantity as independent annotations.
        isInStock: input.statusFlags?.isInStock ?? true,
        isLimited: input.statusFlags?.isLimited ?? false,
        isClearance: input.statusFlags?.isClearance ?? false,
        estimatedQuantity: null,
      },
      {
        statusFlags: input.statusFlags,
        estimatedQuantity: input.supply?.estimatedQuantity ?? null,
        estimatedQuantityProvided:
          input.supply?.estimatedQuantityProvided ?? false,
      }
    );

    const name = input.name.trim().replace(/\s+/g, ' ');
    const item = await tx.foodItem.create({
      data: {
        name,
        nameSearch: name.toLowerCase(),
        limit: input.limit,
        limitType: input.limitType,
        categoryId: input.categoryId,
        isInStock: resolved.isInStock,
        isLimited: resolved.isLimited,
        isClearance: resolved.isClearance,
        estimatedQuantity: resolved.estimatedQuantity,
        supplySource: input.supply?.supplySource ?? null,
        vegan: input.dietaryFlags?.vegan ?? false,
        vegetarian: input.dietaryFlags?.vegetarian ?? false,
        glutenFree: input.dietaryFlags?.glutenFree ?? false,
        organic: input.dietaryFlags?.organic ?? false,
        halal: input.dietaryFlags?.halal ?? false,
        kosher: input.dietaryFlags?.kosher ?? false,
        readyToEat: input.dietaryFlags?.readyToEat ?? false,
        ...input.fulfilment,
      },
      include: { category: true },
    });

    await writeInventoryEvent(tx, item, 'created', ALL_RECORD_FLAGS);
    return item;
  });
}

export interface UpdateFoodItemResult {
  item: FoodItemWithCategory;
  nameChanged: boolean;
  originalName: string;
}

/**
 * Update a food item; writes an 'updated' ledger event only when a tracked
 * operational dimension effectively changed.
 */
export async function updateFoodItemWithEvent(
  id: number,
  input: UpdateFoodItemInput,
  client: PrismaClient = prisma
): Promise<UpdateFoodItemResult> {
  return client.$transaction(async (tx) => {
    const existing = await tx.foodItem.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!existing) {
      throw routeError('Food item not found', 404);
    }
    if (input.categoryId) {
      await requireCategory(tx, input.categoryId);
    }

    const resolved = resolveStockAndQuantity(trackedState(existing), {
      statusFlags: input.statusFlags,
      estimatedQuantity: input.supply?.estimatedQuantity,
      estimatedQuantityProvided:
        input.supply?.estimatedQuantityProvided ?? false,
    });

    const data: Prisma.FoodItemUpdateInput = {
      isInStock: resolved.isInStock,
      isLimited: resolved.isLimited,
      isClearance: resolved.isClearance,
      estimatedQuantity: resolved.estimatedQuantity,
    };

    if (input.name !== undefined) {
      const name = input.name.trim().replace(/\s+/g, ' ');
      data.name = name;
      data.nameSearch = name.toLowerCase();
    }
    if (input.limit !== undefined) data.limit = input.limit;
    if (input.limitType !== undefined) data.limitType = input.limitType;
    if (input.categoryId !== undefined) {
      data.category = { connect: { id: input.categoryId } };
    }
    if (input.supply?.supplySource !== undefined) {
      data.supplySource = input.supply.supplySource;
    }
    if (input.fulfilment) Object.assign(data, input.fulfilment);
    if (input.dietaryFlags) {
      data.vegan = input.dietaryFlags.vegan ?? existing.vegan;
      data.vegetarian = input.dietaryFlags.vegetarian ?? existing.vegetarian;
      data.glutenFree = input.dietaryFlags.glutenFree ?? existing.glutenFree;
      data.organic = input.dietaryFlags.organic ?? existing.organic;
      data.halal = input.dietaryFlags.halal ?? existing.halal;
      data.kosher = input.dietaryFlags.kosher ?? existing.kosher;
      data.readyToEat = input.dietaryFlags.readyToEat ?? existing.readyToEat;
    }

    const updated = await tx.foodItem.update({
      where: { id },
      data,
      include: { category: true },
    });

    const flags = computeEventRecordFlags(
      trackedState(existing),
      trackedState(updated)
    );
    if (isEffectiveTrackedChange(flags)) {
      await writeInventoryEvent(tx, updated, 'updated', flags);
    }

    return {
      item: updated,
      nameChanged: updated.name !== existing.name,
      originalName: existing.name,
    };
  });
}

export interface BulkUpdateFoodItemsInput {
  name?: string;
  limit?: number;
  limitType?: 'person' | 'household';
  categoryId?: number;
  statusFlags?: Partial<StatusFlags>;
  dietaryFlags?: Partial<DietaryFlags>;
}

/**
 * Bulk-update items. Consistency rules and event diffs run per item, so a
 * bulk "Mark In Stock" leaves counted items alone while previously-out
 * items come back with an Unknown quantity.
 */
export async function bulkUpdateFoodItemsWithEvents(
  ids: number[],
  updates: BulkUpdateFoodItemsInput,
  client: PrismaClient = prisma
): Promise<FoodItemWithCategory[]> {
  return client.$transaction(async (tx) => {
    const existingItems = await tx.foodItem.findMany({
      where: { id: { in: ids } },
      include: { category: true },
    });
    if (existingItems.length !== ids.length) {
      throw routeError('One or more food items not found', 404);
    }
    if (updates.categoryId) {
      await requireCategory(tx, updates.categoryId);
    }

    const results: FoodItemWithCategory[] = [];
    for (const existing of existingItems) {
      const resolved = resolveStockAndQuantity(trackedState(existing), {
        statusFlags: updates.statusFlags,
        estimatedQuantityProvided: false,
      });

      const data: Prisma.FoodItemUpdateInput = {
        isInStock: resolved.isInStock,
        isLimited: resolved.isLimited,
        isClearance: resolved.isClearance,
        estimatedQuantity: resolved.estimatedQuantity,
      };
      if (updates.name !== undefined) {
        const name = updates.name.trim().replace(/\s+/g, ' ');
        data.name = name;
        data.nameSearch = name.toLowerCase();
      }
      if (updates.limit !== undefined) data.limit = updates.limit;
      if (updates.limitType !== undefined) data.limitType = updates.limitType;
      if (updates.categoryId !== undefined) {
        data.category = { connect: { id: updates.categoryId } };
      }
      if (updates.dietaryFlags) {
        data.vegan = updates.dietaryFlags.vegan ?? false;
        data.vegetarian = updates.dietaryFlags.vegetarian ?? false;
        data.glutenFree = updates.dietaryFlags.glutenFree ?? false;
        data.organic = updates.dietaryFlags.organic ?? false;
        data.halal = updates.dietaryFlags.halal ?? false;
        data.kosher = updates.dietaryFlags.kosher ?? false;
        data.readyToEat = updates.dietaryFlags.readyToEat ?? false;
      }

      const updated = await tx.foodItem.update({
        where: { id: existing.id },
        data,
        include: { category: true },
      });

      const flags = computeEventRecordFlags(
        trackedState(existing),
        trackedState(updated)
      );
      if (isEffectiveTrackedChange(flags)) {
        await writeInventoryEvent(tx, updated, 'updated', flags);
      }
      results.push(updated);
    }
    return results;
  });
}

/**
 * Delete a food item, writing its final 'deleted' event first so historical
 * analytics keep the item's last known state.
 */
export async function deleteFoodItemWithEvent(
  id: number,
  client: PrismaClient = prisma
): Promise<FoodItemWithCategory> {
  return client.$transaction(async (tx) => {
    const existing = await tx.foodItem.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!existing) {
      throw routeError('Food item not found', 404);
    }
    await writeInventoryEvent(tx, existing, 'deleted', NO_RECORD_FLAGS, {
      detached: true,
    });
    await tx.foodItem.delete({ where: { id } });
    return existing;
  });
}

/** Bulk variant of {@link deleteFoodItemWithEvent}; one transaction. */
export async function bulkDeleteFoodItemsWithEvents(
  ids: number[],
  client: PrismaClient = prisma
): Promise<FoodItemWithCategory[]> {
  return client.$transaction(async (tx) => {
    const existingItems = await tx.foodItem.findMany({
      where: { id: { in: ids } },
      include: { category: true },
    });
    if (existingItems.length !== ids.length) {
      throw routeError('One or more food items not found', 404);
    }
    for (const item of existingItems) {
      await writeInventoryEvent(tx, item, 'deleted', NO_RECORD_FLAGS, {
        detached: true,
      });
    }
    await tx.foodItem.deleteMany({ where: { id: { in: ids } } });
    return existingItems;
  });
}
