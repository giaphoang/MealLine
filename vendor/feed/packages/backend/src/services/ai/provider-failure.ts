// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * What an AI provider's refusal means, and what FEED says about it.
 *
 * The classifier below was written for the Shopping List Builder (ISSUES.md
 * #80) and lived in `services/builder-translation.ts`. It moved here when the
 * translation and document routes needed the same reading: those routes had
 * been collapsing every provider failure into "Invalid API key
 * configuration", so a model an account cannot call was reported as a bad key
 * and the provider's real answer reached only the server log (ISSUES.md #84).
 * `builder-translation.ts` re-exports it, so its callers and tests are
 * unchanged.
 */

import { createRouteError, type AppRouteError } from '../../lib/route-error';

export type TranslationProviderFailure =
  | 'busy'
  | 'exhausted'
  | 'misconfigured'
  | 'not-configured'
  | 'unavailable';

/** Substrings every major provider uses when the account, not the model, is the problem. */
const QUOTA_EXHAUSTED_MARKERS = [
  'resource_exhausted',
  'insufficient_quota',
  'prepayment credits',
  'credits are depleted',
  'credit balance',
  'billing',
  'quota',
];

/**
 * Substrings that mean the request was refused on its merits: the key is not
 * valid, or the account cannot call the model FEED is configured to use.
 * Observed on production while switching providers: OpenAI answers
 * `403 Project 'proj_...' does not have access to model 'gpt-5-mini-...'`
 * when the organization is unverified or the project's model allow-list
 * excludes it. Google answers `404 ... is no longer available to new users`
 * for a model it has withdrawn from new projects, which is the same kind of
 * fact about a model rather than about a key.
 */
const MISCONFIGURED_MARKERS = [
  'does not have access',
  'model_not_found',
  'invalid_api_key',
  'incorrect api key',
  'invalid authentication',
  'permission_denied',
  'unsupported_country',
  'not authorized',
  // Google's wording for a rejected key, measured against the live API on
  // 2026-09-13: `400 INVALID_ARGUMENT` / "API key not valid. Please pass a
  // valid API key." / reason `API_KEY_INVALID`. It matched none of the
  // markers above — `invalid_api_key` is OpenAI's spelling, and Google
  // reverses the words — and 400 is not a misconfigured status, so a
  // mistyped Google key fell through every test to `unavailable` and told
  // staff the service had not responded and to try again shortly. It had
  // responded, and retrying could never work.
  //
  // Matched on wording rather than by adding 400 to MISCONFIGURED_STATUSES:
  // 400 is Google's generic bad request, returned for a malformed body or a
  // parameter a model refuses, and blaming those on the key would send an
  // administrator to check something that is fine.
  'api key not valid',
  'api_key_invalid',
];

/**
 * Substrings meaning FEED never reached a provider at all, because no AI model
 * is switched on. Distinct from `misconfigured`, where a provider answered and
 * refused: this is unfinished setup, and it is the ordinary state of a freshly
 * restored instance, since a restored model configuration arrives without its
 * key and therefore inactive.
 */
const NOT_CONFIGURED_MARKERS = [
  'configuration required',
  'no active configuration',
  'not initialized',
  'client not initialized',
];

/** Statuses that always mean configuration, never load. */
const MISCONFIGURED_STATUSES = [401, 403, 404];

/** Substrings that mean the model is momentarily busy and a retry will work. */
const TRANSIENT_OVERLOAD_MARKERS = [
  'unavailable',
  'high demand',
  'overloaded',
  'rate limit',
  '429',
];

/**
 * Classify a raw provider error so the caller can pick honest copy. Matching
 * is substring-based over the message and status because each provider words
 * this differently and none of them expose a stable machine code for "you are
 * out of money" or "this key cannot call that model".
 *
 * The order of the tests is load-bearing:
 *
 * 1. "No provider at all" first, because that error carries no status and no
 *    provider vocabulary, and would otherwise fall through every test below
 *    to `unavailable` -- telling a freshly restored instance that the service
 *    "didn't respond" when nothing was ever asked.
 * 2. Quota next. An exhausted account reports the same 429 as genuine rate
 *    limiting, and a billing-limit refusal can arrive as a 403 -- so money
 *    wording wins over both the status and the overload markers.
 * 3. Configuration by status or wording. A 401/403/404 is a refusal
 *    on the merits; no amount of waiting changes it.
 * 4. Overload last, so a bare `429` in the payload only means `busy` once the
 *    account-level and configuration readings have been ruled out.
 */
export const classifyTranslationProviderError = (
  error: unknown,
): TranslationProviderFailure => {
  const status = (error as { status?: number | string } | null)?.status;
  const message = error instanceof Error ? error.message : String(error ?? '');
  const haystack = `${message} ${status ?? ''}`.toLowerCase();

  if (NOT_CONFIGURED_MARKERS.some((marker) => haystack.includes(marker))) {
    return 'not-configured';
  }
  if (QUOTA_EXHAUSTED_MARKERS.some((marker) => haystack.includes(marker))) {
    return 'exhausted';
  }
  if (
    MISCONFIGURED_STATUSES.includes(Number(status))
    || MISCONFIGURED_MARKERS.some((marker) => haystack.includes(marker))
  ) {
    return 'misconfigured';
  }
  if (status === 503 || TRANSIENT_OVERLOAD_MARKERS.some((marker) => haystack.includes(marker))) {
    return 'busy';
  }
  return 'unavailable';
};

/** The error code each failure travels under, read by the client as `ApiError.code`. */
export const PROVIDER_FAILURE_CODES: Record<TranslationProviderFailure, string> = {
  exhausted: 'AI_TRANSLATION_QUOTA_EXHAUSTED',
  'not-configured': 'AI_TRANSLATION_NOT_CONFIGURED',
  misconfigured: 'AI_TRANSLATION_MISCONFIGURED',
  busy: 'AI_TRANSLATION_BUSY',
  unavailable: 'AI_TRANSLATION_UNAVAILABLE',
};

/**
 * Every one of these answers **503**, not 400 or 502.
 *
 * 502 is unusable through Cloudflare Tunnel: the edge replaces an origin 502
 * with its own branded HTML page, which is how a Cloudflare error document
 * ended up printed inside a FEED modal (#80). 503 passes through untouched,
 * and it is the honest status besides -- FEED is fine, its translation
 * dependency is not. 400 would blame the caller for a provider's refusal.
 */
const PROVIDER_FAILURE_STATUS = 503;

/**
 * What the failure is about, named so the sentence reads naturally:
 * "…stopped translating this document", "…these translations".
 */
export interface ProviderFailureContext {
  /** e.g. `this document`, `these translations`, `this text`. */
  subject: string;
  /** The configured model id, when known. Naming it is the whole point. */
  model?: string | null;
}

const describe = (
  failure: TranslationProviderFailure,
  { subject, model }: ProviderFailureContext,
): string => {
  const named = model ? ` (${model})` : '';

  switch (failure) {
    case 'exhausted':
      return `FEED stopped translating ${subject} because the AI provider says its quota or prepaid credits are used up. `
        + 'Retrying will not clear this. An administrator needs to restore the provider account, '
        + 'then try again from Tools → AI Configuration.';
    case 'not-configured':
      return `FEED cannot translate ${subject} yet because no AI model is switched on. `
        + 'An administrator needs to open Tools → AI Configuration and activate a model, entering its '
        + 'API key first if this instance was restored from a backup.';
    case 'misconfigured':
      return `The AI provider rejected FEED's API key or the model it is set to use${named}, so ${subject} was not translated. `
        + 'Retrying will not help. An administrator needs to check the key and the model in '
        + 'Tools → AI Configuration — a provider can withdraw a model, or refuse one this account cannot call.';
    case 'busy':
      return `The AI service is busy right now, so ${subject} was not translated. `
        + 'This is temporary — wait about a minute and try again. No work was lost.';
    case 'unavailable':
    default:
      return `The AI service did not respond, so ${subject} was not translated. `
        + 'Try again in a moment. If it keeps failing, check the provider settings in Tools → AI Configuration.';
  }
};

/** The failure, its code, and the sentence staff see — without raising anything. */
export const describeProviderFailure = (
  failure: TranslationProviderFailure,
  context: ProviderFailureContext,
): { failure: TranslationProviderFailure; code: string; status: number; message: string } => ({
  failure,
  code: PROVIDER_FAILURE_CODES[failure],
  status: PROVIDER_FAILURE_STATUS,
  message: describe(failure, context),
});

/**
 * Turn a raw provider error into the route error a person can act on. Pass the
 * result to `next()` so the real error handler formats it; its `statusCode` is
 * what lets the message through (see `lib/route-error.ts`).
 */
export const providerFailureError = (
  error: unknown,
  context: ProviderFailureContext,
): AppRouteError & { failure: TranslationProviderFailure } => {
  const failure = classifyTranslationProviderError(error);
  const { code, status, message } = describeProviderFailure(failure, context);
  const routeError = createRouteError(message, status, code) as AppRouteError & {
    failure: TranslationProviderFailure;
  };
  routeError.failure = failure;
  return routeError;
};
