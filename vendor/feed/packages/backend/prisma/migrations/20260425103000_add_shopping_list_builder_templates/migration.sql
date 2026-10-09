-- CreateTable
CREATE TABLE "ShoppingListBuilderTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateData" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ShoppingListBuilderTemplate_ownerId_idx" ON "ShoppingListBuilderTemplate"("ownerId");

-- CreateIndex
CREATE INDEX "ShoppingListBuilderTemplate_updatedAt_idx" ON "ShoppingListBuilderTemplate"("updatedAt");
