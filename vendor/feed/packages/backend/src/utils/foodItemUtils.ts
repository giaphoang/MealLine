// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Prisma } from '@prisma/client';
import { z } from 'zod';

export const parseFulfilmentPayload = (value: unknown) => {
  if (value === undefined) return undefined;
  const result = z.object({
    quantity: z.number().int().min(0).max(2147483647),
    unit: z.string().trim().min(1).max(80),
    requiresStove: z.boolean(), requiresFridge: z.boolean(),
  }).safeParse(value);
  if (!result.success) throw Object.assign(new Error('Check the fulfilment quantity, unit, and kitchen requirements.'), { statusCode: 400 });
  return result.data;
};

export function validateMinLength(text: string, minLength: number): boolean {
  return text.trim().length >= minLength;
}

export interface StatusFlags {
  isInStock: boolean;
  isLimited: boolean;
  isClearance: boolean;
}

export interface DietaryFlags {
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  organic: boolean;
  halal: boolean;
  kosher: boolean;
  readyToEat: boolean;
}

// Optional Supply annotations
// (docs/reports/operational-analytics-design.md).
export interface SupplyPayload {
  estimatedQuantity?: number | null;
  supplySource?: 'donated' | 'purchased' | 'mixed_other' | null;
}

export interface FoodItemBase {
  name: string;
  limit?: number;
  limitType?: 'person' | 'household';
  categoryId: number;
  statusFlags?: StatusFlags;
  dietaryFlags?: DietaryFlags;
  supply?: SupplyPayload;
}

/**
 * Validates the optional Supply block and normalizes it into the shape
 * the mutation service consumes, capturing whether estimatedQuantity was
 * explicitly provided (a quick status action omits it; the edit form sends
 * it, possibly as null = Unknown).
 */
export const parseSupplyPayload = (
  supply: unknown
):
  | {
      estimatedQuantity?: number | null;
      supplySource?: 'donated' | 'purchased' | 'mixed_other' | null;
      estimatedQuantityProvided: boolean;
    }
  | undefined => {
  if (supply === undefined || supply === null) return undefined;
  if (typeof supply !== 'object' || Array.isArray(supply)) {
    const error = new Error('Invalid Supply payload') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  const source = supply as Record<string, unknown>;
  const errors: string[] = [];
  const result: {
    estimatedQuantity?: number | null;
    supplySource?: 'donated' | 'purchased' | 'mixed_other' | null;
    estimatedQuantityProvided: boolean;
  } = { estimatedQuantityProvided: false };

  if ('estimatedQuantity' in source) {
    result.estimatedQuantityProvided = true;
    const value = source.estimatedQuantity;
    if (value === null) {
      result.estimatedQuantity = null;
    } else if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
      result.estimatedQuantity = value;
    } else {
      errors.push('Estimated quantity must be a nonnegative whole number or null');
    }
  }

  if ('supplySource' in source) {
    const value = source.supplySource;
    if (value === null) {
      result.supplySource = null;
    } else if (value === 'donated' || value === 'purchased' || value === 'mixed_other') {
      result.supplySource = value;
    } else {
      errors.push('Supply source must be Donated, Purchased, Mixed/Other, or Unknown');
    }
  }

  if (errors.length > 0) {
    const error = new Error(errors.join(', ')) as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  return result;
};

export const validateFoodItem = (data: any): void => {
  const errors: string[] = [];

  if (!data.name || typeof data.name !== 'string' || data.name.length < 3 || data.name.length > 36) {
    errors.push('Name must be between 3 and 36 characters');
  }

  if (data.limit !== undefined) {
    if (typeof data.limit !== 'number' || data.limit < 1 || data.limit > 100) {
      errors.push('Limit must be a number between 1 and 100');
    }
  }
  
  if (data.limitType !== undefined && !['person', 'household'].includes(data.limitType)) {
    errors.push('Limit type must be either "person" or "household"');
  }

  if (!data.categoryId || typeof data.categoryId !== 'number' || data.categoryId < 1) {
    errors.push('Valid category ID is required');
  }

  if (errors.length > 0) {
    const error = new Error(errors.join(', ')) as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
};

export const transformFoodItem = (item: any) => ({
  id: item.id,
  name: item.name,
  nameSearch: item.nameSearch,
  limit: item.limit,
  limitType: item.limitType,
  categoryId: item.categoryId,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  fulfilment: {
    quantity: item.quantity ?? 0,
    unit: item.unit ?? 'unit',
    requiresStove: item.requiresStove ?? false,
    requiresFridge: item.requiresFridge ?? false,
  },
  supply: {
    estimatedQuantity: item.estimatedQuantity ?? null,
    supplySource: item.supplySource ?? null,
  },
  statusFlags: {
    isInStock: item.isInStock,
    isLimited: item.isLimited,
    isClearance: item.isClearance,
  },
  dietaryFlags: {
    vegan: item.vegan,
    vegetarian: item.vegetarian,
    glutenFree: item.glutenFree,
    organic: item.organic,
    halal: item.halal,
    kosher: item.kosher,
    readyToEat: item.readyToEat,
  }
});

export const validateIds = (ids: any): number[] => {
  if (!Array.isArray(ids) || ids.length === 0) {
    const error = new Error('Invalid food item IDs') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  return ids.map(id => {
    const numId = Number(id);
    if (isNaN(numId) || numId < 1) {
      const error = new Error('Invalid food item ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    return numId;
  });
};

export const handlePrismaError = (error: any): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') { // Unique constraint violation
      const friendlyError = new Error('A food item with this name already exists') as Error & { statusCode?: number };
      friendlyError.statusCode = 400;
      throw friendlyError;
    }
  }
  throw error;
};
