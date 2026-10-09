/** Never let the fixture TRUNCATE reach the application's public schema. */
import { readFileSync, readdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { Client } from "pg";

const values = parseEnv(readFileSync(new URL("../.env", import.meta.url), "utf8"));
const base = new URL(process.env.MEALLINE_DATABASE_URL || values.MEALLINE_DATABASE_URL || "");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("Isolated tests require a local database");
const schema = "mealline_agent_test_" + randomBytes(8).toString("hex");
const client = new Client({ connectionString: base.toString() });
await client.connect();
let created = false;
try {
  await client.query(`CREATE SCHEMA ${schema}`);
  created = true;
  await client.query(`SET search_path TO ${schema}, pg_catalog`);
  for (const file of readdirSync(new URL("../db/migrations/", import.meta.url)).filter(f => f.endsWith(".sql")).sort()) {
    await client.query(readFileSync(new URL("../db/migrations/" + file, import.meta.url), "utf8"));
  }
  const testUrl = new URL(base);
  testUrl.searchParams.set("options", `-csearch_path=${schema},pg_catalog`);
  const env = { ...process.env, MEALLINE_DATABASE_URL: testUrl.toString(), DATABASE_URL: testUrl.toString(),
    TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_FROM_NUMBER: "", TWILIO_STATUS_CALLBACK_URL: "",
    FOODFIT_BASE_URL: "", FOODFIT_INTEGRATION_KEY: "", NOURISH_API_URL: "", NOURISH_VOICE_API_TOKEN: "", FEED_API_URL: "", FEED_BASE_URL: "",
    MEALLINE_MODEL_URL: "", MEALLINE_MODEL_KEY: "", MEALLINE_AGENT_KEY: "test-only-agent-key-" + "a".repeat(48),
    MEALLINE_VOICE_TRANSPORT: "twiml", MEALLINE_TEST_SCHEMA: schema };
  Object.assign(env,{NOURISH_CLIENT_PHONE_ENABLED:'false',NOURISH_AGENT_API_TOKEN:'',TWILIO_VERIFY_SERVICE_SID:''});
  const paths = process.argv.slice(2);
  const evaluation = paths.length === 1 && paths[0] === "--eval";
  const files = paths.length ? paths : readdirSync(new URL("../tests/", import.meta.url))
    .filter(file => file.endsWith(".test.ts")).sort().map(file => "tests/" + file);
  const code = await new Promise((resolve, reject) => {
    const args = evaluation ? ["--import", "tsx", "scripts/eval.ts"] : ["--import", "tsx", "--test", "--test-concurrency=1", ...files];
    const child = spawn(process.execPath, args, { env, stdio: "inherit" });
    child.on("error", reject); child.on("exit", resolve);
  });
  process.exitCode = typeof code === "number" ? code : 1;
} finally {
  // Exact, newly-created random schema only. Never a broad database reset.
  if (created) await client.query(`DROP SCHEMA ${schema} CASCADE`);
  await client.end();
}
