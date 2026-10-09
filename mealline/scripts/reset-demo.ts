/**
 * Clears all demo data (keeps schema_migrations) and re-seeds.
 * Usage: npm run reset-demo
 */
import { Client } from "pg";
import { databaseUrl } from "../lib/db";

const TABLES = [
  "notification_attempts", "outbox_jobs", "status_links",
  "conversation_sessions", "case_events", "bookings",
  "delivery_proposals", "assistance_cases", "service_requests",
  "delivery_options", "service_policies", "service_providers",
  "staff_sessions", "staff_users", "organizations",
];

async function main() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
    console.log("[reset-demo] all demo data cleared");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("[reset-demo] failed:", e);
  process.exit(1);
});
