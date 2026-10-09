// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';

import { BuilderTranslationMode } from './types';

/**
 * Inline-tag font size for the `translate-with-original` mode. Mirrors
 * `TEXT_ORIGINAL_TAG_FONT_SIZE_PT` in
 * `packages/backend/src/routes/shopping-list-builder.ts` so canvas
 * preview, modal preview, and Chromium PDF stay byte-aligned.
 */
export const BUILDER_TEXT_ORIGINAL_TAG_FONT_SIZE = 8;
// Conservative measure size for the bold 8pt English tag. Bumped from 8.5
// to 9.5pt after testing on macOS Chrome found 8.5pt undercounted certain
// Russian/Cyrillic + bold-Latin combinations (e.g. "Миндальное молоко" +
// "Almond Milk") that measured as fitting in headless puppeteer but
// rendered wider in real Chrome and wrapped to a 2nd line. The render
// still uses 8pt; only measurement is conservative. 9.5pt gives ~18%
// margin over the 8pt render, which covers per-glyph metric variance we
// have seen across browsers. Mirror with `TEXT_ORIGINAL_TAG_MEASURE_FONT_SIZE_PT`
// in `packages/backend/src/routes/shopping-list-builder.ts`.
export const BUILDER_TEXT_ORIGINAL_TAG_MEASURE_FONT_SIZE = 9.5;

/**
 * Shared translation-aware text renderer. Every mode mirrors the backend's
 * `translatedBuilderTextHtml` exactly so canvas, the per-component preview
 * modal, and the Chromium PDF all produce the same visual output.
 *
 *   - `skip` (or any mode when no cached translation):
 *       returns the original text. The component renders in English
 *       regardless of the active preview language.
 *
 *   - `translate`:
 *       returns the cached translation if present; otherwise the
 *       original (silent English fallback).
 *
 *   - `translate-with-original`:
 *       returns the translation followed by an inline 8pt bold tag with
 *       the English original (no literal carat or markdown sigils -- just
 *       the English text in 8pt bold, separated by a single space). On
 *       cache miss this falls back to the original alone because the tag
 *       would be redundant.
 *
 *   - `translate-with-original-block`:
 *       same as `translate-with-original` but the 8pt bold English tag is
 *       placed on its own line beneath the translation (block display)
 *       rather than inline. Same cache-miss fallback.
 *
 *   - `translate-with-original-adaptive`:
 *       same as `translate-with-original` but the 8pt bold English tag is an
 *       unbreakable inline unit (`white-space: nowrap`). It stays on the
 *       translation's last line when it fits there, and otherwise drops whole
 *       onto the next line -- it never wraps mid-tag. Same cache-miss fallback.
 */
function renderTranslationAwareText(
  originalContent: string,
  cachedTranslation: string | null | undefined,
  mode: BuilderTranslationMode,
): React.ReactNode {
  if (mode === 'skip' || !cachedTranslation) {
    return originalContent;
  }
  if (
    mode === 'translate-with-original'
    || mode === 'translate-with-original-block'
    || mode === 'translate-with-original-adaptive'
  ) {
    const block = mode === 'translate-with-original-block';
    const adaptive = mode === 'translate-with-original-adaptive';
    return (
      <>
        {cachedTranslation}
        {block ? null : ' '}
        <span
          style={{
            fontSize: BUILDER_TEXT_ORIGINAL_TAG_FONT_SIZE,
            fontWeight: 700,
            display: block ? 'block' : undefined,
            // Adaptive: the tag is one unbreakable unit, so the browser keeps
            // it on the current line if it fits and otherwise moves the whole
            // tag to the next line (binary placement -- no mid-tag wrap).
            whiteSpace: adaptive ? 'nowrap' : undefined,
          }}
        >
          {originalContent}
        </span>
      </>
    );
  }
  return cachedTranslation;
}

/**
 * Render the body of a text component in a translation-aware way.
 * Thin wrapper over {@link renderTranslationAwareText}.
 */
export function renderTextBody(
  originalContent: string,
  cachedTranslation: string | null,
  mode: BuilderTranslationMode,
): React.ReactNode {
  return renderTranslationAwareText(originalContent, cachedTranslation, mode);
}

/**
 * Render an inventory-backed or form-field string with the same translation
 * treatment used by text blocks. Thin wrapper over
 * {@link renderTranslationAwareText}.
 */
export function renderTranslatedBuilderText(
  originalContent: string,
  cachedTranslation: string | null | undefined,
  mode: BuilderTranslationMode,
): React.ReactNode {
  return renderTranslationAwareText(originalContent, cachedTranslation, mode);
}

/**
 * Canvas-wide preview-language state. Set by the Page Setup panel's
 * language picker; consumed by `PreviewText` (and, in future slices,
 * `PreviewSectionTable`, `PreviewFormFields`, etc.) so the entire canvas
 * can render in a chosen target language while staff design the
 * template.
 *
 * `language === ''` means "no preview / render English". When non-empty,
 * `translations` is a map of originalText -> translatedText populated
 * by a one-shot preflight call against the active template.
 *
 * This state is **not persisted** with the template -- it's a view-only
 * setting that resets when the builder is re-opened. Per-component
 * `translationMode` (which governs whether the canvas actually applies
 * the cached translation) IS persisted; see types.ts.
 */
export interface PreviewLanguageContextValue {
  language: string;
  translations: Record<string, string>;
  inventoryTranslations?: {
    categories: Record<number, string>;
    foodItems: Record<number, string>;
  };
  // B3: current org-wide Global Limit value. Used by section tables that opt
  // into `showGlobalLimit` as the Limit-cell fallback for no-limit rows.
  // Resolved live (fetched by the builder), never baked into the template.
  globalLimit?: number;
}

export const PreviewLanguageContext = React.createContext<PreviewLanguageContextValue>({
  language: '',
  translations: {},
  inventoryTranslations: {
    categories: {},
    foodItems: {},
  },
});

export const usePreviewLanguage = (): PreviewLanguageContextValue =>
  React.useContext(PreviewLanguageContext);

/**
 * True when a language name is written right-to-left. Mirrors
 * `RTL_LANGUAGE_PATTERNS` / `isRTLTargetLanguage` in
 * `packages/backend/src/routes/shopping-list-builder.ts`. When the active
 * preview language is RTL, section tables and form-field groups render
 * with `dir="rtl"`, which reverses their grid column order
 * (Category | Limit | Want -> Want | Limit | Category) and flips text
 * alignment. Currently scoped to the enabled RTL languages (Arabic and
 * Persian/Farsi); extend the pattern list when Hebrew / Urdu are enabled.
 */
const RTL_LANGUAGE_PATTERNS: RegExp[] = [
  /arabic/i,
  /persian/i,
  /farsi/i,
];

export const isRTLLanguage = (language?: string | null): boolean => {
  if (!language || typeof language !== 'string') return false;
  return RTL_LANGUAGE_PATTERNS.some((re) => re.test(language));
};
