// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Shopping List Builder typography engine.
 *
 * Single source of truth for font-size-aware geometry in the Shopping List
 * Builder. All row heights, header heights, and text-component heights derive
 * from this module so that the canvas preview and the Chromium-rendered PDF
 * produce identical, 3pt-grid-safe geometry at every supported font size.
 *
 * **Mirror contract**: this file MUST stay byte-equivalent (modulo `export`
 * statements) with `packages/backend/src/lib/builder-typography.ts`. No
 * `packages/shared/` exists in this monorepo; we duplicate by hand the way
 * `AVERAGE_TABLE_CHARACTER_WIDTH_RATIO` and `FOOD_ICON_SVG_PATHS` are
 * duplicated. If you change one, update the other in the same commit.
 *
 * Design notes:
 * - Grid quantum is 3pt (was 9pt before the table-density work, ISSUES.md #26).
 *   All heights returned by this module are multiples of 3. Letter paper
 *   (612 × 792) and the page center (306) remain whole multiples.
 * - Line-height multiplier is 1.18. Picked so that `fontSize × 1.18 + 3pt
 *   padding` fits cleanly into 15pt for 10pt fonts and 27pt for 14–18pt
 *   fonts, giving a denser row schedule than the previous 18pt floor while
 *   keeping a 9pt-aligned 27pt large-print rhythm at the top.
 * - Tagged-header math accounts for two stacked lines (title + category-limit
 *   tag where tag-font = max(7, fontSize - 2)) and snaps the sum to the next
 *   3pt band.
 * - The 10pt baseRowHeight schedule moved from 18 to 15 in Phase 1 of the
 *   table-density work; saved templates with persisted `rowHeight: 18` are
 *   normalized on load via `normalizeLegacyRowHeight()` in the builder route
 *   so they pick up the new font-driven floor.
 */

export const BUILDER_FONT_SIZES = [10, 10.5, 11, 12, 14, 16, 18] as const;

export type BuilderFontSize = (typeof BUILDER_FONT_SIZES)[number];

export const DEFAULT_BUILDER_FONT_SIZE: BuilderFontSize = 10;

/**
 * Subset of font sizes that the section-table dropdown surfaces while the
 * template body is in Split-page layout. 14pt was enabled in split once the
 * #33 wrap-slack fix made row-height calculation reliable at that size in the
 * narrower split lanes; 16–18pt remain gated to Full-page (tightest slack).
 */
export const SPLIT_PAGE_MAX_BUILDER_FONT_SIZE = 14;

export const SPLIT_PAGE_FONT_SIZES: readonly BuilderFontSize[] = BUILDER_FONT_SIZES.filter(
  (size) => size <= SPLIT_PAGE_MAX_BUILDER_FONT_SIZE,
);

/**
 * Grid quantum in pt. Letter paper (612 × 792) and page center (306) are
 * evenly divisible by both 9 and 3. Phase 0 of the table-density work
 * (ISSUES.md #26) drops this from 9 to 3 so row heights can snap to a
 * tighter 15pt tier at 10pt fonts instead of the looser 18pt.
 */
export const BUILDER_GRID_PT = 3;

/**
 * CSS line-height multiplier applied to body cells, text components, date
 * components, form-field labels, and the non-stacked column headers
 * (limit / want) of section tables. 1.18 fits inside an 18pt row at <=12pt
 * font and inside a 27pt row at <=20pt font with non-zero slack, so rendered
 * content never overflows the computed cell height.
 */
export const BUILDER_LINE_HEIGHT_MULTIPLIER = 1.18;

/**
 * CSS line-height multiplier applied only to the stacked title + category-
 * limit-tag pair inside a tagged section-table header. Tightened to 1.3 so
 * the stacked title+tag pair stays compact and snaps onto sensible 3pt
 * bands at every supported font size. Sibling column headers in the same
 * row continue to use the body line-height multiplier above. Pre-Phase-1
 * this multiplier was tuned to preserve the legacy 10pt wrapped-header
 * heights (45/54pt) bit-for-bit; that guarantee was dropped in Phase 1.
 */
export const BUILDER_TAGGED_HEADER_LINE_HEIGHT_MULTIPLIER = 1.3;

/**
 * Vertical padding (top and bottom, in pt) applied inside body cells and
 * text/date/form-field containers. Together with the body line-height
 * multiplier this reproduces the canvas/PDF CSS exactly, so the rendered
 * cell height equals `baseRowHeight(fontSize)` to within subpixel precision
 * at every supported font size.
 */
export const BUILDER_CELL_VERTICAL_PADDING_PT = 1.5;

/**
 * Tagged section-table headers use justify-center alignment inside the
 * header grid row, so no extra container padding is needed -- the row's
 * min-height alone determines the band.
 */
export const BUILDER_TAGGED_HEADER_VERTICAL_PADDING_PT = 0;

/** Average character width as a fraction of font-size for the Noto Sans body font. */
export const BUILDER_CHARACTER_WIDTH_RATIO = 0.52;

/**
 * Minimum row height. Phase 0 table-density work (ISSUES.md #26) lowers
 * this from the historical 18pt to 15pt so a 10pt-font row (natural height
 * 10 × 1.18 + 3 = 14.8pt) snaps to a tight-but-legible 15pt instead of 18pt.
 */
export const BUILDER_MIN_ROW_HEIGHT_PT = 15;

/** Minimum tagged-header band. Historical value; never go below this. */
export const BUILDER_MIN_TAGGED_HEADER_PT = 27;

const snapUpToGrid = (value: number): number =>
  Math.ceil(value / BUILDER_GRID_PT) * BUILDER_GRID_PT;

const naturalLineHeight = (fontSize: number): number =>
  fontSize * BUILDER_LINE_HEIGHT_MULTIPLIER;

const totalVerticalPadding = (): number => 2 * BUILDER_CELL_VERTICAL_PADDING_PT;

/**
 * Smallest 3pt multiple that comfortably holds one line of text at the given
 * font size, including 1.5pt of breathing room above and below the line.
 *
 * Schedule (Phase 1 table-density work, ISSUES.md #26):
 *   10    pt → 15 pt
 *   10.5–12 pt → 18 pt
 *   14    pt → 21 pt
 *   16    pt → 24 pt
 *   18    pt → 27 pt
 *
 * Multi-line rows multiply this by the line count (still on grid by
 * construction).
 */
export function baseRowHeight(fontSize: number): number {
  const natural = naturalLineHeight(fontSize) + totalVerticalPadding();
  return Math.max(BUILDER_MIN_ROW_HEIGHT_PT, snapUpToGrid(natural));
}

/**
 * Smallest 3pt multiple that holds a section-table header containing both a
 * title line (fontSize) and a category-limit tag line (max(7, fontSize - 2)).
 * Includes 1.5pt of breathing room above and below the stacked pair.
 *
 * Schedule (Phase 1 table-density work, ISSUES.md #26):
 *   10–11 pt → 27 pt
 *   12    pt → 30 pt
 *   14    pt → 36 pt
 *   16    pt → 39 pt
 *   18    pt → 45 pt
 */
export function taggedHeaderBand(fontSize: number): number {
  const tagFontSize = Math.max(7, fontSize - 2);
  const stackedNatural =
    naturalLineHeight(fontSize) +
    naturalLineHeight(tagFontSize) +
    totalVerticalPadding();
  return Math.max(BUILDER_MIN_TAGGED_HEADER_PT, snapUpToGrid(stackedNatural));
}

/**
 * Untagged header height for a given font size and rendered title line count
 * (1 by default; grows when long titles wrap). Always a 3pt multiple via
 * baseRowHeight.
 */
export function untaggedHeaderHeight(fontSize: number, lineCount = 1): number {
  return baseRowHeight(fontSize) * Math.max(1, lineCount);
}

/**
 * General tagged-header height for a section table whose title may wrap to
 * multiple lines, whose category-limit tag may wrap to multiple lines, and
 * whose limit/want column headers may independently wrap. The header band is
 * the max of:
 *   - stacked title (titleLineCount × fontSize × tagged-line-height)
 *     + tag (tagLineCount × max(7, fontSize-2) × tagged-line-height)
 *   - the tallest sibling column header
 * plus vertical padding, then snapped up to the next 3pt grid line, with a
 * floor of {@link BUILDER_MIN_TAGGED_HEADER_PT}.
 *
 * Phase 1 of the table-density work (ISSUES.md #26) intentionally drops the
 * pre-existing bit-for-bit "legacy 10pt formula" guarantee: the same formula
 * now snaps onto a 3pt grid instead of 9pt, so a 2-line-title + 1-line-tag
 * stack at 10pt comes out to 39pt instead of 45pt. Saved templates re-render
 * with shifted (smaller) tagged-header heights.
 */
export function taggedHeaderHeight(
  fontSize: number,
  titleLineCount: number,
  tagLineCount: number,
  otherHeaderMaxLineCount: number = 1,
): number {
  const tagFontSize = Math.max(7, fontSize - 2);
  // The title + tag pair is rendered with a dedicated tighter line-height
  // (BUILDER_TAGGED_HEADER_LINE_HEIGHT_MULTIPLIER) so the stacked pair stays
  // compact and snaps onto a 3pt-multiple band at every supported font size.
  const stackedTitleAndTag =
    fontSize * BUILDER_TAGGED_HEADER_LINE_HEIGHT_MULTIPLIER * Math.max(1, titleLineCount) +
    tagFontSize * BUILDER_TAGGED_HEADER_LINE_HEIGHT_MULTIPLIER * Math.max(0, tagLineCount);
  // The sibling column headers (limit / want) render with the body line-
  // height multiplier inside the same grid row, so their max wrapped height
  // competes directly with the stacked title + tag for the row's min-height.
  const otherHeaderContent =
    naturalLineHeight(fontSize) * Math.max(1, otherHeaderMaxLineCount);
  const natural =
    Math.max(stackedTitleAndTag, otherHeaderContent)
    + 2 * BUILDER_TAGGED_HEADER_VERTICAL_PADDING_PT;
  return Math.max(BUILDER_MIN_TAGGED_HEADER_PT, snapUpToGrid(natural));
}

/**
 * Smallest 3pt multiple needed to hold `lineCount` lines of body text at the
 * given font size and CSS line-height multiplier. Used by the text/date
 * auto-snap-height logic when the user changes font size.
 */
export function snapHeightToGridForFontSize(
  fontSize: number,
  lineCount: number,
  lineHeightMultiplier: number = BUILDER_LINE_HEIGHT_MULTIPLIER,
): number {
  const safeLineCount = Math.max(1, Math.floor(lineCount));
  const natural = fontSize * lineHeightMultiplier * safeLineCount + totalVerticalPadding();
  return Math.max(BUILDER_GRID_PT, snapUpToGrid(natural));
}

/**
 * Estimate the number of wrapped lines for a string rendered at `fontSize` in
 * `availableWidth` pt. Mirrors the existing `estimateWrappedLineCount`
 * implementations under the same character-width ratio. Kept here so callers
 * can eliminate their duplicate copies over time.
 */
export function estimateWrappedLineCount(
  text: string,
  availableWidth: number,
  fontSize: number,
): number {
  const maxCharsPerLine = Math.max(
    1,
    Math.floor(
      availableWidth / Math.max(1, fontSize * BUILDER_CHARACTER_WIDTH_RATIO),
    ),
  );
  if (!text) {
    return 1;
  }
  const lines = text.split(/\r?\n/);
  let total = 0;
  for (const line of lines) {
    if (line.length === 0) {
      total += 1;
    } else {
      total += Math.ceil(line.length / maxCharsPerLine);
    }
  }
  return Math.max(1, total);
}

/**
 * True iff `fontSize` is one of the values offered by the builder dropdown.
 * Loaded templates with legacy font sizes still render correctly; this is
 * only consulted for UI input validation.
 */
export function isBuilderFontSize(fontSize: number): fontSize is BuilderFontSize {
  return (BUILDER_FONT_SIZES as readonly number[]).includes(fontSize);
}

/**
 * Coerce an arbitrary numeric font size to the nearest supported builder
 * size. Used when reading legacy templates or recovering from out-of-range
 * payloads. Ties round down (toward the smaller, more conservative size).
 */
export function nearestBuilderFontSize(fontSize: number): BuilderFontSize {
  let best: BuilderFontSize = DEFAULT_BUILDER_FONT_SIZE;
  let bestDelta = Math.abs(fontSize - DEFAULT_BUILDER_FONT_SIZE);
  for (const candidate of BUILDER_FONT_SIZES) {
    const delta = Math.abs(fontSize - candidate);
    if (delta < bestDelta || (delta === bestDelta && candidate < best)) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}
