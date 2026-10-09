-- Organization-wide recurring pantry schedule. This singleton is shared by
-- every authenticated user and provides the service-hour denominator for
-- operational analytics.

CREATE TABLE "OperatingHoursSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "hours" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "OperatingHoursSetting" (
    "id", "timezone", "hours", "createdAt", "updatedAt"
) VALUES (
    1,
    'America/Los_Angeles',
    '{"sunday":{"isOpen":false,"openTime":"11:00","closeTime":"14:00"},"monday":{"isOpen":false,"openTime":"11:00","closeTime":"14:00"},"tuesday":{"isOpen":true,"openTime":"11:00","closeTime":"14:00"},"wednesday":{"isOpen":true,"openTime":"11:00","closeTime":"14:00"},"thursday":{"isOpen":true,"openTime":"11:00","closeTime":"14:00"},"friday":{"isOpen":false,"openTime":"11:00","closeTime":"14:00"},"saturday":{"isOpen":false,"openTime":"11:00","closeTime":"14:00"}}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
