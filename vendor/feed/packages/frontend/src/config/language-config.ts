// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

export const LanguageConfig = {
    DEFAULT_LANGUAGE: 'English',
    SUPPORTED_LANGUAGES: [
        { name: 'English' },
        { name: 'Albanian' },
        { name: 'Amharic' },
        { name: 'Arabic' },
        { name: 'Armenian' },
        { name: 'Bengali' },
        { name: 'Bosnian' },
        { name: 'Bulgarian' },
        { name: 'Burmese' },
        { name: 'Catalan' },
        { name: 'Chinese' },
        { name: 'Croatian' },
        { name: 'Czech' },
        { name: 'Danish' },
        { name: 'Dutch' },
        { name: 'Estonian' },
        { name: 'Finnish' },
        { name: 'French' },
        { name: 'Georgian' },
        { name: 'German' },
        { name: 'Greek' },
        { name: 'Gujarati' },
        { name: 'Hindi' },
        { name: 'Hungarian' },
        { name: 'Icelandic' },
        { name: 'Indonesian' },
        { name: 'Italian' },
        { name: 'Japanese' },
        { name: 'Kannada' },
        { name: 'Kazakh' },
        { name: 'Korean' },
        { name: 'Latvian' },
        { name: 'Lithuanian' },
        { name: 'Macedonian' },
        { name: 'Malay' },
        { name: 'Malayalam' },
        { name: 'Marathi' },
        { name: 'Mongolian' },
        { name: 'Norwegian' },
        { name: 'Persian' },
        { name: 'Polish' },
        { name: 'Portuguese' },
        { name: 'Punjabi' },
        { name: 'Romanian' },
        { name: 'Russian' },
        { name: 'Serbian' },
        { name: 'Slovak' },
        { name: 'Slovenian' },
        { name: 'Somali' },
        { name: 'Spanish' },
        { name: 'Swahili' },
        { name: 'Swedish' },
        { name: 'Tagalog' },
        { name: 'Tamil' },
        { name: 'Telugu' },
        { name: 'Thai' },
        { name: 'Turkish' },
        { name: 'Ukrainian' },
        { name: 'Urdu' },
        { name: 'Vietnamese' }
    ]
} as const;

export const DEFAULT_ACTIVE_LANGUAGES = ['English', 'Spanish', 'French', 'Chinese'];

export const isValidLanguageName = (name: string): boolean => {
    return LanguageConfig.SUPPORTED_LANGUAGES.some(lang => lang.name === name);
};

export const getDefaultLanguages = () => {
    return LanguageConfig.SUPPORTED_LANGUAGES.map(lang => ({
        ...lang,
        active: DEFAULT_ACTIVE_LANGUAGES.includes(lang.name)
    }));
};