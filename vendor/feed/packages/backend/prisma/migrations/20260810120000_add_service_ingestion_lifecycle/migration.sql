-- CreateTable
CREATE TABLE "ServiceQualityIssue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRecordKey" TEXT,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "field" TEXT,
    "safeDetails" JSONB NOT NULL DEFAULT '{}',
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceQualityIssue_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ServiceImport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceQualityIssueDecision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "issueId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceQualityIssueDecision_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ServiceQualityIssue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "ServiceSourceResolution" ADD COLUMN "qualityIssueId" INTEGER REFERENCES "ServiceQualityIssue" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ServiceCapacityPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ServiceCapacityPlanRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT NOT NULL,
    "effectiveStartDate" TEXT NOT NULL,
    "effectiveEndDate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceCapacityPlanRevision_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServiceCapacityPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceCapacityTarget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planRevisionId" INTEGER NOT NULL,
    "targetKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "metricId" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ServiceCapacityTarget_planRevisionId_fkey" FOREIGN KEY ("planRevisionId") REFERENCES "ServiceCapacityPlanRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceCapacityTarget_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "ServiceMetricDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataImportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT,
    "domain" TEXT,
    "source" TEXT,
    "datasetKind" TEXT,
    "status" TEXT NOT NULL DEFAULT 'staging',
    "fileHash" TEXT,
    "fileSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "stagedFileKey" TEXT,
    "recognizedFieldCount" INTEGER NOT NULL DEFAULT 0,
    "ignoredFieldCount" INTEGER NOT NULL DEFAULT 0,
    "totalRows" INTEGER,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "unresolvedIssueCount" INTEGER NOT NULL DEFAULT 0,
    "activationOutcome" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdBy" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DataImportJobEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "totalRows" INTEGER,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "safeMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataImportJobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DataImportJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ServiceSourceResolution_qualityIssueId_idx" ON "ServiceSourceResolution"("qualityIssueId");
CREATE INDEX "ServiceQualityIssue_importId_detectedAt_idx" ON "ServiceQualityIssue"("importId", "detectedAt");
CREATE INDEX "ServiceQualityIssue_source_sourceRecordKey_idx" ON "ServiceQualityIssue"("source", "sourceRecordKey");
CREATE INDEX "ServiceQualityIssue_code_severity_idx" ON "ServiceQualityIssue"("code", "severity");
CREATE UNIQUE INDEX "ServiceQualityIssueDecision_issueId_revision_key" ON "ServiceQualityIssueDecision"("issueId", "revision");
CREATE INDEX "ServiceQualityIssueDecision_issueId_createdAt_idx" ON "ServiceQualityIssueDecision"("issueId", "createdAt");
CREATE UNIQUE INDEX "ServiceCapacityPlan_planKey_key" ON "ServiceCapacityPlan"("planKey");
CREATE UNIQUE INDEX "ServiceCapacityPlanRevision_planId_revision_key" ON "ServiceCapacityPlanRevision"("planId", "revision");
CREATE INDEX "ServiceCapacityPlanRevision_planId_effectiveStartDate_effectiveEndDate_idx" ON "ServiceCapacityPlanRevision"("planId", "effectiveStartDate", "effectiveEndDate");
CREATE UNIQUE INDEX "ServiceCapacityTarget_planRevisionId_targetKey_key" ON "ServiceCapacityTarget"("planRevisionId", "targetKey");
CREATE INDEX "ServiceCapacityTarget_metricId_idx" ON "ServiceCapacityTarget"("metricId");
CREATE INDEX "DataImportJob_status_updatedAt_idx" ON "DataImportJob"("status", "updatedAt");
CREATE INDEX "DataImportJob_fileHash_idx" ON "DataImportJob"("fileHash");
CREATE INDEX "DataImportJob_expiresAt_idx" ON "DataImportJob"("expiresAt");
CREATE UNIQUE INDEX "DataImportJobEvent_jobId_sequence_key" ON "DataImportJobEvent"("jobId", "sequence");
CREATE INDEX "DataImportJobEvent_jobId_createdAt_idx" ON "DataImportJobEvent"("jobId", "createdAt");
