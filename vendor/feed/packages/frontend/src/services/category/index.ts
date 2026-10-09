// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Category, CATEGORY_VALIDATION, BulkDeleteResult, BulkOperationResult, LimitType } from '@/types/category';
import { BaseApiService } from '../base';
import config from '@/config/config';

interface CreateCategoryData {
  name: string;
  limit: number;
  limitType: LimitType;
  icon?: string;
}

interface UpdateCategoryData extends CreateCategoryData {
  id: number;
  keepTranslations?: boolean;
}

interface CategoryDistribution {
  category: string;
  items: number;
}

export class CategoryService extends BaseApiService {
  constructor() {
    super(config.api.endpoints.categories.base);
  }

  /**
   * Fetches the distribution of items across categories
   * @returns Promise<CategoryDistribution[]>
   */
  async getCategoryDistribution(): Promise<CategoryDistribution[]> {
    try {
      const response = await this.request<{ distribution: CategoryDistribution[] }>('/distribution');
      return response.distribution;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // ... rest of the existing methods ...

  /**
   * Deletes multiple categories in bulk
   * @param ids - Array of category IDs to delete
   * @returns Promise<BulkOperationResult>
   */
  async bulkDeleteCategories(ids: number[]): Promise<BulkOperationResult> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('No categories selected for deletion');
    }

    try {
      const endpoint = '/bulk';
      console.log('Bulk delete endpoint:', endpoint);
      const payload = { ids };
      
      const response = await this.delete<{ message: string; result: BulkDeleteResult }>(endpoint, payload);

      console.log('Bulk delete raw response:', response);

      // Always use the response message directly if available
      if (response?.message && response?.result) {
        const result: BulkOperationResult = {
          success: response.result.success.count,
          failed: response.result.failure.count,
          errors: [response.message]
        };
        console.log('Transformed bulk delete result:', result);
        return result;
      }

      // Handle unexpected response format
      console.error('Unexpected response format:', response);
      throw new Error('Unexpected response format from server');
    } catch (error) {
      console.error('Bulk delete error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Fetches all categories from the API
   * @returns Promise<Category[]>
   */
  async getCategories(): Promise<Category[]> {
    try {
      const response = await this.get<{ categories: Category[] }>('');
      return response.categories;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Creates a new category
   * @param data - Category data to create
   * @returns Promise<Category>
   */
  async createCategory(data: CreateCategoryData): Promise<Category> {
    this.validateName(data.name);
    this.validateLimit(data.limit);

    try {
      const response = await this.post<{ category: Category }>('', data);
      return response.category;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Updates an existing category
   * @param data - Category data to update
   * @returns Promise<Category>
   */
  async updateCategory(data: UpdateCategoryData): Promise<Category> {
    this.validateName(data.name);
    this.validateLimit(data.limit);

    try {
      const response = await this.put<{ category: Category }>(`/${data.id}`, data);
      return response.category;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Deletes a category
   * @param id - ID of category to delete
   * @returns Promise<void>
   */
  async deleteCategory(id: number): Promise<void> {
    try {
      console.log('Deleting category:', id);
      await this.delete(`/${id}`);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Validates a category name
   * @param name - The category name to validate
   * @returns true if valid, throws Error if invalid
   */
  validateName(name: string): boolean {
    if (typeof name !== 'string') {
      throw new Error('Category name must be a string');
    }

    const trimmedName = name.trim();
    if (trimmedName.length < CATEGORY_VALIDATION.MIN_LENGTH || 
        trimmedName.length > CATEGORY_VALIDATION.MAX_LENGTH) {
      throw new Error(
        `Category name must be between ${CATEGORY_VALIDATION.MIN_LENGTH} and ${CATEGORY_VALIDATION.MAX_LENGTH} characters`
      );
    }

    return true;
  }

  /**
   * Validates a category limit
   * @param limit - The limit to validate
   * @returns true if valid, throws Error if invalid
   */
  validateLimit(limit: number): boolean {
    if (typeof limit !== 'number' || isNaN(limit)) {
      throw new Error('Category limit must be a number');
    }

    if (limit < CATEGORY_VALIDATION.MIN_LIMIT || 
        limit > CATEGORY_VALIDATION.MAX_LIMIT) {
      throw new Error(
        `Category limit must be between ${CATEGORY_VALIDATION.MIN_LIMIT} and ${CATEGORY_VALIDATION.MAX_LIMIT}`
      );
    }

    return true;
  }
}