// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

export interface Language {
  id: number;
  name: string;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BulkUpdateLanguageState {
  name: string;
  isEnabled: boolean;
  preserveTranslations?: boolean;
}

export interface BulkUpdateResult {
  success: {
    count: number;
    items: string[];
  };
  failure: {
    count: number;
    items: string[];
  };
}

export interface LanguageResponse {
  languages: Language[];
}

export interface BulkUpdateResponse {
  message: string;
  result: BulkUpdateResult;
}

export interface TranslationCountResponse {
  count: number;
}

export interface ActiveModelLanguageCoverage {
  id: string;
  displayName: string;
  provider: 'OpenAI' | 'Anthropic' | 'Google';
  languages: Record<string, 'evaluated' | 'supported' | 'unsupported'>;
}

export interface ActiveModelLanguageCoverageResponse {
  model: ActiveModelLanguageCoverage | null;
}
