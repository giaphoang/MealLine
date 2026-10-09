-- Preserve the organization schedule as an append-only effective-dated
-- baseline, then replace the mutable singleton. The baseline intentionally
-- predates FEED history so previously configured service hours continue to
-- interpret the existing operational ledger.

CREATE TABLE "OperatingHoursRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "effectiveDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "hours" JSONB NOT NULL,
    "revisionKind" TEXT NOT NULL DEFAULT 'updated',
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "OperatingHoursRevision" (
    "effectiveDate", "timezone", "hours", "revisionKind", "recordedAt"
)
SELECT
    '1970-01-01', "timezone", "hours", 'migration_baseline', "updatedAt"
FROM "OperatingHoursSetting"
WHERE "id" = 1;

DROP TABLE "OperatingHoursSetting";

CREATE INDEX "OperatingHoursRevision_effectiveDate_recordedAt_idx"
ON "OperatingHoursRevision"("effectiveDate", "recordedAt");
