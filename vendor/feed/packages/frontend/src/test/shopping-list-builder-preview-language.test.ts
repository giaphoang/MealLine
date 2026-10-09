// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it } from 'vitest';

import {
  mergePreviewTranslations,
  resolvePreviewTranslationPreflight,
} from '@/components/shopping-lists/builder/preview-language';
import {
  resolveBuilderLanguageTagText,
} from '@/components/shopping-lists/builder/types';

describe('shopping list builder preview language preflight', () => {
  it('allows the preview canvas to use cached translations when no strings are missing', () => {
    const decision = resolvePreviewTranslationPreflight({
      cached: {
        'Please turn paper over': 'Por favor, voltee el papel',
      },
      missingStrings: [],
    });

    expect(decision).toEqual({
      status: 'ready',
      translations: {
        'Please turn paper over': 'Por favor, voltee el papel',
      },
    });
  });

  it('requires an update decision when the selected preview language is missing translations', () => {
    const decision = resolvePreviewTranslationPreflight({
      cached: {
        'Please turn paper over': 'Por favor, voltee el papel',
      },
      missingStrings: ['We have no eggs'],
    });

    expect(decision).toEqual({
      status: 'missing',
      cached: {
        'Please turn paper over': 'Por favor, voltee el papel',
      },
      missingStrings: ['We have no eggs'],
    });
  });

  it('keeps cache hits while applying newly translated preview strings', () => {
    expect(
      mergePreviewTranslations(
        {
          'Please turn paper over': 'Por favor, voltee el papel',
        },
        {
          'We have no eggs': 'No tenemos huevos',
        },
      ),
    ).toEqual({
      'Please turn paper over': 'Por favor, voltee el papel',
      'We have no eggs': 'No tenemos huevos',
    });
  });

  it('resolves language tag labels for English, native, and combined modes', () => {
    expect(resolveBuilderLanguageTagText(undefined, 'english')).toBe('English');
    expect(resolveBuilderLanguageTagText('Russian', 'english')).toBe('Russian');
    expect(resolveBuilderLanguageTagText('Russian', 'native')).toBe('Русский');
    expect(resolveBuilderLanguageTagText('Russian', 'native-with-english')).toBe('Русский/Russian');
    expect(resolveBuilderLanguageTagText('English', 'hide-english')).toBe('');
    expect(resolveBuilderLanguageTagText('Swahili', 'hide-english')).toBe('Swahili');
  });
});
