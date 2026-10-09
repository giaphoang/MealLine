// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * One way in for every translation surface: get the active AI service, or
 * fail with a sentence that says what actually went wrong.
 *
 * Before this, each route called `validateApiKey()` — a boolean — and
 * answered `400 Invalid API key configuration` for every possible failure.
 * A working key calling a model the account cannot use (Google now refuses
 * `gemini-2.5-*` to new projects; OpenAI refuses models outside a project's
 * allow-list) was therefore reported as a bad key, and the provider's real
 * answer reached only the server log. That is ISSUES.md #84, and it is why
 * the reported fault looked like a key problem for days.
 *
 * This helper keeps the provider's error, classifies it, names the model,
 * alerts an administrator when only they can clear it, and throws a route
 * error carrying a machine-readable code.
 */

import type { AIConfiguration } from '@prisma/client';

import { AIServiceFactory } from './factory/AIServiceFactory';
import type { AITranslationService } from './base/AITranslationService';
import { classifyTranslationProviderError, providerFailureError } from './provider-failure';
import { raiseProviderAlert } from '../alerts/provider-alerts';

export const PROVIDER_ACCESS_FAILURE_TTL_MS = 5 * 60 * 1000;

const failureCache = new Map<string, { error: unknown; expiresAt: number }>();

export const clearProviderAccessFailureCache = (): void => {
  failureCache.clear();
};

/**
 * Resolve the active AI service and confirm its key and model can be used.
 *
 * @param subject what the failure is about, worded to sit inside a sentence:
 *   `this text`, `this document`, `these translations`.
 * @throws AppRouteError carrying a 503, a code, and copy for staff.
 */
export const ensureProviderAccess = async (
  subject: string,
): Promise<AITranslationService> => {
  let service: AITranslationService;

  try {
    service = await AIServiceFactory.createService();
  } catch (error) {
    // No active configuration at all: the factory throws rather than
    // answering, and this classifies as `not-configured`.
    throw await reportFailure(error, subject, null);
  }

  const cacheKey = service.getAccessCacheKey();
  const cached = failureCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    throw await reportFailure(cached.error, subject, service.getConfiguredModel());
  }
  if (cached) failureCache.delete(cacheKey);

  const access = await service.checkAccess();
  if (!access.ok) {
    const failure = classifyTranslationProviderError(access.error);
    if (failure === 'misconfigured' || failure === 'exhausted') {
      failureCache.set(cacheKey, {
        error: access.error,
        expiresAt: Date.now() + PROVIDER_ACCESS_FAILURE_TTL_MS,
      });
    }
    throw await reportFailure(access.error, subject, service.getConfiguredModel());
  }

  failureCache.delete(cacheKey);

  return service;
};

/**
 * A billed, minimal generation used only at save/activation time. Free model
 * lookups cannot prove that an account is entitled to generate with a model
 * (Google in particular may list a model and still refuse generation).
 */
export const verifyProviderEntitlement = async (
  config: AIConfiguration,
): Promise<void> => {
  const service = AIServiceFactory.createServiceFromConfiguration(config);
  const result = await service.verifyEntitlement();
  if (!result.ok) {
    throw providerFailureError(result.error, {
      subject: 'this configuration',
      model: service.getConfiguredModel(),
    });
  }
};

/**
 * Turn a provider error into the route error, raising the administrator alert
 * on the way. The alert is best-effort and throttled; it must never replace
 * the error the caller is about to receive.
 */
export const reportFailure = async (
  error: unknown,
  subject: string,
  model: string | null,
) => {
  const routeError = providerFailureError(error, { subject, model });
  await raiseProviderAlert(routeError.failure, model);
  return routeError;
};
