-- Imported WTH observations seed the same living metric/day facts later edited
-- through the native Service Log. A cleared revision prevents import lifecycle
-- operations from resurrecting a value staff intentionally removed.
ALTER TABLE "ServiceMetricObservationRevision"
ADD COLUMN "recordState" TEXT NOT NULL DEFAULT 'recorded';

-- Resolve any pre-migration overlap deterministically. A native FEED revision
-- represents a later operational decision and wins over an imported seed;
-- otherwise the newest revision/id wins.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "metricId", "serviceDate"
      ORDER BY
        CASE WHEN "source" = 'feed_service_log' THEN 1 ELSE 0 END DESC,
        "revision" DESC,
        "recordedAt" DESC,
        "id" DESC
    ) AS "position"
  FROM "ServiceMetricObservationRevision"
  WHERE "isCurrent" = 1
)
UPDATE "ServiceMetricObservationRevision"
SET "isCurrent" = 0
WHERE "id" IN (SELECT "id" FROM ranked WHERE "position" > 1);

-- SQLite partial indexes enforce one current organization fact without
-- preventing the table from retaining any number of historical revisions.
CREATE UNIQUE INDEX "ServiceMetricObservationRevision_current_metric_date_key"
ON "ServiceMetricObservationRevision"("metricId", "serviceDate")
WHERE "isCurrent" = 1;
