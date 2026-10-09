// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { STYLE_BOUNDARY } from './types';

/**
 * Manages style boundaries in DOCX documents.
 * Handles detection, preservation, and restoration of style boundaries
 * between differently formatted text elements.
 */
export class StyleManager {
  /**
   * Replaces style boundaries with visible markers for translation
   * @param text Text that may contain style boundaries
   * @returns Text with style boundaries replaced by visible markers
   */
  static convertBoundariesToMarkers(text: string): string {
    // Using unicode middle dot character as a visible separator
    // that's unlikely to be removed during translation
    return text.replace(new RegExp(STYLE_BOUNDARY, 'g'), ' · ');
  }

  /**
   * Restores style boundaries from visible markers in translated text
   * @param text Translated text with visible markers
   * @returns Text with proper style boundary markers restored
   */
  static restoreBoundariesFromMarkers(text: string): string {
    let processedText = text;
    
    // Replace all variations of the marker that might have been altered during translation
    processedText = processedText.replace(/ · /g, STYLE_BOUNDARY);
    processedText = processedText.replace(/ ·/g, STYLE_BOUNDARY);
    processedText = processedText.replace(/· /g, STYLE_BOUNDARY);
    processedText = processedText.replace(/·/g, STYLE_BOUNDARY);
    
    return processedText;
  }

  /**
   * Ensures proper spacing around style boundaries
   * @param text Text with style boundaries
   * @returns Text with properly spaced style boundaries
   */
  static normalizeSpacingAroundBoundaries(text: string): string {
    if (!text.includes(STYLE_BOUNDARY)) return text;
    
    // Ensure each style boundary has proper spacing
    return text
      .replace(new RegExp(`${STYLE_BOUNDARY}([^ ])`, 'g'), `${STYLE_BOUNDARY} $1`)
      .replace(new RegExp(`([^ ])${STYLE_BOUNDARY}`, 'g'), `$1 ${STYLE_BOUNDARY}`);
  }

  /**
   * Counts the number of style boundaries in text
   * @param text Text to analyze
   * @returns Number of style boundaries found
   */
  static countBoundaries(text: string): number {
    const matches = text.match(new RegExp(STYLE_BOUNDARY, 'g')) || [];
    return matches.length;
  }

  /**
   * Determines if text contains style boundaries
   * @param text Text to check
   * @returns Boolean indicating if text contains style boundaries
   */
  static hasBoundaries(text: string): boolean {
    return text.includes(STYLE_BOUNDARY);
  }

  /**
   * Gets instructions for translators on how to handle style boundaries
   * @returns Instructions string for translation API
   */
  static getTranslationInstructions(): string {
    return `This text contains style boundaries marked by the middle dot character (·). Please translate naturally while preserving these boundary markers in your translation. The middle dots indicate places where text formatting changes, so it's important they remain in the translated text with proper spacing around them. Each dot should have a space before and after it.`;
  }

  /**
   * Splits text at style boundaries
   * @param text Text containing style boundaries
   * @returns Array of text segments split at boundaries
   */
  static splitAtBoundaries(text: string): string[] {
    return text.split(STYLE_BOUNDARY);
  }
}

export default StyleManager;