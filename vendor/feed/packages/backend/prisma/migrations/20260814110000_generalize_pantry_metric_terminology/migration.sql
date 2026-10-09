-- Keep the stable shopping_visits identity while replacing the original
-- building-specific display alias with reusable pantry terminology.
UPDATE "ServiceMetricDefinitionRevision"
SET
  "displayName" = 'Pantry Shopping Visits',
  "description" = 'Households shopping for themselves or others in the food pantry.'
WHERE
  "metricId" = (
    SELECT "id"
    FROM "ServiceMetricDefinition"
    WHERE "metricKey" = 'shopping_visits'
  )
  AND (
    LOWER("displayName") LIKE '%stairs%'
    OR LOWER(COALESCE("description", '')) LIKE '%stairs%'
  );
