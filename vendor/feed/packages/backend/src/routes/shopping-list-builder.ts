// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { renderHtmlToPdf } from '../services/pdf/chromium';
import { printBrand } from '../services/brand-config';
import prisma from '../db';
import { FOOD_ICON_SVG_PATHS } from '../lib/icon-svgs';
import {
  BUILDER_CELL_VERTICAL_PADDING_PT,
  BUILDER_LINE_HEIGHT_MULTIPLIER,
  BUILDER_TAGGED_HEADER_LINE_HEIGHT_MULTIPLIER,
  baseRowHeight,
  snapHeightToGridForFontSize,
  taggedHeaderHeight,
  untaggedHeaderHeight,
} from '../lib/builder-typography';
import {
  classifyTranslationProviderError,
  lookupBuilderTranslations,
  translateBuilderStrings,
  type TranslationProviderFailure,
} from '../services/builder-translation';
import { createRouteError, type AppRouteError } from '../lib/route-error';

const pdfmake = require('pdfmake');

const router = Router();

type BuilderComponentType = 'text' | 'form-field-group' | 'section-table' | 'line' | 'date' | 'language-tag' | 'legend';
type BuilderLayoutMode = 'guided' | 'freeform';
type BuilderDateMode = 'today' | 'custom';
type BuilderDateFormatId =
  | 'long-ordinal'
  | 'long'
  | 'medium'
  | 'short-slash'
  | 'short-dash'
  | 'iso';
type BuilderBodyLayoutMode = 'full' | 'split';
type BuilderBodyLane = 'full' | 'left' | 'right';
type BuilderComponentRegion = 'header' | 'body' | 'footer';
type BuilderHeaderFooterRepeatMode = 'every' | 'odd' | 'even' | 'once';
// `single-sided`: render exactly the planner's page count.
// `two-sided-duplicate`: always duplicate the rendered output (1 page → 2,
//   2 pages → 4, etc.) so a stack of single-side prints comes out two-sided.
// `two-sided-when-single-page`: smart variant used by the bulk-export
//   modal. Only duplicates when the planner reports 1 page; multi-page
//   outputs pass through unchanged because they already paginate sensibly
//   for two-sided printing.
type BuilderPrintMode =
  | 'single-sided'
  | 'two-sided-duplicate'
  | 'two-sided-when-single-page';
type BuilderTableFlowMode = 'fixed' | 'flowing';
type BuilderLanguageTagMode = 'hide-english' | 'english' | 'native' | 'native-with-english';

const DEFAULT_HEADER_HEIGHT = 36;
const DEFAULT_FOOTER_HEIGHT = 36;
const DEFAULT_BODY_COLUMN_GAP = 18;
const DEFAULT_GRID_SIZE = 3;
const LEGACY_DEFAULT_GRID_SIZE = 9;
const DEFAULT_MAX_PAGES = 1;
const DEFAULT_INCLUDE_CATEGORY_ICONS = true;
const MAX_BUILDER_PAGES = 5;
const DEFAULT_BUILDER_COMPONENT_WIDTH = 267;
const DEFAULT_SECTION_TABLE_LIMIT_WIDTH = 51;
const DEFAULT_SECTION_TABLE_WANT_WIDTH = 57;
const DEFAULT_SECTION_TABLE_CORNER_RADIUS = 9;
const DEFAULT_LANGUAGE_TAG_MODE: BuilderLanguageTagMode = 'english';
// Section-table and form-field row rhythm. Phase 0 table-density work
// (ISSUES.md #26) lowers this from 18pt to 15pt; 15pt = 5 x 3pt so every
// row still finishes on the (now 3pt) grid line.
const DEFAULT_FORM_FIELD_ROW_HEIGHT = 15;
const DEFAULT_SECTION_TABLE_ROW_HEIGHT = 15;
// Tighter per-line height used only for the section-table header row when a
// category-limit tag is present. The final tagged-header height snaps to the
// typography grid, so the common title + tag stack is 27pt instead of the
// previous off-grid 28pt.
const SECTION_TABLE_HEADER_TIGHT_LINE_HEIGHT = 13.5;
// Flowing pdfmake tables are kept behind this guard until the canvas can preview
// the same pagination/column behavior. The builder's current contract is WYSIWYP.
const ENABLE_FLOWING_TABLE_PDF_OUTPUT = false;
const TABLE_CELL_HORIZONTAL_PADDING = 8;
const AVERAGE_TABLE_CHARACTER_WIDTH_RATIO = 0.52;
// Inline-tag font size for the 'translate-with-original' mode. Matches the
// frontend renderer so canvas preview and Chromium PDF stay aligned.
const TEXT_ORIGINAL_TAG_FONT_SIZE_PT = 8;
// Chromium renders the bold 8pt English tag slightly wider than the estimator's
// average glyph widths. Measure it conservatively so adaptive Include English
// rows reserve the second line before the browser wraps the tag there.
// Conservative measure size for the bold 8pt English tag. Bumped from 8.5
// to 9.5pt after testing on macOS Chrome found 8.5pt undercounted certain
// Russian/Cyrillic + bold-Latin combinations -- e.g. "Миндальное молоко"
// + "Almond Milk" and "Макароны с сыром" + "Mac & Cheese" measured ~143px
// in headless puppeteer (fits the 148px cell) but rendered slightly wider
// in real Chrome and wrapped to a 2nd line, causing the row to overflow
// its planned 15pt height. The render still uses 8pt; only measurement
// is conservative. 9.5pt gives ~18% margin over the 8pt render, which
// covers the per-glyph metric variance we've seen across browsers.
const TEXT_ORIGINAL_TAG_MEASURE_FONT_SIZE_PT = 9.5;
const BUILDER_PDF_FONT_FAMILY = 'NotoSans';
const BUILDER_PDF_SYMBOLS_FONT_FAMILY = 'NotoSansSymbols2';
const BUILDER_PDF_FONT_DIR = path.join(process.cwd(), 'assets', 'fonts', 'noto-sans');
// Optional CJK font assets, loaded only when the active target language
// is Chinese / Japanese / Korean (see isCJKTargetLanguage below). They
// live in their own directory because the variable fonts are large
// (~36 MB combined) and we don't want to base64-embed them in every
// English PDF render.
const BUILDER_PDF_CJK_FONT_DIR = path.join(process.cwd(), 'assets', 'fonts', 'noto-sans-cjk');
// CJK family names sit at the END of the stack so Latin / Cyrillic /
// Arabic / Hebrew glyphs continue to come from Noto Sans + Naskh Arabic
// + Noto Sans Hebrew first. When the CJK @font-face rules aren't loaded
// (English-language renders), Chromium silently skips the missing
// families and falls through to Arial / sans-serif.
const BUILDER_HTML_FONT_STACK = '"Noto Sans", "Noto Sans Symbols", "Noto Sans Symbols 2", "Noto Naskh Arabic", "Noto Sans Hebrew", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR", Arial, Helvetica, sans-serif';


interface BuilderPaper {
  size: 'letter';
  width: number;
  height: number;
  unit: 'pt';
}

interface BuilderComponentBase {
  id: string;
  type: BuilderComponentType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  region?: BuilderComponentRegion;
  repeatMode?: BuilderHeaderFooterRepeatMode;
}

// Per-component translation mode set via the builder's Properties panel
// "Translation Settings" modal. Persisted as part of `templateData` JSON;
// no schema migration. Default (undefined) is 'translate' so legacy
// templates produce the same translated output as before this field
// existed.
type BuilderTranslationMode =
  | 'skip'
  | 'translate'
  | 'translate-with-original'
  | 'translate-with-original-block'
  // `-adaptive`: like `translate-with-original` but the 8pt bold English tag
  // is an unbreakable unit -- it stays on the translation's last line if it
  // fits, otherwise drops whole onto the next line. Default for inventory
  // section table rows. Kept in sync with the frontend `BuilderTranslationMode`.
  | 'translate-with-original-adaptive';

interface SectionTableTranslationSettings {
  headers?: BuilderTranslationMode;
  tags?: BuilderTranslationMode;
  rows?: BuilderTranslationMode;
}

const SECTION_TABLE_TRANSLATION_HEIGHT_ADJUSTMENT_MIN = -9;
const SECTION_TABLE_TRANSLATION_HEIGHT_ADJUSTMENT_MAX = 9;

const normalizeSectionTableTranslationHeightAdjustment = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(
    SECTION_TABLE_TRANSLATION_HEIGHT_ADJUSTMENT_MIN,
    Math.min(SECTION_TABLE_TRANSLATION_HEIGHT_ADJUSTMENT_MAX, Math.round(numeric)),
  );
};

const DEFAULT_INVENTORY_SECTION_TRANSLATION_SETTINGS: Required<SectionTableTranslationSettings> = {
  headers: 'translate',
  tags: 'translate',
  rows: 'translate-with-original-adaptive',
};

const resolveSectionTableTranslationSettings = (
  settings: SectionTableTranslationSettings | undefined,
): Required<SectionTableTranslationSettings> => ({
  headers: settings?.headers ?? DEFAULT_INVENTORY_SECTION_TRANSLATION_SETTINGS.headers,
  tags: settings?.tags ?? DEFAULT_INVENTORY_SECTION_TRANSLATION_SETTINGS.tags,
  rows: settings?.rows ?? DEFAULT_INVENTORY_SECTION_TRANSLATION_SETTINGS.rows,
});

interface BuilderTextMeasureSegment {
  text: string;
  fontSize: number;
  fontWeight?: 'normal' | 'bold';
  // When true the segment's whole `text` is measured as one unbreakable
  // token -- internal whitespace is NOT a wrap opportunity. Used by the
  // `translate-with-original-adaptive` mode so the 8pt English tag either
  // fits on the current line or drops whole onto the next one.
  atomic?: boolean;
}

interface SectionTableMeasurementOptions {
  language?: string;
  translations?: Record<string, string>;
  inventoryTranslations?: {
    categories: Record<number, string>;
    foodItems: Record<number, string>;
  };
}

interface TextBuilderComponent extends BuilderComponentBase {
  type: 'text';
  content: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  translationMode?: BuilderTranslationMode;
}

interface FormFieldGroupBuilderComponent extends BuilderComponentBase {
  type: 'form-field-group';
  fields: Array<{ id: string; label: string; translationMode?: BuilderTranslationMode }>;
  labelWidth: number;
  fontSize: number;
  cornerRadius?: number;
  // A1/A3 (forms): mirror the section-table border toggles. Optional; default
  // `true` (read as `!== false`). Mirrors the frontend.
  // - showColumnDividers gates the vertical label|value divider.
  // - showBorders gates the outer box + horizontal row separators.
  showColumnDividers?: boolean;
  showBorders?: boolean;
}

interface SectionTableBuilderComponent extends BuilderComponentBase {
  type: 'section-table';
  title: string;
  rows: Array<{
    id: string;
    item: string;
    limit: string;
    foodItemId?: number;
    limitSource?: 'food-item' | 'category' | 'none';
    // A6 LEGACY: per-row checkbox control, superseded by the table-level
    // `SectionTableBuilderComponent.wantControl`. Still read by
    // `resolveSectionTableWantControl` as a back-compat fallback when the
    // table-level field is unset. No UI surface remains. Mirrors the frontend.
    // See ISSUES.md #43.
    wantControl?: 'blank' | 'checkbox';
    // A2: per-row status for the optional Limited/Clearance icons.
    isLimited?: boolean;
    isClearance?: boolean;
  }>;
  showLimit: boolean;
  // Show/hide the Want column (A5). Optional for back-compat; always read as
  // `component.showWant !== false` (undefined = show). Mirrors the frontend.
  showWant?: boolean;
  // A6: when 'checkbox', the Want column renders an empty checkbox in every
  // row instead of the blank fill-in space. Optional; default 'blank' (read
  // via `resolveSectionTableWantControl`, which falls back to legacy per-row
  // `wantControl` for back-compat). Lifted from per-row because the row-level
  // setting was tedious and never reliably persisted on inventory-backed
  // tables — refresh-inventory rebuild wiped per-row fields. See ISSUES.md
  // #43. Mirrors the frontend.
  wantControl?: 'blank' | 'checkbox';
  // A1/A3: show/hide column dividers and table/cell borders. Optional;
  // default true (read as `!== false`). Mirrors the frontend.
  showColumnDividers?: boolean;
  showBorders?: boolean;
  // A2: show Limited/Clearance status icons on rows. Optional; default false
  // (read as `=== true`). Mirrors the frontend.
  showStatusIcons?: boolean;
  // B3: when on, rows with no item-level limit ("No Limit") display the
  // current Global Limit value in the Limit column instead of a blank cell.
  // Optional; default ON (read as `!== false`, ISSUES.md #39) so the org-wide
  // Global Limit caps "No Limit" items by default; an explicit `false` opts a
  // table out. Mirrors the frontend. The value itself is resolved live at
  // render time, never baked into rows.
  showGlobalLimit?: boolean;
  limitHeader: string;
  wantHeader: string;
  limitWidth: number;
  wantWidth: number;
  fontSize: number;
  rowHeight: number;
  alternateRows: boolean;
  flowMode?: BuilderTableFlowMode;
  repeatHeaderRows?: boolean;
  keepHeaderWithFirstRow?: boolean;
  keepRowsTogether?: boolean;
  cornerRadius?: number;
  categoryLimit?: number | null;
  categoryLimitType?: 'person' | 'household' | null;
  translationSettings?: SectionTableTranslationSettings;
  translationHeightAdjustments?: Record<string, number>;
  inventorySource?: {
    categoryId: number;
    categoryName: string;
    categoryIcon?: string | null;
    generatedAt: string;
  };
}

interface LineBuilderComponent extends BuilderComponentBase {
  type: 'line';
  strokeWidth: number;
  direction: 'horizontal' | 'vertical';
}

interface DateBuilderComponent extends BuilderComponentBase {
  type: 'date';
  dateMode: BuilderDateMode;
  customDate?: string;
  formatId: BuilderDateFormatId;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  translationMode?: BuilderTranslationMode;
}

interface LanguageTagBuilderComponent extends BuilderComponentBase {
  type: 'language-tag';
  mode?: BuilderLanguageTagMode;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

// A4: Legend base component (focused status legend) — mirrors the frontend.
interface LegendBuilderComponent extends BuilderComponentBase {
  type: 'legend';
  fontSize: number;
  layout: 'horizontal' | 'vertical';
  showLimited: boolean;
  limitedLabel: string;
  showClearance: boolean;
  clearanceLabel: string;
}

type BuilderComponent =
  | TextBuilderComponent
  | FormFieldGroupBuilderComponent
  | SectionTableBuilderComponent
  | LineBuilderComponent
  | DateBuilderComponent
  | LanguageTagBuilderComponent
  | LegendBuilderComponent;

export interface ShoppingListBuilderTemplate {
  id: string;
  name: string;
  paper: BuilderPaper;
  components: BuilderComponent[];
  layoutMode?: BuilderLayoutMode;
  bodyLayoutMode?: BuilderBodyLayoutMode;
  headerHeight?: number;
  footerHeight?: number;
  bodyColumnGap?: number;
  maxPages?: number;
  printMode?: BuilderPrintMode;
  includeCategoryIcons?: boolean;
  // Optional per-template placement grid size in pt. Mirrors the frontend
  // `gridSize` field; defaults to DEFAULT_GRID_SIZE when absent. Phase 1 of
  // ISSUES.md #26 normalizes legacy 9pt grids onto the new 3pt default.
  gridSize?: number;
}

interface SaveBuilderComponentRequest {
  name?: unknown;
  component?: BuilderComponent;
}

interface SaveBuilderTemplateRequest {
  name?: unknown;
  template?: ShoppingListBuilderTemplate;
}

interface UpdateInventoryLimitRequest {
  limit?: unknown;
}

pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setFonts({
  [BUILDER_PDF_FONT_FAMILY]: {
    normal: path.join(BUILDER_PDF_FONT_DIR, 'NotoSans-Regular.ttf'),
    bold: path.join(BUILDER_PDF_FONT_DIR, 'NotoSans-Bold.ttf'),
    italics: path.join(BUILDER_PDF_FONT_DIR, 'NotoSans-Italic.ttf'),
    bolditalics: path.join(BUILDER_PDF_FONT_DIR, 'NotoSans-BoldItalic.ttf'),
  },
  // NotoSansSymbols2 is registered for the deferred pdfmake flow-table spike.
  // Active builder PDFs use Chromium/HTML export below because pdfmake does
  // not provide browser-grade font fallback or bidi shaping.
  [BUILDER_PDF_SYMBOLS_FONT_FAMILY]: {
    normal: path.join(BUILDER_PDF_FONT_DIR, 'NotoSansSymbols2-Regular.ttf'),
    bold: path.join(BUILDER_PDF_FONT_DIR, 'NotoSansSymbols2-Regular.ttf'),
    italics: path.join(BUILDER_PDF_FONT_DIR, 'NotoSansSymbols2-Regular.ttf'),
    bolditalics: path.join(BUILDER_PDF_FONT_DIR, 'NotoSansSymbols2-Regular.ttf'),
  },
});

// Shopping List Builder content is part of the single org-wide shared data
// environment (see ISSUES.md #31): templates and saved components are visible
// to every authenticated user, not partitioned per account. This guard only
// enforces that the caller is logged in.
const requireAuth = (req: Request) => {
  if (req.auth?.userId) {
    return;
  }

  if (process.env.NODE_ENV === 'development' && process.env.FORCE_AUTH !== 'true') {
    return;
  }

  throw createRouteError('Please log in to save and load shopping list builder content.', 401);
};

const asNumber = (value: unknown, fallback: number) => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const getTemplateHeaderHeight = (template: ShoppingListBuilderTemplate) => Math.max(0, asNumber(
  template.headerHeight,
  DEFAULT_HEADER_HEIGHT,
));

const getTemplateFooterHeight = (template: ShoppingListBuilderTemplate) => Math.max(0, asNumber(
  template.footerHeight,
  DEFAULT_FOOTER_HEIGHT,
));

const getTemplateBodyColumnGap = (template: ShoppingListBuilderTemplate) => Math.max(0, asNumber(
  template.bodyColumnGap,
  DEFAULT_BODY_COLUMN_GAP,
));

const getTemplateMaxPages = (template: ShoppingListBuilderTemplate) => Math.min(
  MAX_BUILDER_PAGES,
  Math.max(1, Math.round(asNumber(template.maxPages, DEFAULT_MAX_PAGES))),
);

const isBuilderPrintMode = (value: unknown): value is BuilderPrintMode => (
  value === 'single-sided'
  || value === 'two-sided-duplicate'
  || value === 'two-sided-when-single-page'
);

const getTemplatePrintMode = (template: ShoppingListBuilderTemplate): BuilderPrintMode => (
  isBuilderPrintMode(template.printMode) ? template.printMode : 'single-sided'
);

// Resolve the print mode the renderer should use. The render-time
// `override` (passed by the bulk-export modal) wins over the persisted
// `template.printMode` when present so staff can fan out a saved
// single-sided template into two-sided PDFs without mutating the template.
const resolveEffectivePrintMode = (
  template: ShoppingListBuilderTemplate,
  override: unknown,
): BuilderPrintMode => (
  isBuilderPrintMode(override) ? override : getTemplatePrintMode(template)
);

// Reduce a print mode + planner page count to "do we duplicate the page
// HTML before printing?". `'two-sided-when-single-page'` only duplicates
// 1-page outputs; multi-page outputs pass through because they already
// paginate cleanly for two-sided printing. Exported so unit tests can
// pin the behavior without spinning up the full preview-pdf pipeline.
export const shouldDuplicatePagesForPrint = (
  printMode: BuilderPrintMode,
  pageCount: number,
): boolean => {
  if (printMode === 'two-sided-duplicate') return true;
  if (printMode === 'two-sided-when-single-page') return pageCount === 1;
  return false;
};

const getTemplateIncludeCategoryIcons = (template: ShoppingListBuilderTemplate): boolean => (
  template.includeCategoryIcons ?? DEFAULT_INCLUDE_CATEGORY_ICONS
);

const getTemplateBodyLayoutMode = (template: ShoppingListBuilderTemplate): BuilderBodyLayoutMode => (
  template.bodyLayoutMode === 'split' ? 'split' : 'full'
);

const getTemplateLayoutMode = (template: ShoppingListBuilderTemplate): BuilderLayoutMode => (
  template.layoutMode === 'freeform' ? 'freeform' : 'guided'
);

const isInventorySectionTable = (component: BuilderComponent): component is SectionTableBuilderComponent => (
  component.type === 'section-table' && Boolean(component.inventorySource?.categoryId)
);

const getComponentRegion = (component: BuilderComponent): BuilderComponentRegion => (
  isInventorySectionTable(component) ? 'body' : component.region ?? 'body'
);

// Mirrors `shouldRenderHeaderFooterOnPage` in the frontend types module.
// Body components are always single-page (handled by the flow planner); this
// helper is meaningful only for header/footer components. 1-based "odd" pages
// map to 0-based even indices (page 1, 3, 5 → pageIndex 0, 2, 4).
const shouldRenderHeaderFooterOnPage = (
  component: BuilderComponent,
  pageIndex: number,
): boolean => {
  switch (component.repeatMode ?? 'every') {
    case 'odd':
      return pageIndex % 2 === 0;
    case 'even':
      return pageIndex % 2 === 1;
    case 'once':
      return pageIndex === 0;
    case 'every':
    default:
      return true;
  }
};

const getTemplateRegionBounds = (
  template: ShoppingListBuilderTemplate,
  region: BuilderComponentRegion,
) => {
  const headerHeight = getTemplateHeaderHeight(template);
  const footerHeight = getTemplateFooterHeight(template);
  const footerTop = Math.max(0, template.paper.height - footerHeight);

  switch (region) {
    case 'header':
      return {
        top: 0,
        bottom: Math.min(headerHeight, template.paper.height),
        height: Math.min(headerHeight, template.paper.height),
      };
    case 'footer':
      return {
        top: footerTop,
        bottom: template.paper.height,
        height: Math.max(0, template.paper.height - footerTop),
      };
    case 'body':
    default: {
      const top = Math.min(headerHeight, template.paper.height);
      const bottom = Math.max(top, footerTop);
      return {
        top,
        bottom,
        height: Math.max(0, bottom - top),
      };
    }
  }
};

const getTemplateBodyLaneBounds = (
  template: ShoppingListBuilderTemplate,
  lane: BuilderBodyLane,
) => {
  const bodyBounds = getTemplateRegionBounds(template, 'body');
  if (getTemplateBodyLayoutMode(template) !== 'split' || lane === 'full') {
    return {
      lane: 'full' as const,
      left: 0,
      right: template.paper.width,
      width: template.paper.width,
      top: bodyBounds.top,
      bottom: bodyBounds.bottom,
      height: bodyBounds.height,
    };
  }

  const gap = Math.min(getTemplateBodyColumnGap(template), Math.max(0, template.paper.width - 48));
  const center = template.paper.width / 2;
  const leftRight = center - gap / 2;
  const rightLeft = center + gap / 2;

  if (lane === 'right') {
    return {
      lane,
      left: rightLeft,
      right: template.paper.width,
      width: Math.max(0, template.paper.width - rightLeft),
      top: bodyBounds.top,
      bottom: bodyBounds.bottom,
      height: bodyBounds.height,
    };
  }

  return {
    lane: 'left' as const,
    left: 0,
    right: leftRight,
    width: Math.max(0, leftRight),
    top: bodyBounds.top,
    bottom: bodyBounds.bottom,
    height: bodyBounds.height,
  };
};

const getComponentBodyLane = (
  component: BuilderComponent,
  template: ShoppingListBuilderTemplate,
): BuilderBodyLane => {
  if (getTemplateBodyLayoutMode(template) !== 'split' || getComponentRegion(component) !== 'body') {
    return 'full';
  }

  return component.x + component.width / 2 >= template.paper.width / 2 ? 'right' : 'left';
};

const getSectionTableFlowMode = (component: SectionTableBuilderComponent): BuilderTableFlowMode => (
  ENABLE_FLOWING_TABLE_PDF_OUTPUT && component.flowMode === 'flowing' ? 'flowing' : 'fixed'
);

const isCjkCharacter = (character: string) => /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/u.test(character);
const isFullWidthCharacter = (character: string) => /[\uFF01-\uFF60\uFFE0-\uFFE6]/u.test(character);
const isCyrillicCharacter = (character: string) => /[\u0400-\u04FF]/u.test(character);

const estimateGlyphWidth = (character: string, fontSize: number) => {
  if (isCjkCharacter(character) || isFullWidthCharacter(character)) {
    return fontSize;
  }
  if (/\s/u.test(character)) {
    return fontSize * 0.28;
  }
  if (isCyrillicCharacter(character)) {
    return fontSize * 0.58;
  }
  if (/[ilI.,'`:;]/u.test(character)) {
    return fontSize * 0.3;
  }
  if (/[mwMW@%&]/u.test(character)) {
    return fontSize * 0.78;
  }
  if (/[A-Z0-9]/u.test(character)) {
    return fontSize * 0.56;
  }
  return fontSize * AVERAGE_TABLE_CHARACTER_WIDTH_RATIO;
};

const estimateVisualTextWidth = (
  value: string,
  fontSize: number,
  fontWeight: BuilderTextMeasureSegment['fontWeight'] = 'normal',
) => {
  const weightMultiplier = fontWeight === 'bold' ? 1.08 : 1;
  return (
    Array.from(String(value || '')).reduce((total, character) => (
      total + estimateGlyphWidth(character, fontSize)
    ), 0) * weightMultiplier
  );
};

const estimateWrappedLineCount = (value: string, availableWidth: number, fontSize: number) => {
  return estimateWrappedSegmentLineCount([{ text: value, fontSize }], availableWidth);
};

// Slack (in pt) subtracted from the cell's available width before
// comparing predicted token widths. Compensates for per-glyph estimator
// variance between headless puppeteer (which the per-character ratios
// were calibrated against) and shipping Chromium on macOS, where Latin
// text routinely renders 3-5% wider than the estimator predicts. Without
// this slack, rows like Swahili "Vitu mbalimbali vilivyohifadhiwa kwa
// baridi" measured 147.8pt against a 148pt cell (the planner said one
// line fits) but real Chrome wrapped the translation to a 2nd line,
// overflowing the row's planned 15pt height into the next row.
const WRAP_AVAILABLE_WIDTH_SAFETY_PT = 6;

// Real Chromium renders text ~3-5% wider than the per-glyph estimator
// predicts, so the wrap slack must scale with the cell width rather than be a
// flat pt value (ISSUES.md #33). A flat 6pt under-cushioned mid-width cells
// even at 12pt (e.g. "Hot Dog & Hamburger Buns" wrapped in real Chrome but the
// planner predicted one line, so the row never grew). Reserve the larger of
// the 6pt floor and 5% of the available width. Mirror with the frontend engine.
const WRAP_AVAILABLE_WIDTH_SAFETY_RATIO = 0.05;

const estimateWrappedSegmentLineCount = (
  segments: BuilderTextMeasureSegment[],
  availableWidth: number,
) => {
  // Conservative effective width: reserve a small slack to absorb the
  // per-glyph metric variance between the planner's estimator and real
  // Chrome rendering. The slack only applies to wrap-boundary decisions;
  // the rest of the algorithm continues to operate on the raw available
  // width so currentLineWidth accumulation stays accurate.
  const safetyPt = Math.max(
    WRAP_AVAILABLE_WIDTH_SAFETY_PT,
    availableWidth * WRAP_AVAILABLE_WIDTH_SAFETY_RATIO,
  );
  const width = Math.max(1, availableWidth - safetyPt);
  let lineCount = 1;
  let currentLineWidth = 0;
  let pendingSpaceWidth = 0;
  let hasContentOnLine = false;

  const resetLine = () => {
    lineCount += 1;
    currentLineWidth = 0;
    pendingSpaceWidth = 0;
    hasContentOnLine = false;
  };

  segments.forEach((segment) => {
    const fontSize = Math.max(1, segment.fontSize);
    // Atomic segments are measured as a single token (internal whitespace is
    // not a wrap opportunity); non-atomic segments split on newlines/spaces.
    const tokens = segment.atomic
      ? [String(segment.text || '')]
      : String(segment.text || '').split(/(\n|\s+)/);
    tokens.forEach((token) => {
      if (!token) return;
      if (token === '\n') {
        resetLine();
        return;
      }
      if (/^\s+$/.test(token)) {
        if (hasContentOnLine) {
          pendingSpaceWidth += estimateVisualTextWidth(token, fontSize, segment.fontWeight);
        }
        return;
      }

      const tokenWidth = estimateVisualTextWidth(token, fontSize, segment.fontWeight);
      const candidateWidth = hasContentOnLine
        ? currentLineWidth + pendingSpaceWidth + tokenWidth
        : tokenWidth;

      if (hasContentOnLine && candidateWidth > width) {
        lineCount += 1;
        currentLineWidth = 0;
        hasContentOnLine = false;
      }

      if (tokenWidth > width) {
        const tokenLineCount = Math.max(1, Math.ceil(tokenWidth / width));
        lineCount += tokenLineCount - 1;
        currentLineWidth = tokenWidth - ((tokenLineCount - 1) * width);
        if (currentLineWidth <= 0 || currentLineWidth > width) {
          currentLineWidth = width;
        }
      } else {
        currentLineWidth = hasContentOnLine ? candidateWidth : tokenWidth;
      }
      pendingSpaceWidth = 0;
      hasContentOnLine = true;
    });
  });

  return lineCount;
};

const translationMeasureSegments = (
  original: string,
  cachedTranslation: string | undefined,
  mode: BuilderTranslationMode,
  fontSize: number,
): BuilderTextMeasureSegment[] => {
  if (mode === 'skip' || !cachedTranslation) {
    return [{ text: original, fontSize }];
  }
  if (
    mode === 'translate-with-original'
    || mode === 'translate-with-original-block'
    || mode === 'translate-with-original-adaptive'
  ) {
    // `-block` forces the English tag onto its own line: a '\n' segment
    // is read as a hard break by estimateWrappedSegmentLineCount, so the
    // measured row height accounts for the extra line. The plain inline
    // variant uses a space and lets the tag wrap word-by-word. `-adaptive`
    // also uses a space separator but marks the English segment `atomic`,
    // so the measurement keeps the tag whole -- it either fits on the
    // current line or counts as one extra line, matching the
    // `white-space: nowrap` render.
    const block = mode === 'translate-with-original-block';
    const adaptive = mode === 'translate-with-original-adaptive';
    const separator = block ? '\n' : ' ';
    return [
      { text: cachedTranslation, fontSize },
      { text: separator, fontSize },
      {
        text: original,
        fontSize: TEXT_ORIGINAL_TAG_MEASURE_FONT_SIZE_PT,
        fontWeight: 'bold',
        atomic: adaptive,
      },
    ];
  }
  return [{ text: cachedTranslation, fontSize }];
};

const sectionTableTitleSegments = (
  component: SectionTableBuilderComponent,
  fontSize: number,
  measurement?: SectionTableMeasurementOptions,
) => {
  const headerMode = resolveSectionTableTranslationSettings(component.translationSettings).headers;
  // Inventory tables resolve the title from CategoryTranslation; base-
  // component tables resolve it from the Generated (List) cache.
  const categoryTranslation = component.inventorySource?.categoryId
    ? measurement?.inventoryTranslations?.categories[component.inventorySource.categoryId]
    : measurement?.translations?.[component.title];

  return translationMeasureSegments(component.title, categoryTranslation, headerMode, fontSize);
};

const sectionTableRowItemSegments = (
  row: SectionTableBuilderComponent['rows'][number],
  mode: BuilderTranslationMode,
  fontSize: number,
  measurement?: SectionTableMeasurementOptions,
) => {
  // Inventory rows resolve from FoodItemTranslation; base-component rows
  // (no foodItemId) resolve from the Generated (List) cache.
  const itemTranslation = row.foodItemId
    ? measurement?.inventoryTranslations?.foodItems[row.foodItemId]
    : measurement?.translations?.[row.item];

  return translationMeasureSegments(row.item, itemTranslation, mode, fontSize);
};

const builderGeneratedTextSegments = (
  original: string,
  mode: BuilderTranslationMode,
  fontSize: number,
  measurement?: SectionTableMeasurementOptions,
) => translationMeasureSegments(original, measurement?.translations?.[original], mode, fontSize);

const sectionTableRowUsesTranslatedText = (
  row: SectionTableBuilderComponent['rows'][number],
  mode: BuilderTranslationMode,
  measurement?: SectionTableMeasurementOptions,
) => {
  if (mode === 'skip') return false;
  // Inventory rows: look in FoodItemTranslation. Base-component rows
  // (no foodItemId): look in the Generated (List) cache.
  return row.foodItemId
    ? Boolean(measurement?.inventoryTranslations?.foodItems[row.foodItemId])
    : Boolean(measurement?.translations?.[row.item]);
};

const builderGeneratedTextUsesTranslation = (
  original: string,
  mode: BuilderTranslationMode,
  measurement?: SectionTableMeasurementOptions,
) => (
  mode !== 'skip'
  && Boolean(measurement?.translations?.[original])
);

const sectionTableHeaderMeasurementSegments = (
  component: SectionTableBuilderComponent,
  fontSize: number,
  measurement?: SectionTableMeasurementOptions,
) => {
  const settings = resolveSectionTableTranslationSettings(component.translationSettings);
  const categoryLimitTag = formatCategoryLimitTag(component.categoryLimit, component.categoryLimitType);
  return {
    titleSegments: sectionTableTitleSegments(component, fontSize, measurement),
    categoryLimitSegments: categoryLimitTag
      ? builderGeneratedTextSegments(`(${categoryLimitTag})`, settings.tags, Math.max(7, fontSize - 2), measurement)
      : undefined,
    limitHeaderSegments: component.showLimit
      ? builderGeneratedTextSegments(component.limitHeader || 'Limit', settings.headers, fontSize, measurement)
      : undefined,
    wantHeaderSegments: builderGeneratedTextSegments(component.wantHeader || 'Want', settings.headers, fontSize, measurement),
  };
};

const getSectionTableTranslationHeightAdjustmentPt = (
  component: SectionTableBuilderComponent,
  measurement?: SectionTableMeasurementOptions,
) => {
  if (!measurement?.language) return 0;
  const gridSquares = normalizeSectionTableTranslationHeightAdjustment(
    component.translationHeightAdjustments?.[measurement.language],
  );
  return gridSquares * DEFAULT_GRID_SIZE;
};

const getAdjustedSectionTablePlannerHeight = (
  component: SectionTableBuilderComponent,
  visualHeight: number,
  measurement?: SectionTableMeasurementOptions,
) => {
  // Manual translation-height adjustments reserve planner space only; row
  // heights stay visual so the painted table does not change.
  const adjustment = getSectionTableTranslationHeightAdjustmentPt(component, measurement);
  if (adjustment === 0) return visualHeight;
  return Math.max(DEFAULT_GRID_SIZE, visualHeight + adjustment);
};

// A2: pt reserved at the start of the item cell by status icons (Limited /
// Clearance). Mirrors the frontend `statusIconRowOverhead`.
const statusIconRowOverhead = (
  row: SectionTableBuilderComponent['rows'][number],
  fontSize: number,
  showStatusIcons?: boolean,
): number => {
  if (!showStatusIcons) return 0;
  const count = (row.isLimited ? 1 : 0) + (row.isClearance ? 1 : 0);
  return count * fontSize * 1.35;
};

const tableRowHeight = (
  row: SectionTableBuilderComponent['rows'][number],
  baseHeight: number,
  options: {
    itemWidth: number;
    limitWidth: number;
    fontSize: number;
    showLimit: boolean;
    showStatusIcons?: boolean;
    itemSegments?: BuilderTextMeasureSegment[];
    useNaturalContentHeight?: boolean;
  },
) => {
  // Font-aware floor from the typography engine. At fontSize=10 this returns
  // 15pt at fontSize=10, so default rows stay compact while still landing on
  // the same 3pt grid used for Guided placement. At larger fonts the floor
  // grows to the next typography grid band.
  const fontFloor = baseRowHeight(options.fontSize);
  const storedRowHeight = Number.isFinite(baseHeight) && baseHeight > 0
    ? baseHeight
    : DEFAULT_SECTION_TABLE_ROW_HEIGHT;
  const rowHeight = Math.max(storedRowHeight, fontFloor);
  const itemAvailableWidth = Math.max(
    1,
    options.itemWidth - TABLE_CELL_HORIZONTAL_PADDING - statusIconRowOverhead(row, options.fontSize, options.showStatusIcons),
  );
  const lineCount = Math.max(
    options.itemSegments
      ? estimateWrappedSegmentLineCount(
        options.itemSegments,
        itemAvailableWidth,
      )
      : estimateWrappedLineCount(
        row.item,
        itemAvailableWidth,
        options.fontSize,
      ),
    options.showLimit
      ? estimateWrappedLineCount(
        row.limit,
        Math.max(1, options.limitWidth - TABLE_CELL_HORIZONTAL_PADDING),
        options.fontSize,
      )
      : 1,
  );

  if (options.useNaturalContentHeight) {
    return Math.max(
      rowHeight,
      snapHeightToGridForFontSize(options.fontSize, lineCount),
    );
  }

  return Math.max(rowHeight, rowHeight * lineCount);
};

// Horizontal width consumed by the category icon inside the title cell when
// `includeCategoryIcons` is enabled and the section table has an
// `inventorySource`. The icon SVG is `width: 1em` (= fontSize pt) and the
// title line uses CSS `gap: 2ch` between the icon and the title text -- the
// pure geometric overhead is ~`1em + 2ch ≈ fontSize × 2.12`. Real macOS
// Chrome renders Latin titles measurably wider than headless puppeteer
// reports (~10% wider on the same content), so the planner needs more
// conservative reservation than pure geometry to keep Swahili "Vyakula
// Vilivyogandishwa" + the (Chagua hadi 3) tag from clipping the bottom of
// the header. `fontSize × 3.5` covers the 1em icon, the 2ch gap, AND the
// per-glyph metric variance we have seen between puppeteer-headless and
// shipping Chromium. Over-reservation on shorter titles costs only a small
// amount of vertical space; under-reservation clips content visibly.
const categoryIconTitleWidthOverhead = (fontSize: number, showCategoryIcon: boolean): number =>
  showCategoryIcon ? Math.ceil(fontSize * 3.5) : 0;

const tableHeaderHeight = (
  component: Pick<
    SectionTableBuilderComponent,
    'title' | 'limitHeader' | 'wantHeader' | 'categoryLimit' | 'categoryLimitType'
  >,
  baseHeight: number,
  options: {
    itemWidth: number;
    limitWidth: number;
    wantWidth: number;
    fontSize: number;
    showLimit: boolean;
    showWant: boolean;
    titleSegments?: BuilderTextMeasureSegment[];
    categoryLimitSegments?: BuilderTextMeasureSegment[];
    limitHeaderSegments?: BuilderTextMeasureSegment[];
    wantHeaderSegments?: BuilderTextMeasureSegment[];
    // Horizontal pt consumed inside the title cell by the category icon
    // (icon box + flex gap). The renderer puts an icon next to the title
    // when `includeCategoryIcons === true && inventorySource`; the planner
    // must subtract the same width before measuring title wrap or it will
    // under-count wraps on borderline-long translated titles (ISSUES.md #26
    // follow-up: Russian "Непродовольственные товары" + 1 tag landed on a
    // 3rd line because the planner thought the title fit on 1 line).
    iconOverhead?: number;
  },
) => {
  // The legacy `baseHeight` parameter is preserved for source-compatibility
  // with callers but is no longer the source of truth: typography helpers
  // derive both rows and headers from font-size. We still consult it for the
  // untagged-header fallback below in case a caller passed an explicit
  // oversized rowHeight (e.g. saved templates with custom rowHeight).
  const categoryLimitTag = formatCategoryLimitTag(component.categoryLimit, component.categoryLimitType);
  // Only the title shares its cell with the icon; tag, limit, and want
  // headers render in their own cells and are unaffected by iconOverhead.
  const titleAvailableWidth = Math.max(
    1,
    options.itemWidth - TABLE_CELL_HORIZONTAL_PADDING - (options.iconOverhead ?? 0),
  );
  const titleLineCount = options.titleSegments
    ? estimateWrappedSegmentLineCount(options.titleSegments, titleAvailableWidth)
    : estimateWrappedLineCount(component.title, titleAvailableWidth, options.fontSize);
  const categoryLimitLineCount = categoryLimitTag
    ? (options.categoryLimitSegments
      ? estimateWrappedSegmentLineCount(
        options.categoryLimitSegments,
        Math.max(1, options.itemWidth - TABLE_CELL_HORIZONTAL_PADDING),
      )
      : estimateWrappedLineCount(
        `(${categoryLimitTag})`,
        Math.max(1, options.itemWidth - TABLE_CELL_HORIZONTAL_PADDING),
        Math.max(7, options.fontSize - 2),
      ))
    : 0;
  const limitHeaderLineCount = options.showLimit
    ? (options.limitHeaderSegments
      ? estimateWrappedSegmentLineCount(
        options.limitHeaderSegments,
        Math.max(1, options.limitWidth - TABLE_CELL_HORIZONTAL_PADDING),
      )
      : estimateWrappedLineCount(
        component.limitHeader || 'Limit',
        Math.max(1, options.limitWidth - TABLE_CELL_HORIZONTAL_PADDING),
        options.fontSize,
      ))
    : 1;
  const wantHeaderLineCount = options.showWant
    ? (options.wantHeaderSegments
      ? estimateWrappedSegmentLineCount(
        options.wantHeaderSegments,
        Math.max(1, options.wantWidth - TABLE_CELL_HORIZONTAL_PADDING),
      )
      : estimateWrappedLineCount(
        component.wantHeader || 'Want',
        Math.max(1, options.wantWidth - TABLE_CELL_HORIZONTAL_PADDING),
        options.fontSize,
      ))
    : 1;
  const otherHeaderMaxLineCount = Math.max(
    1,
    limitHeaderLineCount,
    wantHeaderLineCount,
  );

  // Tagged case: typography engine snaps the compact title/tag stack to the
  // shared 3pt geometry grid, with a 27pt minimum band.
  if (categoryLimitTag) {
    return taggedHeaderHeight(
      options.fontSize,
      titleLineCount,
      categoryLimitLineCount,
      otherHeaderMaxLineCount,
    );
  }

  // Untagged case: header height is max(title, limitHeader, wantHeader)
  // lines × baseRowHeight(fontSize), with a floor honoring any caller-supplied
  // baseHeight that already exceeds the font floor.
  const maxLineCount = Math.max(titleLineCount, otherHeaderMaxLineCount);
  const typographyHeight = untaggedHeaderHeight(options.fontSize, maxLineCount);
  if (Number.isFinite(baseHeight) && baseHeight > 0) {
    return Math.max(typographyHeight, baseHeight * maxLineCount);
  }
  return typographyHeight;
};

interface SectionTableMetrics {
  rowHeight: number;
  limitWidth: number;
  wantWidth: number;
  itemWidth: number;
  fontSize: number;
  headerHeight: number;
}

interface FlowingTableSegment {
  component: SectionTableBuilderComponent;
  pageIndex: number;
  lane: BuilderBodyLane;
  x: number;
  y: number;
  height: number;
  rows: SectionTableBuilderComponent['rows'];
  rowHeights: number[];
  startRowIndex: number;
  isFirstSegment: boolean;
  isContinuation: boolean;
}

interface BodyPlacement {
  componentId: string;
  pageIndex: number;
  lane: BuilderBodyLane;
  x: number;
  y: number;
  height: number;
}

interface FlowingTablePlan {
  pageCount: number;
  segments: FlowingTableSegment[];
  flowingComponentIds: Set<string>;
  // In Guided Mode the planner places ALL body components by sequence; their
  // computed positions live here and override component.x/y at render time.
  // Non-flowing tables and other body components (text, form-field-group,
  // line, date) appear here. Flowing section-tables continue to live in
  // `segments` because they may span multiple pieces.
  bodyPlacements: BodyPlacement[];
  // Body components fully handled by the plan (segments + placements). When
  // rendering the page, body components in this set are drawn from the plan,
  // not from `template.components` directly.
  plannedBodyComponentIds: Set<string>;
  overflowRowCount: number;
}

// Section-table flow stacking gap. Three 3pt grid squares give the user a
// clean visual breathing margin while preserving the established 9pt visual
// rhythm between stacked flowing tables.
const FLOWING_TABLE_GAP = 9;
const ENABLE_FLOWING_TABLE_HTML_OUTPUT = true;

const getSectionTableMetrics = (
  component: SectionTableBuilderComponent,
  measurement?: SectionTableMeasurementOptions,
  // Whether the category icon will share the title cell at render time
  // (template-level `includeCategoryIcons` AND `component.inventorySource`).
  // Callers in the planner thread this from the template; standalone callers
  // (e.g. `buildInventorySectionComponent`) can omit it and accept a slightly
  // looser initial header height — the planner re-measures with the correct
  // flag once the template is in hand.
  layout?: { showCategoryIcon?: boolean },
): SectionTableMetrics => {
  const rowHeight = asNumber(component.rowHeight, DEFAULT_SECTION_TABLE_ROW_HEIGHT);
  const limitWidth = component.showLimit ? asNumber(component.limitWidth, DEFAULT_SECTION_TABLE_LIMIT_WIDTH) : 0;
  const showWant = component.showWant !== false;
  const wantWidth = showWant ? asNumber(component.wantWidth, DEFAULT_SECTION_TABLE_WANT_WIDTH) : 0;
  const itemWidth = component.width - limitWidth - wantWidth;
  const fontSize = asNumber(component.fontSize, 10);
  const showCategoryIcon = Boolean(layout?.showCategoryIcon && component.inventorySource);
  const headerHeight = tableHeaderHeight(component, rowHeight, {
    itemWidth,
    limitWidth,
    wantWidth,
    fontSize,
    showLimit: component.showLimit,
    showWant,
    iconOverhead: categoryIconTitleWidthOverhead(fontSize, showCategoryIcon),
    ...sectionTableHeaderMeasurementSegments(component, fontSize, measurement),
  });

  return { rowHeight, limitWidth, wantWidth, itemWidth, fontSize, headerHeight };
};

const getSectionTableRowHeights = (
  component: SectionTableBuilderComponent,
  metrics = getSectionTableMetrics(component),
  measurement?: SectionTableMeasurementOptions,
) => {
  const rowMode = resolveSectionTableTranslationSettings(component.translationSettings).rows;
  const rowHeights = component.rows.map((row) => tableRowHeight(row, metrics.rowHeight, {
    itemWidth: metrics.itemWidth,
    limitWidth: metrics.limitWidth,
    fontSize: metrics.fontSize,
    showLimit: component.showLimit,
    showStatusIcons: component.showStatusIcons === true,
    itemSegments: sectionTableRowItemSegments(row, rowMode, metrics.fontSize, measurement),
    useNaturalContentHeight: sectionTableRowUsesTranslatedText(row, rowMode, measurement),
  }));
  return rowHeights;
};

const isHtmlFlowingBodyTable = (component: BuilderComponent): component is SectionTableBuilderComponent => (
  component.type === 'section-table'
  && getComponentRegion(component) === 'body'
  && ENABLE_FLOWING_TABLE_HTML_OUTPUT
  && component.flowMode === 'flowing'
);

const FORM_FIELD_GROUP_DEFAULT_HEIGHT = 36;

// Natural rendered height for any body component that does NOT flow across
// lanes (text, form-field-group, line, date, fixed section-tables, saved
// components rendered as one of the above). Mirrors the frontend
// `getComponentHeight` so the canvas preview and the Chromium PDF agree on
// vertical extents for sequence-flow placement decisions.
const getNonFlowingBodyHeight = (
  component: BuilderComponent,
  measurement?: SectionTableMeasurementOptions,
  // Template-level render config that affects header geometry. Currently
  // just whether the inventory category icon shares the title cell.
  layout?: { includeCategoryIcons?: boolean },
): number => {
  switch (component.type) {
    case 'section-table': {
      const metrics = getSectionTableMetrics(component, measurement, {
        showCategoryIcon: Boolean(layout?.includeCategoryIcons),
      });
      const rowHeights = getSectionTableRowHeights(component, metrics, measurement);
      const rowsHeight = rowHeights.reduce((sum, value) => sum + value, 0);
      return getAdjustedSectionTablePlannerHeight(
        component,
        metrics.headerHeight + rowsHeight,
        measurement,
      );
    }
    case 'form-field-group': {
      // Font-aware per-row height + label wrap. At fontSize=10 with single-
      // line labels this is 18pt × N (no change vs legacy). When a label
      // wraps (long text in a narrow labelWidth, or a larger font) each
      // affected row grows to perRow × lineCount, matching what the canvas /
      // PDF actually render.
      const formComponent = component as FormFieldGroupBuilderComponent;
      const formFontSize = asNumber(formComponent.fontSize, 10);
      const perRow = baseRowHeight(formFontSize);
      const labelWidth = Math.min(
        asNumber(formComponent.labelWidth, 150),
        formComponent.width - 24,
      );
      // Label cell uses 3pt horizontal padding (6pt total) in PDF.
      const labelAvailableWidth = Math.max(1, labelWidth - 6);
      const fieldsHeight = formComponent.fields.reduce((total, field) => {
        const mode = field.translationMode ?? 'translate';
        const lineCount = builderGeneratedTextUsesTranslation(field.label, mode, measurement)
          ? estimateWrappedSegmentLineCount(
            builderGeneratedTextSegments(field.label, mode, formFontSize, measurement),
            labelAvailableWidth,
          )
          : estimateWrappedLineCount(
            field.label,
            labelAvailableWidth,
            formFontSize,
          );
        return total + Math.max(perRow, perRow * lineCount);
      }, 0);
      return Math.max(
        asNumber(component.height, FORM_FIELD_GROUP_DEFAULT_HEIGHT),
        FORM_FIELD_GROUP_DEFAULT_HEIGHT,
        fieldsHeight,
      );
    }
    case 'line':
      return component.direction === 'horizontal'
        ? Math.max(asNumber(component.strokeWidth, 1), 4)
        : Math.max(asNumber(component.height, 16), 16);
    case 'legend': {
      const entries = (component.showLimited ? 1 : 0) + (component.showClearance ? 1 : 0);
      const rows = component.layout === 'vertical' ? Math.max(1, entries) : 1;
      return baseRowHeight(asNumber(component.fontSize, 10)) * rows;
    }
    case 'text':
    case 'date':
    default:
      return Math.max(0, asNumber((component as any).height, 0));
  }
};

// Lane-relative X for a non-flowing body component placed by the Guided
// planner. Components narrower than the lane are centered; components wider
// than the lane are clamped to the lane's left edge.
const getBodyPlacementX = (
  component: BuilderComponent,
  template: ShoppingListBuilderTemplate,
  lane: BuilderBodyLane,
): number => {
  if (getTemplateBodyLayoutMode(template) !== 'split' || lane === 'full') {
    return Math.max(0, Math.min(component.x, template.paper.width - component.width));
  }
  const center = template.paper.width / 2;
  const halfLeft = lane === 'right' ? center : 0;
  const halfRight = lane === 'right' ? template.paper.width : center;
  const usableWidth = Math.max(0, halfRight - halfLeft);
  if (component.width >= usableWidth) {
    return halfLeft;
  }
  return halfLeft + (usableWidth - component.width) / 2;
};

const isBodyComponent = (component: BuilderComponent) => (
  getComponentRegion(component) === 'body'
);

const nextFlowLane = (
  pageIndex: number,
  lane: BuilderBodyLane,
  template: ShoppingListBuilderTemplate,
) => {
  if (getTemplateBodyLayoutMode(template) !== 'split') {
    return { pageIndex: pageIndex + 1, lane: 'full' as BuilderBodyLane };
  }

  if (lane === 'left') {
    return { pageIndex, lane: 'right' as BuilderBodyLane };
  }

  return { pageIndex: pageIndex + 1, lane: 'left' as BuilderBodyLane };
};

const getFlowSegmentX = (
  component: SectionTableBuilderComponent,
  template: ShoppingListBuilderTemplate,
  lane: BuilderBodyLane,
  isFirstSegment: boolean,
) => {
  if (getTemplateBodyLayoutMode(template) !== 'split' || lane === 'full') {
    return isFirstSegment ? component.x : Math.min(Math.max(component.x, 0), template.paper.width - component.width);
  }

  const center = template.paper.width / 2;
  const halfLeft = lane === 'right' ? center : 0;
  const halfRight = lane === 'right' ? template.paper.width : center;
  const usableWidth = Math.max(0, halfRight - halfLeft);
  if (component.width >= usableWidth) {
    return halfLeft;
  }

  return halfLeft + (usableWidth - component.width) / 2;
};

interface FlowingTableState {
  component: SectionTableBuilderComponent;
  docIndex: number;
  metrics: SectionTableMetrics;
  rowHeights: number[];
  rowIndex: number;
  segmentIndex: number;
}

// Flowing-table planner. Two layout modes:
//
// - Guided (default): sequence-first. Flowing tables are placed in the order
//   they appear in `template.components` (which is the user's add/reorder
//   order). Each table is fully placed -- including any continuation segments
//   -- before the next table is considered. Cross-lane reading order is
//   page0-left, page0-right, page1-left, page1-right, ... User-set component.x
//   and component.y are not consulted for ordering or positioning; the planner
//   computes both as derived layout output.
//
// - Freeform: legacy two-phase planner that respects component.y for first
//   placement on a virgin lane, sorts natives within each lane by y, and drains
//   pending continuations first per lane in document-y order. Preserves prior
//   behavior for users who explicitly opt out of Guided.
export const createFlowingTablePlan = (
  template: ShoppingListBuilderTemplate,
  measurement?: SectionTableMeasurementOptions,
): FlowingTablePlan => {
  const maxPages = getTemplateMaxPages(template);
  const bodyBounds = getTemplateRegionBounds(template, 'body');
  const isSplit = getTemplateBodyLayoutMode(template) === 'split';
  const isGuided = getTemplateLayoutMode(template) === 'guided';
  const segments: FlowingTableSegment[] = [];
  const flowingComponentIds = new Set<string>();
  const bodyPlacements: BodyPlacement[] = [];
  const plannedBodyComponentIds = new Set<string>();
  let overflowRowCount = 0;
  let pageCount = 1;

  type LaneSlot = { pageIndex: number; lane: BuilderBodyLane };
  const laneSequence: LaneSlot[] = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    if (isSplit) {
      laneSequence.push({ pageIndex, lane: 'left' });
      laneSequence.push({ pageIndex, lane: 'right' });
    } else {
      laneSequence.push({ pageIndex, lane: 'full' });
    }
  }

  // Build flowing-table state. In Guided mode, preserve the order from
  // template.components (the user's sequence). In Freeform mode, sort by y/x
  // so existing canvas placements continue to drive layout.
  const orderedComponents = isGuided
    ? template.components.filter(isHtmlFlowingBodyTable)
    : [...template.components.filter(isHtmlFlowingBodyTable)].sort((first, second) => {
      if (first.y !== second.y) return first.y - second.y;
      return first.x - second.x;
    });

  const includeCategoryIcons = template.includeCategoryIcons === true;
  const flowingTables = orderedComponents.map((component, docIndex): FlowingTableState => {
    flowingComponentIds.add(component.id);
    const metrics = getSectionTableMetrics(component, measurement, {
      showCategoryIcon: includeCategoryIcons,
    });
    return {
      component,
      docIndex,
      metrics,
      rowHeights: getSectionTableRowHeights(component, metrics, measurement),
      rowIndex: 0,
      segmentIndex: 0,
    };
  });

  const tryPlace = (
    state: FlowingTableState,
    slot: LaneSlot,
    laneBounds: ReturnType<typeof getTemplateBodyLaneBounds>,
    cursor: number,
    isNative: boolean,
    options: { ignoreUserY?: boolean } = {},
  ): { newCursor: number; placed: boolean } => {
    const { component, metrics, rowHeights } = state;
    const isLaneVirgin = cursor <= laneBounds.top;
    const isOriginalSlot = state.segmentIndex === 0 && isNative;
    const honorUserY = !options.ignoreUserY && isOriginalSlot && isLaneVirgin;
    const baseTop = honorUserY
      ? Math.max(component.y, cursor, laneBounds.top)
      : Math.max(cursor, laneBounds.top);
    const availableTop = baseTop;
    const availableBottom = Math.min(laneBounds.bottom, bodyBounds.bottom);
    const availableHeight = availableBottom - availableTop;
    const nextRowHeight = rowHeights[state.rowIndex] ?? metrics.rowHeight;
    const segmentPlannerHeight = (rowsHeightValue: number) => getAdjustedSectionTablePlannerHeight(
      component,
      metrics.headerHeight + rowsHeightValue,
      measurement,
    );

    if (availableHeight < segmentPlannerHeight(Math.max(1, nextRowHeight))) {
      return { newCursor: cursor, placed: false };
    }

    const rows: SectionTableBuilderComponent['rows'] = [];
    const segmentRowHeights: number[] = [];
    let rowsHeight = 0;
    const startRowIndex = state.rowIndex;
    while (state.rowIndex < component.rows.length) {
      const candidateHeight = rowHeights[state.rowIndex] ?? metrics.rowHeight;
      const candidatePlannerHeight = segmentPlannerHeight(rowsHeight + candidateHeight);
      if (rows.length > 0 && candidatePlannerHeight > availableHeight) break;
      if (rows.length === 0 && candidatePlannerHeight > availableHeight) break;
      rows.push(component.rows[state.rowIndex]);
      segmentRowHeights.push(candidateHeight);
      rowsHeight += candidateHeight;
      state.rowIndex += 1;
    }

    if (rows.length === 0) {
      return { newCursor: cursor, placed: false };
    }

    const isFirstSegment = state.segmentIndex === 0;
    const height = segmentPlannerHeight(rowsHeight);
    segments.push({
      component,
      pageIndex: slot.pageIndex,
      lane: slot.lane,
      x: getFlowSegmentX(component, template, slot.lane, isFirstSegment),
      y: availableTop,
      height,
      rows,
      rowHeights: segmentRowHeights,
      startRowIndex,
      isFirstSegment,
      isContinuation: !isFirstSegment,
    });
    state.segmentIndex += 1;
    pageCount = Math.max(pageCount, slot.pageIndex + 1);
    return { newCursor: availableTop + height + FLOWING_TABLE_GAP, placed: true };
  };

  if (isGuided) {
    // Sequence-first: walk ALL body components in template.components order.
    // Each component participates in the flow regardless of type:
    //   - Flowing section-tables: place every row across as many lanes as
    //     needed (multi-segment).
    //   - Other body components (text, fixed section-tables, form-field
    //     groups, lines, dates, saved): place once. If the component does not
    //     fit in the remaining lane space, advance to the next lane and try
    //     again. If it cannot fit on a virgin lane (taller than the lane), it
    //     still anchors at the lane top and overflows visually, so the user
    //     can see and correct it.
    const flowingStateById = new Map<string, FlowingTableState>(
      flowingTables.map((state) => [state.component.id, state]),
    );
    let slotIdx = 0;
    let cursor = bodyBounds.top;
    const advanceSlot = () => {
      slotIdx += 1;
      cursor = bodyBounds.top;
    };

    const bodyComponents = template.components.filter(isBodyComponent);
    bodyComponents.forEach((component) => plannedBodyComponentIds.add(component.id));

    for (const component of bodyComponents) {
      if (slotIdx >= laneSequence.length) break;

      if (isHtmlFlowingBodyTable(component)) {
        const state = flowingStateById.get(component.id)!;
        while (state.rowIndex < component.rows.length && slotIdx < laneSequence.length) {
          const slot = laneSequence[slotIdx];
          const laneBounds = getTemplateBodyLaneBounds(template, slot.lane);
          const { newCursor, placed } = tryPlace(state, slot, laneBounds, cursor, false, { ignoreUserY: true });
          if (placed) {
            cursor = newCursor;
          } else {
            advanceSlot();
            continue;
          }
          if (state.rowIndex < component.rows.length) {
            advanceSlot();
          }
        }
        overflowRowCount += component.rows.length - state.rowIndex;
      } else {
        const height = getNonFlowingBodyHeight(component, measurement, {
          includeCategoryIcons,
        });
        let placed = false;
        while (!placed && slotIdx < laneSequence.length) {
          const slot = laneSequence[slotIdx];
          const laneBounds = getTemplateBodyLaneBounds(template, slot.lane);
          const availableTop = Math.max(cursor, laneBounds.top);
          const availableBottom = Math.min(laneBounds.bottom, bodyBounds.bottom);
          const fitsHere = availableTop + height <= availableBottom;
          const isLaneVirgin = cursor <= laneBounds.top;
          if (fitsHere || isLaneVirgin) {
            bodyPlacements.push({
              componentId: component.id,
              pageIndex: slot.pageIndex,
              lane: slot.lane,
              x: getBodyPlacementX(component, template, slot.lane),
              y: availableTop,
              height,
            });
            cursor = availableTop + height + FLOWING_TABLE_GAP;
            pageCount = Math.max(pageCount, slot.pageIndex + 1);
            placed = true;
          } else {
            advanceSlot();
          }
        }
      }
    }

    return {
      pageCount: Math.min(maxPages, Math.max(pageCount, 1)),
      segments,
      flowingComponentIds,
      bodyPlacements,
      plannedBodyComponentIds,
      overflowRowCount,
    };
  }

  // Freeform planner: original two-phase, lane-by-lane allocation.
  const homeLaneOf = (state: FlowingTableState): BuilderBodyLane => (
    isSplit ? getComponentBodyLane(state.component, template) : 'full'
  );
  const nativesByLaneKey = new Map<string, FlowingTableState[]>();
  flowingTables.forEach((state) => {
    const key = `0:${homeLaneOf(state)}`;
    const list = nativesByLaneKey.get(key) ?? [];
    list.push(state);
    nativesByLaneKey.set(key, list);
  });
  nativesByLaneKey.forEach((list) => list.sort((a, b) => {
    if (a.component.y !== b.component.y) return a.component.y - b.component.y;
    return a.component.x - b.component.x;
  }));

  const pending: FlowingTableState[] = [];
  const insertByDocIndex = (state: FlowingTableState) => {
    let index = 0;
    while (index < pending.length && pending[index].docIndex <= state.docIndex) {
      index += 1;
    }
    pending.splice(index, 0, state);
  };

  laneSequence.forEach((slot) => {
    const laneBounds = getTemplateBodyLaneBounds(template, slot.lane);
    let cursor = bodyBounds.top;
    const natives = nativesByLaneKey.get(`${slot.pageIndex}:${slot.lane}`) ?? [];

    while (pending.length > 0) {
      const candidate = pending[0];
      const { newCursor, placed } = tryPlace(candidate, slot, laneBounds, cursor, false);
      if (!placed) break;
      cursor = newCursor;
      pending.shift();
      if (candidate.rowIndex < candidate.component.rows.length) {
        insertByDocIndex(candidate);
      }
    }

    natives.forEach((state) => {
      const { newCursor, placed } = tryPlace(state, slot, laneBounds, cursor, true);
      if (placed) {
        cursor = newCursor;
        if (state.rowIndex < state.component.rows.length) {
          insertByDocIndex(state);
        }
      } else {
        // Native could not fit any rows on its home lane -- defer to pending so
        // it lands on the next lane in document-index order.
        insertByDocIndex(state);
      }
    });
  });

  pending.forEach((state) => {
    overflowRowCount += state.component.rows.length - state.rowIndex;
  });

  // In Freeform mode the planner only governs flowing tables; non-flowing
  // body components stay at their stored x/y. Mirror that into the
  // plannedBodyComponentIds set so renderers/dragger code can use a single
  // membership check.
  flowingComponentIds.forEach((id) => plannedBodyComponentIds.add(id));

  return {
    pageCount: Math.min(maxPages, Math.max(pageCount, 1)),
    segments,
    flowingComponentIds,
    bodyPlacements,
    plannedBodyComponentIds,
    overflowRowCount,
  };
};

const isSupportedComponentType = (type: unknown): type is BuilderComponentType => {
  return typeof type === 'string' && ['text', 'form-field-group', 'section-table', 'line', 'date', 'language-tag', 'legend'].includes(type);
};

const validateBuilderComponent = (component: BuilderComponent) => {
  if (!component || typeof component !== 'object') {
    throw createRouteError('Saved component data is required.');
  }

  if (!component.id || !component.type) {
    throw createRouteError('Each builder component must include an ID and component type.');
  }

  if (!isSupportedComponentType(component.type)) {
    throw createRouteError(`Unsupported builder component type: ${component.type}`);
  }
};

const validateTemplate = (template: ShoppingListBuilderTemplate) => {
  if (!template || typeof template !== 'object') {
    throw createRouteError('Builder template data is required.');
  }

  if (!template.paper || template.paper.size !== 'letter') {
    throw createRouteError('Builder PDF preview currently supports Letter paper only.');
  }

  if (!Array.isArray(template.components) || template.components.length === 0) {
    throw createRouteError('Template must include at least one printable component.');
  }

  for (const component of template.components) {
    validateBuilderComponent(component);
  }
};

const validateSavedComponentName = (name: unknown) => {
  if (typeof name !== 'string') {
    throw createRouteError('Saved component name is required.');
  }

  const trimmedName = name.trim();
  if (trimmedName.length < 3 || trimmedName.length > 80) {
    throw createRouteError('Saved component name must be between 3 and 80 characters.');
  }

  return trimmedName;
};

const validateSavedTemplateName = (name: unknown) => {
  if (typeof name !== 'string') {
    throw createRouteError('Saved template name is required.');
  }

  const trimmedName = name.trim();
  if (trimmedName.length < 3 || trimmedName.length > 48) {
    throw createRouteError('Saved template name must be between 3 and 48 characters.');
  }

  return trimmedName;
};

const normalizeSavedEntityName = (name: string) => name.trim().toLocaleLowerCase();

const findSavedComponentByName = async (name: string, excludeId?: number) => {
  const records = await prisma.shoppingListBuilderComponent.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  return records.find((record) => (
    record.id !== excludeId
    && normalizeSavedEntityName(record.name) === normalizeSavedEntityName(name)
  )) ?? null;
};

const findSavedTemplateByName = async (name: string, excludeId?: number) => {
  const records = await prisma.shoppingListBuilderTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  return records.find((record) => (
    record.id !== excludeId
    && normalizeSavedEntityName(record.name) === normalizeSavedEntityName(name)
  )) ?? null;
};

const parseIdParam = (value: string, message = 'Invalid saved component ID.') => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw createRouteError(message);
  }

  return id;
};

const parseInventoryLimitValue = (value: unknown) => {
  if (value === null || value === '') {
    return null;
  }

  const limit = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw createRouteError('Limit must be a whole number between 1 and 100, or blank to use the category default.');
  }

  return limit;
};

const serializeSavedComponent = (record: {
  id: number;
  name: string;
  componentType: string;
  componentData: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: record.id,
  name: record.name,
  componentType: record.componentType,
  componentData: record.componentData,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

const serializeSavedTemplate = (record: {
  id: number;
  name: string;
  templateData: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: record.id,
  name: record.name,
  templateData: record.templateData,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

const NO_LIMIT_SENTINEL = 100;

// B3: fallback when no GlobalLimit row exists yet. Mirrors the default used by
// the global-limit route (`GET /api/global-limit` returns 10 when unset).
const DEFAULT_GLOBAL_LIMIT = 10;

const buildInventorySectionComponent = (category: {
  id: number;
  name: string;
  icon?: string | null;
  limit: number;
  limitType?: string | null;
  foodItems: Array<{
    id: number;
    name: string;
    limit: number;
    isLimited: boolean;
    isClearance: boolean;
  }>;
}): SectionTableBuilderComponent => {
  const categoryLimit = category.limit && category.limit !== NO_LIMIT_SENTINEL ? category.limit : null;
  const categoryLimitType: 'person' | 'household' | null = category.limitType === 'person' ? 'person'
    : category.limitType === 'household' ? 'household'
      : null;

  const rows = category.foodItems.map((item) => {
    // The Limit column reflects the item's request cap (`limit`), where the
    // NO_LIMIT_SENTINEL (100) means "No Limit". This is INDEPENDENT of the
    // `isLimited` status flag, which means "low/limited stock" and only drives
    // the optional A2 status icon -- an item can be low-stock yet uncapped, or
    // capped yet well-stocked. (See ISSUES.md #39.) This matches how Food Item
    // Management displays the limit; the two views must agree.
    const foodItemLimit = item.limit !== NO_LIMIT_SENTINEL ? item.limit : null;

    return {
      id: `inventory-item-${item.id}`,
      item: item.name,
      // Item-level limit only. Category limits are surfaced in the section header so
      // a "Choose 5 / household" policy stays a section concept instead of being
      // copied onto every row.
      limit: foodItemLimit == null ? '' : String(foodItemLimit),
      foodItemId: item.id,
      limitSource: foodItemLimit != null ? 'food-item' as const : 'none' as const,
      // A2: per-row status for the optional Limited/Clearance icons.
      isLimited: item.isLimited,
      isClearance: item.isClearance,
    };
  });

  const rowHeight = DEFAULT_SECTION_TABLE_ROW_HEIGHT;
  const limitWidth = DEFAULT_SECTION_TABLE_LIMIT_WIDTH;
  const wantWidth = DEFAULT_SECTION_TABLE_WANT_WIDTH;
  const fontSize = 10;
  const itemWidth = DEFAULT_BUILDER_COMPONENT_WIDTH - limitWidth - wantWidth;
  const headerHeight = tableHeaderHeight({
    title: category.name,
    limitHeader: 'Limit',
    wantHeader: 'Want',
    categoryLimit,
    categoryLimitType,
  }, rowHeight, {
    itemWidth,
    limitWidth,
    wantWidth,
    fontSize,
    showLimit: true,
    showWant: true,
  });

  return {
    id: `inventory-category-${category.id}`,
    type: 'section-table',
    name: `${category.name} inventory table`,
    title: category.name,
    x: 48,
    y: 48,
    width: DEFAULT_BUILDER_COMPONENT_WIDTH,
    height: headerHeight + rows.reduce((total, row) => total + tableRowHeight(row, rowHeight, {
      itemWidth,
      limitWidth,
      fontSize,
      showLimit: true,
    }), 0),
    showLimit: true,
    limitHeader: 'Limit',
    wantHeader: 'Want',
    limitWidth,
    wantWidth,
    fontSize,
    rowHeight,
    alternateRows: true,
    flowMode: 'flowing',
    repeatHeaderRows: true,
    keepHeaderWithFirstRow: true,
    keepRowsTogether: true,
    cornerRadius: DEFAULT_SECTION_TABLE_CORNER_RADIUS,
    categoryLimit,
    categoryLimitType,
    translationSettings: { ...DEFAULT_INVENTORY_SECTION_TRANSLATION_SETTINGS },
    rows,
    inventorySource: {
      categoryId: category.id,
      categoryName: category.name,
      categoryIcon: category.icon,
      generatedAt: new Date().toISOString(),
    },
  };
};

// Phase 1 of the table-density work (ISSUES.md #26) lowered the default
// placement grid from 9pt to 3pt and lowered DEFAULT_SECTION_TABLE_ROW_HEIGHT
// / DEFAULT_FORM_FIELD_ROW_HEIGHT from 18pt to 15pt. Inventory section tables self-heal because
// `refreshInventoryBackedTemplate` rebuilds them from the DB and picks up
// the new defaults. Base-component section tables and form-field-groups
// persist their `rowHeight` on the saved template, so a row-height of 18
// would otherwise clamp `tableRowHeight()`'s `max(stored, fontFloor)` and
// silently keep the old looser layout. We treat a stored 18 as "the old
// default" and replace it with the new default; there is no UI control for
// directly setting these per-component row heights, so 18 is always
// residue rather than a deliberate user choice. The same is true for the
// persisted 9pt template grid: there is no UI for choosing a custom grid, and
// leaving it at 9pt decouples placement from the 3pt typography grid.
const LEGACY_ROW_HEIGHT_PT = 18;

const normalizeLegacyTemplateGeometry = (
  template: ShoppingListBuilderTemplate,
): ShoppingListBuilderTemplate => ({
  ...template,
  gridSize: template.gridSize === LEGACY_DEFAULT_GRID_SIZE
    ? DEFAULT_GRID_SIZE
    : (template.gridSize ?? DEFAULT_GRID_SIZE),
  components: template.components.map((component) => {
    if (component.type === 'section-table' && component.rowHeight === LEGACY_ROW_HEIGHT_PT) {
      return { ...component, rowHeight: DEFAULT_SECTION_TABLE_ROW_HEIGHT };
    }
    if (
      component.type === 'form-field-group'
      && (component as { rowHeight?: number }).rowHeight === LEGACY_ROW_HEIGHT_PT
    ) {
      return { ...component, rowHeight: DEFAULT_FORM_FIELD_ROW_HEIGHT };
    }
    return component;
  }),
});

// Exported so the builder-translation-height measurement script can replicate
// the exact template state the /preview-pdf renderer plans against (inventory
// components are rebuilt from the DB, picking up the current row-height and
// grid defaults; legacy per-component rowHeight/grid values are normalized).
// Production callers are the preview-pdf / preflight routes.
export const refreshInventoryBackedTemplate = async (
  rawTemplate: ShoppingListBuilderTemplate,
): Promise<ShoppingListBuilderTemplate> => {
  // Normalize legacy 18pt row-heights up front so both the inventory-rebuild
  // path AND the early-return-no-inventory path produce templates that plan
  // against the new Phase 1 floor.
  const template = normalizeLegacyTemplateGeometry(rawTemplate);
  const categoryIds = Array.from(new Set(
    template.components
      .filter((component): component is SectionTableBuilderComponent => (
        component.type === 'section-table' && Boolean(component.inventorySource?.categoryId)
      ))
      .map((component) => component.inventorySource?.categoryId)
      .filter((categoryId): categoryId is number => typeof categoryId === 'number'),
  ));

  if (categoryIds.length === 0) {
    return template;
  }

  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    include: {
      foodItems: {
        where: { isInStock: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          limit: true,
          isLimited: true,
          isClearance: true,
        },
      },
    },
  });
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return {
    ...template,
    components: template.components.map((component) => {
      if (component.type !== 'section-table' || !component.inventorySource?.categoryId) {
        return component;
      }

      const category = categoryById.get(component.inventorySource.categoryId);
      if (!category) {
        return component;
      }

      const refreshed = buildInventorySectionComponent(category);
      return {
        ...component,
        name: refreshed.name,
        title: refreshed.title,
        rows: refreshed.rows,
        height: refreshed.height,
        rowHeight: refreshed.rowHeight,
        categoryLimit: refreshed.categoryLimit,
        categoryLimitType: refreshed.categoryLimitType,
        translationSettings: component.translationSettings ?? { ...DEFAULT_INVENTORY_SECTION_TRANSLATION_SETTINGS },
        inventorySource: refreshed.inventorySource,
      };
    }),
  };
};

const textAt = (text: string, x: number, y: number, options: {
  width?: number;
  size?: number;
  bold?: boolean;
  italics?: boolean;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
}) => ({
  columns: [
    {
      width: options.width ?? 'auto',
      text,
      fontSize: options.size ?? 10,
      bold: options.bold ?? false,
      italics: options.italics ?? false,
      alignment: options.align ?? 'left',
      lineHeight: options.lineHeight ?? 1,
    },
  ],
  absolutePosition: { x, y },
});

const rectAt = (x: number, y: number, w: number, h: number, options: {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
} = {}) => ({
  canvas: [
    {
      type: 'rect',
      x: 0,
      y: 0,
      w,
      h,
      color: options.fill,
      lineColor: options.stroke ?? '#b9b9b9',
      lineWidth: options.lineWidth ?? 0.45,
    },
  ],
  absolutePosition: { x, y },
});

const lineAt = (x1: number, y1: number, x2: number, y2: number, options: {
  stroke?: string;
  lineWidth?: number;
} = {}) => ({
  canvas: [
    {
      type: 'line',
      x1: 0,
      y1: 0,
      x2: x2 - x1,
      y2: y2 - y1,
      lineColor: options.stroke ?? '#8c8c8c',
      lineWidth: options.lineWidth ?? 0.45,
    },
  ],
  absolutePosition: { x: x1, y: y1 },
});

const textNodes = (component: TextBuilderComponent) => [
  textAt(component.content, component.x, component.y, {
    width: component.width,
    size: asNumber(component.fontSize, 10),
    bold: component.fontWeight === 'bold',
    align: component.align,
    lineHeight: asNumber(component.lineHeight, 1),
  }),
];

const formFieldNodes = (component: FormFieldGroupBuilderComponent) => {
  const nodes: any[] = [];
  const rowHeight = DEFAULT_FORM_FIELD_ROW_HEIGHT;
  const labelWidth = Math.min(asNumber(component.labelWidth, 150), component.width - 24);
  const valueWidth = component.width - labelWidth;

  component.fields.forEach((field, index) => {
    const rowY = component.y + index * rowHeight;
    nodes.push(rectAt(component.x, rowY, component.width, rowHeight, { stroke: '#a8a8a8' }));
    nodes.push(lineAt(component.x + labelWidth, rowY, component.x + labelWidth, rowY + rowHeight, { stroke: '#a8a8a8' }));
    nodes.push(textAt(field.label, component.x + 3, rowY + 3.2, {
      width: labelWidth - 6,
      size: asNumber(component.fontSize, 10),
    }));
  });

  return nodes;
};

const sectionTableNodes = (component: SectionTableBuilderComponent) => {
  const nodes: any[] = [];
  const rowBaseHeight = asNumber(component.rowHeight, DEFAULT_SECTION_TABLE_ROW_HEIGHT);
  const limitWidth = component.showLimit ? asNumber(component.limitWidth, DEFAULT_SECTION_TABLE_LIMIT_WIDTH) : 0;
  const showWant = component.showWant !== false;
  const wantWidth = showWant ? asNumber(component.wantWidth, DEFAULT_SECTION_TABLE_WANT_WIDTH) : 0;
  const itemWidth = component.width - limitWidth - wantWidth;
  const fontSize = asNumber(component.fontSize, 10);
  const headerHeight = tableHeaderHeight(component, rowBaseHeight, {
    itemWidth,
    limitWidth,
    wantWidth,
    fontSize,
    showLimit: component.showLimit,
    showWant,
  });
  const categoryLimitTag = formatCategoryLimitTag(component.categoryLimit, component.categoryLimitType);
  const categoryLimitFontSize = Math.max(7, fontSize - 2);

  nodes.push(rectAt(component.x, component.y, component.width, headerHeight, { fill: 'white', stroke: '#b9b9b9' }));
  nodes.push(textAt(component.title, component.x, component.y + 3, {
    width: itemWidth,
    size: fontSize,
    bold: true,
    align: 'center',
  }));
  if (categoryLimitTag) {
    nodes.push(textAt(`(${categoryLimitTag})`, component.x + 4, component.y + rowBaseHeight + 1, {
      width: itemWidth - 8,
      size: categoryLimitFontSize,
      italics: true,
      align: 'center',
    }));
  }
  if (component.showLimit) {
    nodes.push(textAt(component.limitHeader || 'Limit', component.x + itemWidth, component.y + 3, {
      width: limitWidth,
      size: fontSize,
      bold: true,
      align: 'center',
    }));
  }
  nodes.push(textAt(component.wantHeader || 'Want', component.x + itemWidth + limitWidth, component.y + 3, {
    width: wantWidth,
    size: fontSize,
    bold: true,
    align: 'center',
  }));
  nodes.push(lineAt(component.x + itemWidth, component.y, component.x + itemWidth, component.y + headerHeight));
  if (component.showLimit) {
    nodes.push(lineAt(component.x + itemWidth + limitWidth, component.y, component.x + itemWidth + limitWidth, component.y + headerHeight));
  }

  let cursorY = component.y + headerHeight;
  component.rows.forEach((row, index) => {
    const height = tableRowHeight(row, rowBaseHeight, {
      itemWidth,
      limitWidth,
      fontSize,
      showLimit: component.showLimit,
      showStatusIcons: component.showStatusIcons === true,
    });
    const fill = component.alternateRows && index % 2 === 0 ? '#e4e4e4' : 'white';
    nodes.push(rectAt(component.x, cursorY, component.width, height, { fill, stroke: '#cfcfcf' }));
    nodes.push(lineAt(component.x + itemWidth, cursorY, component.x + itemWidth, cursorY + height, { stroke: '#cfcfcf' }));
    if (component.showLimit) {
      nodes.push(lineAt(component.x + itemWidth + limitWidth, cursorY, component.x + itemWidth + limitWidth, cursorY + height, { stroke: '#cfcfcf' }));
    }
    nodes.push(textAt(row.item, component.x + 4, cursorY + 3, {
      width: itemWidth - 8,
      size: fontSize,
      lineHeight: 1.06,
    }));
    if (component.showLimit && row.limit) {
      nodes.push(textAt(row.limit, component.x + itemWidth + 2, cursorY + 3, {
        width: limitWidth - 4,
        size: fontSize,
        align: 'center',
        lineHeight: 1.06,
      }));
    }
    cursorY += height;
  });

  return nodes;
};

const sectionTableFlowNode = (component: SectionTableBuilderComponent) => {
  const rowBaseHeight = asNumber(component.rowHeight, DEFAULT_SECTION_TABLE_ROW_HEIGHT);
  const limitWidth = component.showLimit ? asNumber(component.limitWidth, DEFAULT_SECTION_TABLE_LIMIT_WIDTH) : 0;
  const wantWidth = asNumber(component.wantWidth, DEFAULT_SECTION_TABLE_WANT_WIDTH);
  const itemWidth = Math.max(32, component.width - limitWidth - wantWidth);
  const fontSize = asNumber(component.fontSize, 10);
  const categoryLimitTag = formatCategoryLimitTag(component.categoryLimit, component.categoryLimitType);
  const widths = component.showLimit
    ? [itemWidth, limitWidth, wantWidth]
    : [itemWidth, wantWidth];
  const headerCells = [
    {
      stack: [
        { text: component.title, bold: true, alignment: 'center', fontSize },
        ...(categoryLimitTag ? [{
          text: `(${categoryLimitTag})`,
          italics: true,
          bold: false,
          alignment: 'center',
          fontSize: Math.max(7, fontSize - 2),
        }] : []),
      ],
      bold: true,
      alignment: 'center',
      fontSize,
      fillColor: 'white',
    },
    ...(component.showLimit ? [{
      text: component.limitHeader || 'Limit',
      bold: true,
      alignment: 'center',
      fontSize,
      fillColor: 'white',
    }] : []),
    {
      text: component.wantHeader || 'Want',
      bold: true,
      alignment: 'center',
      fontSize,
      fillColor: 'white',
    },
  ];

  const bodyRows = component.rows.map((row, index) => {
    const fillColor = component.alternateRows && index % 2 === 0 ? '#e4e4e4' : 'white';
    return [
      {
        text: row.item,
        fontSize,
        lineHeight: 1.06,
        margin: [2, 2, 2, 2],
        fillColor,
      },
      ...(component.showLimit ? [{
        text: row.limit,
        fontSize,
        lineHeight: 1.06,
        alignment: 'center',
        margin: [2, 2, 2, 2],
        fillColor,
      }] : []),
      {
        text: '',
        fontSize,
        margin: [2, 2, 2, 2],
        fillColor,
      },
    ];
  });

  return {
    margin: [0, 0, 0, 4],
    layout: {
      hLineWidth: () => 0.45,
      vLineWidth: () => 0.45,
      hLineColor: () => '#cfcfcf',
      vLineColor: () => '#cfcfcf',
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    table: {
      headerRows: component.repeatHeaderRows === false ? 0 : 1,
      keepWithHeaderRows: component.keepHeaderWithFirstRow === false ? 0 : 1,
      dontBreakRows: component.keepRowsTogether !== false,
      heights: (rowIndex: number) => {
        const row = component.rows[rowIndex - 1];
        return row ? tableRowHeight(row, rowBaseHeight, {
          itemWidth,
          limitWidth,
          fontSize,
          showLimit: component.showLimit,
          showStatusIcons: component.showStatusIcons === true,
        }) : tableHeaderHeight(component, rowBaseHeight, {
          itemWidth,
          limitWidth,
          wantWidth,
          fontSize,
          showLimit: component.showLimit,
          showWant: component.showWant !== false,
        });
      },
      widths,
      body: [headerCells, ...bodyRows],
    },
  };
};

const lineNodes = (component: LineBuilderComponent) => {
  const strokeWidth = asNumber(component.strokeWidth, 1);
  if (component.direction === 'vertical') {
    return [lineAt(component.x, component.y, component.x, component.y + component.height, { stroke: 'black', lineWidth: strokeWidth })];
  }

  return [lineAt(component.x, component.y, component.x + component.width, component.y, { stroke: 'black', lineWidth: strokeWidth })];
};

const componentNodes = (component: BuilderComponent) => {
  switch (component.type) {
    case 'text':
      return textNodes(component);
    case 'form-field-group':
      return formFieldNodes(component);
    case 'section-table':
      return sectionTableNodes(component);
    case 'line':
      return lineNodes(component);
    default:
      throw createRouteError('Unsupported builder component type.');
  }
};

const isFlowingBodySectionTable = (component: BuilderComponent): component is SectionTableBuilderComponent => (
  component.type === 'section-table'
  && getComponentRegion(component) === 'body'
  && getSectionTableFlowMode(component) === 'flowing'
);

const flowingTableSort = (first: SectionTableBuilderComponent, second: SectionTableBuilderComponent) => {
  if (first.y !== second.y) {
    return first.y - second.y;
  }

  return first.x - second.x;
};

const flowContentNode = (template: ShoppingListBuilderTemplate, tables: SectionTableBuilderComponent[]) => {
  const headerHeight = getTemplateHeaderHeight(template);
  const footerHeight = getTemplateFooterHeight(template);
  const bodyLayoutMode = getTemplateBodyLayoutMode(template);
  const columnGap = getTemplateBodyColumnGap(template);
  const tableStack = [...tables].sort(flowingTableSort).map(sectionTableFlowNode);

  if (bodyLayoutMode === 'split') {
    return {
      margin: [28, headerHeight, 28, footerHeight],
      columns: [
        {
          width: '*',
          stack: tableStack,
        },
        {
          width: '*',
          text: '',
        },
      ],
      columnGap,
      snakingColumns: true,
    };
  }

  return {
    margin: [28, headerHeight, 28, footerHeight],
    stack: tableStack,
  };
};

const buildPageContent = (template: ShoppingListBuilderTemplate) => {
  const flowingTables = template.components.filter(isFlowingBodySectionTable);
  const fixedComponents = template.components.filter((component) => !isFlowingBodySectionTable(component));
  const content: any[] = [
    rectAt(0, 0, template.paper.width, template.paper.height, { fill: 'white', stroke: 'white', lineWidth: 0 }),
    ...fixedComponents.flatMap(componentNodes),
  ];

  if (flowingTables.length > 0) {
    content.push(flowContentNode(template, flowingTables));
  }

  return content;
};

const buildDocDefinition = (template: ShoppingListBuilderTemplate, author = 'FEED') => {
  const content = buildPageContent(template);

  if (getTemplatePrintMode(template) === 'two-sided-duplicate') {
    const duplicatedContent = buildPageContent(template);
    content.push({
      ...duplicatedContent[0],
      pageBreak: 'before',
    });
    content.push(...duplicatedContent.slice(1));
  }

  return {
    pageSize: {
      width: template.paper.width,
      height: template.paper.height,
    },
    pageMargins: [0, 0, 0, 0],
    defaultStyle: {
      font: BUILDER_PDF_FONT_FAMILY,
      fontSize: 10,
    },
    info: {
      title: template.name || 'Shopping List Builder Preview',
      author,
      subject: `Shopping list builder preview PDF. Max pages: ${getTemplateMaxPages(template)}.`,
    },
    content,
  };
};

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);

const pt = (value: unknown, fallback = 0) => `${asNumber(value, fallback)}pt`;

const textAlign = (align: unknown): 'left' | 'center' | 'right' => (
  align === 'center' || align === 'right' ? align : 'left'
);

const textAlignForLanguage = (
  align: unknown,
  language?: string | null,
  isTranslated: boolean = false,
): 'left' | 'center' | 'right' => {
  const resolved = textAlign(align);
  if (resolved === 'center' || !isTranslated || !isRTLTargetLanguage(language)) {
    return resolved;
  }
  return resolved === 'left' ? 'right' : 'left';
};

const fontWeight = (bold: boolean) => (bold ? 700 : 400);

const getFontDataUrl = async (fileName: string, dir: string = BUILDER_PDF_FONT_DIR) => {
  const fontBuffer = await fs.readFile(path.join(dir, fileName));
  return `data:font/truetype;base64,${fontBuffer.toString('base64')}`;
};

const fontFace = async (
  family: string,
  fileName: string,
  // Accepts either a single weight (400, 700) or a CSS weight range
  // string ("100 900") for variable fonts that cover the full range.
  weight: number | string,
  style: 'normal' | 'italic' = 'normal',
  dir: string = BUILDER_PDF_FONT_DIR,
) => {
  const dataUrl = await getFontDataUrl(fileName, dir);

  return `
    @font-face {
      font-family: "${family}";
      src: url("${dataUrl}") format("truetype");
      font-weight: ${weight};
      font-style: ${style};
    }`;
};

// Two cached CSS bundles: one without CJK (the fast default for English
// renders) and one with the ~36 MB Noto Sans SC/JP/KR variable fonts
// inlined as data URLs (used only for CJK target languages). Caching by
// boolean key avoids re-reading + base64-encoding the font files on
// every PDF generation.
const builderFontCssCache = new Map<boolean, Promise<string>>();

const getBuilderFontCss = (includeCJK: boolean = false) => {
  const cached = builderFontCssCache.get(includeCJK);
  if (cached) return cached;

  const baseRules = [
    fontFace('Noto Sans', 'NotoSans-Regular.ttf', 400),
    fontFace('Noto Sans', 'NotoSans-Bold.ttf', 700),
    fontFace('Noto Sans', 'NotoSans-Italic.ttf', 400, 'italic'),
    fontFace('Noto Sans', 'NotoSans-BoldItalic.ttf', 700, 'italic'),
    fontFace('Noto Sans Symbols', 'NotoSansSymbols-Regular.ttf', 400),
    fontFace('Noto Sans Symbols 2', 'NotoSansSymbols2-Regular.ttf', 400),
    fontFace('Noto Naskh Arabic', 'NotoNaskhArabic-Regular.ttf', 400),
    fontFace('Noto Naskh Arabic', 'NotoNaskhArabic-Bold.ttf', 700),
    fontFace('Noto Sans Hebrew', 'NotoSansHebrew-Regular.ttf', 400),
    fontFace('Noto Sans Hebrew', 'NotoSansHebrew-Bold.ttf', 700),
  ];

  // Variable Noto CJK fonts (one file per script covers weights 100-900).
  // Declared with the full weight range so font-weight: 400 and
  // font-weight: 700 both resolve to the same VF.
  const cjkRules = includeCJK
    ? [
      fontFace('Noto Sans SC', 'NotoSansSC-VF.ttf', '100 900', 'normal', BUILDER_PDF_CJK_FONT_DIR),
      fontFace('Noto Sans JP', 'NotoSansJP-VF.ttf', '100 900', 'normal', BUILDER_PDF_CJK_FONT_DIR),
      fontFace('Noto Sans KR', 'NotoSansKR-VF.ttf', '100 900', 'normal', BUILDER_PDF_CJK_FONT_DIR),
    ]
    : [];

  const promise = Promise.all([...baseRules, ...cjkRules]).then((rules) => rules.join('\n'));
  builderFontCssCache.set(includeCJK, promise);
  return promise;
};

/**
 * True when the requested target language is one of the CJK scripts and
 * therefore needs the Noto Sans CJK fonts loaded for the PDF render to
 * emit the right glyphs. Pattern-based so we cover common naming
 * variants (Mandarin, Cantonese, Simplified / Traditional Chinese,
 * etc.) without coupling to a specific entry in the Language table.
 */
const CJK_LANGUAGE_PATTERNS: RegExp[] = [
  /chinese/i,
  /mandarin/i,
  /cantonese/i,
  /japanese/i,
  /korean/i,
];

const isCJKTargetLanguage = (language?: string | null): boolean => {
  if (!language || typeof language !== 'string') return false;
  return CJK_LANGUAGE_PATTERNS.some((re) => re.test(language));
};

/**
 * True when the requested target language is written right-to-left.
 * Section tables and form-field groups set `dir="rtl"` on their grid
 * containers when this is true, which reverses the visual column order
 * (Category | Limit | Want -> Want | Limit | Category) and flips text
 * alignment. Pattern-based for naming-variant resilience; currently
 * scoped to the enabled RTL languages (Arabic and Persian/Farsi) but
 * easy to extend (Hebrew, Urdu) when those are enabled.
 */
const RTL_LANGUAGE_PATTERNS: RegExp[] = [
  /arabic/i,
  /persian/i,
  /farsi/i,
];

const isRTLTargetLanguage = (language?: string | null): boolean => {
  if (!language || typeof language !== 'string') return false;
  return RTL_LANGUAGE_PATTERNS.some((re) => re.test(language));
};

const textComponentHtml = (
  component: TextBuilderComponent,
  options: { x?: number; y?: number; translations?: Record<string, string>; language?: string } = {},
) => {
  // Per-component translation mode. Undefined defaults to 'translate' so
  // pre-slice-2 templates retain their slice-1 behaviour.
  const mode: BuilderTranslationMode = component.translationMode ?? 'translate';
  const original = component.content;
  const cachedTranslation = options.translations && options.translations[original]
    ? options.translations[original]
    : undefined;
  const isTranslated = Boolean(cachedTranslation && mode !== 'skip');

  // Delegate to the shared translated-text renderer so all translation
  // modes (skip / translate / translate-with-original /
  // translate-with-original-block) stay defined in exactly one place.
  const body = translatedBuilderTextHtml(original, cachedTranslation, mode);

  return `
  <div
    class="builder-component builder-text"
    dir="auto"
    style="
      left: ${pt(options.x ?? component.x)};
      top: ${pt(options.y ?? component.y)};
      width: ${pt(component.width)};
      font-size: ${pt(component.fontSize, 10)};
      font-weight: ${fontWeight(component.fontWeight === 'bold')};
      line-height: ${asNumber(component.lineHeight, 1)};
      text-align: ${textAlignForLanguage(component.align, options.language, isTranslated)};
    "
  >${body}</div>`;
};

const translatedBuilderTextHtml = (
  original: string,
  cachedTranslation: string | undefined,
  mode: BuilderTranslationMode,
): string => {
  if (mode === 'skip' || !cachedTranslation) {
    return escapeHtml(original);
  }
  if (
    mode === 'translate-with-original'
    || mode === 'translate-with-original-block'
    || mode === 'translate-with-original-adaptive'
  ) {
    // `-block` places the 8pt bold English tag on its own line beneath
    // the translation; the inline variant separates them with a space.
    // `-adaptive` is inline but marks the tag `white-space: nowrap` so it
    // stays on the translation's last line if it fits and otherwise drops
    // whole onto the next line (binary placement -- never wraps mid-tag).
    const block = mode === 'translate-with-original-block';
    const adaptive = mode === 'translate-with-original-adaptive';
    const tagStyle = `font-size: ${pt(TEXT_ORIGINAL_TAG_FONT_SIZE_PT)}; font-weight: 700;`
      + `${block ? ' display: block;' : ''}`
      + `${adaptive ? ' white-space: nowrap;' : ''}`;
    return `${escapeHtml(cachedTranslation)}${block ? '' : ' '}`
      + `<span class="builder-text-original-tag" style="${tagStyle}">`
      + escapeHtml(original)
      + `</span>`;
  }
  return escapeHtml(cachedTranslation);
};

// Date formatter mirrors the frontend `formatBuilderDate` exactly so canvas
// preview and Chromium HTML render produce identical strings without depending
// on locale, time zone, or date-fns on the backend.
const DATE_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DATE_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const dateOrdinalSuffix = (day: number): string => {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};
const formatBuilderDateString = (date: Date, formatId: BuilderDateFormatId = 'long-ordinal'): string => {
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const weekday = date.getDay();
  switch (formatId) {
    case 'long':
      return `${DATE_WEEKDAYS[weekday]}, ${DATE_MONTHS[month]} ${day}, ${year}`;
    case 'medium':
      return `${DATE_MONTHS[month]} ${day}, ${year}`;
    case 'short-slash':
      return `${month + 1}/${day}/${year}`;
    case 'short-dash':
      return `${month + 1}-${day}-${year}`;
    case 'iso':
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    case 'long-ordinal':
    default:
      return `${DATE_WEEKDAYS[weekday]}, ${DATE_MONTHS[month]} ${day}${dateOrdinalSuffix(day)}, ${year}`;
  }
};
const parseBuilderCustomDate = (iso: string | undefined | null): Date | null => {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  return date;
};
const resolveDateInstance = (component: DateBuilderComponent, now = new Date()): Date => {
  if (component.dateMode === 'custom') {
    const parsed = parseBuilderCustomDate(component.customDate);
    if (parsed) return parsed;
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const BUILDER_LANGUAGE_NATIVE_NAMES: Record<string, string> = {
  Arabic: 'العربية',
  Bengali: 'বাংলা',
  Cantonese: '粵語',
  Chinese: '中文',
  Farsi: 'فارسی',
  French: 'Français',
  Hebrew: 'עברית',
  Hindi: 'हिन्दी',
  Japanese: '日本語',
  Korean: '한국어',
  Mandarin: '中文',
  Persian: 'فارسی',
  Portuguese: 'Português',
  Punjabi: 'ਪੰਜਾਬੀ',
  Russian: 'Русский',
  Somali: 'Soomaali',
  Spanish: 'Español',
  Swahili: 'Kiswahili',
  Ukrainian: 'Українська',
  Urdu: 'اردو',
  Vietnamese: 'Tiếng Việt',
};

const normalizeBuilderLanguageName = (language: string | undefined | null): string => {
  const trimmed = typeof language === 'string' ? language.trim() : '';
  return trimmed.length > 0 ? trimmed : 'English';
};

const getBuilderLanguageNativeName = (language: string | undefined | null): string => {
  const englishName = normalizeBuilderLanguageName(language);
  return BUILDER_LANGUAGE_NATIVE_NAMES[englishName] ?? englishName;
};

const resolveBuilderLanguageTagText = (
  language: string | undefined | null,
  mode: BuilderLanguageTagMode = DEFAULT_LANGUAGE_TAG_MODE,
): string => {
  const englishName = normalizeBuilderLanguageName(language);
  if (mode === 'hide-english' && englishName.toLowerCase() === 'english') return '';
  if (mode === 'native') return getBuilderLanguageNativeName(englishName);
  if (mode === 'native-with-english') {
    const nativeName = getBuilderLanguageNativeName(englishName);
    return nativeName === englishName ? englishName : `${nativeName}/${englishName}`;
  }
  return englishName;
};

const dateComponentHtml = (component: DateBuilderComponent, options: {
  x?: number;
  y?: number;
  translations?: Record<string, string>;
} = {}) => {
  const resolved = resolveDateInstance(component);
  const formatted = formatBuilderDateString(resolved, component.formatId ?? 'long-ordinal');
  const mode = component.translationMode ?? 'translate';
  const body = translatedBuilderTextHtml(formatted, options.translations?.[formatted], mode);
  return `
    <div
      class="builder-component builder-text builder-date"
      dir="auto"
      style="
        left: ${pt(options.x ?? component.x)};
        top: ${pt(options.y ?? component.y)};
        width: ${pt(component.width)};
        font-size: ${pt(component.fontSize, 12)};
        font-weight: ${fontWeight(component.fontWeight === 'bold')};
        line-height: ${asNumber(component.lineHeight, 1.2)};
        text-align: ${textAlign(component.align)};
      "
    >${body}</div>`;
};

const languageTagComponentHtml = (component: LanguageTagBuilderComponent, options: {
  x?: number;
  y?: number;
  language?: string;
} = {}) => {
  const body = escapeHtml(resolveBuilderLanguageTagText(options.language, component.mode ?? DEFAULT_LANGUAGE_TAG_MODE));
  return `
    <div
      class="builder-component builder-text builder-language-tag"
      dir="auto"
      style="
        left: ${pt(options.x ?? component.x)};
        top: ${pt(options.y ?? component.y)};
        width: ${pt(component.width)};
        font-size: ${pt(component.fontSize, 12)};
        font-weight: ${fontWeight(component.fontWeight === 'bold')};
        line-height: ${asNumber(component.lineHeight, 1.2)};
        text-align: ${textAlign(component.align)};
      "
    >${body}</div>`;
};

const formFieldComponentHtml = (component: FormFieldGroupBuilderComponent, options: {
  x?: number;
  y?: number;
  translations?: Record<string, string>;
  language?: string;
} = {}) => {
  const labelWidth = Math.min(asNumber(component.labelWidth, 150), component.width - 24);
  const valueWidth = component.width - labelWidth;
  const cornerRadius = Math.max(0, asNumber(component.cornerRadius, 0));
  // Font-aware per-row height. At fontSize=10 single-line labels are 18pt
  // (matches legacy). When a label wraps each row grows to perRow * lineCount
  // so the form stays on the 9pt grid.
  const formFontSize = asNumber(component.fontSize, 10);
  const perRow = baseRowHeight(formFontSize);
  // Label cell uses 3pt horizontal padding (6pt total).
  const labelAvailableWidth = Math.max(1, labelWidth - 6);
  const measurement = options.translations ? { translations: options.translations } : undefined;
  // RTL target language: dir="rtl" reverses the label|value grid columns
  // (label moves to the right) and flips text alignment. The column
  // widths and the label|value border (border-inline-start) follow.
  const dirAttr = isRTLTargetLanguage(options.language) ? ' dir="rtl"' : '';
  // A1/A3 (forms, mirror of section tables): default ON; root modifier classes
  // null out the class-based row separators / label|value divider, and the
  // outer border is inline (same split as `sectionTableComponentHtml`).
  const showColumnDividers = component.showColumnDividers !== false;
  const showBorders = component.showBorders !== false;
  const formModifierClasses = `${showColumnDividers ? '' : ' builder-form-no-dividers'}${showBorders ? '' : ' builder-form-no-borders'}`;

  return `
    <div${dirAttr}
      class="builder-component builder-form-fields${formModifierClasses}"
      style="
        left: ${pt(options.x ?? component.x)};
        top: ${pt(options.y ?? component.y)};
        width: ${pt(component.width)};
        font-size: ${pt(component.fontSize, 10)};
        ${showBorders ? 'border: 0.45pt solid #a8a8a8;' : 'border: none;'}
        background: #ffffff;
        border-radius: ${pt(cornerRadius)};
        overflow: ${cornerRadius > 0 ? 'hidden' : 'visible'};
      "
    >
      ${component.fields.map((field, index) => {
        const mode = field.translationMode ?? 'translate';
        const lineCount = builderGeneratedTextUsesTranslation(field.label, mode, measurement)
          ? estimateWrappedSegmentLineCount(
            builderGeneratedTextSegments(field.label, mode, formFontSize, measurement),
            labelAvailableWidth,
          )
          : estimateWrappedLineCount(
            field.label,
            labelAvailableWidth,
            formFontSize,
          );
        const fieldRowHeight = Math.max(perRow, perRow * lineCount);
        return `
        <div
          class="builder-form-row${index > 0 ? ' builder-form-row-separator' : ''}"
          style="
            grid-template-columns: ${pt(labelWidth)} ${pt(valueWidth)};
            min-height: ${pt(fieldRowHeight)};
          "
        >
          <div class="builder-form-label" dir="auto">${translatedBuilderTextHtml(field.label, options.translations?.[field.label], mode)}</div>
          <div class="builder-form-value"></div>
        </div>
      `;
      }).join('')}
    </div>`;
};

const formatCategoryLimitTag = (
  limit: number | null | undefined,
  limitType: 'person' | 'household' | null | undefined,
): string | null => {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return null;
  }
  if (limitType === 'person') {
    return `Choose up to ${limit} per person`;
  }
  if (limit === 1) {
    return 'Choose one';
  }
  if (limit === 2) {
    return 'Choose two';
  }
  return `Choose up to ${limit}`;
};

// A2: Limited / Clearance status icons for rows. Raw SVG (lucide
// triangle-alert / tag) so the Chromium PDF matches the canvas lucide icons;
// validate any path edits against a rendered PDF (AGENTS.md icon parity).
const STATUS_ICON_SVG_PATHS = {
  limited: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  clearance: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
} as const;

const statusIconSvg = (kind: 'limited' | 'clearance', color: string): string =>
  `<svg class="builder-status-icon" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${STATUS_ICON_SVG_PATHS[kind]}</svg>`;

const builderRowStatusIconsHtml = (
  row: { isLimited?: boolean; isClearance?: boolean },
): string => {
  if (!row.isLimited && !row.isClearance) return '';
  return `<span class="builder-status-icons">${row.isLimited ? statusIconSvg('limited', '#000000') : ''}${row.isClearance ? statusIconSvg('clearance', '#000000') : ''}</span>`;
};

const builderCategoryIconSvg = (iconName: string | null | undefined): string => {
  const key = iconName && FOOD_ICON_SVG_PATHS[iconName] ? iconName : 'package';
  return `<svg class="builder-category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FOOD_ICON_SVG_PATHS[key]}</svg>`;
};

// B3: resolve the text shown in a row's Limit cell. Each row carries only its
// own item-level limit; when a row has none ("No Limit") and the table has not
// opted out of `showGlobalLimit` (default ON, ISSUES.md #39), fall back to the
// org-wide Global Limit value. The value is supplied live at render time and
// never baked into the saved rows.
// MUST mirror `resolveRowLimitText` in the frontend ShoppingListBuilder.
const resolveRowLimitText = (
  rowLimit: string,
  showGlobalLimit: boolean,
  globalLimit: number | null | undefined,
): string => {
  if (rowLimit && rowLimit.length > 0) return rowLimit;
  if (showGlobalLimit && globalLimit != null) return String(globalLimit);
  return rowLimit;
};

// A6: resolve the effective Want-column control for a section table. The
// table-level `component.wantControl` is the source of truth; when unset, fall
// back to legacy per-row `wantControl` ('checkbox' if ANY row carries it) so
// older saved templates render correctly. Lifted from per-row to table-level
// because the row-level setting never reliably persisted on inventory-backed
// tables — the refresh-inventory rebuild wipes per-row fields — and the use
// case is "apply to all rows" anyway. See ISSUES.md #43.
// MUST mirror `resolveSectionTableWantControl` in the frontend ShoppingListBuilder.
export const resolveSectionTableWantControl = (
  component: SectionTableBuilderComponent,
): 'blank' | 'checkbox' => {
  if (component.wantControl === 'checkbox') return 'checkbox';
  if (component.wantControl === 'blank') return 'blank';
  if (component.rows.some((row) => row.wantControl === 'checkbox')) return 'checkbox';
  return 'blank';
};

const sectionTableComponentHtml = (
  component: SectionTableBuilderComponent,
  options: {
    rows?: SectionTableBuilderComponent['rows'];
    rowHeights?: number[];
    x?: number;
    y?: number;
    includeCategoryIcons?: boolean;
    language?: string;
    translations?: Record<string, string>;
    inventoryTranslations?: {
      categories: Record<number, string>;
      foodItems: Record<number, string>;
    };
    // B3: current Global Limit value, used as the Limit-cell fallback for
    // no-limit rows when `component.showGlobalLimit` is on.
    globalLimit?: number | null;
  } = {},
) => {
  const rowBaseHeight = asNumber(component.rowHeight, DEFAULT_SECTION_TABLE_ROW_HEIGHT);
  const limitWidth = component.showLimit ? asNumber(component.limitWidth, DEFAULT_SECTION_TABLE_LIMIT_WIDTH) : 0;
  const showWant = component.showWant !== false;
  // A6: table-level toggle (with legacy per-row fallback). Same value on every
  // row, computed once outside the row loop below.
  const wantCheckbox = resolveSectionTableWantControl(component) === 'checkbox';
  const wantWidth = showWant ? asNumber(component.wantWidth, DEFAULT_SECTION_TABLE_WANT_WIDTH) : 0;
  const itemWidth = component.width - limitWidth - wantWidth;
  const fontSize = asNumber(component.fontSize, 10);
  // A1/A3 (must mirror the canvas): default ON; root modifier classes null
  // out the class-based dividers/borders, and the outer border is inline.
  const showColumnDividers = component.showColumnDividers !== false;
  const showBorders = component.showBorders !== false;
  const tableModifierClasses = `${showColumnDividers ? '' : ' builder-table-no-dividers'}${showBorders ? '' : ' builder-table-no-borders'}`;
  // Columns in order: Item, [Limit if shown], [Want if shown] — all four
  // combinations (A5). Must match the canvas grid in ShoppingListBuilder.tsx.
  const gridTemplateColumns = [
    pt(itemWidth),
    ...(component.showLimit ? [pt(limitWidth)] : []),
    ...(showWant ? [pt(wantWidth)] : []),
  ].join(' ');
  const categoryLimitTag = formatCategoryLimitTag(component.categoryLimit, component.categoryLimitType);
  const categoryLimitTagSource = categoryLimitTag ? `(${categoryLimitTag})` : null;
  const translationSettings = resolveSectionTableTranslationSettings(component.translationSettings);
  const headerMode = translationSettings.headers ?? 'translate';
  const tagMode = translationSettings.tags ?? 'translate';
  const rowMode = translationSettings.rows ?? 'translate';
  const measurement = options.inventoryTranslations || options.translations
    ? {
      language: options.language,
      translations: options.translations,
      inventoryTranslations: options.inventoryTranslations,
    }
    : undefined;
  // Inventory tables resolve the title from the denormalized
  // CategoryTranslation table; base-component tables resolve it from the
  // Generated (List) cache (options.translations) keyed by the title text.
  const categoryTranslation = component.inventorySource?.categoryId
    ? options.inventoryTranslations?.categories[component.inventorySource.categoryId]
    : options.translations?.[component.title];
  const renderedTitle = translatedBuilderTextHtml(component.title, categoryTranslation, headerMode);
  const categoryLimitFontSize = Math.max(7, fontSize - 2);
  const cornerRadius = Math.max(0, asNumber(component.cornerRadius, 0));
  const showCategoryIcon = options.includeCategoryIcons === true && Boolean(component.inventorySource);
  const headerHeight = tableHeaderHeight(component, rowBaseHeight, {
    itemWidth,
    limitWidth,
    wantWidth,
    fontSize,
    showLimit: component.showLimit,
    showWant,
    iconOverhead: categoryIconTitleWidthOverhead(fontSize, showCategoryIcon),
    ...sectionTableHeaderMeasurementSegments(component, fontSize, measurement),
  });
  const resolvedRows = options.rows ?? component.rows;
  const computedRowHeights = options.rowHeights ?? (
    resolvedRows === component.rows
      ? getSectionTableRowHeights(
        component,
        getSectionTableMetrics(component, measurement, { showCategoryIcon }),
        measurement,
      )
      : undefined
  );

  // RTL target language: dir="rtl" reverses the visual column order of
  // every grid row in the table -- header and body alike -- so the layout
  // reads Want | Limit | Category name & tags. Column widths and the
  // inline-start cell dividers follow the reversal automatically.
  const dirAttr = isRTLTargetLanguage(options.language) ? ' dir="rtl"' : '';

  return `
    <div${dirAttr}
      class="builder-component builder-section-table${tableModifierClasses}"
      style="
        left: ${pt(options.x ?? component.x)};
        top: ${pt(options.y ?? component.y)};
        width: ${pt(component.width)};
        font-size: ${pt(fontSize)};
        border-radius: ${pt(cornerRadius)};
        ${showBorders ? 'border: 0.45pt solid #b9b9b9;' : 'border: none;'}
        background: #ffffff;
        overflow: ${cornerRadius > 0 ? 'hidden' : 'visible'};
      "
    >
      <div
        class="builder-table-header"
        style="
          grid-template-columns: ${gridTemplateColumns};
          height: ${pt(headerHeight)};
        "
      >
        <div class="builder-table-header-title${categoryLimitTag ? ' builder-table-header-title-tagged' : ''}${showCategoryIcon ? ' builder-table-header-title-icon' : ''}" dir="auto">
          <span class="builder-table-title-line">${showCategoryIcon ? builderCategoryIconSvg(component.inventorySource?.categoryIcon) : ''}<span>${renderedTitle}</span></span>
          ${categoryLimitTagSource ? `<span class="builder-table-category-limit" style="font-size: ${pt(categoryLimitFontSize)};">${translatedBuilderTextHtml(categoryLimitTagSource, options.translations?.[categoryLimitTagSource], tagMode)}</span>` : ''}
        </div>
        ${component.showLimit ? `<div class="builder-table-cell-left-border builder-table-header-cell" dir="auto">${translatedBuilderTextHtml(component.limitHeader || 'Limit', options.translations?.[component.limitHeader || 'Limit'], headerMode)}</div>` : ''}
        ${showWant ? `<div class="builder-table-cell-left-border builder-table-header-cell" dir="auto">${translatedBuilderTextHtml(component.wantHeader || 'Want', options.translations?.[component.wantHeader || 'Want'], headerMode)}</div>` : ''}
      </div>
      ${resolvedRows.map((row, index, allRows) => {
        const rowHeight = computedRowHeights?.[index] ?? tableRowHeight(row, rowBaseHeight, {
          itemWidth,
          limitWidth,
          fontSize,
          showLimit: component.showLimit,
          showStatusIcons: component.showStatusIcons === true,
          itemSegments: sectionTableRowItemSegments(row, rowMode, fontSize, measurement),
          useNaturalContentHeight: sectionTableRowUsesTranslatedText(row, rowMode, measurement),
        });
        const fillColor = component.alternateRows && index % 2 === 0 ? '#e4e4e4' : '#ffffff';

        return `
          <div
            class="builder-table-row${index === allRows.length - 1 ? ' builder-table-row-last' : ''}"
            style="
              grid-template-columns: ${gridTemplateColumns};
              height: ${pt(rowHeight)};
              background: ${fillColor};
            "
          >
            ${(() => {
              // Inventory rows resolve from FoodItemTranslation; base-component
              // rows (no foodItemId) resolve from the Generated (List) cache.
              const itemHtml = translatedBuilderTextHtml(
                row.item,
                row.foodItemId
                  ? options.inventoryTranslations?.foodItems[row.foodItemId]
                  : options.translations?.[row.item],
                rowMode,
              );
              // A2: only restructure to flex (icons + text) when status icons
              // are on; otherwise keep the original cell byte-identical.
              return component.showStatusIcons === true
                ? `<div class="builder-table-text-cell builder-table-item-cell" dir="auto">${builderRowStatusIconsHtml(row)}<span class="builder-item-text">${itemHtml}</span></div>`
                : `<div class="builder-table-text-cell" dir="auto">${itemHtml}</div>`;
            })()}
            ${component.showLimit ? `<div class="builder-table-text-cell builder-table-cell-left-border builder-table-center" dir="auto">${escapeHtml(resolveRowLimitText(row.limit, component.showGlobalLimit !== false, options.globalLimit))}</div>` : ''}
            ${showWant ? `<div class="builder-table-cell-left-border builder-table-want-cell">${wantCheckbox ? '<span class="builder-want-checkbox"></span>' : ''}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>`;
};

const lineComponentHtml = (component: LineBuilderComponent, options: { x?: number; y?: number } = {}) => {
  const strokeWidth = asNumber(component.strokeWidth, 1);
  const width = component.direction === 'horizontal' ? component.width : strokeWidth;
  const height = component.direction === 'horizontal' ? strokeWidth : component.height;

  return `
    <div
      class="builder-component builder-line"
      style="
        left: ${pt(options.x ?? component.x)};
        top: ${pt(options.y ?? component.y)};
        width: ${pt(width)};
        height: ${pt(height)};
      "
    ></div>`;
};

// A4: focused status legend — reuses the A2 status icon SVGs; labels
// translate via the Generated (List) cache like text. Must mirror the
// canvas PreviewLegend.
const legendComponentHtml = (component: LegendBuilderComponent, options: {
  x?: number;
  y?: number;
  translations?: Record<string, string>;
  language?: string;
} = {}) => {
  const entry = (kind: 'limited' | 'clearance', color: string, label: string) =>
    `<span class="builder-legend-entry">${statusIconSvg(kind, color)}<span dir="auto" class="builder-legend-label">${translatedBuilderTextHtml(label, options.translations?.[label], 'translate')}</span></span>`;
  const entries = [
    component.showLimited ? entry('limited', '#000000', component.limitedLabel) : '',
    component.showClearance ? entry('clearance', '#000000', component.clearanceLabel) : '',
  ].join('');
  // RTL target language: dir="rtl" flips the legend to read right-to-left —
  // entries pack from the right edge and each entry's icon leads on the right.
  // Must mirror the canvas PreviewLegend.
  const dirAttr = isRTLTargetLanguage(options.language) ? ' dir="rtl"' : '';
  return `
    <div${dirAttr}
      class="builder-component builder-legend builder-legend-${component.layout === 'vertical' ? 'vertical' : 'horizontal'}"
      style="
        left: ${pt(options.x ?? component.x)};
        top: ${pt(options.y ?? component.y)};
        width: ${pt(component.width)};
        font-size: ${pt(component.fontSize, 10)};
        line-height: ${BUILDER_LINE_HEIGHT_MULTIPLIER};
      "
    >${entries}</div>`;
};

const componentHtml = (component: BuilderComponent, options: {
  x?: number;
  y?: number;
  includeCategoryIcons?: boolean;
  // Map of originalText -> translatedText. When present, translatable string
  // fields render in the target language; missing keys fall back to English.
  // Only the text component honours this map in Slice 1; later slices extend
  // form-field-group, section-table, etc.
  translations?: Record<string, string>;
  language?: string;
  inventoryTranslations?: {
    categories: Record<number, string>;
    foodItems: Record<number, string>;
  };
  // B3: current Global Limit value, threaded to section tables.
  globalLimit?: number | null;
} = {}) => {
  switch (component.type) {
    case 'text':
      return textComponentHtml(component, options);
    case 'form-field-group':
      return formFieldComponentHtml(component, {
        x: options.x,
        y: options.y,
        translations: options.translations,
        language: options.language,
      });
    case 'section-table':
      return sectionTableComponentHtml(component, {
        x: options.x,
        y: options.y,
        includeCategoryIcons: options.includeCategoryIcons,
        language: options.language,
        translations: options.translations,
        inventoryTranslations: options.inventoryTranslations,
        globalLimit: options.globalLimit,
      });
    case 'line':
      return lineComponentHtml(component, options);
    case 'date':
      return dateComponentHtml(component, {
        x: options.x,
        y: options.y,
        translations: options.translations,
      });
    case 'language-tag':
      return languageTagComponentHtml(component, {
        x: options.x,
        y: options.y,
        language: options.language,
      });
    case 'legend':
      return legendComponentHtml(component, {
        x: options.x,
        y: options.y,
        translations: options.translations,
        language: options.language,
      });
    default:
      throw createRouteError('Unsupported builder component type.');
  }
};

const builderPageHtml = (
  template: ShoppingListBuilderTemplate,
  pageIndex: number,
  flowPlan: FlowingTablePlan,
  translations?: Record<string, string>,
  language?: string,
  inventoryTranslations?: {
    categories: Record<number, string>;
    foodItems: Record<number, string>;
  },
  globalLimit?: number | null,
) => {
  const includeCategoryIcons = getTemplateIncludeCategoryIcons(template);

  return `
  <section
    class="builder-page"
    style="
      width: ${pt(template.paper.width)};
      height: ${pt(template.paper.height)};
    "
  >
    ${template.components
    .filter((component) => {
      // Body components handled by the plan (flowing-table segments OR
      // sequence-flow placements) are emitted below; skip them here so we
      // don't render them at their stale stored x/y.
      if (flowPlan.plannedBodyComponentIds.has(component.id)) {
        return false;
      }
      const region = getComponentRegion(component);
      if (region === 'header' || region === 'footer') {
        return shouldRenderHeaderFooterOnPage(component, pageIndex);
      }
      // Non-planned body components (Freeform-mode non-flowing components)
      // still render only on page 0 from their stored coordinates.
      return pageIndex === 0;
    })
    .map((component) => componentHtml(component, { includeCategoryIcons, translations, language, inventoryTranslations, globalLimit }))
    .join('\n')}
    ${flowPlan.bodyPlacements
    .filter((placement) => placement.pageIndex === pageIndex)
    .map((placement) => {
      const component = template.components.find((c) => c.id === placement.componentId);
      return component ? componentHtml(component, {
        x: placement.x,
        y: placement.y,
        includeCategoryIcons,
        translations,
        language,
        inventoryTranslations,
        globalLimit,
      }) : '';
    })
    .join('\n')}
    ${flowPlan.segments
    .filter((segment) => segment.pageIndex === pageIndex)
    .map((segment) => sectionTableComponentHtml(segment.component, {
      rows: segment.rows,
      x: segment.x,
      y: segment.y,
      includeCategoryIcons,
      language,
      translations,
      inventoryTranslations,
      rowHeights: segment.rowHeights,
      globalLimit,
    }))
    .join('\n')}
  </section>`;
};

const builderPreviewHtml = async (
  template: ShoppingListBuilderTemplate,
  translations?: Record<string, string>,
  inventoryTranslations?: {
    categories: Record<number, string>;
    foodItems: Record<number, string>;
  },
  targetLanguage?: string,
  // Render-time print-mode override. When provided this beats
  // `template.printMode`, which lets the bulk-export modal opt a
  // single-sided saved template into two-sided printing for the duration
  // of one render without mutating the saved template.
  printModeOverride?: BuilderPrintMode,
  // B3: current Global Limit value, used as the Limit-cell fallback for
  // no-limit rows in tables that opt into `showGlobalLimit`.
  globalLimit?: number | null,
) => {
  // Inline the CJK Noto fonts only when the target language actually
  // needs them. Skips the ~36 MB base64 payload for English / Latin /
  // RTL renders.
  const fontCss = await getBuilderFontCss(isCJKTargetLanguage(targetLanguage));
  const brand = await printBrand();
  const flowPlan = createFlowingTablePlan(
    template,
    translations || inventoryTranslations
      ? { language: targetLanguage, translations, inventoryTranslations }
      : undefined,
  );
  const pageHtml = Array.from({ length: flowPlan.pageCount }, (_, pageIndex) => (
    builderPageHtml(template, pageIndex, flowPlan, translations, targetLanguage, inventoryTranslations, globalLimit)
  )).join('\n');
  const effectivePrintMode = resolveEffectivePrintMode(template, printModeOverride);
  const pages = shouldDuplicatePagesForPrint(effectivePrintMode, flowPlan.pageCount)
    ? `${pageHtml}\n${pageHtml}`
    : pageHtml;

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(template.name || `${brand.config.identity.appName} Shopping List`)}</title>
        <meta name="author" content="${escapeHtml(brand.config.identity.organizationName)}" />
        <style>
          ${fontCss}

          @page {
            size: ${pt(template.paper.width)} ${pt(template.paper.height)};
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            width: ${pt(template.paper.width)};
            min-height: ${pt(template.paper.height)};
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #000000;
            font-family: ${BUILDER_HTML_FONT_STACK};
          }

          .builder-page {
            position: relative;
            overflow: hidden;
            background: #ffffff;
            color: #000000;
            page-break-after: always;
            break-after: page;
          }

          .builder-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }

          .builder-component {
            position: absolute;
            color: #000000;
            font-family: ${BUILDER_HTML_FONT_STACK};
            unicode-bidi: plaintext;
            white-space: pre-wrap;
            overflow-wrap: break-word;
          }

          .builder-form-fields,
          .builder-section-table {
            white-space: normal;
          }

          .builder-form-row {
            display: grid;
          }

          .builder-form-row-separator {
            border-top: 0.45pt solid #a8a8a8;
          }

          .builder-form-label {
            padding: ${BUILDER_CELL_VERTICAL_PADDING_PT}pt 3pt;
            line-height: ${BUILDER_LINE_HEIGHT_MULTIPLIER};
            white-space: pre-wrap;
            overflow-wrap: break-word;
            unicode-bidi: plaintext;
          }

          .builder-form-value {
            /* Physical border whose edge is chosen by the table's direction
               via the [dir="rtl"] override below. A logical
               border-inline-start would resolve against the CELL's own
               direction instead; the adjacent label cells carry dir="auto"
               + unicode-bidi:plaintext, so an LTR label would flip the
               divider to the wrong edge. */
            border-left: 0.45pt solid #a8a8a8;
          }

          [dir="rtl"] .builder-form-value {
            border-left: 0;
            border-right: 0.45pt solid #a8a8a8;
          }

          /* A1 (forms): hide the vertical label|value divider. !important
             beats both the base rule and the [dir="rtl"] override above
             regardless of source order. */
          .builder-form-no-dividers .builder-form-value {
            border-left: 0 !important;
            border-right: 0 !important;
          }

          /* A3 (forms): hide the horizontal row separators. */
          .builder-form-no-borders .builder-form-row-separator {
            border-top: 0;
          }

          .builder-table-header {
            display: grid;
            border-bottom: 0.45pt solid #b9b9b9;
            background: #ffffff;
            font-weight: 700;
            text-align: center;
          }

          .builder-table-header-title,
          .builder-table-header-cell {
            align-items: center;
            display: flex;
            justify-content: center;
            line-height: ${BUILDER_LINE_HEIGHT_MULTIPLIER};
            padding: ${BUILDER_CELL_VERTICAL_PADDING_PT}pt 4pt;
            unicode-bidi: plaintext;
            white-space: pre-wrap;
            overflow-wrap: break-word;
          }

          .builder-table-header-title {
            flex-direction: column;
          }

          .builder-table-header-title-icon {
            align-items: flex-start;
            /* Logical alignment so the icon + title sit at the inline-start
               edge in both LTR and RTL renders. */
            text-align: start;
          }

          .builder-table-title-line {
            align-items: center;
            display: inline-flex;
            gap: 2ch;
            max-width: 100%;
          }

          .builder-table-title-line > span {
            min-width: 0;
            white-space: pre-wrap;
          }

          .builder-category-icon {
            flex: 0 0 auto;
            height: 1em;
            width: 1em;
          }

          .builder-table-header-title-tagged {
            line-height: ${BUILDER_TAGGED_HEADER_LINE_HEIGHT_MULTIPLIER};
            padding-bottom: 0;
            padding-top: 0;
          }

          .builder-table-category-limit {
            display: block;
            font-style: italic;
            font-weight: 400;
            line-height: ${BUILDER_TAGGED_HEADER_LINE_HEIGHT_MULTIPLIER};
          }

          .builder-table-header-title-icon .builder-table-category-limit {
            padding-inline-start: calc(1em + 3ch);
          }

          .builder-table-row {
            display: grid;
            border-bottom: 0.45pt solid #cfcfcf;
          }

          .builder-table-row-last {
            border-bottom: 0;
          }

          .builder-table-cell-left-border {
            /* Physical border whose edge is chosen by the table's direction
               via the [dir="rtl"] overrides below -- NOT a logical
               border-inline-start. The Limit/Want cells carry dir="auto" +
               unicode-bidi:plaintext for text shaping, so a logical border
               would resolve against each cell's own content direction (a
               digit limit value or an untranslated "Limit" header reads as
               LTR) and stack both dividers on the same side. The class name
               is kept for continuity. */
            border-left: 0.45pt solid #cfcfcf;
          }

          [dir="rtl"] .builder-table-cell-left-border {
            border-left: 0;
            border-right: 0.45pt solid #cfcfcf;
          }

          .builder-table-header .builder-table-cell-left-border {
            border-left-color: #b9b9b9;
          }

          [dir="rtl"] .builder-table-header .builder-table-cell-left-border {
            border-right-color: #b9b9b9;
          }

          /* A1/A3 toggles: root modifier classes null out the dividers /
             borders. !important on the dividers beats the [dir="rtl"]
             border-right rule above regardless of source order. */
          .builder-table-no-dividers .builder-table-cell-left-border {
            border-left: 0 !important;
            border-right: 0 !important;
          }

          .builder-table-no-borders .builder-table-header {
            border-bottom: 0;
          }

          .builder-table-no-borders .builder-table-row {
            border-bottom: 0;
          }

          .builder-table-text-cell {
            padding: ${BUILDER_CELL_VERTICAL_PADDING_PT}pt 4pt;
            line-height: ${BUILDER_LINE_HEIGHT_MULTIPLIER};
            white-space: pre-wrap;
            overflow-wrap: break-word;
            unicode-bidi: plaintext;
          }

          .builder-table-center {
            text-align: center;
          }

          /* A6: per-row empty checkbox in the Want column. */
          .builder-table-want-cell {
            align-items: center;
            display: flex;
            justify-content: center;
          }

          .builder-want-checkbox {
            border: 0.5pt solid #555555;
            border-radius: 1pt;
            display: inline-block;
            height: 9pt;
            width: 9pt;
          }

          /* A2: status icons leading the item text. The cell becomes flex so
             the text wraps in the width the planner reserved (statusIconRow
             Overhead). */
          .builder-table-item-cell {
            align-items: flex-start;
            display: flex;
            gap: 3pt;
          }

          .builder-status-icons {
            align-items: center;
            display: inline-flex;
            flex: 0 0 auto;
            gap: 2pt;
            line-height: 1;
          }

          .builder-status-icon {
            height: 1em;
            width: 1em;
          }

          .builder-item-text {
            min-width: 0;
            overflow-wrap: break-word;
            white-space: pre-wrap;
          }

          /* A4: Legend component (reuses .builder-status-icon sizing). */
          .builder-legend {
            display: flex;
          }

          .builder-legend-horizontal {
            align-items: center;
            column-gap: 16pt;
            flex-direction: row;
            flex-wrap: wrap;
            row-gap: 3pt;
          }

          .builder-legend-vertical {
            flex-direction: column;
            row-gap: 3pt;
          }

          .builder-legend-entry {
            align-items: center;
            display: inline-flex;
            gap: 3pt;
          }

          .builder-line {
            background: #000000;
          }
        </style>
      </head>
      <body>${pages}</body>
    </html>`;
};

const renderBuilderTemplateToPdf = async (
  template: ShoppingListBuilderTemplate,
  translations?: Record<string, string>,
  inventoryTranslations?: {
    categories: Record<number, string>;
    foodItems: Record<number, string>;
  },
  targetLanguage?: string,
  printModeOverride?: BuilderPrintMode,
  globalLimit?: number | null,
) => {
  const html = await builderPreviewHtml(
    template,
    translations,
    inventoryTranslations,
    targetLanguage,
    printModeOverride,
    globalLimit,
  );
  // Shared Chromium lifecycle (services/pdf/chromium). The 120s
  // protocolTimeout is required for the ~36 MB Noto Sans CJK fonts to
  // parse + embed; English / Latin / RTL renders still finish in a couple
  // of seconds and don't pay the higher ceiling.
  return renderHtmlToPdf(html, {
    width: '8.5in',
    height: '11in',
    protocolTimeout: 120000,
  });
};

/**
 * Extract every translatable string from a builder template.
 *
 * This helper is the single source of truth for builder strings that use the
 * generic Generated (List) cache. Inventory-backed Category/FoodItem names are
 * intentionally excluded because they read from their denormalized translation
 * tables instead.
 *
 * Trimmed-blank strings are omitted (no point translating empty content);
 * duplicates are preserved at this stage and de-duplicated downstream by
 * the translation service so callers can correlate string -> component if
 * they need to.
 */
export const extractBuilderTranslatableStrings = (
  template: ShoppingListBuilderTemplate,
): string[] => {
  const strings: string[] = [];
  const pushIfNeeded = (value: string | undefined | null, mode: BuilderTranslationMode | undefined) => {
    const resolvedMode = mode ?? 'translate';
    if (resolvedMode === 'skip') return;
    const text = typeof value === 'string' ? value : '';
    if (text.trim().length > 0) {
      strings.push(text);
    }
  };

  for (const component of template.components) {
    if (component.type === 'text') {
      // Per-component opt-out: components in `skip` mode never contribute
      // strings to preflight or render-time substitution. `translate` and
      // `translate-with-original` both need a cache lookup. Default
      // (undefined) is 'translate' so legacy templates behave as before.
      pushIfNeeded(component.content, component.translationMode);
      continue;
    }

    if (component.type === 'form-field-group') {
      for (const field of component.fields) {
        pushIfNeeded(field.label, field.translationMode);
      }
      continue;
    }

    if (component.type === 'section-table') {
      const settings = resolveSectionTableTranslationSettings(component.translationSettings);
      if (component.showLimit) {
        pushIfNeeded(component.limitHeader || 'Limit', settings.headers);
      }
      if (component.showWant !== false) {
        pushIfNeeded(component.wantHeader || 'Want', settings.headers);
      }

      const categoryLimitTag = formatCategoryLimitTag(component.categoryLimit, component.categoryLimitType);
      if (categoryLimitTag) {
        pushIfNeeded(`(${categoryLimitTag})`, settings.tags);
      }

      // Inventory-backed section tables resolve their title (Category name)
      // and row items (FoodItem names) from the denormalized
      // CategoryTranslation / FoodItemTranslation tables -- see
      // extractInventoryTranslationIds. Base-component section tables have
      // user-typed titles and row items, so those route through the
      // Generated (List) cache like text-component and form-field strings.
      if (!component.inventorySource) {
        pushIfNeeded(component.title, settings.headers);
        for (const row of component.rows) {
          pushIfNeeded(row.item, settings.rows);
        }
      }
      continue;
    }

    if (component.type === 'date') {
      const resolved = resolveDateInstance(component);
      const formatted = formatBuilderDateString(resolved, component.formatId ?? 'long-ordinal');
      pushIfNeeded(formatted, component.translationMode);
    }

    if (component.type === 'legend') {
      // A4: legend labels translate via the Generated (List) cache.
      if (component.showLimited) pushIfNeeded(component.limitedLabel, 'translate');
      if (component.showClearance) pushIfNeeded(component.clearanceLabel, 'translate');
    }
  }
  return strings;
};

const extractInventoryTranslationIds = (template: ShoppingListBuilderTemplate): {
  // id -> English name. The English name is needed so we can fall back to
  // the generic `Translation` table (which is keyed by originalText) when
  // the denormalized CategoryTranslation / FoodItemTranslation tables have
  // a gap.
  categories: Map<number, string>;
  foodItems: Map<number, string>;
} => {
  const categories = new Map<number, string>();
  const foodItems = new Map<number, string>();

  for (const component of template.components) {
    if (component.type !== 'section-table' || !component.inventorySource?.categoryId) continue;
    const settings = resolveSectionTableTranslationSettings(component.translationSettings);
    const headerMode = settings.headers ?? 'translate';
    const rowMode = settings.rows ?? 'translate';

    if (headerMode !== 'skip') {
      categories.set(
        component.inventorySource.categoryId,
        component.inventorySource.categoryName ?? component.title,
      );
    }

    if (rowMode !== 'skip') {
      for (const row of component.rows) {
        if (typeof row.foodItemId === 'number' && Number.isFinite(row.foodItemId)) {
          foodItems.set(row.foodItemId, row.item);
        }
      }
    }
  }

  return { categories, foodItems };
};

const lookupInventoryBuilderTranslations = async (
  template: ShoppingListBuilderTemplate,
  targetLanguage: string,
): Promise<{
  categories: Record<number, string>;
  foodItems: Record<number, string>;
}> => {
  const { categories, foodItems } = extractInventoryTranslationIds(template);
  const categoryIds = Array.from(categories.keys());
  const foodItemIds = Array.from(foodItems.keys());

  // Primary lookup: the denormalized CategoryTranslation / FoodItemTranslation
  // tables that the translation-trigger service maintains.
  const [categoryRows, foodItemRows] = await Promise.all([
    categoryIds.length > 0
      ? prisma.categoryTranslation.findMany({
        where: { categoryId: { in: categoryIds }, language: targetLanguage },
      })
      : Promise.resolve([]),
    foodItemIds.length > 0
      ? prisma.foodItemTranslation.findMany({
        where: { foodItemId: { in: foodItemIds }, language: targetLanguage },
      })
      : Promise.resolve([]),
  ]);

  const categoryResult: Record<number, string> = Object.fromEntries(
    categoryRows.map((row) => [row.categoryId, row.name]),
  );
  const foodItemResult: Record<number, string> = Object.fromEntries(
    foodItemRows.map((row) => [row.foodItemId, row.name]),
  );

  // Fallback: the denormalized tables can have gaps -- e.g. a translation
  // added before a language was enabled, or via a path that only wrote the
  // generic `Translation` table. For any inventory id still missing, look up
  // the generic `Translation` cache by the English name (its `originalText`
  // key) and `type` 'Category' / 'FoodItem'. The generic table is the
  // source of truth the trigger writes first, so it is the right backstop.
  const missingCategoryNames = categoryIds
    .filter((id) => !(id in categoryResult))
    .map((id) => categories.get(id))
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
  const missingFoodItemNames = foodItemIds
    .filter((id) => !(id in foodItemResult))
    .map((id) => foodItems.get(id))
    .filter((name): name is string => typeof name === 'string' && name.length > 0);

  const [genericCategoryRows, genericFoodItemRows] = await Promise.all([
    missingCategoryNames.length > 0
      ? prisma.translation.findMany({
        where: {
          originalText: { in: Array.from(new Set(missingCategoryNames)) },
          language: targetLanguage,
          type: 'Category',
          status: 'completed',
        },
        select: { originalText: true, translatedText: true },
      })
      : Promise.resolve([]),
    missingFoodItemNames.length > 0
      ? prisma.translation.findMany({
        where: {
          originalText: { in: Array.from(new Set(missingFoodItemNames)) },
          language: targetLanguage,
          type: 'FoodItem',
          status: 'completed',
        },
        select: { originalText: true, translatedText: true },
      })
      : Promise.resolve([]),
  ]);

  const genericCategoryByName = new Map(
    genericCategoryRows
      .filter((row) => typeof row.translatedText === 'string' && row.translatedText.length > 0)
      .map((row) => [row.originalText, row.translatedText as string]),
  );
  const genericFoodItemByName = new Map(
    genericFoodItemRows
      .filter((row) => typeof row.translatedText === 'string' && row.translatedText.length > 0)
      .map((row) => [row.originalText, row.translatedText as string]),
  );

  for (const id of categoryIds) {
    if (id in categoryResult) continue;
    const name = categories.get(id);
    const translated = name ? genericCategoryByName.get(name) : undefined;
    if (translated) categoryResult[id] = translated;
  }
  for (const id of foodItemIds) {
    if (id in foodItemResult) continue;
    const name = foodItems.get(id);
    const translated = name ? genericFoodItemByName.get(name) : undefined;
    if (translated) foodItemResult[id] = translated;
  }

  return { categories: categoryResult, foodItems: foodItemResult };
};

router.get('/components', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const components = await prisma.shoppingListBuilderComponent.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ components: components.map(serializeSavedComponent) });
  } catch (error) {
    return next(error);
  }
});

router.post('/components', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const { name, component } = req.body as SaveBuilderComponentRequest;
    const savedName = validateSavedComponentName(name);
    const componentData = component as BuilderComponent;
    validateBuilderComponent(componentData);

    const existingByName = await findSavedComponentByName(savedName);
    if (existingByName) {
      const savedComponent = await prisma.shoppingListBuilderComponent.update({
        where: { id: existingByName.id },
        data: {
          name: savedName,
          componentType: componentData.type,
          componentData: componentData as unknown as Prisma.InputJsonValue,
        },
      });

      res.json({ component: serializeSavedComponent(savedComponent) });
      return;
    }

    const savedComponent = await prisma.shoppingListBuilderComponent.create({
      data: {
        name: savedName,
        componentType: componentData.type,
        componentData: componentData as unknown as Prisma.InputJsonValue,
      },
    });

    res.status(201).json({ component: serializeSavedComponent(savedComponent) });
  } catch (error) {
    return next(error);
  }
});

router.put('/components/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const id = parseIdParam(req.params.id, 'Invalid saved component ID.');
    const { name, component } = req.body as SaveBuilderComponentRequest;
    const existing = await prisma.shoppingListBuilderComponent.findFirst({
      where: { id },
    });

    if (!existing) {
      throw createRouteError('Saved component not found.', 404);
    }

    const data: Prisma.ShoppingListBuilderComponentUpdateInput = {};
    if (name !== undefined) {
      const savedName = validateSavedComponentName(name);
      const conflict = await findSavedComponentByName(savedName, id);
      if (conflict) {
        throw createRouteError(
          `A saved component named "${savedName}" already exists. Choose a unique name or edit that saved component instead.`,
          409,
        );
      }
      data.name = savedName;
    }
    if (component !== undefined) {
      const componentData = component as BuilderComponent;
      validateBuilderComponent(componentData);
      data.componentType = componentData.type;
      data.componentData = componentData as unknown as Prisma.InputJsonValue;
    }

    const savedComponent = await prisma.shoppingListBuilderComponent.update({
      where: { id },
      data,
    });

    res.json({ component: serializeSavedComponent(savedComponent) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/components/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const id = parseIdParam(req.params.id, 'Invalid saved component ID.');
    const existing = await prisma.shoppingListBuilderComponent.findFirst({
      where: { id },
    });

    if (!existing) {
      throw createRouteError('Saved component not found.', 404);
    }

    await prisma.shoppingListBuilderComponent.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const templates = await prisma.shoppingListBuilderTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ templates: templates.map(serializeSavedTemplate) });
  } catch (error) {
    return next(error);
  }
});

router.post('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const { name, template } = req.body as SaveBuilderTemplateRequest;
    const savedName = validateSavedTemplateName(name);
    const templateData = template as ShoppingListBuilderTemplate;
    validateTemplate(templateData);

    const existingByName = await findSavedTemplateByName(savedName);
    if (existingByName) {
      const savedTemplate = await prisma.shoppingListBuilderTemplate.update({
        where: { id: existingByName.id },
        data: {
          name: savedName,
          templateData: templateData as unknown as Prisma.InputJsonValue,
        },
      });

      res.json({ template: serializeSavedTemplate(savedTemplate) });
      return;
    }

    const savedTemplate = await prisma.shoppingListBuilderTemplate.create({
      data: {
        name: savedName,
        templateData: templateData as unknown as Prisma.InputJsonValue,
      },
    });

    res.status(201).json({ template: serializeSavedTemplate(savedTemplate) });
  } catch (error) {
    return next(error);
  }
});

router.put('/templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const id = parseIdParam(req.params.id, 'Invalid saved template ID.');
    const { name, template } = req.body as SaveBuilderTemplateRequest;
    const existing = await prisma.shoppingListBuilderTemplate.findFirst({
      where: { id },
    });

    if (!existing) {
      throw createRouteError('Saved template not found.', 404);
    }

    const data: Prisma.ShoppingListBuilderTemplateUpdateInput = {};
    if (name !== undefined) {
      const savedName = validateSavedTemplateName(name);
      const conflict = await findSavedTemplateByName(savedName, id);
      if (conflict) {
        throw createRouteError(
          `A saved template named "${savedName}" already exists. Choose a unique name or apply that template instead.`,
          409,
        );
      }
      data.name = savedName;
    }
    if (template !== undefined) {
      const templateData = template as ShoppingListBuilderTemplate;
      validateTemplate(templateData);
      data.templateData = templateData as unknown as Prisma.InputJsonValue;
    }

    const savedTemplate = await prisma.shoppingListBuilderTemplate.update({
      where: { id },
      data,
    });

    res.json({ template: serializeSavedTemplate(savedTemplate) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const id = parseIdParam(req.params.id, 'Invalid saved template ID.');
    const existing = await prisma.shoppingListBuilderTemplate.findFirst({
      where: { id },
    });

    if (!existing) {
      throw createRouteError('Saved template not found.', 404);
    }

    await prisma.shoppingListBuilderTemplate.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/refresh-inventory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const template = req.body?.template as ShoppingListBuilderTemplate;
    validateTemplate(template);
    const refreshedTemplate = await refreshInventoryBackedTemplate(template);

    res.json({ template: refreshedTemplate });
  } catch (error) {
    return next(error);
  }
});

router.put('/inventory-items/:id/limit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const id = parseIdParam(req.params.id, 'Invalid food item ID.');
    const { limit } = req.body as UpdateInventoryLimitRequest;
    const parsedLimit = parseInventoryLimitValue(limit);

    const foodItem = await prisma.foodItem.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!foodItem) {
      throw createRouteError('Food item not found.', 404);
    }

    // Editing the limit here only sets the request cap; clearing it means
    // "No Limit" (the NO_LIMIT_SENTINEL value). The `isLimited` low-stock
    // status flag is intentionally NOT touched -- the two are independent
    // (ISSUES.md #39), so editing a cap in the builder must not flip the
    // item's stock badge. This keeps builder edits bidirectional with Food
    // Item Management without side effects.
    const updated = await prisma.foodItem.update({
      where: { id },
      data: { limit: parsedLimit == null ? NO_LIMIT_SENTINEL : parsedLimit },
      include: { category: true },
    });

    // Row-level effective limit only reflects the food item's own cap.
    // Category limits are surfaced in the section table title, not copied onto
    // each row.
    const itemLimit = updated.limit !== NO_LIMIT_SENTINEL ? updated.limit : null;

    res.json({
      foodItem: {
        id: updated.id,
        name: updated.name,
        limit: updated.limit,
        isLimited: updated.isLimited,
        effectiveLimit: itemLimit == null ? '' : String(itemLimit),
        limitSource: itemLimit == null ? 'none' : 'food-item',
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/inventory-sections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const categories = await prisma.category.findMany({
      include: {
        foodItems: {
          where: { isInStock: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            limit: true,
            isLimited: true,
            isClearance: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const sections = categories
      .filter((category) => category.foodItems.length > 0)
      .map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        itemCount: category.foodItems.length,
        component: buildInventorySectionComponent(category),
      }));

    res.json({ sections });
  } catch (error) {
    return next(error);
  }
});

router.post('/preview-pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const template = req.body?.template as ShoppingListBuilderTemplate;
    validateTemplate(template);
    const refreshedTemplate = await refreshInventoryBackedTemplate(template);

    // Optional render-time language parameter. When set, look up every
    // translatable string in the Translation cache and pass the resolved
    // map to the renderer. Missing translations silently fall back to
    // English -- the modal's pre-flight step is responsible for warning
    // the user about gaps; the server does not block PDF generation.
    const rawTargetLanguage = typeof req.body?.targetLanguage === 'string'
      ? req.body.targetLanguage.trim()
      : '';
    let translations: Record<string, string> | undefined;
    let inventoryTranslations: Awaited<ReturnType<typeof lookupInventoryBuilderTranslations>> | undefined;
    if (rawTargetLanguage.length > 0 && rawTargetLanguage.toLowerCase() !== 'english') {
      const candidateStrings = extractBuilderTranslatableStrings(refreshedTemplate);
      const [lookup, inventoryLookup] = await Promise.all([
        lookupBuilderTranslations(candidateStrings, rawTargetLanguage),
        lookupInventoryBuilderTranslations(refreshedTemplate, rawTargetLanguage),
      ]);
      translations = lookup.cached;
      inventoryTranslations = inventoryLookup;
    }

    // Optional render-time print-mode override. Bulk-export modal sends
    // `'two-sided-when-single-page'` so saved single-sided templates fan
    // out to two-sided PDFs only when the planner produced one page.
    const printModeOverride: BuilderPrintMode | undefined = isBuilderPrintMode(req.body?.printMode)
      ? req.body.printMode
      : undefined;

    // B3: resolve the current Global Limit only when a section table opts into
    // showing it, so the common case skips the extra query. The value is read
    // live (never baked into the template) so it always reflects the current
    // org-wide setting at export time.
    const needsGlobalLimit = refreshedTemplate.components.some(
      (component) => component.type === 'section-table' && component.showGlobalLimit !== false,
    );
    const globalLimit = needsGlobalLimit
      ? (await prisma.globalLimit.findFirst())?.value ?? DEFAULT_GLOBAL_LIMIT
      : undefined;

    const pdfBuffer = await renderBuilderTemplateToPdf(
      refreshedTemplate,
      translations,
      inventoryTranslations,
      rawTargetLanguage,
      printModeOverride,
      globalLimit,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="shopping-list-builder-preview.pdf"');
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    if (error instanceof Error && !('statusCode' in error)) {
      const routeError = createRouteError('Unable to create builder PDF preview. Check the canvas for invalid components, then try again.', 500);
      return next(routeError);
    }
    return next(error);
  }
});

/**
 * Pre-flight check: walk the template, extract translatable strings, and
 * report how many already have a cached translation in the target language
 * versus how many would need to be translated. Used by the Generate
 * Translated List modal step 2 to decide whether to show the "Translate
 * missing strings now" step.
 *
 * Body: { template: ShoppingListBuilderTemplate, targetLanguage: string }
 * Response: { totalStrings, cachedCount, missingStrings }
 */
router.post('/translation-preflight', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const template = req.body?.template as ShoppingListBuilderTemplate;
    validateTemplate(template);
    const targetLanguage = typeof req.body?.targetLanguage === 'string'
      ? req.body.targetLanguage.trim()
      : '';
    if (targetLanguage.length === 0) {
      return next(createRouteError('targetLanguage is required for translation-preflight.', 400));
    }

    const refreshedTemplate = await refreshInventoryBackedTemplate(template);
    const candidateStrings = extractBuilderTranslatableStrings(refreshedTemplate);
    // De-duplicate for the pre-flight count so the user sees "you have N
    // unique strings to translate", not "N component instances".
    const uniqueStrings = Array.from(new Set(candidateStrings));
    const [lookup, inventoryLookup] = await Promise.all([
      lookupBuilderTranslations(uniqueStrings, targetLanguage),
      lookupInventoryBuilderTranslations(refreshedTemplate, targetLanguage),
    ]);

    // Surface the cached translations alongside the counts so the canvas
    // language-preview can render with a single API call. Generate-time
    // callers ignore this field; preview-time callers use it to drive the
    // PreviewLanguageContext.
    const responseBody: {
      totalStrings: number;
      cachedCount: number;
      missingStrings: string[];
      cached: Record<string, string>;
      inventory?: {
        categories: Record<number, string>;
        foodItems: Record<number, string>;
      };
    } = {
      totalStrings: uniqueStrings.length,
      cachedCount: Object.keys(lookup.cached).length,
      missingStrings: lookup.missing,
      cached: lookup.cached,
    };
    if (Object.keys(inventoryLookup.categories).length > 0 || Object.keys(inventoryLookup.foodItems).length > 0) {
      responseBody.inventory = inventoryLookup;
    }
    res.json(responseBody);
  } catch (error) {
    if (error instanceof Error && !('statusCode' in error)) {
      const routeError = createRouteError('Unable to run translation pre-flight check.', 500);
      return next(routeError);
    }
    return next(error);
  }
});

/**
 * Fill the Translation cache for a list of strings in the target language.
 * Used by the Generate Translated List modal step 3 after pre-flight
 * reports missing translations. Synchronous: returns when the AI provider
 * call (or chain of batched calls) has completed and the cache is
 * populated. Errors propagate to the modal so the user can retry.
 *
 * Body: { strings: string[], targetLanguage: string }
 * Response: { translations: Record<originalText, translatedText> }
 */
/**
 * User-facing copy for each way a translation provider can fail.
 *
 * Every entry answers **503, never 502**. Production is served through
 * Cloudflare Tunnel, and Cloudflare replaces an origin 502 with its own
 * branded "Bad gateway" HTML page -- so curated JSON behind a 502 never
 * reached the browser, and the bulk-export modal printed Cloudflare's
 * document instead (ISSUES.md #80). 503 passes through untouched.
 *
 * `exhausted` and `misconfigured` both say plainly that retrying will not
 * help, because the failure they describe cannot resolve on its own. That
 * sentence is the whole point of separating them from `busy`: staff were
 * previously told to wait a minute for a depleted account, and would have
 * been told the same for a model the API key cannot call.
 */
const TRANSLATION_PROVIDER_ERRORS: Record<
  TranslationProviderFailure,
  { code: string; message: (language: string) => string }
> = {
  exhausted: {
    code: 'AI_TRANSLATION_QUOTA_EXHAUSTED',
    message: (language) =>
      `Translation into ${language} stopped because the AI provider says its quota or prepaid credits are used up. `
      + 'Retrying will not clear this. An administrator needs to restore the provider account or key in AI Configuration.',
  },
  'not-configured': {
    code: 'AI_TRANSLATION_NOT_CONFIGURED',
    message: (language) =>
      `FEED cannot translate into ${language} yet because no AI model is switched on. `
      + 'An administrator needs to open AI Configuration and activate a model, entering its '
      + 'API key first if this instance was restored from a backup.',
  },
  misconfigured: {
    code: 'AI_TRANSLATION_MISCONFIGURED',
    message: (language) =>
      `Translation into ${language} stopped: the AI provider rejected FEED's API key or the model it is set to use. `
      + 'Retrying will not help. An administrator needs to check the key and model in AI Configuration.',
  },
  busy: {
    code: 'AI_TRANSLATION_BUSY',
    message: (language) =>
      `The translation service is busy right now (high demand for ${language}). `
      + 'This is temporary -- wait about a minute, then click Generate again. No work was lost.',
  },
  unavailable: {
    code: 'AI_TRANSLATION_UNAVAILABLE',
    message: (language) =>
      `We couldn't translate this list into ${language}. The AI translation service didn't respond. `
      + 'Try again in a moment; if it keeps failing, check the AI provider settings in Translations.',
  },
};

const buildTranslationProviderError = (
  failure: TranslationProviderFailure,
  targetLanguage: string,
): AppRouteError => {
  const { code, message } = TRANSLATION_PROVIDER_ERRORS[failure];
  return createRouteError(message(targetLanguage), 503, code);
};

router.post('/translate-missing-strings', async (req: Request, res: Response, next: NextFunction) => {
  const targetLanguage = typeof req.body?.targetLanguage === 'string'
    ? req.body.targetLanguage.trim()
    : '';
  try {
    requireAuth(req);
    const rawStrings = req.body?.strings;
    if (!Array.isArray(rawStrings)) {
      return next(createRouteError('`strings` must be an array.', 400));
    }
    if (targetLanguage.length === 0) {
      return next(createRouteError('targetLanguage is required for translate-missing-strings.', 400));
    }
    const strings = rawStrings.filter((s): s is string => typeof s === 'string');

    const translations = await translateBuilderStrings(strings, targetLanguage);
    res.json({ translations });
  } catch (error) {
    if (error instanceof Error && !('statusCode' in error)) {
      const failure = classifyTranslationProviderError(error);
      return next(buildTranslationProviderError(failure, targetLanguage));
    }
    return next(error);
  }
});

// --- B1: Export Settings (org-wide shared singleton, no ownerId per #31) ---

interface ExportSettingsPayload {
  includeDate: boolean;
  datePosition: 'start' | 'end';
  includeTemplateName: boolean;
  includeLanguage: boolean;
  previewBaseName: string;
  translatedBaseName: string;
}

const EXPORT_SETTINGS_DEFAULTS: ExportSettingsPayload = {
  includeDate: true,
  datePosition: 'end',
  includeTemplateName: true,
  includeLanguage: true,
  previewBaseName: 'Shopping List',
  translatedBaseName: 'Shopping List',
};

const EXPORT_BASE_NAME_MAX = 80;

const sanitizeExportBaseName = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim().slice(0, EXPORT_BASE_NAME_MAX);
  return trimmed.length > 0 ? trimmed : fallback;
};

const normalizeExportSettings = (raw: any): ExportSettingsPayload => ({
  includeDate: raw?.includeDate !== false,
  datePosition: raw?.datePosition === 'start' ? 'start' : 'end',
  includeTemplateName: raw?.includeTemplateName !== false,
  includeLanguage: raw?.includeLanguage !== false,
  previewBaseName: sanitizeExportBaseName(raw?.previewBaseName, EXPORT_SETTINGS_DEFAULTS.previewBaseName),
  translatedBaseName: sanitizeExportBaseName(raw?.translatedBaseName, EXPORT_SETTINGS_DEFAULTS.translatedBaseName),
});

router.get('/export-settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const settings = await prisma.exportSettings.findFirst();
    res.json({ settings: settings ? normalizeExportSettings(settings) : { ...EXPORT_SETTINGS_DEFAULTS } });
  } catch (error) {
    return next(error);
  }
});

router.put('/export-settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAuth(req);
    const normalized = normalizeExportSettings(req.body);

    const saved = await prisma.exportSettings.upsert({
      where: { id: 1 },
      update: normalized,
      create: { id: 1, ...normalized },
    });

    res.json({ settings: normalizeExportSettings(saved) });
  } catch (error) {
    return next(error);
  }
});

export default router;
