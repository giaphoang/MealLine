-- Import activation now runs detached from its HTTP request, so the response
-- that used to carry the activation counts returns before those counts exist.
-- Persist them on the job instead, where a polling client can read them.
-- Additive and nullable: existing rows keep NULL and older artifacts restore
-- unchanged.
ALTER TABLE "DataImportJob" ADD COLUMN "activationSummary" JSONB;
