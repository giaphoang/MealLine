// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { LimitType } from '../category';

export type { LimitType };

// Food item status enumeration based on validation constants
export type FoodItemStatus = 'in_stock' | 'limited' | 'clearance' | 'out_of_stock';

export interface StatusFlags {
  isInStock: boolean
  isLimited: boolean
  isClearance: boolean
}

export interface StatusDisplay {
  label: string
  color: string
  icon: string
  description: string
}

export interface StatusInfo {
  flags: StatusFlags
  displays: StatusDisplay[]
  isAvailable: boolean
}

export interface DietaryFlags {
  vegan: boolean
  vegetarian: boolean
  glutenFree: boolean
  organic: boolean
  halal: boolean
  kosher: boolean
  readyToEat: boolean
}

export type SupplySource = 'donated' | 'purchased' | 'mixed_other'

// Optional Supply annotations
// (docs/reports/operational-analytics-design.md).
export interface FoodItemSupply {
  estimatedQuantity: number | null
  supplySource: SupplySource | null
}

export interface FoodItemFulfilment {
  quantity: number
  unit: string
  requiresStove: boolean
  requiresFridge: boolean
}

export interface FoodItem {
  id: number
  name: string
  limit: number
  limitType: LimitType
  statusFlags: StatusFlags
  categoryId: number
  dietaryFlags: DietaryFlags
  supply: FoodItemSupply
  fulfilment?: FoodItemFulfilment
  createdAt: string
  updatedAt: string
}

export interface FoodItemValidation {
  MIN_LENGTH: number
  MAX_LENGTH: number
  MIN_LIMIT: number
  MAX_LIMIT: number
  VALID_STATUSES: string[]
}

export interface StatusMessage {
  type: 'success' | 'error' | 'info'
  message: string
}

// Constants for validation
export const FOOD_ITEM_VALIDATION: FoodItemValidation = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 36,
  MIN_LIMIT: 1,
  MAX_LIMIT: 100,
  VALID_STATUSES: ['in_stock', 'limited', 'clearance', 'out_of_stock']
} as const;

// Default values
export const DEFAULT_DIETARY_FLAGS: DietaryFlags = {
  vegan: false,
  vegetarian: false,
  glutenFree: false,
  organic: false,
  halal: false,
  kosher: false,
  readyToEat: false
}

export const DEFAULT_SUPPLY: FoodItemSupply = {
  estimatedQuantity: null,
  supplySource: null,
}

// Default values for status flags
export const DEFAULT_STATUS_FLAGS: StatusFlags = {
  isInStock: true,
  isLimited: false,
  isClearance: false
}

// Default out of stock flags
export const OUT_OF_STOCK_FLAGS: StatusFlags = {
  isInStock: false,
  isLimited: false,
  isClearance: false
}

// Form section labels
export const FOOD_ITEM_SECTIONS = {
  BASIC_INFO: 'Basic Information',
  STATUS: 'Item Status',
  DIETARY: 'Dietary Information'
} as const;

// Status flag display configuration
export const STATUS_DISPLAY_CONFIG = {
  IN_STOCK: {
    label: 'In Stock',
    color: 'bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-text)]',
    icon: 'package',
    description: 'Item is available for distribution'
  },
  LIMITED: {
    label: 'Limited Supply',
    color: 'bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning-text)]',
    icon: 'alert-triangle',
    description: 'Inventory is running low'
  },
  CLEARANCE: {
    label: 'Clearance',
    color: 'bg-[var(--status-danger-bg)] border-[var(--status-danger-border)] text-[var(--status-danger-text)]',
    icon: 'tag',
    description: 'Marked for priority distribution'
  },
  OUT_OF_STOCK: {
    label: 'Out of Stock',
    color: 'bg-[var(--status-neutral-bg)] border-[var(--status-neutral-border)] text-[var(--status-neutral-text)]',
    icon: 'x',
    description: 'Currently unavailable'
  }
} as const;
