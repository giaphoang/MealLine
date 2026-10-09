// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Base URLs for the AI services FEED can talk to.
 *
 * `GET /api/ai-config/models` also returns these, and `useModelCatalogue`
 * exposes them — but the Add dialog computes its `initialData` synchronously
 * in a `useMemo` before any request has been made, so it needs an answer that
 * does not depend on the network.
 *
 * This is deliberately not a re-introduction of the duplicated model list
 * (ISSUES.md #84). It holds four stable service URLs and no model ids, prices,
 * limits or capabilities; nothing here goes stale when a provider retires a
 * model, which is the failure the catalogue exists to prevent.
 */
export const SERVICE_ENDPOINTS: Record<string, string> = {
  OpenAI: 'https://api.openai.com/v1',
  Anthropic: 'https://api.anthropic.com/v1',
  Google: 'https://generativelanguage.googleapis.com',
  Azure: '' // Custom endpoint required
}

export function getServiceEndpoint(
  serviceType: 'OpenAI' | 'Anthropic' | 'Google' | 'Azure'
): string {
  return SERVICE_ENDPOINTS[serviceType] || ''
}
