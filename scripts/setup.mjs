import path from "node:path";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { backendDir, rootDir, ensureState, saveState, backendEnvironment } from "./environment.mjs";

const state = ensureState();
const legacyDatabaseUrl = process.env.DATABASE_URL;
const env = backendEnvironment("development", state);
const schema = path.join(backendDir, "prisma/schema.prisma");

async function command(args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: rootDir, env, stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Setup command failed (exit ${code}).`)));
  });
}

console.log("→ Building shared MealLine business logic...");
await command(["node_modules/typescript/bin/tsc", "-p", "packages/core/tsconfig.json"]);
console.log("→ Generating the shared database client...");
await command(["node_modules/prisma/build/index.js", "generate", "--schema", schema]);
console.log("→ Applying FEED and MealLine migrations...");
await command(["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", schema]);
console.log("→ Building feature services...");
await command(["node_modules/typescript/bin/tsc", "-p", path.join(backendDir, "tsconfig.json")]);

const { PrismaClient } = await import("@prisma/client");
const target = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
try {
  if (!state.referenceSeededAt) {
    const { SeedService } = await import("../vendor/feed/packages/backend/dist/services/seed/seed-service.js");
    await SeedService.apply(target, { withExamples: false });
    state.referenceSeededAt = new Date().toISOString();
    saveState(state);
  }

  if (!state.legacyImportedAt && legacyDatabaseUrl && process.env.NOURISH_SKIP_LEGACY_IMPORT !== "true") {
    console.log("→ Importing existing MealLine data (the PostgreSQL source is retained)...");
    const source = new Pool({ connectionString: legacyDatabaseUrl });
    const connection = await source.connect();
    try {
      await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const data = {};
      for (const table of ["food_items", "voice_intakes", "shopping_lists", "staff_users", "deliveries"]) {
        data[table] = (await connection.query(`SELECT * FROM ${table} ORDER BY created_at`)).rows;
      }
      await target.$transaction(async (tx) => {
        for (const item of data.food_items) {
          const category = await tx.category.upsert({
            where: { nameSearch: item.category.toLowerCase() }, update: {},
            create: { name: item.category, nameSearch: item.category.toLowerCase(), limit: 100, limitType: "household" },
          });
          const existing = await tx.foodItem.findUnique({ where: { id: item.id } });
          if (existing && existing.name.toLowerCase() !== item.name.toLowerCase()) throw new Error(`Inventory ID ${item.id} is already used. Import into a fresh FEED database.`);
          await tx.foodItem.upsert({
            where: { id: item.id }, update: {},
            create: {
              id: item.id, name: item.name, nameSearch: item.name.toLowerCase(), categoryId: category.id,
              quantity: item.quantity, unit: item.unit, isInStock: item.is_in_stock,
              vegan: item.vegan, vegetarian: item.vegetarian, glutenFree: item.gluten_free,
              halal: item.halal, kosher: item.kosher, requiresStove: item.requires_stove, requiresFridge: item.requires_fridge,
              limit: 100, limitType: "household", createdAt: item.created_at, updatedAt: item.updated_at,
            },
          });
        }
        for (const row of data.voice_intakes) await tx.nourishIntake.upsert({
          where: { id: row.id }, update: {}, create: {
            id: row.id, caseNumber: row.case_number, language: row.language, phone: row.phone,
            addressRaw: row.address_raw, addressStreet: row.address_street, addressCity: row.address_city, addressZip: row.address_zip,
            householdSize: row.household_size, dietaryAvoid: row.dietary_avoid ?? [], dietaryNotes: row.dietary_notes,
            hasStove: row.has_stove, hasFridge: row.has_fridge, availabilityRaw: row.availability_raw,
            availabilityDays: row.availability_days ?? [], availabilityTimes: row.availability_times ?? [],
            contactPreference: row.contact_preference, accommodation: row.accommodation, status: row.status,
            transcript: row.transcript ?? [], createdAt: row.created_at, updatedAt: row.updated_at,
          },
        });
        for (const row of data.shopping_lists) await tx.nourishBasket.upsert({
          where: { id: row.id }, update: {}, create: {
            id: row.id, intakeId: row.intake_id, title: row.title, status: row.status, items: row.items,
            createdAt: row.created_at, updatedAt: row.updated_at,
          },
        });
        for (const row of data.staff_users) await tx.nourishVolunteer.upsert({
          where: { id: row.id }, update: {}, create: {
            id: row.id, name: row.name, email: row.email, role: row.role, passwordHash: row.password_hash, createdAt: row.created_at,
          },
        });
        for (const row of data.deliveries) await tx.nourishDelivery.upsert({
          where: { id: row.id }, update: {}, create: {
            id: row.id, shoppingListId: row.shopping_list_id, intakeId: row.intake_id, assignedTo: row.assigned_to,
            status: row.status, scheduledFor: row.scheduled_for, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at,
          },
        });
      }, { timeout: 120000 });
      await connection.query("COMMIT");
      state.legacyImportedAt = new Date().toISOString();
      state.legacyImportCounts = Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length]));
      saveState(state);
      console.log("  Imported:", state.legacyImportCounts);
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
      await source.end();
    }
  }

  // Fresh installs get the same six demonstration items as the original setup.
  if (!state.demoSeededAt && await target.foodItem.count() === 0) {
    const demos = [
      ["Canned Tuna", "protein", 24, "can", false, false, true],
      ["Rice", "grains", 50, "bag", true, true, true],
      ["Peanut Butter", "protein", 12, "jar", true, true, true],
      ["Whole Milk", "dairy", 8, "gallon", false, true, true],
      ["Canned Beans", "protein", 30, "can", true, true, true],
      ["Pasta", "grains", 40, "box", true, true, false],
    ];
    for (const [name, categoryName, quantity, unit, vegan, vegetarian, glutenFree] of demos) {
      const category = await target.category.upsert({ where: { nameSearch: categoryName }, update: {}, create: { name: categoryName, nameSearch: categoryName, limit: 100 } });
      await target.foodItem.create({ data: { name, nameSearch: name.toLowerCase(), categoryId: category.id, quantity, unit, vegan, vegetarian, glutenFree, limit: 100 } });
    }
    state.demoSeededAt = new Date().toISOString();
    saveState(state);
  }

  const domains = (env.AUTH_ALLOWED_DOMAINS || "").split(",").map((domain) => domain.trim()).filter(Boolean);
  // Imported rows bypass the UI mutation services, so establish one honest
  // baseline per item/category for FEED's append-only operational history.
  await target.$transaction(async (tx) => {
    for (const category of await tx.category.findMany()) {
      if (!await tx.categoryInventoryEvent.count({ where: { sourceCategoryId: category.id } })) await tx.categoryInventoryEvent.create({ data: { categoryId: category.id, sourceCategoryId: category.id, categoryName: category.name, limit: category.limit, limitType: category.limitType, icon: category.icon, eventKind: 'migration_baseline', recordsLimit: true, recordsIdentity: true } });
    }
    for (const item of await tx.foodItem.findMany({ include: { category: true } })) {
      if (!await tx.foodItemInventoryEvent.count({ where: { sourceFoodItemId: item.id } })) await tx.foodItemInventoryEvent.create({ data: { foodItemId: item.id, sourceFoodItemId: item.id, itemName: item.name, categoryId: item.categoryId, categoryName: item.category.name, isInStock: item.isInStock, isLimited: item.isLimited, isClearance: item.isClearance, limit: item.limit, limitType: item.limitType, estimatedQuantity: item.estimatedQuantity, supplySource: item.supplySource, eventKind: 'migration_baseline', recordsStatus: true, recordsQuantity: true, recordsSupply: true, recordsLimit: true, recordsIdentity: true } });
    }
  }, { timeout: 120000 });
  if (!await target.brandConfiguration.findFirst({ where: { isActive: true } })) {
    const { NOURISH_BRAND_CONFIG } = await import("../vendor/feed/packages/backend/dist/services/brand-config/presets.js");
    await target.brandConfiguration.upsert({ where: { id: "nourish-default" }, update: { isActive: true }, create: { id: "nourish-default", payload: NOURISH_BRAND_CONFIG, isActive: true } });
  }
  const policyDefaults = { mode: domains.length ? "DOMAIN" : "ALLOWLIST", deniedMessage: "MealLine access is limited to authorized staff.", contactEmail: process.env.NOURISH_ADMIN_EMAIL ?? "" };
  const existingPolicy = await target.accessPolicy.findUnique({ where: { id: 1 } });
  // The retained upstream migration inserts its own organization's default.
  // Replace only that untouched default; never overwrite a configured policy.
  const upstreamDefault = existingPolicy?.mode === 'DOMAIN'
    && existingPolicy.contactEmail === 'technology@williamtemple.org'
    && existingPolicy.deniedMessage === 'FEED access is limited to authorized staff.';
  await target.accessPolicy.upsert({
    where: { id: 1 }, update: upstreamDefault ? policyDefaults : {},
    create: { id: 1, ...policyDefaults },
  });
  const adminEmail = process.env.NOURISH_ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail) {
    const existing = await target.user.findUnique({ where: { email: adminEmail } });
    if (!existing) await target.user.create({ data: { email: adminEmail, role: "ADMINISTRATOR", accessState: "ALLOWED", emailVerified: null } });
  }
  console.log("\n✓ Setup complete. Run npm run build, then npm run dev.");
  console.log("  Workspace: http://localhost:3003/feed");
  if (!process.env.RESEND_API_KEY) console.log("  Configure RESEND_API_KEY and EMAIL_FROM in .env.local for email sign-in.");
} finally {
  await target.$disconnect();
}
