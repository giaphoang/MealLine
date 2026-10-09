// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// 'Generated (List)' is used by the Shopping List Builder's render-time
// translation pipeline. See packages/backend/src/services/builder-translation.ts
// (BUILDER_TRANSLATION_TYPE). Kept distinct from 'Generated' (DOCX) so the
// two streams can be filtered / curated independently in the admin UI.
export type TranslationType = 'Category' | 'FoodItem' | 'Custom' | 'Generated' | 'Generated (List)';
export type TranslationStatus = 'pending' | 'completed' | 'failed';
export type TranslationAction = 'includeOriginal' | 'removeOriginal';

export type TranslationCapabilities = Record<TranslationType, TranslationAction[]>;

export interface Translation {
  id: number;
  originalText: string;
  translatedText: string | null;
  status: TranslationStatus;
  language: string;
  type: TranslationType;
  skipTranslation?: boolean; // Flag for skipping translation
  createdAt: string;
  updatedAt: string;
}

export interface BulkOperationResult {
  success: number;
  changed?: number;
  skipped?: number;
  failed: number;
  errors: string[];
}

export interface BulkDeleteResult {
  success: {
    count: number;
    items?: number[];
  };
  failure: {
    count: number;
    items?: number[];
  };
}
