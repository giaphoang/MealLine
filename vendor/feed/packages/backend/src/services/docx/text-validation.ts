// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { TextSegment } from './types';
import { TextValidator, TextValidationResult } from '../validation/text-validator';

/**
 * DOCX-specific text validation functionality
 * Determines which segments should be translated and which should be skipped
 */
export class DocxTextValidator {
  /**
   * Validates a text segment for translation
   * @param segment The text segment to validate
   * @returns Validation result with decision and reason
   */
  static validateSegment(segment: TextSegment): TextValidationResult {
    // First apply the generic text validation
    const result = TextValidator.validateForTranslation(segment.text);
    
    // Add any DOCX-specific validation rules here
    // For example, we might want to check for special DOCX-specific markers
    
    return result;
  }
  
  /**
   * Filters a list of segments to only those that should be translated
   * @param segments List of text segments
   * @returns An object containing filtered segments and skip count
   */
  static filterSegmentsForTranslation(segments: TextSegment[]): {
    filteredSegments: TextSegment[];
    skippedSegments: TextSegment[];
    skipReasons: Record<string, number>;
  } {
    const filteredSegments: TextSegment[] = [];
    const skippedSegments: TextSegment[] = [];
    const skipReasons: Record<string, number> = {};
    
    for (const segment of segments) {
      const validationResult = this.validateSegment(segment);
      
      if (validationResult.shouldTranslate) {
        filteredSegments.push(segment);
      } else {
        skippedSegments.push(segment);
        
        // Track skip reasons for reporting
        const reason = validationResult.reason || 'Unknown';
        skipReasons[reason] = (skipReasons[reason] || 0) + 1;
      }
    }
    
    return {
      filteredSegments,
      skippedSegments,
      skipReasons
    };
  }
}

export default DocxTextValidator;