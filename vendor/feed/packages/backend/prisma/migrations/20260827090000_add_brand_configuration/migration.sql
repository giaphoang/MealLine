CREATE TABLE "BrandConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payload" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "BrandConfiguration_one_active_key"
ON "BrandConfiguration" ("isActive")
WHERE "isActive" = true;

CREATE TABLE "BrandAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "dataBase64" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
