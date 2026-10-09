// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Language } from '@prisma/client';

export interface BulkUpdateLanguageState {
  name: string;
  isEnabled: boolean;
}

export interface BulkUpdateResult {
  success: {
    count: number;
    items: string[];
    enabledCount: number;
  };
  failure: {
    count: number;
    items: string[];
  };
}

/**
 * Validates a language name
 * @param name - The language name to validate
 * @throws Error if the name is invalid
 */
export function validateLanguageName(name: string): void {
  if (typeof name !== 'string') {
    throw new Error('Language name must be a string');
  }

  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 50) {
    throw new Error('Language name must be between 2 and 50 characters');
  }
}

/**
 * Formats a bulk update result message
 * @param result - The bulk update result
 * @returns A user-friendly message describing the operation result
 */
export function formatBulkUpdateMessage(result: BulkUpdateResult): string {
  const { success, failure } = result;
  const parts: string[] = [];

  if (success.count > 0) {
    parts.push(`Successfully enabled ${success.enabledCount} language${success.enabledCount === 1 ? '' : 's'}`);
  }

  if (failure.count > 0) {
    parts.push(`Failed to update ${failure.count} language${failure.count === 1 ? '' : 's'}`);
  }

  return parts.join('. ') || 'No languages were updated';
}

/**
 * Validates an array of language state updates
 * @param updates - Array of language updates to validate
 * @throws Error if the updates are invalid
 */
export function validateBulkUpdate(updates: BulkUpdateLanguageState[]): void {
  if (!Array.isArray(updates)) {
    throw new Error('Updates must be an array');
  }

  if (updates.length === 0) {
    throw new Error('No languages provided for update');
  }

  // Check for duplicate names
  const names = new Set<string>();
  for (const update of updates) {
    if (names.has(update.name)) {
      throw new Error(`Duplicate language name found: ${update.name}`);
    }
    names.add(update.name);

    // Validate each update
    validateLanguageName(update.name);
    if (typeof update.isEnabled !== 'boolean') {
      throw new Error(`Invalid enabled state for language: ${update.name}`);
    }
  }
}