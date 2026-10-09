// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

export interface BuilderPreviewTranslationPreflight {
  cached: Record<string, string>;
  missingStrings: string[];
}

export type BuilderPreviewTranslationDecision =
  | { status: 'ready'; translations: Record<string, string> }
  | {
    status: 'missing';
    cached: Record<string, string>;
    missingStrings: string[];
  };

export function resolvePreviewTranslationPreflight(
  preflight: BuilderPreviewTranslationPreflight,
): BuilderPreviewTranslationDecision {
  if (preflight.missingStrings.length > 0) {
    return {
      status: 'missing',
      cached: preflight.cached ?? {},
      missingStrings: preflight.missingStrings,
    };
  }

  return {
    status: 'ready',
    translations: preflight.cached ?? {},
  };
}

export function mergePreviewTranslations(
  cached: Record<string, string>,
  newlyTranslated: Record<string, string>,
): Record<string, string> {
  return {
    ...cached,
    ...newlyTranslated,
  };
}
