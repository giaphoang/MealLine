// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * The system prompts that shape FEED's AI behaviour.
 *
 * Reference data, alongside the supported languages: these describe how FEED
 * talks to a translation provider — tone, context, and what to leave in English
 * — rather than an agency's own content. A clean slate always carries them.
 *
 * They were previously defined only in `scripts/seed-all.ts`, which the
 * production image never copies. That meant a reset cleared `SystemPrompt`
 * (it is in the backup contract) and had nothing to put back, leaving the
 * instance without the prompts that drive translation quality. Moving them here
 * is what makes the reference layer complete.
 */

export interface SeedSystemPrompt {
  name: string;
  promptType: string;
  isActive: boolean;
  isDefault: boolean;
  description?: string;
  serviceDescription?: string;
  translationApproach?: string;
  contextGuidance?: string;
  additionalGuidance?: string;
  skipTranslation?: string;
  includeEnglish?: string;
  skipTranslationThreshold?: number;
  includeEnglishThreshold?: number;
  temperature?: number;
  topP?: number;
  rememberFormattingChoices?: boolean;
}

export const SEED_SYSTEM_PROMPTS: readonly SeedSystemPrompt[] = [
  {
    "name": "Shopping List Auto-Format",
    "promptType": "CLASSIFICATION",
    "isActive": true,
    "isDefault": false,
    "description": "Customized for William Temple House shopping lists",
    "skipTranslation": "Titles like  \"Shopping List\", \"Client Name\", placeholders like \"____\".",
    "includeEnglish": "Food items names such as \"Kidney beans\", \"Apples\", \"Beef\", \"Eggs\", or \"Chicken Noodle Soup\". Hygiene items like \"Toothpaste\", \"Soap\", \"First Aid Kit\", \"Hygiene Kit.\" Exclude categories names like \"Hygiene Items\" \"Beans\" \"Dairy\". Exclude header names \"Limit\", \"Quantity\".",
    "skipTranslationThreshold": 0.8,
    "includeEnglishThreshold": 0.7,
    "rememberFormattingChoices": true
  },
  {
    "name": "DOCX - Low Temp",
    "promptType": "BATCH_TRANSLATION",
    "isActive": true,
    "isDefault": false,
    "description": "Detailed translation instructions for DOCX files. Stable output",
    "serviceDescription": "You are a translator service.",
    "translationApproach": "Translate with the expectations of native speakers in mind, be culturally sensitive, and apply natural language.",
    "contextGuidance": "In the context of a social services agency offering food pantry, emergency clothing, and hygiene.",
    "additionalGuidance": "Do NOT provide any commentary about the translations. Do not request additional feedback. Always make your best guess when in doubt.",
    "temperature": 0.3,
    "topP": 1
  },
  {
    "name": "Food Items and Categories",
    "promptType": "FOOD_TRANSLATION",
    "isActive": true,
    "isDefault": false,
    "description": "Customized for William Temple House food inventory",
    "serviceDescription": "You are a translator service.",
    "translationApproach": "Translate with the expectations of native speakers in mind, be culturally sensitive, and apply natural language.",
    "contextGuidance": "In the context of a social services agency offering food pantry, emergency clothing, and hygiene items.",
    "additionalGuidance": "Do NOT provide any commentary about the translations. Do not request additional feedback. Always make your best guess when in doubt.",
    "temperature": 1,
    "topP": 1,
    "rememberFormattingChoices": true
  }
];
