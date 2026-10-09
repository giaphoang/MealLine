-- Fresh Food Alliance receipts are reported by a second OFB export (Agency
-- Pickups) that carries donor identity. Those observations persist under their
-- own source namespace, so these columns are null for Completed Orders rows.
-- FEED records the donor the source reports and never infers one.
ALTER TABLE "ProcurementOrderRevision" ADD COLUMN "sourcePickupId" TEXT;
ALTER TABLE "ProcurementOrderRevision" ADD COLUMN "pickupTime" TEXT;
ALTER TABLE "ProcurementOrderRevision" ADD COLUMN "submittedAt" TEXT;
ALTER TABLE "ProcurementOrderRevision" ADD COLUMN "donorCode" TEXT;
ALTER TABLE "ProcurementOrderRevision" ADD COLUMN "donorName" TEXT;

-- Marks a Completed Orders AGPCKUP event whose receiving date is covered by a
-- Fresh Alliance import. The donor-attributed observation replaces it in
-- analytics; neither row is deleted, and rolling back that import clears the
-- mark. Verified lossless: every AGPCKUP row carries $0.00 across all four
-- money columns, so nothing unique is set aside.
ALTER TABLE "ProcurementOrderRevision" ADD COLUMN "supersededByImportId" INTEGER;

-- A 0 rate with hasDonorValuation = 0 means OFB recorded no valuation, not a
-- zero-value donation. The weight remains fully counted.
ALTER TABLE "ProcurementLine" ADD COLUMN "sourcePickupLineId" TEXT;
ALTER TABLE "ProcurementLine" ADD COLUMN "freshAllianceCategory" TEXT;
ALTER TABLE "ProcurementLine" ADD COLUMN "receivedQuantityHundredths" INTEGER;
ALTER TABLE "ProcurementLine" ADD COLUMN "receivedWeightHundredths" INTEGER;
ALTER TABLE "ProcurementLine" ADD COLUMN "receivedMatchesRequested" BOOLEAN;
ALTER TABLE "ProcurementLine" ADD COLUMN "donorValuePerPoundCents" INTEGER;
ALTER TABLE "ProcurementLine" ADD COLUMN "hasDonorValuation" BOOLEAN;

CREATE INDEX "ProcurementOrderRevision_supersededByImportId_idx"
ON "ProcurementOrderRevision"("supersededByImportId");

CREATE INDEX "ProcurementOrderRevision_donorCode_idx"
ON "ProcurementOrderRevision"("donorCode");
