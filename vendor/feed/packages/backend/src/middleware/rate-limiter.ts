// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Request, Response, NextFunction } from 'express';
import { TOKEN_LIMITS } from '../config/limits';
import { calculateInputMetrics, calculateOutputMetrics } from '../services/token/calculation';

interface RequestStore {
  [key: string]: {
    requestCount: number;
    tokenCount: number;
    resetTime: number;
  };
}

const requests: RequestStore = {};

export const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
  const now = Date.now();
  // This middleware counts tokens; it does not price them. The counting
  // functions want a config object, so it is given one with no prices at all
  // rather than plausible-looking wrong ones.
  //
  // It previously carried `TOKEN_RATES[MODEL_NAME]` — 0.00000015 and
  // 0.0000006, which are already *per token* — under `unitPrice: 'per_1m'`,
  // so `convertToPerTokenRate` divided them by a million a second time. The
  // resulting costs were wrong by a factor of 10^6. Nothing read them (only
  // `.tokenCount` is used below), so nothing was ever charged or limited on
  // that basis, which is exactly why it survived: a live middleware on ten
  // data-import routes carrying prices wrong by a millionfold, one field
  // away from being believed.
  const tokenCountingConfig = { inputCost: 0, outputCost: 0, unitPrice: 'per_1m' };

  // Initialize or reset if window expired
  if (!requests[ip] || now > requests[ip].resetTime) {
    requests[ip] = {
      requestCount: 0,
      tokenCount: 0,
      resetTime: now + TOKEN_LIMITS.RATE_LIMITS.WINDOW_MS
    };
  }

  const requestData = requests[ip];
  requestData.requestCount++;

  // Estimate tokens for this request
  let estimatedTokens = 0;
  if (req.body?.text && req.body?.targetLanguage) {
    const inputMetrics = calculateInputMetrics(req.body.text, req.body.targetLanguage, tokenCountingConfig);
    // Estimate output tokens (typically similar to input for translations)
    const outputMetrics = calculateOutputMetrics(req.body.text, tokenCountingConfig);
    estimatedTokens = inputMetrics.tokenCount + outputMetrics.tokenCount;
  }

  // Update token count
  requestData.tokenCount += estimatedTokens;

  // Check request rate limit
  if (requestData.requestCount > TOKEN_LIMITS.RATE_LIMITS.RPM) {
    const error = new Error('You\'ve made too many requests in a short time. Please wait a minute and try again.') as Error & { statusCode?: number };
    error.statusCode = 429;
    return next(error);
  }

  // Check token rate limit
  if (requestData.tokenCount > TOKEN_LIMITS.RATE_LIMITS.TPM) {
    const error = new Error('You\'ve reached the maximum amount of text we can process right now. Please wait a minute and try again.') as Error & { statusCode?: number };
    error.statusCode = 429;
    return next(error);
  }

  // Add OpenAI-style rate limit headers
  const resetSeconds = Math.ceil((requestData.resetTime - now) / 1000);
  res.setHeader('x-ratelimit-limit-requests', TOKEN_LIMITS.RATE_LIMITS.RPM.toString());
  res.setHeader('x-ratelimit-limit-tokens', TOKEN_LIMITS.RATE_LIMITS.TPM.toString());
  res.setHeader('x-ratelimit-remaining-requests', (TOKEN_LIMITS.RATE_LIMITS.RPM - requestData.requestCount).toString());
  res.setHeader('x-ratelimit-remaining-tokens', (TOKEN_LIMITS.RATE_LIMITS.TPM - requestData.tokenCount).toString());
  res.setHeader('x-ratelimit-reset-requests', resetSeconds.toString());
  res.setHeader('x-ratelimit-reset-tokens', resetSeconds.toString());

  next();
};
