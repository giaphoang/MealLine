// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { ReactNode } from 'react';

export type TemplateType = 'full-page' | 'split-page' | 'custom';
export type GridOption = '2x3' | '2x4';
export type ListSection = 'client-info' | 'canned-goods' | 'produce' | 'frozen' | 'meat' | 'dairy' | 'beans' | 'dry-goods' | 'hygiene' | 'title-text' | 'regular-text';

export interface ShoppingList {
  id: number;
  name: string;
  templateType: TemplateType;
  gridOption?: GridOption;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingListWithSections extends ShoppingList {
  sections: ShoppingListSection[];
}

export interface ShoppingListTemplate {
  id: number;
  name: string;
  description?: string;
  language?: string;
  layoutType: string;
  createdAt: string;
  updatedAt: string;
  sections: ShoppingListSection[];
}

export interface ShoppingListTemplateWithSections extends ShoppingListTemplate {
  // sections are already in ShoppingListTemplate
}

export interface ShoppingListSection {
  id: number;
  sectionType: string;
  title: string;
  titleText?: string;
  icon: string;
  enabled: boolean;
  sortOrder: number;
  shoppingListId: number;
  items: ShoppingListItem[];
}

export interface ShoppingListItem {
  id: number;
  name: string;
  included: boolean;
  limit?: number;
  foodItemId?: number;
  sectionId: number;
}


// For UI components
export interface Section {
  id: ListSection | string;
  title: string;
  description?: string;
  showTitle?: boolean;
  icon: ReactNode | string;
  enabled: boolean;
  items: SectionItem[];
  categoryId?: number;
}

export interface SectionItem {
  id: number;
  name: string;
  included: boolean;
  limit?: number;
  foodItemId?: number;
}

// Instance-related interfaces
export interface ShoppingListInstance {
  id: number;
  templateId: number;
  generatedData: GeneratedShoppingListData;
  title: string;
  generatedAt: string;
  generatedBy?: string;
  template?: {
    id: number;
    name: string;
    layoutType: string;
    paperSize?: 'letter' | 'legal' | 'a4';
  };
}

export interface GeneratedShoppingListData {
  templateName: string;
  layoutType: string;
  generatedAt: string;
  sections: GeneratedSection[];
}

export interface GeneratedSection {
  id: string;
  sectionType: 'custom-text' | 'form' | 'category';
  title?: string;
  subtitle?: string;
  displayOrder: number;
  isEnabled: boolean;
  configuration: any;
  // Category section data
  categoryId?: number;
  categoryName?: string;
  categoryIcon?: string;
  items?: GeneratedItem[];
  // Custom text section data
  textContent?: string;
  textStyle?: 'title' | 'body' | 'instruction';
  alignment?: 'left' | 'center' | 'right';
  // Form section data
  formFields?: GeneratedFormField[];
}

export interface GeneratedItem {
  id: number;
  name: string;
  limit: number;
  limitSource: 'item' | 'category' | 'global';
  isInStock: boolean;
  included: boolean;
}

export interface GeneratedFormField {
  id: string;
  type: 'text' | 'number' | 'textarea' | 'checkbox';
  label: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  };
}

// Instance creation interfaces
export interface CreateInstanceData {
  templateId: number;
  title?: string;
  generatedBy?: string;
  // Optional server-side generation options (Approach #2)
  languages?: string[];
  translationOptions?: {
    skipElements?: string[];
    includeEnglishElements?: string[];
    useCacheElements?: string[];
    saveFormattingChoices?: boolean;
  };
  proceduralElements?: {
    includeListNumber?: boolean;
    includeFlipInstructions?: boolean;
    includeCategoryLimits?: boolean;
    includeDietaryFlags?: boolean;
    includeInventoryFlags?: boolean;
  };
  header?: {
    includeDate?: boolean;
  };
  dietaryFilters?: {
    filterMode?: 'include_all' | 'include_only' | 'exclude' | 'custom';
    includedFlags?: Array<'vegan' | 'vegetarian' | 'glutenFree' | 'organic' | 'halal' | 'kosher' | 'readyToEat'>;
    excludedFlags?: Array<'vegan' | 'vegetarian' | 'glutenFree' | 'organic' | 'halal' | 'kosher' | 'readyToEat'>;
  };
}

export interface InstanceGenerationResult {
  instance: ShoppingListInstance;
  success: boolean;
  message: string;
}

// API interfaces for backend communication
export interface ShoppingListTemplateUpdateInput {
  name?: string;
  description?: string;
  language?: string;
  layoutType?: 'full-page' | 'split-page' | 'grid-2x3' | 'grid-2x4';
  paperSize?: 'letter' | 'legal' | 'a4';
}

// Validation constants
export const SHOPPING_LIST_VALIDATION = {
  MIN_NAME_LENGTH: 3,
  MAX_NAME_LENGTH: 50,
  MIN_INSTANCE_TITLE_LENGTH: 3,
  MAX_INSTANCE_TITLE_LENGTH: 100
};

// Result interfaces for bulk operations
export interface BulkDeleteResult {
  success: {
    count: number;
    ids: number[];
  };
  failure: {
    count: number;
    ids: number[];
  };
}

export interface BulkOperationResult {
  success: number;
  failed: number;
  errors: string[];
}

// Mapping from category ID to icon name
export const CATEGORY_ICON_MAP: Record<string, string> = {
  'canned-goods': 'Soup',
  'produce': 'Apple',
  'frozen': 'Snowflake',
  'meat': 'Beef',
  'dairy': 'Egg',
  'beans': 'Package2',
  'dry-goods': 'Package2',
  'hygiene': 'ShoppingBag',
};

// Export unified types for template/instance table view
export type {
  UnifiedShoppingListItem,
  UnifiedShoppingListSortField,
  UnifiedShoppingListSortOptions
} from './unified';
export {
  createCompositeId,
  parseCompositeId,
  UNIFIED_SHOPPING_LIST_DISPLAY,
  isTemplateItem,
  isInstanceItem
} from './unified';
