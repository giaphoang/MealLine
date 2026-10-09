# Phase 5 validation and release handoff

The Fable classification and spending-accounting findings are fixed in
**1.8.0-beta.3**, promoted to stable **1.8.0** at the user's request. Local
feature validation is complete. The user explicitly excluded live production
AI tests and will replace API keys and configure production models. Cloudflare
AI feature checks are **omitted, not passed**. Release verification is limited
to image identity, health, migrations and version.
Pi Connect access was restored on September 14. All six ARM64 stage images
were published and the source commits pushed. The error-handling stage is
deployed and verified. The user then explicitly directed the rollout to
fast-forward to v1.8, superseding the separate Node 24 deployment step in D23.
The stable 1.8.0 image pair was rebuilt from `b53e2e5` with matching package
versions and finalized user-facing release notes. Both images are published
as `1.8.0` and `latest`. GitHub release
[`v1.8.0`](https://github.com/MattGeiger/williamtemple-feed/releases/tag/v1.8.0)
is published as **Latest**, with `draft: false` and `prerelease: false`.
The annotated tag points to `b53e2e5c587a1df3a5bf6a20dd4f4f37f860d507`.

| Stable image | Published digest |
| --- | --- |
| `et2geiger/feed-backend:1.8.0` | `sha256:315ea2146e873cd08e33f1a9c798033d0754e98c00cf974a50e2c6e1b76eee39` |
| `et2geiger/feed-frontend:1.8.0` | `sha256:63a0462386dc0baa5befb4109709e77b0f8a041a98404df9e740a9cff2414797` |

The stable backend image reports Node `24.21.0` and package version `1.8.0`.
The frontend Nginx configuration validates. Its actual JavaScript bundle
contains the 1.8.0 release notes and no `## Unreleased` heading. These checks
ran in local containers with networking disabled; they made no provider calls.

## Production rollout, September 14

- Confirmed deployment directory: `/home/feedadmin/apps/williamtemple-feed`.
  Initial running images and durable `.env` version were `1.7.5-rc.1`.
- Created `backups/2026-09-14-pre-errors/` on the Pi, with SQLite `.backup`,
  an `integrity_check` result of `ok`, a verified storage tar archive, and
  copies of `.env` and Compose configuration. Raw operator backups remain
  on the Pi.
- Fast-forwarded the deployment checkout to `4eee81c`, set `.env` to
  `1.7.5-errors`, inspected resolved images, and pulled/started only backend
  and frontend. The existing Cloudflare container was preserved.
- Verified both running error-stage image identities against the built
  images, healthy services, Node `20.20.2`, 36 migrations, no pending
  migrations, and WAL mode. The authenticated public app loaded inventory
  and documents and displayed version `1.7.5`.
- The separate `1.7.5-node24` deployment is **skipped at the user's explicit
  request**. Its images remain published; v1.8 includes Node 24.
- Created and verified `backups/2026-09-14-pre-v18/` on the Pi using the
  same SQLite and storage procedure, then set `.env`, pulled and started the
  `1.8.0-beta.3` pair. Startup reported a healthy backend and recreated
  frontend; the public health endpoint confirmed `1.8.0-beta.3`.
- The user then requested removing the beta designation. With the Connect
  terminal restored, created and verified `backups/2026-09-14-pre-stable/`
  using SQLite `.backup`, `integrity_check`, a checked storage archive, and
  copies of `.env` and Compose configuration. Fast-forwarded the Pi checkout
  to `d99f370`, saved `VERSION=1.8.0` in `.env`, and confirmed both resolved
  image tags before pulling and starting only backend and frontend.
- Stable **1.8.0 is deployed and verified**. Both containers report healthy;
  their running image identities match the stable digests above. The backend
  reports Node `24.21.0`, 36 migrations, no pending migrations, and WAL mode.
  Local and public `/health` responses both report `status: ok` and
  `version: 1.8.0`. The Cloudflare container remains unchanged.
- The public frontend serves `index-hjmeAa2Z.js`, matching the stable build;
  its bundle includes 1.8.0 and contains no `## Unreleased` heading. GitHub's
  latest-release endpoint confirms `v1.8.0` is neither draft nor prerelease.
  Verification made no production AI calls or changes to keys or model settings.

## What changed

- `forcedToolUse` is an Anthropic catalogue capability. Fable uses `auto`,
  with explicit instructions to call the classification tool. Known compatible
  models retain forced tools; unknown Claude models conservatively use `auto`.
  This follows [Anthropic's Fable documentation](https://platform.claude.com/docs/en/models/fable-5-1/overview)
  and [tool-choice contract](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools).
- Both classification paths validate the named tool, result count, and finite
  scores between zero and one. Unusable billed replies write failed usage.
  Parallel classification waits for every in-flight batch and records each
  separately, preserving a successful sibling's cost when another fails.
- Google batch translation and both classification methods record unusable
  billed replies, including thinking tokens. A refusal before a reply does not
  manufacture a usage row.
- The smoke script measures its own persisted rows using an async-local
  collection. It includes failed replies and excludes unrelated requests.
  Failed persistence stops the run. Unknown models, provider mismatches,
  missing/nonpositive saved prices, and invalid ceilings cannot spend. Each
  call reserves three projected attempts at the higher of saved and catalogue
  prices, converting legacy per-thousand units. The input estimate is still
  not a hard dollar guarantee.

No schema, dependencies, authentication, provider-selection policy, or
production settings changed. Application daily/monthly cost enforcement still
filters `success: true`; deciding whether those limits include billed failures
remains the separate decision already recorded in ISSUES.md #84. Historical
unrecorded failures were not reconstructed from guessed counts.

## Evidence

Tests ran in the package directories on Node 24. The backend suite passed
**108 files, 1,299 tests, 2 skipped**; the frontend passed **87 files, 578 tests**.
Backend build and typecheck passed. A separate typecheck included the smoke
script and new tests, which the runtime build excludes. Frontend build passed;
the actual frontend typecheck ratchet reports **144 existing errors**, below
the saved baseline of 148. It is not a claim of a clean frontend typecheck.

An initial run's three fresh-database suites failed in Prisma's schema engine
before tests ran. Reproducing migration creation with engine diagnostics
succeeded; the subsequent complete run passed with `RUST_LOG=info`. No
application or migration change was made to mask that environment failure.

| Live check | Result | Recorded cost |
| --- | --- | ---: |
| Fable `classifySegments`, two synthetic segments | Passed, 5.5 seconds | $0.012610 |
| Fable `classifySegmentsBatch`, same two segments | Passed, 3.7 seconds | $0.012820 |
| Gemini 3.5 Flash Lite DOCX classification, Spanish translation, Arabic builder translation | Passed; real upload, extraction, classification, asynchronous translation, download, preflight, fill, and PDF routes | $0.00122240 |
| Opus 5 long DOCX classification | 121 decisions: 117 uncached segments across three batches and four cache hits; HTTP 200 in 8.6 seconds | $0.104505 |
| Opus 5 bulk retry | All 40 synthetic rows completed; HTTP 200 in 8.0 seconds | $0.108925 |
| Gemini 3.8 Flash regular live sweep | All seven checks passed, including highest reasoning | $0.00264375 |
| Gemini 3.8 Flash, deliberately truncated batch translation and both classification methods | All three failed clearly and recorded billed tokens, including empty output | $0.000504 |
| **Total for this continuation** | Within the previously approved $5 validation budget | **$0.24323015** |

The three deliberate failures reported respectively 131/13, 178/12, and
178/12 input/output tokens. They produced three `success = false` usage rows.
Provider-shaped overload and rate-limit fixtures also traversed the real
translation route and error handler: HTTP 503, `AI_TRANSLATION_BUSY`, retryable
copy, and no administrator alert. No attempt was made to overload a live
provider merely to obtain a transient busy response.

The Spanish DOCX was rendered with LibreOffice and visually inspected. The
Arabic PDF was rendered with Poppler; letters joined correctly, table columns
mirrored, physical dividers remained on the correct edges, and English tags
were legible. The saved synthetic template was applied in the local browser,
Arabic preview selected, and Download PDF completed. Synthetic fixtures were
kept separate from existing inventory and documents. Local configurations 5
and 14 were restored to their original activation, token, thinking, and update
values after the checks. Usage rows remain as real spending history.
The 40 synthetic bulk rows were removed after verification; the two synthetic
source documents, Spanish output and named builder template remain locally
available for review.

## Built release candidate

Both **linux/arm64** images were built locally from commit `aeab799`, with
same-origin frontend API routing. They are loaded into Docker on this Mac;
they were subsequently pushed to the registry during the rollout above.

| Local image | Image ID |
| --- | --- |
| `et2geiger/feed-backend:1.8.0-beta.3` | `sha256:efa3e912417caa935cf0731e8407130cc7602f78cc6e8ffea36958cf036ede17` |
| `et2geiger/feed-frontend:1.8.0-beta.3` | `sha256:06c840b6e7c088f863bfd85b15c2d221e3e630b6c152c191ac2114cb30fcb65a` |

The isolated backend container reports Node **24.21.0**, application version
**1.8.0-beta.3**, and Chromium **152.0.7977.82**. All 36 migrations applied to a
fresh disposable database with external networking disabled. The frontend's
Nginx configuration validates and its compiled bundle contains the new version.
The real builder PDF route also passed inside the isolated ARM64 backend,
using a fresh database and synthetic Arabic cache rows. Its 38,809-byte PDF
was rendered and visually inspected with joined Arabic glyphs and mirrored
columns. These are Pi-architecture builds, not an AMD64 validation claim.

The two preceding stages are also built and loaded locally from clean Git
archives. Their backend runtimes report application version `1.7.5`, with
Node **20.20.2** for the error-only stage and **24.21.0** for the runtime-only
stage. Both frontend Nginx configurations validate. All stages are now published.

| Stage and source | Image | Image ID |
| --- | --- | --- |
| Errors, `f9ca7f4` | `et2geiger/feed-backend:1.7.5-errors` | `sha256:848ca1573363d6cac5a1c7105c584ccb9e454ebf0382d9c3c5ba2bc3d128f3ca` |
| Errors, `f9ca7f4` | `et2geiger/feed-frontend:1.7.5-errors` | `sha256:c6d3af4340121d00d9422e6127f0932b686e1527c1f84c45d3f84ed756b5ff9b` |
| Node 24, `7c7b350` | `et2geiger/feed-backend:1.7.5-node24` | `sha256:71b46390e2a2e27ccd3e9710ffe485fa5a8b813246175900af2224f639815889` |
| Node 24, `7c7b350` | `et2geiger/feed-frontend:1.7.5-node24` | `sha256:c947bfc0986ed6077e96bd584966e800b369483613a416a07e2e0f651d7e00a6` |

Fetching the older public Node 20 base initially timed out while Docker's
credential helper waited. An isolated temporary Docker client configuration
pulled the official public image anonymously; saved credentials and the
normal Docker configuration were unchanged. Both builds then completed.

Local reproducibility material is under `/tmp/feed-phase5/`: input/output
documents, PDF renders, request summaries, configuration restoration values,
and the scripts used. `/tmp/feed-fable-canary.json` records the Fable results.
These are local QA artifacts, not production data or distributable examples.
The database backup there contains local operational data and is deliberately
outside Git. Temporary files may be removed by the OS.

## Release scope and operator follow-up

The September 14 user instructions supersede the original three-stage plan:
finish the stable 1.8.0 deployment and mark GitHub tag `v1.8.0` as the latest
release. Both package versions and the Pi's durable `.env` version must match.
Keep the existing verified Pi backups and prior images available for rollback.

The user owns fresh API keys and production model setup. No production AI
test calls ran and no synthetic documents were uploaded. Do not run the
original Cloudflare DOCX, Arabic export, long-classification or bulk-retry
checks without renewed authorization. Their local results above do not prove
Pi/Cloudflare timings. D20/D28 remains the agreed response if a future
authorized feature check encounters a 524.
