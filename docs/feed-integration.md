# FEED integration map

Upstream source: FEED 1.8.1, commit `90525d05cebb58893945d884c43d64cbe468d958`. Both application packages and the upstream documentation are retained. Direct dependency versions are pinned from the upstream package lockfiles; in particular Prisma remains 6.12.0 to preserve the source's dependency on the `$use` middleware API.

## Retained feature families

| FEED feature family | Staff route / implementation |
| --- | --- |
| Inventory categories, flags, limits, diet labels, bulk actions | `/feed/categories`, `/feed/food-items` |
| Append-only inventory/category history | Existing mutation services and inventory-event models |
| Global and per-item/category list limits | Existing settings, inventory forms, and list renderer |
| Multilingual inventory and 59-language reference set | `/feed/languages`, `/feed/translations` |
| Translation caches and bulk/retry operations | Existing translation and AI services |
| Canvas list builder, guided/grid workflows, templates/components, undo, split pages | `/feed/shopping-lists`, `/feed/shopping-lists/builder` |
| Chromium PDFs, reference renderer, RTL/CJK/font support | Existing shopping-list and shared PDF services |
| DOCX translation, classification, formatting, generated downloads | `/feed/document-translator` |
| Anthropic/OpenAI/Google configuration, prompts, rate/cost/token controls | `/feed/ai-configuration` |
| Dashboard, token metrics, costs, usage and alerts/SSE | `/feed/`, existing dashboard/alert components |
| Operations, Procurement, Service and Clients analytics | `/feed/analytics` |
| Report cards, PDF/CSV exports and saved report specifications | `/feed/reports` |
| Service log, daily observations, capacity and quality workflows | `/feed/service-log` |
| Link2Feed/SIMC/WTH tracking and procurement import review/jobs/rules | `/feed/data-management` |
| LOTTO connection/synchronization and public inventory publishing controls | Existing Service and Data settings; `/feed/api/public` |
| Database summary, sanitized backup, partial restore and clean slate | `/feed/data-management`, administrator APIs |
| OTP/magic-link sign-in, staff access policy, admin roster/audit/recovery | `/feed/login`, `/feed/admin` |
| Appearance wizard, custom branding, operating hours, theme and saved text | `/feed/settings` |
| Help, user guides, About and upstream attribution | `/feed/help`, existing About surface |

The original source's unfinished/dormant prototypes remain unfinished; no additional capability is claimed merely because its schema exists. Provider-backed actions need real account configuration and have not been exercised against paid services.

## MealLine integration boundaries

- `packages/core` is the single original matching implementation, used by the backend and browser basket review.
- FEED `FoodItem` owns both systems' food identity, dietary flags, availability, and category. Additive `quantity`, `unit`, `requiresStove`, and `requiresFridge` fields preserve MealLine's exact stock and kitchen logic.
- `NourishIntake` owns the original household request, structured/unstructured contact/address/availability metadata, status, and transcript.
- `NourishBasket` owns quantity-specific fulfilment drafts. It does not replace FEED builder templates, which have different semantics.
- `NourishVolunteer` preserves the original assignment roster and legacy hash without using it as a new staff-authentication credential.
- `NourishDelivery` retains assignment, scheduling, notes, and lifecycle links.
- All four models are explicitly included in backup contract 13, with volunteer hashes redacted. Restore supports prior FEED contracts 1–12 without inventing missing MealLine records.
- Partial restore validates pending basket JSON food identities before swapping the file, including retained baskets during inventory-only recovery. It refuses conflicting IDs instead of binding a household allocation to a different food. MealLine does not add a spurious SQL-foreign-key restore dependency.
- Household requests are not fabricated into formal Service import encounters; FEED's existing service-counting and import-provenance rules remain unchanged. MealLine has its own integrated dashboard metrics.
- No per-user dataset partition was added. Authorized staff continue to work on the organization-wide shared dataset.

## Safe migration

The source PostgreSQL tables are selected in a read-only transaction. Import writes are atomic on the new SQLite store; source IDs and foreign-key relationships are retained. Ambiguous conflicts fail rather than merging unrelated records or overwriting existing inventory. Initial inventory/category history is recorded as a migration baseline, not invented historical daily observations.

The one-time import marker is external to the database so a deliberate FEED clean-slate reset cannot accidentally re-import old PostgreSQL data on the next setup. Changing database paths or recovering a lost new store requires an explicit operator recovery plan.

## Verification checkpoint

Completed:

- Inspected/pinned the upstream feature implementation and dependency lockfiles.
- Shared business-logic package compiles; six matcher tests pass.
- Complete dependency installation and fresh Prisma 6.12 client generation.
- Setup applies all 37 migrations, imports PostgreSQL read-only, and seeds reference data. All six original inventory records match every retained field and timestamp; row counts across all five source tables match. Repeat setup is non-destructive.
- Backend fully type-checks; production backend/frontend builds succeed. No backend `--noCheck` bypass remains. The production frontend still has a large-bundle warning.
- Compared frontend diagnostics with unmodified upstream at the exact pinned commit, using the same compiler and dependencies: both have 381 diagnostics. The stored upstream baseline is 148; its ratchet is still failing, not inflated to hide debt.
- Six shared matcher tests and five browser-selection tests pass.
- Isolated authenticated APIs verify real OTP session creation, unauthorized requests (including a fake PDF bypass header), token reuse/revocation, voice ingestion, shared inventory quantities, canonical retry IDs, approval/packing order, once-only stock deductions, volunteer assignment, delivery completion, and native FEED reads.
- Backup contract 13 classifies all models and redacts volunteer hashes. The actual scratch rebuild/atomic swap round trip preserves stock, transcripts, fulfilment links, and the initiating administrator, checks foreign-key integrity, and signals restart exit code 75. Tests inject the exit callback; they do not reset the live store.
- 129 relevant upstream backup, partial-restore, fresh-instance restore, encryption-preservation, and authorization/provider-access regression tests, including new MealLine restore-identity tests, pass on temporary databases. Domain-policy tests explicitly configure their upstream test-only domain; no organization domain is implicitly allowed in the live application.
- Authenticated headless-shell navigation across 19 workspaces has no browser exceptions or API 500 responses. Manual intake creation, basket review/PDF link, volunteer tab, and mobile intake layout pass.
- Opt-in localhost developer sign-in skips email/OTP while keeping normal authentication active. 41 boundary/JWT regressions and six sign-in UI tests pass. Disposable API/browser checks cover real login/admin access, logout, cross-site/proxy/Host refusal, revocation, disabled-mode/production token rejection, and a neutral persisted development identity. Production launcher configuration forcibly disables the shortcut.
- Real PDFs generated for household packing, FEED builder English/Arabic/Japanese, and analytics report PDF/CSV. Rendered artifacts were visually inspected, including native RTL/CJK text.
- The lighter retained browser resolves automatically; obsolete caches are pruned. Runtime directory permissions are restricted to the current user.
- Original application source/configuration and PostgreSQL rollback source are retained.

Remaining configuration and verification:

- User-selected staff administrator email/domain and locally configured email/provider accounts. No real email or paid AI requests were sent.
- Repair the existing upstream frontend typecheck debt without weakening its ratchet.
- Full upstream suite and exhaustive browser CRUD/template/theme, procurement/Service import, DOCX/provider-backed, and external LOTTO workflows. Workspace navigation and representative tests do not certify every retained feature.
- Clean-slate/reset and a real supervisor-process restart round trip. The disposable restore verifies the swap and exit contract, not a full subprocess supervisor restart.

Do not infer release readiness or live provider activation from the presence of the vendored code.
