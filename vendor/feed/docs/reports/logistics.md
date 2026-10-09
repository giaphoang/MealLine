# Food Item Logistics & Inventory Ledger

> **Prototype history — superseded.** This document describes the July 2026
> logistics prototype and is retained only as implementation history. Current
> Supply fields, event semantics, sampling, and analytics decisions are defined
> in [Operational Analytics, Supply Annotations, and Data Export](operational-analytics-design.md).

Phase 1 of the Logistics, Inventory Analytics, and Reports initiative. This
document is the source of truth for the logistics fields, the append-only
inventory event ledger, and the centralized stock/count consistency rules.

## Logistics fields on `FoodItem`

| Field | Type | Meaning |
|---|---|---|
| `purchasePriceCents` | `Int?` | `null` = Unknown, `0` = Donated/Free, positive = Purchased. Always integer cents — currency is parsed from its string representation (`packages/frontend/src/lib/formatting/currency.ts`), never via float math. |
| `unitsPerPurchase` | `Int` (default 1) | Whole base units in one purchase. `1` displays as "Each". |
| `estimatedQuantity` | `Int?` | Base units on hand. `null` = Unknown count. |

Derived unit cost = `purchasePriceCents ÷ unitsPerPurchase`. Only the two
inputs are stored; the derived value keeps full precision for analytics and
rounds to two decimals for display only.

New-item defaults: `$0.00` Donated/Free, `1` (Each), Unknown quantity.

### Migration (`20260709000000_add_food_item_logistics_ledger`)

- Existing prices → `null` (Unknown); units-per-purchase → `1`.
- Existing in-stock quantities → `null` (Unknown); out-of-stock → `0`.
- One `migration_baseline` event inserted per existing item. **All time
  before the baseline event is untracked** — historical reports must say so
  rather than inventing history.

## Append-only ledger: `FoodItemInventoryEvent`

Rows are never updated or deleted by the app. Each event snapshots the full
logistics/status state at that moment plus:

- `foodItemId` (`onDelete: SetNull`) — live pointer, detaches on deletion.
- `sourceFoodItemId`, `itemName`, `categoryId`, `categoryName` — immutable
  denormalized identity so deleted items keep contributing to history.
- `eventKind`: `migration_baseline | created | updated | deleted`.
- `recordsQuantity` / `recordsPrice` / `recordsStatus` / `recordsIdentity` —
  which tracked dimensions the event records. Created/baseline snapshots seed
  tracked state, updated events flag only effective changes, and deletion
  snapshots set all four flags false because deletion is a lifetime boundary,
  not a new quantity/price/status/identity observation.
- `recordedAt` — server-generated.

Indexes: source item/time, live item/time, category/time, recorded time.

**Atomicity:** every effective tracked change writes the `FoodItem` and its
event in one Prisma transaction. A deletion writes its final `deleted`
event (already detached, `foodItemId = null`) before removing the row.
No-op saves and dietary-only changes write **no** event.

## Centralized mutation service

All FoodItem writes flow through
`packages/backend/src/services/food-item/index.ts`
(`createFoodItemWithEvent`, `updateFoodItemWithEvent`,
`bulkUpdateFoodItemsWithEvents`, `deleteFoodItemWithEvent`,
`bulkDeleteFoodItemsWithEvents`). Do not call `prisma.foodItem.create/
update/delete` directly for inventory mutations — that would bypass both
the consistency rules and the ledger.

### Stock/count consistency rules

Implemented in `services/food-item/stock-consistency.ts`
(`resolveStockAndQuantity`) and enforced on every pathway — edit form, row
quick actions, bulk status actions, duplicate-name "Mark In Stock"
recovery, and Shopping List Builder inventory actions.

**Out of Stock is a distribution status, not a count.** Staff mark items
out as a *rationing hold* — e.g. 150 units split across three distribution
days gets marked out after 50 are given out, holding 100 for later.
Zeroing the count on that action would fabricate burn history (150 → 0
reads as 150 consumed in one day), so an out-of-stock item may carry a
positive **held quantity**, or an Unknown one. The rules:

1. An explicit quantity of `0` means fully depleted: it forces Out of
   Stock and clears Limited/Clearance.
2. Moving to Out of Stock keeps the provided quantity (the "Mark Out of
   Stock" prompt's answer) or, when none is provided, the current
   quantity unchanged — never a fabricated `0`. Limited/Clearance are
   still cleared.
3. A positive quantity restores plain In Stock **only when the item was
   out with nothing on hand** (quantity `0` or Unknown) — the
   "type a count to restock" convenience for depleted items. Correcting
   the count of a *held* item (current quantity > 0) does not un-hold it.
4. Quick "Mark In Stock" actions **without a count** resume a held
   quantity as-is; when nothing was on hand they set quantity to `null`
   (Unknown) — never a stale `0`.
5. Unknown quantity (`null`) may coexist with either status.

The "Mark Out of Stock" quick action (Food Item Management rows and the
Shopping List Builder) opens a prompt
(`components/food-item-management/mark-out-of-stock-dialog.tsx`) asking
for the remaining count, prefilled with the current one; blank = Unknown,
`0` = depleted. Bulk "Mark Out of Stock" actions do not prompt — they
keep each item's quantity unchanged.

### The `estimatedQuantity`-presence contract

The API distinguishes "no quantity sent" (quick action) from "quantity
explicitly sent, possibly null" (full form) by key presence in the
`logistics` request block. On the frontend this is protected by naming:
service calls take `logisticsUpdate` (only the add/edit form supplies it),
because quick actions spread whole `FoodItem` objects — which carry a
`logistics` field that must NOT ride along as an observation. See the
comment in `packages/frontend/src/services/food-item/index.ts`.

## API shape

`POST /api/food-items` and `PUT /api/food-items/:id` accept an optional
top-level `logistics` block (`purchasePriceCents`, `unitsPerPurchase`,
`estimatedQuantity`; all already-parsed integers). Responses embed a
`logistics` group on each food item, mirroring `statusFlags` /
`dietaryFlags`. Public inventory endpoints do **not** expose price,
quantity, or history data.

## UI

The Add/Edit Food Item form has four tabs: Basic, Status, Dietary,
**Logistics**. Logistics contains the currency input (blank = Unknown,
`0.00` = Donated/Free), units-per-purchase (≥ 1; `1` shows "Each"),
estimated quantity (blank = Unknown), and a live derived unit-cost line.

## Tests

- `packages/backend/__tests__/features/food-items/logistics-consistency.test.ts`
  — consistency rules, event-dimension flags, payload validation.
- `packages/backend/__tests__/features/food-items/mutation-service.test.ts`
  — event atomicity, no-op suppression, delete-before-remove ordering,
  creation defaults.
- `packages/frontend/src/lib/formatting/currency.test.ts` — string→cents
  parsing (including the `$100 ÷ 50 = $2/unit` spec check).

## V1 non-goals

No "last counted" date, no unchanged-count verification action, no lot /
location / vendor / receipt / expiration / unit-of-measure model. USD only;
whole implicit base units only.
