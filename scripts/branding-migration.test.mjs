import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

const migration = readFileSync(new URL('../vendor/feed/packages/backend/prisma/migrations/20261010000000_mealline_branding/migration.sql', import.meta.url), 'utf8');
const originalBrand = {
  schemaVersion: 1,
  identity: { organizationName: 'Nourish', appName: 'Nourish', tagline: 'Food access infrastructure' },
  staff: { signInTitle: 'Sign in to Nourish', emailGuidance: 'Authorized staff only' },
  logo: {
    light: { kind: 'builtin', src: '/brand/nourish-mark.svg', width: 64, height: 64 },
    dark: { kind: 'builtin', src: '/feed/brand/nourish-mark.svg', width: 64, height: 64 },
    square: { kind: 'builtin', src: '/brand/nourish-mark.svg', width: 64, height: 64 },
  },
  colors: { accent: { l: 0.55, c: 0.12, h: 163 } },
  terminology: { clientSingular: 'household' },
};

function fixture(t, brand = originalBrand, deniedMessage = 'Nourish access is limited to authorized staff.') {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE BrandConfiguration (id TEXT PRIMARY KEY, payload TEXT NOT NULL, isActive INTEGER, isTemplate INTEGER, updatedAt TEXT);
    CREATE TABLE AccessPolicy (id INTEGER PRIMARY KEY, mode TEXT, deniedMessage TEXT, contactEmail TEXT, updatedAt TEXT);
    CREATE TABLE NourishIntake (id TEXT PRIMARY KEY, caseNumber TEXT);`);
  const insert = db.prepare('INSERT INTO BrandConfiguration VALUES (?, ?, ?, ?, ?)');
  insert.run('nourish-default', JSON.stringify(brand), 1, 0, 'before');
  insert.run('template-nourish', JSON.stringify(originalBrand), 0, 1, 'before');
  insert.run('customer-brand', JSON.stringify(originalBrand), 0, 0, 'before');
  db.prepare('INSERT INTO AccessPolicy VALUES (1, ?, ?, ?, ?)').run('ALLOWLIST', deniedMessage, 'staff@example.invalid', 'before');
  db.prepare('INSERT INTO NourishIntake VALUES (?, ?)').run('existing-intake', 'NOURISH-EXISTING');
  return db;
}

const brandRow = (db, id = 'nourish-default') => JSON.parse(db.prepare('SELECT payload FROM BrandConfiguration WHERE id = ?').get(id).payload);

test('branding migration updates existing defaults while preserving operational data and appearance settings', t => {
  const db = fixture(t);
  db.exec(migration);
  for (const id of ['nourish-default', 'template-nourish']) {
    const result = brandRow(db, id);
    assert.equal(result.identity.organizationName, 'MealLine');
    assert.equal(result.identity.appName, 'MealLine');
    assert.equal(result.staff.signInTitle, 'Sign in to MealLine');
    assert.equal(result.logo.light.src, '/brand/mealline-mark.svg');
    assert.equal(result.logo.dark.src, '/feed/brand/mealline-mark.svg');
    assert.equal(result.logo.square.src, '/brand/mealline-mark.svg');
    assert.deepEqual(result.colors, originalBrand.colors);
    assert.deepEqual(result.terminology, originalBrand.terminology);
    assert.equal(result.identity.tagline, originalBrand.identity.tagline);
  }
  assert.deepEqual(brandRow(db, 'customer-brand'), originalBrand);
  assert.deepEqual({ ...db.prepare('SELECT id, caseNumber FROM NourishIntake').get() }, { id: 'existing-intake', caseNumber: 'NOURISH-EXISTING' });
  assert.deepEqual({ ...db.prepare('SELECT mode, deniedMessage, contactEmail FROM AccessPolicy').get() }, {
    mode: 'ALLOWLIST', deniedMessage: 'MealLine access is limited to authorized staff.', contactEmail: 'staff@example.invalid',
  });
  const once = db.prepare('SELECT * FROM BrandConfiguration ORDER BY id').all();
  db.exec(migration);
  assert.deepEqual(db.prepare('SELECT * FROM BrandConfiguration ORDER BY id').all(), once);
});

test('branding migration retains custom organization names, sign-in copy, logos, and access messages', t => {
  const custom = structuredClone(originalBrand);
  custom.identity.organizationName = 'Example Pantry';
  custom.staff.signInTitle = 'Welcome, pantry staff';
  custom.logo.light = { kind: 'database', id: 'uploaded-logo', width: 240, height: 80 };
  custom.logo.square = { kind: 'builtin', src: '/brand/custom-mark.svg', width: 64, height: 64 };
  const db = fixture(t, custom, 'Contact the pantry coordinator.');
  db.exec(migration);
  const result = brandRow(db);
  assert.equal(result.identity.organizationName, custom.identity.organizationName);
  assert.equal(result.identity.appName, 'MealLine');
  assert.equal(result.staff.signInTitle, custom.staff.signInTitle);
  assert.deepEqual(result.logo.light, custom.logo.light);
  assert.deepEqual(result.logo.square, custom.logo.square);
  assert.equal(db.prepare('SELECT deniedMessage FROM AccessPolicy').get().deniedMessage, 'Contact the pantry coordinator.');
});

test('branding migration is safe before initial setup seeds any branding', t => {
  const db = fixture(t);
  db.exec('DELETE FROM BrandConfiguration; DELETE FROM AccessPolicy;');
  db.exec(migration);
  assert.equal(db.prepare('SELECT count(*) AS count FROM BrandConfiguration').get().count, 0);
  assert.equal(db.prepare('SELECT count(*) AS count FROM NourishIntake').get().count, 1);
});
