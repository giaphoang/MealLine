-- Preserve WTH Tracking provenance on durable operational observations.
ALTER TABLE "ServiceMetricObservationRevision" ADD COLUMN "sourceMetricLabel" TEXT;
ALTER TABLE "ServiceMetricObservationRevision" ADD COLUMN "sourceSheet" TEXT;
ALTER TABLE "ServiceMetricObservationRevision" ADD COLUMN "sourceCell" TEXT;

-- Normalized, transient review rows for the canonical WTH long-form export.
CREATE TABLE "WthTrackingStagingRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" TEXT NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "metricId" INTEGER NOT NULL,
    "definitionRevisionId" INTEGER NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "sourceMetricLabel" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "countValue" INTEGER,
    "booleanValue" BOOLEAN,
    "timeValue" TEXT,
    "sourceSheet" TEXT NOT NULL,
    "sourceCell" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "warningCodes" JSONB NOT NULL DEFAULT [],
    CONSTRAINT "WthTrackingStagingRow_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "DataImportJob" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WthTrackingStagingRow_jobId_sourceRecordKey_key"
ON "WthTrackingStagingRow"("jobId", "sourceRecordKey");

CREATE INDEX "WthTrackingStagingRow_jobId_serviceDate_idx"
ON "WthTrackingStagingRow"("jobId", "serviceDate");

CREATE INDEX "WthTrackingStagingRow_jobId_metricKey_idx"
ON "WthTrackingStagingRow"("jobId", "metricKey");
