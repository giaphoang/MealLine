/**
 * Test fixtures: reset only an isolated schema and insert deterministic
 * dataset (same fixed ids as scripts/seed.ts so demoContext() works).
 */
import { db, closeDb } from "../lib/db";
import { hashPassword } from "../lib/ids";

const TABLES = [
  'nourish_phone_jobs','nourish_phone_verifications','nourish_phone_cursor',
  "notification_attempts", "outbox_jobs", "status_links",
  "conversation_sessions", "case_events", "bookings",
  "delivery_proposals", "assistance_cases", "service_requests",
  "delivery_options", "service_policies", "service_providers",
  "staff_sessions", "staff_users", "organizations",
];

export const ORG_DEMO = "org_demo_pantry";
export const ORG_OTHER = "org_riverside";
export const PROVIDER = "prov_demo";
export const COORD_ID = "user_coord";
export const STAFF_ID = "user_staff";
export const RIVER_ID = "user_river";

export async function resetFixtures(): Promise<void> {
  const schema = process.env.MEALLINE_TEST_SCHEMA;
  const active = await db().query(`SELECT current_schema() AS name`);
  if (!schema || !/^mealline_agent_test_[a-f0-9]{16}$/.test(schema) || active.rows[0].name !== schema) {
    throw new Error("Fixture reset requires the isolated test runner; use npm test");
  }
  await db().query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);

  await db().query(
    `INSERT INTO organizations (id, name, slug) VALUES
      ($1,'Demo Pantry Network','demo-pantry'),
      ($2,'Riverside Community Org','riverside')`,
    [ORG_DEMO, ORG_OTHER]
  );
  const users: [string, string, string, string, string, string][] = [
    [COORD_ID, ORG_DEMO, "coordinator@demo.local", "Dana Coordinator", "coordinator", "x"],
    [STAFF_ID, ORG_DEMO, "staff@demo.local", "Sam Staff", "staff", "x"],
    [RIVER_ID, ORG_OTHER, "coord@riverside.local", "Rae Riverside", "coordinator", "x"],
  ];
  for (const [id, org, email, name, role] of users) {
    await db().query(
      `INSERT INTO staff_users (id, org_id, email, name, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, org, email, name, hashPassword("pw-" + id), role]
    );
  }
  await db().query(
    `INSERT INTO service_providers (id, org_id, name, label, phone_number, transfer_number)
     VALUES ($1,$2,'Demo Pantry Delivery','Demo provider (synthetic)','+15550100100','+15550100199')`,
    [PROVIDER, ORG_DEMO]
  );
  await db().query(
    `INSERT INTO service_policies
      (id, provider_id, version, service_area, required_fields, program_rules, source, reviewed_at, effective_from)
     VALUES ('pol_demo_v1',$1,1,
       '{"zips":["50309","50312","50314"]}'::jsonb,
       '["address","household_size","contact_preference"]'::jsonb,
       '[{"rule":"No income, age, disability, or ID requirements in this demo policy.","source":"fixture","reviewed":"2026-10-06"}]'::jsonb,
       'fixture', now(), now())`,
    [PROVIDER]
  );
  // Slot with capacity 1 for the last-slot race test; slot_big for the rest.
  const t1 = new Date(Date.now() + 2 * 86400 * 1000);
  const t2 = new Date(Date.now() + 3 * 86400 * 1000);
  await db().query(
    `INSERT INTO delivery_options
      (id, provider_id, policy_version, label, window_start, window_end, capacity_total, capacity_reserved, active)
     VALUES
      ('slot_race',$1,1,'Single-capacity window',$2,$3,1,0,true),
      ('slot_big',$1,1,'Roomy window',$4,$5,10,0,true)`,
    [PROVIDER, t1.toISOString(), new Date(t1.getTime() + 3 * 3600 * 1000).toISOString(),
     t2.toISOString(), new Date(t2.getTime() + 3 * 3600 * 1000).toISOString()]
  );
}

/** Drive a full intake conversation through the controller. Returns case id. */
export async function runIntake(
  lines: (string | null)[],
  channel: "sim" | "text" | "voice" = "sim"
): Promise<{ caseId?: string; caseNumber?: string; statusLinkPath?: string; last: import("../lib/controller").TurnResult }> {
  const { createSession, processTurn } = await import("../lib/controller");
  const session = await createSession({ channel });
  let last: import("../lib/controller").TurnResult | undefined;
  for (const line of lines) {
    last = await processTurn(session.id, line, { orgId: ORG_DEMO, providerId: PROVIDER });
    if (last.done) break;
  }
  if (!last) throw new Error("no turns processed");
  return { caseId: last.caseId, caseNumber: last.caseNumber, statusLinkPath: last.statusLinkPath, last };
}

export const EN_SCRIPT = [
  "English",
  "1234 Grand Avenue, Des Moines, 50312",
  "4 people",
  "none",
  "both",
  "weekday mornings",
  "call me at 515-555-0142",
  "please leave groceries at the door",
  "yes",
];

export const VI_SCRIPT = [
  "tiếng Việt",
  "1234 Đường Grand, Des Moines, 50312",
  "gia đình 5 người",
  "không có",
  "cả hai",
  "sáng thứ Bảy",
  "gọi cho tôi số 5155550143",
  "để hàng trước cửa",
  "đúng rồi",
];

export async function teardown(): Promise<void> {
  await closeDb();
}
