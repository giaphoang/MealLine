// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

export type DocumentType = 'original' | 'translated';

export interface Document {
  id: number;
  name: string;
  createdAt: string;
  updatedAt?: string;
  fileSize?: string;
  file?: File;
  type: DocumentType;
  // For translations
  parentId?: number;
  language?: string;
  // File status
  hasContent?: boolean;
  hasIntegrityIssue?: boolean;
  wasCleared?: boolean;
  // UI metadata
  translationsCount?: number;
  cachedTranslationsCount?: number;
}