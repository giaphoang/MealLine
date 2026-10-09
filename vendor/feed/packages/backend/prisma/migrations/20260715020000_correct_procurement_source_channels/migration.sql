-- Correct the prototype classifier after validating the complete direct-export
-- corpus. AGPCKUP identifies a Fresh Food Alliance receipt; product-code
-- prefixes describe supplier catalog families and do not determine event source.
UPDATE "ProcurementOrderRevision"
SET "eventKind" = CASE
  WHEN UPPER("sourceOrderReference") LIKE '%AGPCKUP'
    THEN 'fresh_alliance_receipt'
  ELSE 'ofb_warehouse_order'
END;

UPDATE "ProcurementLine"
SET "procurementChannel" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "ProcurementOrderRevision"
    WHERE "ProcurementOrderRevision"."id" = "ProcurementLine"."orderRevisionId"
      AND "ProcurementOrderRevision"."eventKind" = 'fresh_alliance_receipt'
  ) THEN 'fresh_alliance'
  ELSE 'ofb_warehouse'
END;
