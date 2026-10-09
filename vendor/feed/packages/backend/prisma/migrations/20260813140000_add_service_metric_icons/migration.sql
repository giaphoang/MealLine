ALTER TABLE "ServiceMetricDefinitionRevision"
ADD COLUMN "iconName" TEXT NOT NULL DEFAULT 'package';

UPDATE "ServiceMetricDefinitionRevision"
SET "iconName" = CASE (
  SELECT "metricKey"
  FROM "ServiceMetricDefinition"
  WHERE "ServiceMetricDefinition"."id" = "ServiceMetricDefinitionRevision"."metricId"
)
  WHEN 'shopping_visits' THEN 'shopping-basket'
  WHEN 'long_lists' THEN 'scroll-text'
  WHEN 'premade_bags' THEN 'paper-bag'
  WHEN 'emergency_bags' THEN 'heart-pulse'
  WHEN 'turned_away' THEN 'ban'
  WHEN 'capacity_reached_time' THEN 'circle-parking'
  WHEN 'camping_gear_requests' THEN 'tent-tree'
  ELSE "iconName"
END;
