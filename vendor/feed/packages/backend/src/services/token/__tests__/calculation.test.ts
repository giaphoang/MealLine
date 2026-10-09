// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * The pre-flight input estimate.
 *
 * Every translation is preceded by a limit check priced from this number. It
 * measured a hardcoded one-sentence stand-in for the system prompt, while the
 * prompt actually sent was built afterwards by `PromptBuilder` from the active
 * `SystemPrompt` row — a number that had never described the request it was
 * gating. Measured on this deployment's own rows with a four-token input, the
 * estimate read 41 tokens against a real 143 (`Food Items and Categories`) and
 * 114 (`DOCX - Low Temp`).
 *
 * The error is not a constant, which is the point: it scales with how much an
 * administrator has written into the prompt row, so no correction factor could
 * track it. The prompt itself is the only estimate that can.
 *
 * None of this file existed before the fix — the function had no tests at all,
 * which is how a stand-in prompt sat in front of every limit check unnoticed.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { encoding_for_model } from 'tiktoken';

import {
  approximateSystemPrompt,
  calculateInputMetrics,
  clearTokenCache
} from '../calculation';

/** The encoding `calculateInputMetrics` uses, so assertions are exact. */
const countTokens = (text: string): number => {
  const encoder = encoding_for_model('gpt-4o-mini');
  const count = encoder.encode(text).length;
  encoder.free();
  return count;
};

/**
 * Representative of a filled-in prompt row: the shipped template plus the
 * optional slots an administrator actually writes into. Deliberately not a
 * copy of any real row — the assertions below are all relationships, so the
 * exact wording does not matter, only that it is the size a real one is.
 */
const CONFIGURED_PROMPT =
  'You are a translation service for a nonprofit food pantry specializing in food inventory. '
  + 'We serve immigrant and refugee families, and our shelf labels must be readable at a glance. '
  + 'Translate to Spanish using the closest natural equivalent a home cook would recognise. '
  + 'In food pantry contexts, prioritize standard terminology native speakers expect '
  + '(e.g., "Turkey" refers to meat, not country). Keep brand names untranslated and preserve '
  + 'units of measurement exactly as written. Your response must be a valid JSON string '
  + 'containing only a "translatedText" field. Do not add commentary, notes, or alternative '
  + 'translations. Never refuse to translate unless the content is inappropriate.';

/** A second, materially different prompt — for the cache. */
const OTHER_PROMPT =
  'You are a translation service for a nonprofit food pantry. Translate each segment to '
  + 'Spanish, preserving the order of the input exactly. Return valid JSON.';

const config = { inputCost: 0.15, unitPrice: 'per_1m' };
const TEXT = 'Canned black beans';

beforeEach(() => {
  // The module caches by content for ten minutes, so tests would otherwise
  // read each other's results.
  clearTokenCache();
});

describe('the estimate measures the prompt it is given', () => {
  test('counts the supplied prompt exactly, plus the text', () => {
    const result = calculateInputMetrics(TEXT, 'Spanish', config, CONFIGURED_PROMPT);

    expect(result.tokenCount).toBe(countTokens(CONFIGURED_PROMPT) + countTokens(TEXT));
  });

  test('the stand-in understated a configured prompt severalfold', () => {
    // The defect, as a relationship rather than a magic number: whatever the
    // stand-in costs, a real filled-in row costs multiples of it.
    const standIn = calculateInputMetrics(TEXT, 'Spanish', config).tokenCount;
    clearTokenCache();
    const real = calculateInputMetrics(TEXT, 'Spanish', config, CONFIGURED_PROMPT).tokenCount;

    expect(real).toBeGreaterThan(standIn * 2);
  });

  test('cost is priced from the corrected count', () => {
    const result = calculateInputMetrics(TEXT, 'Spanish', config, CONFIGURED_PROMPT);

    expect(result.cost).toBeCloseTo(result.tokenCount * (0.15 / 1_000_000), 12);
  });
});

describe('the cache', () => {
  test('does not serve a count computed for a different prompt', () => {
    // The trap this fix could have introduced. Same text, same language, two
    // configurations: without the prompt in the cache key, whichever ran first
    // would answer for both, and the second would be gated on a number
    // belonging to someone else's prompt.
    const first = calculateInputMetrics(TEXT, 'Spanish', config, CONFIGURED_PROMPT).tokenCount;
    const second = calculateInputMetrics(TEXT, 'Spanish', config, OTHER_PROMPT).tokenCount;

    expect(second).not.toBe(first);
    expect(second).toBe(countTokens(OTHER_PROMPT) + countTokens(TEXT));
  });

  test('still returns a repeated identical request from cache', () => {
    const first = calculateInputMetrics(TEXT, 'Spanish', config, CONFIGURED_PROMPT);
    const second = calculateInputMetrics(TEXT, 'Spanish', config, CONFIGURED_PROMPT);

    expect(second).toEqual(first);
  });
});

describe('the short-text shortcut', () => {
  test('is skipped when the real prompt is known', () => {
    // 'Rice' is under the ten-character threshold. The shortcut books the
    // system prompt at a flat 50 tokens, which would silently discard a
    // 130-token prompt the caller had just handed over.
    const result = calculateInputMetrics('Rice', 'Spanish', config, CONFIGURED_PROMPT);

    expect(result.tokenCount).toBe(countTokens(CONFIGURED_PROMPT) + countTokens('Rice'));
    expect(result.tokenCount).toBeGreaterThan(55);
  });

  test('survives for callers that cannot supply a prompt', () => {
    // `rateLimiter` throttles per IP before any configuration is resolved and
    // reads only `.tokenCount`. Its behaviour is unchanged: 5 + 50.
    expect(calculateInputMetrics('Rice', 'Spanish', config).tokenCount).toBe(55);
  });
});

describe('callers that supply no prompt', () => {
  test('are measured against the documented stand-in', () => {
    const result = calculateInputMetrics(TEXT, 'Spanish', config);

    expect(result.tokenCount).toBe(
      countTokens(approximateSystemPrompt('Spanish')) + countTokens(TEXT)
    );
  });

  test('the stand-in still names the target language', () => {
    // It is a poor estimate of the prompt, but it should at least vary the way
    // the real prompt does.
    expect(approximateSystemPrompt('Ukrainian')).toContain('Ukrainian');
    expect(approximateSystemPrompt('Ukrainian')).not.toBe(approximateSystemPrompt('Swahili'));
  });
});
