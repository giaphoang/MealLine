-- CreateTable
CREATE TABLE "ServiceImport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "datasetKind" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "rowCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "rangeStart" TEXT,
    "rangeEnd" TEXT,
    "importedBy" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolledBackBy" TEXT,
    "rolledBackAt" DATETIME,
    "restoredBy" TEXT,
    "restoredAt" DATETIME
);

-- CreateTable
CREATE TABLE "ServiceClient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "sourceClientId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ServiceEncounterRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importId" INTEGER NOT NULL,
    "clientId" INTEGER,
    "source" TEXT NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "recordKind" TEXT NOT NULL,
    "reportedHouseholdCount" INTEGER,
    "reportedPeopleCount" INTEGER,
    "warningCodes" JSONB NOT NULL DEFAULT '[]',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceEncounterRevision_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ServiceImport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceEncounterRevision_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ServiceClient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceClientProfileRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "encounterRevisionId" INTEGER,
    "source" TEXT NOT NULL,
    "sourceProfileKey" TEXT NOT NULL,
    "observedDate" TEXT,
    "revision" INTEGER NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "birthYear" INTEGER,
    "birthYearEstimated" BOOLEAN,
    "birthYearResponseStatus" TEXT NOT NULL DEFAULT 'not_provided',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceClientProfileRevision_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ServiceImport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceClientProfileRevision_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ServiceClient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceClientProfileRevision_encounterRevisionId_fkey" FOREIGN KEY ("encounterRevisionId") REFERENCES "ServiceEncounterRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceClientProfileResponse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profileRevisionId" INTEGER NOT NULL,
    "dimension" TEXT NOT NULL,
    "responseStatus" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "ServiceClientProfileResponse_profileRevisionId_fkey" FOREIGN KEY ("profileRevisionId") REFERENCES "ServiceClientProfileRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceSourceResolution" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "recordKind" TEXT,
    "reportedHouseholdCount" INTEGER,
    "reportedPeopleCount" INTEGER,
    "eventLabel" TEXT,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ServiceMetricDefinition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "metricKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ServiceMetricDefinitionRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "metricId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "valueType" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "semanticRole" TEXT NOT NULL,
    "contributesToOperationalTotal" BOOLEAN NOT NULL DEFAULT false,
    "capacityTarget" INTEGER,
    "effectiveStartDate" TEXT NOT NULL,
    "effectiveEndDate" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceMetricDefinitionRevision_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "ServiceMetricDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceMetricObservationRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "metricId" INTEGER NOT NULL,
    "definitionRevisionId" INTEGER NOT NULL,
    "importId" INTEGER,
    "source" TEXT NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "countValue" INTEGER,
    "booleanValue" BOOLEAN,
    "timeValue" TEXT,
    "entryState" TEXT NOT NULL DEFAULT 'finalized',
    "warningCodes" JSONB NOT NULL DEFAULT '[]',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "recordedBy" TEXT,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceMetricObservationRevision_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "ServiceMetricDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceMetricObservationRevision_definitionRevisionId_fkey" FOREIGN KEY ("definitionRevisionId") REFERENCES "ServiceMetricDefinitionRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceMetricObservationRevision_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ServiceImport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceDayStatusRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serviceDate" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "pantryStatus" TEXT NOT NULL,
    "entryState" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "recordedBy" TEXT,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ServiceImport_source_datasetKind_importedAt_idx" ON "ServiceImport"("source", "datasetKind", "importedAt");
CREATE INDEX "ServiceImport_fileHash_idx" ON "ServiceImport"("fileHash");
CREATE INDEX "ServiceImport_status_importedAt_idx" ON "ServiceImport"("status", "importedAt");
CREATE UNIQUE INDEX "ServiceClient_source_sourceClientId_key" ON "ServiceClient"("source", "sourceClientId");
CREATE INDEX "ServiceClient_source_idx" ON "ServiceClient"("source");
CREATE UNIQUE INDEX "ServiceEncounterRevision_source_sourceRecordKey_revision_key" ON "ServiceEncounterRevision"("source", "sourceRecordKey", "revision");
CREATE INDEX "ServiceEncounterRevision_source_sourceRecordKey_isCurrent_idx" ON "ServiceEncounterRevision"("source", "sourceRecordKey", "isCurrent");
CREATE INDEX "ServiceEncounterRevision_source_serviceDate_isCurrent_idx" ON "ServiceEncounterRevision"("source", "serviceDate", "isCurrent");
CREATE INDEX "ServiceEncounterRevision_importId_idx" ON "ServiceEncounterRevision"("importId");
CREATE INDEX "ServiceEncounterRevision_clientId_serviceDate_idx" ON "ServiceEncounterRevision"("clientId", "serviceDate");
CREATE INDEX "ServiceEncounterRevision_snapshotHash_idx" ON "ServiceEncounterRevision"("snapshotHash");
CREATE INDEX "ServiceEncounterRevision_recordKind_idx" ON "ServiceEncounterRevision"("recordKind");
CREATE UNIQUE INDEX "ServiceClientProfileRevision_source_sourceProfileKey_revision_key" ON "ServiceClientProfileRevision"("source", "sourceProfileKey", "revision");
CREATE INDEX "ServiceClientProfileRevision_source_sourceProfileKey_isCurrent_idx" ON "ServiceClientProfileRevision"("source", "sourceProfileKey", "isCurrent");
CREATE INDEX "ServiceClientProfileRevision_clientId_observedDate_isCurrent_idx" ON "ServiceClientProfileRevision"("clientId", "observedDate", "isCurrent");
CREATE INDEX "ServiceClientProfileRevision_importId_idx" ON "ServiceClientProfileRevision"("importId");
CREATE INDEX "ServiceClientProfileRevision_encounterRevisionId_idx" ON "ServiceClientProfileRevision"("encounterRevisionId");
CREATE UNIQUE INDEX "ServiceClientProfileResponse_profileRevisionId_dimension_key" ON "ServiceClientProfileResponse"("profileRevisionId", "dimension");
CREATE INDEX "ServiceClientProfileResponse_dimension_responseStatus_idx" ON "ServiceClientProfileResponse"("dimension", "responseStatus");
CREATE UNIQUE INDEX "ServiceSourceResolution_source_sourceRecordKey_revision_key" ON "ServiceSourceResolution"("source", "sourceRecordKey", "revision");
CREATE INDEX "ServiceSourceResolution_source_sourceRecordKey_createdAt_idx" ON "ServiceSourceResolution"("source", "sourceRecordKey", "createdAt");
CREATE UNIQUE INDEX "ServiceMetricDefinition_metricKey_key" ON "ServiceMetricDefinition"("metricKey");
CREATE UNIQUE INDEX "ServiceMetricDefinitionRevision_metricId_revision_key" ON "ServiceMetricDefinitionRevision"("metricId", "revision");
CREATE INDEX "ServiceMetricDefinitionRevision_metricId_effectiveStartDate_effectiveEndDate_idx" ON "ServiceMetricDefinitionRevision"("metricId", "effectiveStartDate", "effectiveEndDate");
CREATE INDEX "ServiceMetricDefinitionRevision_isActive_displayOrder_idx" ON "ServiceMetricDefinitionRevision"("isActive", "displayOrder");
CREATE UNIQUE INDEX "ServiceMetricObservationRevision_source_sourceRecordKey_revision_key" ON "ServiceMetricObservationRevision"("source", "sourceRecordKey", "revision");
CREATE INDEX "ServiceMetricObservationRevision_metricId_serviceDate_isCurrent_idx" ON "ServiceMetricObservationRevision"("metricId", "serviceDate", "isCurrent");
CREATE INDEX "ServiceMetricObservationRevision_definitionRevisionId_idx" ON "ServiceMetricObservationRevision"("definitionRevisionId");
CREATE INDEX "ServiceMetricObservationRevision_importId_idx" ON "ServiceMetricObservationRevision"("importId");
CREATE INDEX "ServiceMetricObservationRevision_entryState_serviceDate_idx" ON "ServiceMetricObservationRevision"("entryState", "serviceDate");
CREATE INDEX "ServiceMetricObservationRevision_snapshotHash_idx" ON "ServiceMetricObservationRevision"("snapshotHash");
CREATE UNIQUE INDEX "ServiceDayStatusRevision_serviceDate_revision_key" ON "ServiceDayStatusRevision"("serviceDate", "revision");
CREATE INDEX "ServiceDayStatusRevision_serviceDate_isCurrent_idx" ON "ServiceDayStatusRevision"("serviceDate", "isCurrent");
CREATE INDEX "ServiceDayStatusRevision_entryState_serviceDate_idx" ON "ServiceDayStatusRevision"("entryState", "serviceDate");
