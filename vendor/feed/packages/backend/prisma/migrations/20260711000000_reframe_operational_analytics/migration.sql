-- Reframe the logistics prototype as optional Supply annotations and
-- operational availability/rationing history. Prototype values are test data
-- and are intentionally cleared (docs/reports/operational-analytics-design.md).

DROP TABLE "FoodItemInventoryEvent";

ALTER TABLE "FoodItem" DROP COLUMN "purchasePriceCents";
ALTER TABLE "FoodItem" DROP COLUMN "unitsPerPurchase";
ALTER TABLE "FoodItem" ADD COLUMN "supplySource" TEXT;
UPDATE "FoodItem" SET "estimatedQuantity" = NULL;

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
    "limit" INTEGER NOT NULL,
    "limitType" TEXT NOT NULL,
    "estimatedQuantity" INTEGER,
    "supplySource" TEXT,
    "eventKind" TEXT NOT NULL,
    "recordsQuantity" BOOLEAN NOT NULL DEFAULT false,
    "recordsSupply" BOOLEAN NOT NULL DEFAULT false,
    "recordsStatus" BOOLEAN NOT NULL DEFAULT false,
    "recordsLimit" BOOLEAN NOT NULL DEFAULT false,
    "recordsIdentity" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodItemInventoryEvent_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "FoodItemInventoryEvent_sourceFoodItemId_recordedAt_idx" ON "FoodItemInventoryEvent"("sourceFoodItemId", "recordedAt");
CREATE INDEX "FoodItemInventoryEvent_foodItemId_recordedAt_idx" ON "FoodItemInventoryEvent"("foodItemId", "recordedAt");
CREATE INDEX "FoodItemInventoryEvent_categoryId_recordedAt_idx" ON "FoodItemInventoryEvent"("categoryId", "recordedAt");
CREATE INDEX "FoodItemInventoryEvent_recordedAt_idx" ON "FoodItemInventoryEvent"("recordedAt");

CREATE TABLE "CategoryInventoryEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "categoryId" INTEGER,
    "sourceCategoryId" INTEGER NOT NULL,
    "categoryName" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "limitType" TEXT NOT NULL,
    "icon" TEXT,
    "eventKind" TEXT NOT NULL,
    "recordsLimit" BOOLEAN NOT NULL DEFAULT false,
    "recordsIdentity" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoryInventoryEvent_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "CategoryInventoryEvent_sourceCategoryId_recordedAt_idx" ON "CategoryInventoryEvent"("sourceCategoryId", "recordedAt");
CREATE INDEX "CategoryInventoryEvent_categoryId_recordedAt_idx" ON "CategoryInventoryEvent"("categoryId", "recordedAt");
CREATE INDEX "CategoryInventoryEvent_recordedAt_idx" ON "CategoryInventoryEvent"("recordedAt");

INSERT INTO "FoodItemInventoryEvent" (
    "foodItemId", "sourceFoodItemId", "itemName", "categoryId", "categoryName",
    "isInStock", "isLimited", "isClearance", "limit", "limitType",
    "estimatedQuantity", "supplySource", "eventKind", "recordsQuantity",
    "recordsSupply", "recordsStatus", "recordsLimit", "recordsIdentity",
    "recordedAt"
)
SELECT
    f."id", f."id", f."name", f."categoryId", c."name",
    f."isInStock", f."isLimited", f."isClearance", f."limit", f."limitType",
    NULL, NULL, 'migration_baseline', false, false, true, true, true,
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM "FoodItem" f
JOIN "Category" c ON c."id" = f."categoryId";

INSERT INTO "CategoryInventoryEvent" (
    "categoryId", "sourceCategoryId", "categoryName", "limit", "limitType",
    "icon", "eventKind", "recordsLimit", "recordsIdentity", "recordedAt"
)
SELECT
    c."id", c."id", c."name", c."limit", c."limitType", c."icon",
    'migration_baseline', true, true,
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM "Category" c;
