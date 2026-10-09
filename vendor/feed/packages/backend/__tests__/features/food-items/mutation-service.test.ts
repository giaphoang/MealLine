// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * Centralized food-item mutation service: verifies the item write and its
 * append-only FoodItemInventoryEvent happen together inside one Prisma
 * transaction, that no-op updates write no event, and that deletions write
 * their final event before the row is removed.
 */

const mockTx = vi.hoisted(() => ({
  category: { findUnique: vi.fn() },
  foodItem: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  foodItemInventoryEvent: { create: vi.fn() },
}));

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
}));

vi.mock('../../../src/db', () => ({ default: mockPrisma }));

import {
  createFoodItemWithEvent,
  updateFoodItemWithEvent,
  deleteFoodItemWithEvent,
} from '../../../src/services/food-item';

const category = { id: 3, name: 'Canned Goods' };

const existingItem = {
  id: 7,
  name: 'Tuna',
  nameSearch: 'tuna',
  limit: 5,
  limitType: 'household',
  isInStock: true,
  isLimited: false,
  isClearance: false,
  categoryId: 3,
  vegan: false,
  vegetarian: false,
  glutenFree: true,
  organic: false,
  halal: false,
  kosher: false,
  readyToEat: true,
  estimatedQuantity: 100,
  supplySource: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  category,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)
  );
  mockTx.category.findUnique.mockResolvedValue(category);
  mockTx.foodItemInventoryEvent.create.mockResolvedValue({});
});

describe('createFoodItemWithEvent', () => {
  test('applies Unknown Supply defaults and writes a created event', async () => {
    mockTx.foodItem.create.mockImplementation(async ({ data }: any) => ({
      ...existingItem,
      ...data,
      id: 99,
      category,
    }));

    await createFoodItemWithEvent({
      name: 'Black Beans',
      limit: 10,
      limitType: 'person',
      categoryId: 3,
      statusFlags: { isInStock: true, isLimited: false, isClearance: false },
    });

    const createArgs = mockTx.foodItem.create.mock.calls[0][0];
    expect(createArgs.data.estimatedQuantity).toBeNull();
    expect(createArgs.data.supplySource).toBeNull();

    const eventArgs = mockTx.foodItemInventoryEvent.create.mock.calls[0][0];
    expect(eventArgs.data.eventKind).toBe('created');
    expect(eventArgs.data.sourceFoodItemId).toBe(99);
    expect(eventArgs.data.categoryName).toBe('Canned Goods');
    expect(eventArgs.data.recordsQuantity).toBe(true);
    expect(eventArgs.data.recordsIdentity).toBe(true);
  });

  test('an item created as Out of Stock keeps its quantity Unknown', async () => {
    mockTx.foodItem.create.mockImplementation(async ({ data }: any) => ({
      ...existingItem,
      ...data,
      id: 100,
      category,
    }));

    await createFoodItemWithEvent({
      name: 'Sweet Potato Pie Mix',
      limit: 10,
      limitType: 'person',
      categoryId: 3,
      statusFlags: { isInStock: false, isLimited: false, isClearance: false },
    });

    const createArgs = mockTx.foodItem.create.mock.calls[0][0];
    expect(createArgs.data.isInStock).toBe(false);
    // No count was given, so none is fabricated (out-of-stock may carry an
    // Unknown or held quantity; see stock-consistency.ts).
    expect(createArgs.data.estimatedQuantity).toBeNull();
  });
});

describe('updateFoodItemWithEvent', () => {
  test('writes an updated event with dimension flags for an effective change', async () => {
    mockTx.foodItem.findUnique.mockResolvedValue(existingItem);
    mockTx.foodItem.update.mockResolvedValue({
      ...existingItem,
      estimatedQuantity: 60,
    });

    const result = await updateFoodItemWithEvent(7, {
      statusFlags: { isInStock: true, isLimited: false, isClearance: false },
      supply: { estimatedQuantity: 60, estimatedQuantityProvided: true },
    });

    expect(result.nameChanged).toBe(false);
    const eventArgs = mockTx.foodItemInventoryEvent.create.mock.calls[0][0];
    expect(eventArgs.data.eventKind).toBe('updated');
    expect(eventArgs.data.estimatedQuantity).toBe(60);
    expect(eventArgs.data.recordsQuantity).toBe(true);
    expect(eventArgs.data.recordsSupply).toBe(false);
    expect(eventArgs.data.recordsStatus).toBe(false);
    expect(eventArgs.data.recordsLimit).toBe(false);
    expect(eventArgs.data.recordsIdentity).toBe(false);
  });

  test('a no-op save writes no event', async () => {
    mockTx.foodItem.findUnique.mockResolvedValue(existingItem);
    mockTx.foodItem.update.mockResolvedValue({ ...existingItem });

    await updateFoodItemWithEvent(7, {
      statusFlags: { isInStock: true, isLimited: false, isClearance: false },
      supply: { estimatedQuantity: 100, estimatedQuantityProvided: true },
    });

    expect(mockTx.foodItemInventoryEvent.create).not.toHaveBeenCalled();
  });

  test('a dietary-only change writes no ledger event', async () => {
    mockTx.foodItem.findUnique.mockResolvedValue(existingItem);
    mockTx.foodItem.update.mockResolvedValue({ ...existingItem, vegan: true });

    await updateFoodItemWithEvent(7, {
      dietaryFlags: { vegan: true },
    });

    expect(mockTx.foodItemInventoryEvent.create).not.toHaveBeenCalled();
  });
});

describe('deleteFoodItemWithEvent', () => {
  test('writes the final deleted event (detached) before removing the item', async () => {
    const order: string[] = [];
    mockTx.foodItem.findUnique.mockResolvedValue(existingItem);
    mockTx.foodItemInventoryEvent.create.mockImplementation(async () => {
      order.push('event');
      return {};
    });
    mockTx.foodItem.delete.mockImplementation(async () => {
      order.push('delete');
      return existingItem;
    });

    await deleteFoodItemWithEvent(7);

    expect(order).toEqual(['event', 'delete']);
    const eventArgs = mockTx.foodItemInventoryEvent.create.mock.calls[0][0];
    expect(eventArgs.data.eventKind).toBe('deleted');
    expect(eventArgs.data.foodItemId).toBeNull();
    expect(eventArgs.data.sourceFoodItemId).toBe(7);
    expect(eventArgs.data.itemName).toBe('Tuna');
    expect(eventArgs.data.recordsQuantity).toBe(false);
    expect(eventArgs.data.recordsSupply).toBe(false);
    expect(eventArgs.data.recordsStatus).toBe(false);
    expect(eventArgs.data.recordsLimit).toBe(false);
    expect(eventArgs.data.recordsIdentity).toBe(false);
  });
});
