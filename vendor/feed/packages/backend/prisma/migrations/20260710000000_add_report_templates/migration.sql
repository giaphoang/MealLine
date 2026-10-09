-- Organization-wide shared report templates (Reports initiative §3).
-- Shared scope: no owner/user column, per the shared-environment principle.

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameSearch" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "templateData" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportTemplate_source_nameSearch_key" ON "ReportTemplate"("source", "nameSearch");
