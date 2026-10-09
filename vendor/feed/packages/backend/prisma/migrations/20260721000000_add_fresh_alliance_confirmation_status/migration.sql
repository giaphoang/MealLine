-- Confirmation status for Fresh Alliance receipts, sourced directly from
-- Primarius's own SystemReceived flag. A live investigation of the Primarius
-- portal (docs/data-management/fresh-alliance-pending-pickups.md) found a
-- Pending review queue this project had not previously imported from: Agency
-- Pickups the agency has already reported but OFB has not yet reviewed.
--
-- Null for OFB Warehouse revisions, where the concept does not apply --
-- Warehouse orders are never imported except Completed, because an "Active"
-- Warehouse order represents an unfulfilled request rather than an
-- observation, and importing it would risk treating a request as a fact.
--
-- Every Fresh Alliance revision imported through the current 19-column
-- contract is backfilled true here: that contract can only ever carry
-- OFB-confirmed rows today (the extension's own existing validation already
-- guarantees this), so every row FEED has ever imported through it is
-- factually confirmed. This is additive groundwork -- it changes no current
-- behavior -- for a future extension update that can emit unconfirmed rows.
ALTER TABLE "ProcurementOrderRevision" ADD COLUMN "isConfirmed" BOOLEAN;

UPDATE "ProcurementOrderRevision"
SET "isConfirmed" = true
WHERE "source" = 'ofb_pickup';

CREATE INDEX "ProcurementOrderRevision_source_isConfirmed_idx"
ON "ProcurementOrderRevision"("source", "isConfirmed");
