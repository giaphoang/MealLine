// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { createContext, useContext } from 'react';
import { FoodItem, StatusMessage, DietaryFlags, StatusFlags, FoodItemSupply, FoodItemFulfilment } from '@/types/food-item';
import { useFoodItemData } from '@/hooks/food-item/useFoodData';

interface FoodItemContextType {
  foodItems: FoodItem[];
  isLoading: boolean;
  isSaving: boolean;
  error: StatusMessage | null;
  refreshFoodItems: () => Promise<void>;
  createFoodItem: (data: {
    name: string;
    limit: number;
    limitType?: FoodItem['limitType'];
    categoryId: number;
    statusFlags: StatusFlags;
    dietaryFlags: DietaryFlags;
    supplyUpdate?: FoodItemSupply;    fulfilmentUpdate?: FoodItemFulfilment;
  }) => Promise<FoodItem>;
  updateFoodItem: (data: {
    id: number;
    name: string;
    limit: number;
    limitType?: FoodItem['limitType'];
    categoryId: number;
    statusFlags: StatusFlags;
    dietaryFlags: DietaryFlags;
    supplyUpdate?: FoodItemSupply;    fulfilmentUpdate?: FoodItemFulfilment;
    keepTranslations?: boolean;
  }) => Promise<FoodItem>;
  deleteFoodItem: (id: number) => Promise<void>;
  bulkUpdateFoodItems: (
    items: FoodItem[],
    updates: Partial<Omit<FoodItem, 'id'>>
  ) => Promise<FoodItem[]>;
  bulkDeleteFoodItems: (items: FoodItem[]) => Promise<void>;
}

const FoodItemContext = createContext<FoodItemContextType | undefined>(undefined);

export function FoodItemProvider({ children }: { children: React.ReactNode }) {
  const foodItemData = useFoodItemData();

  return (
    <FoodItemContext.Provider value={foodItemData}>
      {children}
    </FoodItemContext.Provider>
  );
}

export function useFoodItemContext() {
  const context = useContext(FoodItemContext);
  if (context === undefined) {
    throw new Error('useFoodItemContext must be used within a FoodItemProvider');
  }
  return context;
}
