# Clean Slate and the Seed

## Status

Designed and approved 2026-08-02. **Implemented in 1.5.0-beta.7+.**

The three layers live under `src/services/seed/` (`layers.ts`,
`seed-service.ts`, `supported-languages.ts`, `example-template.ts`), and the
reset action is wired to the restore mechanism via `buildAndSwap`
(`services/restore/restore-service.ts`) with `CleanSlateService` on top.

Under `src/`, not `scripts/`: the production image installs with `--omit=dev`
and never copies `scripts/`, so seed content kept there cannot back a
user-facing action — the trap the operator CLI hit in beta.4.

`scripts/seed-all.ts` no longer carries its own copies. It calls
`SeedService.apply(prisma, { withExamples: false })` for the structural and
reference layers and keeps only the development *inventory* — eight categories
and ~70 items, deliberately richer than the clean slate's three and nine,
because development wants enough data to exercise analytics and procurement
while a first-run instance wants an example small enough to read and easy to
delete. Shared where it is the same thing; separate where it is not.

**Reference now includes the system prompts.** They previously existed only in
`scripts/seed-all.ts`, which the production image never copies — so a reset
cleared `SystemPrompt` (it is in the backup contract) and had nothing to put
back, leaving the instance with no prompts driving translation at all. That was
a real defect introduced with the reset and is now fixed and covered by tests:
the prompts are present whether or not examples are chosen.

## The example Builder template

Authored by hand in the Builder against the example inventory, then captured
into the seed. It ships with eight reusable saved components (Title, Date,
Language tag, Custom form fields, Instructions, Legend, List number, Page flip
notice) so a new template starts with pieces to drag in.

**Its ids are symbolic, and that is the whole design.** The authored template
referenced categories and items by database id — `categoryId: 14`,
`foodItemId: 177`, and component ids like `inventory-category-14-instance-...`.
Those ids are not stable: SQLite keeps an autoincrement high-water mark in
`sqlite_sequence` that survives the deletes a reset performs, so the same seed
run twice produces different ids and a different instance produces different
ids again. Embedding them literally would bind the example table to whatever
rows happen to hold those ids later — the wrong food items, or none. It is the
same identity problem that makes restore replace rather than merge.

So `example-template.ts` stores `@@CAT:Name@@` / `@@ITEM:Name@@` placeholders
and resolves them against the rows the seed just created. Names are the stable
key; the seed owns both sides of the mapping, and building against missing
inventory throws rather than silently rendering an empty table.

Verified across three separate id-spaces: the authored template (categories
14/15/16), a freshly migrated database (1/2/3), and a reseeded live database
(17/18/19). Every `categoryId`, `foodItemId`, and embedded component id resolved
correctly, with no placeholders left behind, and seeding twice leaves one
template and eight components rather than duplicates.

The seeded template renders: `POST /api/shopping-list-builder/preview-pdf`
returns `application/pdf`, 41,837 bytes, per the builder validation rules in
AGENTS.md.

**Carrots is deliberately absent from the template.** It is seeded out of stock,
and shopping lists show what is available — its absence is the demonstration.

## Development note

After a restore or reset, `npm run dev` does **not** come back on its own.
`ts-node-dev --respawn` means "keep watching for changes after the script
exits", not "restart on exit" — it waits for a file to change. Touch a source
file or restart the dev server. Production is unaffected: Docker's
`restart: unless-stopped` restarts on any exit code.

## The approved example inventory

Three categories, nine items. Small on purpose: its job is to demonstrate
structure, not to look like a stocked pantry.

| Category | Category limit | Items | Item limit |
| --- | --- | --- | --- |
| Produce | No Limit (stored as 100) | Apples, Carrots, Grapes | none |
| Dairy | 3 | Milk, Cheese, Yogurt | 1 |
| Meat | 3 | Chicken, Beef, Pork | 1 |

Status badges are **independent of the numeric limit** — `isLimited` paints a
"Limited" marker on shopping lists, it does not cap anything. Exactly one badge
per category, so each is visibly distinct:

- **Carrots** — out of stock
- **Chicken** — Limited
- **Yogurt** — Clearance

Setting `isLimited` on every item that happens to carry a limit of 1 would put
the badge on six items and demonstrate nothing. That mistake is caught by a
test.

Dietary flags are set accurately, because the flags are what the example
teaches: grapes vegan, cheese vegetarian but not vegan, the meats neither.
Halal and kosher are false across all three meats — for chicken and beef that
depends on provenance an example cannot assert, and for pork it is never true.

## What changed and why

`scripts/seed-all.ts` was built as a development tool: a way to populate a
database so features could be tested. It predates the Shopping List Builder. Its
categories and food items exist so a new deployment does not feel vacant.

Turning it into the source for a user-facing **Reset to clean slate** action
changes what it has to be. A development seed can be approximate; a clean slate
is a state someone deliberately chooses and then works from.

## What the seed covers today

Five models: `Category`, `FoodItem`, `GlobalLimit`, `Language`, `SystemPrompt`.

Most of the apparent gap is benign, and this is worth stating so nobody
"fixes" it unnecessarily:

- `AccessPolicy` creates itself on first read (`AccessPolicyService.get`);
- operating hours fall back to documented defaults when no revision exists;
- `ExportSettings` follows the same singleton-on-demand pattern;
- empty procurement, empty saved components, and empty data rules are *correct*
  for a fresh instance.

The real gap is that nothing demonstrates the Shopping List Builder, which is
the hardest feature to discover and the one least served by documentation.

## Three layers

A clean slate is not one thing. These layers have different owners and different
lifetimes, and separating them is what makes the "with or without examples"
choice coherent.

**Structural** — what makes FEED work rather than merely be empty. `GlobalLimit`,
English enabled, the singletons. No opinions about any particular pantry.
Always present.

**Reference** — facts rather than choices. The 59 supported languages as
*available* (not enabled), and the system prompts, which are FEED's AI
behaviour rather than an agency's content. Always present.

**Illustrative** — opinions about a pantry that may not be this one. Example
categories, food items, and a shopping list template. **Optional.**

## The choice

Reset offers two options:

| Option | Contains | For |
| --- | --- | --- |
| **With examples** (default) | Structural + Reference + Illustrative | A new deployment. An empty builder teaches nothing |
| **Structure only** | Structural + Reference | An established pantry resetting its own instance — it knows its categories, and seeded ones are work to delete |

"With examples" is the default because a first-run instance is the case where
the choice matters most, and because example data is easy to clear once someone
has their feet wet — `Delete` is a bulk action.

## Sizing the illustrative layer

**Roughly three categories, a dozen food items, and one shopping list
template** — materially smaller than today's eight categories and ~70 items.

Its job is to demonstrate structure, not to look like a stocked pantry. A large
seeded inventory invites two failures: someone mistakes it for real data, or
someone spends their first hour deleting it.

**The template ships with the example inventory, not separately.** A template
demonstrating a real inventory-backed section table teaches far more than one
built from base components alone — and it needs categories and items to bind to.
They are one unit: choosing examples gets both, choosing structure-only gets
neither.

The example template should exercise the parts of the builder that are hardest
to discover: a header, at least one inventory-backed section table showing
category limits, and a footer. It is documentation that runs.

## The roster on reset

Reset offers **preserve (default)** or **clear**.

Preserve carries the live roster into the new database before the swap, so an
administrator resetting their instance does not lock themselves and their
colleagues out of it.

Clear wipes it. Whether that arms the fresh-instance bootstrap depends on one
more thing: since 2026-09-04 the bootstrap requires an empty roster **and** no
encryption key, and a clean slate does not remove the key (it is in
`EXCLUDED_TABLES`). So on an instance that has been set up, clearing the roster
leaves nobody who can grant authority through the app, and the way back is the
operator CLI:

```bash
docker compose exec backend node dist/cli/admin.js grant --email=… --confirm
```

Handing a genuinely fresh instance to another agency still works as intended.
Either way it must be **chosen, not discovered**.

## Mechanism

Identical to restore — build a fresh database, run migrations, populate it, swap
it in atomically, exit to restart. The only difference is the source: a seed
rather than an artifact.

Sharing the mechanism means the dangerous parts get exercised by both features
and only have to be proven once.

## It is not a restore

The confirmation must read differently. Restore *recovers* data; reset
*discards* it. Same machinery, opposite intent, and the copy should never let
those blur.

The pre-swap snapshot applies here too — arguably more so, since there is no
artifact to recover from if someone resets by mistake.

## Before implementing

Struck through as they land.

- ~~Audit the seed against current migrations~~ — done; `SeedService` was
  written against the current schema and verified against a freshly migrated
  database. Two fields did not match the assumption: `GlobalLimit` stores
  `value`, not `limit`, and a category's "No Limit" is stored as `100`.
- ~~Decide the example categories and items~~ — approved 2026-08-04, above.
  Nine items rather than the dozen originally sketched; three per category
  reads as a pattern without becoming a list to maintain.
- Build the example template against those items and render it to PDF, per the
  builder validation rules in AGENTS.md.
- Update the AGENTS.md "Seeding" note, which currently describes `seed-all` as a
  development tool that resets inventory states — accurate today, incomplete
  once it also backs a user-facing action.
