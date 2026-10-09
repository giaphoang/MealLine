// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { ValidationType, ApiKeyValidationResult } from './types'

/**
 * Validates API key format and returns error/warning messages
 */
export const validateApiKey = (key: string): ApiKeyValidationResult => {
  if (!key.trim()) return { error: 'API key is required' }
  if (!key.startsWith('sk-') && !key.startsWith('ak-') && !key.startsWith('gsk_')) {
    return { warning: 'Unusual API key detected. AI features will not work without a valid API Key. Please double-check your input.' }
  }
  return {}
}

/**
 * Provider-aware soft validation for API keys.
 * Returns warning-only messages when the format looks unusual for the selected service.
 * Never returns an error for non-empty values (error handling for empty remains in validateApiKey).
 */
export function validateApiKeyForService(
  key: string,
  serviceType?: 'OpenAI' | 'Anthropic' | 'Google' | 'Azure'
): ApiKeyValidationResult {
  const trimmed = key.trim()
  if (!trimmed) return { error: 'API key is required' }

  // Broad, permissive patterns to reduce false positives.
  //
  // Both non-OpenAI patterns were wrong, and warned on almost every valid key
  // an administrator pasted. Neither was "checked against OpenAI's format" —
  // each provider had its own rule, and two of them were simply out of date.
  //
  // Anthropic: the body after the prefix is base64url, the
  // `A–Z a–z 0–9 - _` alphabet, roughly 95 characters. The old class omitted
  // `_`, so at that length nearly every real key contained a character it
  // refused. The sub-prefix is also not always `api03`: `sk-ant-oat01-` is an
  // OAuth token issued by first-party tools, so the sub-prefix is matched
  // loosely rather than pinned to a version that will change again.
  //
  // Google: keys used to be `AIza…`, and Google is migrating to `AQ.Ab…` auth
  // keys, which is now what AI Studio issues. Insisting on `AIza` warned on
  // the format that works — and note the dot, which no character class here
  // previously admitted. Lengths are left generous deliberately: this is a
  // typo catcher, not an authenticator. The provider's own verdict arrives at
  // save time, where entitlement is verified against a real request.
  const patterns: Record<string, RegExp> = {
    OpenAI: /^sk(?:-proj)?-[A-Za-z0-9_\-]{20,}$/,
    Anthropic: /^sk-ant-(?:[A-Za-z0-9]+-)?[A-Za-z0-9_\-]{20,}$/i,
    Google: /^(?:AIza[0-9A-Za-z_\-]{30,60}|AQ\.[0-9A-Za-z_\-.]{20,})$/
  }

  if (serviceType && patterns[serviceType]) {
    const ok = patterns[serviceType].test(trimmed)
    if (!ok) {
      return { warning: `This doesn’t look like a typical ${serviceType} API key. Please double-check the value. You can continue and verify later.` }
    }
    return {}
  }

  // Fallback to existing soft check when serviceType not provided
  return validateApiKey(trimmed)
}

/**
 * Validates URL format
 */
export const validateUrl = (url: string): string | undefined => {
  if (!url.trim()) return undefined
  try {
    new URL(url)
    return undefined
  } catch {
    return 'Please enter a valid URL'
  }
}

/**
 * Generic field validation function
 */
export const validateField = (field: string, value: string, type: ValidationType = 'required'): string | undefined => {
  switch (type) {
    case 'required':
      return !value.trim() ? `${field} is required` : undefined
    case 'model':
      return !value.trim() ? 'Model identifier is required' : undefined
    case 'apikey':
      const result = validateApiKey(value)
      return result.error
    case 'url':
      return validateUrl(value)
    case 'name':
      const trimmed = value.trim()
      if (!trimmed) return 'Configuration name is required'
      if (trimmed.length < 3) return 'Name must be at least 3 characters'
      if (trimmed.length > 100) return 'Name must be 100 characters or less'
      return undefined
    case 'prompt':
      const promptTrimmed = value.trim()
      if (!promptTrimmed) return 'System prompt is required'
      if (promptTrimmed.length > 1783) return 'System prompt must be 1,783 characters or less'
      return undefined
    default:
      return undefined
  }
}
