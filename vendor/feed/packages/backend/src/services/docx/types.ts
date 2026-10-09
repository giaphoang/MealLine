// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Types used throughout the DOCX translation service
 */

// Special marker for style boundaries in documents
export const STYLE_BOUNDARY = '<!STYLE_BOUNDARY!>';

// Position information for locating elements in DOCX structure
export interface ElementPosition {
  paragraphIndex: number;
  runIndex: number;
  textElementIndex?: number; // For cases where multiple text elements exist in a run
}

// Text segment extracted from a DOCX file
export interface TextSegment {
  id: string;
  text: string;
  xpath: string; // XPath to locate the element in the document
  elementIds?: string[]; // Array of element IDs that make up this segment
  hasTrailingSpace?: boolean; // Whether this segment had a trailing space in the original document
  positions?: ElementPosition[]; // Position information for direct element targeting
  paragraphIndex?: number; // Primary paragraph index for this segment
}

// Result of parsing a DOCX file
export interface DocxParseResult {
  segments: TextSegment[];
  metadata: {
    paragraphCount: number;
    wordCount: number;
    charCount: number;
  };
}

// Result of text validation
export interface TextValidationResult {
  shouldTranslate: boolean;
  reason?: string;
}

// Extended metadata including text validation stats
export interface ValidationStats {
  skippedSegments: number;
  skipReasons: Record<string, number>;
  skipTranslationSegments?: number;
  skipTranslationReasons?: Record<string, number>;
}

// A segment that has been translated
export interface TranslatedSegment {
  id: string;
  text: string;
  translatedText: string;
  language: string;
  hasTrailingSpace?: boolean;
  positions?: ElementPosition[]; // Position information from original segment
  paragraphIndex?: number; // Primary paragraph index from original segment
}

// Cache status for a segment across selected languages
export interface SegmentCacheStatus {
  hasCachedTranslation: boolean; // True if cached in any selected language
}

// Enhanced segment for advanced mode with cache status
export interface AdvancedSegment {
  id: string;
  text: string;
  paragraphIndex: number;
  positions: ElementPosition[];
  isFiltered: boolean;
  isSkipped: boolean;
  hasSkipTranslation: boolean;
  instanceCount: number;
  cacheStatus: SegmentCacheStatus;
}

// Translation request parameters
export interface TranslationRequest {
  documentId: number;
  languages: string[];
  includeOriginalText?: boolean;
  // Advanced mode options
  segmentOptions?: SegmentOptions;
  // Conflict resolution
  overwrite?: boolean;
}

// Per-segment translation options for advanced mode
export interface SegmentOptions {
  skipSegments: string[]; // Array of segment text to skip
  includeEnglishSegments: string[]; // Array of segment text to include English
  bypassCache?: string[]; // Array of segment text to bypass cache and force fresh translation
}

// Progress tracking for translations
export interface TranslationProgress {
  documentId: number;
  language: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  message?: string;
  stats?: {
    total: number;
    cached: number;
    newTranslations: number;
    skipped?: number;
    skipReasons?: Record<string, number>;
    failed?: number; // Number of segments that failed to translate
  };
  warnings?: string[]; // Parameter override warnings (e.g., GPT-5 temperature/top_p)
}

// Result of translation API call
export interface TranslationResult {
  translatedText: string;
  metrics: {
    duration: number;
    promptTokens: number;
    completionTokens: number;
    totalCost: number;
  };
  warnings?: string[]; // Parameter override warnings from AI service
}
