// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FoodItemService } from './index';
import type { FoodItem } from '@/types/food-item';

/**
 * Regression test for the "Cannot read properties of undefined (reading
 * 'isInStock')" crash when editing a food item with a status filter active.
 *
 * Root cause: the backend wraps the mutated item as `{ foodItem: ... }`, but
 * `createFoodItem` / `updateFoodItem` returned the whole envelope (mistyped as
 * FoodItem) instead of the inner item. `useFoodItemData` then stored an object
 * with no `statusFlags`, and the list filter (`foodItemMatchesStatus`) and the
 * Actions column both read `item.statusFlags.isInStock` → crash on the next
 * render. `getFoodItems()` already unwrapped `.foodItems`, which is why initial
 * load worked and only mutations broke.
 *
 * These tests pin the contract: both methods must return the unwrapped item
 * (with `statusFlags`), never the `{ foodItem }` envelope.
 */
describe('FoodItemService — unwraps the { foodItem } envelope on mutations', () => {
  let service: FoodItemService;
  const fetchMock = vi.fn();

  const serverFoodItem: FoodItem = {
    id: 1,
    name: 'Tuna',
    categoryId: 11,
    limit: 1,
    limitType: 'household',
    statusFlags: { isInStock: false, isLimited: false, isClearance: false },
    dietaryFlags: {
      vegan: false,
      vegetarian: false,
      glutenFree: false,
      organic: false,
      halal: false,
      kosher: false,
      readyToEat: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const okEnvelope = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  beforeEach(() => {
    service = new FoodItemService();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updateFoodItem returns the inner item with statusFlags, not the envelope', async () => {
    fetchMock.mockResolvedValue(okEnvelope({ foodItem: serverFoodItem }));

    const result = await service.updateFoodItem({
      id: 1,
      name: 'Tuna',
      limit: 1,
      categoryId: 11,
      statusFlags: { isInStock: false, isLimited: false, isClearance: false },
      dietaryFlags: serverFoodItem.dietaryFlags,
    });

    expect(result).toEqual(serverFoodItem);
    expect(result.statusFlags).toBeDefined();
    expect(result.statusFlags.isInStock).toBe(false);
    // The bug returned the raw envelope; guard against regressing to that.
    expect((result as unknown as { foodItem?: unknown }).foodItem).toBeUndefined();
  });

  it('updateFoodItem includes keepTranslations in the PUT body', async () => {
    fetchMock.mockResolvedValue(okEnvelope({ foodItem: serverFoodItem }));

    await service.updateFoodItem({
      id: 1,
      name: 'Albacore Tuna',
      limit: 1,
      categoryId: 11,
      statusFlags: serverFoodItem.statusFlags,
      dietaryFlags: serverFoodItem.dietaryFlags,
      keepTranslations: true,
    });

    // The backend deletes the old translations on rename unless the body
    // carries keepTranslations: true, so dropping it here silently discards
    // the user's "Keep Current Translations" choice.
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse((requestInit as RequestInit).body as string);
    expect(body.keepTranslations).toBe(true);
  });

  it('createFoodItem returns the inner item with statusFlags, not the envelope', async () => {
    const created = { ...serverFoodItem, id: 2, name: 'New Item' };
    fetchMock.mockResolvedValue(okEnvelope({ foodItem: created }));

    const result = await service.createFoodItem({
      name: 'New Item',
      limit: 1,
      categoryId: 11,
      statusFlags: { isInStock: true, isLimited: false, isClearance: false },
      dietaryFlags: serverFoodItem.dietaryFlags,
    });

    expect(result.id).toBe(2);
    expect(result.statusFlags).toBeDefined();
    expect((result as unknown as { foodItem?: unknown }).foodItem).toBeUndefined();
  });
});
