// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db';
import {
  validateFoodItem,
  transformFoodItem,
  validateIds,
  handlePrismaError,
  parseSupplyPayload,
  parseFulfilmentPayload,
  StatusFlags,
  DietaryFlags
} from '../utils/foodItemUtils';
import {
  bulkDeleteFoodItemsWithEvents,
  bulkUpdateFoodItemsWithEvents,
  createFoodItemWithEvent,
  deleteFoodItemWithEvent,
  updateFoodItemWithEvent,
} from '../services/food-item';

import { translationAuditor } from '../services/translation-auditor';
import { translationTriggerService } from '../services/translation-trigger';

const router = Router();

interface BulkUpdateRequest {
  ids: number[];
  updates: {
    name?: string;
    limit?: number;
    limitType?: 'person' | 'household';
    categoryId?: number;
    statusFlags?: StatusFlags;
    dietaryFlags?: DietaryFlags;
  };
}

const badRequest = (message: string) => {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = 400;
  return error;
};

// GET inventory distribution with separate aggregations
router.get('/distribution', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Run separate count queries for each status flag
    const inStockCount = await prisma.foodItem.count({
      where: { isInStock: true }
    });
    const limitedCount = await prisma.foodItem.count({
      where: { isLimited: true }
    });
    const clearanceCount = await prisma.foodItem.count({
      where: { isClearance: true }
    });
    // Count all items that are not in stock
    const outOfStockCount = await prisma.foodItem.count({
      where: { isInStock: false }
    });

    // Build the distribution array using the separate counts.
    const distribution = [
      {
        status: 'inStock',
        items: inStockCount,
        fill: 'var(--color-inStock)'
      },
      {
        status: 'limited',
        items: limitedCount,
        fill: 'var(--color-limited)'
      },
      {
        status: 'clearance',
        items: clearanceCount,
        fill: 'var(--color-clearance)'
      },
      {
        status: 'outOfStock',
        items: outOfStockCount,
        fill: 'var(--color-outOfStock)' // Ensure you define --color-outOfStock in your CSS.
      }
    ];

    // Get a distinct total count of food items so each is counted once.
    const totalItems = await prisma.foodItem.count();

    res.json({ distribution, totalItems });
  } catch (error) {
    next(error);
  }
});

// GET all food items
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.foodItem.findMany({
      orderBy: { name: 'asc' }
    });
    const foodItems = items.map(transformFoodItem);
    res.json({ foodItems });
  } catch (error) {
    next(error);
  }
});

// GET single food item
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const item = await prisma.foodItem.findUnique({
      where: { id: Number(id) }
    });
    if (!item) {
      const error = new Error('Food item not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    const foodItem = transformFoodItem(item);
    res.json({ foodItem });
  } catch (error) {
    next(error);
  }
});

// Bulk update food items. Stock/count consistency and inventory-ledger
// events are enforced per item by the centralized mutation service.
router.put('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids, updates } = req.body as BulkUpdateRequest;
    // Deduplicate IDs before validation
    const uniqueIds = [...new Set(ids)];
    const validIds = validateIds(uniqueIds);
    // Validate updates
    if (!updates || typeof updates !== 'object') {
      throw badRequest('Invalid updates');
    }
    if (updates.name !== undefined) {
      if (typeof updates.name !== 'string' || updates.name.length < 3 || updates.name.length > 36) {
        throw badRequest('Name must be between 3 and 36 characters');
      }
    }
    if (updates.limit !== undefined) {
      if (typeof updates.limit !== 'number' || updates.limit < 1 || updates.limit > 100) {
        throw badRequest('Limit must be a number between 1 and 100');
      }
    }
    if (updates.limitType !== undefined && !['person', 'household'].includes(updates.limitType)) {
      throw badRequest('Limit type must be either "person" or "household"');
    }
    try {
      const updatedItems = await bulkUpdateFoodItemsWithEvents(validIds, {
        name: updates.name,
        limit: updates.limit,
        limitType: updates.limitType,
        categoryId: updates.categoryId,
        statusFlags: updates.statusFlags,
        dietaryFlags: updates.dietaryFlags,
      });
      res.json({ foodItems: updatedItems.map(transformFoodItem) });
    } catch (error) {
      handlePrismaError(error);
    }
  } catch (error) {
    next(error);
  }
});

// Bulk delete food items
router.delete('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    const validIds = validateIds(ids);
    try {
      // Delete all items; each writes its final 'deleted' ledger event in
      // the same transaction so historical analytics survive the removal.
      const deletedItems = await bulkDeleteFoodItemsWithEvents(validIds);

      // Return success response immediately
      res.status(204).end();

      // Clean up translations asynchronously after the response is sent
      prisma.translation.deleteMany({
        where: {
          originalText: { in: deletedItems.map(item => item.name) },
          type: 'FoodItem'
        }
      }).catch(err => console.error('Error deleting translations after bulk food item deletion:', err));

    } catch (error) {
      handlePrismaError(error);
    }
  } catch (error) {
    next(error);
  }
});

// Create new food item
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const foodItemData = req.body;
    validateFoodItem(foodItemData);
    const supply = parseSupplyPayload(foodItemData.supply);
    try {
      const item = await createFoodItemWithEvent({
        name: foodItemData.name,
        limit: foodItemData.limit || 10,
        limitType: foodItemData.limitType || 'person',
        categoryId: foodItemData.categoryId,
        statusFlags: foodItemData.statusFlags,
        fulfilment: parseFulfilmentPayload(foodItemData.fulfilment),
        dietaryFlags: foodItemData.dietaryFlags,
        supply,
      });
      const newItem = transformFoodItem(item);

      // Return success response immediately
      res.status(201).json({ foodItem: newItem });

      // After response is sent, queue translations asynchronously
      // This won't block the response or cause transaction timeouts
      translationTriggerService.queueContentTranslation(newItem.id, 'FoodItem', 'name', newItem.name)
        .catch(err => console.error('Error queueing translations after food item creation:', err));

    } catch (error) {
      // Duplicate name (unique constraint on nameSearch). Look up the
      // existing item and return it alongside the error so the client can
      // offer a one-click "Mark In Stock" shortcut. This addresses a very
      // common staff workflow: re-entering an item that already exists but
      // is hidden from their inventory view by an "in stock" filter.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await prisma.foodItem.findUnique({
          where: { nameSearch: String(foodItemData?.name ?? '').trim().toLowerCase() },
        });
        return res.status(400).json({
          error: {
            message: 'A food item with this name already exists. Please choose a different name.',
            code: 'DUPLICATE_FOOD_ITEM_NAME',
            existingItem: existing ? transformFoodItem(existing) : null,
          },
        });
      }
      handlePrismaError(error);
    }
  } catch (error) {
    next(error);
  }
});

// Update food item
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const numId = Number(id);
    if (isNaN(numId) || numId < 1) {
      throw badRequest('Invalid food item ID');
    }
    const { keepTranslations, ...updateData } = req.body;
    if (updateData.name !== undefined) {
      if (typeof updateData.name !== 'string' || updateData.name.length < 3 || updateData.name.length > 36) {
        throw badRequest('Name must be between 3 and 36 characters');
      }
    }
    if (updateData.limit !== undefined) {
      if (typeof updateData.limit !== 'number' || updateData.limit < 1 || updateData.limit > 100) {
        throw badRequest('Limit must be a number between 1 and 100');
      }
    }
    if (updateData.limitType !== undefined && !['person', 'household'].includes(updateData.limitType)) {
      throw badRequest('Limit type must be either "person" or "household"');
    }
    const supply = parseSupplyPayload(updateData.supply);
    try {
      const { item, nameChanged, originalName } = await updateFoodItemWithEvent(numId, {
        name: updateData.name,
        limit: updateData.limit,
        limitType: updateData.limitType,
        categoryId: updateData.categoryId,
        statusFlags: updateData.statusFlags,
        fulfilment: parseFulfilmentPayload(updateData.fulfilment),
        dietaryFlags: updateData.dietaryFlags,
        supply,
      });
      const updatedItem = transformFoodItem(item);

      // Return success response immediately
      res.json({ foodItem: updatedItem });

      // If name changed, handle translations asynchronously
      if (nameChanged) {
        // Handle keepTranslations logic directly
        if (!keepTranslations) {
          // Delete old translations asynchronously
          prisma.translation.deleteMany({
            where: {
              originalText: originalName,
              type: 'FoodItem'
            }
          }).catch(err => console.error('Error deleting old translations:', err));
        }

        // Queue new translations
        translationTriggerService.queueContentTranslation(numId, 'FoodItem', 'name', updatedItem.name)
          .catch(err => console.error('Error queueing translations after food item update:', err));
      }
    } catch (error) {
      handlePrismaError(error);
    }
  } catch (error) {
    next(error);
  }
});

// Delete food item
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const numId = Number(id);
    if (isNaN(numId) || numId < 1) {
      throw badRequest('Invalid food item ID');
    }
    try {
      // Delete the item; its final 'deleted' ledger event is written in the
      // same transaction, preserving historical analytics.
      const deletedItem = await deleteFoodItemWithEvent(numId);

      // Return success response immediately
      res.status(204).end();

      // Clean up translations asynchronously after the response is sent
      prisma.translation.deleteMany({
        where: {
          originalText: deletedItem.name,
          type: 'FoodItem'
        }
      }).catch(err => console.error('Error deleting translations after food item deletion:', err));

    } catch (error) {
      handlePrismaError(error);
    }
  } catch (error) {
    next(error);
  }
});

export default router;
