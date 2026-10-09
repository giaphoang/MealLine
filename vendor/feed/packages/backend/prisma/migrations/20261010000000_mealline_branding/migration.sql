-- Rebrand the built-in appearance without changing its identity or replacing
-- customized colors, uploaded assets, terminology, or operational records.
UPDATE "BrandConfiguration"
SET "payload" = json_set("payload", '$.identity.organizationName', 'MealLine'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('nourish-default', 'template-nourish')
  AND json_extract("payload", '$.identity.organizationName') = 'Nourish';

UPDATE "BrandConfiguration"
SET "payload" = json_set("payload", '$.identity.appName', 'MealLine'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('nourish-default', 'template-nourish')
  AND json_extract("payload", '$.identity.appName') = 'Nourish';

UPDATE "BrandConfiguration"
SET "payload" = json_set("payload", '$.staff.signInTitle', 'Sign in to MealLine'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('nourish-default', 'template-nourish')
  AND json_extract("payload", '$.staff.signInTitle') = 'Sign in to Nourish';

UPDATE "BrandConfiguration"
SET "payload" = json_set("payload", '$.logo.light.src', replace(json_extract("payload", '$.logo.light.src'), 'nourish-mark', 'mealline-mark')),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('nourish-default', 'template-nourish')
  AND json_extract("payload", '$.logo.light.kind') = 'builtin'
  AND json_extract("payload", '$.logo.light.src') IN ('/brand/nourish-mark.svg', '/feed/brand/nourish-mark.svg', '/brand/nourish-mark.png', '/feed/brand/nourish-mark.png');

UPDATE "BrandConfiguration"
SET "payload" = json_set("payload", '$.logo.dark.src', replace(json_extract("payload", '$.logo.dark.src'), 'nourish-mark', 'mealline-mark')),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('nourish-default', 'template-nourish')
  AND json_extract("payload", '$.logo.dark.kind') = 'builtin'
  AND json_extract("payload", '$.logo.dark.src') IN ('/brand/nourish-mark.svg', '/feed/brand/nourish-mark.svg', '/brand/nourish-mark.png', '/feed/brand/nourish-mark.png');

UPDATE "BrandConfiguration"
SET "payload" = json_set("payload", '$.logo.square.src', replace(json_extract("payload", '$.logo.square.src'), 'nourish-mark', 'mealline-mark')),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('nourish-default', 'template-nourish')
  AND json_extract("payload", '$.logo.square.kind') = 'builtin'
  AND json_extract("payload", '$.logo.square.src') IN ('/brand/nourish-mark.svg', '/feed/brand/nourish-mark.svg', '/brand/nourish-mark.png', '/feed/brand/nourish-mark.png');

UPDATE "AccessPolicy"
SET "deniedMessage" = 'MealLine access is limited to authorized staff.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 1
  AND "deniedMessage" = 'Nourish access is limited to authorized staff.';
