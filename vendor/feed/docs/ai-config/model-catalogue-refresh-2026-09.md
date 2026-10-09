# AI Model Catalogue Refresh — Discovery and Plan

**Status**: Phases 1–4 delivered. **Phase 5's small-request sweep ran on
2026-09-13** — all seven request types against all twelve models, 83 requests
for $0.1022, turning up three defects of its own (recorded in ISSUES.md).
Those findings are fixed, and the local feature pass completed on 2026-09-14:
Fable classification, DOCX translation, Arabic builder PDF, large bulk retry,
and long-document classification. Busy responses are covered by fixtures
through the real error handler. On September 14 the user directed a stable
**1.8.0** release, skipped the separate Node 24 deployment stage, and explicitly
excluded live production AI tests. Fresh production API keys and model setup
are the user's responsibility. Those Cloudflare feature checks are omitted,
not claimed as passed. Deployment verification covers health, migrations,
image identity and version. Evidence and rollout:
[`phase5-validation-2026-09-14.md`](phase5-validation-2026-09-14.md).
Production moves off `gpt-5-mini` before 2026-12-11.
Fifteen commits across 2026-09-11 and 2026-09-12 — honest provider errors and
administrator alerts, Node 24, the three SDK upgrades, the server-authoritative
catalogue, providers and dialogs both reading it, both `model-specs.ts` copies
deleted, D2's thinking defaults, and the contents refresh itself: 27 entries,
**12 offered — four per provider** — and 15 withheld. FEED's default model is
`gemini-3.5-flash-lite`, no longer the `gemini-2.5-flash-lite` whose 404
prompted this document.

Sections below are marked where the code has overtaken the plan; where a
section still reads in the future tense, it has not been built. Every defect in
the list below is fixed, and every secondary stale list has been retired.
Phase 5's small-request sweep has run as well — but not the phase, which also
covers the feature pass, the docs and the release. Outstanding: verification
through Cloudflare and staged deployment, including production's move off
`gpt-5-mini`. The three defects the sweep itself found are fixed.
**Tracks**: ISSUES.md #84 · roadmap v1.9.5 ("LLM catalogue and pricing audit")
**Companion**: [`translation-efficiency-and-local-models.md`](translation-efficiency-and-local-models.md)
— prompt size, thinking-token cost, caching, and a local TranslateGemma option.
**Provider facts checked**: 2026-09-11, and re-checked per exact model id on
2026-09-12 when each entry was written, against each provider's own model,
pricing and deprecation pages (sources at the end) — plus live probes for every
capability a page could not settle. Prices and dates move; re-check them on the
day the catalogue is edited and record that date in the catalogue itself.

Three things that check caught, all of which a page had stated otherwise:
`gpt-4o` priced at $5.00/$20.00 against an actual $2.50/$10.00; the OpenAI
models page implying `max` on the GPT-5.6 family and `none` on `gpt-6-astra`,
both refused with a 400; and Anthropic's tentative "not sooner than" dates
recorded as though they were announced shutdowns.

## What was reported

Google no longer lets new projects call Gemini 2.5 Flash-Lite, FEED's default
Google model. An administrator configured Gemini 3.5 Flash-Lite through the
**Custom** model option with a valid API key, and translation still failed with
*"Invalid API key configuration. Please check your AI settings."*

Production context (from the administrator, 2026-09-11): production runs
OpenAI **`gpt-5-mini`** as a fallback. Gemini 2.5 Flash-Lite requests began
failing when Google moved the account from post-pay to prepay (the #80
incident). `gpt-5-mini` gives similar translation quality but is slower and
more expensive, and OpenAI shuts it down on **2026-12-11**.

Also from the administrator: production has **nine enabled languages** of 59
supported — English, Chinese, Spanish, Arabic, Russian, Vietnamese, Persian,
Swahili, and Ukrainian. Confirmed from production's
`GET /api/languages/enabled` on 2026-09-11; the stored name is `Persian`.
Bosnian also appeared there, enabled for testing only, and has since been
switched off. The
production Raspberry Pi 5 has **4 GB** of RAM. Production's `gpt-5-mini`
configuration runs at Thinking Level `minimal`, so its slowness belongs to the
model, not to a setting.

## Decisions so far

| # | Decision | Date |
|---|---|---|
| D1 | Offer flagship models as presets, with a UI warning that they are expensive and may not translate better. | 2026-09-11 |
| D2 | Default thinking to off, or the lowest level a model allows. Warn when a level above Medium is selected, because it raises the cost of every request. | 2026-09-11 |
| D3 | Model-parameter constraints (e.g. no `temperature` / `top_p`) are enforced in both backend and UI, so a forbidden parameter can never reach a request. | 2026-09-11 |
| D4 | Validation uses tiny requests (one sentence, a few strings), not whole-feature workflows. The earlier ~$220 test plan is withdrawn (see "Why the first estimate was wrong"). | 2026-09-11 |
| D5 | No commits until the design decisions in this sweep are final. | 2026-09-11 |
| D6 | A local model is a **fallback** only, never the primary provider. Staff choose it per blocked request (D12). **Shelved — see D16.** | 2026-09-11 |
| D7 | The frontier cost warning covers four models: `gpt-6-astra`, `claude-fable-5-1`, `claude-opus-5`, `gpt-5.6-sol`. The rule that assigns `costTier: frontier`: output price of $20 per 1M tokens or more. | 2026-09-11 |
| D8 | Google's mid tier is `gemini-3.8-flash`. It cannot turn thinking off, so its D2 default is `low`. | 2026-09-11 |
| D9 | SDK plan approved: `@google/genai` → 2.22, `@anthropic-ai/sdk` → 0.125, `openai` → 6.49, one provider per commit; `openai` 7 only after Node 22+. | 2026-09-11 |
| D10 | Node 20 → 24 approved as its own release, never combined with AI changes. | 2026-09-11 |
| D11 | Chinese means Simplified — code `zh-CN`. | 2026-09-11 |
| D12 | A blocking provider error offers **Use local AI model**. Choosing it opens a confirmation that the local model will take much longer; the request runs locally only after that. | 2026-09-11 |
| D13 | The local path supports everything a cloud model does in FEED: single and batch translation, DOCX auto-format classification, administrator-edited prompts, style-boundary instructions, and every builder translation mode. | 2026-09-11 |
| D14 | Local models are prototyped and validated on the development Mac (M5 Max, 128 GB). | 2026-09-11 |
| D15 | Raise an administrator alert whenever a cloud provider reports `exhausted` (out of credit) or `misconfigured` (key or model rejected). Part of Phase 1, and independent of the local model. | 2026-09-11 |
| D16 | **The local model is shelved.** Hosting it well means buying and configuring hardware, which makes it a project of its own. D12–D14 are kept as its design, along with the hybrid approach (TranslateGemma for plain translation plus a general model for everything else) and `AIConfiguration.role` to mark a local configuration. | 2026-09-11 |
| D17 | The shelved local-model design must warn staff when a requested language is not offered locally, distinguishing languages TranslateGemma was evaluated on, languages only the general model handles, and languages neither supports. Details in the companion document. | 2026-09-11 |
| D18 | Every catalogue entry records per-language coverage (`evaluated` / `supported` / `unsupported`). The Languages page and AI Configuration warn when an enabled language is not offered by the active model — at the moment of enabling it or choosing the model, not when a translation fails. | 2026-09-11 |
| D19 | Claude Sonnet 4.5 and Opus 4.5 retire outright, with no hidden `legacy` entries. They were short-lived, and the Claude 5 models are expected to last. | 2026-09-11 |
| D20 | Large bulk retries and long-document classification join the Phase 5 feature pass. If either returns a 524, those routes become the first consumers of a background-job table. | 2026-09-11 |
| D21 | Catalogue maintenance is a standing rule in `AGENTS.md`: audit at every release boundary and at least monthly. | 2026-09-11 |
| D22 | Consolidate into one **server-authoritative catalogue** (option A). | 2026-09-11 |
| D23 | Release order agreed: (1) honest errors and administrator alerts; (2) Node 24; (3) catalogue, SDKs, and thinking defaults, before 2026-12-11. | 2026-09-11 |
| D23 update | After the error stage deployed, the user requested fast-forwarding to stable 1.8.0, omitting the separate Node 24 stage. Production AI tests are excluded; the user will replace API keys and set up production models. | 2026-09-14 |
| D24 | OpenAI list confirmed. Older GPT-5.x models with no deprecation date (e.g. 5.4) are not offered: they cost more than `gpt-5.6-luna` for no benefit to FEED's work. | 2026-09-11 |
| D25 | Anthropic list confirmed. Only the latest generation, plus Haiku 4.5. `claude-fable-5-1` is far more model than translation or classification needs, but it is offered with the frontier warning; administrators decide how to spend their budget. | 2026-09-11 |
| D26 | `gemini-3.1-pro-preview` is offered with a **Preview badge** and validated like every other preset. When Google releases it as stable, administrators can reach the stable id through Custom until the catalogue audit adds it. | 2026-09-11 |
| D27 | `gemini-3.6-flash` is offered alongside `gemini-3.8-flash`. Same price, but it can run at `minimal` thinking where 3.8 cannot go below `low`. Phase 0 still measures both on FEED-shaped requests, to say which suits translation better — **not yet done: the Google account's prepaid credits are depleted**, so no Gemini generation could be measured on 2026-09-11. | 2026-09-11 |
| D28 | Claude prefill is replaced by prompt-instructed JSON, not structured outputs. Measured 2026-09-11: both return clean JSON, but structured outputs charge the schema as input — 220 prompt tokens against 49 for the same translation. Per-model format enforcement stays a Phase 2 catalogue capability. | 2026-09-11 |
| D29 | **Entitlement is verified when a configuration is saved or activated, not when a job starts.** One real request at the moment an administrator chooses the model, where the fix is; the runtime keeps the free model lookup plus a remembered failure. Only non-transient classifications (`misconfigured`, `exhausted`) are remembered, cleared on save and by a short TTL, held in memory. | 2026-09-11 |
| D28 | Long-running translation work gets a **translation-specific job table**, not a generic one, sharing code rather than a schema. Build it when a feature needs it — nothing does today unless the Phase 5 feature pass returns a 524. | 2026-09-11 |

## Open decisions

1. **Release order — agreed 2026-09-11 (D23):**
   1. honest errors and administrator alerts (D15);
   2. Node 24 (D10);
   3. catalogue, SDKs, and thinking defaults, before 2026-12-11.

   The local model is shelved (D16).

Resolved 2026-09-11:
- Claude Sonnet 4.5 and Opus 4.5 retire outright (D19).
- Long-running translation work gets a translation-specific job table, built
  when something needs it (D28).
- Production's language row is `Persian`, so no enabled language is refused
  today. The hand-kept provider language lists still move into the
  catalogue.
- The local-model questions are settled or recorded with its shelved design
  (D16). It is offered only when a staff request fails, never for automatic
  translations, and a local configuration is marked with
  `AIConfiguration.role`.

## Two findings, not one

1. **The catalogue is out of date.** Of the 16 selectable presets, one has
   already been shut down, five have announced shutdown dates between
   2026-10-23 and 2026-12-11, and three more are refused to new Google
   projects. None of the current flagship families from any provider are
   listed.
2. **FEED reports a model the provider refuses as a bad API key.** The routes
   that start translation check the key first, and that check turns every
   provider failure into `false`. So a key that works, calling a model the
   account cannot use, is reported as an invalid key. That wrong message is
   why this looked like a key problem rather than a model problem. The real
   provider error is written only to the backend log.

   *Fixed 2026-09-11 (`71bdee9`).* `ensureProviderAccess` classifies the
   provider's answer and names the model in the message staff read, and the
   check is now a free model lookup rather than a paid generation call.

## Why the Custom model still failed

The repository cannot say which of these it was — the provider's actual
answer is only in the backend log, on the line beginning
`Google AI API key validation failed:`. In order of likelihood:

*Two of the four are no longer possible.* The key check is a free `models.get`
lookup rather than a one-token generation call (`71bdee9`), and the Add dialog
trims a custom model id as Edit always did (`b3e8344`). Whichever cause it was,
the same failure today names the model and says what was refused.

- **The key check is a real model call, and it may be rejected.**
  `GoogleTranslationService.validateApiKey` sends `generateContent` with
  `maxOutputTokens: 1` to the configured model. On Gemini 3.x the output limit
  covers thinking tokens as well as text, so a one-token cap can come back
  empty or be refused; anything but success reads as a bad key.
- **The Google project is not yet enabled for the API, or has no prepaid
  balance.** Both become "invalid key".
- **Whitespace in the custom model id.** `AddAIModelDialog.tsx:90-91` saves
  `customModel` untrimmed; `EditAIModelDialog.tsx:94-95` trims. A trailing
  space in `gemini-3.5-flash-lite ` is a 404.
- **An older configuration is still the one in use.** `AIServiceFactory`
  uses the active configuration with the most recent `updatedAt`.

## Catalogue status by provider (checked 2026-09-11)

"FEED preset" means selectable in `model-specs.ts` today. Entries that are
commented out in `model-specs.ts` are listed for completeness; staff cannot
select them.

### Google (Gemini API)

| FEED preset | Provider status | Replace with |
|---|---|---|
| `gemini-2.5-flash-lite` (**FEED default**) | GA and priced, but answers **404 "no longer available to new users"** for new projects (developer-forum reports from July–August 2026, and this report). No shutdown date on the deprecations page. | `gemini-3.5-flash-lite` |
| `gemini-2.5-flash` | Same refusal to new users reported | `gemini-3.8-flash` (D8) |
| `gemini-2.5-pro` | Same refusal to new users reported | `gemini-3.1-pro-preview` (no GA Pro exists) |
| `gemini-3-flash-preview` | Preview; deprecated, replacement named, no shutdown date | `gemini-3.8-flash` (Google names `3.6-flash`; FEED chose 3.8, D8) |
| `gemini-3-pro-preview` | **Shut down 2026-03-09** — requests fail | `gemini-3.1-pro-preview` |

Current text models (paid-tier list price per 1M tokens):

| Model id | Stage | Input / output | Thinking levels (default) |
|---|---|---|---|
| `gemini-3.5-flash-lite` | Stable | $0.30 / $2.50 | minimal–high (**minimal**) |
| `gemini-3.1-flash-lite` | Stable, **shutdown 2027-05-07** | $0.25 / $1.50 | — skip: already scheduled |
| `gemini-3.6-flash` | Stable | $0.75 / $3.75 † | minimal–high (medium) |
| `gemini-3.7-flash` | Stable | $0.75 / $3.75 † | low–high (medium), cannot be disabled |
| `gemini-3.8-flash` | Stable, newest | $0.75 / $3.75 † | low–high (medium), cannot be disabled |
| `gemini-3.5-flash` | Stable | $1.50 / $9.00 | minimal–high (medium) |
| `gemini-3.1-pro-preview` | Preview | $2.00 / $12.00 (≤200k prompt) | low–high (high), cannot be disabled |

† Google states these prices **double on 2027-01-01**. The Flash-Lite
replacement costs 3× the input and 6.25× the output of 2.5 Flash-Lite; spend
limits sized for 2.5 will trip sooner.

Google also now says `temperature`, `topP`, and `topK` are no longer
recommended on any Gemini 3.x model. FEED sends them.

### OpenAI

| FEED preset | Provider status | Replace with |
|---|---|---|
| `gpt-5-nano-2025-08-07` | Deprecated 2026-06-11, **shutdown 2026-12-11** | `gpt-5.6-luna` |
| `gpt-5-mini-2025-08-07` (**production**) | Deprecated 2026-06-11, **shutdown 2026-12-11** | `gpt-5.6-terra` by tier; `gpt-5.6-luna` by price ($0.20 / $1.20 vs $0.25 / $2.00) |
| `gpt-5-2025-08-07` | Deprecated 2026-06-11, **shutdown 2026-12-11** | `gpt-5.6-sol` |
| `gpt-4.1-nano-2025-04-14` | Deprecated 2026-04-22, **shutdown 2026-10-23** | `gpt-5.6-luna` |
| `gpt-4o-2024-05-13` | Deprecated 2026-04-22, **shutdown 2026-10-23** | `gpt-5.6-sol` |
| `gpt-4.1-2025-04-14`, `gpt-4.1-mini-2025-04-14`, `gpt-4o-mini-2024-07-18` | No shutdown announced; no longer in OpenAI's current model list | Retire from presets |
| *(commented out)* `o3-mini`, `o4-mini` | Shutdown 2026-10-23 | — |
| *(commented out)* `o3` | Shutdown 2026-12-11 | — |

Current models (per 1M tokens; 1.05M context, 128K output; Chat Completions
and Responses both supported):

| Model id | Positioning | Input / output |
|---|---|---|
| `gpt-5.6-luna` | Cost-sensitive | $0.20 / $1.20 |
| `gpt-5.6-terra` | Balanced | $2.00 / $12.00 |
| `gpt-5.6-sol` | Complex work | $4.00 / $20.00 |
| `gpt-6-astra` | Frontier flagship (announced 2026-09-03) | $10.00 / $50.00 |

GPT-5.6 reasoning effort accepts `none`, `low`, `medium` (default), `high`,
`xhigh`, `max`. **`minimal` is not among them**, and it is FEED's default for
`gpt-5-nano`. Confirmed against the API on 2026-09-11:
`400 Unsupported value: 'reasoning_effort' does not support 'minimal' with
this model. Supported values are: 'none', 'low', 'medium', 'high', and
'xhigh'.` So swapping `gpt-5-nano` for `gpt-5.6-luna` in the catalogue
**must** change the effort default in the same edit, or every request 400s.

Measured at the same time, and the reason D2 is worth having: on
`gpt-5.6-luna`, effort `none` answered a one-sentence translation in 19
completion tokens with 0 reasoning tokens, against 97 completion / 72
reasoning at `high` — roughly five times the billable output for the same
sentence.

`max_tokens` is also refused outright (`Unsupported parameter: 'max_tokens'
is not supported with this model. Use 'max_completion_tokens' instead`),
which is what makes the Custom path unusable for these models until it
carries a capability profile: a Custom entry gets no spec and falls back to
`max_tokens`. OpenAI's pricing page names the flagship `gpt-5.6-astra`, while
its models page, announcement, and Bedrock card say `gpt-6-astra`. Confirm the
id and its effort values with `models.list` and one probe before adding it.

### Anthropic

| FEED preset | Provider status | Replace with |
|---|---|---|
| `claude-haiku-4-5-20251001` | Active; retirement **not sooner than 2026-10-15** | Keep; still the only Haiku |
| `claude-sonnet-4-5-20250929` | Active (legacy); retirement **not sooner than 2026-09-29** | `claude-sonnet-5` |
| `claude-opus-4-5-20251101` | Active (legacy); retirement not sooner than 2026-11-24 | `claude-opus-5` |
| *(commented out)* `claude-3-5-haiku-20241022`, `claude-3-7-sonnet-20250219` | Retired 2026-02-19 | — |
| *(commented out)* `claude-sonnet-4-20250514`, `claude-opus-4-20250514` | Retired 2026-06-15 | — |

Current models (per 1M tokens):

| Model id | Input / output | Context / max output | Thinking |
|---|---|---|---|
| `claude-haiku-4-5-20251001` | $1 / $5 | 200K / 64K | Extended (off by default) |
| `claude-sonnet-5` | $2 / $10 | 1M / 128K | Adaptive, **on by default** |
| `claude-opus-5` | $5 / $25 | 1M / 128K | Adaptive, on by default |
| `claude-fable-5-1` | $10 / $50 | 1M / 128K | Adaptive, always on |

Breaking changes that apply to FEED on Claude Opus 4.7 and later (all Claude 5
models):

- `temperature`, `top_p`, `top_k` set to a non-default value return **400**.
- Adaptive thinking is on by default. `max_tokens` covers thinking plus text,
  and thinking tokens are billed as output. `effort` (default `high`) sets
  the depth; `thinking: {type: "disabled"}` turns it off where the model
  allows.
- **Assistant-message prefill returns 400** (from Sonnet 4.6 on).
- A new tokenizer counts roughly 30% more tokens for the same text.
- Refusals arrive as HTTP 200 with `stop_reason: "refusal"`.

## The catalogue after the refresh

Twelve presets: eleven new, plus Claude Haiku 4.5 retained. Prices are per 1M
tokens (input / output), as checked 2026-09-11. "Default thinking" is the
lowest level each model allows, per D2; entries marked *verify* are confirmed
in Phase 0.

### Google — offered (4), retired (5)

| Offered | Role | Price | Default thinking |
|---|---|---|---|
| `gemini-3.5-flash-lite` | **Default** | $0.30 / $2.50 | `minimal` (measured) |
| `gemini-3.6-flash` | Mid tier, least thinking (D27) | $0.75 / $3.75, doubling 2027-01-01 | `minimal` (measured) |
| `gemini-3.8-flash` | Mid tier, newest (D8) | $0.75 / $3.75, doubling 2027-01-01 | `low` — floor measured |
| `gemini-3.1-pro-preview` | Top tier, **Preview badge** (D26) | $2.00 / $12.00 | `low` — floor measured |

**Measured 2026-09-12**, on a temporary key, closing D27's "not yet done":

| Probe | Result |
|---|---|
| `gemini-3.5-flash-lite` @ `minimal` | OK — **0 thinking tokens** |
| `gemini-3.6-flash` @ `minimal` | OK — **0 thinking tokens** |
| `gemini-3.8-flash` @ `minimal` | **400** "Thinking level MINIMAL is not supported for this model" |
| `gemini-3.8-flash` @ `low` | OK — **11 thinking tokens** |
| `gemini-3.1-pro-preview` @ `minimal` | **400**, same message |
| `gemini-3.1-pro-preview` @ `low` | OK — **11 thinking tokens** |
| `gemini-3.5-flash-lite` @ `high` | OK — 13 thinking tokens |

This is stronger evidence for D27 than the documented ranges were. 3.6 and 3.8
are the same list price, and the difference is not merely that 3.6 *allows* a
lower setting: at `minimal` it spends **no** thinking tokens at all, while 3.8
cannot go below `low` and bills 11 thinking tokens as output on every request,
however trivial. For FEED's one-sentence translations that is the whole
reasoning budget, paid on every string, forever.

Free metadata (`models.list`) also reports `thinking: true`, `temperature: 1`,
`maxTemperature: 2`, `topP: 0.95`, `topK: 64` and input/output limits of
1,048,576 / 65,536 for all four — which is where the token limits came from,
and which independently corroborates `fixedTemperature: 1.0` for Gemini 3.x.
Note `thinking` is a boolean there: metadata says *whether* a model thinks,
never at which levels, so the levels above required real requests.

Retired: `gemini-2.5-flash-lite` (the old default), `gemini-2.5-flash`,
`gemini-2.5-pro`, `gemini-3-flash-preview`, `gemini-3-pro-preview`.

#### Google candidates considered (open decision 1)

Google's stable text models on 2026-09-11. Prices are per 1M tokens; thinking
ranges are from Google's thinking guide.

| Model | Google's label | Price | Thinking | Lifecycle | Verdict |
|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | Fastest, most cost-effective 3.5 | $0.30 / $2.50 | minimal–high, default minimal | Named successor to 3.1 Flash-Lite | **Offer (default)** |
| `gemini-3.8-flash` | Newest, most intelligent Flash | $0.75 / $3.75, doubling 2027-01-01 | low–high, cannot be disabled | Newest | **Offer** |
| `gemini-3.6-flash` | Previous generation | $0.75 / $3.75, doubling 2027-01-01 | minimal–high, can be disabled | Google's named successor to 3 Flash Preview | **Offer (D27)** |
| `gemini-3.7-flash` | Previous generation | $0.75 / $3.75, doubling 2027-01-01 | low–high, cannot be disabled | — | Skip: same price and thinking floor as 3.8, and older |
| `gemini-3.5-flash` | "Legacy" | $1.50 / $9.00 | minimal–high | Labelled legacy | Skip: the priciest Flash, and nearest retirement |
| `gemini-3.1-flash-lite` | "Frontier-class at a fraction of the cost" | $0.25 / $1.50 | not verified | **Shutdown 2027-05-07** | Skip: already scheduled to retire |
| `gemini-3.1-pro-preview` (not on the stable list) | Preview | $2.00 / $12.00 | low–high, cannot be disabled | Preview | **Offer with Preview badge (D26)** |

Reasoning:

- **Previous-generation models are where Google withdraws access first.** This
  sweep began because Google refused `gemini-2.5-*` to new projects while
  still documenting them as stable, with no shutdown date. Offering 3.6 or 3.7
  invites the same failure sooner than 3.8, and each extra preset adds seven
  live validation requests, fixtures, and a monthly audit line.
- **3.6 Flash is the one previous-generation model with a real advantage, and
  it is offered (D27).** It can run at `minimal` thinking, while 3.8 cannot go
  below `low` — and D2 wants the least thinking a model allows. At the same
  list price, that makes 3.6 the cheaper and faster of the two for
  high-volume translation, and 3.8 the stronger model where quality matters
  more. Phase 0 still sends the same FEED-shaped requests to 3.8 at `low` and
  3.6 at `minimal`, well under a cent, so the guidance in the model dialog
  rests on measurement rather than on the labels Google gives them. Being a
  previous-generation model, 3.6 is also the first Google preset the monthly
  audit should expect to lose.
- **"Most intelligent" is not "best translator."** Google pitches 3.8 at
  software engineering and agents. The staff review of the lean prompt is also
  where 3.8's translations get compared with 3.5 Flash-Lite's.
- **Preview models churn in months.** Google's own record:
  - `gemini-3-pro-preview`: launched 2025-11-18, shut down 2026-03-09.
  - `gemini-3.1-flash-lite-preview`: 2026-03-03 to 2026-05-25.

  Offering `gemini-3.1-pro-preview` is a maintenance question rather than a
  cost question, unlike Fable 5.1 (D25). Options:
  1. **Stable-only presets.** Drop it until a 3.x Pro reaches stable.
     Administrators who want it can use Custom once Custom carries capability
     profiles.
  2. **Offer it with a Preview badge** and accept that it will need replacing
     within months.

  **Decided: option 2 (D26).** Offer it with a Preview badge, and validate it
  like every other preset.

  The churn risk is handled by the lifecycle machinery rather than by leaving
  the model out:
  - the badge sets expectations;
  - the monthly audit (D21) notices when Google releases it as stable or
    announces a shutdown;
  - a saved configuration on it shows its shutdown date and replacement when
    that time comes;
  - until the catalogue adds the stable id, administrators reach it through
    Custom with the preview entry's capability profile.

### OpenAI — offered (4), retired (8)

| Offered | Role | Price | Default thinking |
|---|---|---|---|
| `gpt-5.6-luna` | **Default** | $0.20 / $1.20 | `none` |
| `gpt-5.6-terra` | Balanced | $2.00 / $12.00 | `none` |
| `gpt-5.6-sol` | **Frontier warning** (D7) | $4.00 / $20.00 | `none` |
| `gpt-6-astra` | **Frontier warning** (D7) | $10.00 / $50.00 | *verify* — and verify the id (`gpt-6-astra` vs `gpt-5.6-astra`) |

Retired: `gpt-5-nano`, `gpt-5-mini` (**production's model**, shutdown
2026-12-11), `gpt-5`, `gpt-4.1-nano`, `gpt-4.1-mini`, `gpt-4.1`,
`gpt-4o-mini`, `gpt-4o-2024-05-13`.

### Anthropic — offered (4), retired (2)

| Offered | Role | Price | Default thinking |
|---|---|---|---|
| `claude-haiku-4-5-20251001` | **Default** (retained) | $1.00 / $5.00 | off |
| `claude-sonnet-5` | Balanced | $2.00 / $10.00 | effort `low` (measured) |
| `claude-opus-5` | **Frontier warning** (D7) | $5.00 / $25.00 | effort `low` — *not probed* |
| `claude-fable-5-1` | **Frontier warning** (D7) | $10.00 / $50.00 | always on; effort `low` (measured) |

**Measured against the API, 2026-09-11.** Anthropic's lifecycle, limits and
effort come from its own pages plus three live probes:

- `claude-sonnet-5` with `output_config: { effort: 'max' }` answered normally,
  and so did `effort: 'low'`. So Claude 5 effort really is `low … max`, and
  D2's cheapest setting is reachable — `leastCost: 'low'`.
- `claude-fable-5-1` with `thinking: { type: 'disabled' }` returned **400**:
  *"thinking.type.disabled is not supported for this model. Use
  thinking.type.adaptive and output_config.effort."* That settles its
  *verify* marker: it is always-on, `canDisable: false`, and the error names
  the exact parameter pair FEED must send.
- **`claude-opus-5` was not probed.** The effort page implies thinking can be
  disabled below `xhigh`, but that is an implication, not a measurement, so
  its marker stands.

Context and output are 1M / 128K for all three, default effort `high`, from
Anthropic's models overview.

> **Prerequisite for the Anthropic third of Phase 4.**
> `AnthropicTranslationService` sends **no** thinking or effort parameter at
> all — its four `messages.create` calls carry only `model`, `max_tokens`,
> optional `temperature`/`top_p`, `system` and `messages`. That is correct
> today, because every catalogued Anthropic model is `kind: 'extended'` and
> FEED keeps extended thinking off by sending nothing. Claude 5 is **adaptive,
> on by default at effort `high`** — so cataloguing these three without
> teaching the provider to send `output_config: { effort }` would have
> `resolveReasoning` resolve `low` and the provider drop it, running every
> request at `high` and billing the thinking as output on models at $10–$50
> per million. D2 inverted, silently, on the most expensive presets. The SDK
> is ready (`@anthropic-ai/sdk` 0.125 exposes `output_config` and
> `ThinkingConfigAdaptive`); the work is FEED's.

Retired: `claude-sonnet-4-5-20250929`, `claude-opus-4-5-20251101` (D19).

**Watch:** Haiku 4.5 is the only retained model with a retirement window
(not sooner than 2026-10-15), and no Claude 5 Haiku exists yet. The next
monthly audit (D21) should check whether a successor has appeared.

### Deleted from the source as well — done (`b17b1f2`, `8dde4f7`)

Seven commented-out entries, all retired or scheduled:
- OpenAI: `o3`, `o3-mini`, `o4-mini`
- Anthropic: `claude-3-5-haiku`, `claude-3-7-sonnet`, `claude-sonnet-4`,
  `claude-opus-4`

These lived inside the two `model-specs.ts` files and went when those files
did — a side effect of the consolidation rather than a deliberate sweep. The
catalogue never carried them, so nothing needs removing from it.

## Counts

**Retire: 15 of 16 selectable presets.** Only `claude-haiku-4-5-20251001`
stays.

> **How "retire" is implemented — `offered: false`, not `status: 'retired'`.**
> Those are two different claims and the refresh needs both. `status` records
> what the *provider* has done, and `retired` means "gone, requests fail";
> `lifecycle.offered` records whether *FEED* still presents the model as a
> choice. Marking `gpt-5-mini-2025-08-07` retired to drop it from the dialog
> would state that requests fail when they do not — it is what production runs
> until 2026-12-11 — and would remove the entry that production's saved
> configuration resolves its prices, limits and capabilities against.
>
> A withheld entry stays in `CATALOGUE`, so `findCatalogueEntry` and
> `capabilitiesFor` keep answering for the rows still pointing at it. It simply
> stops appearing in `selectableEntries()`, which is what
> `GET /api/ai-config/models` serves. Two invariants hold the line: no withheld
> entry may claim `status: 'active'`, and every withheld entry must remain
> resolvable.

| Why | Presets | Count |
|---|---|---|
| Already shut down | `gemini-3-pro-preview` | 1 |
| Refused to new projects | `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro` | 3 |
| Shutdown date announced | `gpt-4.1-nano`, `gpt-4o-2024-05-13` (2026-10-23); `gpt-5-nano`, `gpt-5-mini`, `gpt-5` (2026-12-11) | 5 |
| Deprecated, no date | `gemini-3-flash-preview` | 1 |
| Dropped from provider's current list | `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o-mini` | 3 |
| Superseded; retirement window opens 2026-09-29 / 2026-11-24 | `claude-sonnet-4-5`, `claude-opus-4-5` (retired outright, D19) | 2 |

Also delete the seven commented-out entries — every one is retired or
scheduled. *(Done: they went with the two `model-specs.ts` files.)*

> **This table is right, and re-checking it taught something worth keeping.**
> While adding the gpt-4.1 and gpt-4o families to the catalogue on 2026-09-11,
> a check of OpenAI's deprecations page appeared to contradict two rows —
> reporting no deprecation for either family. It was the question that was
> wrong, not the table: **that page lists dated snapshots, and FEED configures
> dated snapshots.** Asked about `gpt-4.1-nano` it says nothing; asked about
> `gpt-4.1-nano-2025-04-14` it gives deprecation 2026-04-22 and shutdown
> 2026-10-23, exactly as recorded above. Same for `gpt-4o-2024-05-13`.
>
> The wrong answer reached the catalogue before the right one did: both were
> entered as `legacy` with no shutdown date, so FEED briefly told the interface
> that two models dying in six weeks were under no clock. Corrected in the same
> sweep, along with `gpt-4o-mini`'s replacement, which pointed at
> `gpt-4.1-nano` and would have sent an administrator onto a model with less
> life left than the one they were leaving.
>
> Confirmed unannounced, and so genuinely `legacy`: `gpt-4.1-2025-04-14`,
> `gpt-4.1-mini-2025-04-14`, `gpt-4o-mini-2024-07-18`. All three are on the
> pricing page, and their prices are what the catalogue carries. Retiring them
> in Phase 4 would remove working options for no reason — settle each against
> the provider's page, **by exact id**, at the moment Phase 4 edits the
> catalogue.

**Add: 11.** The catalogue goes from 16 presets to 12.

| Provider | New presets | Count |
|---|---|---|
| Google | `gemini-3.5-flash-lite` (default), `gemini-3.6-flash`, `gemini-3.8-flash`, `gemini-3.1-pro-preview` (Preview) | 4 |
| OpenAI | `gpt-5.6-luna` (default), `gpt-5.6-terra`, `gpt-5.6-sol` (frontier), `gpt-6-astra` (frontier) | 4 |
| Anthropic | `claude-sonnet-5`, `claude-opus-5` (frontier), `claude-fable-5-1` (frontier) | 3 |

The Anthropic default stays `claude-haiku-4-5-20251001`.

## Defects the refresh must fix

Each one blocks new models from working correctly, so they belong to this
work, not a later cleanup.

**Status, updated 2026-09-12.** *Fixed:* 1 (`71bdee9`), 2 (`bf3990b`), 3
(`314c04a`), 4 and 9 (`b17b1f2`), 7 — the pre-job key check is now a free model
lookup instead of a paid one-token generation (`71bdee9`) — 8 (`c272c23`) and
10 (`1a4c72e`, `55d4d28`).

Defect 8 was the prerequisite it was described as: `VALID_THINKING_LEVELS` and
`ApiKeyConfigData.thinkingLevel` widened from four values to seven, and
validation moved from a flat allowlist to the model's own capabilities. Without
it GPT-5.6's `none` / `xhigh` / `max` and Claude 5's effort could not have been
stored, and Phase 4 could not have added those models at all.

Defect 10 is answered in both places the UI-behaviour section asks for: a badge
in the configuration list and a line in the dialog, reading one shared module
so they cannot drift.

*Still open:* none. Every defect in the list below is fixed.

Defect 5 was the last, and half of it was already done when it was read: the
backend enforces D3 at all twelve request-building sites across the three
providers. What was missing was the UI half D3 also asks for — `ParametersStep`
now offers temperature and top-p only where the chosen model accepts them.

Defect 6 is fixed. An unpriced configuration remains entirely legal — the Cost
step offers that outright, and a Custom model nobody has prices for is a real
thing to save. What is refused is the pair: a cost limit on a configuration
whose spend FEED cannot measure, which could never fire. Checked on create and
on update, the latter against effective values so an edit cannot arrive at the
same state by clearing prices from a configuration that already has a limit.
Rows saved before the check existed raise a critical alert, once per
configuration rather than once per translation, and keep translating.

1. **Every provider failure is reported as an invalid key.** `validateApiKey`
   returns a boolean and discards the error (`GoogleTranslationService.ts:170`,
   `AnthropicTranslationService.ts:132`, `OpenAITranslationService.ts:204`).
   `translations.ts:291/425/520` and `documents.ts:479/825` then say "Invalid
   API key configuration". Google and Anthropic check the key by calling the
   configured *model*, so a model refusal is indistinguishable from a bad key.
   The #80 classifier (`classifyTranslationProviderError`) is not used on this
   path.
2. **Gemini thinking level has never reached Google.** FEED sends
   `thinkingConfig: { thinking_level }`. The installed `@google/genai` 1.11.0
   copies only `includeThoughts` and `thinkingBudget` out of `thinkingConfig`,
   so the level is silently dropped. The JS field is `thinkingLevel`, added in
   SDK 1.30.0.
3. **Every Claude 5 translation will be refused — twice over.**
   - Sampling: the Anthropic service always sends `temperature` (default 0.7)
     and drops `top_p` only for ids containing `-4-5-`; dateless ids such as
     `claude-sonnet-5` send both.
   - Prefill: translation and batch translation send an assistant message
     beginning `{` (`AnthropicTranslationService.ts:258`, `:460`) and prepend
     `{` to the reply before parsing (`:285`). Prefill returns 400 on Sonnet
     4.6 and later. Structured outputs (`output_config.format`) replace it.
     Classification already uses tool use and is unaffected.
4. **A Custom model gets no model-specific parameter handling.** Temperature,
   top_p, `max_tokens` vs `max_completion_tokens`, reasoning effort, and
   thinking level are all decided by looking up the exact model id. A Custom
   GPT-5.6 model therefore sends `max_tokens`, `temperature: 0.7`, and `top_p`.
5. ~~**Temperature and top_p come from two places.**~~ **Fixed.** The two
   sources are real and unchanged: `AIConfiguration` carries these values and
   so does every `SystemPrompt` row (the seeded "DOCX - Low Temp" prompt sets
   0.3), with `PromptBuilder` merging them — the prompt wins, then the
   configuration, then a default.

   The backend half of D3 turned out to be built already, as a side effect of
   the capability work: all three providers hand the *merged* value to
   `checkAndOverrideParameters`, which reads the model's catalogue
   capabilities, and every request is then built from that resolver's output
   rather than from the prompt configuration. Twelve call sites — translate,
   batch translate, classify, batch classify, for each provider — with no path
   around it. So no forbidden parameter could reach a request, and this entry
   had been stale for some time.

   The UI half was genuinely missing. `ParametersStep` rendered both sliders
   for every model, including the eleven catalogue entries whose `sampling` is
   `unsupported`, inviting staff to set a value the model rejects outright.
   It now mirrors the three resolvers: nothing offered for `unsupported`;
   temperature only for `temperature-or-top-p`, since the backend drops top-p
   there; and a fixed temperature shown rather than offered for Gemini 3.x,
   where `sampling` stays `supported` because Google accepts the parameter but
   FEED replaces the value before sending — top-p is untouched for those and
   stays editable. Following `ThinkingLevelStep`, an absent catalogue entry is
   never grounds for hiding a control: a Custom id, a catalogue still loading,
   and a system prompt (which names no model, since any configuration may use
   it) all render as before.
6. ~~**A Custom model is unpriced unless the administrator types prices in.**~~
   **Fixed.** Two details of the original entry were wrong by the time it was
   read: `applyModelSpecs` no longer exists (the hydrate is `specFor` plus an
   effect in `ServiceStep`, which returns early for Custom because a custom id
   never matches a catalogue entry), and `shared/validation.ts` has no cost
   validation of any kind — not a missing requirement but an absent concern.
   The mechanism was confirmed as described: `convertToPerTokenRate` returns 0
   for an absent price, so `estimatedCost` is 0, `UsageRecord.totalCost` is
   written at the same zero rate, and `(current + additional) > limit` is
   `0 + 0 > limit` on every request, forever.

   Requiring prices would have been the wrong fix — the Cost step offers
   "Leave empty to skip cost tracking" deliberately, and an unpriced Custom
   model is a legitimate thing to save. What is incoherent is the *pair*: a
   cost limit on a configuration FEED cannot measure. The API now refuses that
   combination on create and on update, reading effective values so an edit
   cannot reach it by clearing prices from a configuration that already has a
   limit. Enforcement raises a critical alert once per configuration for rows
   already saved that way — restore-from-backup and the scripts directory
   write rows without passing through the route — and lets the translation
   proceed, because halting the pantry's translations over a configuration
   defect is worse than spend that is uncapped but now visible. The wizard
   says so on the step where the limit is typed.
7. **The key check uses a one-token output limit, and on Google and Anthropic
   it is a paid call** made before every translation job. On thinking-by-default
   models the one-token cap is shared with reasoning. Behaviour unverified.
8. **Parameter unions are too narrow.** `reasoningEffort` / `thinkingLevel`
   allow `minimal | low | medium | high`; `modelFamily` allows
   `gpt-4 | gpt-5 | o-series | legacy | gemini-3`; the backend
   `VALID_THINKING_LEVELS` and the four-stop `ThinkingLevelStep` slider repeat
   that set. GPT-5.6 needs `none`/`xhigh`/`max`, and Claude 5 needs `effort`
   plus a thinking mode.
9. **The Anthropic SDK's non-streaming guard caps `max_tokens`.** 0.57 throws
   "Streaming is strongly recommended" once the expected duration passes ten
   minutes. That is why FEED clamps Claude 4.5 output to 20,480 tokens, and
   the clamp keys on `-4-5-`, so Claude 5 (128K output) is unclamped.
10. **Saved configurations are never migrated.** `AIConfiguration.model` is a
    free string. When a provider retires a model, the saved row fails with no
    hint in the AI Configuration list.

## Requests that can outrun Cloudflare

Production sits behind Cloudflare, which answers **524** when the origin sends
nothing for 125 seconds (current Cloudflare documentation; #67 observed
roughly 100). Three translation paths wait for every provider call before
responding:

- **Bulk retry in Translation Management** (`routes/translations.ts`) awaits
  `Promise.allSettled` over every selected translation.
- **DOCX classification** (`routes/documents.ts:821`) awaits the whole
  `classifySegmentsBatch`.
- **Builder translate-missing-strings** awaits a language's batches.

On today's models a large selection can already reach the ceiling. Slower
reasoning models make it likelier, which D2's low-thinking defaults partly
offset. DOCX *translation* is asynchronous, but its progress lives in an
in-memory map (`services/docx/translation.ts`), so a container restart loses it.

Not a blocker for this sweep. **Agreed (D20):** include a large bulk retry and a
long document's classification in the Phase 5 feature pass on a frontier model. If either
returns a 524, those routes become the first consumers of a background-job
table (companion document).

## Two sources of truth, plus stale copies

The primary catalogue existed twice, identical in data, with nothing enforcing
it. **Both copies are now deleted** — the backend's in `b17b1f2`, the
frontend's in `8dde4f7` — and a test fails if either reappears:

- ~~`packages/backend/src/services/ai/model-specs.ts`~~ — parameter handling
  and `buildOpenAIParameters`. Replaced by `catalogue.ts` and
  `capabilitiesFor`.
- ~~`packages/frontend/src/components/ai-configuration/model-specs.ts`~~ —
  dropdowns, prices, and the limits the dialog pre-fills. Replaced by
  `GET /api/ai-config/models` and `useModelCatalogue`.

`palette-drift.test.ts` already cites this duplication as "the cautionary
precedent". These secondary lists also name retired models:

| Location | Contents |
|---|---|
| ~~`frontend/src/types/multi-service-usage.ts:160-206` (`SERVICE_SPECIFICATIONS`)~~ | **Fixed.** It held `claude-3-*`, `gemini-1.5-*`, `gemini-pro` and `gpt-3.5-turbo`, and this row said "used by cost forecasting" — which overstated it. The forecast imported the constant only to read `.color`; every figure it displays comes from the backend, and `defaultPricing` and `models[]` were read by *nothing*. The invented prices were inert and are deleted. What was live was narrower and never mentioned here: `defaultLimits` filled rate-limit gauges for configurations that had no limits set, and a `defaultModel` fallback would have shown a retired id for a blank model. It is now `SERVICE_COLORS` — one colour per provider, the only thing in it that was ever real. A missing limit is zero, meaning "not configured", and each reader guards for it |
| ~~`GoogleTranslationService.ts:57-63` (`GOOGLE_MODEL_PRICING`)~~ | **Deleted `8dde4f7`.** It was declared and never read — dead since before this audit, and invisible because `noUnusedLocals` is off |
| ~~`backend/src/config/limits.ts`~~, ~~`backend/src/config/limits/index.ts`~~ | **Fixed (`d203c77`).** The table keyed by `gpt-4o-mini`, `gpt-4` and `gpt-3.5-turbo` is gone, along with the thing that made it matter: `getDailyTokenLimit` used to prefer `tokensPerMinute × 60 × 24` and fall back to this table, turning a per-minute *throughput allowance* into a daily *budget*. For GPT-5 mini that was 288 million tokens a day — a limit in name only. Throughput now describes provider rate allowances and nothing else; daily enforcement exists only where an administrator has set an explicit daily cost limit, which matches the same "not configured means no invented number" rule the dashboard adopted. **`index.ts`** was separately deleted as an abandoned fork with zero importers, exporting a `MODEL_MONTHLY_LIMITS` the live file never had |
| ~~`backend/src/config/translation.ts:34`~~ | **Fixed (`d203c77`).** `DEFAULT_MODEL: 'gpt-4o-mini'` is gone; the file names no model |
| ~~`backend/src/services/token/calculation.ts:105/161/192`, `routes/ai-config.ts:724`~~ | **Fixed.** The no-op ternary is replaced by one `ENCODING_MODEL` constant carrying the reason a single encoding is kept: tiktoken ships none for Claude or Gemini, and asking it for a real per-model name would throw on any unknown id and drop through to the much cruder `length / 4` fallback. The ~30% Anthropic bias survives, but only in *estimates* — pre-flight limit checks and the forecast. Recorded spend no longer depends on it: every provider returns authoritative counts, and cost is priced from those. Anthropic was the one provider still recording its tiktoken estimate as `UsageRecord.totalCost` while the real counts sat twenty lines below, and its batch and classification paths priced with a hardcoded `/ 1000000` that ignored `unitPrice` — a `per_1k` configuration recorded a thousandth of what it spent. Both fixed. **The estimate error has now been measured, and it is not the tokenizer.** Two live translations of the same string (2026-09-12): on `gpt-5.6-luna` FEED estimated 39 input tokens against OpenAI's 95 (41% of actual); on `claude-sonnet-5`, 39 against Anthropic's 93 (42%). Two providers agreeing that closely is the evidence: were this per-provider encoding drift, Anthropic — the one tiktoken cannot encode — would be materially worse than OpenAI, and it is not. `calculateInputMetrics` measured a *hardcoded* one-sentence system prompt ("You are a translation service for a nonprofit food pantry…") while the real request was built by `PromptBuilder` from the active `SystemPrompt` row — 376 characters of fields for "Food Items and Categories" before templating. The estimator was measuring text FEED no longer sends. It gates `checkTokenUsage`, so a token limit tripped later than intended; recorded spend was unaffected, being priced from provider counts. **Fixed in `8eaea48`** — though not the way this entry predicted. The estimator is still synchronous: every provider already resolved the real prompt a few lines further down, inside its retry loop, so the resolution is hoisted above the limit check and the prompt handed to `calculateInputMetrics` as an optional argument. That argument also has to enter the cache key, or two configurations translating the same string to the same language would share one estimate. Measured against this deployment's own rows with a four-token input, the stand-in's 41 tokens stand against 143 for `Food Items and Categories` (3.49x), 114 for `DOCX - Low Temp` (2.78x) and 51 for the default template with no row (1.24x) — so the earlier flat ~2.4x, taken from a single live pair, is superseded: this is not a constant to correct with a factor but a spread that scales with how much an administrator has written into the prompt row. One caller keeps the stand-in deliberately: `rateLimiter` throttles per IP before any configuration is resolved. `LimitEnforcementService.calculateCost` double-counted the system prompt on top of all this — halving the input estimate and adding a hardcoded 61 tokens for a prompt already counted — **fixed in `497c652`**, which prices the input whole. Note the correction ISSUES.md records alongside it: the two faults cancel at 122 input tokens, and this deployment's prompts sit above that, so the estimate erred *low* rather than high as first written here. The Anthropic tokenizer bias remains separately unmeasured |
| ~~`backend/scripts/fix-ai-config-token-limits.ts`~~ | **Fixed (`d203c77`).** The one-off script reads `findCatalogueEntry(...).maxOutputTokens` rather than a table of retired ids, so repairing a configuration can no longer write a limit from a model that no longer exists |
| `frontend/.../AddAIModelDialog.tsx:52` | Default model `gemini-2.5-flash-lite` — still, pending Phase 4: no Google entry is `active`, so deriving a default would move new configurations to Anthropic. `thinkingLevel: 'high'` fixed in `b3e8344` |
| `frontend/.../form/AIConfigurationForm.tsx:346` | Placeholder `gpt-4o-mini-2024-07-18` |

### Consolidation options

**A. Server-authoritative catalogue — approved 2026-09-11 (D22), and built
(`9e98ea2`, `b17b1f2`, `8dde4f7`).** One backend module is the
catalogue. `GET /api/ai-config/models` serves it, and a frontend service plus
hook replaces the frontend copy. One divergence from this option as written:
the hook is plain `useState`/`useEffect`, not React Query. `lib/react-query.ts`
exists, but its query keys are dashboard-scoped and the established idiom for a
domain lookup is `hooks/language/useEnabledLanguages.ts`. Entries carry lifecycle metadata
(`status`, `shutdownDate`, `replacement`, `verifiedAt`), a `costTier`, and the
capabilities below. Secondary lists are deleted or derived from it.
*For:* one list in one runtime, so the price the dialog shows is the price the
limits enforce, and the UI's parameter gating (D3) reads the same capabilities
the backend enforces. The list can badge saved models as deprecated or
retired. Within existing patterns. LOTTO, which ports FEED's AI configuration,
can copy one module.
*Against:* the dialog gains a loading and error state, and frontend tests need
a catalogue fixture.

**B. Shared workspace package.** `packages/shared` is imported at build time by
both apps.
*For:* compile-time types, no network call.
*Against:* no shared package exists; the established answer to duplication is
a mirror plus a guard. It changes Vite aliases, both tsconfigs, and the Docker
build context — a deployment change to discuss first.

**C. Keep both files and add a drift-guard test** (as in
`palette-drift.test.ts`).
*For:* afternoon-sized and within pattern.
*Against:* two edits per change, proves agreement not currency, and leaves the
secondary lists alone.

**D. Administrator-editable catalogue in the database.**
*Against:* prices become data that backups carry and restores bring back
stale; a mistyped price silently disables a spend limit. Rejected.

## Catalogue entry shape (built)

Capabilities replace the `modelFamily` string and the `-4-5-` test, so a new
model is described rather than special-cased. Shipped in `9e98ea2` as
`CatalogueEntry`, with two fields beyond this proposal and one that carries no
data yet:

- **Added since.** `fixedTemperature`, for a model that accepts temperature at
  exactly one value (Gemini 3) — distinct from `sampling: 'unsupported'`, which
  means omit the parameter entirely. And `rateLimits`, carried across from
  `model-specs.ts` so new configurations keep pre-filling their usage limits;
  those are account-tier allowances rather than verified provider facts, and
  are marked as such so nobody treats them like `pricing`.
- ~~**Typed but empty.** `languages`.~~ **Populated (`9fbee5c`).** Every entry
  now answers for every FEED language, and the field is required rather than
  optional. Coverage is asserted per *provider* — one table mapped across that
  provider's entries — with the provenance rule kept: a provider's own support
  claim is `supported`, and only a successful FEED probe is `evaluated`. The
  Anthropic and Google exclusions (Tagalog, Somali) are the providers' previous
  runtime allowlists, moved here rather than invented.

  Two consequences worth knowing. Because coverage is per provider, every model
  from one provider inherits identical claims, which is a simplification —
  language support does vary between a flagship and a small model. And because
  the field is now required, "absent means unknown" is no longer expressible:
  an unevaluated pair reads as `supported` on the provider's word, not as a
  gap. D29's live matrix is what promotes an individual model/language pair to
  `evaluated`.

The shape as proposed:

- `id`, `displayName`, `provider`
- `pricing`: input and output per 1M tokens, `verifiedAt`
- `limits`: input tokens, output tokens, and the non-streaming output ceiling
  FEED will use
- `sampling`: `supported` | `temperature-or-top-p` | `unsupported`
- `maxTokensField`: `max_tokens` | `max_completion_tokens`
- `reasoning`: kind (`none` | `effort` | `thinking-level` | `adaptive` |
  `extended`), allowed values, the lowest value (FEED's default per D2),
  whether it can be turned off
- `prefill`: `allowed` | `rejected`
- `lifecycle`: `preview` | `active` | `legacy` | `deprecated` | `retired`,
  `shutdownDate`, `replacement`. `preview` drives the Preview badge (D26).
- `costTier`: `economy` | `standard` | `frontier` (drives the D1 warning;
  `frontier` means an output price of $20 per 1M tokens or more, D7)
- `languages`: the language names FEED may send, mapped to codes, each with a
  coverage state (`evaluated` | `supported` | `unsupported`). This replaces
  the hand-kept per-provider name lists that currently reject `Farsi`.
  - **Decided (D18):** the same field lets the Languages page and AI
    Configuration say when an enabled language is not offered by the active
    model. Staff learn it when enabling the language or choosing the model,
    not when a translation fails.
  - The shelved local model's warning (D17) reads the same field.

A Custom model picks a capability profile from an existing entry and must have
prices before it can be switched on. This is also the path from a preview to
its stable release (D26). An administrator enters the stable id with the
preview entry's profile and the stable price, until the audit adds the stable
model to the catalogue.

## UI behaviour (D1–D3)

- **Parameters step.** Temperature and Top-p render only when `sampling`
  allows them. With `temperature-or-top-p`, choosing one clears the other.
  Where a saved `SystemPrompt` carries a value the active model rejects, the
  backend omits it; it never errors mid-job.
- **Thinking step — built (`b3e8344`).** Lists only the model's allowed values
  (not a fixed four-stop slider). Defaults to off, or the lowest allowed value.
  Selecting a level above Medium shows a calm cost warning with no blocking.
  Implemented by storing *no* level rather than a cheap one, so the backend
  applies each model's own cheapest value and a later model change still gets
  the right default. A model with no reasoning control says so instead of
  offering a setting it would discard.
- **Model selection — built (`1a4c72e`, `55d4d28`).** A `frontier` model shows
  the D1 warning when chosen, and in the configuration list. A `preview` model
  shows a **Preview** badge in both places. A `deprecated` or `retired` model
  shows its shutdown date and replacement, in the dialog and as a list badge.

  Both places read one module, `components/ai-configuration/model-notices.ts`,
  so the list badge and the dialog line are the same sentence rather than two
  phrasings of one fact. Lifecycle and cost are independent: a model can be
  current and expensive (`gpt-6-astra`), or expiring and expensive (Claude
  Opus 4.5), and both notices appear. A dated shutdown reads as `danger` and an
  undated deprecation as `warning`, because only the first is something staff
  can act on before it lands. Nothing renders for a healthy, sensibly priced
  model, for a Custom id, or for a system prompt row.
- **Error copy.** A refused model says the model is unavailable to this
  account and names it; a rejected key says the key was rejected. Both follow
  ASK through the #80 classifier's codes.
- **Language coverage (D18).** Two places warn, and neither blocks:
  - **Languages page:** enabling a language the active model marks
    `unsupported` shows a calm warning naming the model; `supported` without
    evaluation shows a lighter note.
  - **AI Configuration:** choosing a model lists any enabled language it does
    not offer.

  Server-side, a translation job skips an `unsupported` language with its own
  message rather than a provider failure.

## Testing

### Why the first estimate was wrong

The withdrawn ~$220 figure came from a guessed workload, never measured. It
treated each model as if it had to run FEED's whole features (a DOCX document,
nine-language PDF export, 40-string batches in every enabled language) at
about 100K input and 400K output tokens per pass. It assumed reasoning output
would dominate, then multiplied by four for three thinking levels plus a
re-run. That tested FEED's own pipeline once per model, when the pipeline is
the same whatever the model. Only the model contract — request shape, response
shape, errors — varies by model, and a single sentence exercises it.

Measured: FEED's default system prompts are 111–165 tokens (o200k tokenizer).
A one-sentence translation request is about 200–250 input tokens and 15–20
output tokens.

### Coverage, by what the administrator asked for

| Area | How it is proven | Cost |
|---|---|---|
| 1. Every AI operation works on every new model | Live smoke, per model (below) | Pennies |
| 2. Accurate error messages | Recorded provider error bodies → classifier → exact copy; route tests with the real `errorHandler` (as in #80) | $0 |
| 3. Pricing, names, modal content | Catalogue invariants + frontend dialog tests read from the catalogue; prices checked by hand against provider pages and stamped `verifiedAt` (no provider publishes prices through an API) | $0 |
| 4. Parameter constraints | Request-contract tests for every catalogue entry × every operation; UI tests that the controls hide; one live probe per provider proving the provider really rejects the parameter | $0 (+ unbilled probe) |

Also needed:

| Area | How it is proven | Cost |
|---|---|---|
| 5. Usage and cost accounting | Recorded responses carry real usage fields — thinking tokens included (Gemini `thoughtsTokenCount`, OpenAI `reasoning_tokens`, Anthropic `output_tokens`); assert recorded cost = usage × catalogue price, and that a daily limit trips | $0 |
| 6. New response shapes | Recorded fixtures: Claude thinking blocks ahead of text, `stop_reason: "refusal"`, output truncated at the token cap → a clear error rather than a JSON parse failure | $0 |
| 7. Thinking defaults and warnings (D2) | Contract tests that the lowest level is what is sent when nothing is chosen; UI tests for the above-Medium and frontier warnings | $0 |
| 8. Saved configurations on retired models | List badge and error copy tests; a migration note for production's `gpt-5-mini` before 2026-12-11 | $0 |
| 9. Catalogue drift in future | Audit script comparing catalogue ids and limits with provider model-list APIs | Free calls |
| 10. One real feature pass | DOCX translation and a Shopping List Builder PDF, rendered and inspected (required by `AGENTS.md`) — once, on the new default model only | Cents |
| 11. Every enabled language passes every provider's gate | Contract test: production's nine language names × each provider's language check. It catches a name one list spells differently before staff do. | $0 |
| 12. Every enabled language actually translates | One three-string batch per enabled target (eight), on each provider's default model only. Arabic and Persian also checked right-to-left in the rendered PDF. | ≈ $0.02 |
| 13. Administrator alert (D15) | Recorded `exhausted` and `misconfigured` bodies each raise one alert through the existing alert service, alongside the staff-facing message. Other codes raise none. | $0 |
| 14. Language coverage warnings (D18) | Catalogue invariant: every entry states coverage for every language FEED supports. UI tests: the Languages page warns on an `unsupported` language for the active model, and AI Configuration lists enabled languages a chosen model does not offer. Contract test: an `unsupported` language never reaches a provider request. | $0 |
| 15. Lifecycle badges (D26) | UI tests: a `preview` entry shows the Preview badge in the model dialog and the configuration list; `deprecated` / `retired` show a shutdown date and replacement. Custom accepts a preview entry's capability profile for a stable id that is not yet in the catalogue. | $0 |
| — | *Local model offer and parity tests (D12, D13) are shelved with D16; their design is kept in the companion document.* | — |

### Live requests per new model: 7 (4 billable, 3 unbilled)

| # | Request | Billable |
|---|---|---|
| 1 | `translateText` — one sentence to Spanish, default thinking | Yes |
| 2 | `translateTextBatch` — three short strings including a duplicate, to Arabic (RTL, de-duplication, order) | Yes |
| 3 | `classifySegmentsBatch` — three segments (the DOCX classification path; the single-segment `classifySegments` has no caller outside the legacy `services/openai.ts` wrapper, so it is covered by contract tests only) | Yes |
| 4 | `translateText` at the highest level the UI allows — proves that value is accepted | Yes |
| 5 | Availability check with a valid key (model lookup) | Expected unbilled |
| 6 | Invalid key → FEED's "key rejected" message | Expected unbilled |
| 7 | Model id the account cannot use → FEED's message names the model | Expected unbilled |

Once per provider rather than per model: a raw probe sending a forbidden
parameter (e.g. `temperature` to `claude-sonnet-5`) to confirm the 400.
Quota-exhausted and rate-limit errors cannot be triggered cheaply and come
from recorded fixtures. That rejected requests are unbilled is the expected
provider behaviour; confirm it on the first run.

The retained Haiku 4.5 also gets the full seven, because its request shape
changes (prefill removal). So the total is 12 models, 48 billable requests and
36 unbilled.

### Cost

Per billable request at no thinking: about 250 input and 60 output tokens.
Request 4 allows up to 2,000 output tokens of reasoning.

| Model | One full run (4 billable) |
|---|---|
| `gpt-6-astra`, `claude-fable-5-1` | ≈ $0.12 each |
| `claude-opus-5` | ≈ $0.06 |
| `gpt-5.6-sol` | ≈ $0.05 |
| `claude-sonnet-5`, `gpt-5.6-terra`, `gemini-3.1-pro-preview` | ≈ $0.03 each |
| `claude-haiku-4-5`, `gemini-3.6-flash`, `gemini-3.8-flash` | ≈ $0.01 each |
| `gemini-3.5-flash-lite`, `gpt-5.6-luna` | < $0.01 each |
| **All 12** | **≈ $0.52** |

Budget **$5** for the sweep, covering a run per SDK upgrade and re-runs after
fixes. Cap each test key at $5 with the provider (OpenAI project budget,
Anthropic workspace spend limit; Google Cloud budgets only alert, so use a
separate project with a small prepaid balance).

### Test layers that cost nothing

1. **Catalogue invariants.** Every entry has prices, `verifiedAt`, lifecycle,
   capabilities, and `costTier`; every `replacement` resolves to an active
   entry; each provider's default is `active` and not `frontier`.
2. **Request contracts.** A table-driven test over every entry × operation,
   with the SDK client mocked the way `OpenAITranslationService.thinking-level.test.ts`
   already mocks it. It asserts the exact payload: no sampling parameters
   where unsupported (including values arriving from a `SystemPrompt`), the
   right max-tokens field, thinking in the right field with an allowed value,
   no prefill where rejected, and output within the non-streaming ceiling.
   Adding a catalogue entry adds its coverage automatically.
3. **Response parsing from recorded fixtures.** The live smoke script's
   `--record` mode saves one sanitised response per model and operation.
   Replayed in CI, they cover thinking blocks, usage fields, refusals, and
   truncation without a network call.
4. **Error classification from recorded bodies.** Real 401 / 403 / 404 / 400 /
   429-quota / 429-rate / 5xx payloads per provider, through the classifier
   and the real error handler, asserting user copy and error code.
5. **UI tests.** Parameters and Thinking steps render from the catalogue;
   warnings appear at the right thresholds; Custom requires prices and a
   capability profile; retired models are badged.
6. **Live smoke script (opt-in, never CI).** Keys come from environment
   variables. It runs the seven requests for chosen models and prints pass/fail,
   latency, provider-reported usage, and the cost FEED would record. Frontier
   models are skipped unless `--include-frontier` is passed, and the run aborts
   past a spend ceiling.
7. **Catalogue audit (free).** OpenAI `models.list` (ids), Anthropic's Models
   API (ids, `max_input_tokens`, `max_tokens`, capabilities), and Gemini
   `models.list` (ids, token limits, thinking support) compared with the
   catalogue. Prices are the one field no API reports, which is why
   `verifiedAt` exists.

## SDK and runtime upgrades

| SDK | Installed | Latest | What FEED needs from it | Breaking changes in between that touch FEED |
|---|---|---|---|---|
| `@google/genai` | 1.11.0 | 2.22.0 (1.x ends at 1.52.0) | `thinkingLevel` (from 1.30.0) — **required**; 1.11 strips it | 2.0.0 changed only the Interactions API (steps, SSE event names, `response_format`). FEED uses `models.generateContent`. Node ≥ 20 either way. |
| `@anthropic-ai/sdk` | 0.57.0 | 0.125.0 | Typed `thinking` modes, `output_config.effort`, structured outputs to replace prefill, current model constants and non-streaming limits | Beta Files/Skills renames (0.122.0) and beta structured-output field move (0.72.0) — FEED uses neither. |
| `openai` | 5.10.2 | 7.15.0 (6.x at 6.49.0) | Nothing strictly: Chat Completions passes unknown `reasoning_effort` values through, and FEED already casts `minimal` past the SDK's `low \| medium \| high` type | 6.0.0: Responses tool-output types only. 7.0.0: **requires Node 22.** |

**Runtime:** the Docker images ran `node:20-alpine`, which reached end-of-life
on 2026-04-30. Moved to `node:24-alpine` (D10), matching local development;
`AGENTS.md` records pdfmake working on 20 and 24, but not 23. That release also
unblocks `openai` 7, which requires Node 22 or later.

Approaches:

1. **Minimum.** `@google/genai` → 1.52.0 only; cast new values past the other
   two SDKs' types. Smallest diff, but prefill removal on Anthropic is then
   hand-rolled against an SDK that does not know structured outputs, and the
   stale non-streaming guard stays.
2. **Current majors that run on Node 20.** `@google/genai` → 2.22.0,
   `@anthropic-ai/sdk` → 0.125.0, `openai` → 6.49.0. Every feature the refresh
   needs, no runtime change mixed in.
3. **Everything latest.** Option 2 with `openai` → 7.15.0, which forces Node 22+
   in the same change.

**Approved 2026-09-11 (D9, D10): option 2, with the Node upgrade as its own
release, never together.** The Node move (to 24, matching development) is an
infrastructure change on the Pi. Verify it on its own with pdfmake, Chromium
PDF export, Prisma, and the full suites, per the rule that one deploy should
not carry two candidate causes. `openai` 7 follows once Node is on 22+.

Order inside the sweep: one provider per commit — Anthropic, Google, then
OpenAI. Each commit runs its contract tests and that provider's live smoke
only (a few cents).

## Implementation phases

1. **Phase 0 — Reproduce. Done 2026-09-11** (354 input / 109 output tokens,
   under a cent). Run against real keys through FEED's own decryption,
   bypassing the factory so each provider could be probed directly.

   | Question | Answer |
   |---|---|
   | The reported failure | Reproduced verbatim: `404 This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite`. A 404 classifies as `misconfigured`, so the new message names the model. |
   | `gpt-6-astra` or `gpt-5.6-astra`? | **`gpt-6-astra`.** `models.retrieve('gpt-5.6-astra')` is a 404 — the pricing page was wrong, the models page and announcement right. |
   | Do the GPT-5.6 models exist on this account? | Yes — `gpt-5.6-luna`, `-terra`, `-sol` and `gpt-6-astra` all retrieve. |
   | Which Claude models does the account expose? | All three 5-series (`claude-sonnet-5`, `claude-opus-5`, `claude-fable-5-1`), plus 4.8 / 4.7 / 4.6 and the 4.5 pair. |
   | Does Claude 5 reject the prefill? | Yes: `400 This model does not support assistant message prefill. The conversation must end with a user message.` |
   | Does Claude 5 reject `temperature`? | Yes, outright: ``400 `temperature` is deprecated for this model.`` The default value is refused too — the parameter's *presence* is what fails, so overriding the value cannot save it. |
   | Structured outputs vs prompt-instructed JSON | Both return clean JSON. Structured outputs charge the schema as input: **220 prompt tokens against 49** for the same translation. Prompt-instructed chosen. |
   | Tiny `max_tokens` with adaptive thinking | No thinking block; the text truncates at `stop_reason: max_tokens`. The old one-token access check would have returned junk rather than hanging. |

   **A limitation this exposed, and Phase 2 has to settle it.** Google's
   `models.get` **succeeds** for `gemini-2.5-flash-lite` on a key whose
   `generateContent` is refused. Phase 1 replaced a billed generation probe
   with a free metadata lookup: cheaper, but for Google it no longer catches
   the refusal it was built for, so a doomed job would start and fail
   mid-flight.

   **Settled by D29.** Not by making the runtime check heavier, but by moving
   the real check to where the fix is: verify entitlement once when a
   configuration is saved or activated, so an administrator choosing a
   withdrawn model learns immediately in AI Configuration rather than through
   a failed job. At runtime the free lookup stays, plus a remembered failure so
   the second doomed attempt is instant and correctly explained.

   This cannot be exhaustive — an account can lose entitlement between save
   and use, which is what the remembered failure and Phase 1's honest error
   messages are for.

   **Also observed:** the Google account's prepaid credits are depleted
   (`429 ... Your prepayment credits are depleted`) — the #80 condition, live.
   The Gemini `thinkingLevel` fix is therefore verified at the type and
   request-shape level only; it could not be exercised against the API.
2. **Phase 1 — Honest errors.** Key check returns the provider's error through
   the #80 classifier, and every translation and document route returns its
   error code. Availability becomes a free model lookup. `exhausted` and
   `misconfigured` raise an administrator alert (D15). Ships alone.
3. **Phase 2 — One catalogue** (option A) with the entry shape above, request
   building driven by capabilities, UI gating and warnings (D1–D3), and the $0
   test layers.

   **Slice 1 done 2026-09-11:** `services/ai/catalogue.ts` and
   `GET /api/ai-config/models`, carrying lifecycle and capabilities for the
   models offered today, with 17 tests. Nothing consumes it yet — deliberately,
   so the shape could be reviewed before anything depends on it. The endpoint
   is declared above `/:id`, which Express would otherwise match first.

   Remaining slices, each its own commit:
   1. Frontend service and hook; delete the duplicated `model-specs.ts` and
      collapse `ServiceStep`'s six repeated Select-plus-Custom blocks into two.
      Its dialog tests mock no services today and will need a fixture.
   2. Providers read capabilities instead of string tests, retiring the
      `-4-5-` heuristics and the narrow effort/thinking unions.
   3. ~~Save-time entitlement verification and remembered failures (D29).~~
      **Built (`dfc6511`).** Saving or activating a model makes one real,
      minimal generation before the row is persisted; the runtime keeps the
      free model lookup. Only non-transient refusals are remembered, for five
      minutes, cleared on a successful save. Note this deliberately reinstates
      a *billed* call: defect 7 removed a paid check from the per-job path,
      and this one sits at save and activation only, where an administrator is
      choosing the model and a wrong answer is worth a cent to catch.
   4. UI gating and warnings: sampling controls, per-model thinking values,
      frontier and preview badges, language coverage (D1–D3, D18, D26).
4. **Phase 3 — SDK upgrades**, one provider per commit.
5. **Phase 4 — Catalogue contents**: retire 15, add 11, badge saved rows, delete
   the secondary lists.
6. **Phase 5 — Live validation** (seven requests × 12 models), one feature pass
   on the new default, docs, release. Production moves off `gpt-5-mini` before
   2026-12-11.

   **A first slice ran on 2026-09-12** against fifteen local configurations —
   one string, not seven requests, and three providers rather than twelve
   models, so this is a start and not the phase. What it established:

   - All three providers authenticate and accept the 2026 request shapes,
     including Claude 5's adaptive thinking and GPT-5.6's resolved reasoning
     effort — either would 400 if the capability data were wrong.
   - Recorded cost is priced from provider-reported tokens on both OpenAI and
     Anthropic, matching `tokens × price` exactly. Anthropic is the one that
     matters: it recorded its own estimate before `1db85b3`.
   - A deliberately invalid key is refused as `misconfigured` /
     `AI_TRANSLATION_MISCONFIGURED`, and the message **names the model** rather
     than saying "Invalid API key configuration" — defect 1, confirmed against
     a live provider rather than a fixture.
   - Google's depleted prepay credits classify as `exhausted`, not
     `misconfigured`: `QUOTA_EXHAUSTED_MARKERS` matches the provider's own
     "prepayment credits" wording, and quota is tested before the
     misconfigured statuses. This is the same billing wall that moved
     production to `gpt-5-mini` in the first place, so Google could not serve
     translations from this machine until credits were restored — which
     blocked the four Gemini presets until 2026-09-13.
   - An entitlement pass does not guarantee a working translation: the same
     Gemini configuration passed the 64-token probe and then failed a real
     request on credits.

   **A second slice ran on 2026-09-13**, after $5 of Gemini credit was applied
   and all four Google presets activated. One string ("Canned black beans" →
   Spanish) through FEED's own FOOD_TRANSLATION prompt, one request per model:

   - **All four Gemini presets translate correctly.** `gemini-3.5-flash-lite`,
     `gemini-3.6-flash`, `gemini-3.8-flash` and `gemini-3.1-pro-preview` each
     returned valid Spanish and a parseable JSON body. The Google path is no
     longer unvalidated, and the 2026 request shape is confirmed against a
     third provider.
   - **The corrected pre-flight estimate holds on Google**: 143 estimated
     against Google's 146 reported, **-2%**, where the stand-in it replaced
     would have said 41 (-72%).

     This entry first read "so all three providers now agree". **That was an
     overclaim** and is withdrawn: it rested on the pre-fix 39-vs-95 and
     39-vs-93 pairs, which were taken under a different prompt context and are
     not comparable. Measured properly against one 143-token estimate later
     the same day, the providers do not agree at all — Google -2%, Claude 4.5
     -12%, OpenAI -24%, Claude 5 -42%. The prompt-mismatch defect is fixed;
     what remains is per-provider tokenization and request framing, which is a
     separate and unfixed thing. See the note above `ENCODING_MODEL`.
   - Recorded cost is priced from Google's reported tokens, as it already was
     for OpenAI and Anthropic.
   - **`gemini-3.1-pro-preview` costs ~40x `gemini-3.5-flash-lite`** for the
     same three-word translation — 262 completion tokens against 17, nearly
     all of it thinking, at the same `low` level FEED sends both. The
     catalogue's recorded figure for that model (11 thinking tokens) is wrong
     by more than an order of magnitude; see the note above the Google
     entries, and D27's cost argument rests on figures from the same probe.
   - **Per-model testing required bypassing the interface.** All three
     translation call sites ask `AIServiceFactory.createService()` with no
     argument, which picks one active configuration by `updatedAt desc` across
     all providers, so the four models are not individually reachable through
     FEED itself (ISSUES.md #84).

   **A third slice, the same day**, closed the per-model gap: the six
   configurations never exercised — `claude-haiku-4-5` and the five that were
   inactive — were driven directly, one tiny translation each, about $0.05 in
   total.

   - **All twelve live configurations now translate correctly.** Every
     catalogued 2026 model has answered a real FEED request.
   - **`claude-fable-5-1` accepted `output_config.effort` with no 400.** This
     is the first live confirmation of the adaptive-thinking path: Fable is the
     one model that refuses `thinking: {type: 'disabled'}`, and until now that
     branch was exercised only against fixtures.
   - **`gpt-6-astra` is a real, working id**, not an aspirational catalogue
     entry.
   - The estimate spread above (Google -2% through Claude 5 -42%) comes from
     this slice: one prompt, six models, each provider's own count.

   **A fourth slice, the same day**, built the sweep itself:
   `packages/backend/scripts/live-smoke.ts`, run as `npm run smoke:live`.
   This is test layer 6 — opt-in, never in CI, and unable to spend anything
   without `--bill`. It calls `createServiceFromConfiguration` rather than the
   factory, which is what makes a named model reachable at all. Its free half
   has now run against all twelve configurations: 36 requests, $0.00.

   - **Requests 5, 6 and 7 pass on every model** — availability by model
     lookup, a rejected key, and a model id the account cannot call. Three of
     the seven request types are now covered for all twelve, where coverage
     had been one.
   - **The first run found a defect.** All four Gemini configurations
     classified a rejected key as `unavailable` rather than `misconfigured`,
     so a mistyped Google key told staff the service had not responded and to
     try again shortly — when it had responded, refusing, and no retry could
     clear it. Google's `400 INVALID_ARGUMENT` / "API key not valid" matched
     none of the misconfigured markers, and 400 is not a misconfigured
     status. Fixed by wording rather than status, with a negative control
     holding the line against generic 400s; the free sweep re-runs green at
     36 of 36. Recorded in ISSUES.md.

   **The billable half then ran, the same day: all seven request types against
   all twelve models — 83 requests, 84 outcomes, $0.1022 recorded.** The
   eighty-fourth outcome is a deliberate skip, not a request: extended
   thinking has no selectable level, so `claude-haiku-4-5` has no request 4.
   (The database holds $0.10254 across 50 rows for the window, which also
   carries the $0.0003 single-model canary run beforehand.) Phase 5's
   per-request-type coverage is no longer one.

   Before it ran, the sweep was hardened. Its printed estimate had assumed
   request 4 emits 2,000 output tokens because this document budgets that,
   and nothing enforced it: FEED resolves the cap through `PromptBuilder`
   (`config.maxTokens ?? 4096`) and these rows carry 64,000-128,000, which
   Anthropic clamps to 20,480 and OpenAI and Google do not clamp at all. One
   `gpt-6-astra` request at its cap would have been $6.40, and the sweep's
   true worst case about **$55** against an expected $0.46. Every request now
   carries `maxTokens: 512`, capping output per attempt. Input is estimated,
   so the cost is a projection. As of 2026-09-14 the reservation is checked
   before each call, includes three attempts, and refuses unpriced rows.

   - **81 of 84 outcomes passed.** Every model translates, batch-translates
     to Arabic with de-duplication, and classifies — except where noted below.
   - **Request 4 confirmed the adaptive path across providers**, resolving to
     `max` on Claude 5, `xhigh` on GPT-5.6/6 and `high` on Gemini.
     `claude-haiku-4-5` is skipped by design: extended thinking has no
     selectable level.
   - **The cap demonstrably binds.** `gemini-3.8-flash` and
     `gemini-3.1-pro-preview` returned `finishReason: MAX_TOKENS` at 497 and
     498 completion tokens — of which **490 and 492 were thinking**, leaving
     5 and 8 tokens for the answer. At `high`, these models spend essentially
     the whole budget reasoning about a three-word pantry item.
   - **`trackFailedUsage` proved itself in the field.** Exactly two
     `success = 0` rows, and the right two: both truncations, billed and
     unusable. Fable's 400 was refused before an answer and correctly
     recorded nothing.
   - **Three defects found**, all recorded in ISSUES.md: Google never checks
     `finishReason`, so truncation reaches staff as a raw JSON parse error;
     `claude-fable-5-1` refuses the forced `tool_choice` both Anthropic
     classification paths hardcode, so it cannot classify; and the sweep
     under-reports its own spend by summing only successful outcomes.

   **Feature pass, 2026-09-14:** the document and builder paths passed on the
   new default; larger calls passed on Opus 5, and Fable classification passed
   live after its tool-choice fix. Busy refusal handling passed with fixtures.
   See the linked validation report for costs, timings and the still-open
   Cloudflare/deployment gate. No background-job table was added on the basis
   of local timings alone.
7. **Phase 6 — Local model: shelved** (D16). What reviving it needs is listed
   in the companion document.

The Node 24 release (D10) sits outside these phases and ships on its own.

## Sources

- Google: [Models](https://ai.google.dev/gemini-api/docs/models),
  [Pricing](https://ai.google.dev/gemini-api/docs/pricing),
  [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations),
  [Thinking](https://ai.google.dev/gemini-api/docs/thinking),
  [What's new in Gemini 3.5](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5),
  [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite),
  [Forum: 2.5 Flash-Lite unavailable to new users](https://discuss.ai.google.dev/t/gemini-2-5-flash-lite-unavailable-to-new-users-despite-being-documented-as-the-most-budget-friendly-2-5-model/177640),
  [`js-genai` changelog](https://github.com/googleapis/js-genai/blob/main/CHANGELOG.md)
- OpenAI: [Models](https://developers.openai.com/api/docs/models),
  [Pricing](https://developers.openai.com/api/docs/pricing),
  [Deprecations](https://developers.openai.com/api/docs/deprecations),
  [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
  [GPT-6 Astra announcement](https://community.openai.com/t/introducing-gpt-6-astra-the-most-intelligent-and-aligned-model-in-the-world/1394703),
  [`openai-node` v6.0.0](https://github.com/openai/openai-node/releases/tag/v6.0.0),
  [v7.0.0](https://github.com/openai/openai-node/releases/tag/v7.0.0)
- Anthropic: [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview),
  [Model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations),
  [Migrating to Claude Sonnet 5](https://platform.claude.com/docs/en/models/sonnet-5/migration-guide),
  [TypeScript SDK changelog](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/CHANGELOG.md)
