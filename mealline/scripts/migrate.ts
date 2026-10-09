/**
 * Applies db/migrations/*.sql in filename order, tracking applied versions
 * in schema_migrations. Idempotent: already-applied versions are skipped.
 * Usage: npm run migrate   (requires MEALLINE_DATABASE_URL or DATABASE_URL)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { databaseUrl } from "../lib/db";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "db", "migrations");

async function main() {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`
    );
    const applied = new Set(
      (await client.query(`SELECT version FROM schema_migrations`)).rows.map(
        (r) => r.version as string
      )
    );
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) {
        console.log(`[migrate] ${version}: already applied`);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      console.log(`[migrate] applying ${version}...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [version]);
        await client.query("COMMIT");
        console.log(`[migrate] ${version}: ok`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("[migrate] failed:", e);
  process.exit(1);
});
