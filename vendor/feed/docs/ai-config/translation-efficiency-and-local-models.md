# Translation Request Efficiency and Local Models

**Status**: Exploration, 2026-09-11. No code changed. Not yet committed.
**Decided** (see [`model-catalogue-refresh-2026-09.md`](model-catalogue-refresh-2026-09.md),
D6 and D11–D16):
- **The local model is shelved** (D16). Hosting it well means buying and
  configuring hardware, which makes it a project of its own. The design below
  is kept so that project starts from what was learned here.
- Chinese means **Simplified** (`zh-CN`), for the cloud catalogue and the
  lean prompt as much as for any local model.
- Recorded for the shelved design:
  - offered to staff only when an API request fails, never automatically (D12);
  - full parity with cloud models (D13);
  - the **hybrid** approach preferred;
  - `AIConfiguration.role` marks a local configuration;
  - prototype and validation on the M5 Max (D14).
- Not shelved: administrator alerts when a provider is out of credit or
  rejects the key or model (D15, catalogue Phase 1).

Two questions: where FEED's translation requests spend tokens they do not need
to, and how a local model can stand in for a cloud provider when one fails.

## Where the tokens go

Measured locally with the o200k tokenizer against the templates in
`TemplateEngine.ts`, filled with the seeded prompt fields from
`scripts/seed-system-prompts.ts`. Production prompts are editable in AI
Configuration and may differ — export and re-measure them before changing
anything.

| Piece | Tokens |
|---|---|
| Food Items & Categories system prompt (`FOOD_TRANSLATION`) | 139 |
| Document batch system prompt (`BATCH_TRANSLATION`) | 111 |
| Shopping List Auto-Format classification prompt (`CLASSIFICATION`) | 165 |
| JSON schema sent with each translation (OpenAI / Gemini) | ≈ 31 |
| A one-sentence source text | 9 |
| Its translation as `{"translatedText": …}` | 16 |
| The same translation as plain text | 11 |
| The TranslateGemma prompt template, for comparison | 65 |
| A lean draft FEED prompt (below) | 35 |

### Findings, largest cost first

1. **Reasoning tokens are the real cost, and they are invisible.** Every
   current model reasons by default unless told not to: GPT-5.6 at `medium`,
   Claude 5 at effort `high`, Gemini 3.5 Flash at `medium`, Gemini 3.1 Pro at
   `high`. Thinking is billed as output, the most expensive token. A
   food-item translation needs none of it.

   Illustration: 5,000 translation calls a month emitting 500 reasoning tokens
   each is 2.5M output tokens. That costs ≈ $3 on `gpt-5.6-luna` and ≈ $30 on
   `gpt-5.6-terra`, to produce the same ten-word answers. Decision D2 (default
   off or lowest) is the single largest efficiency change available.

   Production is not paying this today: its `gpt-5-mini` configuration runs at
   Thinking Level `minimal`. The Add AI Model dialog, however, defaults *new*
   configurations to `high`, which on GPT-5 models becomes
   `reasoning_effort: high`. D2 fixes that default.

2. **A paid request precedes every translation job.** On Google and Anthropic,
   `validateApiKey` is a real generation call to the configured model, made
   before each translate, retry, and document job. OpenAI's check lists
   models, which is free. A free model lookup, remembered per configuration
   for a few minutes, removes a round trip. On thinking models it also removes
   a request that may reason before failing on its one-token cap.

3. **The system prompt says several things twice.** The template opens "You
   are a translation service for a nonprofit food pantry", and the seeded
   field adds "You are a translator service." Two sentences forbid commentary.
   "Never refuse to translate unless the content is inappropriate" adds
   nothing a translation request needs. The JSON instruction repeats what the
   API already enforces on OpenAI (`response_format: json_schema`) and Gemini
   (`responseSchema`).

   Honest scale: trimming ~100 tokens saves 0.5M input tokens per 5,000 calls
   — about $0.10 on `gpt-5.6-luna` and $5 on `gpt-6-astra`. Worth doing for
   clarity and on frontier models, but not where the money is.

4. **Prompt caching will not help, so do not design for it.** Every FEED
   prompt is far below the minimum a provider caches:
   - OpenAI: 1,024 tokens (GPT-5.6).
   - Anthropic: 512 (Opus 5, Fable 5.1), 1,024 (Sonnet 5), 4,096 (Haiku 4.5).
   - Gemini 3.x: 4,096.

   Padding a prompt to qualify would cost more than the discount returns.
   Short prompts are the optimisation.

5. **Output limits are the model's maximum, not the job's.** A one-line food
   name may run with a 65K–128K output cap. On a non-thinking model that
   costs nothing; on a thinking model it is the only bound on runaway
   reasoning. Size the cap per operation from the input: a small multiple of
   the source tokens, plus headroom.

6. **Batch results are matched to inputs by position only.** The batch prompt
   numbers the texts, but the schema returns an unnumbered array. One dropped
   or merged item shifts every later translation onto the wrong string.
   Keyed output (`{"1": "…"}`) costs about the same tokens and turns a silent
   misalignment into a detectable gap — and avoids re-running a batch when
   order is in doubt.

7. **JSON costs ~5 tokens per item.** Negligible for single translations.
   `translatedText` repeated across a 250-item food batch is ~1,250 output
   tokens per batch, per language. Keyed output (finding 6) removes it.

8. **Pre-flight token estimates use one tokenizer for every provider**
   (`gpt-4o-mini`), so limit checks undercount on Claude 5 by roughly 30%.
   Recorded usage already comes from the provider; the estimate needs a
   per-catalogue-entry multiplier.

9. **Anthropic translation cannot use format enforcement yet.** It relies on
   a `{` prefill (rejected by Claude 5, see #84) rather than structured
   outputs, which is why its prompts must carry the JSON instruction.

### A leaner default prompt

Principle: **the provider adapter owns the output format; the prompt owns the
translation.** A prompt carries format instructions only for a provider that
cannot enforce a schema. That keeps admin-editable prompts short, and stops a
customised prompt from breaking parsing.

Draft for single translations (35 tokens as measured; wording to review with
staff):

> Translate the text from English to {targetLanguage} ({targetCode}) for a
> food pantry. Use words native speakers expect; food terms keep their food
> meaning ("Turkey" is meat). Output only the translation.

Ideas taken from TranslateGemma's template:

- **Name the source language.** FEED's is always English, and says so nowhere.
- **Include the language code.** It disambiguates what a name leaves open.
  FEED's `Language` table stores **names only** (`Persian`, `Chinese`), so
  the catalogue maps names to codes. Chinese is `zh-CN` (D11).
- **One instruction for output hygiene.** "Output only the translation"
  replaces three sentences.

Constraints to respect when this is built:

- **Customised prompts may already exist in production.** `SystemPrompt` rows
  are admin data, and the seed upserts by name. Changing defaults means
  offering the lean version, not overwriting a customised row.
- **`TemplateEngine.validateTemplateOutput` rejects any prompt without the word
  "JSON".** A format-free prompt fails that check until format moves to the
  adapter.
- **Compare translation quality before switching.** Run the same strings with
  the old and new prompt, reviewed in the eight target languages — a handful
  of cheap requests per language.

## Local models — shelved

> **Shelved 2026-09-11.** Each requirement below is reasonable. Together they
> make a project, not a feature:
> - parity needs two models (the hybrid);
> - the 4 GB production Pi can host neither;
> - a Pi host means a second Pi 5 16 GB with NVMe, and still hours-long jobs;
> - larger general models need an always-on Apple Silicon machine;
> - local work outlasts Cloudflare's timeout, so it needs background-job
>   infrastructure FEED does not have for translation.
>
> Doing it well means hardware, hosting, job infrastructure, and a model
> evaluation. What follows is the design as far as it got.

### What staff asked for

- **Offered, not automatic (D12).** When a cloud request is blocked, the error
  offers **Use local AI model**. Choosing it opens a confirmation that the
  local model will take much longer. Only then does FEED run the request
  locally.
- **Same functionality (D13).** Whatever a cloud model does in FEED, the local
  path does too:
  - single and batch translation;
  - DOCX auto-format classification;
  - administrator-edited system prompts;
  - style-boundary instructions in DOCX text;
  - every Shopping List Builder translation mode.

### TranslateGemma alone cannot meet D13

TranslateGemma is Google's open translation model: Gemma 3–based, released
2026-01-15, in 4B / 12B / 27B sizes (Ollama: 3.3 / 8.1 / 17 GB), under the
Gemma Terms of Use. Its WMT24++ evaluation covers all eight production target
languages:

- Spanish (`es_MX`), Russian (`ru_RU`), Ukrainian (`uk_UA`)
- Chinese (`zh_CN`), Vietnamese (`vi_VN`)
- Swahili (`sw_KE`, `sw_TZ`), Arabic (`ar_EG`, `ar_SA`), Persian (`fa_IR`)

Google also trained on ~500 further language pairs without publishing their
quality. A language outside the evaluated 55 — Bosnian, for example, briefly
enabled for testing, is not among them — would route to the general model in
a hybrid, unless a staff review shows TranslateGemma handles it well.

Google reports the 12B beating the Gemma 3 27B baseline, but it is built for
exactly one job. From the model card:

| FEED needs (D13) | TranslateGemma |
|---|---|
| Administrator-edited system prompts ("food pantry", "Turkey is meat") | **No system prompt.** A fixed template; FEED's customisation would be silently ignored. |
| Batches of strings | Exactly one text per request (FEED can loop) |
| JSON output against a schema | Plain text only (FEED can wrap) |
| DOCX auto-format classification | **Not supported** — translation only |
| Style-boundary instructions in DOCX segments | **No instruction following** |
| Long paragraphs | 2K-token input context per the model card |

Looping and wrapping are FEED's problem to solve. Classification, prompts,
and instructions are not.

### Three ways to meet D13

**A. One general local model for everything.** An instruction-following model
runs FEED's *existing* prompts and JSON schemas unchanged. Ollama supports
schema-constrained output through `format` (native API) and `response_format`
(OpenAI-compatible API). Current candidates are the Gemma 4 family:
`gemma4:12b` (7.6 GB), `gemma4:26b` MoE (19 GB), `gemma4:31b` (20 GB).
*For:* parity by construction — the same prompts, schemas, and parsing as a
cloud provider, and one model to host.
*Against:* translation quality unproven against TranslateGemma. Small general
models are weakest at exactly the structured-output and classification work
this adds.

**B. Hybrid.** TranslateGemma handles plain translation. A general model
handles classification, and any segment carrying instructions or a customised
prompt that TranslateGemma would ignore.
*For:* the best translator where it is safe to use one.
*Against:* two models loaded at once (memory, swap-in delays), routing rules
that decide per segment, and two sets of behaviour to validate. Staff
customisation of translation prompts would apply only on the general-model
path — a parity gap unless every customised prompt routes there.

**C. TranslateGemma only.** Rejected: fails classification, prompts, and
instructions (D13).

**Preferred: B, the hybrid** (2026-09-11). When the work is revived, the M5 Max
prototype confirms TranslateGemma's edge in WTH's languages, chooses the
general model, and fixes the routing rules. A segment goes to the general
model when it carries:
- a classification request;
- a customised translation prompt, or instructions (style boundaries);
- a language TranslateGemma was not evaluated on.

Everything else goes to TranslateGemma.

### Where it could run

Hosting follows model choice, because a 4B and a 31B model have different
answers.

**Production Pi 5, 4 GB — no.** The smallest candidate is 3.3 GB before FEED
itself runs.

**Raspberry Pi 5, 8 GB or 16 GB — technically possible for small models only,
and slow.** Findings:

- **Ollama runs on the Pi's CPU**, so speed is bounded by memory bandwidth
  (~34 GB/s on the Pi 5's LPDDR4X). Rule of thumb: generation tokens per
  second ≈ bandwidth ÷ model size.

  | Model size | Upper bound | Reported |
  |---|---|---|
  | ~3.3 GB (4B) | ~10 tokens/s | 8–11 tokens/s for Gemma 3 4B on a Pi 5 8GB |
  | ~8 GB (12B) | ~4 tokens/s | — |
  | 17–20 GB (26–31B) | — | Do not fit in 16 GB |

- **The Raspberry Pi AI HAT+ 2 (Hailo-10H) does not help.** It runs only
  Hailo-compiled models — Llama 3.2 1B, Qwen 2.5 1.5B, and similar — and
  neither TranslateGemma nor Gemma 4 is among them.
- **Reading the prompt is slow on a CPU, and FEED's prompts are fixed
  overhead** (111–165 tokens per request before the text). One Pi 5 report
  found a ~5,000-token prompt on a 3B model took about 15 minutes. Prefill
  rates vary widely by build; measure rather than trust.
- **Illustrative job scale.** The development database holds 168 food items
  and 9 categories. Re-translating them into production's eight target
  languages is 1,416 requests:

  | Model on a Pi 5 | Assumed time per request | Whole job |
  |---|---|---|
  | 4B | ~3 s | ~70 minutes |
  | 12B | ~10 s | ~4 hours |

  A DOCX of a few hundred segments is similar. These are estimates to replace
  with measured token counts.
- **Not on the production Pi even with more RAM.** A multi-hour local job
  would compete with the live app — Node, Chromium PDF export, SQLite — for
  CPU and thermal headroom, on a card that already fills with Docker images.
  A Pi host means a **second, dedicated Pi 5 16 GB with NVMe storage**.
- **Verdict.**
  - If the prototype picks option A with `gemma4:12b`, a dedicated 16 GB Pi
    could serve a "much longer" fallback: hours for bulk work, minutes for a
    single language.
  - Option B needs `gemma4:12b` plus `translategemma:4b`, about 11 GB together.
    That fits in 16 GB but swaps models in and out between requests.
  - If the prototype picks a 26B–31B model, no Pi can host it. The host is
    then an always-on Apple Silicon machine.

**Development Mac (M5 Max, 128 GB) — the prototype and validation host
(D14).** It runs every candidate, including the 27B and 31B models, several
at once.

### The flow staff see (D12)

1. **A blocking error arrives with a code.** Blocking means the request cannot
   complete on the cloud provider: `exhausted`, `misconfigured`, `unavailable`,
   `busy` once retries are spent, or `not-configured`. Today only the Shopping
   List Builder route returns these codes. The translation and document routes
   return plain strings, so Phase 1 of the catalogue plan (honest errors) is a
   prerequisite. The client branches on `ApiError.code`, per `AGENTS.md`.
2. **The error offers *Use local AI model*** — only when a local configuration
   exists and is enabled. For a toast this is `messageService`'s `action`.
   Where the error appears inside a dialog instead (the Translate & Download
   PDFs rows, #80), it is the same action in that dialog. One shared helper
   owns the copy and the action, following `duplicate-name-notification.ts`.
3. **A confirmation (`AlertDialog`)** says the local model will take much
   longer and that the job continues in the background. It checks the local
   host is reachable while opening, and states an estimate once FEED has
   measured local throughput (usage records carry duration and tokens). If
   the host is unreachable, the dialog says so and names the machine.

   **It also warns about language coverage (D17).** Each requested language
   falls into one of three states, taken from the local catalogue entries:

   | State | Meaning | In the confirmation |
   |---|---|---|
   | Evaluated | TranslateGemma was evaluated on it (the WMT24++ 55) | No warning |
   | General model only | Outside TranslateGemma's evaluation, so it routes to the general model at unmeasured quality | Named, with a note that staff should check the result |
   | Not offered | Neither local model supports it | Named as *will not be translated*; those languages keep the cloud error and wait for the cloud provider |

   If every requested language is *not offered*, the error does not show
   **Use local AI model** at all — an offer that can do nothing is worse than
   none. Bosnian, briefly enabled for testing on 2026-09-11, is the case that
   exposed the need: it is outside TranslateGemma's evaluated set.
4. **The job runs in the background with progress.** A local request can far
   exceed Cloudflare's **125-second** proxy timeout (a 524). This is the same
   ceiling that moved imports to background jobs in #67.
   - Document translation is already asynchronous.
   - Single and retried translations, DOCX classification, and the builder's
     translate-missing-strings route are synchronous today, and need a job
     with polling on the local path.
   - Which job table: see "Background jobs: generic or translation-specific"
     below.
5. **Completion** notifies staff. Results carry provenance (next section).

**Admin alert — agreed, and not shelved.** An `exhausted` or `misconfigured`
provider needs an administrator to act whatever staff choose. It is part of the
active catalogue plan as D15 (Phase 1).

**Only when a staff request fails (decided).** The option is a response to an
API request a person made. Automatic translations when a food item or category
changes (`translation-trigger.ts`) never offer it.

### Supporting pieces

- **Provenance.** `Translation` has no model column. `UsageRecord` stores
  `aiConfigurationId`, `modelUsed`, and `serviceProvider`, and links to
  `translationId`. Record local calls as usage against the local configuration,
  at zero cost, plus `fallback: true` in `Translation.metadata`. That makes
  local results findable, and enables a later *redo with cloud model* action.
- **A new provider type, "Local (Ollama)".**
  - It needs an endpoint URL and no key, so the rule refusing to activate a
    keyless configuration needs an exemption.
  - `validateServiceType`'s allow-list gains the type.
  - The catalogue gains local entries with the same capability fields as cloud
    models, priced at zero.
- **Which configuration is local** — a data-model change, to discuss before
  building:
  - **A. `AIConfiguration.role`** (`primary` | `local`). Visible where
    administrators already manage AI settings. The "most recently updated
    active configuration" rule must ignore local rows. **Agreed 2026-09-11.**
  - **B. `DeploymentSettings.localModelConfigurationId`.** One field and no
    selection change, but a second place to look.
  - **C. An environment variable.** Rejected: organisation settings live in
    the database and the admin interface.
- **Security.** Ollama has no authentication. Bind it to the LAN only, never
  reachable through the Cloudflare tunnel.

## Prototype on the M5 Max (when revived)

Cost: nothing for local runs, pennies for the cloud reference translations.

1. `ollama pull` the candidates: `translategemma:4b`, `:12b`, `:27b`,
   `gemma4:12b`, `gemma4:26b`, `gemma4:31b`.
2. **Build a non-PII sample.**
   - Food item and category names, and Shopping List Builder text.
   - The segments of one ordinary DOCX (a flyer, not a client record), with
     its cloud classification results as the reference.
3. **Send FEED-shaped requests outside the app.**
   - TranslateGemma: its own template.
   - General models: FEED's actual system prompts and JSON schemas for single
     translation, batch translation, and batch classification, at temperature
     0.
   - Include a style-boundary segment.
4. **Measure per model:**
   - input and output tokens per request, prefill and generation speed;
   - JSON validity rate;
   - classification agreement with the cloud reference;
   - whether style-boundary markers survive.
5. **Blind staff review** of translations in the eight target languages, with
   Simplified Chinese. Compare against the current cloud model.
6. **Estimate Pi hosting** from the measured token counts and published Pi 5
   rates for the chosen model class. Only if that estimate is acceptable, and
   a second Pi is worth buying, measure on real hardware.

## Background jobs: generic or translation-specific

Needed by the shelved local model, and possibly sooner by cloud routes that
can outrun Cloudflare (catalogue document, "Requests that can outrun
Cloudflare").

**What FEED has today**

- **`DataImportJob` + `DataImportJobEvent`.**
  - Typed columns for the import domain (row counts, review summary, error
    code), with staging rows attached by relation.
  - Append-only events with a sequence number, and `expiresAt` cleared by the
    hourly sweeper (#69).
  - Both tables are excluded from backups as transient, each with a stated
    reason in `services/backup/table-contract.ts`.
  - Proven in production after #67, #71, #72, and #75.
- **DOCX translation progress** lives in an in-memory `Map`. It is lost when
  the container restarts, and no second process can see it.
- **Synchronous routes** — bulk retry, DOCX classification, builder
  translate-missing-strings — have no job at all.

**Option 1 — one generic `BackgroundJob` table** (a `kind` discriminator; JSON
input, progress, and result; a status; events).
*For:*
- one polling endpoint and one progress component;
- one sweeper and one backup-contract entry;
- a new long-running feature adds a `kind`, not a migration.

*Against:*
- **Each domain's real state becomes untyped JSON** — no Prisma types, no
  database constraints, awkward queries (every "failed Persian translation
  jobs" lookup becomes JSON extraction).
- **The status unions do not line up.** Translation has per-language partial
  success; imports have review and activation states. A shared union is
  either a lowest common denominator, or sub-states hide in JSON where #75's
  rule — assert that every status reaches a deliberate branch — cannot see
  them.
- **Imports stay out, or move at real risk.** Leaving them where they are
  means two job systems anyway. Migrating them risks the most expensively
  stabilised path in the app for no staff-visible gain.
- **A framework built for one consumer is the dormant infrastructure
  `AGENTS.md` names as debt.**

**Option 2 — a translation-specific `TranslationJob`** (plus
`TranslationJobEvent`, and per-language rows if needed).
*For:*
- **Typed columns:** operation, AI configuration, target languages, counts,
  error code, provenance.
- **An exact status union**, testable the way #75 requires.
- **The same shape as `DataImportJob`**, the one job system FEED has proven, so
  it reads as familiar code.
- **One explicit backup classification.**
- **Plain SQL** for Translation Management.

*Against:*
- **A second job table.**
- **Some duplication:** polling, progress display, and sweeping are written
  twice unless the non-table parts are shared.
- **More tables later:** a third long-running domain adds a third.

**Option 3 — no table; poll existing status fields** (`Translation.status`,
the in-memory DOCX map).
*For:* no migration.
*Against:* builder translation has no persistent row to carry status. In-memory
progress does not survive a restart. There is nowhere to record a job-level
error or a cancellation.

**Decided 2026-09-11 (D28): Option 2, sharing *code* rather than a *table*.**
- FEED's proven precedent is a typed, domain-specific job whose status union
  is tested exhaustively, and typed state is what caught the import defects.
- The duplication is small, and it lives in code — a polling hook, a
  sweeper helper, an event-append helper. Those can be extracted when the
  second consumer arrives, without touching either schema.
- Revisit a generic table when a *third* domain needs jobs.

**Timing: build it when a feature needs it, not ahead.** Nothing in the active
sweep does unless the Phase 5 feature pass shows a 524 on a synchronous route.
In that case bulk retry, DOCX classification, and builder translation become
`TranslationJob`'s first consumers, and a revived local model reuses it.

## Reviving the local model — what it needs

1. **A host decision.** A dedicated Pi 5 16 GB with NVMe for small models only,
   or an always-on Apple Silicon machine for the larger general models.
2. **The M5 Max prototype** (above). It confirms the hybrid, chooses both
   models, and runs the staff review.
3. **Error codes on every translation route** — delivered by the active sweep
   (catalogue Phase 1).
4. **`TranslationJob`** (above), because local work outlasts Cloudflare's
   125 seconds.
5. **`AIConfiguration.role`**, the Local (Ollama) provider type, and activation
   without an API key.
6. **The offer flow (D12)** and **parity tests (D13)**.
7. **Per-language coverage (D17)** recorded on each local catalogue entry.
   It drives the three-state warning in the confirmation, and a test that an
   all-unsupported request never shows the offer.

Answered 2026-09-11:
- Pi RAM is 4 GB.
- Production enables nine languages, and the stored name is `Persian`. Bosnian
  was a test language and is switched off.
- The local model is offered only when a staff request fails, never for
  automatic translations, with full parity.
- The hybrid approach is preferred, marked by `AIConfiguration.role`.
- Administrator alerts are agreed (active, D15).
- Chinese means Simplified.
- Prototyping happens on the M5 Max.
- Shelved as its own project.

## Sources

- TranslateGemma: [Ollama library](https://ollama.com/library/translategemma),
  [model card (4B)](https://huggingface.co/google/translategemma-4b-it),
  [Google announcement](https://blog.google/innovation-and-ai/technology/developers-tools/translategemma/),
  [technical report](https://arxiv.org/pdf/2601.09012),
  [WMT24++ languages](https://huggingface.co/datasets/google/wmt24pp)
- Ollama: [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility),
  [structured outputs](https://docs.ollama.com/capabilities/structured-outputs),
  [Gemma 4 library](https://ollama.com/library/gemma4)
- Caching minimums: [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching),
  [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
  [Gemini](https://ai.google.dev/gemini-api/docs/caching)
- Cloudflare: [Error 524](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/)
- Raspberry Pi 5 inference reports (comparable models, not TranslateGemma):
  [Gemma 3 on a Pi 5](https://dev.to/kunal_d6a8fea2309e1571ee7/gemma-3-on-a-raspberry-pi-5-i-benchmarked-googles-open-model-on-a-80-computer-2026-3c0e),
  [Stratosphere Laboratory](https://www.stratosphereips.org/blog/2025/6/5/how-well-do-llms-perform-on-a-raspberry-pi-5),
  [TinyWeights](https://tinyweights.dev/posts/run-llms-raspberry-pi-5/),
  [AI HAT+ 2 review (CNX Software)](https://www.cnx-software.com/2026/01/20/raspberry-pi-ai-hat-2-review-a-40-tops-ai-accelerator-tested-with-computer-vision-llm-and-vlm-workloads/)
