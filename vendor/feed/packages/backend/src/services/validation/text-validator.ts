// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Text Validator Service
 * 
 * Provides utility functions to validate if text segments need translation
 * or should be skipped based on various criteria.
 */

export interface TextValidationResult {
  shouldTranslate: boolean;
  reason?: string;
}

export class TextValidator {
  /**
   * Checks if text contains only special characters or numbers
   * @param text Text to check
   * @returns True if text contains only special characters or numbers
   */
  static isSpecialCharacterOnly(text: string): boolean {
    // Check if text contains only special characters or numbers
    return /^[^a-zA-Z]+$/.test(text);
  }

  /**
   * Checks if text is a number or numeric value
   * @param text Text to check
   * @returns True if text represents a numeric value
   */
  static isNumeric(text: string): boolean {
    // Check if text is a numeric value (integer or decimal)
    return /^-?\d+(\.\d+)?$/.test(text);
  }

  /**
   * Checks if text is only punctuation
   * @param text Text to check
   * @returns True if text contains only punctuation
   */
  static isPunctuation(text: string): boolean {
    // Check if text contains only punctuation characters
    return /^[.,;:!?"'()\[\]{}\/\\<>+=\-_*&^%$#@~`|]+$/.test(text);
  }

  /**
   * Checks if text is too short to be meaningful for translation
   * @param text Text to check
   * @param minLength Minimum length threshold (default: 2)
   * @returns True if text is too short
   */
  static isTooShort(text: string, minLength: number = 2): boolean {
    return text.trim().length < minLength;
  }

  /**
   * Validates if text needs translation
   * @param text Text to validate
   * @returns Validation result with decision and reason
   */
  static validateForTranslation(text: string): TextValidationResult {
    const trimmedText = text.trim();
    
    // Skip empty text
    if (!trimmedText) {
      return {
        shouldTranslate: false,
        reason: 'Empty text'
      };
    }
    
    // Skip numeric values
    if (this.isNumeric(trimmedText)) {
      return {
        shouldTranslate: false,
        reason: 'Numeric value'
      };
    }
    
    // Skip punctuation-only text
    if (this.isPunctuation(trimmedText)) {
      return {
        shouldTranslate: false,
        reason: 'Punctuation only'
      };
    }
    
    // Skip very short text that contains special characters only
    if (this.isTooShort(trimmedText) && this.isSpecialCharacterOnly(trimmedText)) {
      return {
        shouldTranslate: false,
        reason: 'Too short and contains only special characters'
      };
    }
    
    // Default: text should be translated
    return {
      shouldTranslate: true
    };
  }
}

export default TextValidator;