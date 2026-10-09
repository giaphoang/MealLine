// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

export type FoodItemStatus = 'in_stock' | 'limited' | 'clearance'

export interface NutritionalFlags {
  vegan: boolean
  vegetarian: boolean
  glutenFree: boolean
  organic: boolean
  halal: boolean
  kosher: boolean
  readyToEat: boolean
}

export interface FoodItem {
  id: number
  name: string
  limit: number
  status: FoodItemStatus
  nutritionalFlags: NutritionalFlags
  createdAt: string
  updatedAt: string
}

export interface StatusMessage {
  type: 'success' | 'error' | 'info'
  message: string
}