-- CreateTable
CREATE TABLE "ShoppingListBuilderComponent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "componentData" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ShoppingListBuilderComponent_ownerId_idx" ON "ShoppingListBuilderComponent"("ownerId");

-- CreateIndex
CREATE INDEX "ShoppingListBuilderComponent_componentType_idx" ON "ShoppingListBuilderComponent"("componentType");

-- CreateIndex
CREATE INDEX "ShoppingListBuilderComponent_updatedAt_idx" ON "ShoppingListBuilderComponent"("updatedAt");
