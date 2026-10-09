// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { SUPPORTED_LANGUAGES } from '../seed/supported-languages';

/**
 * What FEED knows about each AI model, in one place.
 *
 * This replaces `model-specs.ts`, which held prices and limits in two
 * byte-identical copies with nothing enforcing that they agree (ISSUES.md
 * #84). Both copies are deleted now: the providers read this module directly,
 * the configuration dialogs read it over `GET /api/ai-config/models`, and a
 * test fails if a second list reappears. It carries the same facts, plus the
 * two kinds of knowledge the duplicated file could not express.
 *
 * **Lifecycle**, because a model's availability changes under us. A provider
 * withdraws a model, or stops offering it to new accounts, and FEED finds out
 * when a translation fails. Recording a shutdown date and a replacement lets
 * the interface say so first.
 *
 * **Capabilities**, because what a model accepts is not derivable from its
 * name. Every one of these was measured against a live API on 2026-09-11
 * rather than read off a documentation page, and three of them contradicted
 * what the docs implied:
 *
 *   - `claude-sonnet-5` refuses `temperature` outright — its presence, not
 *     its value, so sending the default does not help.
 *   - `claude-sonnet-5` refuses an assistant-message prefill.
 *   - `gpt-5.6-luna` refuses `reasoning_effort: 'minimal'`, which is FEED's
 *     spec default for `gpt-5-nano`, and refuses `max_tokens` in favour of
 *     `max_completion_tokens`.
 *
 * String tests on model ids cannot carry that. `model.includes('-4-5-')` was
 * the previous answer and it silently excluded every dateless Claude 5 id.
 *
 * The providers and the dialogs both read this now. What is left is the
 * catalogue's *contents*: the 2026 refresh that retires the models the
 * vendors have withdrawn and adds their replacements.
 */

/** Where a model is in its life, and what to say when it is ending. */
export type ModelLifecycleStatus =
  /** Generally available, and the current recommendation. */
  | 'active'
  /** Available and priced, but superseded; kept so saved rows still resolve. */
  | 'legacy'
  /** A provider preview: expect it to change or vanish within months. */
  | 'preview'
  /** The provider has announced its end. */
  | 'deprecated'
  /** Gone. Requests fail. */
  | 'retired';

/**
 * How much a model costs relative to the work FEED does with it. Drives the
 * warning on models that cost many times what translation needs.
 * `frontier` means an output price at or above $20 per 1M tokens.
 */
export type ModelCostTier = 'economy' | 'standard' | 'frontier';

/** Whether a model accepts `temperature` / `top_p`, and in what combination. */
export type SamplingSupport =
  /** Both may be sent. */
  | 'supported'
  /** One or the other, never both (Claude 4.5). */
  | 'temperature-or-top-p'
  /** Neither may be sent at all (Claude 4.6 and later). */
  | 'unsupported';

/**
 * Every reasoning value any catalogued model accepts, cheapest first.
 *
 * A storage vocabulary, not a per-model allowlist — no model takes all seven,
 * and one value is not known to be accepted by anything FEED can reach.
 * Measured against the live APIs on 2026-09-11:
 *
 *   gpt-5.6-luna / -terra / -sol   none, low, medium, high, xhigh
 *   gpt-6-astra                    low, medium, high, xhigh   (no `none`)
 *   gpt-5-*-2025-08-07             minimal, low, medium, high
 *
 * So `minimal` is valid on the 2025 snapshots and refused by GPT-5.6, while
 * `none` is GPT-5.6's floor and exists nowhere else.
 *
 * `max` is refused by every OpenAI model probed — `400 ... does not support
 * 'max' with this model` — and accepted by Anthropic: `claude-sonnet-5` with
 * `output_config: { effort: 'max' }` answered normally, as it did at `low`.
 * The value is real, and it is Anthropic's alone. Note the two providers
 * spell the same idea differently: OpenAI takes `reasoning_effort` on the
 * request, Anthropic takes `output_config.effort`, which is why this is a
 * shared vocabulary rather than one provider's parameter.
 *
 * The order is the cost order, so an index comparison decides what counts as
 * "above medium" for the D2 warning. What a *given* model accepts is per-entry
 * data — ask `capabilityAccepts`, never this list.
 */
export const REASONING_VALUES = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export type ReasoningValue = (typeof REASONING_VALUES)[number];

/** How a model is asked to think less, or more. */
export type ReasoningControl =
  /** No control, and nothing to send. */
  | { kind: 'none' }
  /** OpenAI's `reasoning_effort`. */
  | { kind: 'effort'; values: readonly string[]; leastCost: string }
  /** Gemini's `thinkingConfig.thinkingLevel`. */
  | { kind: 'thinking-level'; values: readonly string[]; leastCost: string }
  /** Claude's extended thinking: off unless asked. */
  | { kind: 'extended'; leastCost: 'off' }
  /** Claude 5's adaptive thinking: on unless disabled. */
  | { kind: 'adaptive'; values: readonly string[]; leastCost: string; canDisable: boolean };

/** Whether FEED may seed the reply to force a JSON opening brace. */
export type PrefillSupport = 'allowed' | 'rejected';

/** How a language is served by a model, for the coverage warning (D18). */
export type LanguageCoverage = 'evaluated' | 'supported' | 'unsupported';

export interface ModelPricing {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /**
   * The date these prices were last checked against the provider's own page.
   * A stale price does not error; it silently mis-projects the spend limits
   * it feeds, which is why the date is recorded rather than assumed.
   */
  verifiedAt: string;
  /** Set when a provider has announced a change, e.g. Gemini 3.x in 2027. */
  changesOn?: string;
}

export interface ModelLifecycle {
  /**
   * Where the *provider* has put the model. Never FEED's opinion of it — use
   * `offered` for that.
   */
  status: ModelLifecycleStatus;
  /**
   * Whether FEED still presents this model as a choice when creating a
   * configuration. Defaults to true; set false to drop a preset.
   *
   * Separate from `status` because the two answer different questions, and
   * conflating them would require writing something false. The 2026 refresh
   * drops 15 presets, but `gpt-5-mini-2025-08-07` is what production runs and
   * it works until 2026-12-11 — marking it `retired` to get it out of the
   * dialog would claim requests fail when they do not, and would strip the
   * entry production depends on.
   *
   * An unoffered entry stays in `CATALOGUE`, so `findCatalogueEntry` and
   * `capabilitiesFor` keep resolving its prices, limits, capabilities and
   * shutdown date for the saved rows still pointing at it. It simply stops
   * appearing in the list of new choices.
   */
  offered?: boolean;
  /**
   * ISO date the provider has *announced* it stops serving the model.
   *
   * Only ever an announcement. Anthropic publishes a "tentative retirement
   * date" for models it has not deprecated — a floor, phrased "not sooner
   * than" — and three of those were recorded here as though they were
   * announcements. A date under an `active` entry is that mistake, which is
   * why an invariant now ties this field to `deprecated` or `retired`: those
   * are the states in which a provider commits to a date. A floor belongs in
   * `note`.
   */
  shutdownDate?: string;
  /** The catalogue id to move to. Must resolve to another entry. */
  replacement?: string;
  /** Why it is in this state, in one line, for the interface to show. */
  note?: string;
}

export interface ModelCapabilities {
  sampling: SamplingSupport;
  maxTokensField: 'max_tokens' | 'max_completion_tokens';
  reasoning: ReasoningControl;
  prefill: PrefillSupport;
  /** Anthropic classification may force a tool only when explicitly supported. */
  forcedToolUse?: boolean;
  /**
   * The single temperature a model accepts, where the provider fixes one.
   * Distinct from `sampling: 'unsupported'`, which means omit the parameter
   * altogether: here it is sent, but only at this value, and a saved
   * configuration asking for another gets a warning rather than a refusal.
   */
  fixedTemperature?: number;
  /**
   * Ceiling FEED applies to a non-streaming request, below the model's own
   * output limit. The Anthropic SDK refuses a non-streaming call whose
   * expected duration passes ten minutes, and a 128K output limit sails past
   * it.
   */
  nonStreamingOutputCeiling?: number;
}

/**
 * Throughput allowances, used to pre-fill a new configuration's usage limits.
 *
 * Unlike everything else here, these are NOT verified provider facts. Every
 * one is an account-tier-dependent allowance — OpenAI's 200,000 TPM is a
 * tier-1 figure, Google's differ by billing tier — carried forward verbatim
 * from the `model-specs.ts` they replaced so that new configurations keep
 * pre-filling as they always have. They are a starting point an administrator
 * can edit, not a claim about what a given key is entitled to, which is why
 * they carry no `verifiedAt` and must never be treated like `pricing`.
 */
export interface ModelRateLimits {
  tokensPerMinute: number;
  requestsPerMinute: number;
  requestsPerDay?: number;
}

export interface CatalogueEntry {
  /** The exact id sent to the provider. */
  id: string;
  /** What an administrator sees. */
  displayName: string;
  provider: 'OpenAI' | 'Anthropic' | 'Google';
  pricing: ModelPricing;
  contextWindow: number;
  maxOutputTokens: number;
  lifecycle: ModelLifecycle;
  costTier: ModelCostTier;
  capabilities: ModelCapabilities;
  /** Starting point for a new configuration's usage limits. See the type. */
  rateLimits?: ModelRateLimits;
  /**
   * Language coverage, by every one of FEED's own language names. A provider
   * support claim is `supported`; only a successful FEED probe is
   * `evaluated`; an explicit exclusion is `unsupported`.
   */
  languages: Record<string, LanguageCoverage>;
}

type CatalogueEntryWithoutLanguages = Omit<CatalogueEntry, 'languages'>;

/** The service endpoints a provider is reached on. */
export const SERVICE_ENDPOINTS = {
  OpenAI: 'https://api.openai.com/v1',
  Anthropic: 'https://api.anthropic.com/v1',
  Google: 'https://generativelanguage.googleapis.com',
  Azure: '',
} as const;

/**
 * FEED's language names and legacy two-letter aliases, in the same catalogue
 * module that decides whether a provider/model may receive them.
 */
export const LANGUAGE_NAMES_BY_CODE: Readonly<Record<string, string>> = {
  en: 'English', zh: 'Chinese', es: 'Spanish', hi: 'Hindi', ar: 'Arabic', pt: 'Portuguese',
  bn: 'Bengali', ru: 'Russian', ja: 'Japanese', pa: 'Punjabi', de: 'German', fr: 'French',
  ur: 'Urdu', id: 'Indonesian', it: 'Italian', tr: 'Turkish', vi: 'Vietnamese', fa: 'Persian',
  th: 'Thai', ko: 'Korean', ta: 'Tamil', sw: 'Swahili', mr: 'Marathi', te: 'Telugu',
  gu: 'Gujarati', pl: 'Polish', uk: 'Ukrainian', ml: 'Malayalam', ro: 'Romanian', nl: 'Dutch',
  hu: 'Hungarian', el: 'Greek', cs: 'Czech', sv: 'Swedish', tl: 'Tagalog', kk: 'Kazakh',
  da: 'Danish', sk: 'Slovak', sl: 'Slovenian', sr: 'Serbian', fi: 'Finnish', bg: 'Bulgarian',
  no: 'Norwegian', mk: 'Macedonian', lt: 'Lithuanian', lv: 'Latvian', hr: 'Croatian', so: 'Somali',
  sq: 'Albanian', hy: 'Armenian', bs: 'Bosnian', ka: 'Georgian', am: 'Amharic', my: 'Burmese',
  ms: 'Malay', et: 'Estonian', ca: 'Catalan', mn: 'Mongolian', kn: 'Kannada',
};

const LANGUAGE_BY_LOWERCASE = new Map(
  SUPPORTED_LANGUAGES.map(({ name }) => [name.toLowerCase(), name])
);

export const normalizeCatalogueLanguage = (language: string): string => {
  const trimmed = language.trim();
  const lowered = trimmed.toLowerCase();
  return LANGUAGE_NAMES_BY_CODE[lowered] ?? LANGUAGE_BY_LOWERCASE.get(lowered) ?? trimmed;
};

// Preserve the providers' previous runtime allowlists while moving their one
// authoritative representation here. These are provider-published/support
// claims, not successful FEED probes, so they are `supported`, not
// `evaluated`. D29's live matrix promotes individual model/language pairs only
// after a real generation succeeds.
const UNSUPPORTED_BY_PROVIDER: Record<CatalogueEntry['provider'], ReadonlySet<string>> = {
  OpenAI: new Set(),
  Anthropic: new Set(['Tagalog', 'Somali']),
  Google: new Set(['Tagalog', 'Somali']),
};

const coverageForProvider = (
  provider: CatalogueEntry['provider']
): Record<string, LanguageCoverage> => Object.fromEntries(
  SUPPORTED_LANGUAGES.map(({ name }) => [
    name,
    UNSUPPORTED_BY_PROVIDER[provider].has(name) ? 'unsupported' : 'supported',
  ])
);

const PROVIDER_LANGUAGE_COVERAGE: Record<
  CatalogueEntry['provider'],
  Record<string, LanguageCoverage>
> = {
  OpenAI: coverageForProvider('OpenAI'),
  Anthropic: coverageForProvider('Anthropic'),
  Google: coverageForProvider('Google'),
};

/**
 * The catalogue as it stands today — the models `model-specs.ts` offered
 * before it was deleted, restated with lifecycle and capabilities. Retiring
 * these and adding the 2026 families is a separate commit, so that this one
 * can be read as "the same list, described properly".
 *
 * "The same list" was not true when this module was introduced: it restated 11
 * of the 16 models the dialog offers, silently dropping the whole gpt-4.1 and
 * gpt-4o family. They are here now, and a drift test holds the two lists to
 * each other so the gap cannot reopen.
 *
 * Every price below was re-checked against the provider's own pricing page on
 * 2026-09-11, per AGENTS.md. That check found one error worth naming: FEED had
 * carried `gpt-4o` at $5.00/$20.00 since it was added, against OpenAI's actual
 * $2.50/$10.00. Nothing ever failed — a wrong price does not error, it just
 * mis-projects the spend limits it feeds, and at $20.00 it also sat exactly on
 * the `frontier` threshold and would have raised a cost warning on a model
 * that does not warrant one.
 */
const CATALOGUE_BASE: readonly CatalogueEntryWithoutLanguages[] = [
  // ---------------- OpenAI ----------------
  //
  // The 2026 refresh: four offered presets, and eight entries kept for
  // resolution but no longer presented as choices (`offered: false`).
  //
  // Every fact below was measured against the API on 2026-09-12, because the
  // models page got two of them wrong: it renders the effort values as one
  // run-together string, which reads as though `max` were available on the
  // GPT-5.6 family and `none` on gpt-6-astra. Neither is true.
  //
  //   gpt-5.6-luna  + max  -> 400 "does not support 'max' with this model"
  //   gpt-5.6-terra + max  -> 400, same
  //   gpt-6-astra   + none -> 400 "Supported values are: low, medium, high, xhigh"
  //   gpt-5.6-terra + none -> OK      gpt-5.6-sol + none -> OK
  //
  // `rateLimits` is omitted on all four: nothing publishes per-model
  // allowances for them, and inventing figures would pre-fill a new
  // configuration's usage limits with fiction.
  {
    id: 'gpt-5.6-luna',
    displayName: 'gpt-5.6-luna',
    provider: 'OpenAI',
    pricing: { input: 0.2, output: 1.2, verifiedAt: '2026-09-12' },
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    lifecycle: {
      status: 'active',
      note: "OpenAI's cost-sensitive 5.6 model, and FEED's default. No deprecation announced.",
    },
    costTier: 'economy',
    capabilities: {
      sampling: 'unsupported',
      maxTokensField: 'max_completion_tokens',
      // No `minimal` — it is the 2025 snapshots' floor and is refused here.
      reasoning: {
        kind: 'effort',
        values: ['none', 'low', 'medium', 'high', 'xhigh'],
        leastCost: 'none',
      },
      prefill: 'allowed',
    },
  },
  {
    id: 'gpt-5.6-terra',
    displayName: 'gpt-5.6-terra',
    provider: 'OpenAI',
    pricing: { input: 2.0, output: 12.0, verifiedAt: '2026-09-12' },
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    lifecycle: { status: 'active', note: 'Balanced 5.6 model. No deprecation announced.' },
    costTier: 'standard',
    capabilities: {
      sampling: 'unsupported',
      maxTokensField: 'max_completion_tokens',
      reasoning: {
        kind: 'effort',
        values: ['none', 'low', 'medium', 'high', 'xhigh'],
        leastCost: 'none',
      },
      prefill: 'allowed',
    },
  },
  {
    id: 'gpt-5.6-sol',
    displayName: 'gpt-5.6-sol',
    provider: 'OpenAI',
    pricing: { input: 4.0, output: 20.0, verifiedAt: '2026-09-12' },
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    lifecycle: { status: 'active', note: 'For complex work. No deprecation announced.' },
    // $20.00 output is exactly the D7 threshold, so this carries the frontier
    // cost warning: far more model than translation or classification needs.
    costTier: 'frontier',
    capabilities: {
      sampling: 'unsupported',
      maxTokensField: 'max_completion_tokens',
      reasoning: {
        kind: 'effort',
        values: ['none', 'low', 'medium', 'high', 'xhigh'],
        leastCost: 'none',
      },
      prefill: 'allowed',
    },
  },
  {
    id: 'gpt-6-astra',
    displayName: 'gpt-6-astra',
    provider: 'OpenAI',
    pricing: { input: 10.0, output: 50.0, verifiedAt: '2026-09-12' },
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    lifecycle: {
      status: 'active',
      // The plan flagged the id itself as uncertain — the pricing page was
      // said to call it `gpt-5.6-astra`. It does not: both the pricing and
      // models pages print `gpt-6-astra`, and the API answers to it.
      note: 'Frontier flagship, announced 2026-09-03. No deprecation announced.',
    },
    costTier: 'frontier',
    capabilities: {
      sampling: 'unsupported',
      maxTokensField: 'max_completion_tokens',
      // Measured: this one refuses `none`, unlike its 5.6 siblings, so its
      // cheapest setting is `low` — one place a shared family rule would have
      // produced a 400 on every request.
      reasoning: {
        kind: 'effort',
        values: ['low', 'medium', 'high', 'xhigh'],
        leastCost: 'low',
      },
      prefill: 'allowed',
    },
  },
  {
    id: 'gpt-5-nano-2025-08-07',
    displayName: 'gpt-5-nano',
    provider: 'OpenAI',
    rateLimits: { tokensPerMinute: 200000, requestsPerMinute: 500 },
    pricing: { input: 0.05, output: 0.4, verifiedAt: '2026-09-11' },
    contextWindow: 128000,
    maxOutputTokens: 128000,
    lifecycle: {
      status: 'deprecated',
      offered: false,
      shutdownDate: '2026-12-11',
      replacement: 'gpt-5.6-luna',
      note: 'Deprecated 2026-06-11; OpenAI shuts the 2025-08-07 snapshots down on 2026-12-11.',
    },
    costTier: 'economy',
    capabilities: {
      sampling: 'unsupported',
      maxTokensField: 'max_completion_tokens',
      // `minimal` is valid here and rejected on GPT-5.6 — the reason this is
      // per-model data rather than one shared union.
      reasoning: { kind: 'effort', values: ['minimal', 'low', 'medium', 'high'], leastCost: 'minimal' },
      prefill: 'allowed',
    },
  },
  {
    id: 'gpt-5-mini-2025-08-07',
    displayName: 'gpt-5-mini',
    provider: 'OpenAI',
    rateLimits: { tokensPerMinute: 200000, requestsPerMinute: 500 },
    pricing: { input: 0.25, output: 2.0, verifiedAt: '2026-09-11' },
    contextWindow: 128000,
    maxOutputTokens: 128000,
    lifecycle: {
      status: 'deprecated',
      // Dropped as a preset, deliberately NOT marked retired: this is what
      // production runs, and it works until 2026-12-11. The entry stays so
      // that saved row keeps resolving its prices, limits and capabilities.
      offered: false,
      shutdownDate: '2026-12-11',
      replacement: 'gpt-5.6-terra',
      note: 'What production runs today. Shuts down 2026-12-11.',
    },
    costTier: 'economy',
    capabilities: {
      sampling: 'unsupported',
      maxTokensField: 'max_completion_tokens',
      reasoning: { kind: 'effort', values: ['minimal', 'low', 'medium', 'high'], leastCost: 'minimal' },
      prefill: 'allowed',
    },
  },
  {
    id: 'gpt-5-2025-08-07',
    displayName: 'gpt-5',
    provider: 'OpenAI',
    rateLimits: { tokensPerMinute: 200000, requestsPerMinute: 500 },
    pricing: { input: 1.25, output: 10.0, verifiedAt: '2026-09-11' },
    contextWindow: 128000,
    maxOutputTokens: 128000,
    lifecycle: {
      status: 'deprecated',
      offered: false,
      shutdownDate: '2026-12-11',
      replacement: 'gpt-5.6-sol',
    },
    costTier: 'standard',
    capabilities: {
      sampling: 'unsupported',
      maxTokensField: 'max_completion_tokens',
      reasoning: { kind: 'effort', values: ['minimal', 'low', 'medium', 'high'], leastCost: 'minimal' },
      prefill: 'allowed',
    },
  },

  // The gpt-4.1 and gpt-4o families: no reasoning control, ordinary sampling,
  // and `max_tokens` rather than `max_completion_tokens`.
  //
  // Their lifecycles differ, and the difference was got wrong once already:
  // OpenAI's deprecations page lists *dated snapshots*, not families, and FEED
  // configures dated snapshots. Asked about the families it answers "no
  // deprecation"; asked about the ids below it names two of them. So
  // `gpt-4.1-nano-2025-04-14` and `gpt-4o-2024-05-13` shut down 2026-10-23,
  // while the other three carry no announcement and stay `legacy`. Always ask
  // that page about the exact id being catalogued.
  {
    id: 'gpt-4.1-2025-04-14',
    displayName: 'gpt-4.1',
    provider: 'OpenAI',
    rateLimits: { tokensPerMinute: 30000, requestsPerMinute: 500 },
    pricing: { input: 2.0, output: 8.0, verifiedAt: '2026-09-11' },
    contextWindow: 1047576,
    maxOutputTokens: 32768,
    lifecycle: {
      status: 'legacy',
      offered: false,
      // No successor named on purpose: the GPT-5 snapshots are themselves shut
      // down 2026-12-11, so pointing here would send an administrator onto a
      // model with less life left than this one.
      note: 'Superseded by the GPT-5 line. Under no shutdown announcement of its own.',
    },
    costTier: 'standard',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      reasoning: { kind: 'none' },
      prefill: 'allowed',
    },
  },
  {
    id: 'gpt-4.1-mini-2025-04-14',
    displayName: 'gpt-4.1-mini',
    provider: 'OpenAI',
    rateLimits: { tokensPerMinute: 30000, requestsPerMinute: 500 },
    pricing: { input: 0.4, output: 1.6, verifiedAt: '2026-09-11' },
    contextWindow: 1047576,
    maxOutputTokens: 32768,
    lifecycle: {
      status: 'legacy',
      offered: false,
      note: 'Superseded by the GPT-5 line. Under no shutdown announcement of its own.',
    },
    costTier: 'economy',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      reasoning: { kind: 'none' },
      prefill: 'allowed',
    },
  },
  {
    id: 'gpt-4.1-nano-2025-04-14',
    displayName: 'gpt-4.1-nano',
    provider: 'OpenAI',
    rateLimits: { tokensPerMinute: 30000, requestsPerMinute: 500 },
    pricing: { input: 0.1, output: 0.4, verifiedAt: '2026-09-11' },
    contextWindow: 1047576,
    maxOutputTokens: 32768,
    lifecycle: {
      status: 'deprecated',
      offered: false,
      shutdownDate: '2026-10-23',
      replacement: 'gpt-4.1-mini-2025-04-14',
      note: 'Deprecated 2026-04-22; OpenAI shuts this snapshot down 2026-10-23.',
    },
    costTier: 'economy',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      reasoning: { kind: 'none' },
      prefill: 'allowed',
    },
  },
  {
    id: 'gpt-4o-2024-05-13',
    displayName: 'gpt-4o',
    provider: 'OpenAI',
    rateLimits: { tokensPerMinute: 30000, requestsPerMinute: 500, requestsPerDay: 720000 },
    // Was recorded as $5.00/$20.00. OpenAI's pricing page says $2.50/$10.00.
    pricing: { input: 2.5, output: 10.0, verifiedAt: '2026-09-11' },
    contextWindow: 131072,
    maxOutputTokens: 16384,
    lifecycle: {
      status: 'deprecated',
      offered: false,
      shutdownDate: '2026-10-23',
      replacement: 'gpt-4.1-2025-04-14',
      note: 'Deprecated 2026-04-22; shuts down 2026-10-23. Also withdrawn from the ChatGPT interface in February 2026.',
    },
    costTier: 'standard',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      reasoning: { kind: 'none' },
      prefill: 'allowed',
    },
  },
  {
    id: 'gpt-4o-mini-2024-07-18',
    displayName: 'gpt-4o-mini',
    provider: 'OpenAI',
    rateLimits: { tokensPerMinute: 200000, requestsPerMinute: 500, requestsPerDay: 10000 },
    pricing: { input: 0.15, output: 0.6, verifiedAt: '2026-09-11' },
    contextWindow: 131072,
    maxOutputTokens: 16384,
    // Not gpt-4.1-nano: that snapshot shuts down 2026-10-23 and this one is
    // under no announcement, so it would send an administrator onto a model
    // with less life left.
    lifecycle: { status: 'legacy', offered: false, replacement: 'gpt-4.1-mini-2025-04-14' },
    costTier: 'economy',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      reasoning: { kind: 'none' },
      prefill: 'allowed',
    },
  },

  // ---------------- Anthropic ----------------
  //
  // The Claude 5 generation, measured against the API on 2026-09-12. Three
  // things separate it from Haiku 4.5 above, and each one is a 400 if got
  // wrong:
  //
  //   - Sampling. `temperature`, `top_p` and `top_k` return 400 at any
  //     non-default value from Claude Opus 4.7 on, so nothing is sent.
  //   - Prefill. An assistant message seeding `{` returns 400 from Sonnet 4.6
  //     on, so the JSON comes from the prompt instead (D28).
  //   - Thinking. Adaptive and **on by default at effort `high`**, where
  //     everything above is manual `extended` thinking that is off unless
  //     asked. `AnthropicTranslationService.resolveThinking` is what keeps
  //     that from quietly billing `high` on every request.
  //
  // Retirement dates are Anthropic's *tentative* "not sooner than" floors, so
  // they live in `note` — a `shutdownDate` here would claim an announcement
  // that has not been made, and the invariant forbids one on an active entry.
  {
    id: 'claude-sonnet-5',
    displayName: 'claude-sonnet-5',
    provider: 'Anthropic',
    pricing: { input: 2.0, output: 10.0, verifiedAt: '2026-09-12' },
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    lifecycle: {
      status: 'active',
      note: 'Active. Anthropic gives a tentative earliest retirement of 2027-06-30 and has announced no deprecation.',
    },
    costTier: 'standard',
    capabilities: {
      sampling: 'unsupported',
      maxTokensField: 'max_tokens',
      // Measured: `low`, `xhigh` and `max` all answered, and a disabled
      // thinking config answered too — so thinking can be switched off
      // outright, which is what D2 asks for and what the provider sends when
      // no level is chosen.
      reasoning: {
        kind: 'adaptive',
        values: ['low', 'medium', 'high', 'xhigh', 'max'],
        leastCost: 'low',
        canDisable: true,
      },
      prefill: 'rejected',
      forcedToolUse: true,
      nonStreamingOutputCeiling: 20480,
    },
  },
  {
    id: 'claude-opus-5',
    displayName: 'claude-opus-5',
    provider: 'Anthropic',
    pricing: { input: 5.0, output: 25.0, verifiedAt: '2026-09-12' },
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    lifecycle: {
      status: 'active',
      note: 'Active. Tentative earliest retirement 2027-07-24; no deprecation announced.',
    },
    costTier: 'frontier',
    capabilities: {
      sampling: 'unsupported',
      maxTokensField: 'max_tokens',
      // `thinking: {type:'disabled'}` measured OK. Anthropic notes it is
      // refused at `xhigh` and `max` effort, which FEED never sends by
      // default — an administrator choosing those gets the effort, not a
      // disable.
      reasoning: {
        kind: 'adaptive',
        values: ['low', 'medium', 'high', 'xhigh', 'max'],
        leastCost: 'low',
        canDisable: true,
      },
      prefill: 'rejected',
      forcedToolUse: true,
      nonStreamingOutputCeiling: 20480,
    },
  },
  {
    id: 'claude-fable-5-1',
    displayName: 'claude-fable-5.1',
    provider: 'Anthropic',
    pricing: { input: 10.0, output: 50.0, verifiedAt: '2026-09-12' },
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    lifecycle: {
      status: 'active',
      note: 'Active. Tentative earliest retirement 2027-09-01; no deprecation announced.',
    },
    costTier: 'frontier',
    capabilities: {
      sampling: 'unsupported',
      maxTokensField: 'max_tokens',
      // The one that cannot be switched off: `thinking: {type:'disabled'}`
      // returned 400 "not supported for this model. Use thinking.type.adaptive
      // and output_config.effort". So its cheapest state is effort `low`, and
      // `canDisable: false` is what stops the provider trying to disable it.
      reasoning: {
        kind: 'adaptive',
        values: ['low', 'medium', 'high', 'xhigh', 'max'],
        leastCost: 'low',
        canDisable: false,
      },
      prefill: 'rejected',
      // Verified 2026-09-14: Fable rejects tool_choice tool/any.
      // https://platform.claude.com/docs/en/models/fable-5-1/overview
      forcedToolUse: false,
      nonStreamingOutputCeiling: 20480,
    },
  },
  {
    id: 'claude-haiku-4-5-20251001',
    displayName: 'claude-haiku-4.5',
    provider: 'Anthropic',
    rateLimits: { tokensPerMinute: 10000, requestsPerMinute: 50 },
    pricing: { input: 1.0, output: 5.0, verifiedAt: '2026-09-11' },
    contextWindow: 200000,
    maxOutputTokens: 64000,
    lifecycle: {
      status: 'active',
      // No shutdownDate: Anthropic lists this as Active, Deprecated N/A, with
      // a *tentative* retirement "not sooner than" 2026-10-15. That is a floor,
      // not an announcement, and it moves.
      note: 'Active. Anthropic gives a tentative earliest retirement of 2026-10-15 and has announced no deprecation; no Haiku successor exists yet.',
    },
    costTier: 'economy',
    capabilities: {
      // Measured: prefill and one sampling parameter still work here.
      sampling: 'temperature-or-top-p',
      maxTokensField: 'max_tokens',
      reasoning: { kind: 'extended', leastCost: 'off' },
      prefill: 'allowed',
      forcedToolUse: true,
      nonStreamingOutputCeiling: 20480,
    },
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    displayName: 'claude-sonnet-4.5',
    provider: 'Anthropic',
    rateLimits: { tokensPerMinute: 8000, requestsPerMinute: 50 },
    pricing: { input: 3.0, output: 15.0, verifiedAt: '2026-09-11' },
    contextWindow: 200000,
    maxOutputTokens: 64000,
    lifecycle: {
      status: 'legacy',
      offered: false,
      replacement: 'claude-sonnet-5',
      // `legacy` is FEED's editorial stance — superseded by Sonnet 5, and D19
      // retires it from the presets. Anthropic still lists it as Active with
      // no deprecation and a tentative earliest retirement of 2026-09-29.
      note: 'Superseded by Claude Sonnet 5. Anthropic lists it Active, with a tentative earliest retirement of 2026-09-29 and no announced deprecation.',
    },
    costTier: 'standard',
    capabilities: {
      sampling: 'temperature-or-top-p',
      maxTokensField: 'max_tokens',
      reasoning: { kind: 'extended', leastCost: 'off' },
      prefill: 'allowed',
      forcedToolUse: true,
      nonStreamingOutputCeiling: 20480,
    },
  },
  {
    id: 'claude-opus-4-5-20251101',
    displayName: 'claude-opus-4.5',
    provider: 'Anthropic',
    rateLimits: { tokensPerMinute: 8000, requestsPerMinute: 50 },
    pricing: { input: 5.0, output: 25.0, verifiedAt: '2026-09-11' },
    contextWindow: 200000,
    maxOutputTokens: 64000,
    lifecycle: {
      status: 'legacy',
      offered: false,
      replacement: 'claude-opus-5',
      note: 'Superseded by Claude Opus 5. Anthropic lists it Active, with a tentative earliest retirement of 2026-11-24 and no announced deprecation.',
    },
    costTier: 'frontier',
    capabilities: {
      sampling: 'temperature-or-top-p',
      maxTokensField: 'max_tokens',
      reasoning: { kind: 'extended', leastCost: 'off' },
      prefill: 'allowed',
      forcedToolUse: true,
      nonStreamingOutputCeiling: 20480,
    },
  },

  // ---------------- Google ----------------
  //
  // The 2026 refresh. Ids and token limits come from Google's own
  // `models.list`, prices from its pricing page by exact id, and the thinking
  // ranges from live probes on 2026-09-12 — the free metadata reports only
  // `thinking: true`, a boolean, so it can say *whether* a model thinks but
  // never at which levels.
  //
  //   gemini-3.5-flash-lite  minimal(0) medium(12) high(13)   all OK
  //   gemini-3.6-flash       minimal(0) medium(12) high(12)   all OK
  //   gemini-3.8-flash       minimal -> 400 "Thinking level MINIMAL is not
  //                          supported for this model";  low OK (11 thinking)
  //   gemini-3.1-pro-preview minimal -> 400, same;           low OK (11)
  //
  // The bracketed number is thinking tokens spent, and it is the whole D27
  // argument: 3.6 and 3.8 are the same list price, but 3.6 can run at
  // `minimal` for no thinking tokens at all while 3.8 cannot go below `low`
  // and bills 11 on every request, however trivial. For one-sentence
  // translations that is the entire reasoning budget, paid forever.
  //
  // Those bracketed figures hold for Flash and do NOT hold for Pro. Real
  // translations on 2026-09-13 — one three-word string through FEED's own
  // FOOD_TRANSLATION prompt, thinking level `low` sent to both:
  //
  //   gemini-3.8-flash         12 completion tokens   $0.00015
  //   gemini-3.1-pro-preview  262 completion tokens   $0.0034
  //
  // Same level, same prompt, ~22x the output and ~40x the cost of
  // 3.5-flash-lite. So `low OK (11)` is right for 3.8 and wrong for Pro by
  // more than an order of magnitude. Unconfirmed cause: `verifyEntitlement`
  // sends `maxOutputTokens: 64`, which cannot observe 262 — if these probes
  // ran through that path then every figure above is capped, and understates
  // any model that thinks heavily. Treat the table as a floor rather than a
  // measurement until it is re-taken through a real request.
  //
  // Google now says `temperature`, `topP` and `topK` are "no longer
  // recommended" on any 3.x model — advice, not refusal, so `sampling` stays
  // `supported` while `fixedTemperature` pins the value metadata reports
  // (`temperature: 1`, `maxTemperature: 2`). `rateLimits` is omitted: nothing
  // publishes per-model allowances for these, and inventing them would
  // pre-fill a configuration's usage limits with fiction.
  {
    id: 'gemini-3.5-flash-lite',
    displayName: 'gemini-3.5-flash-lite',
    provider: 'Google',
    pricing: { input: 0.3, output: 2.5, verifiedAt: '2026-09-12' },
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    lifecycle: {
      status: 'active',
      note: "FEED's default. GA 2026-07-21; Google's deprecation page announces no shutdown.",
    },
    costTier: 'economy',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      // Whole range measured.
      reasoning: {
        kind: 'thinking-level',
        values: ['minimal', 'low', 'medium', 'high'],
        leastCost: 'minimal',
      },
      prefill: 'allowed',
      fixedTemperature: 1.0,
    },
  },
  {
    id: 'gemini-3.6-flash',
    displayName: 'gemini-3.6-flash',
    provider: 'Google',
    // Google states these double on 2027-01-01, to $1.50 / $7.50.
    pricing: { input: 0.75, output: 3.75, verifiedAt: '2026-09-12', changesOn: '2027-01-01' },
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    lifecycle: {
      status: 'active',
      note: 'GA 2026-07-21, previous generation to 3.8 but able to run at minimal thinking (D27). No shutdown announced. First Google preset the monthly audit should expect to lose.',
    },
    costTier: 'economy',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      // Whole range measured.
      reasoning: {
        kind: 'thinking-level',
        values: ['minimal', 'low', 'medium', 'high'],
        leastCost: 'minimal',
      },
      prefill: 'allowed',
      fixedTemperature: 1.0,
    },
  },
  {
    id: 'gemini-3.8-flash',
    displayName: 'gemini-3.8-flash',
    provider: 'Google',
    pricing: { input: 0.75, output: 3.75, verifiedAt: '2026-09-12', changesOn: '2027-01-01' },
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    lifecycle: {
      status: 'active',
      note: 'Newest Flash, GA 2026-09-02 (D8). No shutdown announced. Cannot disable thinking.',
    },
    costTier: 'economy',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      // Floor measured (`minimal` refused, `low` accepted); `medium` and
      // `high` are Google's documented range, not probed.
      reasoning: {
        kind: 'thinking-level',
        values: ['low', 'medium', 'high'],
        leastCost: 'low',
      },
      prefill: 'allowed',
      fixedTemperature: 1.0,
    },
  },
  {
    id: 'gemini-3.1-pro-preview',
    displayName: 'gemini-3.1-pro-preview',
    provider: 'Google',
    // Tiered, which `ModelPricing` cannot express: $2.00 / $12.00 for prompts
    // at or under 200k tokens, $4.00 / $18.00 above. FEED's translation
    // prompts run to a few hundred tokens, so the lower tier always applies —
    // but the figures here are the lower tier, not a flat rate.
    pricing: { input: 2.0, output: 12.0, verifiedAt: '2026-09-12' },
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    lifecycle: {
      // `preview` drives the badge (D26). Google's previews churn: the model
      // this replaces lasted from 2025-11-18 to 2026-03-09, and
      // `gemini-3.1-flash-lite-preview` managed under three months. It is
      // absent from the deprecation page, which is not the same as safe.
      status: 'preview',
      note: 'Preview. No stable 3.x Pro exists yet. Expect it to change or vanish within months; the monthly audit checks whether it has reached stable.',
    },
    costTier: 'standard',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      // Floor measured; `medium` and `high` documented.
      reasoning: {
        kind: 'thinking-level',
        values: ['low', 'medium', 'high'],
        leastCost: 'low',
      },
      prefill: 'allowed',
      fixedTemperature: 1.0,
    },
  },
  {
    id: 'gemini-2.5-flash-lite',
    displayName: 'gemini-2.5-flash-lite',
    provider: 'Google',
    rateLimits: { tokensPerMinute: 4000000, requestsPerMinute: 2000 },
    pricing: { input: 0.1, output: 0.4, verifiedAt: '2026-09-11' },
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    lifecycle: {
      status: 'deprecated',
      // Withdrawn as a preset: this is the model whose 404 started ISSUES #84.
      // Kept resolvable, because existing projects still reach it and saved
      // configurations point at it.
      offered: false,
      replacement: 'gemini-3.5-flash-lite',
      // Measured with two keys from the same instance on 2026-09-11: an older
      // project reaches this model normally, a newer one gets
      // `404 ... no longer available to new users`. So the model is not gone;
      // it is closed to newer projects. Whether *this* deployment can call it
      // is a fact about its key, which is why entitlement is verified per
      // configuration (D29) rather than declared here.
      note: 'Closed to newer Google projects: they get 404 "no longer available to new users". Existing projects still work.',
    },
    costTier: 'economy',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      reasoning: { kind: 'none' },
      prefill: 'allowed',
    },
  },
  {
    id: 'gemini-2.5-flash',
    displayName: 'gemini-2.5-flash',
    provider: 'Google',
    rateLimits: { tokensPerMinute: 4000000, requestsPerMinute: 2000 },
    pricing: { input: 0.3, output: 2.5, verifiedAt: '2026-09-11' },
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    lifecycle: {
      status: 'deprecated',
      offered: false,
      replacement: 'gemini-3.8-flash',
      note: 'Refused to newer projects, as 2.5 Flash-Lite is.',
    },
    costTier: 'economy',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      reasoning: { kind: 'none' },
      prefill: 'allowed',
    },
  },
  {
    id: 'gemini-2.5-pro',
    displayName: 'gemini-2.5-pro',
    provider: 'Google',
    rateLimits: { tokensPerMinute: 8000000, requestsPerMinute: 2000 },
    pricing: { input: 1.25, output: 10.0, verifiedAt: '2026-09-11' },
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    lifecycle: {
      status: 'deprecated',
      offered: false,
      replacement: 'gemini-3.1-pro-preview',
      note: 'Refused to newer projects.',
    },
    costTier: 'standard',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      reasoning: { kind: 'none' },
      prefill: 'allowed',
    },
  },
  {
    id: 'gemini-3-flash-preview',
    displayName: 'gemini-3-flash-preview',
    provider: 'Google',
    rateLimits: { tokensPerMinute: 4000000, requestsPerMinute: 2000 },
    pricing: { input: 0.5, output: 3.0, verifiedAt: '2026-09-11' },
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    lifecycle: {
      status: 'deprecated',
      offered: false,
      replacement: 'gemini-3.8-flash',
      note: 'Preview, superseded by the stable 3.x Flash line.',
    },
    costTier: 'economy',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      reasoning: {
        kind: 'thinking-level',
        values: ['minimal', 'low', 'medium', 'high'],
        leastCost: 'minimal',
      },
      prefill: 'allowed',
      fixedTemperature: 1.0,
    },
  },
  {
    id: 'gemini-3-pro-preview',
    displayName: 'gemini-3-pro-preview',
    provider: 'Google',
    rateLimits: { tokensPerMinute: 8000000, requestsPerMinute: 2000 },
    pricing: { input: 2.0, output: 12.0, verifiedAt: '2026-09-11' },
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    lifecycle: {
      status: 'retired',
      shutdownDate: '2026-03-09',
      replacement: 'gemini-3.1-pro-preview',
      note: 'Shut down 2026-03-09. Requests fail.',
    },
    costTier: 'standard',
    capabilities: {
      sampling: 'supported',
      maxTokensField: 'max_tokens',
      reasoning: { kind: 'thinking-level', values: ['low', 'high'], leastCost: 'low' },
      prefill: 'allowed',
      fixedTemperature: 1.0,
    },
  },
] as const;

/** Every entry carries a complete answer for every FEED language. */
export const CATALOGUE: readonly CatalogueEntry[] = CATALOGUE_BASE.map((entry) => ({
  ...entry,
  languages: { ...PROVIDER_LANGUAGE_COVERAGE[entry.provider] },
}));

/** The coverage answer used by providers and user-facing warnings. */
export const languageCoverageFor = (
  provider: CatalogueEntry['provider'],
  modelId: string | null | undefined,
  language: string
): LanguageCoverage | undefined => {
  const normalized = normalizeCatalogueLanguage(language);
  const entry = modelId
    ? CATALOGUE.find((candidate) => candidate.id === modelId && candidate.provider === provider)
    : undefined;
  return entry?.languages?.[normalized] ?? PROVIDER_LANGUAGE_COVERAGE[provider][normalized];
};

/** Canonical FEED names a provider/model can receive. */
export const supportedLanguagesFor = (
  provider: CatalogueEntry['provider'],
  modelId?: string | null
): string[] => SUPPORTED_LANGUAGES
  .map(({ name }) => name)
  .filter((name) => languageCoverageFor(provider, modelId, name) !== 'unsupported');

/** One entry by the id sent to the provider. */
export const findCatalogueEntry = (id: string | null | undefined): CatalogueEntry | undefined =>
  id ? CATALOGUE.find((entry) => entry.id === id) : undefined;

/** Everything a provider offers, in catalogue order. */
export const entriesForProvider = (provider: CatalogueEntry['provider']): CatalogueEntry[] =>
  CATALOGUE.filter((entry) => entry.provider === provider);

/** What an administrator should be able to pick: anything not already gone. */
export const selectableEntries = (): CatalogueEntry[] =>
  CATALOGUE.filter(
    (entry) => entry.lifecycle.status !== 'retired' && entry.lifecycle.offered !== false
  );

/** Whether FEED presents this model as a choice for a new configuration. */
export const isOffered = (entry: CatalogueEntry): boolean =>
  entry.lifecycle.status !== 'retired' && entry.lifecycle.offered !== false;

/**
 * The cheapest reasoning setting a model allows, which is FEED's default:
 * translation and classification gain nothing from reasoning, and it is
 * billed as output. Returns null where a model offers no control.
 */
export const leastCostReasoning = (entry: CatalogueEntry): string | null => {
  const { reasoning } = entry.capabilities;
  return reasoning.kind === 'none' ? null : reasoning.leastCost;
};

/** Whether a value is one this model will accept, for validation and the UI. */
export const acceptsReasoningValue = (entry: CatalogueEntry, value: string): boolean => {
  const { reasoning } = entry.capabilities;
  if (reasoning.kind === 'none') return false;
  if (reasoning.kind === 'extended') return value === 'off';
  return reasoning.values.includes(value);
};

/**
 * The same question asked of capabilities rather than an entry, so it can be
 * answered for a model the catalogue has never seen (`capabilitiesFor` supplies
 * the inferred profile).
 */
export const capabilityAccepts = (capabilities: ModelCapabilities, value: string): boolean => {
  const { reasoning } = capabilities;
  if (reasoning.kind === 'none') return false;
  if (reasoning.kind === 'extended') return value === 'off';
  return reasoning.values.includes(value);
};

/** Whether this model has any reasoning control at all. */
export const hasReasoningControl = (capabilities: ModelCapabilities): boolean =>
  capabilities.reasoning.kind !== 'none' && capabilities.reasoning.kind !== 'extended';

/** The values a model accepts, for an error message that tells staff what to do. */
export const acceptedReasoningValues = (capabilities: ModelCapabilities): readonly string[] => {
  const { reasoning } = capabilities;
  if (reasoning.kind === 'none' || reasoning.kind === 'extended') return [];
  return reasoning.values;
};

/** Whether a string names a provider the catalogue describes (Azure does not). */
export const isCatalogueProvider = (value: unknown): value is CatalogueEntry['provider'] =>
  value === 'OpenAI' || value === 'Anthropic' || value === 'Google';

/**
 * What FEED assumes about a model it has never heard of.
 *
 * An administrator can type any id into the Custom field, so the catalogue can
 * never be the *only* answer — something has to decide what to send to
 * `claude-sonnet-5` before Phase 4 gives it an entry. This is that something,
 * and it is deliberately the one place guessing is allowed: three providers
 * each holding their own private string test is the arrangement that produced
 * `-4-5-`, which broke on the first dateless id.
 *
 * Every guess here is conservative, because being wrong costs a failed request
 * rather than a slightly larger bill. Each entry added in Phase 4 shrinks how
 * often this is reached.
 */
const inferCapabilities = (
  provider: CatalogueEntry['provider'],
  id: string
): ModelCapabilities => {
  switch (provider) {
    case 'Anthropic': {
      // Everything from the 4.6 generation on carries a dateless id
      // (`claude-sonnet-5`) and refuses both sampling parameters and prefill;
      // dated ids still take one sampling parameter. Measured 2026-09-11.
      const dated = /-\d{8}$/.test(id);
      return {
        sampling: dated ? 'temperature-or-top-p' : 'unsupported',
        maxTokensField: 'max_tokens',
        reasoning: { kind: 'extended', leastCost: 'off' },
        prefill: dated ? 'allowed' : 'rejected',
        // Applies to any Claude: the ceiling exists to keep a non-streaming
        // request under the SDK's ten-minute guard, and a large output limit
        // is exactly when that matters.
        nonStreamingOutputCeiling: 20480,
      };
    }
    case 'OpenAI': {
      const reasoningFamily = /^(gpt-5|o\d)/.test(id);
      return {
        sampling: reasoningFamily ? 'unsupported' : 'supported',
        maxTokensField: reasoningFamily ? 'max_completion_tokens' : 'max_tokens',
        // `minimal` is deliberately absent. It is valid on the 2025-08-07
        // snapshots and refused by gpt-5.6-luna, so an unrecognised GPT-5-ish
        // id gets the value every member of the family accepts.
        reasoning: reasoningFamily
          ? { kind: 'effort', values: ['low', 'medium', 'high'], leastCost: 'low' }
          : { kind: 'none' },
        prefill: 'allowed',
      };
    }
    case 'Google': {
      // Gemini 3 and later take a thinking level and want temperature 1.0;
      // 2.5 and earlier take neither.
      const thinks = /^gemini-(?:[3-9]|\d{2,})/.test(id);
      return {
        sampling: 'supported',
        maxTokensField: 'max_tokens',
        reasoning: thinks
          ? { kind: 'thinking-level', values: ['low', 'high'], leastCost: 'low' }
          : { kind: 'none' },
        prefill: 'allowed',
        ...(thinks ? { fixedTemperature: 1.0 } : {}),
      };
    }
  }
};

/**
 * What a model accepts: the catalogue's measured answer where there is one,
 * and a documented guess where there is not. This is what providers call —
 * they should never test a model id themselves.
 */
export const capabilitiesFor = (
  provider: CatalogueEntry['provider'],
  id: string
): ModelCapabilities => findCatalogueEntry(id)?.capabilities ?? inferCapabilities(provider, id);

export interface ResolvedReasoning {
  /** The value to send, or undefined to send nothing. */
  value?: string;
  warnings: string[];
}

/**
 * Turn a saved configuration's thinking level into something the model will
 * accept, explaining any substitution.
 *
 * All three providers had their own copy of this, each keyed to one family
 * (`modelFamily === 'gpt-5'`, `=== 'gemini-3'`), so a model outside that family
 * silently ignored a level the administrator had chosen and a level the model
 * rejected produced a 400 rather than a warning.
 */
export const resolveReasoning = (
  capabilities: ModelCapabilities,
  requested?: string | null
): ResolvedReasoning => {
  const warnings: string[] = [];
  const { reasoning } = capabilities;

  if (reasoning.kind === 'none') {
    if (requested) {
      warnings.push(
        `This model has no thinking or reasoning control, so the configured level "${requested}" was not sent.`
      );
    }
    return { warnings };
  }

  // Claude's extended thinking is off unless asked for, and translation gains
  // nothing from it while paying for it as output.
  if (reasoning.kind === 'extended') {
    if (requested && requested !== 'off') {
      warnings.push(
        `Extended thinking stays off for this work, so the configured level "${requested}" was not sent.`
      );
    }
    return { warnings };
  }

  if (!requested) return { value: reasoning.leastCost, warnings };

  if (reasoning.values.includes(requested)) return { value: requested, warnings };

  warnings.push(
    `This model does not accept the thinking level "${requested}" (it accepts ${reasoning.values
      .map((value) => `"${value}"`)
      .join(', ')}). Using "${reasoning.leastCost}".`
  );
  return { value: reasoning.leastCost, warnings };
};
