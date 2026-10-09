// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Administrator alerts for the two AI provider failures that only an
 * administrator can clear: the account is out of credit, or the provider
 * rejected the key or the model.
 *
 * Staff see their own message on the request that failed. This is the other
 * half: without it, the person who can actually fix the account learns about
 * it only if a staff member passes the message along.
 *
 * **Throttled on purpose.** `alertService.createAlert` writes a row and emits
 * an event every time it is called, with no de-duplication. One click that
 * translates into nine languages fails nine times against the same depleted
 * account, and nine identical alerts is not nine facts — it is one fact,
 * repeated until the alert list is useless. The same reasoning as #77, where
 * a brief interruption produced a stream of duplicate toasts.
 */

import { alertService } from './index';
import type { TranslationProviderFailure } from '../ai/provider-failure';

/** One alert per failure kind per window. Long enough to cover a bulk job. */
export const PROVIDER_ALERT_COOLDOWN_MS = 15 * 60 * 1000;

const lastRaisedAt = new Map<string, number>();

const ALERTABLE: Partial<Record<
  TranslationProviderFailure,
  { level: 'critical' | 'error'; message: (model: string) => string }
>> = {
  exhausted: {
    level: 'critical',
    message: (model) =>
      `AI translation has stopped: the provider reports its quota or prepaid credits are used up${model}. `
      + 'Staff cannot translate until the provider account is topped up. Retrying will not clear it.',
  },
  misconfigured: {
    level: 'error',
    message: (model) =>
      `AI translation has stopped: the provider rejected FEED's API key or model${model}. `
      + 'Check both in Tools → AI Configuration — a provider can withdraw a model, or refuse one this account cannot call.',
  },
};

/**
 * Raise an administrator alert for a provider failure, at most once per
 * cooldown window. Returns whether an alert was written, which is what the
 * throttle test asserts.
 *
 * Never throws: an alert is a notification about a failure that is already
 * being reported to the caller, and it must not become a second failure.
 */
export const raiseProviderAlert = async (
  failure: TranslationProviderFailure,
  model?: string | null,
  now: number = Date.now(),
): Promise<boolean> => {
  const alertable = ALERTABLE[failure];
  if (!alertable) return false;

  const previous = lastRaisedAt.get(failure);
  if (previous !== undefined && now - previous < PROVIDER_ALERT_COOLDOWN_MS) {
    return false;
  }
  lastRaisedAt.set(failure, now);

  try {
    await alertService.createAlert(alertable.level, alertable.message(model ? ` (${model})` : ''));
    return true;
  } catch (error) {
    console.error('Failed to raise AI provider alert:', error);
    return false;
  }
};

/** Test seam: clears the cooldown so cases do not leak into one another. */
export const resetProviderAlertThrottle = (): void => {
  lastRaisedAt.clear();
};
