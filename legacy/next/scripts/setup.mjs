import { Client } from "pg";
import { db, databaseUrl, migrate } from "../src/lib/db.ts";

try {
  const targetUrl = new URL(databaseUrl);
  const databaseName = decodeURIComponent(targetUrl.pathname.slice(1));
  if (!databaseName) throw new Error("DATABASE_URL must include a database name");

  const adminUrl = new URL(targetUrl);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });

  console.log("→ Creating database...");
  try {
    await admin.connect();
    const { rowCount } = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName]
    );
    if (rowCount === 0) {
      const quotedName = '"' + databaseName.replaceAll('"', '""') + '"';
      await admin.query(`CREATE DATABASE ${quotedName}`);
    } else {
      console.log("  (already exists)");
    }
  } finally {
    await admin.end();
  }

  console.log("→ Running migration...");
  await migrate();

  console.log("→ Seeding demo inventory...");
  await db.query(`
    INSERT INTO food_items (name, name_search, category, quantity, unit, vegan, vegetarian, gluten_free) VALUES
    ('Canned Tuna', 'canned-tuna', 'protein', 24, 'can', false, false, true),
    ('Rice', 'rice', 'grains', 50, 'bag', true, true, true),
    ('Peanut Butter', 'peanut-butter', 'protein', 12, 'jar', true, true, true),
    ('Whole Milk', 'whole-milk', 'dairy', 8, 'gallon', false, true, true),
    ('Canned Beans', 'canned-beans', 'protein', 30, 'can', true, true, true),
    ('Pasta', 'pasta', 'grains', 40, 'box', true, true, false)
    ON CONFLICT (name_search) DO NOTHING
  `);

  console.log("\n✓ Setup complete. Run: npm run dev");
  console.log("  Then open http://localhost:3003");
} catch (error) {
  console.error("Setup failed:", error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
