-- LOTTO queue timing is operational evidence, deliberately separate from
-- formal ServiceEncounterRevision household/visit records.
CREATE TABLE "LottoQueueIntegrationConfig" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
  "baseUrl" TEXT NOT NULL,
  "encryptedToken" TEXT NOT NULL,
  "salt" TEXT NOT NULL,
  "cursor" TEXT,
  "lastSyncedAt" DATETIME,
  "updatedBy" TEXT,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "LottoQueueSyncRun" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "cursorBefore" TEXT,
  "cursorAfter" TEXT,
  "receivedCount" INTEGER NOT NULL DEFAULT 0,
  "insertedCount" INTEGER NOT NULL DEFAULT 0,
  "unchangedCount" INTEGER NOT NULL DEFAULT 0,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedBy" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME
);

CREATE TABLE "LottoQueueSessionRevision" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "summaryId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "supersedesSummaryId" TEXT,
  "contentHash" TEXT NOT NULL,
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "source" TEXT NOT NULL,
  "serviceDate" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "sessionStartedAt" DATETIME,
  "closedAt" DATETIME NOT NULL,
  "recordedAt" DATETIME NOT NULL,
  "mode" TEXT NOT NULL,
  "timingCoverage" TEXT NOT NULL,
  "operatingWindow" JSONB,
  "configuredCount" INTEGER NOT NULL,
  "issuedCount" INTEGER NOT NULL,
  "calledCount" INTEGER NOT NULL,
  "unclaimedCount" INTEGER NOT NULL,
  "returnedCount" INTEGER NOT NULL,
  "notCalledCount" INTEGER NOT NULL,
  "unpairedCallCount" INTEGER NOT NULL,
  "allIssuedTicketsCalled" BOOLEAN NOT NULL,
  "switchedRandomToSequential" BOOLEAN NOT NULL,
  "appendedTickets" BOOLEAN NOT NULL,
  "initialDisposition" TEXT NOT NULL DEFAULT 'needs_review',
  "rulesVersion" INTEGER NOT NULL DEFAULT 1,
  "facts" JSONB NOT NULL,
  "importId" INTEGER,
  "syncRunId" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LottoQueueSessionRevision_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ServiceImport" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LottoQueueSessionRevision_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "LottoQueueSyncRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "LottoQueueTicketObservation" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "sessionRevisionId" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "batchSequence" INTEGER,
  "issuedAt" DATETIME,
  "firstCalledAt" DATETIME,
  "outcome" TEXT NOT NULL,
  CONSTRAINT "LottoQueueTicketObservation_sessionRevisionId_fkey" FOREIGN KEY ("sessionRevisionId") REFERENCES "LottoQueueSessionRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LottoQueueQualityIssue" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "sessionRevisionId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "safeDetails" JSONB NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LottoQueueQualityIssue_sessionRevisionId_fkey" FOREIGN KEY ("sessionRevisionId") REFERENCES "LottoQueueSessionRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LottoQueueSessionResolution" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "sessionId" TEXT NOT NULL,
  "sourceRevision" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL,
  "disposition" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "LottoQueueSessionRevision_summaryId_key" ON "LottoQueueSessionRevision"("summaryId");
CREATE UNIQUE INDEX "LottoQueueSessionRevision_sessionId_revision_key" ON "LottoQueueSessionRevision"("sessionId", "revision");
CREATE UNIQUE INDEX "LottoQueueSessionRevision_sessionId_contentHash_key" ON "LottoQueueSessionRevision"("sessionId", "contentHash");
CREATE INDEX "LottoQueueSessionRevision_sessionId_isCurrent_idx" ON "LottoQueueSessionRevision"("sessionId", "isCurrent");
CREATE INDEX "LottoQueueSessionRevision_serviceDate_isCurrent_idx" ON "LottoQueueSessionRevision"("serviceDate", "isCurrent");
CREATE INDEX "LottoQueueSessionRevision_initialDisposition_serviceDate_idx" ON "LottoQueueSessionRevision"("initialDisposition", "serviceDate");
CREATE UNIQUE INDEX "LottoQueueTicketObservation_sessionRevisionId_sequence_key" ON "LottoQueueTicketObservation"("sessionRevisionId", "sequence");
CREATE INDEX "LottoQueueTicketObservation_firstCalledAt_idx" ON "LottoQueueTicketObservation"("firstCalledAt");
CREATE UNIQUE INDEX "LottoQueueQualityIssue_sessionRevisionId_code_key" ON "LottoQueueQualityIssue"("sessionRevisionId", "code");
CREATE INDEX "LottoQueueQualityIssue_code_severity_idx" ON "LottoQueueQualityIssue"("code", "severity");
CREATE UNIQUE INDEX "LottoQueueSessionResolution_sessionId_revision_key" ON "LottoQueueSessionResolution"("sessionId", "revision");
CREATE INDEX "LottoQueueSessionResolution_sessionId_sourceRevision_createdAt_idx" ON "LottoQueueSessionResolution"("sessionId", "sourceRevision", "createdAt");
CREATE INDEX "LottoQueueSyncRun_startedAt_idx" ON "LottoQueueSyncRun"("startedAt");
CREATE INDEX "LottoQueueSyncRun_status_startedAt_idx" ON "LottoQueueSyncRun"("status", "startedAt");
