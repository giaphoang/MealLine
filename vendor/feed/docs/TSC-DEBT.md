# TypeScript Type-Check Debt

**Status:** Option C applied (2026-05-19); **Option D ratchet installed
2026-07-31**. Current baseline: **148** (was 227; see the 2026-09-02 update
below. Earlier: 279 → 227 when the unused `CustomDocumentTable` was deleted on
2026-08-05 and the shared animated navigation/toolbar icon slot types were
corrected on 2026-08-11).

## Update (2026-09-02 — 227 → 148 by root cause, not by sweep)

Seventy-nine errors cleared in six edits, none of them a mechanical pass over
the list. The backlog was never uniform; it was a handful of structural faults
each multiplied across every file that touched them.

**1. `forwardRef` erases generics — 40 errors.** `EnhancedDataTable` and
`DataList` were both `React.forwardRef(function C<T>(…))`. `forwardRef` has no
type parameter to thread `T` through, so each component's public type collapsed
to its constraint (`unknown`, and `DataItem` respectively) and every caller
passing real columns failed with `ColumnDef<Category>[]` not assignable to
`ColumnDef<unknown>[]`. Both exports now restate the generic signature with a
type-level cast; the runtime value is untouched.

This was also the *growth mechanism* behind the 240 → 292 → 300 climb recorded
below: every new table copied the pattern and contributed three more errors.
Tables added from here contribute none.

**2. A prop the component never had — 3 errors.** Three `data-table.tsx` files
passed `initialState={{ pagination, columnVisibility }}` to `EnhancedDataTable`,
which declares no such prop. React ignores unknown props, so the configuration
had never applied; the component's own `defaultPageSize` and
`mobileResponsiveColumnIds` were doing that work already. Removed. One
intention did not survive: `document-translator` wanted `fileSize` hidden on
mobile, which never happened and still does not — adding it to
`mobileResponsiveColumnIds` would be a behaviour change, so it is left as a
decision rather than folded into a type fix.

**3. Thirteen name/export failures, one of them a shipped bug.**

- `FoodItemList/index.tsx` used `OUT_OF_STOCK_FLAGS` at two call sites without
  importing it. esbuild strips types without checking them, so the build stayed
  green and the bundle shipped a free variable: bulk "mark out of stock" from
  the Food Items list threw `ReferenceError` at runtime. **This is the argument
  for the whole exercise** — the error class is invisible to the build and to
  any test that does not exercise the path, and visible only to `tsc`.
- `TranslationType` was referenced in four places across two files and imported
  in neither.
- `LegendBuilderComponent` likewise, in `ShoppingListBuilder.tsx`.
- `SetupState` / `SetupStep` were imported from `ai-configuration/types` and had
  never been exported from it — so the setup wizard's state was `any` and its
  four `setupStep === '…'` comparisons were unchecked string equality. Declared
  from the values both files use (14 errors, the whole `useSetupState` file).
- `useEditForm.ts` had no consumers and was written against `FoodItem.status`
  and `FoodItem.nutritionalFlags`, neither of which has existed since those
  fields became `statusFlags` and `dietaryFlags`. Deleted, following the
  `CustomDocumentTable` precedent (12 errors).
- `useInventoryChartData` read `data.statusDistribution` against a service type
  declaring `data.distribution`. The *hook* was right and
  `InventoryDistributionResponse` was fiction — `InventoryAggregator` really
  does return `statusDistribution` of `{ status, count, percentage, color }`.
  The response type now matches the aggregator.

**What is left (148).** TS2322 ×86, TS2339 ×24, TS2345 ×16. The largest
remaining cluster is AI Configuration and `unified-config` — a consistent
`number | null` vs `number | undefined` disagreement across the wizard's
optional numeric fields — followed by the icon-variance classes (a lucide icon
component where a `ComponentType<{}>` is expected) and framer-motion's
`Transition` / `Variants`. All are one-decision-applied-many-times, the same
shape as the two fixed here.

## Update (2026-07-31 — Option D applied, count now enforced)

The count is no longer a number someone has to remember to check. Two scripts
in `packages/frontend`:

```bash
npm run typecheck          # report the count, broken down by TS code
npm run typecheck:ratchet  # exit 1 if the count grew past the baseline
```

Both invoke `tsc --noEmit --project tsconfig.app.json` internally, which
removes the trap described in the 2026-07-20 update below: a bare
`tsc --noEmit` from that package checks zero files and exits 0 regardless.
Nobody has to remember the right flags any more.

The baseline lives in `packages/frontend/scripts/typecheck-baseline.json`.
Lowering it is the point — after fixing errors, run
`npm run typecheck:ratchet -- --update`. The ratchet was verified by
introducing a deliberate type error and confirming exit 1, then removing it and
confirming exit 0.

**Why a ratchet rather than a cleanup:** the count has been *growing*
(240 → 292 → 300) as new tables were added using the same `ColumnDef` pattern.
Arresting the growth is the change that pays; the backlog itself still needs
domain investigation, not a mechanical pass.

Eleven errors were also fixed on the way in, all of them genuinely mechanical
and two of them real breakage that the build could not surface:

- `inventory-chart.tsx` imported `ChartTooltipContent` from
  `@/components/ui/chart/ChartTooltipContent`, a path that does not exist. It
  was never used, and unused imports are elided at transpile, so the bad
  specifier never had to resolve and the build stayed green.
- `useStatusMessage.ts` imported `StatusMessage` from `@/types/status`, which
  has never existed. Type-only, so again erased before bundling. Now imported
  from `@/types/food-item`, where it is defined.
- `theme-provider.tsx` imported from `next-themes/dist/types`; next-themes 0.4
  exports its types from the package root.
- `useFoodData.test.ts` used `vi.MockedClass<…>` eight times. `vi` is a value,
  not a type namespace — the type is `MockedClass`, exported from `vitest`.

Current distribution at baseline 290: TS2322 ×179 (dominated by the
`ColumnDef` / icon-variance classes described below), TS2339 ×40, TS2345 ×19,
TS7006 ×14, TS2741 ×7.

## Update (May 19, 2026 — Option C applied)
**Original baseline:** 697 errors at commit `da7f060d`
**Current baseline:** 240 errors (65% reduction)
**Affects:** `packages/frontend` only

## Update (May 19, 2026 — Option C applied)

The "Option C quick wins" described below have all been applied during
Phase 2 release prep. The current error count is **240**, down from
697. Notable categories eliminated:

- **TS7016 (152 errors)** — `lucide-react/dist/esm/icons/*` module shim
  resolved all of these
- **TS6133 (227 errors)** — `noUnusedLocals` / `noUnusedParameters`
  flipped off in `tsconfig.app.json`; ESLint can take over here
- **TS18048 (14 errors)** — all real null-safety bugs fixed
- **TS2554 (11 errors)** — `useDialogState`'s `open(data)` signature
  made data-optional so dataless dialogs type-check
- **TS2353 (10 errors)** — added missing fields to types
  (`TableRowAction.title`, `UseAlertsOptions.refreshInterval`,
  `UseCategoryDataReturn.deleteCategory`, `updateFoodItem.limitType`,
  `ApiConfig.endpoints.categories.bulk`); removed duplicate
  declarations in `ConfigurationUsageMetrics` (the flat optional-number
  `requestsPerDay?` / `requestsPerMinute?` were shadowing the
  structured `{ current, limit }` form below them, making every
  access through the structured form report possibly-undefined)
- **~46 LucideProps icon-slot variance TS2322s** — broadened
  `ToolbarIcon`, `StepIcon`, `SectionHeaderIcon` slot types from a
  narrow `{className, size}` shape to `ComponentType<any>` so
  heterogeneous icon components (Lucide, animate-ui, imperative-ref)
  all satisfy the slot without prop-variance contortions

The remaining 240 errors are deeper-rooted (API drift in
`UnifiedConfiguration` vs `AIConfiguration`, TanStack `ColumnDef`
union narrowing, etc.) and require domain investigation rather than
mechanical fixes. Documented below for future passes.

## Update (2026-07-20)

Baseline confirmed stale: a real `tsc --noEmit --project tsconfig.app.json`
run at the start of that session's work (commit `bd30ae9`) reported 292
distinct errors, not 240 — the debt has grown as new tables were added using
the same `EnhancedDataTable`/`ColumnDef` pattern documented below. That same
session also discovered that a bare `npx tsc --noEmit` run from
`packages/frontend` (no `--project` flag) checks zero files and reports
success unconditionally, because the frontend root `tsconfig.json` is a
solution-style file (`"files": []` + `references`). Every prior "typecheck
passed" claim made that way in that session was meaningless. See the AGENTS.md
"Lessons From Recent Work" entry for the fix and how it was verified against
an isolated historical baseline. This file's counts remain a point-in-time
snapshot, not a live-tracked number — re-verify before citing them.

This document captures the state of pre-existing TypeScript errors in the
frontend project, why they exist, what they cost us, and how to address
them when we choose to. They have been deferred — they do not block v1.0.0
because Vite/esbuild compiles and ships the project regardless.

---

## Why this exists

`tsc --project tsconfig.app.json` reports 697 errors. The project still
builds and ships because Vite uses esbuild for transpilation; `tsc` is only
used for type-checking, and we have no CI gate that requires it to pass.
The errors accumulated organically across many months of development on
multiple flows (some of which have since been removed).

The errors were surfaced during the v1.0.0 release-prep wizard-removal pass,
where the deletion of 39 files (9,650 lines) caused only 3 new cascading
errors to surface visibly — the other 694 stayed hidden in the noise. That
experience made the cost of carrying the debt concrete.

---

## Error inventory (as of 2026-05-19)

| Code | Count | % | Category | Real-bug rate |
|---|---|---|---|---|
| TS6133 | 227 | 33% | Unused locals/imports | ~0% — pure noise |
| TS7016 | 152 | 22% | Missing `.d.ts` for `lucide-react/dist/esm/icons/*.js` | ~0% — architectural |
| TS2322 | 149 | 21% | Type assignment mismatch (`null` vs `undefined`, `LucideProps`→`ComponentType` swaps, form value types) | ~30% |
| TS2339 | 54 | 8% | Property doesn't exist (often API drift: `cachedChoicesCount` on `CacheStatistics`, `accessorKey` on TanStack `ColumnDef` union) | ~50% |
| TS2345 | 19 | 3% | Argument type mismatch | mixed |
| TS7006 | 14 | 2% | Implicit `any` on parameter | low |
| TS18048 | 14 | 2% | "Possibly undefined" | ~100% — genuine null-safety bugs |
| TS2554 | 11 | 2% | Wrong number of arguments | ~100% — bugs |
| TS2353 | 10 | 1% | Extra props on object literal | ~80% — bugs |
| TS2503 | 7 | 1% | Namespace not found | structural |

**Single worst file:** `src/components/ui/icons.tsx` — **165 errors** (24% of
the total), all from one design choice: importing `lucide-react/dist/esm/
icons/*.js` directly for tree-shaking. Those per-icon files ship without
`.d.ts` siblings; TS reports an implicit `any`.

**Top offenders by file:**

| File | Errors |
|---|---|
| `src/components/ui/icons.tsx` | 165 |
| `src/components/shopping-lists/builder/ShoppingListBuilder.tsx` | 17 |
| `src/components/ai-configuration/hooks/useSetupState.ts` | 16 |
| `src/components/dashboard/token-usage/TokenUsageMetrics.tsx` | 15 |
| `src/components/ai-configuration/index.tsx` | 14 |
| `src/components/ai-configuration/EditSystemPromptDialog.tsx` | 14 |
| `src/hooks/food-item/form/useEditForm.ts` | 12 |
| `src/components/ai-configuration/AIConfigurationList/index.tsx` | 12 |
| `src/components/food-item-management/FoodItemList/index.tsx` | 11 |
| `src/types/multi-service-usage.ts` | 10 |

To regenerate this inventory:
```bash
cd packages/frontend
npx tsc --noEmit --project tsconfig.app.json 2>&1 | grep "error TS" | grep -oE "TS[0-9]+" | sort | uniq -c | sort -rn
```

---

## What this costs

1. **Bug masking.** ~80-100 errors (TS18048 / TS2554 / TS2353 / some
   TS2339) are genuinely catching real bugs. Right now they're invisible
   in the noise.
2. **IDE noise.** Editor red-squiggle is unreliable; new errors hide in
   pre-existing noise.
3. **No CI gate possible.** Cannot add "tsc must pass" to CI today.
   Every PR can introduce more errors without pushback.
4. **Refactor friction.** Deletions/renames don't get the full safety
   net. The wizard-removal pass had to filter errors manually to know
   what was newly broken vs. pre-existing.
5. **Public-repo signal.** When the repo flips public (Phase 3 of v1.0.0
   release), external contributors run tsc and see 697 errors —
   reads as "this isn't maintained." Fair or not, it shapes first
   impression.

## What this does NOT cost

- The product does not crash. Vite/esbuild ships fine.
- End users see nothing different.
- Existing tests still run.

---

## Options for addressing

### Option A — Fix all 697

- **Effort:** 2-5 days focused work
- **Result:** 0 errors
- **Pros:** Clean baseline forever
- **Cons:** Doesn't make the product better for users; ~50-100 errors
  need real domain investigation (API drift, type design); regression
  risk multiplied across 700 edits

### Option B — Fix nothing

- **Effort:** 0
- **Result:** 697 errors persist
- **Pros:** Maximum velocity; ship v1 without delay
- **Cons:** Debt grows; bugs stay masked; bad public-repo signal

### Option C — Quick wins only (RECOMMENDED for Phase 2)

Targeted high-value fixes that bring the count down dramatically without
investigating each error individually.

- **Effort:** ~3 hours
- **Result:** ~250 errors (down from 697)
- **Steps:**

  1. **Add `lucide-react` per-icon module shim** (5 min, kills 152 TS7016)
     Create `packages/frontend/src/types/lucide-react-icons.d.ts`:
     ```ts
     declare module 'lucide-react/dist/esm/icons/*' {
       import type { IconNode } from 'lucide-react';
       export const __iconNode: IconNode;
       const Icon: unknown;
       export default Icon;
     }
     ```

  2. **Relax unused-locals/parameters in tsconfig** (1 min, kills ~241
     TS6133/TS7006 errors). In `packages/frontend/tsconfig.app.json`:
     ```diff
     -    "noUnusedLocals": true,
     -    "noUnusedParameters": true,
     +    "noUnusedLocals": false,
     +    "noUnusedParameters": false,
     ```
     Trade-off: linting moves to ESLint's `no-unused-vars`, which is
     standard. tsc-level "unused" warnings are mostly noise; ESLint with
     fix-on-save handles them better.

  3. **Fix all TS18048 / TS2554 / TS2353** (~1-2 hours, ~35 real bugs).
     These three error codes are ~100% genuine bugs and bounded in
     count. Worth the time.

  4. **Clean up self-introduced errors from the v1 prep session**
     (~30 min, ~10-20 errors). Mostly `LucideProps` → `ComponentType`
     mismatches from the icon wirings I added during the UI refresh
     pass. Quality matters: don't ship v1.0.0 with my own type errors
     in the baseline.

### Option D — C + CI ratchet (RECOMMENDED IF GOING PUBLIC)

Everything in C, plus a baseline + ratchet system so the error count
can only shrink going forward.

- **Effort:** C + ~3 hours
- **Result:** Frozen at post-C number; PRs can't increase it
- **Implementation:**
  - Generate `packages/frontend/tsc-baseline.json` capturing current
    error count and per-file breakdown.
  - Add a CI step: run `tsc --noEmit --project tsconfig.app.json`, count
    errors, compare to baseline. Fail if count grows.
  - When someone fixes errors, they regenerate the baseline as part of
    their PR.
  - Tools that do this: [`typescript-error-baseline`](https://github.com/n8n-io/typescript-error-baseline),
    or a hand-rolled grep-and-compare script (~30 lines).

This is the pattern most large TS codebases use to climb out of type
debt without committing to a multi-week sprint.

---

## Recommendation

**Phase 2 of v1.0.0 release prep** is the right time for Option C + D.
Specifically, do the quick wins (Option C steps 1–4) right before
flipping the repo public. ~3 hours total. The baseline + ratchet (D)
is a half-day to set up but pays dividends forever.

**Skip if** v1.0.0 ships in the next 24 hours and the velocity hit
matters more than the maintenance ergonomics. The repo has been
shipping with these errors for months — one more release won't kill it.

**The one thing not to do** is fix all 697 in a heroic sprint before
v1.0.0. The marginal user value is zero, the regression risk is real,
and the calendar cost is bad.

---

## When you come back to this

1. **First**, regenerate the inventory (the command above). If the
   numbers have shifted dramatically, this document is stale and the
   plan should be reconsidered.
2. **Then**, decide between C and D based on whether the repo is
   public yet. If yes, D is high-leverage. If no, C alone is fine.
3. **Then**, do the steps in order. Option C steps 1 and 2 are
   essentially free; do them first regardless.
4. **Last**, commit the baseline + ratchet (if D) on a focused branch
   so the diff is reviewable.

---

## Cross-references

- `docs/V1-RELEASE-PLAN.md` — Phase 2 ("Public-readiness audit") is the
  natural home for this work
- The deletions that surfaced this — `release/v1.0.0` commits `59540e12`,
  `b7b9cf67`, `9aca2474`, `da7f060d`
