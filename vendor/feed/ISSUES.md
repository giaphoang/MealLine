# FEED — Known Issues & Future Work

**Last Updated**: September 14, 2026
**Status**: 1.8.1 deployed and verified in production
**Production**: https://feed.williamtemple.app — serving **1.8.1**,
deployed 2026-09-14 over stable 1.8.0. Both services are healthy and all 36
migrations are current. The verified rollback backup is
`backups/2026-09-14-pre-1.8.1/` in the Pi checkout, with 1.8.0 images retained.
See `docs/deployment/v1.8.1-validation.md` for release and browser evidence.
Historical release headings distinguish authored versions from deployments.

This file tracks open issues, planned work, and recently-resolved items
during the v1.0.0 release-prep window. Detailed root-cause writeups for
pre-v1.0.0 resolutions have been condensed to one-liners here — the full
discussions are preserved in git history (`git log -p ISSUES.md` before
this sweep).

---

## v1.0.0 Release Triage

### Blockers
None identified. The application is running in production at
https://feed.williamtemple.app; the core flows (OTP auth, document
translation, shopping list builder, AI configuration) are working and
verified.

### Recommended-but-optional cleanups before public flip
- **A11y warnings** — missing `DialogTitle` on several `DialogContent` /
  `SheetContent` usages (~12 dev-time warnings on `/food-items` alone).
  See issue #27b below. Quick to fix with `<VisuallyHidden>`.
- **TypeScript debt** — 697 pre-existing errors documented in
  `docs/TSC-DEBT.md`. The recommended "Option C quick wins" drops the
  count to ~250 in roughly 3 hours of focused work. Doesn't block ship,
  but the count is visible to anyone who clones the public repo.
- **Security review** — see issue #7 below. AGPL-3.0 license + going
  public means external eyes on the auth path. Worth a focused review.

### Deferred to post-launch
Everything else in this file. The application is shippable today.

---

## Open Issues

### #85 — The breadcrumb banner loses its frosted glass in Chrome production builds
**Priority**: Low · **Status**: Fixed in 1.8.1; production visually confirmed
**Bucket**: Layout / shell surfaces

Reproduced on stable 1.8.0 on September 14: sharp chart bars and text showed
through the breadcrumb header in Chrome, while the Analytics date banner
blurred them correctly. Safari rendered both correctly.

**Root cause:** the authored shell rules placed `-webkit-backdrop-filter`
after `backdrop-filter`. Tailwind 4.3.3's production optimizer (Lightning CSS
1.32.0) collapsed this to the prefixed declaration alone. The live asset
`index-CJFBoG8I.css` contained only `-webkit-backdrop-filter` for the header;
Chrome computed `backdrop-filter: none`. Vite development preserved both,
concealing the defect. The Analytics banner uses Tailwind utilities, whose
generated declarations already have the working order.

**Fixed:** put the prefixed declaration first and the standard one last on
the header, shared panels, sidebar and print reset. No markup, opacity, theme
tokens or layout changes are needed. A regression test runs the real production
optimizer on those source rules: all four cases fail before the reorder and
pass after it. The optimized localhost app now computes `blur(14px)
saturate(1.5)` on both Analytics banners and visibly blurs charts in light and
dark Chrome. The same packaged frontend retains Safari's frost on localhost;
Chrome production also passes both themes after deployment. The user confirmed
both browsers on localhost and completed the final production visual inspection.

**Earlier diagnosis superseded:** the initial light-opacity adjustment to
0.55/0.45 remains as the reviewed appearance, but it did not fix the Chrome
build defect. A computed property in dev mode does not establish that the
production stylesheet contains it. Test the optimized build, with contrasting
content behind the banner and time for a repaint. Release/deployment evidence:
`docs/deployment/v1.8.1-validation.md`.

### #84 — The AI model catalogue is out of date, and a refused model reports as an invalid API key
**Priority**: High · **Status**: honest errors and alerts, Node 24, the SDK
upgrades, one server-authoritative catalogue read by both the providers and the
dialogs, and the contents refresh are all delivered — 12 presets offered, four
per provider, and FEED's default moved off the model Google refuses. **Phase 5's
small-request sweep has run** — all seven request types against all twelve
models (2026-09-13). The Fable and spending findings are fixed, and the local
feature pass is complete (2026-09-14). The user requested stable 1.8.0 and
explicitly excluded live production AI tests, taking responsibility for fresh
API keys and model setup. Cloudflare AI feature checks are therefore omitted,
not passed; deployment verification is limited to health, migrations, image
identity and version. See
`docs/ai-config/phase5-validation-2026-09-14.md`.
**Bucket**: AI configuration / translation providers

Google no longer lets new projects call `gemini-2.5-flash-lite`, FEED's
default Google model. An administrator configured `gemini-3.5-flash-lite`
through **Custom** with a valid key, and translation still failed with
*"Invalid API key configuration. Please check your AI settings."*

**Two problems.** First, the catalogue is stale. Of 16 selectable presets,
`gemini-3-pro-preview` was shut down on 2026-03-09. `gpt-4.1-nano` and
`gpt-4o-2024-05-13` shut down on 2026-10-23, and all three
`gpt-5-*-2025-08-07` snapshots on 2026-12-11 — production runs `gpt-5-mini`
(#80). `claude-sonnet-4-5` may retire from 2026-09-29, and every `gemini-2.5-*`
model is refused to new projects. No current family (Gemini 3.5–3.8,
GPT-5.6 / GPT-6, Claude 5) is listed.

Second, and the reason the report looked like a key problem:
`validateApiKey` on all three providers returns a boolean and discards the
error. The translation and document routes then say the key is invalid.
Google and Anthropic check a key by calling the configured *model*, so a
model the account cannot use reads exactly like a bad key. The #80 classifier
already distinguishes these cases but is not used on this path. The provider's
real answer exists only in the backend log.

**Also found**, each one blocking new models from working correctly:

- The Gemini thinking level has never been applied. `@google/genai` 1.11.0
  drops `thinking_level`; the JS field is `thinkingLevel`.
- Claude 5 rejects non-default `temperature` and `top_p` with a 400. FEED
  always sends `temperature`, and drops `top_p` only for ids containing
  `-4-5-` — fixed in `314c04a` and `b17b1f2`, where the providers stopped
  testing model ids and started asking the catalogue what each model accepts;
  the wizard stopped offering the parameters at all where a model refuses them
  (defect 5).
- Custom models get no model-specific parameter handling. A Custom GPT-5.6
  sends `max_tokens`, `temperature`, and `top_p`. They also have no prices
  unless typed in — which is still true and still allowed, but no longer
  silent: a cost limit on an unpriced configuration is refused rather than
  saved and left inert (defect 6).
- Anthropic translation sends an assistant prefill of `{`, which Claude
  Sonnet 4.6 and later reject with 400 — independently of the sampling
  parameters.
- `AddAIModelDialog` saves the custom model id untrimmed; the Edit dialog
  trims it. It also defaults Thinking Level to `high`, which on GPT-5 models
  becomes `reasoning_effort: high` for every new configuration. Production's
  own `gpt-5-mini` runs at `minimal`.
- The catalogue is duplicated between backend and frontend `model-specs.ts`,
  and at least six secondary lists name retired models
  (`SERVICE_SPECIFICATIONS`, `GOOGLE_MODEL_PRICING`, both `config/limits`
  files, `config/translation.ts`, the token-limit fix-up script) — of which
  four are since gone: `GOOGLE_MODEL_PRICING` and `config/limits/index.ts`
  were dead, and `SERVICE_SPECIFICATIONS` is now `SERVICE_COLORS`, holding no
  model data at all.

**Delivered 2026-09-11 and 2026-09-12**, leaving Phase 5 validation as the open
half:

- Honest provider errors and administrator alerts (`71bdee9`).
- Node 24 (`7c7b350`); `openai` 5.10.2 → 7.15.0 (`8789655`).
- The Gemini thinking level now reaches the SDK (`bf3990b`), and Claude 5's
  sampling parameters and assistant prefill are handled (`314c04a`) — both
  measured against live APIs rather than read off a documentation page.
- Throughput stopped masquerading as a budget (`d203c77`). `tokensPerMinute ×
  1440` was being enforced and displayed as a daily token limit — 288 million
  a day for GPT-5 mini. TPM, RPM and RPD are now provider rate allowances
  only; daily enforcement happens where an explicit daily cost limit exists,
  and nowhere else. The hard-coded one-million-token and daily-cost alerts
  went with it.
- Language coverage moved into the catalogue (`9fbee5c`), so the Languages page
  and AI Configuration can warn when an enabled language is not served by the
  chosen model, rather than letting the translation fail. Provider claims are
  recorded as `supported`; `evaluated` is reserved for a real FEED probe.
- Entitlement is verified when a model is saved or activated (`dfc6511`) — one
  minimal real generation, at the moment the choice is made, with non-transient
  refusals remembered briefly. The per-job path keeps the free lookup that
  defect 7 introduced.
- `catalogue.ts`, with lifecycle and capability data (`9e98ea2`); then the
  five models it had silently omitted — the whole gpt-4.1 and gpt-4o family —
  and a `gpt-4o` price that had been wrong since the day it was added:
  $5.00/$20.00 against OpenAI's actual $2.50/$10.00, which also put it exactly
  on the `frontier` cost-warning threshold (`fcc645c`).
- Providers read capabilities instead of testing model ids (`b17b1f2`). The
  `-4-5-` check, the dateless-id regex and both `modelFamily` switches are
  gone, and a Custom model now gets a documented parameter profile instead of
  silently sending `max_tokens` to a model that refuses it.
- Both `model-specs.ts` copies are deleted and the dialogs read
  `GET /api/ai-config/models`. `GOOGLE_MODEL_PRICING` turned out to be dead
  code — declared, never read — and went with them.
- Thinking level defaults to unset instead of `high`, so the backend applies
  the cheapest level each model accepts (D2) rather than the dialog guessing
  one. The step now offers only the levels a model takes, says plainly when a
  model has no reasoning control instead of accepting a setting it will
  discard, and warns that a level above medium raises the cost of every
  request (D2, D3). The `high` default had lived in three places, two of them
  fallbacks inside `ThinkingLevelStep`, so every configuration with no stored
  level opened at `high` and persisted it on the next save.
- `AddAIModelDialog` trims a custom model id before saving, as Edit always
  did.
- **The contents refresh (2026-09-12).** 27 entries, 12 offered — four per
  provider — and 15 withheld. OpenAI's GPT-5.6 line and `gpt-6-astra`
  (`e5394b2`); Claude Sonnet 5, Opus 5 and Fable 5.1, with
  `AnthropicTranslationService` taught to send `output_config.effort` and to
  disable thinking outright where a model allows it (`a25f057`); and the
  Gemini 3.x presets, which moved FEED's default off `gemini-2.5-flash-lite`
  — the model whose 404 opened this issue (`9f6c476`).
- Withdrawing a preset uses `lifecycle.offered`, not `status: 'retired'`. The
  two are different claims: production runs `gpt-5-mini` successfully until
  2026-12-11, so calling it retired would be false and would strip the entry
  its saved row resolves against. `GET /api/ai-config/models` now returns two
  lists — `models` to choose from, `withdrawn` so the dialog can still explain
  a configuration it no longer offers.
- Every capability was measured rather than read. Three provider pages proved
  wrong: `gpt-4o`'s price by 2x, the OpenAI models page on which effort values
  GPT-5.6 and `gpt-6-astra` accept, and Anthropic's tentative retirement dates
  recorded as announced shutdowns.

- Lifecycle warnings, in both places the plan asks for them (`1a4c72e`,
  `55d4d28`). The configuration list badges a saved row whose model is
  deprecated, retired or a preview — production's `gpt-5-mini` now reads
  `Ends 2026-12-11` beside `Active` instead of looking healthy — and the
  dialog says the same when a model is chosen. A frontier model warns what it
  costs (D1/D7). List and dialog read one module so they cannot drift apart.

Nothing from that list is still open. `config/limits.ts` has no
`MODEL_DAILY_LIMITS`, `TOKEN_RATES` or `MODEL_NAME` left; `config/translation.ts`
names no model; and `scripts/fix-ai-config-token-limits.ts` reads
`findCatalogueEntry(...).maxOutputTokens` instead of a hardcoded table
(`d203c77`). `config/limits/index.ts` was deleted earlier as an unimported
second copy, and `SERVICE_SPECIFICATIONS` is now `SERVICE_COLORS` with no model
data at all. **Phase 5's small-request sweep has run** across four slices — one
on 2026-09-12 and three on 2026-09-13. The third closed the per-model gap; the
fourth built the live smoke sweep and ran all seven request types against all
twelve models, 83 requests for $0.1022 (below).

That is the sweep, not the phase. Phase 5 is defined as seven requests × 12
models **plus one feature pass on the new default, docs, and release**, and
the sweep itself left the `busy` classification and the document path
uncovered. Those gaps are now covered locally, with transient busy responses
verified through the real error handler using provider-shaped fixtures.
The sweep's three defects are fixed. Still outstanding: the Cloudflare feature
checks and staged release, including production's move off `gpt-5-mini` before
2026-12-11. Production still reports `1.7.5-rc.1` on 2026-09-14.

Ten things this work turned up, none of them defects on the #84 list. Some
came from live testing against the providers, one from reconciling the usage
dashboard against the database, two from typechecking the test suite, which
had never been done, and four from the live smoke sweep — one on the free
half, three more once the billable half ran. **Seven are now fixed.** The
three open ones are described last, ending with the factory resolving a
single configuration for every provider, which is an architectural choice
rather than a defect.

(This sentence read "Seven are now fixed" while six were, and became true only
when `4ba8e30` landed. It was wrong when written, not made right by events —
noted because a count that corrects itself by accident is the kind of error
this list exists to catch, and it survived three separate seam checks.)

- **A failed translation recorded nothing** (fixed, `181d917`).
  `trackFailedUsage` existed on `AITranslationService` with exactly one
  reference — its own definition — so every `UsageRecord` row was
  `success = 1`, and a live Google failure (three attempts, two backoffs,
  depleted prepay credits) left no trace outside stdout.

  Only the billed half is now recorded, which is the distinction that decides
  the scope. A request refused before an answer (429, auth, network) bills
  nothing and still records nothing. A request the provider answered and
  charged for, which FEED then could not use — a reply that will not parse, or
  one that parses without a `translatedText` — is real spend, and is written
  `success: false` from the provider's own counts.

  What this deliberately does **not** change: `getCurrentUsage` filters on
  `success: true`, so billed-but-failed spend still does not count against a
  cost limit. Whether it should is a separate decision, and recording it first
  is what makes that decision answerable — until now nobody could size the
  problem, because the rows did not exist.
- **The usage dashboard counted deleted configurations** (fixed, `6afb4cc`).
  `routes/projections/multi-service-metrics/index.ts` selects
  `findMany({ where: { type: 'apikey' } })` with no `deletedAt` filter — no
  route under `projections/` has one — and the breakdown labelled each row by
  `isActive`. Two soft-deleted configurations here carry `isActive = 1`, so
  they rendered with no "(Inactive)" marker, indistinguishable from live rows;
  one of them is a zero-usage duplicate of a live model id.

  Excluding deleted rows outright would have been wrong — one carries 1,236
  tokens of genuine production history, and dropping it would both make past
  spend vanish and leave the row disagreeing with the month's total it is
  still inside. So they are marked, not hidden: the endpoint now sends
  `deletedAt` and the dashboard labels those rows "(Deleted)", which takes
  precedence over "(Inactive)" at all three label sites.

  Writing the fix turned up a second consequence of the same flag. The
  frontend picked the active configuration with `find(c => c.isActive)`, and
  since deletion leaves `isActive` untouched, a deleted row sorting first was
  reported as the one in use. It now has to be undeleted as well.
- **Three tests that could not fail**, found while typechecking the suite for
  the first time (all fixed in `181d917`). Twenty-one assertions on a
  `ShoppingListTemplate.isActive` column that has never existed in any
  migration, including a test named "should update only isActive status"; the
  brand-theme lightness check, whose loop bound `token` to scope names so its
  assertion never executed once in either iteration; and a draft of my own,
  discarded before commit, that counted the estimate rather than the prompt
  resolution it was named for. The first two were invisible because the test
  suite was excluded from the typecheck — 98 of 100 files were never checked.
- **The pre-flight estimate measured a prompt that was never sent** (fixed,
  `8eaea48`). It encoded a hardcoded one-sentence stand-in while the real
  prompt was built afterwards, inside the retry loop, by `PromptBuilder` from
  the active `SystemPrompt` row. Recorded here earlier as a flat ~2.4x from a
  single live pair; measuring against this deployment's own rows with a
  four-token input gives a spread instead — stand-in 41 tokens, against 143
  for `Food Items and Categories` (3.49x), 114 for `DOCX - Low Temp` (2.78x),
  and 51 for the default template with no row (1.24x). The error is not a
  constant to be corrected with a factor: it scales with how much an
  administrator has written into the prompt row, which is why the fix passes
  the prompt itself rather than a better guess.
- **The limit check double-counted the system prompt** (fixed, `497c652`).
  `LimitEnforcementService.calculateCost` received the input estimate — prompt
  and user text together — then treated it as a grand total: halved it, and
  added a hardcoded `SYSTEM_PROMPT_TOKENS = 61` for a prompt already in the
  number. With the two `+ 50` fallbacks in `calculation.ts`, the system prompt
  was estimated in three places and counted twice in the one that decides
  whether to block a translation.

  **Two things this entry got wrong, both found by doing the work.**

  It said the error "errs high, which is the safe direction for a spend cap,
  so this is not urgent". That holds only below 122 input tokens, which is
  where `61 + 0.5t` crosses `t`. This deployment's prompts are 143 tokens for
  `Food Items and Categories` and 114 for `DOCX - Low Temp`, so in real use
  the estimate errs **low** — the unsafe direction — and the two faults were
  partly cancelling each other rather than compounding. For 143 tokens the
  pair returned 132.5 against a true 143: close enough to look deliberate,
  reached by accident.

  It also predicted rewriting "~20 existing `checkTokenUsage` tests". One test
  needed it. That one asserted `((61 + tokens * 0.5) * rate)` — the
  implementation line for line, so it would have passed for any constant —
  and is now written to state intent. The other 19 never encoded the
  arithmetic and were indifferent to the change.

  Input is now priced whole. Output stays at half of input deliberately: the
  obvious replacement, `estimateOutputMetrics` at 1.5x the *user text*, books
  about six tokens for a three-word pantry item, while
  `gemini-3.1-pro-preview` was measured returning 262 completion tokens for
  exactly that. Trading a conservative ratio for a confident underestimate
  would leave the limit protecting less than it does now, so the ratio holds
  until output is measured per model. Two new guards fail against the old
  arithmetic (verified at 3 failed / 17 passed with it restored).
- **A mistyped Google key reported an outage, not a key problem** (fixed,
  `9de7aa4`). Found by the live smoke sweep's free half on its first run: all
  four Gemini configurations classified a rejected key as `unavailable`, where
  OpenAI and Anthropic both said `misconfigured`. Staff would have read "The
  AI service did not respond, so this text was not translated. Try again in a
  moment." It had responded — it had refused — and no retry could clear it.

  Google answers `400 INVALID_ARGUMENT` / "API key not valid. Please pass a
  valid API key." / reason `API_KEY_INVALID`. That matched none of
  `MISCONFIGURED_MARKERS` — `invalid_api_key` is OpenAI's spelling and Google
  reverses the words — and 400 is absent from `MISCONFIGURED_STATUSES`, so it
  fell through every test to the default.

  Fixed by wording rather than by status. `ApiError.status` really is the
  number 400, which makes adding it to the status list the obvious move and
  the wrong one: 400 is Google's generic bad request, returned for a malformed
  body or a sampling parameter a model refuses, and blaming those on the key
  would send an administrator to check something that is fine. A negative
  control holds that line — and passes with or without the fix by design,
  because it guards against over-reach rather than detecting it.

  This is the defect #84 opened on — a provider's refusal reported as the
  wrong kind of problem — surviving in the one provider that could not be
  exercised until Google credits were restored on 2026-09-13.
- **Google never checked whether a response was truncated** (fixed, `4ba8e30`
  and `d08618a`). `AnthropicTranslationService` tests
  `stop_reason === 'max_tokens'` at three sites and throws "Translation
  response was truncated due to length" — a sentence staff can act on.
  `GoogleTranslationService` tested `finishReason` nowhere: a grep for
  `truncat|MAX_TOKENS|finishReason` across the file returned nothing. It
  handed the truncated body to `JSON.parse` at four sites, so staff read
  `Unterminated string in JSON at position 22`.

  Found when the sweep's 512-token cap made two Gemini models truncate, but
  the missing check was real at any cap — a long document at the production
  cap of 65,536 failed the same way. The refresh document lists this exact
  behaviour as required: "output truncated at the token cap → a clear error
  rather than a JSON parse failure".

  `wasTruncated` reads `candidates[0].finishReason`, the single candidate FEED
  asks for, and matches `MAX_TOKENS` only. `STOP` is a finished answer, and
  `SAFETY` and `RECITATION` are refusals whose cause is not a token limit —
  reporting either as truncation would send an administrator to raise a limit
  that was never the problem.

  **Placement had two axes, and the first commit got only one of them right.**

  The axis it got right: in `translateText` the guard sits *inside* the `try`,
  ahead of the parse, because `catch (unusable)` is what records a
  billed-but-unusable reply. Throwing above it — the tidier-looking spot —
  would have made the error clearer and the spend invisible, quietly undoing
  `181d917` on the very path the sweep had just confirmed working.

  The axis it missed (**fixed in `d08618a`**, raised in source review): all
  four sites tested `!response.text` *above* the new guard. A reply that spent
  its whole budget thinking and returned no text therefore never reached
  `wasTruncated` at all — it reported "No content in translation response",
  naming the wrong cause, and in `translateText` that check also sat above the
  `try`, so the billed reply left no row either. The seven tests written with
  it all supplied non-empty bodies, so none of them crossed that branch.

  That shape is not hypothetical: the sweep measured `gemini-3.8-flash`
  returning 5 answer tokens against 492 of thinking, and zero answer tokens is
  the same case one notch on — likelier as thinking rises, which is exactly
  when an administrator would reach for a higher level. Truncation is now
  tested before emptiness at all four sites, and in `translateText` both
  checks sit inside the `try`, so an empty reply that was *not* truncated is
  recorded too, where before it also vanished.

  The lesson is the one worth keeping, and it is about the writing rather than
  the code: having found one counter-intuitive constraint on where the guard
  belonged, I wrote "placement was the subtle part" and stopped looking. A
  second constraint sat four lines above the first.

  Verified by negative control at both stages. For the original guard, forcing
  `wasTruncated` false failed 6 of 7 — including the assertion that the parser
  message never surfaces, which is what proves `rejects.not.toThrow` bites
  rather than passing vacuously. For the ordering, short-circuiting
  `wasTruncated` on empty text — reproducing the old ordering at every site in
  one line — failed 6 of 14. In both runs the tests that legitimately do not
  depend on the guard passed, and that is stated rather than counted as
  evidence.

- **`claude-fable-5-1` cannot classify at all.** Fixed 2026-09-14. The new
  `forcedToolUse` catalogue capability selects `auto` for Fable and unknown
  Claude models; known compatible models retain forced tools. Explicit prompt
  instructions and validation require the named tool, one result per segment,
  and finite scores in range. Both public classification paths passed live:
  $0.01261 and $0.01282. Invalid billed replies are recorded as failures.
  Parallel batches settle and record individually, so a successful sibling's
  cost survives another batch's failure without double counting.

  Original finding: both Anthropic
  classification paths hardcode `tool_choice: { type: "tool", name: ... }`
  (lines 773 and 1028), and Fable answers `400 tool_choice: type "tool" and
  "any" are not supported for this model`. Every other catalogued model
  accepts it, so this is Fable's second refusal of a parameter the rest take
  — it already carries `sampling: 'unsupported'` and `prefill: 'rejected'`.

  The catalogue had no way to say it. A grep for `tool_choice|toolChoice|
  forcedTool|tools` across `catalogue.ts` returned nothing, so this needed a
  capability field rather than a patch at the call site — the same lesson as
  the `-4-5-` string tests: a model's refusals belong in the catalogue, not
  in an `if` next to the request.

- **The sweep under-reports its own spend.** Fixed 2026-09-14. An async-local
  capture collects persisted `UsageRecord` rows belonging to each call,
  including failed replies; unrelated requests cannot enter that collection.
  A failed write stops the sweep. It checks a conservative reservation before
  every billable call, including three projected attempts, and refuses
  uncatalogued models, missing/nonpositive saved prices, mismatched providers,
  and invalid ceilings. Reservations use the higher of saved and catalogue
  rates, including `per_1k`. Input remains estimated: this is a stop policy,
  not a hard dollar limit.

  Original finding: the script
  sums `costUsd` from outcomes, and `costUsd` is only ever set from
  `result.metrics.totalCost` — so a request that *throws* contributes nothing,
  even when the provider answered and billed for it. The run printed $0.0940
  where the database holds $0.10254 across the same 50 rows; the difference is
  the two billed-but-failed Gemini rows.

  This is precisely the defect fixed in `181d917` this morning, reproduced in
  my own tooling within hours of writing about it. The thrown error carries no
  token counts, so the honest repair is to reconcile from the `UsageRecord`
  rows the run wrote, which is the only place that spend exists.

  **Three Google paths billed without recording.** Fixed 2026-09-14: all three
  now record unusable billed responses once, including empty truncations and
  malformed JSON, using Google's prompt, answer, and thinking counts. Provider
  refusals before a response record no invented usage. The application cost
  limit's historical `success: true` filter remains a separate decision (above).

  Original finding, while
  adding the truncation guard (`4ba8e30`). `trackFailedUsage` appears exactly
  once in `GoogleTranslationService`, in the `catch (unusable)` wrapped around
  `translateText`'s parse. `translateTextBatch`, `classifySegments` and
  `classifySegmentsBatch` parse bare, so a reply on any of those three that
  the provider answered, charged for, and FEED could not use — truncated or
  otherwise unparseable — costs money and leaves no row at all. The sweep hit
  exactly this: its two recorded failures were both `translateText`, which is
  the one path that records.

  The translation half was the right place to start, being what production
  runs, but "billed-but-failed spend is now recorded" is true of one path in
  four on this provider. Worth saying plainly, since the earlier entry does
  not qualify it.

  **An unpriced model reserved nothing against the ceiling.** Fixed by the
  refusal and pricing checks above. Original finding, same slice,
  raised in review. `selectConfigurations` filters on
  `entry?.costTier !== 'frontier'`, which is `true` when there is no entry at
  all, so an uncatalogued id is admitted; `--include-frontier` returns `true`
  before the lookup and admits it too. Then the pre-flight guard reads
  `worstCaseForModel(model) ?? 0`, and `worstCaseForModel` returns `null`
  precisely when the model has no catalogue entry and therefore no price. The
  `?? 0` turns "I do not know what this costs" into "this costs nothing",
  directly inside the check that exists to stop spending.

  A Custom configuration — an administrator may type any id — would therefore
  run its four billable requests having reserved nothing. `SWEEP_OUTPUT_CAP`
  still bounds the tokens, so the volume is capped and the exposure is not
  unbounded; it is the *price* that is unknown, which is exactly the term the
  guard needs. Unknown should read as maximum risk, not zero: either refuse an
  uncatalogued model unless a flag opts into it, or reserve a deliberate
  worst-case price.

  Latent, not live: every one of the twelve configurations on this deployment
  resolves to a catalogue entry (checked against the catalogue's ids,
  2026-09-13), so nothing reaches this today. It takes a Custom id, which the
  interface exists to let an administrator type.

  This is the same mistake `dashboard-invented-limits.test.ts` was written to
  guard against, in its own words — "a zero that is a real observation, versus
  a zero standing in for an absence" — committed in a spend guard by the
  person who had just finished quoting it.

- **Six active configurations, one reachable model.** All three translation
  call sites — `translations.ts:323`, `translations.ts:516` and
  `translation-trigger.ts:231` — call `AIServiceFactory.createService()` with
  no argument, which resolves to `findFirst({ type:'apikey', isActive:true,
  deletedAt:null }, orderBy:{ updatedAt:'desc' })`: one row, whichever was
  saved last, across every provider. `isActive` reads in the interface as
  "this model is offered", but the factory treats the set as a pool and
  silently picks one, so with six active configurations here every translation
  goes to whichever was edited most recently. Nothing is broken and nothing is
  mis-recorded — but a model cannot be chosen, activating a model does not
  make it reachable, and testing several models cannot be done through the
  interface at all. Found while trying to validate the four Gemini presets,
  which had to be driven directly instead.

- Sampling parameters a model refuses (defect 5). Temperature and top-p reach
  a request from `SystemPrompt` as well as `AIConfiguration`, and the backend
  already handled that correctly — `PromptBuilder` merges the two and every
  provider passes the result through the model's catalogue capabilities before
  building a request. The gap was the wizard, which offered both sliders for
  every model including the eleven that reject them outright. It now offers
  only what the chosen model accepts, and says why when it offers nothing.

- Cost limits that could never fire (defect 6). A limit is measured against
  tokens × price, so an unpriced configuration recorded zero spend and the
  daily and monthly limits never tripped, however small they were set. Saving
  an unpriced configuration is still allowed — the Cost step offers it — but
  the contradiction is refused: a cost limit on one now fails with a 400 that
  says what to do, on create and on update. Configurations already saved that
  way raise a critical alert once each and keep translating, because a config
  defect should not stop the pantry's translations.

**Phase 5's small-request sweep: done (2026-09-13). The phase is not.** This
paragraph used to end "no FEED-shaped end-to-end translation has been run
against the new presets", and stayed that way for a day after it stopped being
true — it sits in the plan section, away from the findings list whose seams
were being checked, so every verification pass walked straight past it.

What has actually run: effort values on four OpenAI models, effort and
thinking-disable on three Anthropic ones and thinking floors on four Gemini
ones as a by-product of writing the entries; then four live slices ending in
the smoke sweep, which put all seven request types through all twelve models
— 83 requests, 81 of 84 outcomes passing, $0.1022.

What has not: the feature pass on the new default (a DOCX translation and a
Shopping List Builder PDF, rendered and inspected — coverage item 10), the
docs, and the release, all of which Phase 5 includes. The sweep also left the
`busy` classification and the document path untested, and turned up three
defects of its own. Calling the phase finished because its cheapest part
succeeded would repeat the error this paragraph exists to record.

**Plan**: retire 15 of 16 presets and add 11. Steps: reproduce against real
keys, honest errors, one server-authoritative catalogue with lifecycle and
capability metadata, SDK upgrades one provider at a time, then the new
presets. Validation is seven small live requests per model (≈ $0.50 for all
11) on top of $0 contract, fixture, and UI tests. Decisions and open questions:
`docs/ai-config/model-catalogue-refresh-2026-09.md`; prompt efficiency and a
local TranslateGemma option: `docs/ai-config/translation-efficiency-and-local-models.md`.

**Decided 2026-09-11**:
- Flagship models are offered with a cost warning on `gpt-6-astra`,
  `claude-fable-5-1`, `claude-opus-5`, and `gpt-5.6-sol`.
- Thinking defaults to off or the lowest level, with a warning above Medium.
- Google's mid tier is `gemini-3.8-flash`.
- The SDK upgrades are approved, with Node 24 as a separate release.
- Chinese means Simplified (`zh-CN`).
- Claude Sonnet 4.5 and Opus 4.5 retire outright.
- Every catalogue entry records per-language coverage. The Languages page and
  AI Configuration warn when an enabled language is not offered by the
  active model.
- Large bulk retries and long-document classification join the final feature
  pass; a 524 on either moves those routes onto a background-job table.
- Catalogue maintenance is now a standing rule in `AGENTS.md`.
- Long-running translation work gets a translation-specific job table rather
  than a generic one, built when a feature needs it.
- One server-authoritative catalogue replaces the duplicated `model-specs.ts`
  files and the stale secondary lists.
- Release order: honest errors and administrator alerts, then Node 24, then
  the catalogue and SDK update before 2026-12-11.
- The OpenAI and Anthropic preset lists are confirmed, Fable 5.1 included.
  Google offers `gemini-3.5-flash-lite` (default), `gemini-3.6-flash`,
  `gemini-3.8-flash`, and `gemini-3.1-pro-preview` with a Preview badge.
- An administrator alert fires whenever a cloud provider reports the account
  out of credit or rejects the key or model.
- **The local model is shelved.** Hosting it well needs new hardware and is a
  project of its own. Its design is kept in the efficiency document: offered
  only when a staff request fails, full parity with cloud models, a hybrid of
  TranslateGemma plus a general model, `AIConfiguration.role`, and a
  per-language warning when the local models do not offer a requested
  language.

**Checked 2026-09-11**: production's `GET /api/languages/enabled` returns
`Persian`, so the Google and Anthropic name lists refuse none of the enabled
languages. Nine languages are enabled; Bosnian, switched on briefly for
testing, has been switched off. The hand-kept lists still move into the
catalogue, with a test that every enabled language passes every provider.

**Also found**: bulk retry in Translation Management and DOCX classification
both wait for every provider call before responding. A large selection can
therefore outlast Cloudflare's 125-second proxy timeout (a 524) on cloud models
today. DOCX translation progress lives in an in-memory map and is lost on
restart.

**Lesson**: a check named for one thing (the key) that fails on another (the
model) is a misleading error message waiting to happen. The #80 lesson —
classify the provider's answer, don't guess from where you called it — was
applied to one route and not to the check in front of every route.

### #83 — nginx rejected every production-sized backup, making recovery impossible
**Priority**: High · **Status**: Fixed; verified in a Docker rehearsal
**Bucket**: Deployment / disaster recovery

Uploading a real 152 MB production artifact to Restore returned **413 Request
Entity Too Large**. The request never reached the backend — zero log lines.

`docker/nginx.conf` capped request bodies at **64m**; `MAX_ARTIFACT_BYTES` in
`routes/admin/restore.ts` declares **256 MB**. A production backup falls
between them, so no production-sized backup could be uploaded through the
deployed stack at all. Disaster recovery — the one thing the artifact exists
for — was impossible through the only interface that offers it.

**This is the second time these two numbers have drifted.** The comment three
lines above the 64m records the first: nginx at 16m against a 64 MB import
ceiling, which cost a production import (#68), and ends "Change both together
or neither." The 64m was correct for the import path; restore's 256 MB ceiling
arrived later and nobody raised the proxy.

**Why neither was caught.** The development frontend talks to the backend
directly — there is no proxy in the path. nginx exists only in the deployed
stack, so the mismatch is invisible everywhere except production and a Docker
rehearsal. Both times, a person discovered it after it cost something.

**Fixed** with a dedicated `location /api/admin/restore` at 256m, scoped rather
than raising the general limit to suit the largest request in the application,
plus 600s timeouts and `proxy_request_buffering off` for an upload that takes
minutes on a Pi. Retried in the rehearsal: 413 became 200, and the full
restore completed.

**Covered by** `upload-limits.test.ts`, which parses `docker/nginx.conf` and
asserts each location admits at least what the application declares. Verified
to fail on the old value.

**Deployment note:** this fix lives in the *frontend* image, because that is
where nginx runs. A 1.7.5 deployment that reuses an older frontend image will
still reject backups at 64 MB.

**Lesson**: a limit enforced in one layer and declared in another is one
number in two places. The first drift produced a comment; a comment is not a
mechanism, and the same pair drifted again underneath it.

### #82 — Nobody could become Administrator on a fresh instance
**Priority**: High · **Status**: Fixed; **verified in a Docker rehearsal 2026-09-04**
**Bucket**: Auth / disaster recovery

Found by rehearsing disaster recovery on a fresh Docker stack, which is the
only way it could have been found: the fault is invisible on any instance that
already has a roster, and total on the one kind that does not.

`docs/auth/administrator-authorization.md` and
`docs/auth/admin-page-implementation-plan.md` both carry the same table —
empty `User` table, first verified user becomes Administrator — and no code
implemented it. `VerificationService.findOrCreateUser` created the row with no
`role`, so the schema default made every first sign-in Staff. Across the whole
backend only three paths ever assigned `ADMINISTRATOR`: the operator CLI, the
roster route (which requires an existing administrator), and restore's
re-grant of the person performing it. None can fire on an empty roster.

The consequence is the recovery path itself. On a new Pi the operator signs
in, lands as Staff, finds no Admin or Data navigation, and cannot reach
Restore. The way through is `docker compose exec backend node dist/cli/admin.js
grant --email=… --confirm` — shell access to a container, at the worst possible
moment, documented nowhere in the runbook. The CLI itself reported the state
accurately and nothing else did: *"Administrators who can sign in: 0 (this mode
requires 1)."*

**Fixed with a narrower trigger than the design specified.** The bootstrap
requires an empty roster **and** no encryption key — two independent signals
that nobody has begun setting the instance up. Granting authority to whoever
arrives first is the most dangerous act available here, and the same design
document rejects it for a populated instance in as many words ("a
privilege-escalation race during pantry hours"); one signal is one failure away
from being wrong. The count and the create run in one transaction, so two
simultaneous first sign-ins cannot both win, and the grant writes a
`ROLE_GRANTED` audit entry marked `via: 'fresh-instance bootstrap'`.

**The narrowing changes clean slate.** `EncryptionKey` is excluded from what a
clean slate clears, so clearing the roster on a configured instance no longer
arms the bootstrap — the operator CLI is the way back. Four places claimed
otherwise and now say this: `clean-slate-service.ts`, both auth state tables
(now three-column, with the key as the third), `clean-slate-and-seed.md`, and
the recovery runbook, where step order is now load-bearing for a second reason:
sign in *before* initializing encryption, or the bootstrap is disarmed.

**Covered by** `fresh-instance-bootstrap.test.ts`, four cases against freshly
migrated databases, including the one the narrowing adds: an empty roster with
an encryption key present hands out nothing.

**Verified.** The rehearsal stack was wiped to an empty volume and rebuilt on
the fixed image. The first sign-in landed as Administrator, the audit log
recorded `via: "fresh-instance bootstrap"`, and the loud log line fired.

**Lesson**: a documented behaviour with no test is a plan, not a feature. This
one was specified twice, in tables, with the tradeoffs argued — and the gap
between the table and the code survived every review because the only instance
that can reveal it is one nobody keeps around.

### #81 — Restore could not restore: a backup would not load onto a fresh instance
**Priority**: High · **Status**: Fixed; **rehearsed against production data 2026-09-04**
**Bucket**: Data Management / backup and restore

Selecting **Inventory** — or Inventory and Languages together — in Restore
failed with *"Cannot delete this item because it is referenced by other
items."* Nothing failed on delete. That message is the P2003 mapping, written
for the delete direction; P2003 is "foreign key constraint failed" and covers
inserts too, and it sent the investigation looking at deletion order while the
real failure was an **insert**.

Five faults, one root. The unit graph in `restore-units.ts` claims each unit is
"closed under foreign keys". That claim was hand-written in TypeScript about a
graph that lives in Prisma, and nothing compared the two.

1. **`languages` was not closed.** `Translation.classificationPromptId` points
   at `SystemPrompt` in the configuration unit; `requires` said `[]`.
2. **`languages` could not be closed.** `Translation.documentId` points at
   `Document`, excluded from every artifact because the backup carries no file
   payloads. No `requires` edge can reach a table no unit contains. Measured on
   a production snapshot, **112 of 2,319 translations carry a `documentId`**.
   `FormattingChoice.documentId` is the same fault, latent.
3. **`inventory requires languages` had no foreign key behind it.**
   `CategoryTranslation.language` and `FoodItemTranslation.language` are TEXT
   columns holding a language *name*; nothing in the schema references
   `Language` at all. Inventory is the one unit whose every key points inside
   itself — proven by round-tripping all seven tables against a copy of the
   development database — and this edge handed it another unit's failures. It
   is why selecting Inventory alone failed.
4. **Write order came from the backup contract, not the dependency graph.**
   `INCLUDED_TABLES` describes *what* the artifact carries; it was silently
   doing a second job nobody checked. Within a unit the orders agreed; across
   units they did not, so `Translation` was written before the `SystemPrompt`
   it referenced. Now derived from `Prisma.dmmf` (`dependency-order.ts`), which
   cannot drift from the schema.
5. **`RestoreService.run` trusted its caller to have closed the selection.**
   The route did, so nothing noticed the service did not. It closes its own
   selection now.

**Why it shipped.** Every reference column implicated is empty in development:
1,602 translations, zero with a `documentId`. The feature was correct on the
data it was built against, and the case it exists for — a different instance,
where ids line up with nothing — was never run. A **full** restore, every unit
selected, failed the same way; selectivity was never the cause.

**Fixed:** the missing `requires` edge; the spurious one removed; unresolvable
references to excluded tables blanked on insert via `RESTORE_NULLED_REFERENCES`
(only ids the destination genuinely lacks, so a same-instance restore keeps
every link that still resolves); dependency-ordered writes; self-closing
selection; and the P2003 message no longer asserts a deletion.

**Covered by** `restore-contract.test.ts`, which compares the unit graph against
the schema and fails on any of the four declaration faults, and
`restore-onto-empty.test.ts`, which migrates a temporary database and restores
into it — the case nothing had ever exercised. It reproduced the production
failure before the fixes and passes after.

**Audit truthfulness resolved.** The `BACKUP_RESTORED` entry stays where it
is — written before the swap so it survives into the rebuilt file, which is
also why it cannot simply move after success: there would be nothing to write
it into. A failed restore leaves the live database untouched and still
accepting writes, so `BACKUP_RESTORE_FAILED` is appended there instead. The
pair reads as attempted-then-failed rather than as a record of something that
did not happen.

**Runbook ordering proven.** `restore-preserves-secrets.test.ts` executes the
sequence the runbook prescribes — establish an encryption key on a fresh
instance, then restore — and asserts the key survives the swap, that a restored
model configuration arrives switched off with no key, and that a restored
prompt keeps its backed-up state. That ordering was previously justified by
reading the code, which is the same kind of claim that produced this issue.

**Rehearsed 2026-09-04.** A 152 MB artifact generated from a real production
snapshot — 112 translations carrying a `documentId`, two AI configurations, one
of them active without a key — restored onto a container that held nothing.
Result: 2,319 of 2,319 translations, all 112 dangling references blanked with
their rows kept, 199 food items, 39,240 procurement lines, **zero
`foreign_key_check` violations**, both AI configurations inactive without keys,
seven users with one administrator, and the encryption key established
beforehand surviving the swap. The run surfaced two further blockers, recorded
as #82 and #83.

**Still open:** re-running the rehearsal after 1.7.5 reaches the Pi, against a
backup taken from the deployed instance rather than one generated locally.

**Lesson**: an invariant asserted in prose and maintained by hand is a comment,
not a contract. Both halves of this one drifted — an edge with no key behind it
and two keys with no edge in front of them — and the test that compares them is
thirty lines.

### #80 — A Cloudflare 502 page was printed into the Translate & Download PDFs modal
**Priority**: High · **Status**: Fixed; production acceptance pending
**Bucket**: Frontend messaging / shopping lists / AI provider errors

Reported against production 1.6.0. Staff picked nine languages in the saved
template's **Translate & Download PDFs** modal. English downloaded, then all
eight remaining rows read `Failed:` followed by the *entire* Cloudflare
"502: Bad gateway" HTML document — doctype, IE conditional comments, Tailwind
classes, the Ray ID, and the visitor's own IP address — repeated eight times
inside a `sm:max-w-lg` dialog.

Reproduced on localhost, which named the trigger and disproved the first
theory in one run. **The origin never went down.** The AI provider (Gemini)
answered every non-English translation with HTTP 429 / `RESOURCE_EXHAUSTED` —
*"Your prepayment credits are depleted"* — and four separate defects turned
that one recoverable fact into eight screens of markup. English was untouched
because English skips the translation pipeline entirely.

**A. The route answered 502, and Cloudflare ate the body.** The
`translate-missing-strings` catch mapped a non-overloaded provider failure to
**502** with curated JSON. Production is served through Cloudflare Tunnel, and
Cloudflare replaces an origin 502 with its own branded page — which is why the
page attributed the error to the Host (`cf-error-source` on the host block)
while the origin was serving normally. The JSON never left the edge. Every
branch now answers **503**, which Cloudflare passes through untouched and
which is the honest status anyway: FEED is fine, its translation dependency is
not. The two LOTTO sync errors that also answered 502 were moved for the same
reason; no route in the app returns 502 now.

**B. The global error handler withheld the message the route had written.**
`carriesUserFacingMessage` required `statusCode >= 400 && < 500`, so every
curated 5xx message in the app was discarded and replaced with
`INTERNAL_FAILURE_MESSAGE`. That is what localhost showed: the route composed
*"The translation service is busy right now (high demand for Chinese)…"* and
the user was shown *"FEED could not complete that request."* eight times. The
gate is now `statusCode >= 400` — an explicit status code is the author's
signature; the range is not. Accidental errors (Prisma, `TypeError`, driver
faults) still arrive with no `statusCode` and are still withheld. This also
un-buried the curated 503s in `shopping-lists.ts` and the friendly 500s in
`quarantine.ts`, `storage-reconciliation.ts`, and `global-limit.ts`.

The route tests had mounted a *stub* error middleware that forwarded every
`error.message` verbatim, so the curated copy passed in tests and vanished in
production. `translation-routes.test.ts` now mounts the real `errorHandler`.

**C. "Wait about a minute" was the wrong advice.** The classifier treated any
payload containing `429` or `rate limit` as transient overload. Depleted
prepaid credits report the *same* 429 as genuine rate limiting, so staff were
told to wait and retry a condition that no amount of waiting resolves — nine
languages at a time. `classifyTranslationProviderError`
(`services/builder-translation.ts`) now tests account-level wording
(`RESOURCE_EXHAUSTED`, `insufficient_quota`, credits, billing, quota) *before*
the 429/overload markers, and returns `exhausted` | `misconfigured` | `busy` |
`unavailable`. Each maps to its own message and error code
(`AI_TRANSLATION_QUOTA_EXHAUSTED` / `_MISCONFIGURED` / `_BUSY` /
`_UNAVAILABLE`) through one table in the route, so a fifth kind is an entry
rather than another ternary. Both non-recoverable kinds say plainly that
retrying will not help.

`misconfigured` was added after the production account moved from Gemini to
OpenAI and answered `403 Project 'proj_…' does not have access to model
'gpt-5-mini-…'` — an organization-verification / project-allow-list refusal.
Without it that 403 fell to `unavailable` and told staff the service "didn't
respond" and to try again in a moment, which is the same false-hope failure as
the credits case in a different costume. It now matches on 401/403/404 and on
key/model wording, and points at AI Configuration. Ordering inside the
classifier is load-bearing and tested directly in
`__tests__/features/shopping-lists/translation-provider-errors.test.ts`: money
wording wins over a 403 (a billing hard limit is not a wrong key), and a
configuration status wins over a stray `429` in the payload.

**D. The raw payload reached the user.** Independent of A–C: `BaseApiService`
returned `await response.text()` as the error message for any non-JSON
response. Every FEED route answers a failure with `{ error: { message, code } }`
(`middleware/error-handler.ts`), so a non-JSON body cannot have come from the
application — it came from Cloudflare or Nginx. `ErrorHandlerService` already
screens exactly that shape (`isUserPresentableMessage` rejects `<!DOCTYPE`),
so the *toast* was fine, but the modal renders each language's outcome on its
own row and read `error.message` directly, walking past the screen.

- `parseErrorPayload` now discards a non-JSON body (logging the first 500
  bytes in development only) and derives the message from the status via a new
  exported `httpStatusMessage`. `parseErrorResponse` — the message-only helper
  the PDF/blob path uses — delegates to it, so one place decides what a failed
  response may say.
- `ErrorHandlerService.toUserMessage(error)` is now public: the ASK sentence
  without the toast. Any surface rendering an error inline uses it; the modal
  now does, in the destructive colour rather than muted grey.

Covered by `src/test/gateway-error-messages.test.ts` (frontend, asserting
against the actual reported Cloudflare page), the new 5xx cases in
`__tests__/middleware/error-handler.test.ts`, and the three provider-failure
cases in `__tests__/features/shopping-lists/translation-routes.test.ts`.

**Correction to an earlier reading of this issue.** Before the localhost
reproduction, the fast, uniform failures were read as the backend process
dying and Docker restarting it. That was wrong — the origin answered every
request. Two pieces of hardening were written under that theory and are kept
because they are correct on their own terms, not because they were the cause:
`services/pdf/chromium.ts` fired `void request.continue()` /
`void request.abort()` whose rejections nothing caught (fatal to Node by
default), and `index.ts` now logs `unhandledRejection` /
`uncaughtException` before exiting so a crash leaves a trace instead of
vanishing behind a restart.

**Operational note, not a code defect**: the provider account itself is out of
credits. No FEED change restores translation until that is topped up or the
key is repointed.

**Lesson**: three layers each degraded the same message, and each looked
defensible alone — a status the CDN rewrites, a gate that trusted a numeric
range over an explicit choice, and a classifier that matched on a number two
different conditions share. The user saw the worst of all three. When a
message crosses that many boundaries, test it end to end at the boundary that
actually ships, not against a stub.

### #79 — Filter, search, and dropdown controls were transparent to the background
**Priority**: Low · **Status**: Fixed in 1.6.5; production acceptance pending
**Bucket**: Layout / form controls

Staff review of 1.6.0 listed the same defect on thirteen screens: the filter or
search field, and several `Select` triggers, had no fill of their own. Reported
against Category, Food Item, Language, Translation and Reports Management, the
Service Log (pantry status, the three metric sections, and Service Metrics),
Shopping Lists, Document Translator, AI Configuration, Settings (timezone),
Data Management, Help, and five Analytics cards.

One cause, not thirteen. `Input`, `Textarea`, and `SelectTrigger` in
`src/components/ui/` all shipped `bg-transparent`, so every one of these
controls painted whatever sat behind it — the app-shell atmosphere gradient on
a bare page, a `Card` inside a section, a dialog surface in a modal. The same
filter field therefore read as a different colour on each screen and had almost
no edge contrast against the shell.

Fixed at the three primitives rather than the call sites: they now default to
`bg-background`, which is what the two controls staff nominated as correct
already used — the `Columns` dropdown trigger (`Button variant="outline"`) and
the Operating Hours time inputs. Two call sites carried a redundant
`bg-background` override (Operating Hours, the shared date range control) and
were removed so the default is the only place the fill is declared. Standard
written up under "Form Control Fill" in
`packages/frontend/docs/styling/README.md`.

Note on the reported values: the sampled `oklch(0.9912 0 74)` /
`oklch(0.080 0.025 265)` are not `--background`, which resolves to pure white
and pure black. They are closest to `--popover` / `--card`, which suggests the
dark sample came from an open dropdown *panel* rather than its trigger. The
in-project reference controls were treated as authoritative, per the report.

### #78 — Header banner lost its frosted glass in dark mode
**Priority**: Low · **Status**: Fixed; deployed 2026-08-20 in 1.5.0
**Bucket**: Layout / shell surfaces

The breadcrumb header read as flat transparency rather than frosted glass,
while the Analytics filter bar directly beneath it — same intended treatment —
looked correct. Dark mode only; light mode was always right.

Not a missing effect. `.feed-shell-header-panel` declared
`backdrop-filter: blur(14px) saturate(1.5)` the whole time, the header's
`position: sticky` worked, no ancestor created a containing block that breaks
backdrop-filter, and page content did scroll behind it. The blur was applied
and then buried.

The cause was token aliasing. In dark mode the header borrowed the *panel*
gradient:

    --feed-shell-header-start: var(--feed-shell-panel-start);  /* 0.82 */
    --feed-shell-header-end:   var(--feed-shell-panel-end);    /* 0.70 */

Panel tokens are sized for near-solid surfaces. Composited over the header's own
`hsl(var(--background) / 0.4)` background-color that left the bar about **89%
opaque**, so there was almost nothing to see through. Light mode had
purpose-built header tokens at 0.40 / 0.32 and looked correct, which is why the
fault was one-sided.

Dark mode now has its own header tokens at 0.55 / 0.45 — more body than light,
to keep the breadcrumb legible over bright content, but translucent enough for
the blur to register. Measured effective opacity at the top edge: **0.89 → 0.73**
in dark, 0.64 in light unchanged, against the Analytics bar's single 0.80 layer.

The print theme's solid-white header tokens are untouched.

**Lesson**: aliasing one surface's tokens to another couples two things that
look similar and are not. A header meant to be seen through should not inherit
its opacity from a panel meant to be opaque.

---

### #77 — Alert-stream toasts fired on any brief interruption, and fired twice
**Priority**: Medium · **Status**: Fixed; deployed 2026-08-20 in 1.5.0
**Bucket**: Alerts / frontend messaging

Switching browser tabs, or any momentary network drop, produced **two**
identical error toasts: *"We couldn't load alerts right now."* Normal behaviour
reported as a fault, and reported twice.

**Hair trigger.** `EventSource.onerror` fires for things that are not failures
from the user's point of view — a tab backgrounded long enough to be throttled,
a second of flaky wifi, a backend restart. `alertService` already reconnects
every five seconds and usually recovers silently, but it announced the *first*
drop. Fixed by tolerating
`ALERT_STREAM_FAILURES_BEFORE_ANNOUNCING` (3) consecutive failures — roughly
fifteen seconds down — before the event is marked non-transient. The counter
resets on any good snapshot. Subscribers still update their own state
immediately; only the toast waits.

**Duplicate.** Three components call `useAlerts` (the bell, the dialog, the
list), each subscribes to the service, and each raised its own toast for one
service-level event. Two mounted at once meant two toasts.

Fixed at the messaging layer rather than the call site, because "one failure,
several witnesses" is a shape that recurs: `MessageService` now collapses an
identical message and type shown within `DUPLICATE_MESSAGE_WINDOW_MS` (3s) and
returns the live handle of the toast already on screen, so a collapsed caller
can still dismiss or update "its" toast. Different text, different severity, or
a genuine repeat after the window all still show.

**Note**: there was no duplicate-suppression anywhere before this. An earlier
fix for duplicate toasts must have addressed one specific call site.

**Also fixed in passing**: `useAlerts` restated the service's event shape inline
instead of importing it, and the two had already drifted — the hook's copy did
not know about the new field. It now uses `Parameters<AlertEventCallback>[0]`.

---

### #75 — A failed import shows an empty dialog instead of the reason it failed
**Priority**: High · **Status**: Fixed; deployed 2026-08-19 in beta.21
**Bucket**: Data Management / Add Data

Found during the beta.20 deployment, re-importing SIMC visits. The import
failed with a precise, actionable message:

    Visit 26685486 must identify exactly one Head of Household.
    Correct the SIMC export and retry.

The user saw a dialog headed **"Review the detected records before activation."**
with an empty body and a single **Cancel Import** button. The message naming
the visit was only reachable by querying `DataImportJob` over a shell on the
Pi. That is not a workflow — without an operator holding a database prompt,
this failure is indistinguishable from a hang.

Three things line up to produce it, and each one alone is harmless:

- `importPhase` in `import-progress-panel.tsx` branches on `activating`,
  `completed`, `ready`, `awaiting_review` and `preparing`, then falls through
  to `"Reading the data file…"`. `failed` and `cancelled` are both in the
  status union and neither has a branch.
- `showProgress` in `add-data-dialog.tsx` goes false the moment the job is
  terminal, so the progress panel unmounts and takes its status line with it.
- Both `step === 'complete'` render blocks are conditioned on `result` or
  `job.reviewSummary`. A job that dies during parse has neither, so nothing
  renders at all.

The dialog already computes `isTerminal` *including* `'failed'`. It knows. It
just never says so, and `job.errorMessage` is not rendered anywhere in the
component.

**Fix**: give `importPhase` explicit `failed` and `cancelled` phases, surface
`job.errorMessage` and `errorCode` in a failure block at `step === 'complete'`,
and offer "Start over" rather than only "Cancel Import" — the user's next
action after a rejected file is a new upload, not a cancellation.

**Test**: the drift guard should assert every member of the status union maps
to a phase, so a status added later cannot silently fall through to "Reading
the data file…" again.

---

### #76 — SIMC import rejects a one-person household that has no Head of Household ticked
**Priority**: High · **Status**: Fixed; deployed 2026-08-19 in beta.21
**Bucket**: Data import / SIMC adapter

The whole import — 3,799 visits — aborted on a single row. Visit 26685486 has
one member, `Neighbor ID` 12628430, with `Head of Household = No`. The adapter
requires exactly one head per non-anonymous visit:

    if (!anonymous && headIds.length !== 1) throw …INVALID_SIMC_HOUSEHOLD_HEAD

A sweep of the export found this is the *only* such visit, and there are no
multi-head cases at all: 3,799 visits, 1 with zero heads, 0 with more than one.

The rule is right in spirit and too strict in this case. A visit with one
member has exactly one candidate for head; there is nothing to disambiguate,
and refusing it discards 3,798 good visits. Zero heads across *several*
members is genuinely ambiguous and must keep failing.

**Fix**: treat a single-member visit as its own head. Keep the error for zero
heads with more than one member, and for more than one head. Tests for all
three shapes.

**Note**: this is separate from #75 but the two compounded — a
one-cell data condition presented as an unexplained empty dialog, twice, and
the second attempt could not be told apart from the first without a shell.

---

### #73 — Restore aborted on any instance with AI usage telemetry
**Priority**: High · **Status**: Fixed; deployed 2026-08-19 in beta.20; **verified against production data 2026-08-20**
**Bucket**: Data Management / backup and restore

**Rehearsed 2026-08-20**, restoring the real 148MB production backup onto a
scratch copy of the development database — never the development database
itself, and nowhere near production. The precondition was checked first rather
than assumed: the target held 8 `UsageRecord` rows against 2 AI configurations,
which is the exact shape that produced the original failure, so the drill
exercised the bug instead of passing around it.

Both halves of the fix behaved as documented:

- Restoring `service` **and** `configuration`: completed in 11.6s across 25
  tables with no `P2003`, and telemetry went 8 → 0, cleared alongside the AI
  configuration it referenced.
- Restoring `service` alone: completed across 19 tables and telemetry stayed at
  8, untouched — cleared *only* when the data it refers to is part of the
  restore.

Data landed correct: 83,107 encounters (79,308 Link2Feed + 3,799 SIMC, matching
production after the SIMC re-import), `Hispanic, Latino, or Spanish` whole at
59, and `PRAGMA integrity_check` = ok. A pre-change snapshot was written, so the
recovery path has its own recovery path.

Found 2026-08-15 restoring a production artifact onto a development database.
The confirmation step reported **"Cannot delete this item because it is
referenced by other items."** and the restore did not run.

Restore copies the live database to a scratch file and then deletes and reloads
only the selected units — that is what makes "anything you did not select stays
as it is" true. But an **excluded** table holding a foreign key into an
**included** table survives that copy still pointing at rows the restore is
about to delete. `restore-service.ts` sets `PRAGMA foreign_keys = ON` on the
scratch database, so the delete fails with Prisma `P2003` and the whole restore
aborts.

Three such references exist in the schema:

| Excluded table | References |
|---|---|
| `UsageRecord` | `AIConfiguration`, `Translation` |
| `ShoppingListInstance` | `ShoppingListTemplate` |

**Eight `UsageRecord` rows were enough to break a full restore.** Any instance
with AI translation telemetry hits this — production certainly qualifies — and
it fails at exactly the moment recovery matters. The message made it worse: a
generic `P2003` mapping in the global error handler phrased a failed
disaster-recovery restore as a sentence about deleting one item.

**Resolution:** `RESTORE_CLEARED_TABLES` in the backup table contract declares
the excluded tables that reference included ones, with the parents each
references and why clearing it is safe. Restore clears them before deleting
their parents, and only when a referenced parent is actually being replaced —
so a Service-only or Procurement-only restore still clears nothing.

Clearing is correct for both entries **because of what they are**, not because
it makes the error go away. `UsageRecord` is aggregated telemetry the contract
already describes as "rebuilt from operation rather than restored".
`ShoppingListInstance` is generated output bound to a `ShoppingListPDF` file the
artifact does not carry, so its rows are already unusable after any restore.
The contract records that a table must not be added to this list merely to make
a restore pass — rows a user would miss need a different answer.

Two guards, since a prose warning cannot enforce itself:

- a schema-reading test fails when any excluded table references an included one
  without being declared. Verified to fail against the real schema with the
  declaration removed — it reports all three edges above.
- a second test asserts each declared `references` list matches the schema, so a
  stale entry cannot silently stop the clear from firing.

**Workaround while undeployed:** deselect Configuration and Languages &
Translations. Service, Procurement, Inventory, and Shopping Lists restore
normally, because none of them replace `AIConfiguration` or `Translation`.

### #74 — Backup documentation contradicts the table contract on `User`
**Priority**: Medium · **Status**: Fixed in v1.6.0, 2026-08-23
**Bucket**: Documentation / security boundary

`docs/data-management/backup-and-restore.md` describes `User` under **"Included,
with authority neutralised"**, explaining that the roster is carried but every
restored role lands as `STAFF` so that an absent roster cannot arm the
fresh-instance bootstrap.

`services/backup/table-contract.ts` **excludes** `User` outright, reasoning that
restoring the roster restores authority and that in Domain mode the roster
self-heals because a successful sign-in recreates the row as Staff.

Resolved in backup contract v11: `User` is included, `role` is stripped from
the artifact, every restored account lands as Staff, and the authenticated
administrator performing the restore is re-granted while retaining their live
id. `AccessPolicy`, authentication tokens, encryption material, and the audit
log remain excluded.

### #72 — Import progress panel misreported which stage was running
**Priority**: Medium · **Status**: Fixed; deployed 2026-08-19 in beta.20
**Bucket**: Data Management / import UX

**Confirmed in production 2026-08-19**: the panel tracked validate → review →
activate through a real import. Its blind spot for *failed* jobs was a separate
defect, found the same day — see #75.

Found during the first successful end-to-end Link2Feed import on beta.15. The
import worked; the panel describing it did not.

Post-review materialization reported **"Validated 79,308 of 79,308 records…"**
with a full progress bar, because that work and the initial parse are both
status `preparing` with identical row counts and only `activating` was
distinguished. The elapsed timer counted from upload rather than from the
current stage, so the figure shown during materialization silently included the
minutes spent entering 13 review decisions — it read 51 minutes on an import
that had finished reading in about two. The reported question was "should I
click Close?", which is the same finished-versus-hung ambiguity this whole
feature exists to remove, reintroduced one layer up.

A separate defect surfaced while verifying the fix live: `POST /activate`
answers 202 with the job as it stands at that instant, and the ready→activating
transition happens inside the background task, so the response almost always
still read `ready`. The client keyed its poll on status alone, so the poll never
started and a **completed activation was never noticed** — the server reported
`completed` with its counts while the dialog still offered `Activate Data`.

**Resolution:** the panel is extracted to `import-progress-panel.tsx` with a
pure `importPhase(job, pending)` deriving the stage from the job — parse and
post-review materialization are told apart by whether a review summary exists
with nothing left to decide. A four-stage indicator (Validate · Review · Prepare
· Activate) shows how much of the process remains, which was the orientation the
reported confusion was actually asking for. Elapsed time resets per stage. The
determinate bar gives way to an indeterminate one the moment counting stops,
since reading every row is not the end of validation — reconciliation follows,
~20s of a ~168s import. The client now polls while activation is pending, not
only while the status says so.

Review decisions carry the previous action, label, and reason forward as
editable defaults. Each decision still requires its own explicit Save. Bulk
"apply to all similar" was considered and **rejected**: a resolution is evidence
about one observation, and two rows that merely look alike are not the same
fact — the same principle the WTH resolution presets already enforce.

Verified in the running app against fabricated Link2Feed data in the native
export shape, plus an isolated harness covering all five panel states in both
light and dark themes. The harness caught the full-bar-during-reconciliation
case, which unit tests and a live run would both have missed.

### #71 — Link2Feed imports needing review were stranded mid-preparation
**Priority**: High · **Status**: Fixed; deployed 2026-08-19 in beta.20
**Bucket**: Data Management / Link2Feed ingestion

Introduced by #67 and found in production on beta.14. Detaching preparation
moved a staged job's initial status from `awaiting_review` to `preparing`, but
`prepareLink2FeedVisitImport`'s unresolved-issues branch still only called
`recordDataImportJobProgress`. Before the change that was correct — the job was
already sitting in `awaiting_review` — so nothing flagged the missing
transition.

The result was that **every Link2Feed import raising a review question was
stranded in `preparing` forever**, with three symptoms from one cause: the
progress panel counted up without end (observed at 51 minutes on an import that
had finished in about two), saving any review decision was rejected with "This
Link2Feed import is no longer awaiting review" (the resolver requires
`awaiting_review`), and the resume offer reported "FEED is still working" and
could not recover it. SIMC and WTH Tracking were unaffected: both always end at
`ready` and have no user-decision branch.

**Resolution:** the branch now transitions to `awaiting_review`. Two additional
guards, because a unit-test suite passed throughout while the real flow was
broken:

- `startDataImportBackgroundTask` checks, after a task returns *successfully*,
  that the job is no longer in a background status; if it is, the job is failed
  with `DATA_IMPORT_DID_NOT_SETTLE` and the defect is logged. A stranded job can
  no longer present as an import that runs forever.
- `failOrphanedDataImportJobs` now also releases staging rows, review issues,
  any pending import, and the staged source file, matching the normal failure
  paths. An interrupted import could otherwise leave ~79,000 staging rows and
  the uploaded source on disk until the 24-hour expiry sweep.

Verified end-to-end against WTH's real 25,124,653-byte export on a scratch
database: staged job reaches `preparing`, prepare completes in 13.4s locally,
and the job settles at `awaiting_review` with 79,308 staged rows and 13
decisions pending — the exact production shape. The scratch database was deleted
afterward.

**Follow-up worth taking:** no test exercised "prepare a real file and assert
where the job lands", which is why both this and #70 reached production. The
synthetic generator in
`docs/data-management/link2feed-import-benchmark-plan.md` Phase 1 would make
that check runnable in CI without a PII file.

### #70 — Link2Feed adapter could not parse a native Link2Feed export
**Priority**: High · **Status**: Fixed; deployed 2026-08-19 in beta.20
**Bucket**: Data Management / Link2Feed ingestion

The Link2Feed visit adapter had never successfully parsed a real Link2Feed
export. Every fixture and test was built from synthetic, pre-serialized data,
and the native export differs from it in two independent ways — each of which
was fatal, and the second of which only became visible once the first was
fixed.

**Dates.** `canonicalSerial` required a spreadsheet day-number (`45200`,
`45200.5`). The native export writes ISO — `YYYY-MM-DD` for Visit Date, Client
First Visit-Date, and Client Date of Birth, and `YYYY-MM-DD HH:MM:SS` for
Recorded At. `Number('2025-01-10')` is `NaN`, so every row failed at the first
date field. The serial expectation appears to have come from a manual
"serialize the dates" preprocessing step (cf. the `_serialized_expanded`
artifact in WTH's export vault) that was never recorded as a requirement.

**Row width.** The exporter terminates every *data* row with a delimiter its
*header* row lacks, producing one nameless, always-empty field per record —
30 header columns against 31 data fields. With `relax_column_count: false`,
csv-parse failed on the first data row. Confirmed structural, not corruption:
present on 100% of 20,000 sampled rows, and the surplus field was empty in all
of them.

Neither defect relates to column selection. FEED's design intent — recognize
known columns, ignore everything else, never ingest PII — was already
implemented correctly via `PROJECTED_HEADERS`, and extra *named* columns were
always handled.

**Resolution:** `canonicalSerial` now accepts ISO dates and ISO datetimes
alongside serials, resolving both encodings to the same canonical serial so a
record key is identical whichever form an export used. Invalid calendar dates
and out-of-range clock times are rejected by round-trip comparison.

Slash-formatted dates (`M/D/YY`, `M/D/YYYY`) are **deliberately refused** with
a distinct `AMBIGUOUS_LINK2FEED_DATE_FORMAT` code rather than parsed. A
spreadsheet round-trip rewrites ISO dates into that style, losing the century
and leaving field order unstated; on a multi-year archive, importing 2025 as
1925 silently is worse than refusing the file. This was observed for real —
an Excel round-trip attempted as a workaround converted the entire file to
`M/D/YY`.

The trailing filler is measured once from the first two records
(`detectLink2FeedTrailingFillerColumns`) and declared as part of the expected
record shape, so strict column counting stays on. `relax_column_count_more`
was considered and rejected: it discards *any* surplus field silently, so an
unquoted comma mid-row would shift later values and file client data under the
wrong headers with no error. A populated surplus, or more than four unnamed
columns, is refused.

Verified against WTH's real 25,124,653-byte export: 79,308 rows parse in 3.27 s
on the developer Mac with 0 blocking issues.

### #69 — Staged import files are never swept; PII can persist indefinitely
**Priority**: High · **Status**: Fixed; deployed 2026-08-19 in beta.20
**Bucket**: Data Management / data protection

**Confirmed in production 2026-08-19**: `Data import staging sweeper started`
appears in the backend log on boot.

A Link2Feed visits export is the most sensitive data FEED handles — client IDs,
birth years, demographic responses. Uploads stream to a private staging file
under `STORAGE_PATH/data-import-staging` with careful handling (`0700`
directory, `0600` files, no original filename retained), and
`docs/data-management/unified-add-data.md` states staging "expires after 24
hours."

The expiry is half-built. `createDataImportJob` stamps every job with
`expiresAt` (`services/data-import/jobs.ts:176`), and
`deleteExpiredDataImportStaging()` (`services/data-import/workflow.ts:161`)
correctly finds expired jobs, deletes their staged bytes, and cleans up any
pending import. **Nothing calls it** — a repository-wide search returns exactly
one occurrence, its own definition. No boot hook, no interval, no test.

Success, failure, and cancel all delete the staged file, so the exposure is
whatever escapes those paths: a browser closed mid-import, a container restart,
an unhandled error outside the existing `catch` blocks. In those cases a
complete export remains on the Pi's SD card indefinitely, in a directory
documented as self-clearing within a day. Larger files widen the window — a
24 MB import is both a bigger retained artifact and a longer wait during which
a user may give up and close the tab.

Two aspects make this worth its own entry rather than a footnote in the
benchmark plan: the documentation asserts a guarantee the code does not
deliver, which is the kind of gap that survives review precisely because the
doc reads as evidence; and the fix is small — call the existing function at
backend start and on an interval, with a test that fails if the wiring is
removed.

**Resolution:** `services/data-import/staging-sweeper.ts` starts the existing
sweep at server boot and hourly thereafter. The immediate first pass is the
point of the boot hook — a restarted container collects whatever the previous
process left staged instead of waiting a full interval. Overlapping passes are
skipped rather than queued, a failing pass is contained and never disables the
schedule, and the timer is `unref`'d so cleanup never holds the process open
during shutdown.

The regression that caused this was a missing caller, not broken logic, so no
behavioral test of the sweep would have caught it. `staging-sweeper.test.ts`
therefore asserts the startup wiring directly alongside the behavioral cases;
that guard was verified to fail against the pre-fix entrypoint.

### #68 — nginx rejects imports at 16 MB, against a 64 MB application ceiling
**Priority**: High · **Status**: Fixed; deployed 2026-08-19 in beta.20
**Bucket**: Data Management / deployment configuration

`docker/nginx.conf` sets `client_max_body_size 16m` on `location /api/`, with a
comment scoped to the older OFB path ("allow an OFB export through … the route
enforces the real 5MB cap"). Unified Add Data was later built with a 64 MB
staging ceiling (`MAX_STAGED_DATA_IMPORT_BYTES`,
`services/data-import/staging.ts:17`), sized explicitly against WTH's real
Link2Feed export of 16,940,175 bytes.

The two constants were never reconciled, and they sit in different layers with
nothing connecting them. nginx's limit is 16 MiB = 16,777,216 bytes, so **the
very export that justified the 64 MB ceiling already exceeded the transport cap
by ~163 KB at the moment that ceiling was chosen.** The 64 MB figure has never
been reachable in production; nothing between 16 MiB and 64 MB has ever been
importable, whatever the application layer believed.

A rejected upload is a 413 issued while the browser is still sending, so the
dialog shows no server message and no resolvable error — it presents as a
stall. This is a leading candidate for the 1.5.0-beta.10 failure on a 24 MB
file (see also #67).

**Resolution:** `client_max_body_size` raised to `64m` to match
`MAX_STAGED_DATA_IMPORT_BYTES`, so the application-layer cap — which returns an
actionable message — is the one that binds. Each constant's comment now names
the other and states that they must change together, since the failure mode is
silent: nginx sits in front and a lower value there simply wins.

There is no third number to reconcile; the Add Data dialog has no client-side
size guard. Not syntax-checked with `nginx -t` (no Docker daemon available on
the dev machine); the change is one directive value plus comments, and the
deploy's own container start will surface a config error immediately.

### #67 — Imports run inside one synchronous request: no progress, ~100s ceiling
**Priority**: High · **Status**: Fixed; deployed 2026-08-19 in beta.20
**Bucket**: Data Management / import UX and architecture

**Confirmed in production 2026-08-19**: a 3,799-visit SIMC import ran as a
background job with a live progress panel, and a second one survived the
request that started it.

`POST /api/data-import/jobs` (`routes/data-import.ts:291`) awaits the entire
`prepare()` before responding. For Link2Feed that one request performs staging,
full CSV parse and validation, all staging-row writes, the profile dedup pass,
reconciliation, and pending materialization. Two consequences:

**A hard time ceiling no optimization can pass.** nginx allows 300s
(`proxy_read_timeout`, raised deliberately after an earlier 60s truncation),
but production is served through Cloudflare Tunnel and the Cloudflare edge
returns 524 at ~100 seconds regardless of origin configuration. 100s is the
real production budget and is documented nowhere in the repo.

**Progress data exists but is unreachable.** The backend already emits it —
`prepareLink2FeedVisitImport` calls `recordDataImportJobProgress` every 5,000
rows (`services/service/adapters/link2feed-visits.ts:529`), and
`GET /api/data-import/jobs/:jobId` already returns `processedRows`, `totalRows`,
and the event log. Nothing consumes it: the frontend `DataImportApiService` has
no `getJob` method, and the dialog renders one static spinner reading
"Preparing the review…" (`add-data-dialog.tsx:790`). The client is blocked on
the very request that is producing the progress, so a genuine stall and a slow
import are indistinguishable to staff.

Both follow from the same design choice, and one change addresses both: return
`202` after staging and move `prepare` to a background task the client polls.
Note that real cancellation does not come free with polling — there is no
server-side abort, and a Cancel that only dropped the HTTP request would let
the import commit anyway while telling the user the opposite. Cancel is
currently disabled during import, which is the honest behaviour.

**Measured on the production Pi, 2026-08-14** (beta.12, 25,124,653 bytes,
79,308 rows): total **167.8 s**, against a ~100 s ceiling. Cloudflare returned
524 while the origin kept working and completed normally. Phase breakdown from
the job event log:

| Phase | Time |
|---|---|
| Upload, stage to SD, hash, detect | 0.2 s |
| Parse + stage 79,308 rows | ~147 s |
| Profile dedup, presets, reconcile | ~20 s |

Ingest rate degrades ~2.6× as the staging table fills — 1,040 rows/s over the
first 5,000, 397 rows/s by 65,000. Parsing is constant-rate CPU work and cannot
do that; the likely mechanism is index maintenance, since `sourceRecordKey` is a
SHA-256 hash so `@@unique([jobId, sourceRecordKey])` takes keys in random order
and every insert lands on an arbitrary B-tree page. Tracked as a separate
optimization question — it is not what made the import impossible.

**Resolution:** preparation and activation now run detached from their requests
(`services/data-import/background.ts`). `POST /jobs` stages the file — 0.2 s
measured — and returns **202**; `POST /jobs/:jobId/activate` likewise. The
client polls `GET /jobs/:jobId`.

Optimization alone could not have fixed this: even a 2× speedup lands at ~84 s
against a 100 s ceiling, which is not a margin worth shipping.

A new `preparing` status carries the change. `awaiting_review` previously meant
two different things — "the server is still parsing" and "the server is waiting
for you" — which a progress indicator cannot tell apart. Resolving the last
review issue also returns the job to `preparing` while materialization runs,
because that step is six large `INSERT … SELECT` statements and can outlive its
request too.

The progress data always existed and was simply unreachable: the backend has
recorded `processedRows` every 5,000 rows all along, and `GET /jobs/:jobId`
already returned it — but the client was blocked on the very request producing
it. The dialog now shows counted progress, a determinate bar once `totalRows` is
known and elapsed time before then, and never a fabricated percentage.

Two failure modes that detaching introduces are handled explicitly.
`failOrphanedDataImportJobs` runs at startup and fails any job left in a
background status by a stopped process — nothing else would ever advance it, and
a polling client would wait forever. And closing the dialog during background
work no longer cancels the job: cancelling mid-run would delete staging rows out
from under the running task, so the button reads **Close**, the work continues,
and `GET /jobs/active` offers the way back.

That resume path is what recovers the real stranded import: job `cmstqsmt` held
79,308 staged rows and 13 pending decisions with no way to reach them.

Cancellation during background work is still not offered. There is no
server-side abort, and a control that only dropped the poll would let the import
commit while telling the user the opposite.

### #66 — Imported Tracking observations were invisible in the Service Log
**Priority**: High · **Status**: Fixed; deployed in 1.5.0; **staff-accepted 2026-08-21** (Service Log matches the Tracking source)
**Bucket**: Service Log / operational continuity

The Tracking adapter activated 1,114 valid operational observations, but the
daily Service Log queried only rows whose source was `feed_service_log`. This
incorrectly treated migrated history as a parallel read-only source and left
historical entry fields blank.

**Resolution:** operational observation identity is now the organization-wide
metric/date pair rather than metric/date/source. Tracking activation seeds that
living fact; a normal Service Log save appends the next native revision and
preserves the imported workbook provenance. An intentional clear is stored as
an auditable current clear revision so restoring an import cannot resurrect the
old value. The database enforces at most one current revision for each
metric/date, and lifecycle projection always prefers a later native decision.

### #65 — Imports table omitted Service import history
**Priority**: High · **Status**: Fixed; deployed in 1.5.0; **staff-accepted 2026-08-21** (Imports table lists all three service sources; SIMC reports 525 imported visits rather than 3,799 CSV rows)
**Bucket**: Data Management / unified imports

The unified Add Data modal correctly activated Link2Feed, SIMC, and WTH
Tracking into `ServiceImport`, but the Imports table retained its earlier
procurement-only state and API call. This made successful Service activations
look absent even though their facts and durable provenance were intact.

**Resolution:** Data Management now reads an organization-wide, cross-domain
history projection over durable `ProcurementImport` and `ServiceImport` rows.
The shared table uses generic source, data-date, record-count, warning, status,
and imported-at concepts; its details remain domain-specific. Service record
counts describe imported visits or metric observations rather than blindly
repeating raw CSV row counts. Temporary `DataImportJob` rows and pending Service
materialization are excluded. All authenticated staff can read history;
rollback and restore remain administrator-only.

### #64 — OFB importer did not provide its required exporter
**Priority**: Medium · **Status**: Fixed; deployed in 1.5.0; **staff-accepted 2026-08-21** (verified live in production)
**Bucket**: Data Management / procurement imports

FEED accepts the unified 26-column OFB schema produced by the OFB Order CSV
Exporter, but the Import OFB Data dialog previously assumed staff already had
that custom Chrome extension. Its long description explained the file's
channel coverage while omitting the prerequisite that makes the file possible.

**Resolution:** the unified **Add Data** dialog keeps a concise **Download the
exporter** link beside its source-neutral upload control. The download is served
with FEED's static assets and contains the version 2.0.0 extension in a clearly
named folder plus a two-page PDF installation guide. The guide follows
Google's official unpacked-extension workflow, uses the staff-supplied Chrome
Extensions screenshot with numbered callouts, and carries the user through
installation, verification, Primarius export, FEED import, troubleshooting, and
the extension's privacy boundary.

The extension remains a custom unpacked Chrome extension, not a Chrome Web
Store installation. Staff must unzip the package, enable Developer mode, load
the folder containing `manifest.json`, and keep that folder in place. The ZIP
retains the extension's README, privacy notice, support document, changelog,
assets, and AGPL license.

### #63 — Reports Management bulk selection and deletion
**Priority**: Medium · **Status**: Fixed; deployed in 1.5.0; **staff-accepted 2026-08-21**
**Bucket**: Reports Management / table consistency

Reports Management was the only current management table without row
selection or bulk actions. Food Items, Categories, and Translations already use
the shared `EnhancedDataTable` selection feature, selected-row count, Actions
menu, and bulk-delete confirmation. Reports instead exposed deletion only from
each row's action menu.

**Resolution:** Reports Management now uses that established table pattern: a
checkbox column, current-page select-all, selected count, Clear control, and a
destructive **Delete Selected** action. Single-row and multi-row deletion share
the standard bulk-delete confirmation, supplemented with the existing warning
that templates are organization-wide and downloaded reports are unaffected.
Successful deletion clears selection before reloading the table.

Deletion is one source-scoped backend transaction rather than one request per
row. Every requested id must exist with `source = 'analytics'`; a stale,
wrong-source, or concurrently changed selection rolls back as a unit. This
prevents partial deletion and prevents the Analytics route from reaching the
dormant report workspace's templates. No schema migration was needed.

**Deliberate boundary:** **Run Selected** was not added. Templates can carry
different filters, outputs, card options, and run-time date ranges, so a bulk
run needs a separately reviewed product contract for whether it creates
multiple downloads, one archive, or a combined report.

### #62 — Analytics report PDF parity and report-selection state regressions
**Priority**: High · **Status**: Fixed in source 2026-08-08; awaiting staff acceptance testing
**Bucket**: Analytics reports / human-evaluation findings

The report architecture is sound and most cards are accurate, polished print
representations of Analytics. Human evaluation of beta.9 found a small set of
localized parity failures in newly connected cards. This issue deliberately
preserves the current model — server-authored SVG/HTML, one card accessor for
PDF and CSV, and the ZEV selection workflow — and records the narrow changes
needed to make these cards meet it.

Investigation covered the report commits from `5b6306f` through `00ad2b2`, the
Analytics and Operations components, `EnhancedDataTable`, the report selection
provider, the card registry/accessors, print primitives, report route/builder,
tests, report architecture and staff guide, table standard, chart-colour guide,
operational-analytics design, and a freshly rendered four-page PDF made with the
production renderer and deterministic review data.

**Resolution:** the recommended localized approach was implemented without
changing the report architecture. Automatic seasonal selections now derive all
years from the run-time payload while explicit subsets remain fixed; sparse
seasonal series carry a defined mask so out-of-range months are absent rather
than zero. Paid-product rows retain their family segments for print. The
existing grouped-bar and line primitives gained opt-in axes/value labels for
the three affected Operations cards. `SelectableBlock` now keeps one stable DOM
tree, explicitly clears `inert`, and captures a card's options when that visible
card is selected. Existing working exports continue through the same accessors
and unchanged default primitive behavior.

#### #62a — Procurement PDF parity

##### Seasonal Inbound Weight exports only the current year for All history

**Observed:** an All-history PDF can contain only the current-year series even
though Analytics has earlier years.

**Root cause is card-option state, not procurement data.** The local All query
resolves to 2009-11-09 through 2026-08-08 and returns all 18 years. The backend
card also renders one series per year when those years reach it. The failure is
that the print accessor renders only `cardOptions.years`, while the client
serializes a concrete year array derived from the range that happened to be
loaded when options were captured:

- a saved template stores the default resolved array (often only the current
  year from a 90-day range), even though templates intentionally do not store a
  date range; running that template for All history therefore reuses the old
  range's year list;
- report selection snapshots every live card option at **selection start**.
  Inactive Radix tab content is unmounted, and the provider neither unregisters
  nor refreshes its old entry. Starting on the other lens can therefore freeze
  a stale one-year seasonal option before the Procurement card is visible;
- absent years currently mean `[]` on the backend, so there is no safe dynamic
  default when a template or cross-lens selection has no current option.

**Approaches:**

1. Ignore the option and always derive every available year from the report
   payload. Smallest backend change and fixes All immediately, but removes the
   intentional year-picker behavior from exports.
2. Distinguish an automatic selection from an explicit subset, for example
   `yearMode: 'all-available' | 'selected'` plus `years` only for the latter;
   derive `all-available` from the newly requested payload. Snapshot card
   options when that card is selected, while it is mounted and visible, rather
   than freezing every current/stale entry when selection mode begins. This
   keeps user-selected subsets and lets saved templates adapt to their new
   run-time range.
3. Put the seasonal selection in URL/page filters and make the table/chart
   controls fully controlled from a shared report store. This gives one global
   source of truth, but broadens a local card control into page navigation and
   is disproportionate to this defect.

**Recommendation:** approach 2. It preserves both promises: explicit card
choices reproduce exactly, while a template's intentionally fresh date range
cannot be narrowed by an implicit default saved from an older range.

##### Seasonal lines falsely continue at zero outside the selected range

**Observed:** a year with data for only part of the selected interval falls to
zero and continues across out-of-range months, visually asserting zero inbound
weight where the report did not ask a question.

**Root cause:** the screen leaves missing month/year cells undefined and uses
`connectNulls={false}`. The report accessor instead starts every selected year
with `new Array(12).fill(0)`, and `lineChartSvg` unconditionally joins all twelve
values into one polyline. A rendered fixture reproduced the false baseline from
the last observed month through December (and before the first in-range month
for the opening year).

**Approaches:**

1. Use zero only for observed/in-range zeroes and carry an optional defined
   mask per series; teach `lineChartSvg` to draw separate contiguous runs. This
   keeps the existing numeric `Series.values` contract intact for every other
   chart and lets the CSV write blanks outside coverage.
2. Widen every `Series.values` entry to `number | null` and make all chart,
   condensation and CSV helpers null-aware. This is conceptually clean, but a
   broad contract migration for one card and risks changing working charts.
3. Add a seasonal-only SVG renderer that accepts sparse points. It is local and
   low risk, but duplicates axes, colour and legend behavior already owned by
   `lineChartSvg`.

**Recommendation:** approach 1. An optional defined mask is the smallest
general extension of the working line primitive. The seasonal accessor should
derive coverage from the resolved start/end dates, terminate at those boundary
months, and never turn out-of-range absence into zero.

##### Where Paid Procurement Dollars Went loses the stacked aggregate bar

**Observed:** Analytics divides `Other paid products (146 codes)` into adjacent
product-family segments; the PDF prints it as one solid bar.

**Root cause:** the frontend datum retains `familyBreakdown` and its custom bar
shape renders those segments. The report accessor reduces every row — including
the aggregate — to only `{ label, value }`, and `hBarSvg` has no row-segment
input. The aggregate composition is discarded before printing. A rendered
fixture reproduced the single-colour tail bar.

**Approaches:**

1. Add optional per-row segment metadata to `CardData` and a shared segmented
   horizontal-bar print path. Keep total spend as the CSV value and use the
   segments only to explain that total visually; extend the existing formatter
   parameter so labels remain dollars.
2. Create a paid-products-only renderer and duplicate the frontend family
   parsing/segment layout in it. This is quick, but creates another print
   primitive and an unchecked second implementation of the same chart.
3. Move the entire paid-product presentation model into the procurement API so
   screen and report consume pre-grouped rows and segments. This maximizes
   semantic sharing, but changes a stable API and more working screen code than
   this export defect requires.

**Recommendation:** approach 1, with focused frontend/backend parity tests for
family classification and segment totals. It extends the current print
vocabulary without changing the API or redesigning the card.

#### #62b — Operations PDF charts omit the values needed off-screen

**Observed:** Recurring Availability and Category Pressure render proportional
bars but no numeric axis or end values. Operational Pressure has grid/tick
marks, but no static values for its series; the screen's hover tooltip has no
PDF equivalent. The resulting pictures show direction and relative length but
do not let a reader recover the values being reported.

**Root cause:** `groupedHBarSvg` emits only category labels and rectangles — no
axis, tick labels, units, or bar-end text. Both Recurring Availability and
Category Pressure use it directly. `lineChartSvg` emits a shared y-axis scale,
but deliberately emits no point/end labels; Operational Pressure therefore
loses the exact values supplied interactively by Recharts. Existing tests check
series names and data arrays but never assert that print markup makes those
values readable. The rendered review PDF confirmed the gap.

Category Pressure has one additional correctness edge: its accessor maps an
unknown percentage (`null`) to numeric zero for the SVG while retaining an em
dash only in `series.text`. The comment says unknown should draw no bar, but the
print primitive never reads `text`, so zero and Unknown are visually
indistinguishable.

**Approaches for each affected chart:**

1. **Print value labels:** add formatter-aware labels to grouped bars and
   restrained labels to the line chart (for example end-of-series values, with
   collision handling). Exact and consistent with other report bars, but every
   point on a long line would be cluttered if labels are not deliberately
   limited.
2. **Axes only:** give grouped bars integer or fixed 0–100% axes and rely on the
   existing Operational Pressure axes. Clean and compact, but readers still
   have to estimate exact values and the PDF remains weaker than the tooltip.
3. **Companion data grids:** print a small value table below each graph. Exact
   and accessible, but duplicates the chart, increases page count, and changes
   the established appearance more than necessary.

**Recommendation:** a targeted hybrid of approaches 1 and 2, implemented as
options on the existing primitives:

- Recurring Availability: integer x-axis ticks plus integer labels at the ends
  of its two bars;
- Category Pressure: a fixed 0–100% axis plus percent labels at bar ends, with
  Unknown carried as undefined/no bar rather than zero;
- Operational Pressure: retain its existing x/y scale and add collision-aware
  latest/end labels for each series rather than labeling every daily point.

This supplies range and exact values without turning dense time-series pages
into label fields. It is an extension of the print adapters that already work,
not a new export concept.

#### #62c — Entering and leaving report selection corrupts table state

##### Tables reset before their options are selected for export

**Observed:** Unavailable Episodes and Rationing History return to the first
page and unsorted order as soon as **Generate Report** starts selection mode.

**Root cause:** `SelectableBlock` returns two different child trees. Outside
selection it renders `{children}` directly; during selection it inserts a new
`<div ref={contentRef}>` around them. React remounts the stateful
`EnhancedDataTable` subtree, whose sort and pagination are internal hook state,
so both reset to defaults. `onViewStateChange` can publish the previous view to
the parent, and the backend correctly applies options when it receives them,
but the visible table no longer matches what the user is being asked to select.
The selection provider's start-time snapshot also makes cross-lens/stale option
capture possible, as described in #62a.

##### Tables remain inert after the workflow

**Observed:** after generating/canceling a report, the two tables no longer
respond to sortable headers until the route remounts.

**Root cause:** while selecting, an effect imperatively sets
`contentRef.current.inert = true`; it has no cleanup. Because the direct child
before selection and the inserted content wrapper are both `<div>` elements,
React reuses the same DOM node across both branches. When selection ends the ref
is detached, so the effect cannot set that reused node back to false. React does
not know about the imperatively added property and leaves `inert=true` on the
restored table container. An isolated React/jsdom reproduction confirmed both
DOM-node reuse transitions and the surviving final inert property.

**Approaches:**

1. Render one stable wrapper/content DOM shape in both modes; conditionally add
   checkbox semantics, animation classes and badges, and always assign the
   content node's inert state both ways (with cleanup). Snapshot each card's
   live options when the user selects that visible card. This preserves the
   table instance and its state and prevents stale cross-tab options.
2. Lift all `EnhancedDataTable` sorting, filtering, visibility and pagination
   into controlled parent/provider state. This makes remounts survivable and
   reusable, but expands the table API and migrates working callers to solve a
   wrapper-lifecycle bug.
3. Force-mount both Analytics tabs and restore each table from published
   `initialState` after every selection transition. This retains more DOM and
   potentially duplicate data work, still visibly remounts, and is fragile
   because `useTableFeatures` currently ignores `initialState.sorting`.

**Recommendation:** approach 1. The wrapper owns both regressions and should be
fixed at their source. A stable tree also preserves focus and scroll state,
while per-card selection-time capture satisfies cross-lens reports without
making every table controlled.

#### TDD implementation checklist

Do not begin with renderer edits. First preserve each human finding as a failing
test, then make the smallest production change that turns it green.

- [x] Cover the two-lens option lifecycle, multiple seasonal years, and a
  sorted/paged `EnhancedDataTable` with focused frontend fixtures.
- [x] Prove a default seasonal selection saved from a one-year range expands to
  all available years when that template is run for All history.
- [x] Prove an explicitly selected seasonal subset remains that subset on a
  later run.
- [x] Prove starting selection on Operations, switching to Procurement, and
  choosing Seasonal Inbound Weight captures the currently visible years rather
  than a stale/unmounted value.
- [x] Add backend seasonal tests for a partial opening year, a full middle year,
  and a partial closing year; assert out-of-range CSV cells are blank and SVG
  polylines terminate instead of running at zero.
- [x] Add a paid-product fixture with more than 15 codes and at least three
  families in the tail; assert segment sums equal the aggregate dollars, the
  PDF markup contains all family segments, and the CSV still has one aggregate
  total.
- [x] Add print-primitive tests that assert rendered labels/ticks, not merely
  that SVG exists: integer values for Recurring Availability, 0–100% scale and
  percent labels for Category Pressure, and bounded end labels for Operational
  Pressure.
- [x] Add a Category Pressure null fixture and assert Unknown is not converted
  into a zero-length factual observation.
- [x] Add a `SelectableBlock` lifecycle test with a stateful child; assert the
  child is not remounted when selection starts, a card is selected, Review
  opens/closes, generation completes, or selection is canceled.
- [x] In the same test, assert the content node is inert only during selection
  and sortable controls work immediately afterward.
- [x] Exercise a real `EnhancedDataTable` through sort, page 2, selection,
  capture, cancel, and another sort; explicitly verify both Operations table
  card accessors apply the captured sort/page options.
- [x] Keep the saved-template option round trip green and verify the backend
  applies filter → sort → page in that order.
- [x] Run focused frontend report/selection/table tests and backend report card,
  print and route tests.
- [x] Run the full frontend and backend suites, both package builds, and the
  table/card parity guards.
- [x] Generate a real mixed-lens ZIP through Chromium; inspect manifest and
  per-card CSVs, render every PDF page with Poppler, and compare the five
  affected charts against the configured screen state.
- [ ] Manually exercise both exits — Cancel and successful Generate — then sort,
  filter and paginate both Operations tables without navigating away during
  staff acceptance testing.
- [x] Update this issue, the report architecture/staff guide where option
  semantics change, `CHANGELOG.md`, and release notes only after the behavior is
  verified.

### #60 — Generic error message when attempting to configure Admin with a single administrator role
**Priority**: Medium · **Status**: **Fixed** in 1.5.0-beta.7
**Bucket**: New feature bug

The error message produce when attempting to demote an Administrator when it would violate the two-admininstrator minimum rule produces a generic 'Error An unexpected error occurred. Please try again.' This generic message violates the Error message "ASK" model (i.e., all error messages must be **Actionable**, **Specific**, and **Kind**). The expected behavior is an error message that explains to the administrator (concisely) that they must keep at least two accounts set to this permission level, to prevent locking out the system by accident. It's a failsafe mechanism.

**Root cause: the frontend, not the guard.** The backend message was already
ASK-compliant and carried a 409 with `ALLOWLIST_ADMINISTRATOR_MINIMUM`. It never
reached the toast. `ErrorHandlerService.isUserPresentableMessage` caps messages
at 240 characters as defence-in-depth against leaked driver dumps and stack
traces, and the Allowlist refusal ran to **251** — so the whole explanation was
replaced with the generic fallback. The Domain-mode variant (129 characters) was
unaffected, which is why this only appeared for the two-administrator rule.

**Two fixes.**

Length is a proxy for "this looks like a dump", and it is the wrong test for
prose the server deliberately wrote. Errors arriving with an application error
code are curated by construction — a Prisma dump never carries one — so coded
errors are now exempt from the length cap. The shape checks (HTML, JSON, stack
traces, SQL, paths, driver codes) still apply to them, so the exemption cannot
be used to leak an artifact.

The message itself was also rewritten to three short sentences: what happens,
the rule, and the way out.

> This change would leave only one administrator. Allowlist mode requires two.
> Promote another administrator or switch to Domain mode.

132 characters, from 251. The `action` parameter was dropped from
`assertAdministratorMinimum` — "This change" covers a demotion, a revoke, and a
switch to Allowlist mode without a sentence per caller.

Covered by tests on both sides: the guard names the rule and both routes out and
stays inside the toast budget; a coded over-long message is shown while the same
text uncoded is still capped, and a code does not excuse an actual artifact.

### #59 — Backend suite flaked under load
**Priority**: Medium · **Status**: Fixed in 1.5.0-beta.6
**Bucket**: developer tooling / test integrity

The backend suite failed two tests in one run and three different ones in the
next, all passing in isolation.

**The first diagnosis in this entry was wrong and is corrected here.** It
attributed the flakiness to test files sharing one `dev.db` while Vitest ran
them in parallel. That was inferred from `DATABASE_URL` plus Vitest's default
parallelism, and never checked. Every one of the eleven test files that imports
`src/db` also mocks it — no test touches a real database, so a shared fixture
could not have been the cause. Serialising the suite appeared to fix it, which
made the wrong explanation look confirmed.

**The actual cause** is a timeout that is too short for what the tests do. The
Shopping List Builder's `preview-pdf` tests launch Chromium and render a real
PDF, which takes ~5.6s on this hardware. Vitest's default `testTimeout` is
5000ms. They were already over the line in a *serial* run and passed only when
they happened to land under it; any extra load — parallel workers, a running
dev server, a concurrent build — pushed them over. Serialising helped only
because it reduced contention, not because it removed a conflict.

**Fixed** with `testTimeout`/`hookTimeout` of 30s, and parallelism restored.
Verified across four consecutive parallel runs, and again with eight cores
deliberately saturated — 35 files, 488 passing, 2 skipped, every time.

**Retroactive note stands, for a different reason than first recorded.** Green
backend runs before this were genuinely at risk, because two tests sat past the
default timeout and passed on timing luck. The counts quoted through
beta.4–beta.6 were accurate for the runs that produced them.

Lesson worth keeping: "passes in isolation, fails in a suite" is not
automatically a shared-fixture problem. Read the failure message before
choosing a cause — this one said `TimeoutError`, which pointed straight at the
answer and was not looked at first.

**Seen once more on 2026-09-13, after the fix.** One full run failed
`__tests__/features/food-items/create-duplicate.test.ts > successful create is
unaffected (201 with the new item)`; the file passed alone (4/4) immediately
after, and the next full run was green at 106 files / 1267 passed / 2 skipped,
matching the two runs before it exactly. Nothing in that session touched
food-items — the working tree held only Google translation files, and the test
was last committed in `972f344`.

What can be said: it is intermittent, and it is not a shared-database problem.
That test mocks `src/db` outright, as this entry already establishes every such
file does. What cannot yet be said is the cause. It is a candidate for the same
mistake recorded above — inferring a mechanism instead of reading one — so the
suspicion is noted and left as a suspicion: possibly the dynamic
`await import(...)` of the router inside `beforeEach` racing `vi.clearAllMocks`
under parallel workers. The failure message was not captured before the re-run
overwrote it, which is the thing to do differently next time.

### #58 — Tailwind v4 codemod renamed a variant *value*, not just classes
**Priority**: Medium · **Status**: Fixed in 1.5.0-beta.6
**Bucket**: Tailwind v4 fallout

The v4 upgrade codemod rewrote `outline` → `outline-solid` across the 72-file
template pass. That rename is correct for utility *classes*; it was also
applied to eight `variant="outline"` **prop values** and to two TypeScript
union members declaring them.

Neither `Button` nor `Badge` has an `outline-solid` variant, so every affected
control rendered with no variant styling at all — silently, because
`class-variance-authority` falls through to the base classes rather than
throwing. Affected: pagination's active-page button, the Document Translator's
pagination, the Data Management import-status badge, a Shopping List Builder
badge, and three buttons in the Find Missing Translations dialog.

It survived the migration's utility-by-utility stylesheet diff because that
compared *classes*; these are prop values, which never reach the stylesheet.
It was found while adding a toolbar button, when the union rejected the
`'outline'` every caller was already passing.

Fixed in all eight call sites and both unions. tsc 288 → 280.

Worth a check if other codemod-era prop values were caught the same way — the
class rename list is the place to start.


### #57 — Magic links were burned by inbound mail scanning
**Priority**: Medium · **Status**: Fixed in 1.5.0-beta.5
**Bucket**: authentication

Microsoft Defender, used by William Temple House's IT vendor, prefetches every
link in an inbound message to scan it for malicious payloads. `/api/auth/callback`
verified on GET, so that scan **spent the single-use token before the recipient
ever clicked**. Magic links therefore never worked in practice here, and OTP
became the only usable path — which is why FEED's sign-in copy leads with the
six-digit code.

The workaround of letting a token survive its first use was considered and
rejected: a token good for two uses is a token an attacker can replay, and no
server-side signal reliably separates a scanner from a human.

**Fix.** Consumption moved from GET to POST. The emailed link now points at a
confirmation *page* (`/sign-in/confirm`), which consumes nothing on load and
asks the recipient to press a button; that button POSTs to
`/api/auth/magic-link/verify`, which is the only place a token is spent.
Scanners follow GET and do not submit a form they have not rendered and had a
human press. The token remains single-use, ten-minute, and bound to one
address — nothing is weakened, at the cost of one extra click.

`GET /api/auth/callback` is retained as a redirect rather than deleted, so
links already sitting in inboxes keep working and become scanner-safe in the
process.

**The confirmation page must never auto-submit.** An effect that posted on
mount would hand the token straight back to the bot and undo the entire fix.
This is stated at the top of `magic-link-confirm.tsx` because it is the kind of
thing a later refactor "tidies away".

Verified against a real database, not only mocks: two GETs left the token in
`VerificationToken`, issued no cookie, and a subsequent POST consumed it,
recorded `lastLoginAt`, and issued the session. Replaying the spent token
returned 401 `MAGIC_LINK_EXPIRED`.

Relevant to white-labelling: other agencies may not run equally aggressive mail
security, but the interstitial costs them nothing and protects any that do.

### #56 — Admin page drifted from the standard route layout
**Priority**: Low · **Status**: Fixed in 1.5.0-beta.4
**Bucket**: UI consistency

The Admin page wrapped its content in `space-y-6 p-6` while every other route
uses `space-y-6 min-w-0 w-full pt-6`. `RootLayout`'s `<main>` already supplies
the horizontal and bottom padding, so `p-6` added a second horizontal inset no
other page has — pushing the icon, title, description, and all tab content
further right — and the missing `min-w-0 w-full` removed the guard that keeps a
wide child from forcing horizontal overflow.

Fixed, and measured against Data Management to confirm: icon x=24, title x=64,
header top y=88 on both.

The layout was previously conventional rather than specified, which is how it
drifted. It is now written down in `docs/layout/page-layout-standard.md`, with a
summary rule in AGENTS.md under UI Standards so a future page does not
rediscover it. That document also records the one real inconsistency between
existing pages: `settings/index.tsx` and `shared/data-list/DataList.tsx` wrap
`SectionHeader` in a redundant extra `<div>`, which new pages should not copy.

### #55 — Theme transition radiated from viewport top-centre in Chrome 150
**Priority**: Low · **Status**: Fixed in 1.5.0-beta.4
**Bucket**: motion / browser compatibility

The light/dark reveal radiated from the top centre of the viewport instead of
the Theme Switcher button — **in Chrome 150 only**. Safari and Chromium 148
(Electron) were correct on the same machine and the same 2× display, which is
why the first investigation could not reproduce it.

**Cause.** `clip-path` on `::view-transition-new(root)` resolves against that
pseudo-element's own box, not the viewport. The two coincide only while the
browser sizes the snapshot in CSS pixels. Diagnostics from the affected browser
showed FEED requesting exactly the right thing —
`circle(20px at 889px 31.5px)`, the button's true centre, on the correct
pseudo-element, with `animationName: none` confirming our `@layer base`
override won, no extensions, no forced colors, zoom 1 — and Chrome drawing it
elsewhere. With `innerWidth` 965 and `devicePixelRatio` 2, an origin 92% of the
way across a CSS-pixel box falls at 46% of a device-pixel one: top centre,
exactly as reported.

**Fix.** The reveal is expressed in percentages rather than pixels, so the
origin tracks the button proportionally against whatever box the browser uses.
The end radius is converted through the `sqrt(w² + h²) / sqrt(2)` reference that
percentage radii resolve against, so the geometry is equivalent to the pixel
form rather than an approximation of it. (The duration and easing were then
retuned separately as a feel change — 1200ms on
`cubic-bezier(0.64, 0, 0.36, 1)` — which is independent of this fix.) Verified on
Chromium 148 by pausing the animation at 20% progress: emitted origin
`89.31% / 3.70%` matches the button's computed proportional position, and the
rendered frame is identical to the pixel version. **Confirmed correct in
Chrome 150 by the reporter**, on the machine where the fault was observed.

The earlier hypotheses — Tailwind v4's real cascade layers, an extension, a
Chrome force-dark flag — were each tested and disproved; the notes below are
retained because they rule those out for any future recurrence.

**Superseded investigation notes (2026-07-31).** Measured in the running app at
711×832 and again after resize:

- `runThemeTransition` computed `circle(20px at 635px 31.5px)` → the trigger
  button's exact centre, taken from `getBoundingClientRect()`;
- the animation was paused at 20% progress and the rendered frame showed the
  circle centred on the button, with the outgoing theme surviving longest in the
  opposite (bottom-left) corner, which is the correct geometry;
- `getComputedStyle(html, '::view-transition-new(root)')` reports
  `animationName: none`, so the `@layer base` override in `index.css` is
  winning and the WAAPI animation is the only one running — the Tailwind v4
  real-cascade-layer hypothesis is disproved;
- `html`/`body` carry no `transform`, `filter`, or `backdrop-filter`, so no
  snapshot containing block is displacing the pseudo-element;
- `git show 10a8f24 -- src/lib/theme-transition.ts` is empty: the v4 commit
  changed only `supports-[backdrop-filter]:` → `supports-backdrop-filter:` class
  syntax in `theme-switcher.tsx`, and did not touch the transition code or the
  `::view-transition` rules.

The one genuine weakness found is the fallback in `getTransitionOrigin`: when
`trigger` is null it uses a hard-coded `(innerWidth - 56, 56)` rather than the
button, which would put the origin near the top-right regardless of layout.
`ThemeSwitcher` is the only mount and does pass its ref, so this path is not
currently reached.

**Needed to proceed:** window size, page, and light→dark vs dark→light
direction where it was observed, plus whether the sidebar was collapsed.

### #54 — Admin action-menu icons bypassed the animation standard
**Priority**: Medium · **Status**: Fixed in 1.5.0-beta.4
**Bucket**: motion standards

The Admin roster shipped with raw `lucide-react` icons in `TableActionMenu` and
on the Invite button. `docs/motion/ICON_ANIMATIONS.md` requires **native
animate-ui icons** in action menus: only those read `AnimateIconContext`, so
static Lucide icons ignore the `animate` (menu-open) and `animateOnHover`
triggers entirely. "Change to Staff" and "Revoke access" also shared a single
`UserMinus` glyph, which read as the same action twice.

Fixed by hand-rolling six native animate-ui icons — neither registry ships
animate-ui builds of them, and the lucide-animated versions are imperative-ref,
which the standard forbids here. Geometry is verbatim from lucide-react's
`__iconNode`.

The icons now carry the distinction the actions have: the **shield family**
(`shield-check`, `shield-minus`) is role, the **person/ban family** (`ban`,
`user-round-check`) is access. A role change and an access change can no longer
look identical.

### #53 — Admin page icon was semantically wrong
**Priority**: Low · **Status**: Fixed in 1.5.0-beta.4
**Bucket**: UI semantics

The Admin sidebar entry and section header used a shield-with-checkmark, which
reads as security verification rather than managing people. Both now use
`user-round-cog`: animated in the sidebar (interactive), static in the section
header (decorative parent — Rule 4 of the motion standards, which forbids
animating a non-interactive element and creating a false affordance).

### #52 — Refused sign-in advanced to the code-entry step
**Priority**: High · **Status**: Fixed in 1.5.0-beta.4
**Bucket**: authentication UX

Found while testing revoked access. Requesting a code for a revoked or
unauthorised address produced a screen that said **"Code sent to
&lt;address&gt;"** directly above **"FEED access is limited to authorized
staff."**, and offered a six-digit field for a code that was never sent. Resend
confirmed no email left the system — the backend was correct; only the UI lied.

`OTPTab` had a single `error` status covering two different failures. The render
guard returned the email form for `idle | requesting` and fell through to the
code form for everything else, so a failed *request* landed on the code step. A
failed *verification* belongs there, which is why one status could not serve
both.

Split into `requestFailed` (stay on the email step, show the reason inline,
clear it when the address is edited) and `error` (a failed verification, stay on
the code step). Covered by `src/test/auth/otp-tab-denied.test.tsx`, which
asserts the refusal message and the *absence* of both "Code sent to" and the
code prompt.

### #51 — Frontend lint command is not runnable
**Priority**: Medium · **Status**: Runnable as of 1.5.0-beta.4; backlog open
**Bucket**: developer tooling

`packages/frontend` uses a flat `eslint.config.js`, but its `lint` script still
passed the legacy `--ext` flag, which ESLint rejects when flat configuration is
active. Removing that flag then failed because the configuration imports
`typescript-eslint` — the unified v7+ package — which was never declared; only
the split v6 `@typescript-eslint/{parser,eslint-plugin}` were.

**Fixed.** `typescript-eslint ^8.65.0` is declared (compatible with the
installed ESLint 8.57.1) and the script runs under flat config. This was not a
new dependency in substance — the config already required it.

The first successful run found **three `react-hooks/rules-of-hooks`
violations**, all real and all fixed: a `useMemo` after an early return in
`usage-summary.tsx`, and `useState`/`useEffect` called inside a column
definition's `cell` in the Document Translator's `columns.tsx` (extracted to a
`DocumentNameCell` component, which also removed a duplicate 768px mobile
breakpoint that `useIsMobile` already owns).

**Still open: the backlog.** 497 problems remain — `no-unused-vars` (190),
`react-refresh/only-export-components` (125), `no-explicit-any` (116),
`react-hooks/exhaustive-deps` (36), and a long tail. `--max-warnings 0` is
deliberately off the script until that is cleared: a gate nothing can pass is
not a gate. The `exhaustive-deps` warnings are the ones most likely to hide
real bugs and are the sensible next slice.

Consider a lint ratchet mirroring the type-check one
(`npm run typecheck:ratchet`, see `docs/TSC-DEBT.md`) so the count cannot grow
while the backlog is worked down.

### #50a — Administrator authority and the Admin page
**Priority**: High · **Status**: Implemented in 1.5.0-beta.4; route tightening
open for beta.5
**Bucket**: authorization

FEED's shared organization-wide data model does not imply that every signed-in
user should be able to change privileges or replace the database. beta.4 adds
Staff and Administrator roles, a unified user roster, a Domain/Allowlist sign-in
policy, a privileged-action audit log, an operator recovery CLI, and the Admin
page at `/admin`.

Two decisions departed from the original design and are recorded in
`docs/auth/admin-page-implementation-plan.md`:

- **Bootstrap on a populated instance.** "First verified user becomes
  Administrator" assumes an empty `User` table, which production is not. The
  migration promotes every pre-existing user and the roster is pruned manually.
  New users created afterwards default to Staff.
- **Authority is read per request, not from the JWT.** A seven-day token would
  have made revocation advisory.

**Still open for beta.5:** existing privileged routes — procurement rollback and
restore, AI configuration, data-shaping rules — are *not* yet behind
`requireAdmin`. Gating them in the same release as the migration risked removing
capability the pantry depends on before the roster was verified. Any
authenticated user can still reach them until that lands.

### #50b — Restore, clean slate, and the backup contract
**Priority**: High · **Status**: Backup shipped in 1.5.0-beta.6; **restore
shipped in 1.5.0-beta.7**; clean slate designed, not yet built
**Bucket**: Data Management / authorization

**Backup shipped.** Administrator-only, audited, self-describing artifact with
a mechanically enforced table contract. See the 1.5.0-beta.6 changelog.

**Restore shipped** in 1.5.0-beta.7: build-and-swap via `VACUUM INTO`, partial
units closed under foreign keys, in-memory maintenance mode, pre-restore
snapshot, exit-to-restart. Two things from the design remain open — the roster
in the artifact (needed only for restoring onto new hardware) and a streaming
parse for artifacts past ~256MB. Both are recorded in
`docs/data-management/beta-6-backup-restore-brief.md`.

**Clean slate is still designed-only.** Full record in
`docs/data-management/beta-6-backup-restore-brief.md`. The decisions that
matter:

- **Build and swap, not a live transaction.** A single interactive transaction
  cannot hold a full restore — the largest procurement import is 17,814 rows at
  ~18s against a 30s ceiling, and a restore is an order of magnitude larger.
  The scratch file sits on the same bind mount, so `rename(2)` supplies
  atomicity and the ceiling never applies. The app restarts itself by exiting;
  `restart: unless-stopped` does the rest.
- **Maintenance mode is in-memory and process-local**, never a database flag —
  the flag would live in the file being replaced, and a crashed restore must
  not strand the instance.
- **Replace, never merge.** The blocker is identity, not fragility:
  `FoodItem.id` and `Category.id` are autoincrement and referenced by id from
  translations and inventory events, so merging two id-spaces risks binding a
  translation to the wrong item — invisible on screen and untouched by physical
  reconciliation. Procurement is the one tractable exception, because its
  source references are natural keys; that is a named follow-up.
- **The roster is carried, with roles neutralised.** Excluding `User` does not
  preserve it under build-and-swap — it destroys it, arming the bootstrap and
  recreating the beta.4 privilege-escalation race. It is now included, every
  restored role lands as `STAFF`, and the restoring administrator is
  re-granted.
- **Clean slate is the same mechanism with a seed as its source**, offering
  "With examples" (default) or "Structure only", and preserving the roster by
  default. Design in `docs/data-management/clean-slate-and-seed.md`; the seed
  currently covers five models and demonstrates nothing of the Shopping List
  Builder.

**Two prerequisites must land first:**

1. **API keys are not editable in the UI.** `PUT /api/ai-config/:id` accepts
   `apiKey` and re-encrypts, but `EditAIModelDialog` renders no field —
   rotating a key today means deleting the configuration and recreating it,
   losing its model, costs, and limits. Restore ends with "re-enter your
   provider keys," which needs somewhere to enter one. Fix: render the field
   with a `••••••••••••` placeholder and send `apiKey` only when non-empty.
2. **`AIConfiguration` should be redacted, not excluded.** beta.6 dropped the
   whole table because it holds `encryptedApiKey`; `backup-and-restore.md` only
   ever asked for column-level exclusion. Redacting `encryptedApiKey` and
   `salt` preserves the administrator's model and cost configuration. Bumps
   `tableContractVersion` to 2, worth doing before anyone depends on v1.

**Also queued:** `sanitized-backup.ts` calls `schemaVersion` "the compatibility
key that matters." It is not — `tableContractVersion` is the gate and
`schemaVersion` is provenance. Gating on the migration name would refuse valid
artifacts, since most migrations do not touch exported tables.

### #61 — Fresh Food Alliance Pickup History is a hand-rolled table
**Priority**: Medium · **Status**: Open
**Bucket**: table standard

`components/analytics/donor-analytics.tsx` renders this card with a bare
`<Table>` rather than `EnhancedDataTable`, which the table standard
(`docs/layout/table-standard.md`) says is the one table component. It therefore
has no filter, no sort, no column visibility, and no pagination, and it does not
publish an `onViewStateChange` view.

That has a reporting consequence now that the card is exportable (beta.9): the
other two table cards preserve the filter, sort, visible columns, and page size
the user configured, and this one cannot, because there is no state to preserve.
Its report card exports every partner in payload order. The backend card
(`FRESH_ALLIANCE_PICKUP_HISTORY`) is already built on the shared
`tableCardData` helper, so when the screen moves onto `EnhancedDataTable` the
card gains view-state handling by passing the published view through — no
backend change needed.

Also not covered by `table-column-parity.test.ts`, which compares screen
`ColumnDef` arrays against report columns; there is no `ColumnDef` array here to
compare against.

### #49 — Document Translator upload UI bypasses current component standards
**Priority**: Medium · **Status**: Open
**Bucket**: Document Translator UX consistency

The established DOCX upload interaction remains a useful model, but its current
`FileUpload` implementation has legacy deviations that should not be copied:

- it calls native `alert()` when no file is selected instead of using the
  centralized message/error service;
- success, error, and neutral states use hard-coded `green-*`, `red-*`, and
  `gray-*` classes rather than FEED theme tokens and Shadcn Alert variants;
- the Document Translator error boundary also uses hard-coded red classes.

The procurement importer preserves the interaction shape while using Shadcn
components, theme tokens, definite-height `ScrollArea`, centralized messages,
and the shared authenticated `BaseApiService` multipart transport. A later
Document Translator cleanup should migrate the legacy component toward that
same standard without changing its staff workflow.

### #47 — One-day operating-hours exceptions
**Priority**: Low · **Status**: Deferred
**Bucket**: operational analytics reframe

Recurring Operating Hours now use effective-dated, append-only revisions, so a
schedule change does not reinterpret earlier reports. The intentionally narrow
remaining gap is one-day exceptions such as holidays, weather closures, or a
special service day. Do not model an exception by briefly changing the weekly
schedule; that would imply a recurring change. If real use demonstrates the
need, add a separate dated-override model with the same shared-data and audit
semantics. See `docs/settings/operating-hours.md`.

### #46 — Dormant Report/Export Infrastructure Audit
**Priority**: Medium · **Status**: Active watchpoint
**Bucket**: operational analytics reframe

The July 2026 inventory-logistics prototype proved the report selection,
template, CSV/ZIP/PDF, server-authored SVG, Chromium, and range/timezone
infrastructure, but its price, burn, projected-stockout, replenishment, and
quantity-coverage product claims were rejected after RITE review. The visible
prototype is being rolled back and validated operational analytics will be
reintroduced incrementally.

Generic infrastructure is intentionally retained while domain-specific routes
and cards are disabled. At each analytics milestone and release boundary,
audit every retained module: connect it to a validated consumer with focused
tests, keep it clearly isolated, or remove it. The accepted semantics and
delivery sequence are in `docs/reports/operational-analytics-design.md`.

The active operational workspace is **Analytics** at `/analytics`. The
**Reports** route at `/reports` is currently only a nonfunctional management
placeholder under Information. Do not mount the dormant template manager,
selection provider, generation dialogs, or export pipeline there until a
validated report-template contract is approved.

**Audit 2026-08-05 (1.5.0-beta.8) — the infrastructure still runs.** Mounted
`routes/reports.ts` on a throwaway branch at `/api/legacy-reports` and exercised
it against current dev data. Result: **nothing is broken.**

| Checked | Result |
|---|---|
| `tsc --noEmit` with the router mounted | 0 errors — no schema or service drift |
| `GET /cards` | 200, 31 cards registered |
| `POST /query` | 200 in 28ms, real data (168 items / 58 in stock) |
| `POST /cards/:id/csv` | 200, 11.4KB, correct headers and date-ranged filename |
| `POST /export` | 200 in 1.07s — valid 135KB ZIP: 2 CSVs, a 6-page PDF (`%PDF-1.4`, proper `startxref`/`%%EOF`), and a provenance manifest |
| Template CRUD | create 201 / update 200 / list / delete 204 |
| PDF HTML | 2 server-authored SVG charts with real geometry, 169 table rows, zero external references |

The PDF path is **not** dormant infrastructure: `services/pdf/chromium.ts` is
shared with the live Shopping List Builder, so puppeteer and the HTML-to-PDF
layer are exercised in production every time a builder PDF is generated. Only
the report-specific layer above it is cold.

**Removed 2026-08-06 (beta.8):** `frontend/src/components/dashboard/logistics-cards.tsx`
(110 lines, last touched `a60951b`, 2026-07-11). Imported by nothing — not the
path, not the symbol, not a test. It rendered Projected Stockouts, Quantity
Coverage, Median Days of Cover, and Known 30-Day Replenishment Cost as
`SelectableBlock`s on the Dashboard: four of the exact claims RITE rejected,
one reconnection away from being live again. Recoverable from `a60951b` if the
selection integration is ever wanted, but the cards it wrapped are not.

The probe was reverted; nothing is mounted. The first watchpoint below is the
live concern — `/query` still returns `projectedStockoutsWithinHorizon`,
`medianDaysOfCover`, and `daysOfCoverBands`, and the item CSV still carries
`daily_burn`, `weekly_burn`, `days_of_cover`, `projected_stockout_at`, and
`projected_cost_cents` columns. Those are the claims RITE rejected. They are
unreachable today only because the router is unmounted; mounting it as-is would
re-publish every one of them.

Watchpoints:

- no hidden endpoint may continue making abandoned analytical claims;
- raw atomic history must remain distinct from five-minute sampled analysis;
- templates/card ids must surface stale selections rather than silently map to
  new semantics;
- dormant export code must not silently drift as active consumers change.

### #5 — Translation Request Batching for RPM Efficiency
**Priority**: Medium · **Status**: Implementation landed Dec 2025;
Chinese DOCX sub-issue tracked separately as #17
**Bucket**: v1.x backlog (monitoring)

Type-aware batching reduced API calls by 95%+ for Food Item/Category
bulk translations. Validation confirmed Food Item + Category bulk
translations succeed; Custom Text and DOCX paths remain on the new
batched code path. Watch for partial failures (especially Chinese DOCX,
which is #17).

---

### #7 — Security & Authentication Hardening
**Priority**: High · **Status**: Planned
**Bucket**: v1.x backlog (recommended before public flip)

Auth system is functional but needs hardening before a wider audience
sees the source. Areas: OTP rate limiting, session-management review,
CSRF audit, cookie-security flags, JWT rotation strategy, email-attack
mitigation, audit logging for auth events.

---

### #8b — AI Translation System Performance Optimization
**Priority**: Medium · **Status**: Planned
**Bucket**: v2

Optimization targets: batch processing efficiency, caching strategy
refinement, API request pooling, DB query optimization for large
documents, memory usage during multi-document operations. Current
performance is acceptable for production usage.

---

### #9 — Unit Testing Update for Docker Environment
**Priority**: Medium · **Status**: Planned
**Bucket**: v2

Backend service / API endpoint / encryption / DB-operation /
auth-flow tests need restoration. Tests were archived in v0.13.x to
reduce technical debt during rapid development; see `/archived_tests/`
for the historical suite. The Docker test environment needs to be set
up so coverage is meaningful.

---

### #17 — DOCX Batch Translation Partial Failures (Chinese)
**Priority**: Medium · **Status**: Investigating
**Bucket**: v1.x backlog

Document translations to Chinese occasionally fail with partial batch
errors after retries (`Non-retryable error detected, stopping retry
attempts` → `All 3 translation attempts failed for batch` →
`Partial translation failure for Chinese: 15 segments failed`). Other
languages succeed. Position-based docx modification still runs with
missing segments.

Next: capture raw provider error response, decide whether smaller
chunk sizes or stricter JSON/tool output for batch responses fixes it.

---

### #19 — System Prompt Save Does Not Close Modal
**Priority**: Low (UX) · **Status**: Fix implemented, pending verification
**Bucket**: v1.x backlog (verify and close)

Root cause was `BaseAIConfigDialog` expecting a boolean from `onSave`;
`AddSystemPromptDialog` returned `void`. Fix standardized `onSave` to
return `Promise<boolean>`. Manual verification still pending.

---

### #22 — Shopping List Builder Phase 5 Layout Mode
**Priority**: Medium · **Status**: Core work landed (April–May 2026);
remaining scope is optional refinement
**Bucket**: v1.x backlog (incremental enhancements)

Core Phase 5 landed: Guided/Freeform toggle, 9pt grid system, snap-to-
grid for drag/drop/add/duplicate/insert, header/footer page anatomy,
explicit Header/Body/Footer regions, split-page body controls, Guided
collision placement, planner-backed Body sequencing, flowing section
tables that split across lanes/pages, RTL + multilingual + emoji-aware
Chromium PDF export.

Remaining scope (not blocking):
- Pagination UX refinement and continuous-table preview accuracy.
- Alignment controls (Left/Center/Right/Top/Middle/Bottom) and
  distribution controls in Guided mode.
- Additional split-page rules (lane resize, overflow controls,
  multi-page editing affordances).
- RITE-based UX refinement once the above are in place.

---

### #26 — Shopping List Builder Table Vertical Density
**Priority**: Medium · **Status**: 3pt re-base + tagged-header alignment
landed May 15–16 2026; monitoring for stacking edge cases
**Bucket**: v1.x backlog (watchpoint)

Phase 0 prototype validated; Phase 1 + the 3pt re-base + the
category-header icon-overhead fix + the adaptive-row tag-measurement
bump all landed. The user mental model is restored (one coordinate
system at 3pt with 9pt major grid). Watch for new multi-component
stacking regressions; the planner is height-agnostic but tight slack
budgets mean wrap-estimation misses are more expensive than before.

---

### #27a — Animated UI Primitive Theme Token Drift
**Priority**: Medium · **Status**: Partial fix landed (Checkbox, Switch);
ongoing watchpoint
**Bucket**: documented pattern (recurring footgun)

When adopting Animate UI / shadcn primitives, generated styling encodes
hard-coded neutral palette classes (`slate-*`, black/white states) that
ignore FEED theme tokens. Strip these and replace with `primary`,
`background`, `muted`, `ring`, etc. in the local wrapper before
shipping. Verify both light and dark mode plus focus/disabled states.

Guidance is captured in `AGENTS.md` ("Lessons From Recent Work") and
should be checked whenever a new animated primitive is added.

---

### #27b — Radix `DialogContent` Missing `DialogTitle` (A11y Warnings)
**Priority**: Medium (Accessibility) · **Status**: Open
**Bucket**: v1.x backlog (recommended pre-public-flip)

Several pages emit dev-time Radix warnings about missing `DialogTitle`.
~12 warnings on a single load of `/food-items`. Screen-reader users
opening these dialogs don't get an announceable title.

Fix: audit every `DialogContent` / `SheetContent` usage. Add a visible
`<DialogTitle>` or wrap a hidden title in Radix's `<VisuallyHidden>`:

```tsx
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
<DialogContent>
  <VisuallyHidden.Root>
    <DialogTitle>Edit Food Item</DialogTitle>
  </VisuallyHidden.Root>
  …
</DialogContent>
```

Grep for `DialogContent` / `SheetContent`, list dialogs missing a
title, add (visible or visually-hidden) titles, then reload affected
pages and confirm zero warnings.

---

### #29b — Animated-Icon `viewBox` Typo in Registries
**Priority**: Low (recurring footgun) · **Status**: Workaround documented
**Bucket**: documented pattern

Icons from `@lucide-animated/<name>` and `@animate-ui/icons-<name>`
consistently ship with `viewBox="0 24"` instead of `"0 0 24 24"`. The
SVG renders only a slice of the upper-left corner. Reinstalling
reintroduces the bug because the registry sources are themselves wrong.

Workaround: grep `viewBox="0 24"` immediately after every install and
patch in place. Documented in `docs/motion/ICON_ANIMATIONS.md` and
`AGENTS.md`.

Long-term fix: upstream issues / PRs against the registries.

---

### #30 — "Find Missing Translations" Modal Needs Scroll Area + Card Reordering
**Priority**: Medium (UX) · **Status**: Fix in progress (May 21, 2026)
**Bucket**: v1.x backlog
**Component**: `packages/frontend/src/components/translation-management/enhanced-find-missing-dialog.tsx`

Adding the new **"Generated (Shopping List)"** translation category increased
the modal's content height beyond what fits in the dialog. When a run
produces failed or stuck-in-pending translations, a results card is
appended at the **bottom** of the modal, pushing it out of view and
leaving it **partially cut off** with no way to scroll to it.

**Reproduced (May 21, 2026):** in the post-scan **Overview** tab, the
results/action card is rendered *after* the category-count grid, so with a
large result (observed: 847 missing) the action card and its buttons are
clipped at the bottom. The cut-off content is the **"Missing Translations
Found"** card — count line, "Missing translations were found", the "Select
which categories… / Choose how to handle…" copy, and the **Queue for
Translation / Retry Failed / Delete** action buttons. The Overview tab
already wraps its body in a Radix `ScrollArea`, but it does **not** scroll —
the same failure mode as resolved issue #29a (Radix `ScrollArea` does not
get a bounded height inside the dialog's `flex` + `max-h-*` chain, so the
viewport grows with content and `overflow-hidden` clips it without a
scrollbar).

Intended resolution:
1. **Reorder cards** — move the results/action card to the **top** of the
   Overview tab, above the category-count grid, so the actionable results
   are immediately visible.
2. **Make the body scrollable** — ensure clipped content can be reached.

Implementation note: prefer an `overflow-y-auto` container over Radix
`ScrollArea` with a `max-h-*` constraint — see resolved issue #29a, where
`ScrollArea` failed to scroll under a `max-h-*` cap in
`translate-and-generate-dialog.tsx`. The existing Radix `ScrollArea` in
this modal is exhibiting exactly that failure, so the fix replaces it with
an `overflow-y-auto` container.

---

### #31 — Shopping List Templates & Saved Components Are Per-User, Not Org-Shared
**Priority**: High · **Status**: Fixed (May 20, 2026) — pending deploy
**Bucket**: v1.x backlog
**Component**: `packages/backend/src/routes/shopping-list-builder.ts`,
`packages/backend/prisma/schema.prisma`
 (`ShoppingListBuilderTemplate`, `ShoppingListBuilderComponent`)

**Observed behavior**: Saved Shopping List templates (and Saved
Components) are sequestered by login. If `user1@williamtemple.org`
creates a template, only that account sees it; if
`user2@williamtemple.org` logs in, they see only their own templates and
none of user1's. Each account gets a private set of templates/components.

**Expected behavior**: FEED is designed around a single
whole-organization data environment. Changes made by one user should be
visible to all users. Inventory, templates, saved components,
translations, and translated documents should be identical regardless of
which account is logged in. This is a shared environment, not a
per-account experience.

**Root cause**: The `ShoppingListBuilderTemplate` and
`ShoppingListBuilderComponent` tables carry an `ownerId String` column
(indexed `@@index([ownerId])`), and every builder CRUD route scopes its
query by it. `getOwnerId(req)` returns `req.auth.userId` (the logged-in
user's id) and all reads/writes filter `where: { ownerId }`:
- List/save/update/delete templates — lines ~3648, 3661, 3697, 3739
- List/save/update/delete components — lines ~3530, 3544, 3582, 3623
- Same-name dedup helpers `findSavedTemplateByName` /
  `findSavedComponentByName` — lines ~1614, 1626

So each user's id partitions the data. By contrast, the shared inventory
and translation tables (`Category`, `FoodItem`, `CategoryTranslation`,
`FoodItemTranslation`, `Translation`) have **no** `ownerId` column — they
are already global, which is why inventory and translations are correctly
shared across logins. The builder tables are the only ones that diverged
from the org-shared model.

**Resolution** (Option 1 — drop `ownerId` entirely; chosen because the
deployment is <24h old with minimal staff content, so the merge risk is
negligible):
1. Dropped the `ownerId` column and its `@@index([ownerId])` from
   `ShoppingListBuilderTemplate` and `ShoppingListBuilderComponent` in
   `schema.prisma`.
2. Migration `20260520000000_drop_shopping_list_builder_owner` rebuilds
   both SQLite tables without `ownerId`, copying every existing row so
   prior per-user content survives as shared content. Applied
   automatically on container start (`prisma migrate deploy` in the
   Docker CMD).
3. All builder routes now read/write one shared set: removed
   `where: { ownerId }` from every find/list, dropped `ownerId` from
   creates, and dropped the `ownerId` argument from the
   `findSavedTemplateByName` / `findSavedComponentByName` dedup helpers
   (a same-name collision across former users is now a real collision,
   resolved by the existing newest-match update logic).
4. `getOwnerId` (which both returned the per-user id and gated login) was
   replaced by `requireAuth`, which only enforces that the caller is
   logged in. The translation auditor already read all templates with no
   owner filter, so it was unaffected.
5. Backend tests updated: delete now asserts `where: { id }` only, plus a
   new test that `GET /templates` lists without an owner filter. Full
   shopping-list suite (119 tests) passes; backend `tsc` build clean.

**Remaining**: deploy to production (Pi) so the migration runs there.

---

### #32 — Standardize Scroll Containers on shadcn `ScrollArea`
**Priority**: Medium (UX consistency) · **Status**: Resolved (May 21, 2026) — pending deploy
**Bucket**: v1.x backlog (incremental cleanup)

Project direction (see AGENTS.md "UI Standards"): scrollable **content
regions** should use the shadcn `ScrollArea` consistently, not a mix of
`ScrollArea` and native `overflow-y-auto` / `overflow-auto` divs. Mixed
scroll mechanisms produce inconsistent scrollbars and behavior.

**Key insight from #30 (May 21, 2026):** the earlier belief (resolved
issue #29a) that "Radix `ScrollArea` doesn't scroll, use `overflow-y-auto`"
was incomplete. `ScrollArea` fails under a **`max-h-*`** cap (its viewport
height is unbounded), but works correctly when given a **definite height**
(e.g. `h-[calc(85vh-13rem)]`). So the standard fix is a definite-height
`ScrollArea`, not abandoning it for native overflow. #29a's
`overflow-y-auto` workaround is therefore a convert-candidate below.

**Refined finding (the "fixed-height impact" evaluation):** the original
"convert candidates" split cleanly into two groups. **Fixed-height** scroll
regions are genuine `ScrollArea` conversions. **Grow-to-fit** (`max-h-*`)
content previews and **nested** scroll boxes are *not* — a fixed-height
`ScrollArea` would render mostly-empty boxes for small/variable content,
and a nested `ScrollArea` would trap scrolling. Those are legitimate
documented native-overflow exceptions (AGENTS.md "UI Standards" was
refined to codify the three exception cases). Blanket-converting would have
worsened UX.

**Resolution (May 21, 2026):**

Converted to definite-height `ScrollArea`:
- `ai-configuration/shared/BaseAIConfigDialog.tsx` and
  `ai-configuration/EditSystemPromptDialog.tsx` — `h-[480px]` dialog bodies.
- `dashboard/translation-metrics.tsx` — `h-[250px]` response-times chart
  (verified scrollable: 250px viewport, ~280px content).
- (Already done under #30: the three result-tab `ScrollArea`s in
  `enhanced-find-missing-dialog.tsx`.)

Kept as documented native-overflow exceptions (inline-justified):
- `components/ui/view-text-dialog.tsx` — single, usually-short string;
  grow-to-fit. (Stale `view-text-dialog.tsx.backup` deleted.)
- `enhanced-find-missing-dialog.tsx` Details-tab sample box — nested +
  short variable lists.
- `document-translator/dialogs/reconciliation-dialog.tsx` — 5 preview boxes
  listing variable, often-tiny issue/action lists; grow-to-fit.
- `shopping-lists/dialogs/translate-and-generate-dialog.tsx` — per-language
  progress list (commonly 1–3 rows); grow-to-fit. (Supersedes #29a's
  workaround framing: the box correctly stays native here.)
- Shadcn primitives (`ui/table.tsx`, `ui/command.tsx`, `ui/sidebar.tsx`,
  `ui/enhanced-data-table`) and the `FoodItemList` `DropdownMenuContent`
  popper — native overflow is inherent/standard.

**Remaining**: ships with the next image/deploy (frontend change).

---

### #33 — Builder Row-Height Under-Calculation at Higher Font Sizes
**Priority**: Medium · **Status**: Fixed (May 21, 2026) — pending deploy
**Bucket**: v1.1.0
**Component**: typography engine
(`packages/frontend/src/components/shopping-lists/builder/typography.ts`
⇄ `packages/backend/src/lib/builder-typography.ts`)

At the upper end of `BUILDER_FONT_SIZES` (14/16/18pt), wrapped text can
overflow its computed row: `estimateWrappedLineCount` /
`estimateWrappedSegmentLineCount` under-estimate the wrapped line count
(the average-character-advance approximation drifts as glyphs widen and
fixed paddings consume proportionally more of the row), so the row band is
too short and content spills. Related watchpoint: #26.

Approach: make the wrap estimate progressively more conservative as font
size grows (monotonic safety factor keyed off `fontSize` so 10–12pt is
unchanged), and feed the *actual* item-cell content width into the
estimate (status icons / Want checkbox / hidden Want column all change it).
Keep the two typography engines byte-equivalent; re-validate with the
typography unit tests, the inventory-section height tests in
`shopping-list-builder.test.ts`, and a rendered-PDF smoke at 14/16/18pt
(including RTL and long item names). Full design notes:
`docs/shopping-lists/v1.1.0-feature-plan.md` (section C).

**Resolution (May 21, 2026):** the actual root cause was narrower than the
hypothesis above. The live wrap engine (`estimateWrappedSegmentLineCount`,
duplicated in the backend route and `ShoppingListBuilder.tsx`) already
reserved a **flat 6pt** of wrap slack to absorb real Chromium rendering
~3-5% wider than the per-glyph estimator. That flat value only covered
cells up to ~120pt, so mid-width cells under-counted lines and clipped —
even at 12pt (e.g. "Hot Dog & Hamburger Buns"). Fix: reserve
`max(6pt, 5% of cell width)` so the wrap threshold tracks Chrome's
percentage over-width at every font size. Applied identically to both
engines; 119 shopping-list tests still pass (10pt inventory-height
assertions unchanged); confirmed against a full real-inventory pass in the
running builder. Follow-on: `SPLIT_PAGE_MAX_BUILDER_FONT_SIZE` raised 12→14
so 14pt section tables are now offered in Split-page layout (16-18pt remain
Full-page-only).

---

### #34 — v1.1.0 Shopping List Builder + Export Settings (Complete)
**Priority**: Medium · **Status**: Released — shipped to production as 1.1.0 on 2026-05-22 (migration applied, /api/health + in-app tag both report 1.1.0)
**Bucket**: v1.1.0

**Progress (May 21–22, 2026)** — landed and pushed to `main`, each its own
revertable commit, every one validated (backend `tsc` + 119 tests +
rendered-PDF parity check):
- ✅ **A5** — show/hide Want column (`293defa`)
- ✅ **A1 + A3** — show/hide column dividers + table/cell borders (`13a746e`)
- ✅ **A6** — per-row checkbox in the Want column (`293e018`)
- ✅ **B2** — English in the Translate & Download modal (`53147eb`)
- ✅ **A2** — Limited/Clearance status icons on rows (`c4f2d65`)
- ✅ **A4** — Legend base component (`d497125`)
- ✅ **B1** — Export Settings modal (shared filename-structure settings).
  New `ExportSettings` Prisma model + migration
  (`20260522000000_add_export_settings`), org-wide shared singleton (id=1,
  no ownerId per #31). Filenames assembled client-side in
  `builder/export-filename.ts` (unit-tested); GET/PUT
  `/export-settings` routes; modal on the Shopping Lists page with live
  preview; wired into single, bulk, and Translate & Generate downloads.
- ✅ **B3** — per-section-table "Show Global Limit" option. When enabled,
  rows with no item-level limit ("No Limit") display the current org-wide
  Global Limit value in the Limit column instead of a blank cell. New
  optional `showGlobalLimit` flag on `SectionTableBuilderComponent` (default
  false, read as `=== true`), mirrored in both packages. Value resolved live
  at render time (canvas: `PreviewLanguageContext.globalLimit`, fetched via
  `GlobalLimitService`; PDF: backend reads `GlobalLimit` only when a table
  opts in) — never baked into saved rows. Shared `resolveRowLimitText` mirror
  in both renderers; Properties toggle nested under "Show limit column".

All features are designed in `docs/shopping-lists/v1.1.0-feature-plan.md`
(B3 added per follow-up request after the initial plan).

A1 scope note: divider/border toggles now cover **section tables** AND
**form-field groups** — the form-field follow-up landed, mapping
`showColumnDividers` to the vertical label|value divider and `showBorders`
to the outer box + horizontal row separators (canvas + PDF, with the
`[dir="rtl"]` override gated). A1 is fully complete.

Planned v1.1.0 feature set, fully designed in
`docs/shopping-lists/v1.1.0-feature-plan.md`:
- Builder: show/hide column dividers; status tags (Limited/Clearance) as
  icons; show/hide table & cell borders; new **Legend** base component;
  show/hide the **Want** column; per-row **checkbox** in the Want column.
- Shopping Lists page: **Export Settings** modal (filename structure —
  date/time, template name, language, default preview/translated base
  names; org-wide shared per #31); add **English** to the Translate &
  Download modal (identity path, skips translation).

Cross-cutting constraints captured in the plan: canvas/PDF parity, the
frontend/backend typography + icon mirrors, 9pt grid, back-compat template
JSON fields, shadcn-first UI, and org-wide shared persistence.

---

### #35 — AI Model Type-Chooser Icon Animates Only on Direct Icon Hover
**Priority**: Low (UX polish) · **Status**: Fixed (May 21, 2026) — pending deploy
**Bucket**: v1.x
**Component**: `packages/frontend/src/components/ai-configuration/index.tsx`

In the "Add AI Configuration" type-chooser (step 1 of the multi-step
modal), the **AI Model** card's icon animated only when hovering the icon
itself, while the **Prompt** card's icon animated on hover anywhere over
the card (the desired behavior).

**Root cause**: the two cards use different animated-icon systems (see
AGENTS.md "Lessons From Recent Work"). Prompt uses `MessageSquareQuoteIcon`
from `@/components/animate-ui/icons` (native, context-driven) wrapped in
`<AnimateIcon asChild animateOnHover>` on the Card, so card-hover drives it.
AI Model used `CpuIcon` from `@/components/ui/cpu` (imperative-ref,
self-animating) with no ref — the native `AnimateIcon` context cannot drive
an imperative-ref icon, so it fell back to its own direct-icon-hover
trigger. There is no native animate-ui `Cpu` icon (only `bot`,
`message-square-*`).

**Fix**: attach a `CpuIconHandle` ref to the `CpuIcon` (which flips it into
controlled mode, disabling its own direct-hover trigger) and call
`startAnimation()` / `stopAnimation()` from the Card's `onMouseEnter` /
`onMouseLeave`. Hovering anywhere on the card now animates the icon,
matching the Prompt card — using the imperative icon's own documented ref
API, with no new icon installed (avoiding the registry viewBox/path
hazards documented in AGENTS.md).

---

### #36 — Prompt Category "Document Text Translation" Icon Animates Only on Direct Hover
**Priority**: Low (UX polish) · **Status**: Fixed (May 21, 2026) — pending deploy
**Bucket**: v1.x
**Component**: `packages/frontend/src/components/ai-configuration/steps/PromptCategoryStep.tsx`

Second instance of the #35 pattern. In the "Prompt Category" step (Add
System Prompt flow), all four category cards are wrapped in
`<AnimateIcon asChild animateOnHover>`, but three icons (`LanguagesIcon`,
`MessageSquareMoreIcon`, `BlocksIcon`) are native animate-ui (context-
driven → animate on whole-card hover) while **Document Text Translation**
used `FileTextIcon` from `@/components/ui/file-text` (imperative-ref). The
native `AnimateIcon` context can't drive an imperative-ref icon, so it only
animated on direct icon hover. No native animate-ui `file-text` icon exists
(only `file-down`).

**Fix**: same controlled-ref approach as #35 — attach a `FileTextIconHandle`
ref to the `FileTextIcon` (controlled mode) and drive `startAnimation()` /
`stopAnimation()` from that card's `onMouseEnter` / `onMouseLeave`; the
other three remain driven by the `AnimateIcon` wrapper.

**Recurring-pattern note**: imperative-ref icons from `@/components/ui/*`
placed inside an `<AnimateIcon>` wrapper will silently fall back to
direct-hover. When adding an icon to an `AnimateIcon`-wrapped element,
prefer a native `@/components/animate-ui/icons/*` icon; if only an
imperative-ref icon exists, wire it via its ref handle as in #35/#36. Worth
a sweep for other occurrences.

---

### #37 — Arrow / Home / End Keys Don't Work in Text Fields (Cursor Can't Move)
**Priority**: Medium (UX) · **Status**: Fixed (May 21, 2026) — pending deploy
**Bucket**: v1.x
**Component**: `packages/frontend/src/hooks/use-navigation-keyboard.ts`

**Observed**: in every text field across the app, the keyboard arrow keys
(and Home/End) could not move the caret — users had to reposition the
cursor by mouse-click. (Originally recalled as a side effect of "Title
Case" validation; that recollection was incorrect — there is no title-case
input transform. The real cause was the sidebar keyboard-navigation hook.)

**Root cause**: `useNavigationKeyboard` adds a **document-level** `keydown`
listener that `preventDefault()`s `ArrowUp/Down/Left/Right`, `Home`, and
`End` to drive sidebar item navigation. It's mounted by `app-sidebar.tsx`
and `navigation-section.tsx` (always-present layout), so it ran on every
page and swallowed those keys **including while focus was in an
input/textarea** — blocking caret movement everywhere.

**Fix**: bail out of the handler (no `preventDefault`, no navigation) when
`event.target` is an editable element (`INPUT`, `TEXTAREA`, `SELECT`, or
`contentEditable`). Arrow/Home/End now work normally in fields; sidebar
keyboard navigation still works when focus is outside a field. Verified in
the running app: from inside an input the keys are no longer
`defaultPrevented`; from `document.body` they still are.

---

### #38 — Title Case Enforced Per-Keystroke Reset the Caret While Typing
**Priority**: Medium (UX) · **Status**: Fixed (May 21, 2026) — pending deploy
**Bucket**: v1.x
**Component**: `packages/frontend/src/lib/formatting/text.ts` and the
food-item / category name forms

**Observed**: after arrow-keying back to edit mid-string in a name field
(food item, category), typing pushed the caret back to the **end** of the
string — making in-place edits impossible. (This is the "Title Case
compromise" originally recalled — and it was real, distinct from the
arrow-key blocker #37.)

**Root cause**: `createFormattedChangeHandler` ran `formatText` (the
Title-Case enforcer) on **every keystroke** and wrote the formatted value
back to the controlled input. When the formatted value differed from the
typed value (capitalizing a letter, collapsing spaces), React re-set the
input's `value` and the browser moved the caret to the end — the classic
controlled-input live-reformat anti-pattern.

**Fix**: stop reformatting on change — the change handler now stores the
raw typed value (caret preserved), and `formatText` is applied **once at
submit** in each form (`FoodItemForm` create, `useEditForm` edit,
`CategoryForm`). Users type freely; Title Case is enforced when they save.
Native `maxLength={36}` on the inputs still caps length caret-safely. Only
the name fields used live formatting; other fields were unaffected.
Verified in-app: typing "hot dog & buns" stays raw while editing and saves
as "Hot Dog & Buns".

---

### #39 — Builder Section Tables Ignore Food-Item Limits and the Global Limit
**Priority**: High · **Status**: Fixed (May 26, 2026) — pending deploy
**Bucket**: v1.x
**Component**: `packages/backend/src/routes/shopping-list-builder.ts`,
`packages/frontend/src/components/shopping-lists/builder/ShoppingListBuilder.tsx`,
`packages/frontend/src/components/shopping-lists/builder/types.ts`

Two related bugs in how Inventory Section tables surface request-limit
values. Both stem from confusing two **independent** food-item fields:

- `limit` (Int; `100` = the `NO_LIMIT_SENTINEL` "No Limit") — the cap on how
  much a client may request. Set in the Food Item form's **Basic** tab.
- `isLimited` (Bool) — a **low-stock** status flag that only drives the
  optional Limited status icon. Set in the **Status** tab. An item can be
  low-stock yet uncapped, or capped yet well-stocked.

**Bug 1 — food-item limits not shown.** `buildInventorySectionComponent`
derived the row limit as `item.isLimited && item.limit !== 100 ? item.limit
: null`, gating the displayed cap on the unrelated low-stock flag. So an item
with `limit = 5` but `isLimited = false` showed **"5"** in Food Item
Management ([data-table/columns.tsx](packages/frontend/src/components/food-item-management/data-table/columns.tsx)
never gates on `isLimited`) but a **blank** Limit cell in the builder. It
only appeared after editing the cap in the Content tab — because the
write-back route (`PUT /inventory-items/:id/limit`) force-set
`isLimited = true` as a side effect, which also silently flipped the
low-stock badge.

**Bug 2 — Global Limit ignored.** The Global-Limit fallback for "No Limit"
rows was wired through canvas and PDF via `resolveRowLimitText`, but gated on
a per-table `showGlobalLimit` flag that **defaulted off** (`=== true`). So by
default the org-wide cap never constrained "No Limit" items.

**Resolution:**
1. Row limit now reads `item.limit !== NO_LIMIT_SENTINEL ? item.limit : null`
   — independent of `isLimited`, matching Food Item Management. `isLimited` /
   `isClearance` are still passed through for the A2 status icons.
2. The write-back route writes only the cap (`{ limit }` on a value,
   `{ limit: NO_LIMIT_SENTINEL }` on clear) and no longer touches `isLimited`,
   so builder edits are bidirectional with Food Item Management without
   side effects.
3. `showGlobalLimit` now defaults **ON**, read as `!== false` in all four
   call sites (canvas render, Properties checkbox, PDF render, and the
   backend `needsGlobalLimit` query). An explicit `false` opts a table out.
4. Tests: added decoupled-limit and default-on / opt-out cases to
   `shopping-list-builder.test.ts`; updated the write-back assertions; added
   the `globalLimit` Prisma mock to both shopping-list test files. Full
   suite (121 tests) passes.

**Remaining**: ships with the next image/deploy. Existing saved templates
begin applying the Global Limit to their "No Limit" rows (the intended fix).

---

### #40 — Builder Canvas Wraps Long Names in Safari at Non-100% Browser Zoom
**Priority**: Low (cosmetic, preview-only, Safari-only) · **Status**: Known limitation — not fixing (May 26, 2026)
**Bucket**: v1.x watchpoint
**Component**: `packages/frontend/src/components/shopping-lists/builder/ShoppingListBuilder.tsx`

**Observed**: In the preview canvas, some long section-table item names
(e.g. "Great Northern Beans (Dried)", "Hot Dog & Hamburger Buns",
"Chickpeas/Garbanzo Beans", "Fruit Flavored Greek Yogurt") wrap to a second
line that overflows into the row below, because the row stays at single-line
height. The **exported PDF renders the same template correctly**, so the
deliverable is unaffected — only the on-screen preview misleads.

**Reproduction is browser- and zoom-specific** (user-confirmed): the overlap
appears **only in Safari on macOS** and **only when Safari's page zoom is set
to something other than 100%** (e.g. 75%). At 100% Safari zoom it renders
correctly, and Chrome is unaffected at any zoom.

**Root cause**: a Safari sub-pixel rounding quirk. The builder canvas scales
the whole page via CSS `transform: scale(...)` (`ShoppingListBuilder.tsx`
~line 5060) and section-table columns are fixed-pixel widths. When Safari's
own page zoom is applied on top of that transform, Safari rounds the scaled
sub-pixel cell widths differently than at 100%, shaving a fraction of a pixel
off the item cell's usable width — just enough to tip a name that *exactly*
fits onto a second line. The row height comes from the Noto-Sans-calibrated
typography engine (which assumes the unrounded width), so it stays single-line
and the wrapped line overflows. Chrome's rounding doesn't hit this, and the
PDF is rendered by server-side Chromium with no browser zoom, so neither is
affected. (An earlier font-mismatch hypothesis was investigated and
**disproven** — the canvas paper already pins the Noto Sans stack via
`.shopping-list-print-page` in `index.css`, matching the PDF; live inspection
of a real cell confirmed it computes Noto Sans.)

**Decision — not fixing**: any mitigation would require shaving sub-pixel
slack into the item-cell width or the row-height math, which is the delicately
calibrated typography engine that canvas/PDF parity depends on (see #26, #33 —
"change one constant and you may break the schedule"). That risk is not worth
trading for a cosmetic glitch confined to one browser at a non-default zoom,
especially when the PDF deliverable is always correct. Browser page zoom is
also not reliably detectable from JS, so we cannot compensate precisely.
**Workaround for users**: view the builder canvas in Safari at 100% page zoom,
or use Chrome. Revisit only if it surfaces in Safari at 100% or in another
browser.

---

### #41 — Public Inventory Feed Omits Translations That Exist in the App
**Priority**: Medium · **Status**: Fixed (May 27, 2026) — pending deploy
**Bucket**: v1.x
**Component**: `packages/backend/src/routes/public-inventory.ts`

**Observed**: The public feed at `/api/public/inventory.json` omitted translated
names for some categories/items (e.g. "Canned Goods") even though those
translations exist — they show as **Completed / Category** in Translation
Management and render correctly in the Shopping List Builder.

**Root cause**: FEED stores category/item name translations in **two** places:
1. The generic `Translation` table (`type` `Category` / `FoodItem`), keyed by
   English `originalText` + language. This is the de-facto source of truth that
   Translation Management reads/writes.
2. The denormalized `CategoryTranslation` / `FoodItemTranslation` tables, keyed
   by entity id + language, written only by the translation-trigger service.

The public feed read **only** the denormalized tables (via the Prisma
`translations` relation include) with **no fallback**. Those tables have gaps
(see #42), so any translation living only in the generic table was absent from
the feed. The Shopping List Builder already worked around the same gap with a
generic-table fallback in `lookupInventoryBuilderTranslations`; the feed never
replicated it, so it was the one consumer that surfaced the drift directly.

**Resolution**: Mirror the builder's fallback in the feed. After loading the
denormalized translations, fill any missing (entity, enabled-language) pair from
the generic `Translation` table by English name + `type` + `status='completed'`,
**denormalized winning** on conflict. Name matching is unambiguous
(`Category.nameSearch` / `FoodItem.nameSearch` are `@unique`, and `Translation`
is unique per `originalText`+`language`+`type`); only `completed` rows are read,
so failed-row error strings (stored in `translatedText`) never reach the public
feed. Added a route test for gap-fill, denormalized-wins, the null-`translatedText`
guard, and the completed-only query. Focused test (2/2) + backend `tsc` clean.

**Remaining**: ships with the next image/deploy. This is a read-side backstop,
not a cure for the underlying drift — see #42.

---

### #42 — Translation Storage Drift: Generic `Translation` vs Denormalized Tables
**Priority**: Medium (architectural tech debt) · **Status**: Open — deferred
(documented May 27, 2026)
**Bucket**: v2 (architecture)
**Component**: `packages/backend/src/services/translation-trigger.ts`,
`packages/backend/src/routes/categories.ts`,
`packages/backend/src/routes/translations.ts`,
`packages/backend/src/services/translation-auditor.ts`,
`packages/backend/src/db.ts`

This is the root cause behind #41 and behind the builder's existing fallback. It
is filed as deliberate, deferred tech debt — **not** something to fix under
hotfix pressure, because it touches the sensitive translation pipeline (#5, #17)
and runs against archived backend tests (#9).

**The drift**: Category/food-item name translations live in two stores that fall
out of sync:
- **Generic `Translation` table** — the de-facto source of truth. Written by
  `categories.ts` (seeds `pending` rows), `translations.ts` (manual add / Find
  Missing / retry completions), and the trigger (writes it first). This is what
  Translation Management shows.
- **Denormalized `CategoryTranslation` / `FoodItemTranslation`** — the id-keyed
  fast store for inventory rendering. Written in exactly **one** place:
  `translation-trigger.ts` `applyBatchResults`.

**Why the denormalized tables develop gaps**: the trigger only writes them for a
translation it **freshly** performs, and two things routinely prevent that:
1. `prepareBatchTranslations` **skips** any generic row that already exists and
   is not `failed` (`status !== 'failed'` → `continue`). So once a generic row
   is `pending` or `completed`, the trigger never (re)translates it and never
   writes the denormalized row.
2. `categories.ts` create/update **pre-seeds** generic `Translation` rows as
   `pending` for every enabled language. The `db.ts` Prisma middleware also
   queues a trigger translation on the same write, but by the time it runs the
   `pending` rows already exist → the skip-guard fires → the denormalized
   `CategoryTranslation` row is never written. Those pending rows are later
   completed by the Find Missing / auditor path in `translations.ts`, which
   writes **only** the generic table.
3. Manual add / edit / retry in `translations.ts` likewise never touch the
   denormalized tables (confirmed: they are referenced only in
   `translation-trigger.ts` and `shopping-list-builder.ts`).

Net effect: an entity can have complete translations in the generic table and
none/partial in the denormalized tables. Whether a given category/item has
denormalized rows is a historical accident of *how* its translations were
completed — which is why only some categories were missing from the feed.

**Current mitigations are read-side backstops, not cures**: the Shopping List
Builder (`lookupInventoryBuilderTranslations`) and now the public feed (#41)
both read denormalized-first then fall back to the generic table. The logic is
**duplicated** in two places; a third consumer reading the denormalized tables
directly would hit the same bug unless it copies the fallback again.

**Long-term options (pick deliberately)**:
- **Option C — fix the write path.** Stop `categories.ts` pre-seeding `pending`
  rows that poison the skip-guard, and/or have `translations.ts` + the auditor
  write the denormalized rows whenever a generic row completes. Largest blast
  radius; does **not** fix existing data on its own.
- **Option D — one-time backfill.** Migration/script to populate the
  denormalized tables from completed generic rows by English name. Fixes
  existing data; without C, drift returns for new content.
- **Option (consolidate) — remove the second store.** Reconsider whether the
  denormalized tables should exist at all, or whether inventory rendering should
  resolve translations from the generic table directly. Eliminates the drift
  class entirely; biggest change.

**Recommended when picked up**: C + D together (prevent future drift *and* repair
existing data), then delete the now-redundant read-side fallbacks in the builder
and feed (or consolidate them into one shared resolver). Until then, the
#41/builder fallbacks keep consumers correct.

---

### #43 — Section Table "Checkbox in Want Column" — UX Lift to Table Level + Persistence Bug
**Priority**: Medium (UX + correctness) · **Status**: Fixed (May 28, 2026) — pending deploy
**Bucket**: v1.x
**Component**: `packages/frontend/src/components/shopping-lists/builder/types.ts`,
`packages/frontend/src/components/shopping-lists/builder/ShoppingListBuilder.tsx`,
`packages/backend/src/routes/shopping-list-builder.ts`

**Observed**:
1. **UX**: The "Checkbox in Want column" toggle in the section-table Properties
   panel was per-row. The realistic use case is "apply to the whole table" — per-row
   toggling was tedious without offering value, and no user wanted a table where
   only some rows had checkboxes and others had blank fill-in space.
2. **Bug**: After enabling the per-row checkbox on every row of an inventory-backed
   section table and saving the template, the checkboxes reverted immediately. The
   same revert happened on PDF download.

**Root cause of the bug**: `refreshInventoryBackedTemplate`
([packages/backend/src/routes/shopping-list-builder.ts](packages/backend/src/routes/shopping-list-builder.ts),
the `refreshInventoryBackedTemplate` export) rebuilds inventory-backed section
tables from the live DB:

```ts
return {
  ...component,         // preserves component-level fields
  rows: refreshed.rows, // OVERWRITES rows — fresh rows have no wantControl
  ...
};
```

The refresh is invoked in three places: `saveCurrentTemplate` in the builder
(before each save), `POST /preview-pdf` (before PDF render), and
`POST /translate-missing-strings`. So the per-row `wantControl` was wiped on
**every** save, every PDF, every translate-missing run — it never reliably
persisted on inventory-backed tables. The realistic "did any user ever ship
this?" answer is "almost no one, because saving immediately wiped it."

**Resolution — elevate to the component level**: `wantControl?: 'blank' |
'checkbox'` is now a property of `SectionTableBuilderComponent` itself, alongside
`showWant`/`showLimit`/`showColumnDividers`/`showBorders`/`showStatusIcons`/
`showGlobalLimit`. It rides through the refresh path's `...component` spread for
free, so the persistence regression cannot recur.

**Back-compat shim** (read-side, transparent): a mirrored helper
`resolveSectionTableWantControl(component)` returns the component-level value if
set; otherwise falls back to legacy per-row `wantControl` ('checkbox' if ANY row
carries it) so older saved templates render correctly without any migration.
Legacy per-row values are left in place (the few that exist are harmless once
ignored by the renderer; no quiet cleanup pass).

**Changes**:
- `SectionTableBuilderComponent.wantControl?: 'blank' | 'checkbox'` added to both
  the frontend type and the mirrored backend interface. `SectionTableRow.wantControl`
  marked LEGACY in both files; documented as fallback-only.
- `resolveSectionTableWantControl` helper added to both
  `packages/frontend/src/components/shopping-lists/builder/ShoppingListBuilder.tsx`
  and `packages/backend/src/routes/shopping-list-builder.ts`, alongside
  `resolveRowLimitText`. Backend helper is `export`ed for unit testing.
- Canvas `PreviewSectionTable` and the backend `sectionTableComponentHtml`
  renderer compute `wantCheckbox` once outside the row loop and use it for every
  row, replacing the previous `row.wantControl === 'checkbox'` per-row check.
- Properties panel: the per-row "Checkbox in Want column" toggle in the Rows
  tab is removed. A new table-level "Checkbox in Want column" toggle is nested
  under "Show want column" in the Layout/Display section (same pattern as
  "Show Global Limit" nests under "Show limit column"). The toggle is hidden
  when `showWant === false`, because there is no Want column to check.

**Tests**: five new cases in `shopping-list-builder.test.ts` cover the
resolver precedence (explicit checkbox / explicit blank overrides legacy /
unset + legacy / unset + no legacy) and a `POST /refresh-inventory` test proving
that table-level `wantControl` survives the row rebuild that wiped per-row
values. 126/126 shopping-list tests pass (was 121); backend `tsc` clean;
frontend `tsc && vite build` clean.

**Remaining**: ships with the next image/deploy.

---

### #44 — Toast Messages Too Sticky: Time-Only Dismissal + Length-Aware Duration
**Priority**: Medium (UX) · **Status**: Fixed (May 28, 2026) — pending deploy
**Bucket**: v1.x
**Component**: `packages/frontend/src/components/ui/use-toast.ts`,
`packages/frontend/src/components/ui/toaster.tsx`,
`packages/frontend/src/services/message/index.ts`,
`packages/frontend/src/services/message/types.ts`

**Observed**:
1. Toasts stayed on screen too long. Durations were fixed per message *type*
   (success 6s, error 8s, info 6s, warning 7s) and ignored how much text there
   was to read — a 16-character toast got the same 6s as a 78-character one.
2. **Bug**: tapping/clicking a toast made it persist **indefinitely**.

**Root cause of the bug**: Radix Toast's built-in auto-dismiss timer pauses on
hover, focus, and pointer-down, and resumes on pointer-up/leave. On touch there
is no `pointerleave`, so a tap paused the timer with nothing to resume it — the
toast stuck open forever. On desktop, resting the cursor over a toast paused it
the same way. This is documented Radix behavior, not a Provider option. (The
old `types.ts` comment even noted "Radix Toast automatically pauses on hover,
focus, and window blur" — that pause was the defect.)

**Resolution — make visibility purely time-based**:
1. **Disable Radix's timer**: `toaster.tsx` now renders every `<Toast>` with
   `duration={Infinity}`, so Radix never starts (and therefore never pauses)
   its own timer. The stored `duration` prop is stripped before the spread so
   it can't override this.
2. **Single wall-clock timer**: `use-toast.ts` starts a plain `setTimeout` per
   toast that dismisses it after its resolved duration. A `setTimeout` cannot
   be paused by pointer events, so a toast lives exactly its duration
   regardless of clicks, taps, or hover. The timer is cleared on manual
   dismissal (X button, action click, or programmatic `dismiss()`). Also
   lowered the dismissed→removed cleanup delay from the Shadcn-stock
   1,000,000ms (~16 min memory leak) to 1,000ms (covers the exit animation).
3. **Length-aware duration** (`computeMessageDuration` in `types.ts`):
   `chars × 50ms × 3 reads`, clamped to **[3s, 12s]** — enough time to read the
   message through about three times. Replaces the per-type fixed table.
   `messageService` uses it as the default; an explicit `duration` still wins,
   and `persist: true` (→ `duration: null`) still means manual-dismiss-only
   (used by `retryableError` / `systemError`).
4. **Action clicks close the toast** (per the spec: only *time*, or an explicit
   close affordance, ends a toast). `messageService` wraps the action button's
   `onClick` to run the user's handler and then dismiss. The X close button
   already closed via Radix `onOpenChange`; swipe-to-dismiss is unaffected.

**Dead-code cleanup**: removed two verified-unused Shadcn-stock forks that
duplicated the toast store and would have bypassed this fix if imported:
`packages/frontend/src/hooks/use-toast.ts` and
`packages/frontend/src/contexts/ToastContext.tsx`. The live path is
`components/ui/use-toast.ts` → `messageService` / `Toaster` (mounted in
`App.tsx`).

**Tests**: 13 new frontend tests — `computeMessageDuration` boundaries
(`message-duration.test.ts`), time-only dismissal incl. persist + manual-cancel
(`toast-dismissal.test.ts`), and messageService action-close + duration wiring
(`message-service-action.test.ts`). Full frontend suite 137/137 passes;
`tsc && vite build` clean.

**Manual smoke (recommended post-deploy)**: on a touch device, tap a toast and
confirm it still auto-dismisses on time; on desktop, hover a toast and confirm
the same. Verify a long error message stays ~12s and a short success ~3s, and
that clicking a Retry/Reload action button closes the toast immediately.

**Remaining**: ships with the next image/deploy.

---

### #45 — Cloudflare Bot Challenge Blocks the "Public" Inventory Feed for Datacenter / VPN Clients
**Priority**: Medium (blocks the documented LOTTO interconnect) · **Status**: Open — needs Cloudflare config change (diagnosed June 13, 2026)
**Bucket**: v1.x (infra / Cloudflare)
**Component**: Cloudflare zone config for `feed.williamtemple.app` (WAF / Bot
Fight Mode), affecting `packages/backend/src/routes/public-inventory.ts` and the
contract in `docs/PUBLIC_INVENTORY.md`

**Observed**: LOTTO consumes `GET /api/public/inventory.json` to translate
pantry inventory names into languages FEED's own feed doesn't carry. LOTTO's
**server-side** fetch (Vercel serverless function) to the feed fails **every
time**, and LOTTO's **browser-side** fetch fails **when the admin is on a VPN**.
The failing response body is Cloudflare's interstitial:

```html
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>
<meta http-equiv="X-UA-Compatible" ... HTTP 403
```

The same feed returns `200` from an ordinary residential/secured browser
connection (FEED's own `/inventory` page and LOTTO's public inventory page both
render fine on normal connections).

**Root cause**: `feed.williamtemple.app` sits behind Cloudflare, and Cloudflare's
managed challenge / Bot Fight Mode serves a **403 "Just a moment..." JS-challenge
page** to clients it scores as automated — specifically those from **datacenter
or VPN egress IPs** and **non-browser HTTP clients** (Node/undici, which has no
browser fingerprint and cannot solve the JS challenge). This is independent of
FEED's application code: the request never reaches the Express handler, so the
intentional `Access-Control-Allow-Origin: *` / no-auth / `no-store` headers
(`server.ts` mounts `/api/public` before auth) are irrelevant — Cloudflare
answers first.

This **directly contradicts** the documented design of the feed. `docs/PUBLIC_INVENTORY.md`
states the path "must remain public and unauthenticated so browser-based clients
outside FEED can fetch it." Cloudflare's bot challenge on `/api/public/*` breaks
that contract for exactly the two cases that matter to the interconnect:
1. **LOTTO's server (Vercel) — always.** Serverless functions always egress from
   datacenter IPs, so the server-to-server path is permanently 403'd. This is the
   real reason LOTTO never sees inventory server-side (previously misattributed to
   IP allowlists, missing User-Agent, and deploy lag — all disproven).
2. **LOTTO's admin browser behind a VPN.** A flagged VPN egress IP gets the same
   403; and because the challenge page carries **no CORS headers**, the
   cross-origin `fetch()` is blocked before the status is even readable, so the
   bridge falls back to the (also-403'd) server fetch.

**Evidence / how it was isolated**:
- Server-side fetch from Vercel returns `HTTP 403` with the Cloudflare
  "Just a moment..." body (LOTTO captures status + body snippet).
- Admin browser **with VPN active** → Find Missing reports zero inventory (403).
- Admin browser **with VPN disabled** (residential/secured wifi) → Find Missing
  finds the inventory strings and queues them successfully. No code change.
- Repeated cross-origin browser fetches from a clean connection: `200` every time.

**Operational impact / current workaround**: On William Temple House's admin
device (an iPad mini on secured wifi with **no VPN**), the LOTTO Find Missing
flow works today, because the residential/secured connection passes Cloudflare.
The **server-side** path stays blocked regardless — LOTTO's design now sources
inventory names from the admin browser and bridges them to its server precisely
so it doesn't depend on the (Cloudflare-blocked) server-to-server fetch. So the
interconnect is functional in practice, but it is **fragile**: any admin on a
VPN, or any future attempt to fetch the feed from a backend/cron, will be 403'd.

**Resolution (Cloudflare-side — pick one)**:
- **Option A — exempt the public path (matches the documented intent).** In the
  `feed.williamtemple.app` zone, add a WAF Custom Rule / Configuration Rule:
  *When `URI Path starts with /api/public/` → Skip → Super Bot Fight Mode / Bot
  Fight Mode / Browser Integrity Check / Managed Challenge.* Restores `200` for
  the server, the browser (incl. VPN), and FEED's own `/inventory` page in one
  change. Simplest and aligns Cloudflare with `PUBLIC_INVENTORY.md`.
- **Option B — shared-secret bypass (keeps the path bot-protected otherwise).**
  Cloudflare rule: skip the challenge only when a header (e.g.
  `X-LOTTO-Feed-Key: <secret>`) is present; LOTTO's server sends it. Keeps the
  feed challenged for the open internet while letting the LOTTO interconnect
  through deterministically. Requires a shared secret in both apps' env.

**Remaining**: Cloudflare dashboard change on the FEED zone; no FEED application
code change required for Option A. Option B additionally needs LOTTO to send the
agreed header on its server fetch. Recommend Option A unless the feed must stay
bot-challenged for the broader internet.

---

### #6 — Shopping List Feature Incomplete (OBSOLETE)
**Status**: Superseded by Shopping List Builder; closed in v1.0.0 release prep

The wizard-based shopping list flow this referred to was removed in
v1.0.0 release prep (commit `da7f060d` — 39 files, ~9.6K lines). The
Shopping List Builder is now the canonical implementation. Leaving this
entry as a tombstone for future readers who find references to the old
flow in git history or older docs.

---

## Recently Resolved

### August 2026
- **Appearance SVG logos were flattened to low-resolution PNGs and the dark
  logo was never rendered** (Aug 28 2026): the upload route normalized every
  source through Sharp without defining a density contract, so a wide SVG was
  stored near its intrinsic 288×87 CSS size and blurred when enlarged on a
  high-density Dashboard. The Dashboard also hard-coded `lightSrc`, leaving
  `darkSrc` with no consumer. Safe SVGs now remain vector after structural
  sanitization, PNGs retain their pixel dimensions with low-resolution
  guidance, and the shared logo renderer selects light/dark artwork across all
  three theme states. Real multipart route tests cover vector preservation,
  hostile-node removal, raster dimensions, quality warnings, icon derivatives,
  and SVG delivery headers. Data Management → Data now finds and removes
  unreferenced brand assets older than a one-hour wizard-safety window.
- **Service lens was not exportable, and a Service-only report crashed**
  (Aug 15 2026): the five Service cards shipped on screen with no entry in the
  report registry, so selecting one produced an archive that silently omitted
  it. Registering them exposed a second fault: the printed header read
  `analytics.range` and `dataAsOf` off `payloads.procurement ?? operations`,
  which is `undefined` for a Service-only selection, so the PDF path threw
  before rendering. Provenance is now normalized across all three lenses —
  Service reports its `coverage`, and `dataAsOf` is the last date a record
  actually reaches rather than the end of the range asked for. The cards also
  inherit the screen's guards: absence stays distinct from zero so a line
  begins where its record does, and the unfinished month is dropped and named
  exactly as the page drops and names it. The registry now holds 28. The
  coverage guard that should have caught this did not, because
  `service-analytics.tsx` was never added to its `LENS_FILES`; it is now, so a
  future lens file omitted from the list fails the converse check.
- **Tracking review mislabeled a configuration callback as unreadable row 501**
  (Aug 11 2026): the first 500-row staging batch contained approved
  location-qualified shopping-visit source wording before the effective FEED
  display alias changed from `Visits`. Historical source wording was incorrectly
  required to equal editable UI wording, and the parser catch converted the
  callback failure into a CSV-row error. Approved labels now map through the
  stable metric key and remain provenance; semantic contract and effective
  coverage are still enforced. Only actual CSV parser failures receive row
  messaging, and the complete 1,114-row artifact validates against the local
  configured metric revisions.
- **Tracking service-week dates crossed worksheet boundaries** (Aug 11 2026):
  the migration exporter initially interpreted “Week of the Month” as the nth
  weekday. November 2023 week 5 was therefore projected to Tuesday, December 5
  and collided with December's real December 5 observation. Tracking rows are
  Tuesday–Thursday service blocks: the first block intersects the beginning of
  the month and later rows advance seven days. The exporter now applies that
  calendar rule, reports both workbook cells if a true duplicate remains, and
  has a regression for the November 28 case. The corrected full workbook
  exports and parses as 1,114 observations across 318 dates with no duplicate
  identity or contract warning.
- **Analytics report coverage** (Aug 7 2026): eight cards rendered on the
  Analytics lenses but were not in the report registry, so a user could see
  them and not export them — Recurring Availability, Operational Pressure,
  Grocery Partner Mix, Recorded Donated Value, Fresh Food Alliance Pickup
  History, Fresh Food Alliance Donations Over Time, and the two legacy
  donation cards. All eight registered; the registry now holds 23.
  `src/test/analytics-card-coverage.test.ts` fails if a card renders on a lens
  without a `SelectableBlock`, or if a registered card loses its home on the
  page. Nothing enforced this before, which is why the gap went unnoticed.
- **Printed chart units** (Aug 7 2026): `hBarSvg` hard-coded a `lb` suffix, so
  "Where Paid Procurement Dollars Went" printed `43,245 lb` for $43,245 of
  spend and Availability Summary printed `58 lb` for a count of items. The unit
  is the caller's business now. Found by rendering a PDF, not by a test.
- **Printed chart labels ran under their bars** (Aug 7 2026): the label column
  is a fixed width and long product names were drawn without truncation.
  Labels are now measured against real Helvetica metrics and cut with an
  ellipsis; the CSV beside the PDF still carries every name in full.
- **Available Assortment Over Time rendered at half width** (Aug 7 2026): its
  `md:col-span-2` sat on the inner `Card` while `SelectableBlock` was the grid
  item, so the span applied to a non-child. The wrapping two-column grid was
  redundant — both children were full width — and was removed. Same class of
  defect as the earlier 56px card gap.
- **Recurring Availability stranded a KPI beside dead space** (Aug 7 2026):
  `max-w-4xl` capped the divider and chart at roughly half the card.
- **Tables did not animate in selection mode** (Aug 7 2026): `variant="table"`
  suppressed the wiggle, which read as "this block is not selectable". Every
  block wiggles now, with tilt scaled inversely to block width so a wide table
  and a narrow card displace about the same distance. The `variant` prop is
  gone.

### July 2026
- **#48** (Jul 13 2026): Replaced the catalog-wide availability
  percentage with separate service-hour assortment and recurring-transition
  lenses. Initial and migration states do not inflate recurrence.

### v1.0.0 release prep (May 18–19, 2026)
- Created `release/v1.0.0` branch off `main`
- Removed wizard-era shopping list subgraph (39 files / ~9,650 lines)
- Obvious-orphan icon files removed (10 files / ~1,500 lines)
- Documentation archived to `docs/archive/` (32 files moved)
- TSC debt diagnosed and triaged in `docs/TSC-DEBT.md` (deferred)
- V1-RELEASE-PLAN.md captures the four-phase plan (Phase 0 + Phase 1
  complete; Phase 2 public-readiness audit and Phase 3 release pending)

### Pre-v1.0.0 resolutions (most-recent first)
- **#29a** (May 18 2026): Radix `ScrollArea` does not scroll with
  `max-h-*` constraint — replaced with `overflow-y-auto` div; guidance
  in `dialogs/translate-and-generate-dialog.tsx`
- **#28** (May 17 2026): `AnimateIcon` `animate` prop leaves
  `localAnimate` stuck — first hover miss; fix is the
  `onOpenChange`-driven state pattern documented in
  `docs/motion/ICON_ANIMATIONS.md`
- **#25**: Shopping List Builder generated translation settings gaps
- **#24**: Shopping List Builder translated inventory table row
  measurement
- **#23**: Shopping List Builder PDF export — category icon parity
- **#21** (April 26 2026): Shopping List Builder Phase 5 readiness
  (inventory sync, saved-components CRUD, drag affordances, scroll
  bounds, template discovery)
- **#20** (April 29 2026): Shared row action resets table pagination
  state — added `preservePageOnDataChange` to `EnhancedDataTable` /
  `DataList`
- **#18** (Dec 30 2025): OpenAI GPT-5 thinking-level mapping; per-config
  `reasoning_effort` overrides
- **#16** (Dec 29 2025): Anthropic max-tokens exceed model limit;
  clamping added
- **#15** (Dec 29 2025): Daily token limit was using request counts;
  now derived from TPM × 1440
- **#14** (Dec 29 2025): OpenAI token-usage metrics mismatch
- **#13** (Dec 29 2025): Google Gemini token-usage tracking used
  estimates; now uses provider-reported tokens
- **#12** (Dec 29 2025): Dashboard usage-summary configuration filter
- **#11** (Dec 29 2025): Gemini 3 thinking-level configuration
- **#10** (Dec 28 2025): AI cost control — per-configuration limits
- **#8a** (Dec 31 2025): Updated default AI models (Claude 4.5,
  Gemini 2.5, GPT-5 family)
- **#4** (Dec 26 2025): Dashboard state handling complete across all
  cards (Cost Forecast, Cost Comparison, Translation Performance &
  Success, Response Times, Multi-Service AI Usage)
- **#3**: Cost forecast zero-pricing display
- **#2**: Alert system toast errors
- **#1**: Environment variable cleanup — AI model configuration

Full root-cause writeups for each item are preserved in git history.

---

## Completed Milestones

✅ Docker multi-architecture deployment infrastructure
✅ Database-backed encryption setup (browser-driven initialization)
✅ Cloudflare Tunnel integration
✅ Raspberry Pi 5 production deployment
✅ OTP authentication system
✅ AI-powered document translation (core feature)
✅ Multi-language support (59 languages, including RTL Arabic/Farsi and
   Hebrew, plus CJK)
✅ Shopping List Builder (Phase 5 core)
✅ Animated icon system across action menus, palettes, section headers,
   and dialog hero icons
✅ Dashboard UX with comprehensive state handling
✅ Wizard-era prototype code removed; builder is canonical

---

## Development Workflow Notes

**Current environment**: Docker-based development and deployment.
**Testing**: Manual on localhost (Mac) before Pi deployment.
**Deployment**: Multi-arch Docker images pushed to Docker Hub
(`et2geiger/feed-*`); production runs on Raspberry Pi 5 with Cloudflare
Tunnel → `feed.williamtemple.app`.

**Key files**:
- `/docker-compose.yml` — production stack
- `/docker-compose.local.yml` — development overrides
- `/Dockerfile` — multi-stage build
- `/docs/deployment/DOCKER_DEPLOYMENT.md` — complete deployment guide

---

## Contributing

When addressing these issues:
1. Branch from `main` (or `release/v1.0.0` during release prep)
2. Follow established patterns documented in `AGENTS.md`
3. Test locally with Docker compose override
4. Update `CHANGELOG.md`
5. Update this `ISSUES.md` to reflect the new status
6. Submit a PR with a description of intent and verification steps

---

## Support

For deployment issues, see:
- `/docs/deployment/DOCKER_DEPLOYMENT.md`
- `/docs/deployment/troubleshooting.md`
- `/docs/deployment/raspberry-pi-cloudflare-tunnel.md`

For release-prep status: `docs/V1-RELEASE-PLAN.md`.
For tsc error triage: `docs/TSC-DEBT.md`.
