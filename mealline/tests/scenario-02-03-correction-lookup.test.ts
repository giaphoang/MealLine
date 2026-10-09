/**
 * Scenario 2: caller corrects an address; the correction updates the draft
 * and the case, but never silently overwrites a master recipient record.
 * Scenario 3: failed verification reveals no existing recipient data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resetFixtures, runIntake, teardown, ORG_DEMO, PROVIDER } from "./fixtures";
import { getCase, lookupRequest } from "../lib/cases";
import { db } from "../lib/db";
import { newId } from "../lib/ids";

test("scenario 2: address correction updates the draft, not a master record", async () => {
  await resetFixtures();

  // Existing recipient "master" record (optional existing-request path).
  const masterId = newId("req");
  await db().query(
    `INSERT INTO service_requests
      (id, provider_id, external_reference, request_type, channel, preferred_language,
       contact_phone, address, household, availability)
     VALUES ($1,$2,'REF-1001','new_delivery','text','en','5155550100',
       '{"raw":"1 Old Street, Des Moines, 50309","zip":"50309"}'::jsonb,
       '{"size":2}'::jsonb, '{"days":[],"times":[],"raw":""}'::jsonb)`,
    [masterId, PROVIDER]
  );

  // New intake where the caller corrects the address at read-back.
  const { caseId } = await runIntake([
    "English",
    "999 Wrong Street, Des Moines, 50309", // wrong
    "2",
    "none",
    "both",
    "Saturday afternoon",
    "status link",
    "none",
    "correct",                             // correction intent at review
    "1234 Grand Avenue, Des Moines, 50309", // corrected address
    "2",
    "none",
    "both",
    "Saturday afternoon",
    "status link",
    "none",
    "yes",
  ]);
  assert.ok(caseId);
  const c = await getCase(caseId!);
  assert.match(c!.confirmed_fields.address!.raw, /1234 Grand Avenue/);

  // The master record is untouched: corrections never silently overwrite it.
  const master = await db().query(`SELECT address FROM service_requests WHERE id = $1`, [masterId]);
  assert.match((master.rows[0] as { address: { raw: string } }).address.raw, /1 Old Street/);
  await teardown();
});

test("scenario 3: failed verification reveals nothing", async () => {
  await resetFixtures();
  const masterId = newId("req");
  await db().query(
    `INSERT INTO service_requests
      (id, provider_id, external_reference, request_type, channel, preferred_language,
       contact_phone, address, household, availability)
     VALUES ($1,$2,'REF-2002','new_delivery','text','en','5155550199',
       '{"raw":"5 Secret Lane, Des Moines, 50312","zip":"50312"}'::jsonb,
       '{"size":3}'::jsonb, '{"days":[],"times":[],"raw":""}'::jsonb)`,
    [masterId, PROVIDER]
  );

  // Wrong phone last-4 -> not found, and the result carries no record data.
  const bad = await lookupRequest("REF-2002", { phoneLast4: "0000", zip: "50312" });
  assert.deepEqual(bad, { found: false });
  assert.ok(!("address" in bad) && !("phone" in bad));

  // Unknown reference -> same shape, nothing disclosed.
  const missing = await lookupRequest("REF-NOPE", { phoneLast4: "0199", zip: "50312" });
  assert.deepEqual(missing, { found: false });

  // Correct verification -> found (boolean only; still no data in the result).
  const good = await lookupRequest("REF-2002", { phoneLast4: "0199", zip: "50312" });
  assert.deepEqual(good, { found: true });
  await teardown();
});
void ORG_DEMO;
