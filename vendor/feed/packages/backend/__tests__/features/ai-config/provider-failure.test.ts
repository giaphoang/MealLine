// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * What staff read when an AI provider refuses, and what an administrator is
 * told about it. ISSUES.md #84: every one of these used to arrive as
 * "Invalid API key configuration", including a working key calling a model
 * the account cannot use.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const createAlert = vi.hoisted(() => vi.fn());

vi.mock('../../../src/db', () => ({ default: {} }));
vi.mock('../../../src/services/alerts', () => ({
  alertService: { createAlert },
}));

import {
  describeProviderFailure,
  providerFailureError,
  PROVIDER_FAILURE_CODES,
} from '../../../src/services/ai/provider-failure';
import {
  raiseProviderAlert,
  resetProviderAlertThrottle,
  PROVIDER_ALERT_COOLDOWN_MS,
} from '../../../src/services/alerts/provider-alerts';

const providerError = (message: string, status?: number) =>
  Object.assign(new Error(message), status === undefined ? {} : { status });

beforeEach(() => {
  createAlert.mockClear();
  resetProviderAlertThrottle();
});

describe('the message staff read', () => {
  test('a refused model names the model instead of blaming the key', () => {
    const error = providerFailureError(
      providerError(
        'models/gemini-2.5-flash-lite is no longer available to new users.',
        404,
      ),
      { subject: 'this document', model: 'gemini-2.5-flash-lite' },
    );

    expect(error.failure).toBe('misconfigured');
    expect(error.message).toContain('gemini-2.5-flash-lite');
    expect(error.message).toContain('this document');
    // The old copy, which this replaces.
    expect(error.message).not.toContain('Invalid API key configuration');
  });

  test("Google's rejected key is a key problem, not an outage", () => {
    // The body below is Google's, measured against the live API on
    // 2026-09-13 by the live smoke sweep. It matched none of the misconfigured
    // markers — `invalid_api_key` is OpenAI's spelling and Google reverses the
    // words — and 400 is not a misconfigured status, so a mistyped Google key
    // fell through every test to `unavailable`: "The AI service did not
    // respond… try again in a moment." It had responded, and no amount of
    // retrying could clear it.
    const error = providerFailureError(
      providerError(
        '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.",'
        + '"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}',
        400,
      ),
      { subject: 'this text', model: 'gemini-3.8-flash' },
    );

    expect(error.failure).toBe('misconfigured');
    expect(error.message).toContain('gemini-3.8-flash');
    expect(error.message).not.toContain('did not respond');
  });

  test('a Google 400 that is not about the key stays out of misconfigured', () => {
    // The negative control for the marker above, and the reason the fix
    // matches wording instead of adding 400 to MISCONFIGURED_STATUSES: 400 is
    // Google's generic bad request, returned for a malformed body or a
    // sampling parameter a model refuses. Sending an administrator to check a
    // key that is perfectly fine would be its own defect.
    const error = providerFailureError(
      providerError(
        '{"error":{"code":400,"message":"Unable to submit request because temperature '
        + 'is not supported by this model.","status":"INVALID_ARGUMENT"}}',
        400,
      ),
      { subject: 'this text', model: 'gemini-3.8-flash' },
    );

    expect(error.failure).not.toBe('misconfigured');
  });

  test('every failure answers 503, which Cloudflare passes through', () => {
    // 502 is replaced by Cloudflare's own HTML page (ISSUES.md #80), and 400
    // would blame the caller for a provider's refusal.
    for (const failure of Object.keys(PROVIDER_FAILURE_CODES) as Array<
      keyof typeof PROVIDER_FAILURE_CODES
    >) {
      const described = describeProviderFailure(failure, { subject: 'this text' });
      expect(described.status).toBe(503);
      expect(described.code).toBe(PROVIDER_FAILURE_CODES[failure]);
    }
  });

  test('the two failures that cannot clear never invite a retry', () => {
    for (const failure of ['exhausted', 'misconfigured'] as const) {
      const { message } = describeProviderFailure(failure, { subject: 'this text' });
      expect(message).toMatch(/will not (clear|help)/);
      expect(message).toContain('administrator');
    }
  });

  test('a busy provider does invite a retry, because waiting works', () => {
    const { message } = describeProviderFailure('busy', { subject: 'this text' });
    expect(message).toContain('wait about a minute');
    expect(message).toContain('No work was lost');
  });

  test('an unfinished setup is told to switch a model on, not to wait', () => {
    const { message } = describeProviderFailure('not-configured', {
      subject: 'these translations',
    });
    expect(message).toContain('no AI model is switched on');
    expect(message).toContain('restored from a backup');
  });
});

describe('the alert an administrator gets', () => {
  test('raises once for an exhausted account, naming the model', async () => {
    expect(await raiseProviderAlert('exhausted', 'gpt-5-mini')).toBe(true);
    expect(createAlert).toHaveBeenCalledTimes(1);

    const [level, message] = createAlert.mock.calls[0];
    expect(level).toBe('critical');
    expect(message).toContain('gpt-5-mini');
    expect(message).toContain('credits');
  });

  test('a nine-language failure raises one alert, not nine', async () => {
    // The whole reason for the throttle: `createAlert` writes a row every
    // call, so one export into nine languages would otherwise fill the alert
    // list with the same fact nine times (cf. ISSUES.md #77).
    const now = Date.now();
    for (let i = 0; i < 9; i += 1) {
      await raiseProviderAlert('exhausted', 'gpt-5-mini', now + i * 1000);
    }
    expect(createAlert).toHaveBeenCalledTimes(1);
  });

  test('the same failure alerts again once the window has passed', async () => {
    const now = Date.now();
    await raiseProviderAlert('exhausted', 'gpt-5-mini', now);
    await raiseProviderAlert('exhausted', 'gpt-5-mini', now + PROVIDER_ALERT_COOLDOWN_MS + 1);
    expect(createAlert).toHaveBeenCalledTimes(2);
  });

  test('the two kinds are throttled separately', async () => {
    const now = Date.now();
    await raiseProviderAlert('exhausted', 'gpt-5-mini', now);
    await raiseProviderAlert('misconfigured', 'gpt-5-mini', now);
    expect(createAlert).toHaveBeenCalledTimes(2);
  });

  test('transient and unfinished states raise nothing', async () => {
    for (const failure of ['busy', 'unavailable', 'not-configured'] as const) {
      expect(await raiseProviderAlert(failure, 'gpt-5-mini')).toBe(false);
    }
    expect(createAlert).not.toHaveBeenCalled();
  });

  test('a failing alert never becomes a second failure for the caller', async () => {
    createAlert.mockRejectedValueOnce(new Error('database is gone'));
    await expect(raiseProviderAlert('exhausted', 'gpt-5-mini')).resolves.toBe(false);
  });
});
