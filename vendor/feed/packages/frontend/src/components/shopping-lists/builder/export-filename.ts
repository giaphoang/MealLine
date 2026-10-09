// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * B1 — Export Settings. Org-wide shared configuration for the filenames of
 * exported shopping-list PDFs. Because PDF downloads are triggered in the
 * browser (JS sets `link.download`), the filename is assembled client-side
 * from these settings rather than by the backend.
 */
export interface ExportSettings {
  /** Include a date stamp in the filename. */
  includeDate: boolean;
  /** Where the date stamp goes relative to the base name. */
  datePosition: 'start' | 'end';
  /** Include the saved template's name in the filename. */
  includeTemplateName: boolean;
  /** Include the (English) language name in the filename. */
  includeLanguage: boolean;
  /** Base name for single/preview PDF downloads. */
  previewBaseName: string;
  /** Base name for translated (Translate & Generate) PDF downloads. */
  translatedBaseName: string;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  includeDate: true,
  datePosition: 'end',
  includeTemplateName: true,
  includeLanguage: true,
  previewBaseName: 'Shopping List',
  translatedBaseName: 'Shopping List',
};

export const EXPORT_BASE_NAME_MAX = 80;
const FILENAME_STEM_MAX = 120;

/**
 * Local server-time date stamp `YYYY-MM-DD_HHmm`. Uses the user's local
 * clock (the deployment is single-site), zero-padded for sortability.
 */
export const exportDateStamp = (date: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${y}-${mo}-${d}_${h}${mi}`;
};

/**
 * Collapse a free-text fragment into a filesystem-safe token: keep letters,
 * digits, spaces, hyphens; collapse whitespace runs to single spaces; trim.
 * Returns '' for fragments that reduce to nothing.
 */
const safeFragment = (value: string): string =>
  value
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

export interface BuildExportFilenameOptions {
  kind: 'preview' | 'translated';
  /** Saved template name (used when includeTemplateName is on). */
  templateName?: string;
  /** English language name (used when includeLanguage is on, e.g. "Spanish"). */
  language?: string;
  /** Override clock for deterministic tests. */
  now?: Date;
}

/**
 * Assemble the download filename stem (no extension) from the configured
 * export settings. Token order: [date?] base [template?] [language?], with
 * the date moved to the front when `datePosition === 'start'`.
 */
export const buildExportFilenameStem = (
  settings: ExportSettings,
  options: BuildExportFilenameOptions,
): string => {
  const base = options.kind === 'translated'
    ? settings.translatedBaseName
    : settings.previewBaseName;

  const core: string[] = [];
  const baseFragment = safeFragment(base);
  if (baseFragment) core.push(baseFragment);

  if (settings.includeTemplateName && options.templateName) {
    const tpl = safeFragment(options.templateName);
    if (tpl && tpl.toLowerCase() !== baseFragment.toLowerCase()) core.push(tpl);
  }

  if (settings.includeLanguage && options.language) {
    const lang = safeFragment(options.language);
    if (lang) core.push(lang);
  }

  const tokens: string[] = [];
  if (settings.includeDate && settings.datePosition === 'start') {
    tokens.push(exportDateStamp(options.now));
  }
  tokens.push(...core);
  if (settings.includeDate && settings.datePosition === 'end') {
    tokens.push(exportDateStamp(options.now));
  }

  const stem = tokens.join(' ').trim().slice(0, FILENAME_STEM_MAX).trim();
  return stem || 'Shopping List';
};

/** Convenience wrapper that appends the `.pdf` extension. */
export const buildExportFilename = (
  settings: ExportSettings,
  options: BuildExportFilenameOptions,
): string => `${buildExportFilenameStem(settings, options)}.pdf`;
