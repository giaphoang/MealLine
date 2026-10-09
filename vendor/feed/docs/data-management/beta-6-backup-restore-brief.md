# Restore and Clean Slate: Design

## Status

**Designed and approved 2026-08-02. Restore shipped in 1.5.0-beta.7
(2026-08-04). Clean slate is still to build.**

What shipped, and where it differs from this document:

| Design | Shipped |
| --- | --- |
| Build a fresh file, `migrate deploy`, import, carry across what the artifact lacks | **`VACUUM INTO` a copy of the live file**, then rewrite only the selected units. Same destination, fewer moving parts — see [The mechanism](#the-mechanism-build-and-swap-never-a-live-transaction) |
| Include the roster in the artifact, force every restored role to `STAFF` | **Implemented in backup contract v11.** Role is stripped from the artifact; restore assigns Staff and preserves Administrator only for the authenticated administrator performing the restore. |
| Maintenance mode, partial units, replace-never-merge, exit-to-restart | As designed |

Verified end to end against a copy of the production-scale database: a renamed
category and a stray row were reverted, 120,856 procurement lines and the
4-account roster were carried across untouched, the pre-restore snapshot was
written, and the scratch file was cleaned up.

### The roster in the artifact: closed in contract v11

The artifact now carries `User` rows with `role` stripped. Restore assigns every
artifact account to Staff and re-grants Administrator only to the authenticated
administrator who initiated the in-app restore, preserving that account's live
id so its session survives the restart. `AccessPolicy`, authentication tokens,
encryption keys, and the administrator audit log remain destination-owned and
excluded.

### Sizing, measured

The artifact for a ~29MB database is **120MB** of pretty-printed JSON — about
4×, driven by ~121k procurement lines each repeating their key names. The upload
cap is 256MB. Memory is the real ceiling: the file is held as a buffer, a
string, and a parsed object, so past this size the fix is a streaming parse
rather than a larger number.

This began as a brief of open questions. Those questions are now answered, so it
is a design record rather than an agenda. Backup shipped in 1.5.0-beta.6;
restore and clean slate are the work this describes.

Two changes to already-shipped code fall out of it and had to land first. Both
are now **implemented** — see [Prerequisites](#prerequisites).

## The vision this serves

FEED should let an administrator control the database without SSH, VNC, or a
terminal.

That means three capabilities, in order of how often they will be used:

1. **Back up whenever they want**, and keep that file outside the system,
   knowing recovery from it is genuinely possible.
2. **Restore to a chosen snapshot** — the safety net after a change goes wrong.
   This is the common case: an administrator rolling back their own work, not a
   disaster.
3. **Return to a clean slate** — a seeded starting state, on purpose.

Restore is not primarily disaster recovery. It is *undo at the database level*,
and it should feel closer to "revert this change" than to "rebuild the server."
The design follows from that framing.

## Prerequisites

Two things had to land before restore could be built. **Both are implemented.**
They are recorded here as written, with the outcome noted, because the reasoning
is what justifies the shape they took.

**1. API keys must be editable.** ✅ Implemented. `PUT /api/ai-config/:id` already accepts
`apiKey` and re-encrypts with a fresh salt, but `EditAIModelDialog` renders no
field for it — it sets `apiKey: ''` with the comment "Not displayed in edit
mode." Today, rotating a key means deleting the configuration and recreating it,
losing the model, costs, and limits attached to it.

Restore ends with "re-enter your provider keys," which is impossible if the UI
has nowhere to enter one. Render the field in Edit with a `••••••••••••`
placeholder — signalling *deliberately hidden, updatable but not viewable* — and
send `apiKey` only when non-empty, which is exactly what the backend expects.

*Landed as designed, in `ApiKeyStep` rather than in the dialog — that is where
the field lives in both Add and Edit. Blank on save omits the property
entirely; the backend rejects an empty string with 400, so omission is the only
correct way to say "unchanged."*

**2. `AIConfiguration` must be redacted rather than excluded.** ✅ Implemented. beta.6 excluded
the whole table because it holds `encryptedApiKey`. That was coarser than
`backup-and-restore.md` ever asked for — it says exclude
"`AIConfiguration.encryptedApiKey`, salts, and provider secrets," which is
column-level. The table also holds `model`, `temperature`, `topP`,
`thinkingLevel`, token limits, cost limits, rate limits, and `isActive`, all of
which are an administrator's work and should survive a restore.

This adds a third category to the table contract — **included with columns
redacted** — and bumps `tableContractVersion` to 2. Doing it before anyone
depends on the v1 shape means only one reader version ever has to exist.

*Landed as `REDACTED_COLUMNS` in `table-contract.ts`. The redaction deletes the
columns rather than nulling them, so a restore cannot mistake an empty key for a
real one, and the manifest declares what was redacted. Verified against a
database seeded with a known secret: absent from the artifact, with model, cost,
and rate settings intact.*

## The mechanism: build and swap, never a live transaction

A single interactive transaction cannot do this. The largest procurement import
— 17,814 rows — lands near 18s on the production Pi against the 30s ceiling in
`db.ts`. A full restore is an order of magnitude larger. Raising the ceiling to
fit means holding a multi-minute write lock and, if it fails at minute four,
having blocked the pantry for nothing.

`DATABASE_URL=file:/app/data/production.db` sits on a bind mount, so a scratch
file beside it is on the same filesystem and `rename(2)` is available. That
gives atomicity for free:

1. Create `restore-<ts>.db`; run `migrate deploy` against it → current schema
2. Import the artifact into it, in as many transactions as needed — **nothing is
   live, so there is no clock**
3. Validate: row counts against the manifest, checksum, foreign-key integrity
4. Carry across what the artifact does not contain (see
   [Authority](#authority-the-roster-and-what-restore-preserves))
5. Snapshot the live database
6. Enter maintenance mode; `$disconnect`; checkpoint WAL and remove `-wal`/`-shm`
7. `rename()` the new file over `production.db`
8. Exit the process

The live database is untouched until one syscall. Rollback is renaming the
snapshot back. The 30s ceiling never applies, and neither does nginx's 300s
proxy timeout, provided step 2 reports progress rather than blocking one
request.

**The WAL step is not optional.** Swapping the file while stale `-wal`/`-shm`
sidecars exist leaves SQLite reading a journal that disagrees with the database.

### Restarting

`docker-compose.yml` sets `restart: unless-stopped` on every service, and the
container command is `sh -c "prisma migrate deploy && node dist/index.js"`. So
**the app restarts itself by exiting** — no Docker socket, no privileged access,
no host agent. `migrate deploy` runs again on the way up and is a no-op against
an already-current file.

FEED is down for a few seconds during the restart. That is acceptable and should
be stated plainly in the UI rather than hidden. Exit code is free to carry
meaning in the logs, since `unless-stopped` restarts on either.

## Maintenance mode

The contract requires stopping writes. FEED has no such mode.

It must be **in-memory and process-local**, not a database flag — the flag would
live in the file being replaced. FEED runs one process in one container, so a
module-level boolean is sufficient, and it has a property a persisted flag
lacks: **a crashed restore cannot strand the instance in maintenance forever**,
because a restart clears it.

Middleware after `jwtAuthMiddleware` rejects mutations with `503` and an
ASK-compliant message naming what is happening and who started it. Reads keep
working, so staff can look things up while they wait.

## Authority: the roster, and what restore preserves

beta.6 excluded `User`, `AccessPolicy`, and `AdminAuditLog` so that no artifact
could grant administrator access.

**That reasoning was right about the file and wrong about the mechanism.** Under
build-and-swap, excluding the roster does not preserve it — it *destroys* it.
The new database is migrations plus artifact; migrations create an empty `User`
table and nothing repopulates it. A full restore would wipe every account, arm
the fresh-instance bootstrap, and hand administrator to whoever signed in first
— the exact privilege-escalation race beta.4 rejected.

**Resolution: include the roster, treat roles as advisory, never authoritative.**

On restore:

- accounts are recreated — email, `invitedAt`, `lastLoginAt`;
- **every role lands as `STAFF`, whatever the file says**;
- the administrator performing the restore is re-granted administrator, because
  they are authenticated and known. For CLI restore, the operator grants
  afterward.

No file can confer authority — a tampered artifact adds a staff account at most
— and nobody loses their staff list. It also makes the artifact sufficient for a
hardware disaster: restore onto a new Pi and the roster returns.

Two consequences accepted knowingly:

- **The artifact now contains staff email addresses.** These are largely
  public-facing already (website, business cards), and an address without a
  reachable inbox cannot pass OTP — an attacker who can receive mail at
  `@williamtemple.org` has already defeated something bigger than this file.
  The "keep it private" copy becomes more load-bearing regardless.
- **`AccessPolicy` stays excluded.** Sign-in mode *is* authority. A file that
  could flip an instance from Allowlist to Domain is the artifact-grants-access
  problem wearing a different hat.

`AdminAuditLog` also stays excluded: it is a security record, and importing it
from a file would let someone rewrite the history of privileged actions.

## Version contract

**`tableContractVersion` is the gate. `schemaVersion` is provenance.**

An earlier comment in `sanitized-backup.ts` called `schemaVersion` "the
compatibility key that matters." That is wrong and should be corrected in the
code. Most migrations do not touch exported tables — beta.5 and beta.6 added
none at all — so gating on the migration name would refuse valid artifacts
constantly, and people would learn to bypass the check.

Do not migrate the artifact. Ship **a reader per contract version**, each mapping
that version's shape onto current Prisma models, with defaults for columns added
since living in the reader where someone would look for them.

| Condition | Behaviour |
| --- | --- |
| `tableContractVersion` > highest supported | Refuse, naming the FEED version that can read it |
| `tableContractVersion` supported | Adapt via that reader |
| `schemaVersion` differs | Note it; do not block |

Bump the contract version only when the shape changes, and the reader count
stays small.

## Replace, never merge

**Restore replaces within the selected units. It never merges.**

The reason is identity, not fragility. `FoodItem.id` and `Category.id` are
`autoincrement`, and they are referenced by id from `FoodItemTranslation`,
`FoodItemInventoryEvent`, and `CategoryInventoryEvent`. A merge must therefore
reconcile two id-spaces.

Concretely: the file holds "Canned Corn" at `id 42` with translations pointing
at 42; the live database has it at `id 87` because it was deleted and recreated
in March. Merging by name must rewrite every foreign key in the incoming graph
from 42 to 87 — and if it does not, those translations either collide with
whatever live row occupies 42 or attach to the wrong item entirely.

**That is silent corruption**: a translation bound to the wrong food item, an
event attributed to the wrong product. It is invisible on screen and survives
physical reconciliation, because staff verify stock, not foreign keys.

Replace sidesteps it — the whole graph is replaced consistently, so ids stay
internally coherent.

**Procurement is the one tractable exception**, and a real follow-up rather than
a hypothetical. It carries stable natural keys — source order references, the
unified file hash — that exist independently of any autoincrement id, so
identity comes from the data instead of being inferred. That is also why the
domain already has supersede-rather-than-join semantics (D1). "Add back last
month's imports without touching anything else" is a genuinely useful operation
and should be built once replace is proven.

For every other unit, merge stays open but carries a known cost: a remapping
pass, plus tests proving foreign keys land on the right rows.

### Restoring inventory is normal, not dangerous

Worth stating because an earlier draft of this document had it wrong. Inventory
is a living record. Staff reconcile it against physical stock before every
pantry day, and limits are not invisible — they are set from perceived scarcity,
printed on shopping lists, and mirrored in shelf signage, so a reverted limit is
checkable against the sign and the dry store.

So the confirmation should **disclose and move on**, not warn. Two disclosures
earn their place:

- resurrected items — a deleted duplicate returning is easy to clear in bulk,
  but only if someone knows to look;
- the completion step: *"Inventory reflects [backup date]. Check limits and
  availability before your next pantry day."*

Categories revert silently too; they are scaffolding for cognitive load rather
than operational facts, so disclosure is enough.

## Partial restore: units closed under foreign keys

Partial restore cannot offer arbitrary table checkboxes, because the tables are
not independent. Each selectable unit must be **closed under foreign keys**.

| Unit | Tables | Requires |
| --- | --- | --- |
| Inventory | Category, FoodItem, their translations, inventory events, GlobalLimit | Languages |
| Languages & translations | Language, Translation | — |
| Shopping lists | Builder templates, saved components | Inventory |
| Procurement | Imports, order revisions, products, lines, data rules | — |
| Configuration | ExportSettings, OperatingHours, SystemPrompt, FormattingChoice, SavedCustomText, AIConfiguration (redacted) | — |

These map onto the groups already on the Database tab, so the vocabulary staff
read and the vocabulary restore uses are the same.

The modal **auto-selects dependencies and says why** rather than refusing —
refusing makes the user solve a graph problem. Procurement being genuinely
independent makes it the most useful unit in practice.

## Clean slate

Full design in [clean-slate-and-seed.md](clean-slate-and-seed.md); summarised
here because it shares the restore mechanism.

"Return to a seeded state" is the same mechanism with a different source: build
a fresh database, run migrations, seed it, swap it in.

It is **not** a restore, and the confirmation must read differently — it
discards rather than recovers.

### What a clean slate contains

`scripts/seed-all.ts` currently touches five models: Category, FoodItem,
GlobalLimit, Language, SystemPrompt. Most of the apparent gap is benign —
`AccessPolicy` creates itself on first read, operating hours fall back to
documented defaults, `ExportSettings` follows the same singleton-on-demand
pattern, and empty procurement is *correct* for a fresh instance.

The real gap is an example that teaches the hardest feature.

Three layers, with different owners and lifetimes:

- **Structural** — what makes FEED work rather than be empty: GlobalLimit,
  English enabled, the singletons. No opinions.
- **Reference** — facts, not choices: the 59 supported languages as *available*,
  and the system prompts, which are FEED's AI behaviour rather than the agency's
  content.
- **Illustrative** — opinions about a pantry that may not be this one: example
  categories, food items, and a shopping list template.

**Reset offers "With examples" (default) or "Structure only."** An established
pantry resetting its own instance wants structure only — it knows its
categories, and seeded ones are just work to delete. A new agency wants the
examples, because an empty builder teaches nothing.

The illustrative set should be **smaller than today's ~70 items — roughly three
categories and a dozen food items, plus one template**. Its job is to
demonstrate structure, not to look like a stocked pantry, and it should be easy
to clear once someone has their feet wet.

**The example template ships with the example inventory, not without it.** A
template demonstrating a real inventory-backed section table teaches far more
than one built from base components, and it needs categories and items to bind
to. They are one unit.

### The roster on reset

Reset offers **preserve (default) or clear**. Preserve carries the live roster
into the new database before the swap. Clearing wipes it, which arms the
fresh-instance bootstrap — coherent, but it must be chosen, not discovered.
Defaulting to preserve avoids locking everyone out of the instance they just
reset.

## Delivery

**MVP — CLI.** `node dist/cli/admin.js restore --file=… --confirm`: full restore
only, with snapshot, validation, swap, and exit-to-restart. It proves the
dangerous mechanism where an operator can recover from it, and it is testable
end to end without a human in the loop.

**Then — in-app.** A multi-step modal:

1. upload and validate; show the manifest and verify the checksum
2. choose full or partial, with dependencies auto-selected and explained
3. review the diff — current counts against artifact counts, with deltas
4. confirm
5. progress
6. completion: initialise encryption, then offer API key entry with a **skip**
   option, plus the inventory reminder

Step 6's order is forced by the data: `EncryptionKey` is excluded, so there is
nothing to encrypt with until encryption is initialised. Skipping is a
first-class choice — configurations restore inactive and keys can be added
later, with their model and cost settings intact. Declining to restore AI
configurations at all is a separate option at step 2.

**The pre-restore snapshot is not optional.** It costs one file copy and is the
difference between a safety net and a trapdoor.

**No second-administrator requirement.** The point of restore is to give an
administrator control over their own database; requiring a colleague defeats it.
Every restore is audited.

## Known traps

- **Migrations auto-apply on container start.** A restored file at an older
  schema meets a migration on the next boot. Build-and-swap avoids this by
  migrating the scratch file first — but only because it does so deliberately.
- **Timestamp storage.** Prisma writes SQLite `DateTime` as INTEGER
  milliseconds; `CURRENT_TIMESTAMP` writes TEXT, and SQLite orders every INTEGER
  before every TEXT regardless of value while Prisma reads both without
  complaint. A restore that reconstructs rows must match Prisma's format or it
  silently corrupts every ordering. This cost real debugging time in beta.4.
- **`.dump` omits unique indexes**, after which Prisma `upsert` fails with
  `ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint`.
- **WAL is on.** Both the snapshot and the swap must be WAL-aware.
- **The encryption key lives in the database**, not in `ENCRYPTION_MASTER_KEY`.
  "Re-enter keys" means re-initialising encryption, not editing an env file.

## Reading order

1. [backup-and-restore.md](backup-and-restore.md) — the approved boundary.
2. [../auth/administrator-authorization.md](../auth/administrator-authorization.md) — the authority that gates this.
3. [clean-slate-and-seed.md](clean-slate-and-seed.md) — the seed layers and the reset options.
4. [ingestion-architecture.md](ingestion-architecture.md) — what large transactional writes cost on the production Pi.
5. AGENTS.md, "Database and Auth Changes" and "Local Development Environment".
