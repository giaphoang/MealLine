-- CreateTable
CREATE TABLE "EncryptionKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyId" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "keyValue" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'api_encryption',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "EncryptionKey_keyId_key" ON "EncryptionKey"("keyId");

-- CreateIndex
CREATE INDEX "EncryptionKey_keyId_idx" ON "EncryptionKey"("keyId");

-- CreateIndex
CREATE INDEX "EncryptionKey_purpose_isActive_idx" ON "EncryptionKey"("purpose", "isActive");
