/**
 * Seeds the synthetic demo provider, versioned policy, delivery slots, and
 * staff accounts. All fixtures are synthetic. Idempotent for the seeded
 * identities (deletes + reinserts them).
 *
 * Demo sign-in (documented in README; demo only):
 *   coordinator@demo.local / coordinator-2026-demo   (can approve)
 *   staff@demo.local       / staff-2026-demo         (view/claim/outcome)
 *   coord@riverside.local  / riverside-2026-demo     (second org, for authz demo)
 */
import { Client } from "pg";
import { databaseUrl } from "../lib/db";
import { newId, hashPassword } from "../lib/ids";

const DEMO_ORG = "org_demo_pantry";
const OTHER_ORG = "org_riverside";

async function main() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO organizations (id, name, slug) VALUES
        ($1, 'Demo Pantry Network', 'demo-pantry'),
        ($2, 'Riverside Community Org', 'riverside')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [DEMO_ORG, OTHER_ORG]
    );

    const users: [string, string, string, string, string][] = [
      // id, org, email, name, role
      ["user_coord", DEMO_ORG, "coordinator@demo.local", "Dana Coordinator", "coordinator"],
      ["user_staff", DEMO_ORG, "staff@demo.local", "Sam Staff", "staff"],
      ["user_river", OTHER_ORG, "coord@riverside.local", "Rae Riverside", "coordinator"],
    ];
    const passwords: Record<string, string> = {
      user_coord: "coordinator-2026-demo",
      user_staff: "staff-2026-demo",
      user_river: "riverside-2026-demo",
    };
    for (const [id, org, email, name, role] of users) {
      await client.query(
        `INSERT INTO staff_users (id, org_id, email, name, password_hash, role)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
           email = EXCLUDED.email, role = EXCLUDED.role, name = EXCLUDED.name`,
        [id, org, email, name, hashPassword(passwords[id]), role]
      );
    }

    await client.query(
      `INSERT INTO service_providers
        (id, org_id, name, label, phone_number, transfer_number, business_hours)
       VALUES ($1,$2,'Demo Pantry Delivery','Demo provider (synthetic)',
               '+15550100100','+15550100199',
               '{"mon_fri":"9:00-17:00","sat":"9:00-13:00"}'::jsonb)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, label = EXCLUDED.label`,
      ["prov_demo", DEMO_ORG]
    );

    await client.query(
      `INSERT INTO service_policies
        (id, provider_id, version, service_area, required_fields, program_rules,
         source, reviewed_at, effective_from)
       VALUES ($1,'prov_demo',1,
         '{"zips":["50309","50312","50314"]}'::jsonb,
         '["address","household_size","contact_preference"]'::jsonb,
         $2::jsonb,
         'Demo policy fixture (synthetic)', now(), now())
       ON CONFLICT (provider_id, version) DO NOTHING`,
      [
        "pol_demo_v1",
        JSON.stringify([
          {
            rule: "First-time pantry delivery intake. This demo policy sets NO income, age, disability, or identity-document requirements.",
            source: "Demo policy fixture", reviewed: "2026-10-06",
          },
          {
            rule: "Delivery covers ZIP codes 50309, 50312, 50314. Addresses outside these ZIPs need staff review.",
            source: "Demo policy fixture", reviewed: "2026-10-06",
          },
          {
            rule: "One delivery per household per week in the demo schedule.",
            source: "Demo policy fixture", reviewed: "2026-10-06",
          },
        ]),
      ]
    );

    // Delivery slots: a few windows over the coming days. One single-capacity
    // slot exists for the last-slot race test.
    const now = Date.now();
    const slots: [string, string, number, number, string][] = [
      ["slot_a", "Morning window", 1, 5, "Day after tomorrow, 9am-12pm"],
      ["slot_b", "Afternoon window", 2, 3, "Day after tomorrow, 1pm-4pm"],
      ["slot_c", "Single-capacity window", 3, 1, "Three days out, 9am-12pm"],
      ["slot_d", "Weekend window", 4, 2, "Saturday, 9am-12pm"],
    ];
    for (const [id, label, dayOffset, cap, note] of slots) {
      const start = new Date(now + dayOffset * 86400 * 1000);
      start.setHours(9, 0, 0, 0);
      const end = new Date(start.getTime() + 3 * 3600 * 1000);
      await client.query(
        `INSERT INTO delivery_options
          (id, provider_id, policy_version, label, window_start, window_end,
           capacity_total, capacity_reserved, active, note)
         VALUES ($1,'prov_demo',1,$2,$3,$4,$5,0,true,$6)
         ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label,
           window_start = EXCLUDED.window_start, window_end = EXCLUDED.window_end,
           capacity_total = EXCLUDED.capacity_total, active = true`,
        [id, label, start.toISOString(), end.toISOString(), cap, note]
      );
    }

    await client.query("COMMIT");
    console.log("[seed] demo org, users, provider, policy v1, and 4 slots seeded");
    console.log("[seed] sign-in: coordinator@demo.local / coordinator-2026-demo");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("[seed] failed:", e);
  process.exit(1);
});
