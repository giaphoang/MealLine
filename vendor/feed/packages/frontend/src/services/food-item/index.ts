// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import {
  FoodItem,
  FoodItemStatus,
  DietaryFlags,
  StatusFlags,
  FoodItemSupply,
  FoodItemFulfilment,
  FOOD_ITEM_VALIDATION,
  DEFAULT_DIETARY_FLAGS,
  DEFAULT_STATUS_FLAGS
} from '@/types/food-item';
import { BaseApiService } from '../base';
import config from '@/config/config';

// Data interfaces for creating and updating items.
//
// `supplyUpdate` is intentionally NOT named `supply`: quick status actions
// spread a whole FoodItem (which carries `supply`) into these
// calls, and the backend treats an explicit `estimatedQuantity` key as a
// real count observation. Only the add/edit form supplies
// `supplyUpdate`. Request bodies are built from whitelisted fields so status
// actions never become quantity/source observations.
interface CreateFoodItemData {
  name: string;
  limit: number;
  limitType?: FoodItem['limitType'];
  categoryId: number;
  statusFlags: StatusFlags;
  dietaryFlags: DietaryFlags;
  supplyUpdate?: FoodItemSupply;    fulfilmentUpdate?: FoodItemFulfilment;
}

interface UpdateFoodItemData extends CreateFoodItemData {
  id: number;
  keepTranslations?: boolean;
}

interface BulkUpdateData {
  limit?: number;
  categoryId?: number;
  statusFlags?: StatusFlags;
  dietaryFlags?: DietaryFlags;
}

// Define the inventory distribution item.
export interface InventoryDistribution {
  status: string;
  items: number;
  fill: string;
}

// Define an interface that represents the complete inventory data returned from the backend.
export interface InventoryData {
  distribution: InventoryDistribution[];
  totalItems: number;
}

export class FoodItemService extends BaseApiService {
  constructor() {
    super(config.api.endpoints.foodItems.base);
  }

  /**
   * Gets the distribution of items by inventory status along with the total distinct item count.
   * The backend endpoint should return an object with both the distribution array and the totalItems.
   *
   * @returns Promise containing an object with the distribution array and totalItems count.
   */
  async getInventoryDistribution(): Promise<InventoryData> {
    try {
      const response = await this.request<InventoryData>('/distribution');
      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Derives a single status value from status flags.
   * @param flags - Status flags to derive from.
   * @returns FoodItemStatus.
   */
  private deriveStatus(flags: StatusFlags): FoodItemStatus {
    if (flags.isInStock) return 'in_stock';
    if (flags.isLimited) return 'limited';
    if (flags.isClearance) return 'clearance';
    return 'out_of_stock'; // Default status when no flags are set.
  }

  /**
   * Creates a new food item
   * @param data Food item data
   * @returns Promise<FoodItem>
   */
  async createFoodItem(data: CreateFoodItemData): Promise<FoodItem> {
    // Validate all inputs
    this.validateName(data.name);
    this.validateLimit(data.limit);
    this.validateCategoryId(data.categoryId);
    this.validateStatusFlags(data.statusFlags);

    try {
      // The API wraps the created item as { foodItem: ... }; unwrap it so
      // callers receive a FoodItem (with nested statusFlags), matching
      // getFoodItems(). Returning the raw envelope would store an item with
      // no statusFlags in state and crash the list/filter render.
      const response = await this.post<{ foodItem: FoodItem }>('', {
        name: data.name,
        limit: data.limit,
        limitType: data.limitType,
        categoryId: data.categoryId,
        status: this.deriveStatus(data.statusFlags),
        statusFlags: {
          ...DEFAULT_STATUS_FLAGS,
          ...data.statusFlags
        },
        dietaryFlags: {
          ...DEFAULT_DIETARY_FLAGS,
          ...data.dietaryFlags
        },
        ...(data.supplyUpdate ? { supply: data.supplyUpdate } : {}),
        ...(data.fulfilmentUpdate ? { fulfilment: data.fulfilmentUpdate } : {})
      });
      return response.foodItem;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Updates a food item
   * @param data Updated food item data
   * @returns Promise<FoodItem>
   */
  async updateFoodItem(data: UpdateFoodItemData): Promise<FoodItem> {
    // Validate all inputs
    this.validateName(data.name);
    this.validateLimit(data.limit);
    this.validateCategoryId(data.categoryId);
    this.validateStatusFlags(data.statusFlags);

    try {
      // The API wraps the updated item as { foodItem: ... }; unwrap it so
      // callers receive a FoodItem (with nested statusFlags), matching
      // getFoodItems(). Returning the raw envelope would store an item with
      // no statusFlags in state and crash the list/filter render
      // (Cannot read properties of undefined (reading 'isInStock')).
      const response = await this.put<{ foodItem: FoodItem }>(`/${data.id}`, {
        name: data.name,
        limit: data.limit,
        limitType: data.limitType,
        categoryId: data.categoryId,
        keepTranslations: data.keepTranslations,
        status: this.deriveStatus(data.statusFlags),
        statusFlags: {
          ...DEFAULT_STATUS_FLAGS,
          ...data.statusFlags
        },
        dietaryFlags: {
          ...DEFAULT_DIETARY_FLAGS,
          ...data.dietaryFlags
        },
        ...(data.supplyUpdate ? { supply: data.supplyUpdate } : {}),
        ...(data.fulfilmentUpdate ? { fulfilment: data.fulfilmentUpdate } : {})
      });
      return response.foodItem;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Updates multiple food items in bulk
   * @param items - Array of food items to update
   * @param updates - Data to update on all items
   * @returns Promise<FoodItem[]>
   */
  async bulkUpdateFoodItems(items: FoodItem[], updates: BulkUpdateData): Promise<FoodItem[]> {
    // Validate updates
    if (updates.limit) {
      this.validateLimit(updates.limit);
    }
    if (updates.categoryId) {
      this.validateCategoryId(updates.categoryId);
    }
    if (updates.statusFlags) {
      this.validateStatusFlags(updates.statusFlags);
    }

    try {
      const result = await this.put<{foodItems: FoodItem[]}>('/bulk', {
        ids: items.map(item => item.id),
        updates: {
          ...updates,
          status: updates.statusFlags ? this.deriveStatus(updates.statusFlags) : undefined,
          statusFlags: updates.statusFlags ? {
            ...DEFAULT_STATUS_FLAGS,
            ...updates.statusFlags
          } : undefined,
          dietaryFlags: updates.dietaryFlags ? {
            ...DEFAULT_DIETARY_FLAGS,
            ...updates.dietaryFlags
          } : undefined
        }
      });

      return result.foodItems;
    } catch (error) {
      throw error instanceof Error 
        ? error 
        : new Error('An error occurred while updating food items');
    }
  }

  /**
   * Deletes multiple food items in bulk
   * @param items - Array of food items to delete
   * @returns Promise<void>
   */
  async bulkDeleteFoodItems(items: FoodItem[]): Promise<void> {
    try {
      await this.bulkDelete(items.map(item => item.id));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Gets all food items
   * @returns Promise<FoodItem[]>
   */
  async getFoodItems(): Promise<FoodItem[]> {
    try {
      const response = await this.get<{foodItems: FoodItem[]}>();
      return response.foodItems || [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Deletes a food item
   * @param id Food item ID
   * @returns Promise<void>
   */
  async deleteFoodItem(id: number): Promise<void> {
    try {
      await this.delete(`/${id}`);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Validation methods
  private validateName(name: string) {
    if (!name || name.length < FOOD_ITEM_VALIDATION.MIN_LENGTH) {
      throw new Error(`Name must be at least ${FOOD_ITEM_VALIDATION.MIN_LENGTH} characters`);
    }
    if (name.length > FOOD_ITEM_VALIDATION.MAX_LENGTH) {
      throw new Error(`Name must be no more than ${FOOD_ITEM_VALIDATION.MAX_LENGTH} characters`);
    }
  }

  private validateLimit(limit: number) {
    if (limit < FOOD_ITEM_VALIDATION.MIN_LIMIT || limit > FOOD_ITEM_VALIDATION.MAX_LIMIT) {
      throw new Error(`Limit must be between ${FOOD_ITEM_VALIDATION.MIN_LIMIT} and ${FOOD_ITEM_VALIDATION.MAX_LIMIT}`);
    }
  }

  private validateStatusFlags(flags: StatusFlags) {
    // All combinations of flags are valid
    // No validation needed - in the new system, flags can be combined
  }

  private validateCategoryId(categoryId: number) {
    if (!categoryId || categoryId <= 0) {
      throw new Error('Invalid category ID');
    }
  }
}
