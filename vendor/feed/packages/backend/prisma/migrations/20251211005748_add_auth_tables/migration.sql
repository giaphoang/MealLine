-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "emailVerified" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OtpFailure" (
    "email" TEXT NOT NULL PRIMARY KEY,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastRequest" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "VerificationToken_identifier_idx" ON "VerificationToken"("identifier");

-- CreateIndex
CREATE INDEX "VerificationToken_expires_idx" ON "VerificationToken"("expires");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "OtpFailure_email_idx" ON "OtpFailure"("email");

-- CreateIndex
CREATE INDEX "OtpFailure_lockedUntil_idx" ON "OtpFailure"("lockedUntil");
