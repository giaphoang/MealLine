// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

export interface AIConfiguration {
  id: number
  name: string
  type: 'prompt' | 'model' | 'apikey'
  value: string
  description?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  // API Key specific fields
  modelName?: string
  model?: string
  serviceType?: 'OpenAI' | 'Anthropic' | 'Google' | 'Azure'
  endpointUrl?: string
  apiKey?: string
  inputCost?: number | null
  outputCost?: number | null
  unitPrice?: string
  temperature?: number
  topP?: number
  thinkingLevel?: ThinkingLevelValue | null
  maxTokens?: number
  inputTokenLimit?: number | null
  outputTokenLimit?: number | null
  dailyCostLimit?: number | null
  monthlyCostLimit?: number | null
  tokensPerMinute?: number | null
  requestsPerMinute?: number | null
  requestsPerDay?: number | null
}

export interface BulkOperationResult {
  success: number
  failed: number
  errors: string[]
  changed?: number
  skipped?: number
}

export type AIConfigurationType = 'prompt' | 'apikey'

export interface StatusMessage {
  type: 'success' | 'error' | 'info'
  message: string
}

/**
 * The one-time initialization wizard's four screens, in order.
 *
 * `useSetupState` and `InitialSetupWizard` have always imported `SetupStep`
 * and `SetupState` from this module, and this module has never exported them
 * — the hook typechecked as `any` and the wizard's four `setupStep === '…'`
 * comparisons were unchecked string equality. Declared here from the values
 * both files actually use, so a fifth step or a renamed one is now a type
 * error rather than a screen that silently never renders.
 */
export type SetupStep = 'welcome' | 'keygen' | 'validation' | 'complete'

export interface SetupState {
  setupStep: SetupStep
  /** Base64 AES-GCM key, present only between generation and initialization. */
  generatedKey: string | null
  isInitializing: boolean
  initializationError: string | null
}

/**
 * Every thinking / reasoning level FEED can store, cheapest first.
 *
 * Mirrors `REASONING_VALUES` in
 * `packages/backend/src/services/ai/catalogue.ts`, which is authoritative. A
 * storage vocabulary, not a per-model list — no model accepts all seven.
 * `minimal` is valid on the GPT-5 snapshots and Gemini 3 and refused by
 * GPT-5.6; `none` is GPT-5.6's floor; `xhigh` and `max` come from GPT-5.6 and
 * Anthropic's `output_config.effort`. What a given model takes comes from its
 * catalogue entry, and the backend rejects a level the model refuses.
 */
export type ThinkingLevelValue =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

/**
 * The model catalogue served by `GET /api/ai-config/models`.
 *
 * A hand-written mirror of `CatalogueEntry` in
 * `packages/backend/src/services/ai/catalogue.ts`, following the same
 * convention as `AIConfiguration` above and `types/translation.ts`: the two
 * packages share no code, so a backend response shape is restated here with a
 * pointer to its source.
 *
 * Only the fields the configuration dialogs actually read are mirrored. A
 * field the backend adds and this omits is ignored at runtime rather than
 * breaking — but a field that changes *shape* would not be caught by the
 * compiler, so treat the backend file as authoritative when they disagree.
 */
export interface CatalogueModel {
  id: string
  displayName: string
  provider: 'OpenAI' | 'Anthropic' | 'Google'
  pricing: {
    input: number
    output: number
    verifiedAt: string
    changesOn?: string
  }
  contextWindow: number
  maxOutputTokens: number
  lifecycle: {
    status: 'active' | 'legacy' | 'preview' | 'deprecated' | 'retired'
    shutdownDate?: string
    replacement?: string
    note?: string
  }
  costTier: 'economy' | 'standard' | 'frontier'
  capabilities: {
    sampling: 'supported' | 'temperature-or-top-p' | 'unsupported'
    maxTokensField: 'max_tokens' | 'max_completion_tokens'
    reasoning:
      | { kind: 'none' }
      | { kind: 'effort'; values: string[]; leastCost: string }
      | { kind: 'thinking-level'; values: string[]; leastCost: string }
      | { kind: 'extended'; leastCost: 'off' }
      | { kind: 'adaptive'; values: string[]; leastCost: string; canDisable: boolean }
    prefill: 'allowed' | 'rejected'
    fixedTemperature?: number
    nonStreamingOutputCeiling?: number
  }
  rateLimits?: {
    tokensPerMinute: number
    requestsPerMinute: number
    requestsPerDay?: number
  }
  languages: Record<string, 'evaluated' | 'supported' | 'unsupported'>
}

export interface ModelCatalogueResponse {
  /** What an administrator may choose when creating a configuration. */
  models: CatalogueModel[]
  /**
   * Everything else the catalogue still knows: presets the 2026 refresh
   * dropped, plus anything the provider has retired.
   *
   * Saved configurations point at these — production runs
   * `gpt-5-mini-2025-08-07` until 2026-12-11, and `gemini-2.5-flash-lite` is
   * the model whose 404 started ISSUES.md #84 — so the dialog needs their
   * shutdown dates and replacements to explain a row it did not offer. They
   * are deliberately absent from `models` so they cannot be picked afresh.
   *
   * Optional because nothing reads it yet: the lifecycle badges are defect #10
   * and still to build. Declared now so the mirror matches what the endpoint
   * actually sends, rather than drifting quietly from it.
   */
  withdrawn?: CatalogueModel[]
  endpoints: Record<string, string>
}
