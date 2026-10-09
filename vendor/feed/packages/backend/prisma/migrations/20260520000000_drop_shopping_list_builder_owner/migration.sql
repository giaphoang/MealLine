-- Shopping List Builder templates and saved components are now part of the
-- single org-wide shared data environment (see ISSUES.md #31). Drop the
-- per-user `ownerId` partitioning column from both tables, preserving all
-- existing rows so previously per-user content survives as shared content.

PRAGMA foreign_keys=OFF;

-- ShoppingListBuilderComponent: drop ownerId
CREATE TABLE "new_ShoppingListBuilderComponent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "componentData" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ShoppingListBuilderComponent" ("id", "name", "componentType", "componentData", "createdAt", "updatedAt")
SELECT "id", "name", "componentType", "componentData", "createdAt", "updatedAt" FROM "ShoppingListBuilderComponent";
DROP TABLE "ShoppingListBuilderComponent";
ALTER TABLE "new_ShoppingListBuilderComponent" RENAME TO "ShoppingListBuilderComponent";
CREATE INDEX "ShoppingListBuilderComponent_componentType_idx" ON "ShoppingListBuilderComponent"("componentType");
CREATE INDEX "ShoppingListBuilderComponent_updatedAt_idx" ON "ShoppingListBuilderComponent"("updatedAt");

-- ShoppingListBuilderTemplate: drop ownerId
CREATE TABLE "new_ShoppingListBuilderTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "templateData" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ShoppingListBuilderTemplate" ("id", "name", "templateData", "createdAt", "updatedAt")
SELECT "id", "name", "templateData", "createdAt", "updatedAt" FROM "ShoppingListBuilderTemplate";
DROP TABLE "ShoppingListBuilderTemplate";
ALTER TABLE "new_ShoppingListBuilderTemplate" RENAME TO "ShoppingListBuilderTemplate";
CREATE INDEX "ShoppingListBuilderTemplate_updatedAt_idx" ON "ShoppingListBuilderTemplate"("updatedAt");

PRAGMA foreign_keys=ON;
