// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EXPORT_SETTINGS,
  ExportSettings,
  buildExportFilename,
  buildExportFilenameStem,
  exportDateStamp,
} from './export-filename';

const NOW = new Date(2026, 4, 22, 9, 5); // 2026-05-22 09:05 local

describe('exportDateStamp', () => {
  it('zero-pads to YYYY-MM-DD_HHmm', () => {
    expect(exportDateStamp(NOW)).toBe('2026-05-22_0905');
  });
});

describe('buildExportFilenameStem', () => {
  it('assembles base + template + language with date at end (defaults)', () => {
    expect(
      buildExportFilenameStem(DEFAULT_EXPORT_SETTINGS, {
        kind: 'preview',
        templateName: 'Weekly Pantry',
        language: 'English',
        now: NOW,
      }),
    ).toBe('Shopping List Weekly Pantry English 2026-05-22_0905');
  });

  it('moves the date to the front when datePosition is start', () => {
    const settings: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS, datePosition: 'start' };
    expect(
      buildExportFilenameStem(settings, { kind: 'preview', templateName: 'Pantry', now: NOW }),
    ).toBe('2026-05-22_0905 Shopping List Pantry');
  });

  it('omits disabled tokens', () => {
    const settings: ExportSettings = {
      ...DEFAULT_EXPORT_SETTINGS,
      includeDate: false,
      includeTemplateName: false,
      includeLanguage: false,
    };
    expect(
      buildExportFilenameStem(settings, { kind: 'preview', templateName: 'Pantry', language: 'Spanish' }),
    ).toBe('Shopping List');
  });

  it('uses translatedBaseName for the translated kind', () => {
    const settings: ExportSettings = {
      ...DEFAULT_EXPORT_SETTINGS,
      includeDate: false,
      translatedBaseName: 'Lista',
    };
    expect(
      buildExportFilenameStem(settings, { kind: 'translated', templateName: 'Pantry', language: 'Spanish' }),
    ).toBe('Lista Pantry Spanish');
  });

  it('drops the template token when it duplicates the base name', () => {
    const settings: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS, includeDate: false, includeLanguage: false };
    expect(
      buildExportFilenameStem(settings, { kind: 'preview', templateName: 'shopping list' }),
    ).toBe('Shopping List');
  });

  it('strips filesystem-unsafe characters', () => {
    const settings: ExportSettings = {
      ...DEFAULT_EXPORT_SETTINGS,
      includeDate: false,
      includeLanguage: false,
      previewBaseName: 'List/Name: v2*',
    };
    expect(
      buildExportFilenameStem(settings, { kind: 'preview', templateName: 'A & B' }),
    ).toBe('ListName v2 A B');
  });
});

describe('buildExportFilename', () => {
  it('appends the .pdf extension', () => {
    const settings: ExportSettings = {
      ...DEFAULT_EXPORT_SETTINGS,
      includeDate: false,
      includeTemplateName: false,
      includeLanguage: false,
    };
    expect(buildExportFilename(settings, { kind: 'preview' })).toBe('Shopping List.pdf');
  });
});
