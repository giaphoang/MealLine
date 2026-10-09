// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, test, vi } from 'vitest';

vi.mock('../../../src/db', () => ({ default: {} }));
vi.mock('../../../src/services/alerts', () => ({ alertService: {} }));

import { classifyTranslationProviderError } from '../../../src/services/builder-translation';

/** The provider errors this classifier was written against, verbatim. */
const providerError = (message: string, status?: number | string) =>
  Object.assign(new Error(message), status === undefined ? {} : { status });

describe('classifying a translation provider failure', () => {
  // ISSUES.md #80. Gemini answered a depleted account with the same 429 it
  // uses for genuine rate limiting, and staff were told to wait a minute for
  // a condition that never clears.
  test('depleted credits read as exhausted, not busy, despite the 429', () => {
    const error = providerError(
      '{"error":{"code":429,"message":"Your prepayment credits are depleted. Please go to '
        + 'AI Studio to manage your project and billing.","status":"RESOURCE_EXHAUSTED"}}',
      429,
    );
    expect(classifyTranslationProviderError(error)).toBe('exhausted');
  });

  test('OpenAI insufficient_quota reads as exhausted', () => {
    expect(classifyTranslationProviderError(
      providerError('429 You exceeded your current quota (insufficient_quota).', 429),
    )).toBe('exhausted');
  });

  test('a low credit balance reads as exhausted whatever the status', () => {
    expect(classifyTranslationProviderError(
      providerError('Your credit balance is too low to access the API.', 400),
    )).toBe('exhausted');
  });

  // Observed switching the production account from Gemini to OpenAI.
  test('a model the project cannot call reads as misconfigured', () => {
    expect(classifyTranslationProviderError(providerError(
      "403 Project 'proj_D1SVivR2OD2RCM9V5UnAwpi1' does not have access to model "
        + "'gpt-5-mini-2025-08-07'",
      403,
    ))).toBe('misconfigured');
  });

  test('a rejected or revoked key reads as misconfigured', () => {
    expect(classifyTranslationProviderError(
      providerError('401 Incorrect API key provided.', 401),
    )).toBe('misconfigured');
    expect(classifyTranslationProviderError(
      providerError('Invalid Authentication', 401),
    )).toBe('misconfigured');
  });

  test('an unknown model id reads as misconfigured', () => {
    expect(classifyTranslationProviderError(
      providerError('404 The model `gpt-5-mini-2025-08-07` does not exist (model_not_found).', 404),
    )).toBe('misconfigured');
  });

  test('a briefly overloaded model reads as busy', () => {
    expect(classifyTranslationProviderError(
      providerError('The model is overloaded. Please try again later.', 503),
    )).toBe('busy');
    expect(classifyTranslationProviderError(
      providerError('429 Rate limit reached for requests', 429),
    )).toBe('busy');
  });

  // The first thing a freshly restored instance produces: no model is active,
  // because a restored configuration arrives without its API key. Before this
  // case existed the message told staff the service "didn't respond", which is
  // both false and unactionable — nothing was ever asked.
  test('no active AI configuration reads as not-configured, not an outage', () => {
    expect(classifyTranslationProviderError(providerError(
      'AI configuration required. Please configure AI settings in Tools → AI Configuration.'
    ))).toBe('not-configured');
    expect(classifyTranslationProviderError(providerError(
      'OpenAI API configuration required. Please configure API settings in Tools → AI Configuration.'
    ))).toBe('not-configured');
    expect(classifyTranslationProviderError(providerError('OpenAI client not initialized')))
      .toBe('not-configured');
  });

  test('anything else reads as unavailable', () => {
    expect(classifyTranslationProviderError(providerError('socket hang up'))).toBe('unavailable');
    expect(classifyTranslationProviderError(providerError('500 Internal server error', 500)))
      .toBe('unavailable');
    expect(classifyTranslationProviderError(undefined)).toBe('unavailable');
    expect(classifyTranslationProviderError('a bare string')).toBe('unavailable');
  });
});

// The order of the tests inside the classifier is what makes the three
// account-level readings distinguishable at all; each of these would land
// somewhere else if the sequence were rearranged.
describe('the classification order is load-bearing', () => {
  test('money wording beats a configuration status', () => {
    // A hard billing limit can arrive as a 403. It is not a wrong key.
    expect(classifyTranslationProviderError(
      providerError('403 Billing hard limit has been reached', 403),
    )).toBe('exhausted');
  });

  test('a configuration status beats an overload marker in the payload', () => {
    // "429" appears in this body only as part of a quoted request id.
    expect(classifyTranslationProviderError(
      providerError('403 does not have access to model (request req-429-abc)', 403),
    )).toBe('misconfigured');
  });
});
