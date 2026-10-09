import { Pool } from "pg";
import fs from "fs";
import path from "path";

// Load .env.local for scripts that run outside Next.js (e.g. npm run migrate)
function loadEnvLocal(): void {
  if (process.env.DATABASE_URL) return;
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env.local is optional
  }
}
loadEnvLocal();

export const databaseUrl = process.env.DATABASE_URL ?? "postgresql://127.0.0.1:5432/nourish";

const pool = new Pool({ connectionString: databaseUrl });

export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
  close: () => pool.end(),
};

export async function migrate(): Promise<void> {
  // Ensure migrations table exists first
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const version = file.replace(".sql", "");
    const { rowCount } = await db.query(
      "SELECT 1 FROM schema_migrations WHERE version = $1",
      [version]
    );
    if (rowCount === 0) {
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      await db.query(sql);
      await db.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
      console.log(`[migrate] ${version}: ok`);
    }
  }
}
