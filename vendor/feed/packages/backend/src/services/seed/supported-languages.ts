// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * The languages FEED supports, in the order they are offered.
 *
 * Reference data: facts rather than choices, so a clean slate always carries
 * them. They are seeded as *available*, not enabled — enabling a language is an
 * agency decision, and a fresh instance that arrived with 59 of them switched
 * on would put 59 columns of untranslated text in front of staff on day one.
 *
 * Extracted from `scripts/seed-all.ts` so the same list backs both the
 * development seed and the user-facing clean slate. It lives under `src/`
 * because the production image never copies `scripts/`.
 */

export interface SupportedLanguage {
  name: string;
  sortOrder: number;
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { name: 'English', sortOrder: 1 },
  { name: 'Chinese', sortOrder: 2 },
  { name: 'Spanish', sortOrder: 3 },
  { name: 'Hindi', sortOrder: 4 },
  { name: 'Arabic', sortOrder: 5 },
  { name: 'Portuguese', sortOrder: 6 },
  { name: 'Bengali', sortOrder: 7 },
  { name: 'Russian', sortOrder: 8 },
  { name: 'Japanese', sortOrder: 9 },
  { name: 'Punjabi', sortOrder: 10 },
  { name: 'German', sortOrder: 11 },
  { name: 'French', sortOrder: 12 },
  { name: 'Urdu', sortOrder: 13 },
  { name: 'Indonesian', sortOrder: 14 },
  { name: 'Italian', sortOrder: 15 },
  { name: 'Turkish', sortOrder: 16 },
  { name: 'Vietnamese', sortOrder: 17 },
  { name: 'Persian', sortOrder: 18 },
  { name: 'Thai', sortOrder: 19 },
  { name: 'Korean', sortOrder: 20 },
  { name: 'Tamil', sortOrder: 21 },
  { name: 'Swahili', sortOrder: 22 },
  { name: 'Marathi', sortOrder: 23 },
  { name: 'Telugu', sortOrder: 24 },
  { name: 'Gujarati', sortOrder: 25 },
  { name: 'Polish', sortOrder: 26 },
  { name: 'Ukrainian', sortOrder: 27 },
  { name: 'Malayalam', sortOrder: 28 },
  { name: 'Romanian', sortOrder: 29 },
  { name: 'Dutch', sortOrder: 30 },
  { name: 'Hungarian', sortOrder: 31 },
  { name: 'Greek', sortOrder: 32 },
  { name: 'Czech', sortOrder: 33 },
  { name: 'Swedish', sortOrder: 34 },
  { name: 'Tagalog', sortOrder: 35 },
  { name: 'Kazakh', sortOrder: 36 },
  { name: 'Danish', sortOrder: 37 },
  { name: 'Slovak', sortOrder: 38 },
  { name: 'Slovenian', sortOrder: 39 },
  { name: 'Serbian', sortOrder: 40 },
  { name: 'Finnish', sortOrder: 41 },
  { name: 'Bulgarian', sortOrder: 42 },
  { name: 'Norwegian', sortOrder: 43 },
  { name: 'Macedonian', sortOrder: 44 },
  { name: 'Lithuanian', sortOrder: 45 },
  { name: 'Latvian', sortOrder: 46 },
  { name: 'Croatian', sortOrder: 47 },
  { name: 'Somali', sortOrder: 48 },
  { name: 'Albanian', sortOrder: 49 },
  { name: 'Armenian', sortOrder: 50 },
  { name: 'Bosnian', sortOrder: 51 },
  { name: 'Georgian', sortOrder: 52 },
  { name: 'Amharic', sortOrder: 53 },
  { name: 'Burmese', sortOrder: 54 },
  { name: 'Malay', sortOrder: 55 },
  { name: 'Estonian', sortOrder: 56 },
  { name: 'Catalan', sortOrder: 57 },
  { name: 'Mongolian', sortOrder: 58 },
  { name: 'Kannada', sortOrder: 59 },
];
