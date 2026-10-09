ALTER TABLE "NourishIntake" ADD COLUMN "clientId" TEXT REFERENCES "NourishClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NourishIntake" ADD COLUMN "reviewHold" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "NourishClient" (
  "id" TEXT NOT NULL PRIMARY KEY, "reference" TEXT NOT NULL, "profile" JSONB NOT NULL DEFAULT '{}',
  "phone" TEXT, "phoneVerifiedAt" DATETIME, "version" INTEGER NOT NULL DEFAULT 1,
  "consent" JSONB NOT NULL DEFAULT '{"enabled":false,"channel":"none","at":""}', "mergedIntoId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "NourishClient_reference_key" ON "NourishClient"("reference");
CREATE INDEX "NourishClient_phone_idx" ON "NourishClient"("phone");
CREATE INDEX "NourishClient_createdAt_idx" ON "NourishClient"("createdAt");
CREATE INDEX "NourishIntake_clientId_createdAt_idx" ON "NourishIntake"("clientId", "createdAt");
CREATE TABLE "NourishClientRevision" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "clientId" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "profile" JSONB NOT NULL, "consent" JSONB NOT NULL, "actor" TEXT NOT NULL, "callId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("clientId") REFERENCES "NourishClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NourishClientRevision_clientId_version_key" ON "NourishClientRevision"("clientId", "version");
CREATE TABLE "NourishPhoneCall" (
  "id" TEXT NOT NULL PRIMARY KEY, "clientId" TEXT, "callSid" TEXT, "caseNumber" TEXT,
  "language" TEXT NOT NULL DEFAULT 'en', "status" TEXT NOT NULL DEFAULT 'draft', "profile" JSONB NOT NULL DEFAULT '{}',
  "summary" TEXT NOT NULL DEFAULT '', "transcript" JSONB NOT NULL DEFAULT '[]', "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("clientId") REFERENCES "NourishClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "NourishPhoneCall_clientId_createdAt_idx" ON "NourishPhoneCall"("clientId", "createdAt");
CREATE INDEX "NourishPhoneCall_status_idx" ON "NourishPhoneCall"("status");
CREATE TABLE "NourishChangeRequest" (
  "id" TEXT NOT NULL PRIMARY KEY, "clientId" TEXT, "intakeId" TEXT, "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "patch" JSONB NOT NULL DEFAULT '{}', "reason" TEXT NOT NULL,
  "decisionNotes" TEXT, "processedBy" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("clientId") REFERENCES "NourishClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("intakeId") REFERENCES "NourishIntake"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "NourishChangeRequest_status_createdAt_idx" ON "NourishChangeRequest"("status", "createdAt");
CREATE TABLE "NourishAgentReceipt" ("id" TEXT NOT NULL PRIMARY KEY, "hash" TEXT NOT NULL, "result" JSONB NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "NourishDeliveryEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "eventId" TEXT NOT NULL, "clientId" TEXT NOT NULL,
  "intakeId" TEXT, "kind" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("clientId") REFERENCES "NourishClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NourishDeliveryEvent_eventId_key" ON "NourishDeliveryEvent"("eventId");
CREATE INDEX "NourishDeliveryEvent_clientId_id_idx" ON "NourishDeliveryEvent"("clientId", "id");
