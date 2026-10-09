-- Add safe SIMC encounter provenance and household composition.
ALTER TABLE "ServiceEncounterRevision" ADD COLUMN "sourceEventId" TEXT;
ALTER TABLE "ServiceEncounterRevision" ADD COLUMN "sourceRecordedAt" TEXT;
ALTER TABLE "ServiceEncounterRevision" ADD COLUMN "numberAdults" INTEGER;
ALTER TABLE "ServiceEncounterRevision" ADD COLUMN "numberChildren" INTEGER;
ALTER TABLE "ServiceEncounterRevision" ADD COLUMN "numberSeniors" INTEGER;
ALTER TABLE "ServiceEncounterRevision" ADD COLUMN "numberUnknownAge" INTEGER;

CREATE TABLE "ServicePerson" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "sourcePersonId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ServiceEncounterPerson" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "encounterRevisionId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "isHeadOfHousehold" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ServiceEncounterPerson_encounterRevisionId_fkey" FOREIGN KEY ("encounterRevisionId") REFERENCES "ServiceEncounterRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceEncounterPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "ServicePerson" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ServicePersonProfileRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
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
    CONSTRAINT "ServicePersonProfileRevision_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ServiceImport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServicePersonProfileRevision_personId_fkey" FOREIGN KEY ("personId") REFERENCES "ServicePerson" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ServicePersonProfileResponse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profileRevisionId" INTEGER NOT NULL,
    "dimension" TEXT NOT NULL,
    "responseStatus" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "ServicePersonProfileResponse_profileRevisionId_fkey" FOREIGN KEY ("profileRevisionId") REFERENCES "ServicePersonProfileRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "SimcVisitStagingRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" TEXT NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "sourceHouseholdId" TEXT,
    "sourceEventId" TEXT,
    "sourceRecordedAt" TEXT,
    "encounterSnapshotHash" TEXT NOT NULL,
    "recordKind" TEXT NOT NULL,
    "reportedHouseholdCount" INTEGER,
    "reportedPeopleCount" INTEGER,
    "numberAdults" INTEGER,
    "numberChildren" INTEGER,
    "numberSeniors" INTEGER,
    "numberUnknownAge" INTEGER,
    "sourceProfileKey" TEXT,
    "profileSnapshotHash" TEXT,
    "profileResponses" JSONB NOT NULL DEFAULT '[]',
    "warningCodes" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "SimcVisitStagingRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DataImportJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SimcPersonStagingRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" TEXT NOT NULL,
    "sourcePersonId" TEXT NOT NULL,
    "sourceProfileKey" TEXT NOT NULL,
    "observedDate" TEXT NOT NULL,
    "profileSnapshotHash" TEXT NOT NULL,
    "birthYear" INTEGER,
    "birthYearEstimated" BOOLEAN,
    "birthYearResponseStatus" TEXT NOT NULL,
    "profileResponses" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "SimcPersonStagingRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DataImportJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SimcEncounterPersonStagingRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" TEXT NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "sourcePersonId" TEXT NOT NULL,
    "isHeadOfHousehold" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SimcEncounterPersonStagingRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DataImportJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ServicePerson_source_sourcePersonId_key" ON "ServicePerson"("source", "sourcePersonId");
CREATE INDEX "ServicePerson_source_idx" ON "ServicePerson"("source");
CREATE UNIQUE INDEX "ServiceEncounterPerson_encounterRevisionId_personId_key" ON "ServiceEncounterPerson"("encounterRevisionId", "personId");
CREATE INDEX "ServiceEncounterPerson_personId_encounterRevisionId_idx" ON "ServiceEncounterPerson"("personId", "encounterRevisionId");
CREATE UNIQUE INDEX "ServicePersonProfileRevision_source_sourceProfileKey_revision_key" ON "ServicePersonProfileRevision"("source", "sourceProfileKey", "revision");
CREATE INDEX "ServicePersonProfileRevision_source_sourceProfileKey_isCurrent_idx" ON "ServicePersonProfileRevision"("source", "sourceProfileKey", "isCurrent");
CREATE INDEX "ServicePersonProfileRevision_personId_observedDate_isCurrent_idx" ON "ServicePersonProfileRevision"("personId", "observedDate", "isCurrent");
CREATE INDEX "ServicePersonProfileRevision_importId_idx" ON "ServicePersonProfileRevision"("importId");
CREATE UNIQUE INDEX "ServicePersonProfileResponse_profileRevisionId_dimension_key" ON "ServicePersonProfileResponse"("profileRevisionId", "dimension");
CREATE INDEX "ServicePersonProfileResponse_dimension_responseStatus_idx" ON "ServicePersonProfileResponse"("dimension", "responseStatus");
CREATE UNIQUE INDEX "SimcVisitStagingRow_jobId_sourceRecordKey_key" ON "SimcVisitStagingRow"("jobId", "sourceRecordKey");
CREATE INDEX "SimcVisitStagingRow_jobId_serviceDate_idx" ON "SimcVisitStagingRow"("jobId", "serviceDate");
CREATE INDEX "SimcVisitStagingRow_jobId_sourceHouseholdId_idx" ON "SimcVisitStagingRow"("jobId", "sourceHouseholdId");
CREATE UNIQUE INDEX "SimcPersonStagingRow_jobId_sourcePersonId_key" ON "SimcPersonStagingRow"("jobId", "sourcePersonId");
CREATE INDEX "SimcPersonStagingRow_jobId_sourceProfileKey_idx" ON "SimcPersonStagingRow"("jobId", "sourceProfileKey");
CREATE UNIQUE INDEX "SimcEncounterPersonStagingRow_jobId_sourceRecordKey_sourcePersonId_key" ON "SimcEncounterPersonStagingRow"("jobId", "sourceRecordKey", "sourcePersonId");
CREATE INDEX "SimcEncounterPersonStagingRow_jobId_sourcePersonId_idx" ON "SimcEncounterPersonStagingRow"("jobId", "sourcePersonId");
