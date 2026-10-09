// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Special character handler for translation service
 * This function detects and handles text that only contains special characters or numbers
 */
export function isSpecialCharacterOnly(text: string): boolean {
  // Check if text contains only special characters or numbers
  return /^[^a-zA-Z]*$/.test(text);
}
