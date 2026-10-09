-- Elevate the source-event shape above the normalized OFB lines. Recent OFB
-- exports use separate references for Warehouse Orders and Fresh Alliance
-- Receipts, while legacy exports may place both channels under one reference.
ALTER TABLE "ProcurementOrderRevision"
ADD COLUMN "eventKind" TEXT NOT NULL DEFAULT 'ofb_warehouse_order';

UPDATE "ProcurementOrderRevision"
SET "eventKind" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "ProcurementLine"
    WHERE "ProcurementLine"."orderRevisionId" = "ProcurementOrderRevision"."id"
      AND "ProcurementLine"."procurementChannel" = 'fresh_alliance'
  ) AND EXISTS (
    SELECT 1 FROM "ProcurementLine"
    WHERE "ProcurementLine"."orderRevisionId" = "ProcurementOrderRevision"."id"
      AND "ProcurementLine"."procurementChannel" = 'ofb_warehouse'
  ) THEN 'mixed_legacy_event'
  WHEN EXISTS (
    SELECT 1 FROM "ProcurementLine"
    WHERE "ProcurementLine"."orderRevisionId" = "ProcurementOrderRevision"."id"
      AND "ProcurementLine"."procurementChannel" = 'fresh_alliance'
  ) THEN 'fresh_alliance_receipt'
  ELSE 'ofb_warehouse_order'
END;

CREATE INDEX "ProcurementOrderRevision_source_eventKind_deliveryDate_isCurrent_idx"
ON "ProcurementOrderRevision"("source", "eventKind", "deliveryDate", "isCurrent");
