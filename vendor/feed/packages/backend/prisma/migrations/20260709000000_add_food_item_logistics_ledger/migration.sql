-- Logistics foundation (docs/reports/logistics.md §1): current logistics
-- fields on FoodItem plus the append-only FoodItemInventoryEvent ledger.
-- Additive and non-destructive.

-- AlterTable: existing prices become Unknown (NULL) and units-per-purchase
-- become 1 via the column defaults.
ALTER TABLE "FoodItem" ADD COLUMN "purchasePriceCents" INTEGER;
ALTER TABLE "FoodItem" ADD COLUMN "unitsPerPurchase" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "FoodItem" ADD COLUMN "estimatedQuantity" INTEGER;

-- Existing out-of-stock items have a known quantity of zero. Existing
-- in-stock quantities stay Unknown (NULL).
UPDATE "FoodItem" SET "estimatedQuantity" = 0 WHERE "isInStock" = false;

-- CreateTable
CREATE TABLE "FoodItemInventoryEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "foodItemId" INTEGER,
    "sourceFoodItemId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "categoryName" TEXT NOT NULL,
    "isInStock" BOOLEAN NOT NULL,
    "isLimited" BOOLEAN NOT NULL,
    "isClearance" BOOLEAN NOT NULL,
    "purchasePriceCents" INTEGER,
    "unitsPerPurchase" INTEGER NOT NULL,
    "estimatedQuantity" INTEGER,
    "eventKind" TEXT NOT NULL,
    "recordsQuantity" BOOLEAN NOT NULL DEFAULT false,
    "recordsPrice" BOOLEAN NOT NULL DEFAULT false,
    "recordsStatus" BOOLEAN NOT NULL DEFAULT false,
    "recordsIdentity" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodItemInventoryEvent_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FoodItemInventoryEvent_sourceFoodItemId_recordedAt_idx" ON "FoodItemInventoryEvent"("sourceFoodItemId", "recordedAt");
CREATE INDEX "FoodItemInventoryEvent_foodItemId_recordedAt_idx" ON "FoodItemInventoryEvent"("foodItemId", "recordedAt");
CREATE INDEX "FoodItemInventoryEvent_categoryId_recordedAt_idx" ON "FoodItemInventoryEvent"("categoryId", "recordedAt");
CREATE INDEX "FoodItemInventoryEvent_recordedAt_idx" ON "FoodItemInventoryEvent"("recordedAt");

-- One migration-baseline event per existing item. Historical reports treat
-- all time before this event as untracked rather than inventing history.
-- recordedAt is written as a millisecond epoch integer to match how the
-- Prisma client stores DateTime in SQLite; a DATETIME-text value here
-- would sort/filter incorrectly against client-written rows (SQLite
-- orders every INTEGER before every TEXT).
INSERT INTO "FoodItemInventoryEvent" (
    "foodItemId", "sourceFoodItemId", "itemName", "categoryId", "categoryName",
    "isInStock", "isLimited", "isClearance",
    "purchasePriceCents", "unitsPerPurchase", "estimatedQuantity",
    "eventKind", "recordsQuantity", "recordsPrice", "recordsStatus", "recordsIdentity",
    "recordedAt"
)
SELECT
    f."id", f."id", f."name", f."categoryId", c."name",
    f."isInStock", f."isLimited", f."isClearance",
    f."purchasePriceCents", f."unitsPerPurchase", f."estimatedQuantity",
    'migration_baseline', true, true, true, true,
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM "FoodItem" f
JOIN "Category" c ON c."id" = f."categoryId";
