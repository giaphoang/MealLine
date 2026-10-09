-- CreateTable
CREATE TABLE "ProcurementImport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "rowCount" INTEGER NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "rangeStart" TEXT NOT NULL,
    "rangeEnd" TEXT NOT NULL,
    "importedBy" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolledBackBy" TEXT,
    "rolledBackAt" DATETIME,
    "restoredBy" TEXT,
    "restoredAt" DATETIME
);

-- CreateTable
CREATE TABLE "ProcurementOrderRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceOrderReference" TEXT NOT NULL,
    "deliveryDate" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "warningCodes" JSONB NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementOrderRevision_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ProcurementImport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProcurementProduct" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "acquisitionClass" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProcurementLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderRevisionId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "sourceOrderReference" TEXT NOT NULL,
    "sourcePeriod" TEXT NOT NULL,
    "sourceDescription" TEXT NOT NULL,
    "acquisitionClass" TEXT NOT NULL,
    "procurementChannel" TEXT NOT NULL,
    "quantityHundredths" INTEGER NOT NULL,
    "weightHundredths" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "sourcePriceTotalCents" INTEGER NOT NULL,
    "calculatedPriceTotalCents" INTEGER NOT NULL,
    "priceTotalMatches" BOOLEAN NOT NULL,
    "serviceFeeCents" INTEGER NOT NULL,
    "grantsAppliedCents" INTEGER NOT NULL,
  CONSTRAINT "ProcurementLine_orderRevisionId_fkey" FOREIGN KEY ("orderRevisionId") REFERENCES "ProcurementOrderRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProcurementLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProcurementProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProcurementImport_source_importedAt_idx" ON "ProcurementImport"("source", "importedAt");
CREATE INDEX "ProcurementImport_fileHash_idx" ON "ProcurementImport"("fileHash");
CREATE INDEX "ProcurementImport_status_importedAt_idx" ON "ProcurementImport"("status", "importedAt");
CREATE UNIQUE INDEX "ProcurementOrderRevision_source_sourceOrderReference_revision_key" ON "ProcurementOrderRevision"("source", "sourceOrderReference", "revision");
CREATE INDEX "ProcurementOrderRevision_source_sourceOrderReference_isCurrent_idx" ON "ProcurementOrderRevision"("source", "sourceOrderReference", "isCurrent");
CREATE INDEX "ProcurementOrderRevision_source_deliveryDate_isCurrent_idx" ON "ProcurementOrderRevision"("source", "deliveryDate", "isCurrent");
CREATE INDEX "ProcurementOrderRevision_importId_idx" ON "ProcurementOrderRevision"("importId");
CREATE INDEX "ProcurementOrderRevision_snapshotHash_idx" ON "ProcurementOrderRevision"("snapshotHash");
CREATE UNIQUE INDEX "ProcurementProduct_source_productCode_key" ON "ProcurementProduct"("source", "productCode");
CREATE INDEX "ProcurementProduct_acquisitionClass_idx" ON "ProcurementProduct"("acquisitionClass");
CREATE UNIQUE INDEX "ProcurementLine_orderRevisionId_sourceRowNumber_key" ON "ProcurementLine"("orderRevisionId", "sourceRowNumber");
CREATE INDEX "ProcurementLine_productId_orderRevisionId_idx" ON "ProcurementLine"("productId", "orderRevisionId");
CREATE INDEX "ProcurementLine_acquisitionClass_idx" ON "ProcurementLine"("acquisitionClass");
CREATE INDEX "ProcurementLine_procurementChannel_idx" ON "ProcurementLine"("procurementChannel");
