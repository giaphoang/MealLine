import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { backendDir, rootDir, backendEnvironment } from './environment.mjs';

// All mutations below target a newly created SQLite fixture. The live MealLine
// database and retained PostgreSQL source are never opened by this test.
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'nourish-integration-'));
const state = { jwtSecret: randomBytes(32).toString('hex'), internalToken: randomBytes(32).toString('hex'), voiceToken: randomBytes(32).toString('hex'),agentToken:randomBytes(32).toString('hex') };
const env = { ...backendEnvironment('development', state), DATABASE_URL: `file:${path.join(fixture, 'test.db')}`, STORAGE_PATH: path.join(fixture, 'storage'), NOURISH_SOURCE_ARCHIVE: path.join(fixture, '.private/source/mealline-source.tar.gz'), FORCE_AUTH: 'true', NOURISH_DEV_LOGIN: 'false', AUTH_ALLOWED_DOMAINS: '', AUTH_USERNAME: '', AUTH_PASSWORD: '', RESEND_API_KEY: '', EMAIL_FROM: '' };
Object.assign(process.env, env);
process.env.NOURISH_AGENT_API_TOKEN=state.agentToken;env.NOURISH_AGENT_API_TOKEN=state.agentToken;
process.env.NOURISH_CLIENT_PHONE_ENABLED='false';
const previousCwd = process.cwd();
const verifyPdf = process.argv.includes('--pdf') || process.argv.includes('--browser');
const outputDir = process.argv.includes('--artifacts') ? path.join(rootDir, '.nourish/verification') : undefined;
if (outputDir) await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
let server, client, singleton;
let succeeded = false;
try {
  const sourceFixture = gzipSync('Synthetic public source-download verification; no credentials or business data.');
  await fs.mkdir(path.dirname(env.NOURISH_SOURCE_ARCHIVE), { recursive: true, mode: 0o700 });
  await fs.writeFile(env.NOURISH_SOURCE_ARCHIVE, sourceFixture);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(rootDir, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(backendDir, 'prisma/schema.prisma')], { cwd: backendDir, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Fixture migration failed (${code}).`)));
  });
  const { PrismaClient } = await import('@prisma/client');
  client = new PrismaClient();
  const { SeedService } = await import('../vendor/feed/packages/backend/dist/services/seed/seed-service.js');
  await SeedService.apply(client, { withExamples: false });
  const email = 'nourish-integration@example.invalid';
  const user = await client.user.create({ data: { email, role: 'ADMINISTRATOR', accessState: 'ALLOWED', emailVerified: new Date() } });
  const fixturePolicy = { mode: 'ALLOWLIST', deniedMessage: 'Authorized fixture staff only.', contactEmail: '' };
  await client.accessPolicy.upsert({ where: { id: 1 }, update: fixturePolicy, create: { id: 1, ...fixturePolicy } });
  const code = '654321';
  await client.verificationToken.create({ data: { identifier: email, token: createHash('sha256').update(code).digest('hex'), type: 'otp', expires: new Date(Date.now() + 180000) } });

  process.chdir(backendDir);
  const { createNourishServer } = await import('../vendor/feed/packages/backend/dist/nourish-server.js');
  const db = await import('../vendor/feed/packages/backend/dist/db.js');
  singleton = db.default.default ?? db.default;
  server = await new Promise((resolve) => { const started = createNourishServer().listen(0, '127.0.0.1', () => resolve(started)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.application, 'mealline');
  const { brand } = await (await fetch(base + '/feed/api/brand/current')).json();
  assert.equal(brand.identity.appName, 'MealLine');
  assert.equal(brand.staff.signInTitle, 'Sign in to MealLine');
  const currentMark = await fetch(base + '/feed/brand/mealline-mark.svg');
  const previousMark = await fetch(base + '/feed/brand/nourish-mark.svg');
  assert.equal(currentMark.status, 200);
  assert.equal(previousMark.status, 200);
  assert.equal(await currentMark.text(), await previousMark.text());
  const sourceDownload = await fetch(base + '/source');
  assert.equal(sourceDownload.status, 200);
  assert.ok(sourceDownload.headers.get('content-disposition').includes('mealline-source.tar.gz'));
  assert.deepEqual(Buffer.from(await sourceDownload.arrayBuffer()), sourceFixture);
  const hiddenState = await fetch(base + '/.nourish/runtime.json');
  assert.equal(hiddenState.status, 404);
  await hiddenState.body?.cancel();
  let cookie = '';
  async function request(url, body, status = 200, method = body === undefined ? 'GET' : 'POST', headers = {}) {
    const response = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${url}: ${text.slice(0, 500)}`);
    return { data: text ? JSON.parse(text) : null, response };
  }
  await request('/feed/api/nourish/intakes', undefined, 401);
  await request('/api/voice-intakes', { intake: { caseNumber: 'unauthorized' } }, 401);
  await request('/feed/api/nourish/summary', undefined, 401, 'GET', { 'x-internal-pdf-request': 'true' });
  const { verifyDevelopmentLogin } = await import('./development-login-verification.mjs');
  await verifyDevelopmentLogin({ base, client });
  const auth = await request('/feed/api/auth/otp/verify', { email, code });
  cookie = auth.response.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie.startsWith('auth_token='));
  await request('/feed/api/auth/otp/verify', { email, code }, 401);

  const { data: categoryResponse } = await request('/feed/api/categories', { name: 'Fixture Pantry', limit: 100, limitType: 'household' }, 201);
  const categoryId = categoryResponse.category?.id ?? categoryResponse.id;
  assert.ok(categoryId);
  const { data: foodResponse } = await request('/feed/api/food-items', { name: 'Fixture Canned Beans', limit: 100, limitType: 'household', categoryId, statusFlags: { isInStock: true, isLimited: false, isClearance: false }, dietaryFlags: { vegan: true, vegetarian: true, glutenFree: true, halal: true, kosher: true }, fulfilment: { quantity: 5, unit: 'can', requiresStove: false, requiresFridge: false } }, 201);
  const food = foodResponse.foodItem;
  assert.equal(food.fulfilment.quantity, 5);
  const inventory = (await request('/api/food-items')).data.foodItems;
  assert.equal(inventory[0].id, food.id);
  assert.equal(inventory[0].quantity, 5);
  const transcript = [{ step: 'household', input: '4 people', reply: 'Recorded.', at: new Date().toISOString() }];
  const payload = { intake: { caseNumber: 'fixture-case', language: 'vi', householdSize: 4, dietaryAvoid: ['vegan'], hasStove: false, hasFridge: false, addressRaw: 'Synthetic test address' }, transcript };
  cookie = '';
  const first = (await request('/api/voice-intakes', payload, 201, 'POST', { 'x-nourish-voice-token': env.NOURISH_VOICE_API_TOKEN })).data;
  cookie = auth.response.headers.get('set-cookie').split(';')[0];
  const retry = (await request('/api/voice-intakes', { ...payload, intake: { ...payload.intake, id: 'ignored-retry-id' } }, 201)).data;
  assert.equal(retry.intakeId, first.intakeId);
  assert.equal(retry.shoppingListId, first.shoppingListId);
  assert.equal(await client.nourishIntake.count(), 1);
  assert.equal(await client.nourishBasket.count(), 1);
  assert.deepEqual((await request(`/feed/api/nourish/intakes/${first.intakeId}`)).data.intake.transcript, transcript);
  assert.equal(first.items[0].quantity, 2);
  await request(`/feed/api/nourish/baskets/${first.shoppingListId}`, { status: 'packed' }, 400, 'PUT');
  await request(`/feed/api/nourish/baskets/${first.shoppingListId}`, { status: 'approved', items: first.items }, 200, 'PUT');
  const delivery = (await request('/feed/api/nourish/deliveries')).data.deliveries[0];
  await request(`/feed/api/nourish/deliveries/${delivery.id}`, { status: 'in_transit' }, 400, 'PUT');
  await request(`/feed/api/nourish/baskets/${first.shoppingListId}`, { status: 'packed' }, 200, 'PUT');
  await request(`/feed/api/nourish/baskets/${first.shoppingListId}`, { status: 'packed' }, 200, 'PUT');
  assert.equal((await client.foodItem.findUnique({ where: { id: food.id } })).quantity, 3);
  await request('/api/voice-intakes', payload, 201);
  assert.equal((await client.nourishBasket.findUnique({ where: { id: first.shoppingListId } })).status, 'packed');
  assert.equal(await client.nourishDelivery.count(), 1);
  const volunteer = (await request('/feed/api/nourish/volunteers', { name: 'Synthetic Volunteer', email: 'volunteer@example.invalid' }, 201)).data.volunteer;
  await client.nourishVolunteer.update({ where: { id: volunteer.id }, data: { passwordHash: 'not-a-real-password-hash' } });
  await request(`/feed/api/nourish/deliveries/${delivery.id}`, { assignedTo: volunteer.id, status: 'assigned' }, 200, 'PUT');
  await request(`/feed/api/nourish/deliveries/${delivery.id}`, { assignedTo: null }, 400, 'PUT');
  await request(`/feed/api/nourish/deliveries/${delivery.id}`, { status: 'in_transit' }, 200, 'PUT');
  await request(`/feed/api/nourish/deliveries/${delivery.id}`, { status: 'delivered' }, 200, 'PUT');
  assert.equal((await client.nourishIntake.findUnique({ where: { id: first.intakeId } })).status, 'delivered');
  assert.equal((await client.nourishBasket.findUnique({ where: { id: first.shoppingListId } })).status, 'delivered');

  for (const endpoint of ['/categories', '/food-items', '/languages', '/translations', '/shopping-list-builder/templates', '/shopping-list-builder/components', '/shopping-list-builder/export-settings', '/settings/operating-hours', '/procurement/status', '/service/lotto/status', '/admin/restore/units']) await request(`/feed/api${endpoint}`);
  const { SanitizedBackupService, checksumOf } = await import('../vendor/feed/packages/backend/dist/services/backup/sanitized-backup.js');
  const { readArtifact } = await import('../vendor/feed/packages/backend/dist/services/restore/artifact-reader.js');
  const backup = await SanitizedBackupService.create(email);
  assert.equal(backup.manifest.tableContractVersion, 14);
  assert.equal(backup.data.NourishIntake.length, 1);
  assert.equal(backup.data.NourishDelivery.length, 1);
  assert.ok(!('passwordHash' in backup.data.NourishVolunteer[0]));
  const artifact = readArtifact(JSON.stringify(backup));
  assert.equal(artifact.ok, true);
  assert.ok(artifact.summary.availableUnits.includes('nourish'));
  const conflicting = JSON.parse(JSON.stringify(backup));
  conflicting.data.NourishBasket[0].status = 'draft';
  conflicting.data.FoodItem[0].nameSearch = 'unrelated food with a conflicting id';
  conflicting.manifest.checksum = checksumOf(conflicting.data);
  const conflictUpload = new FormData();
  conflictUpload.append('file', new Blob([JSON.stringify(conflicting)], { type: 'application/json' }), 'synthetic-conflict.json');
  conflictUpload.append('units', 'nourish');
  const refusal = await fetch(base + '/feed/api/admin/restore', { method: 'POST', headers: { cookie }, body: conflictUpload });
  const refusalBody = await refusal.json();
  assert.equal(refusal.status, 409, JSON.stringify(refusalBody));
  assert.equal(refusalBody.error.code, 'NOURISH_RESTORE_INVENTORY_MISMATCH');
  assert.equal((await client.foodItem.findUnique({ where: { id: food.id } })).quantity, 3);
  assert.equal((await client.nourishBasket.findUnique({ where: { id: first.shoppingListId } })).status, 'delivered');
  console.log('✓ Conflicting partial restore refused with actionable 409; live fixture stock and fulfilment are unchanged.');
  if (verifyPdf) {
    async function pdf(url, name, body) {
      const response = await fetch(base + url, { method: body ? 'POST' : 'GET', headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      assert.equal(response.status, 200, `${name}: ${response.status === 200 ? '' : await response.text()}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
      assert.ok(bytes.length > 1000);
      if (outputDir) await fs.writeFile(path.join(outputDir, name), bytes);
      console.log(`  PDF: ${name} generated (${bytes.length} bytes).`);
    }
    await pdf(`/feed/api/nourish/baskets/${first.shoppingListId}/pdf`, 'household-packing.pdf');
    await SeedService.apply(client, { withExamples: true });
    const template = await client.shoppingListBuilderTemplate.findFirst();
    for (const targetLanguage of ['English', 'Arabic', 'Japanese']) {
      const printable = structuredClone(template.templateData);
      printable.components.push({ id: `native-${targetLanguage}`, type: 'text', name: 'Native-script verification', region: 'body', x: 330, y: 90, width: 240, height: 60, content: targetLanguage === 'Arabic' ? 'الأطعمة المتاحة' : targetLanguage === 'Japanese' ? '日本語の食品リスト' : 'Food access for every household', fontSize: 14, fontWeight: 'normal', align: 'left', lineHeight: 1.2, translationMode: 'skip' });
      await pdf('/feed/api/shopping-list-builder/preview-pdf', `builder-${targetLanguage.toLowerCase()}.pdf`, { template: printable, targetLanguage });
    }
    const cards = (await request('/feed/api/analytics-reports/cards')).data.cards;
    const response = await fetch(base + '/feed/api/analytics-reports/export', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Synthetic Verification Report', cardIds: cards.slice(0, 3).map((card) => card.id), preset: 'last-30-days', includePdf: true, includeCsv: true }),
    });
    assert.equal(response.status, 200, response.status === 200 ? '' : await response.text());
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const report = Object.values(zip.files).find((file) => file.name.endsWith('.pdf'));
    assert.ok(report);
    const reportBytes = await report.async('nodebuffer');
    assert.equal(reportBytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(Object.values(zip.files).some((file) => file.name.endsWith('.csv')));
    if (outputDir) await fs.writeFile(path.join(outputDir, 'analytics-report.pdf'), reportBytes);
    console.log('✓ Real PDF verification passed: packing, builder English/RTL/CJK, and report PDF/CSV export.');
  }
  // Exercise the actual scratch-file rebuild and atomic swap, not just the
  // portable artifact's shape. The exit callback is injected only in this
  // disposable fixture; a production restore exits for its supervisor.
  const { RestoreService, RESTART_EXIT_CODE } = await import('../vendor/feed/packages/backend/dist/services/restore/restore-service.js');
  const { MaintenanceMode } = await import('../vendor/feed/packages/backend/dist/services/restore/maintenance-mode.js');
  await client.$disconnect();
  let reportExit;
  const restarted = new Promise((resolve) => { reportExit = resolve; });
  const restored = await RestoreService.run({ data: backup.data, units: artifact.summary.availableUnits, actor: email, reason: 'Disposable MealLine verification', exit: reportExit });
  assert.equal(restored.swapped, true);
  assert.equal(await restarted, RESTART_EXIT_CODE);
  // A real restart resets process-local maintenance; emulate that after the
  // injected exit so the fixture can verify the post-swap authenticated API.
  MaintenanceMode.exit();
  client = new PrismaClient();
  assert.equal(await client.nourishIntake.count(), 1);
  assert.equal(await client.nourishBasket.count(), 1);
  assert.equal(await client.nourishVolunteer.count(), 1);
  assert.equal(await client.nourishDelivery.count(), 1);
  assert.equal((await client.nourishVolunteer.findUnique({ where: { id: volunteer.id } })).passwordHash, null);
  assert.equal((await client.foodItem.findUnique({ where: { id: food.id } })).quantity, 3);
  assert.equal((await client.nourishIntake.findUnique({ where: { id: first.intakeId } })).status, 'delivered');
  assert.deepEqual((await client.nourishIntake.findUnique({ where: { id: first.intakeId } })).transcript, transcript);
  assert.equal((await client.user.findUnique({ where: { id: user.id } })).role, 'ADMINISTRATOR');
  assert.deepEqual(await client.$queryRawUnsafe('PRAGMA foreign_key_check;'), []);
  await request('/feed/api/nourish/summary');
  console.log('✓ Real disposable restore passed: atomic database swap, restart exit contract, stock, transcripts, fulfilment links, credential redaction, and retained administrator.');
  const {verifyClientPhone}=await import('./client-phone-verification.mjs');
  await verifyClientPhone({request,client,secret:env.NOURISH_AGENT_API_TOKEN,volunteer,email});
  if (process.argv.includes('--browser')) {
    const { verifyBrowser } = await import('./browser-verification.mjs');
    await verifyBrowser({ base, cookie, client, outputDir });
  }
  await client.user.update({ where: { id: user.id }, data: { accessState: 'REVOKED' } });
  await request('/feed/api/nourish/summary', undefined, 401);
  succeeded = true;
  console.log('✓ Isolated integration checks passed: authenticated staff/voice APIs, shared inventory, retry-safe matching, packing, deliveries, FEED reads, sanitized backup, and restore.');
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (singleton) await singleton.$disconnect();
  if (client) await client.$disconnect();
  process.chdir(previousCwd);
  await fs.rm(fixture, { recursive: true, force: true });
}
if (!succeeded) process.exitCode = 1;
