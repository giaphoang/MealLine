-- Non-destructive data-shaping rules (D19/D20). Events stay immutable; a rule
-- only records how the agency interprets them, and each Analytics view decides
-- which flags it honors. Evaluated at read time so a rule added or disabled
-- later reshapes existing data with no re-import.
CREATE TABLE "ProcurementDataRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "flag" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "donorName" TEXT,
    "productCode" TEXT,
    "orderRevisionId" INTEGER,
    "source" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "ProcurementDataRule_enabled_scope_idx" ON "ProcurementDataRule"("enabled", "scope");
CREATE INDEX "ProcurementDataRule_donorName_idx" ON "ProcurementDataRule"("donorName");
CREATE INDEX "ProcurementDataRule_orderRevisionId_idx" ON "ProcurementDataRule"("orderRevisionId");
