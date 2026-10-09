-- AlterTable
ALTER TABLE "ServiceEncounterRevision" ADD COLUMN "clientVisitStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "DataImportJob" ADD COLUMN "reviewSummary" JSONB;
ALTER TABLE "DataImportJob" ADD COLUMN "pendingServiceImportId" INTEGER;

-- CreateTable
CREATE TABLE "Link2FeedVisitStagingRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" TEXT NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "sourceClientId" TEXT,
    "recordedAtSerial" REAL NOT NULL,
    "clientVisitStatus" TEXT NOT NULL DEFAULT 'unknown',
    "encounterSnapshotHash" TEXT NOT NULL,
    "recordKind" TEXT NOT NULL,
    "reportedHouseholdCount" INTEGER,
    "reportedPeopleCount" INTEGER,
    "sourceProfileKey" TEXT,
    "profileSnapshotHash" TEXT,
    "birthYear" INTEGER,
    "birthYearEstimated" BOOLEAN,
    "birthYearResponseStatus" TEXT,
    "profileResponses" JSONB NOT NULL DEFAULT '[]',
    "warningCodes" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "Link2FeedVisitStagingRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DataImportJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataImportReviewIssue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" TEXT NOT NULL,
    "sourceRecordKey" TEXT,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "requiresDecision" BOOLEAN NOT NULL DEFAULT false,
    "field" TEXT,
    "safeDetails" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataImportReviewIssue_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DataImportJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataImportReviewDecision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "issueId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "recordKind" TEXT,
    "reportedHouseholdCount" INTEGER,
    "reportedPeopleCount" INTEGER,
    "eventLabel" TEXT,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataImportReviewDecision_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "DataImportReviewIssue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Link2FeedVisitStagingRow_jobId_sourceRecordKey_key" ON "Link2FeedVisitStagingRow"("jobId", "sourceRecordKey");
CREATE INDEX "Link2FeedVisitStagingRow_jobId_serviceDate_idx" ON "Link2FeedVisitStagingRow"("jobId", "serviceDate");
CREATE INDEX "Link2FeedVisitStagingRow_jobId_sourceClientId_idx" ON "Link2FeedVisitStagingRow"("jobId", "sourceClientId");
CREATE UNIQUE INDEX "DataImportReviewIssue_jobId_sourceRecordKey_code_key" ON "DataImportReviewIssue"("jobId", "sourceRecordKey", "code");
CREATE INDEX "DataImportReviewIssue_jobId_severity_idx" ON "DataImportReviewIssue"("jobId", "severity");
CREATE UNIQUE INDEX "DataImportReviewDecision_issueId_revision_key" ON "DataImportReviewDecision"("issueId", "revision");
CREATE INDEX "DataImportReviewDecision_issueId_createdAt_idx" ON "DataImportReviewDecision"("issueId", "createdAt");
