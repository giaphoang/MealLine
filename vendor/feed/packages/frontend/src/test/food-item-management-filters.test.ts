// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import {
  filterFoodItemsForInventoryUpdate,
  foodItemMatchesStatus,
} from '@/components/food-item-management/filters';
import { FoodItem } from '@/types/food-item';

const item = (
  id: number,
  name: string,
  categoryId: number,
  statusFlags: FoodItem['statusFlags'],
): FoodItem => ({
  id,
  name,
  categoryId,
  statusFlags,
  limit: 100,
  limitType: 'household',
  dietaryFlags: {
    vegan: false,
    vegetarian: false,
    glutenFree: false,
    organic: false,
    halal: false,
    kosher: false,
    readyToEat: false,
  },
  createdAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
});

const beans = item(1, 'Black Beans', 10, {
  isInStock: true,
  isLimited: false,
  isClearance: false,
});

const rice = item(2, 'Rice', 20, {
  isInStock: true,
  isLimited: true,
  isClearance: false,
});

const cereal = item(3, 'Cereal', 20, {
  isInStock: true,
  isLimited: false,
  isClearance: true,
});

const eggs = item(4, 'Eggs', 30, {
  isInStock: false,
  isLimited: false,
  isClearance: false,
});

describe('food item management inventory update filters', () => {
  it('maps status flags to filter options', () => {
    expect(foodItemMatchesStatus(beans, 'in_stock')).toBe(true);
    expect(foodItemMatchesStatus(rice, 'limited')).toBe(true);
    expect(foodItemMatchesStatus(cereal, 'clearance')).toBe(true);
    expect(foodItemMatchesStatus(eggs, 'out_of_stock')).toBe(true);
    expect(foodItemMatchesStatus(eggs, 'in_stock')).toBe(false);
  });

  it('treats empty category and status selections as all items', () => {
    expect(
      filterFoodItemsForInventoryUpdate([beans, rice, cereal, eggs], new Set(), new Set())
        .map((current) => current.name),
    ).toEqual(['Black Beans', 'Rice', 'Cereal', 'Eggs']);
  });

  it('filters by one or more categories and statuses', () => {
    expect(
      filterFoodItemsForInventoryUpdate(
        [beans, rice, cereal, eggs],
        new Set([20, 30]),
        new Set(['limited', 'out_of_stock']),
      ).map((current) => current.name),
    ).toEqual(['Rice', 'Eggs']);
  });
});
