// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, it, expect } from 'vitest';
import {
  BUILDER_FONT_SIZES,
  BUILDER_GRID_PT,
  BUILDER_LINE_HEIGHT_MULTIPLIER,
  BUILDER_MIN_ROW_HEIGHT_PT,
  BUILDER_MIN_TAGGED_HEADER_PT,
  DEFAULT_BUILDER_FONT_SIZE,
  SPLIT_PAGE_FONT_SIZES,
  SPLIT_PAGE_MAX_BUILDER_FONT_SIZE,
  baseRowHeight,
  estimateWrappedLineCount,
  isBuilderFontSize,
  nearestBuilderFontSize,
  snapHeightToGridForFontSize,
  taggedHeaderBand,
  taggedHeaderHeight,
  untaggedHeaderHeight,
} from './typography';

// This file is the frontend mirror of
// `packages/backend/src/lib/builder-typography.test.ts`. The two MUST stay in
// sync byte-for-byte (modulo the import path on line 17). The duplication is
// intentional and matches the typography source duplication; it guarantees
// canvas and PDF compute identical geometry.
describe('builder typography', () => {
  describe('constants', () => {
    it('exposes the 7 documented font sizes in ascending order', () => {
      // 20pt was removed during validation: its 27pt row left only 0.4pt of
      // subpixel slack, causing intermittent off-grid rendering. 18pt remains
      // the large-print maximum (already large-print compliant per ACB).
      expect(BUILDER_FONT_SIZES).toEqual([10, 10.5, 11, 12, 14, 16, 18]);
    });

    it('defaults to 10pt to preserve historical templates', () => {
      expect(DEFAULT_BUILDER_FONT_SIZE).toBe(10);
    });

    it('limits Split-page layout to small sizes only', () => {
      expect(SPLIT_PAGE_MAX_BUILDER_FONT_SIZE).toBe(14);
      expect(SPLIT_PAGE_FONT_SIZES).toEqual([10, 10.5, 11, 12, 14]);
    });
  });

  describe('baseRowHeight', () => {
    it('matches the published Phase 1 schedule exactly', () => {
      // Hand-verified schedule (ISSUES.md #26 Phase 1: 3pt grid, 15pt floor).
      // The planner and CSS depend on these exact values.
      expect(baseRowHeight(10)).toBe(15);
      expect(baseRowHeight(10.5)).toBe(18);
      expect(baseRowHeight(11)).toBe(18);
      expect(baseRowHeight(12)).toBe(18);
      expect(baseRowHeight(14)).toBe(21);
      expect(baseRowHeight(16)).toBe(24);
      expect(baseRowHeight(18)).toBe(27);
    });

    it('returns a 3pt multiple at every supported size', () => {
      for (const fontSize of BUILDER_FONT_SIZES) {
        expect(baseRowHeight(fontSize) % BUILDER_GRID_PT).toBe(0);
      }
    });

    it('never returns less than the 15pt minimum', () => {
      for (const fontSize of [1, 4, 7, 9, 10]) {
        expect(baseRowHeight(fontSize)).toBeGreaterThanOrEqual(BUILDER_MIN_ROW_HEIGHT_PT);
      }
    });

    it('always fits the natural line height plus padding', () => {
      for (const fontSize of BUILDER_FONT_SIZES) {
        const naturalLine = fontSize * BUILDER_LINE_HEIGHT_MULTIPLIER;
        expect(baseRowHeight(fontSize)).toBeGreaterThanOrEqual(naturalLine);
      }
    });

    it('is monotonically non-decreasing across supported sizes', () => {
      const heights = BUILDER_FONT_SIZES.map(baseRowHeight);
      for (let i = 1; i < heights.length; i += 1) {
        expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1]);
      }
    });
  });

  describe('taggedHeaderBand', () => {
    it('matches the published Phase 1 schedule exactly', () => {
      expect(taggedHeaderBand(10)).toBe(27);
      expect(taggedHeaderBand(10.5)).toBe(27);
      expect(taggedHeaderBand(11)).toBe(27);
      expect(taggedHeaderBand(12)).toBe(30);
      expect(taggedHeaderBand(14)).toBe(36);
      expect(taggedHeaderBand(16)).toBe(39);
      expect(taggedHeaderBand(18)).toBe(45);
    });

    it('matches the historical 27pt band at the default 10pt size', () => {
      // Regression guard: the title+tag stack at 10pt naturally measures
      // 24.24pt and snaps onto the MIN_TAGGED_HEADER_PT floor (27). Any
      // change here would silently reflow every saved 10pt template.
      expect(taggedHeaderBand(10)).toBe(27);
    });

    it('returns a 3pt multiple at every supported size', () => {
      for (const fontSize of BUILDER_FONT_SIZES) {
        expect(taggedHeaderBand(fontSize) % BUILDER_GRID_PT).toBe(0);
      }
    });

    it('is at least as tall as a single body row at the same font size', () => {
      for (const fontSize of BUILDER_FONT_SIZES) {
        expect(taggedHeaderBand(fontSize)).toBeGreaterThanOrEqual(baseRowHeight(fontSize));
      }
    });

    it('never returns less than the 27pt tagged-header minimum', () => {
      for (const fontSize of [1, 4, 7, 9, 10]) {
        expect(taggedHeaderBand(fontSize)).toBeGreaterThanOrEqual(BUILDER_MIN_TAGGED_HEADER_PT);
      }
    });

    it('is monotonically non-decreasing across supported sizes', () => {
      const heights = BUILDER_FONT_SIZES.map(taggedHeaderBand);
      for (let i = 1; i < heights.length; i += 1) {
        expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1]);
      }
    });
  });

  describe('taggedHeaderHeight (general case)', () => {
    // The 1+1 case must equal taggedHeaderBand for every supported size.
    it('equals taggedHeaderBand for single-line title + single-line tag', () => {
      for (const fontSize of BUILDER_FONT_SIZES) {
        expect(taggedHeaderHeight(fontSize, 1, 1, 1)).toBe(taggedHeaderBand(fontSize));
      }
    });

    // Phase 1 (ISSUES.md #26) snaps onto the new 3pt grid. The pre-Phase-1
    // formula matched a legacy `Math.ceil(13.5 * lineCount / 9) * 9` bit-for-
    // bit at 10pt; Phase 1 deliberately drops that lock so saved inventory
    // templates re-render with shorter (denser) tagged headers.
    it('matches the Phase 1 schedule at 10pt for wrapped titles', () => {
      // 1 title + 1 tag -> 27 (floor; was 27)
      expect(taggedHeaderHeight(10, 1, 1)).toBe(27);
      // 2 title + 1 tag -> 39 (was 45 pre-Phase-1)
      expect(taggedHeaderHeight(10, 2, 1)).toBe(39);
      // 2 title + 2 tag -> 48 (was 54)
      expect(taggedHeaderHeight(10, 2, 2)).toBe(48);
      // 3 title + 1 tag -> 51 (was 54)
      expect(taggedHeaderHeight(10, 3, 1)).toBe(51);
    });

    it('grows when a sibling column header wraps wider than the title stack', () => {
      // At fontSize 10: stacked title+tag = 10*1.3 + 8*1.3 = 23.4pt; a limit
      // header wrapped to 3 lines = 10*1.18*3 = 35.4pt and dominates -> snap
      // to 36pt (the next 3pt band, fitting the rendered content with 0.6pt
      // slack and matching what the canvas actually renders).
      expect(taggedHeaderHeight(10, 1, 1, 3)).toBe(36);
      // 4 lines: 10*1.18*4 = 47.2pt dominates -> snap to 48 (was 54 pre-Phase-1).
      expect(taggedHeaderHeight(10, 1, 1, 4)).toBe(48);
    });

    it('returns a 3pt multiple for every plausible combination across all supported sizes', () => {
      for (const fontSize of BUILDER_FONT_SIZES) {
        for (const titleLines of [1, 2, 3]) {
          for (const tagLines of [0, 1, 2]) {
            for (const otherLines of [1, 2, 3]) {
              const h = taggedHeaderHeight(fontSize, titleLines, tagLines, otherLines);
              expect(h % BUILDER_GRID_PT).toBe(0);
              expect(h).toBeGreaterThanOrEqual(BUILDER_MIN_TAGGED_HEADER_PT);
            }
          }
        }
      }
    });

    it('treats a missing tag (tagLineCount=0) as just title + padding', () => {
      // 10pt 1 title line, no tag -> max(13, 11.8) = 13 -> snap3=15 -> floor 27.
      expect(taggedHeaderHeight(10, 1, 0)).toBe(27);
    });
  });

  describe('untaggedHeaderHeight', () => {
    it('returns baseRowHeight for a single line', () => {
      for (const fontSize of BUILDER_FONT_SIZES) {
        expect(untaggedHeaderHeight(fontSize, 1)).toBe(baseRowHeight(fontSize));
      }
    });

    it('multiplies linearly by line count and stays on grid', () => {
      // Phase 1 (15pt rows at 10pt): 2 lines = 30 (was 36).
      expect(untaggedHeaderHeight(10, 2)).toBe(30);
      // Phase 1 (21pt rows at 14pt): 2 lines = 42 (was 54).
      expect(untaggedHeaderHeight(14, 2)).toBe(42);
      // Phase 1 (27pt rows at 18pt): 3 lines = 81 (unchanged).
      expect(untaggedHeaderHeight(18, 3)).toBe(81);
      for (const fontSize of BUILDER_FONT_SIZES) {
        for (const lineCount of [1, 2, 3, 4]) {
          expect(untaggedHeaderHeight(fontSize, lineCount) % BUILDER_GRID_PT).toBe(0);
        }
      }
    });

    it('treats non-positive line counts as 1 line', () => {
      expect(untaggedHeaderHeight(10, 0)).toBe(baseRowHeight(10));
      expect(untaggedHeaderHeight(10, -3)).toBe(baseRowHeight(10));
    });
  });

  describe('snapHeightToGridForFontSize', () => {
    it('returns the smallest 3pt multiple that holds the given line count', () => {
      // 10pt * 1.18 * 1 line + 3pt padding = 14.8 -> snap3 to 15 (was 18 pre-Phase-1)
      expect(snapHeightToGridForFontSize(10, 1)).toBe(15);
      // 10pt * 1.18 * 2 lines + 3 = 26.6 -> snap3 to 27
      expect(snapHeightToGridForFontSize(10, 2)).toBe(27);
      // 14pt * 1.18 * 1 line + 3 = 19.52 -> snap3 to 21 (was 27 pre-Phase-1)
      expect(snapHeightToGridForFontSize(14, 1)).toBe(21);
      // 18pt * 1.18 * 3 lines + 3 = 66.72 -> snap3 to 69 (was 72 pre-Phase-1)
      expect(snapHeightToGridForFontSize(18, 3)).toBe(69);
    });

    it('honors a custom line-height multiplier', () => {
      // 10pt * 1.1 * 1 + 3 = 14 -> snap3 to 15 (was 18 pre-Phase-1)
      expect(snapHeightToGridForFontSize(10, 1, 1.1)).toBe(15);
      // 18pt * 1.5 * 2 + 3 = 57 -> snap3 to 57 (was 63 pre-Phase-1)
      expect(snapHeightToGridForFontSize(18, 2, 1.5)).toBe(57);
    });

    it('returns a 3pt multiple at every supported size and 1-4 lines', () => {
      for (const fontSize of BUILDER_FONT_SIZES) {
        for (const lineCount of [1, 2, 3, 4]) {
          expect(snapHeightToGridForFontSize(fontSize, lineCount) % BUILDER_GRID_PT).toBe(0);
        }
      }
    });

    it('clamps non-positive line counts to a single line', () => {
      expect(snapHeightToGridForFontSize(10, 0)).toBe(snapHeightToGridForFontSize(10, 1));
      expect(snapHeightToGridForFontSize(18, -1)).toBe(snapHeightToGridForFontSize(18, 1));
    });
  });

  describe('estimateWrappedLineCount', () => {
    it('returns 1 line for empty content', () => {
      expect(estimateWrappedLineCount('', 200, 10)).toBe(1);
    });

    it('preserves explicit newlines', () => {
      expect(estimateWrappedLineCount('foo\nbar', 1000, 10)).toBe(2);
      expect(estimateWrappedLineCount('foo\n\nbar', 1000, 10)).toBe(3);
    });

    it('wraps long lines based on the character-width ratio', () => {
      // At 10pt and width 52pt: maxChars = floor(52 / (10 * 0.52)) = 10
      // 25-char string -> ceil(25/10) = 3 lines
      const sampleText = 'abcdefghijklmnopqrstuvwxy';
      expect(estimateWrappedLineCount(sampleText, 52, 10)).toBe(3);
    });

    it('wraps more aggressively at larger font sizes', () => {
      const sampleText = 'abcdefghij abcdefghij abcdefghij';
      const linesAt10 = estimateWrappedLineCount(sampleText, 100, 10);
      const linesAt20 = estimateWrappedLineCount(sampleText, 100, 20);
      expect(linesAt20).toBeGreaterThan(linesAt10);
    });
  });

  describe('isBuilderFontSize', () => {
    it('accepts all supported sizes', () => {
      for (const fontSize of BUILDER_FONT_SIZES) {
        expect(isBuilderFontSize(fontSize)).toBe(true);
      }
    });

    it('rejects unsupported sizes', () => {
      expect(isBuilderFontSize(9)).toBe(false);
      expect(isBuilderFontSize(13)).toBe(false);
      expect(isBuilderFontSize(15)).toBe(false);
      expect(isBuilderFontSize(24)).toBe(false);
      expect(isBuilderFontSize(0)).toBe(false);
    });
  });

  describe('nearestBuilderFontSize', () => {
    it('returns the exact size when it is already supported', () => {
      for (const fontSize of BUILDER_FONT_SIZES) {
        expect(nearestBuilderFontSize(fontSize)).toBe(fontSize);
      }
    });

    it('snaps legacy sizes down to the nearest supported size with conservative ties', () => {
      expect(nearestBuilderFontSize(13)).toBe(12); // tie between 12 and 14 -> conservative 12
      expect(nearestBuilderFontSize(15)).toBe(14);
      expect(nearestBuilderFontSize(17)).toBe(16);
      expect(nearestBuilderFontSize(19)).toBe(18);
      expect(nearestBuilderFontSize(20)).toBe(18); // 20 is no longer supported, snaps to 18
      expect(nearestBuilderFontSize(25)).toBe(18);
      expect(nearestBuilderFontSize(8)).toBe(10);
    });
  });
});
