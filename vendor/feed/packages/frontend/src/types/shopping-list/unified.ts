// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { ShoppingListTemplate, ShoppingListSection, ShoppingListInstance, GeneratedShoppingListData } from './index';

/**
 * Utility functions for composite ID management in unified shopping list views
 */
export function createCompositeId(type: 'template' | 'instance', originalId: number): string {
  return `${type}-${originalId}`;
}

export function parseCompositeId(compositeId: string): { type: 'template' | 'instance'; originalId: number } {
  const [type, idStr] = compositeId.split('-');
  const originalId = parseInt(idStr, 10);
  
  if (!type || isNaN(originalId) || !['template', 'instance'].includes(type)) {
    throw new Error(`Invalid composite ID format: ${compositeId}`);
  }
  
  return { type: type as 'template' | 'instance', originalId };
}

/**
 * Unified interface representing both templates and instances in a single table view
 * Follows the AI Configuration pattern for handling multiple related data types
 */
export interface UnifiedShoppingListItem {
  id: string; // Composite ID format: "template-1" or "instance-1"
  name: string;
  type: 'template' | 'instance';
  isActive?: boolean; // DEPRECATED - Not used in UI, kept for backwards compatibility
  createdAt: string;
  updatedAt?: string;
  generatedAt?: string; // For instances only
  description?: string;
  
  // Template-specific fields (when type === 'template')
  language?: string;
  layoutType?: string;
  paperSize?: string;
  sections?: ShoppingListSection[];
  sectionsCount?: number; // Computed field for display
  
  // Instance-specific fields (when type === 'instance')
  templateId?: number;
  templateName?: string;
  generatedBy?: string;
  generatedData?: GeneratedShoppingListData;
  
  // Common display fields
  displayDate: string; // createdAt for templates, generatedAt for instances
  displayStatus?: string; // DEPRECATED - No longer used in UI
  displayDetails: string; // Computed field for description/details column
}

/**
 * Display configuration for different item types
 * DEPRECATED: Status references are no longer used in UI
 */
export const UNIFIED_SHOPPING_LIST_DISPLAY = {
  template: {
    iconName: 'FileText', // DEPRECATED - Use LayoutTemplate icon instead
    statusActive: 'active', // DEPRECATED
    statusInactive: 'inactive', // DEPRECATED
    dateLabel: 'Created',
    typeLabel: 'Template'
  },
  instance: {
    iconName: 'ShoppingCart', // DEPRECATED - Use ClipboardPenLine icon instead
    status: 'generated', // DEPRECATED
    dateLabel: 'Generated',
    typeLabel: 'Generated List'
  }
} as const;

/**
 * Type guards for unified shopping list items
 */
export function isTemplateItem(item: UnifiedShoppingListItem): item is UnifiedShoppingListItem & {
  type: 'template';
  isActive?: boolean; // Optional, deprecated field
  sections?: ShoppingListSection[];
  sectionsCount?: number;
} {
  return item.type === 'template';
}

export function isInstanceItem(item: UnifiedShoppingListItem): item is UnifiedShoppingListItem & {
  type: 'instance';
  templateId: number;
  templateName: string;
  generatedData: GeneratedShoppingListData;
} {
  return item.type === 'instance';
}

/**
 * Sorting options for unified shopping list items
 */
export type UnifiedShoppingListSortField = 
  | 'name' 
  | 'type' 
  | 'displayDate'; // Removed 'displayStatus' as it's deprecated

export interface UnifiedShoppingListSortOptions {
  field: UnifiedShoppingListSortField;
  direction: 'asc' | 'desc';
}
