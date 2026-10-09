// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { MockedClass } from 'vitest';
import { useFoodItemData } from './useFoodData';
import { FoodItemService } from '@/services/food-item';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { FoodItem, StatusFlags, DietaryFlags, LimitType } from '@/types/food-item';

// Mock the entire service module
vi.mock('@/services/food-item');
vi.mock('@/services/error/ErrorHandlerService');

const mockFoodItems: FoodItem[] = [
  { id: 1, name: 'Apple', categoryId: 1, limit: 10, limitType: 'person', statusFlags: {} as StatusFlags, dietaryFlags: {} as DietaryFlags, createdAt: '', updatedAt: '' },
  { id: 2, name: 'Banana', categoryId: 1, limit: 15, limitType: 'household', statusFlags: {} as StatusFlags, dietaryFlags: {} as DietaryFlags, createdAt: '', updatedAt: '' },
];

describe('useFoodItemData', () => {
  let handleErrorSpy: any;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    handleErrorSpy = vi.spyOn(ErrorHandlerService, 'handleError');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch food items successfully', async () => {
    const mockedService = FoodItemService as MockedClass<typeof FoodItemService>;
    mockedService.prototype.getFoodItems.mockResolvedValue(mockFoodItems);
    
    const { result } = renderHook(() => useFoodItemData());

    await act(async () => {
      await result.current.refreshFoodItems();
    });

    expect(result.current.foodItems).toEqual(mockFoodItems);
    expect(result.current.isLoading).toBe(false);
    expect(handleErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle errors when fetching food items', async () => {
    const error = new Error('Failed to fetch');
    const mockedService = FoodItemService as MockedClass<typeof FoodItemService>;
    mockedService.prototype.getFoodItems.mockRejectedValue(error);

    const { result } = renderHook(() => useFoodItemData());

    await act(async () => {
      await result.current.refreshFoodItems();
    });

    expect(result.current.foodItems).toEqual([]);
    expect(handleErrorSpy).toHaveBeenCalledWith(error, 'refreshFoodItems');
    expect(result.current.error).toBe(null);
  });

  it('should handle errors when creating a food item', async () => {
    const error = new Error('Creation failed');
    const mockedService = FoodItemService as MockedClass<typeof FoodItemService>;
    mockedService.prototype.createFoodItem.mockRejectedValue(error);

    const { result } = renderHook(() => useFoodItemData());

    await act(async () => {
      try {
        await result.current.createFoodItem({ name: 'Orange', categoryId: 1, limit: 5, statusFlags: {} as StatusFlags, dietaryFlags: {} as DietaryFlags });
      } catch (e) {
        // Expected to throw
      }
    });

    expect(handleErrorSpy).toHaveBeenCalledWith(error, 'createFoodItem');
  });

  it('should handle errors when updating a food item', async () => {
    const error = new Error('Update failed');
    const mockedService = FoodItemService as MockedClass<typeof FoodItemService>;
    mockedService.prototype.updateFoodItem.mockRejectedValue(error);

    const { result } = renderHook(() => useFoodItemData());

    await act(async () => {
      try {
        await result.current.updateFoodItem({ id: 1, name: 'Granny Smith Apple', categoryId: 1, limit: 10, statusFlags: {} as StatusFlags, dietaryFlags: {} as DietaryFlags });
      } catch (e) {
        // Expected to throw
      }
    });

    expect(handleErrorSpy).toHaveBeenCalledWith(error, 'updateFoodItem');
  });

  it('should forward keepTranslations to the service when updating', async () => {
    const mockedService = FoodItemService as MockedClass<typeof FoodItemService>;
    mockedService.prototype.updateFoodItem.mockResolvedValue(mockFoodItems[0]);

    const { result } = renderHook(() => useFoodItemData());

    await act(async () => {
      await result.current.updateFoodItem({ id: 1, name: 'Granny Smith Apple', categoryId: 1, limit: 10, statusFlags: {} as StatusFlags, dietaryFlags: {} as DietaryFlags, keepTranslations: true });
    });

    expect(mockedService.prototype.updateFoodItem).toHaveBeenCalledWith(
      expect.objectContaining({ keepTranslations: true })
    );
  });

  it('should handle errors when deleting a food item', async () => {
    const error = new Error('Deletion failed');
    const mockedService = FoodItemService as MockedClass<typeof FoodItemService>;
    mockedService.prototype.deleteFoodItem.mockRejectedValue(error);

    const { result } = renderHook(() => useFoodItemData());

    await act(async () => {
      try {
        await result.current.deleteFoodItem(1);
      } catch (e) {
        // Expected to throw
      }
    });

    expect(handleErrorSpy).toHaveBeenCalledWith(error, 'deleteFoodItem');
  });

  it('should handle errors during bulk update', async () => {
    const error = new Error('Bulk update failed');
    const mockedService = FoodItemService as MockedClass<typeof FoodItemService>;
    mockedService.prototype.bulkUpdateFoodItems.mockRejectedValue(error);

    const { result } = renderHook(() => useFoodItemData());

    await act(async () => {
      try {
        await result.current.bulkUpdateFoodItems([mockFoodItems[0]], { limit: 20 });
      } catch (e) {
        // Expected to throw
      }
    });

    expect(handleErrorSpy).toHaveBeenCalledWith(error, 'bulkUpdateFoodItems');
  });

  it('should handle errors during bulk delete', async () => {
    const error = new Error('Bulk delete failed');
    const mockedService = FoodItemService as MockedClass<typeof FoodItemService>;
    mockedService.prototype.bulkDeleteFoodItems.mockRejectedValue(error);

    const { result } = renderHook(() => useFoodItemData());

    await act(async () => {
      try {
        await result.current.bulkDeleteFoodItems([mockFoodItems[0]]);
      } catch (e) {
        // Expected to throw
      }
    });

    expect(handleErrorSpy).toHaveBeenCalledWith(error, 'bulkDeleteFoodItems');
  });
});
