-- A donor rule may match on OFB's donor code as well as the donor name. Codes
-- are stabler than names (which drift between exports); legacy rows carry only
-- a name and no code. Either identifier matching is sufficient.
ALTER TABLE "ProcurementDataRule" ADD COLUMN "donorCode" TEXT;

CREATE INDEX "ProcurementDataRule_donorCode_idx" ON "ProcurementDataRule"("donorCode");
