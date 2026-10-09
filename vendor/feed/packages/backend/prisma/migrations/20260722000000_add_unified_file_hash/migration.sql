-- Correlates the two ProcurementImport rows (Warehouse, Fresh Alliance) that
-- one unified export produces, back to the original uploaded file. Null for
-- any import predating this column.
ALTER TABLE "ProcurementImport" ADD COLUMN "unifiedFileHash" TEXT;

CREATE INDEX "ProcurementImport_unifiedFileHash_idx" ON "ProcurementImport"("unifiedFileHash");
