CREATE TABLE "DeploymentSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "publicInventoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- Default to enabled so the existing public feed keeps serving after upgrade.
INSERT INTO "DeploymentSettings" ("id", "publicInventoryEnabled", "updatedAt")
VALUES ('singleton', true, CURRENT_TIMESTAMP);
