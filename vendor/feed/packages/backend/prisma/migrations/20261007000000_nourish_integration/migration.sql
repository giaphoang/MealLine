-- Additive migration. FEED tables, ledgers, and existing inventory remain intact.
ALTER TABLE "FoodItem" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FoodItem" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'unit';
ALTER TABLE "FoodItem" ADD COLUMN "requiresStove" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FoodItem" ADD COLUMN "requiresFridge" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "NourishIntake" (
  "id" TEXT NOT NULL PRIMARY KEY, "caseNumber" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en' CHECK ("language" IN ('en','vi','es')),
  "phone" TEXT, "addressRaw" TEXT, "addressStreet" TEXT, "addressCity" TEXT, "addressZip" TEXT,
  "householdSize" INTEGER, "dietaryAvoid" JSONB NOT NULL DEFAULT '[]', "dietaryNotes" TEXT,
  "hasStove" BOOLEAN, "hasFridge" BOOLEAN, "availabilityRaw" TEXT,
  "availabilityDays" JSONB NOT NULL DEFAULT '[]', "availabilityTimes" JSONB NOT NULL DEFAULT '[]',
  "contactPreference" TEXT, "accommodation" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','matched','assigned','delivered','cancelled')),
  "transcript" JSONB NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "NourishIntake_caseNumber_key" ON "NourishIntake"("caseNumber");
CREATE INDEX "NourishIntake_status_createdAt_idx" ON "NourishIntake"("status", "createdAt");

CREATE TABLE "NourishBasket" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "intakeId" TEXT, "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','approved','packed','delivered')),
  "items" JSONB NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "NourishBasket_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "NourishIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "NourishBasket_intakeId_idx" ON "NourishBasket"("intakeId");
CREATE INDEX "NourishBasket_status_idx" ON "NourishBasket"("status");

CREATE TABLE "NourishVolunteer" (
  "id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL, "name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'volunteer', "passwordHash" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "NourishVolunteer_email_key" ON "NourishVolunteer"("email");

CREATE TABLE "NourishDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY, "shoppingListId" INTEGER, "intakeId" TEXT, "assignedTo" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','assigned','in_transit','delivered','failed')),
  "scheduledFor" DATETIME, "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "NourishDelivery_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "NourishBasket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NourishDelivery_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "NourishIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "NourishDelivery_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "NourishVolunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "NourishDelivery_status_idx" ON "NourishDelivery"("status");
CREATE INDEX "NourishDelivery_assignedTo_idx" ON "NourishDelivery"("assignedTo");
