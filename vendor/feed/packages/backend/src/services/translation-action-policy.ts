// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// Translation Action Policy
// Defines which translation actions are allowed per Translation.type
// Skip/Enable actions are deprecated for all types as of 2025-09-01.

export type TranslationAction = 'includeOriginal' | 'removeOriginal';

export type TranslationType = 'Category' | 'FoodItem' | 'Custom' | 'Generated';

type Capabilities = Record<TranslationType, TranslationAction[]>;

// Single source of truth for capabilities
const capabilities: Capabilities = {
  Category: [],
  FoodItem: [],
  Custom: ['includeOriginal', 'removeOriginal'],
  Generated: ['includeOriginal', 'removeOriginal'],
};

export function getCapabilities(): Capabilities {
  return capabilities;
}

export function isActionAllowed(type: string, action: TranslationAction): boolean {
  // Narrow unknown strings defensively
  if (!['Category', 'FoodItem', 'Custom', 'Generated'].includes(type)) {
    return false;
  }
  const list = capabilities[type as TranslationType] || [];
  return list.includes(action);
}

