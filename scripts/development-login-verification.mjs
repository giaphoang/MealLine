import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { backendDir } from './environment.mjs';

// The caller supplies only its disposable fixture server/client, never the
// live MealLine store. Test cookies and signing material are not printed.
export async function verifyDevelopmentLogin({ base, client }) {
  const original = { mode: process.env.NODE_ENV, flag: process.env.NOURISH_DEV_LOGIN, host: process.env.HOST };
  const endpoint = '/feed/api/auth/developer-login';
  const { TokenService } = await import('../vendor/feed/packages/backend/dist/services/auth/token-service.js');
  const { DEVELOPER_USER_ID, DEVELOPER_EMAIL } = await import('../vendor/feed/packages/backend/dist/services/auth/development-login.js');
  const usersBefore = await client.user.count();
  const administratorsBefore = await client.user.count({ where: { role: 'ADMINISTRATOR', accessState: 'ALLOWED' } });
  async function login(status, headers = {}, body = {}) {
    // Node fetch normalizes Host. Use raw HTTP here so hostile Host headers
    // genuinely reach the guard instead of silently becoming localhost.
    const response = await new Promise((resolve, reject) => {
      const request = httpRequest(base + endpoint, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, ...headers } }, incoming => {
        const chunks = [];
        incoming.on('data', chunk => chunks.push(chunk));
        incoming.on('error', reject);
        incoming.on('end', () => resolve(new Response(Buffer.concat(chunks), {
          status: incoming.statusCode,
          headers: Object.fromEntries(Object.entries(incoming.headers).filter(([, value]) => value !== undefined).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value])),
        })));
      });
      request.on('error', reject);
      request.end(JSON.stringify(body));
    });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify({ headers, data }));
    return { response, data };
  }
  async function useSession(cookie, status, endpoint = '/feed/api/auth/session', headers = {}) {
    const response = await fetch(base + endpoint, { headers: { cookie, ...headers } });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }
  try {
    process.env.NOURISH_DEV_LOGIN = 'false';
    assert.equal((await (await fetch(base + endpoint + '/status')).json()).enabled, false);
    await login(404);
    process.env.NOURISH_DEV_LOGIN = 'true';
    process.env.NODE_ENV = 'production';
    await login(404);
    process.env.NODE_ENV = 'development';
    process.env.HOST = '0.0.0.0';
    await login(404);
    process.env.HOST = '127.0.0.1';
    for (const headers of [
      { origin: 'https://attacker.invalid' }, { origin: 'null' },
      { 'x-forwarded-for': '192.0.2.1' }, { 'x-forwarded-host': 'localhost' },
      { host: 'attacker.invalid' }, { host: 'localhost:1' },
      { 'sec-fetch-site': 'cross-site' }, { 'content-type': 'text/plain' },
    ]) await login(403, headers);
    const missingOrigin = await fetch(base + endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(missingOrigin.status, 403);
    await missingOrigin.body?.cancel();
    assert.equal(await client.user.count(), usersBefore, 'Refused sign-ins must not create users');

    const first = await login(200, {}, { email: 'must-not-be-promoted@example.invalid', role: 'ADMINISTRATOR' });
    const cookie = first.response.headers.get('set-cookie').split(';')[0];
    assert.match(first.response.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(first.response.headers.get('set-cookie'), /SameSite=Strict/i);
    assert.match(first.response.headers.get('set-cookie'), /Max-Age=3600/i);
    const token = TokenService.verifyJWT(cookie.slice('auth_token='.length));
    assert.equal(token.developmentLogin, true);
    assert.equal(token.exp - token.iat, 3600);
    assert.equal(first.data.user.id, DEVELOPER_USER_ID);
    assert.equal((await useSession(cookie, 200)).user.role, 'ADMINISTRATOR');
    await useSession(cookie, 200, '/feed/api/admin/users');
    const promotion = await fetch(base + `/feed/api/admin/users/${DEVELOPER_USER_ID}/role`, {
      method: 'PUT', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ role: 'ADMINISTRATOR' }),
    });
    assert.equal(promotion.status, 409);
    assert.equal((await promotion.json()).error.code, 'DEV_LOGIN_ACCOUNT_CONFLICT');
    const cliPromotion = spawnSync(process.execPath, [path.join(backendDir, 'dist/cli/admin.js'), 'grant', `--email=${DEVELOPER_EMAIL}`, '--confirm'], { env: process.env, encoding: 'utf8', timeout: 10000 });
    assert.equal(cliPromotion.status, 1, 'The operator CLI must not make the developer identity a permanent administrator');
    assert.match(cliPromotion.stderr, /Developer authority is session-only/);
    assert.equal((await client.user.findUnique({ where: { id: DEVELOPER_USER_ID } })).role, 'STAFF');
    assert.equal(await client.user.count({ where: { role: 'ADMINISTRATOR', accessState: 'ALLOWED' } }), administratorsBefore);
    assert.equal(await client.adminAuditLog.count({ where: { action: 'DEVELOPMENT_SIGN_IN' } }), 1);
    await login(200);
    assert.equal(await client.user.count(), usersBefore + 1, 'Repeat developer sign-in must reuse its identity');
    const { prepareRestoredUsers } = await import('../vendor/feed/packages/backend/dist/services/restore/restore-service.js');
    const developerRow = await client.user.findUnique({ where: { id: DEVELOPER_USER_ID } });
    const restoredRoster = prepareRestoredUsers([{ ...developerRow, role: undefined }], [developerRow], DEVELOPER_EMAIL);
    assert.equal(restoredRoster[0].role, 'STAFF', 'A restore initiated by the developer must preserve only session-scoped authority');

    await useSession(cookie, 401, '/feed/api/admin/users', { origin: 'https://attacker.invalid' });
    await useSession(cookie, 401, '/feed/api/admin/users', { 'x-forwarded-for': '192.0.2.1' });
    process.env.NOURISH_DEV_LOGIN = 'false';
    assert.equal((await useSession(cookie, 401)).error.code, 'DEV_SESSION_UNAVAILABLE');
    process.env.NOURISH_DEV_LOGIN = 'true';
    process.env.NODE_ENV = 'production';
    assert.equal((await useSession(cookie, 401)).error.code, 'DEV_SESSION_UNAVAILABLE');
    assert.equal((await (await fetch(base + endpoint + '/status')).json()).enabled, false);
    process.env.NODE_ENV = 'development';

    const ordinaryDevToken = TokenService.generateJWT(DEVELOPER_USER_ID, DEVELOPER_EMAIL);
    await useSession(`auth_token=${ordinaryDevToken}`, 401);
    const otherUser = await client.user.findFirst({ where: { id: { not: DEVELOPER_USER_ID } } });
    const wrongIdentity = TokenService.generateDevelopmentJWT(otherUser.id, otherUser.email);
    await useSession(`auth_token=${wrongIdentity}`, 401);
    await client.user.update({ where: { id: DEVELOPER_USER_ID }, data: { role: 'ADMINISTRATOR' } });
    assert.equal((await useSession(cookie, 401)).error.code, 'DEV_LOGIN_ACCOUNT_CONFLICT');
    await login(409);
    await client.user.update({ where: { id: DEVELOPER_USER_ID }, data: { role: 'STAFF' } });
    await client.user.update({ where: { id: DEVELOPER_USER_ID }, data: { accessState: 'REVOKED' } });
    assert.equal((await useSession(cookie, 401)).error.code, 'ACCESS_REVOKED');
    await login(403);
    await client.user.update({ where: { id: DEVELOPER_USER_ID }, data: { accessState: 'ALLOWED' } });
    console.log('✓ Developer login security checks passed: opt-in/local-only boundary, cross-site/proxy refusal, scoped admin session, audit, reuse, revocation, and production/disabled-mode rejection.');
  } finally {
    process.env.NODE_ENV = original.mode;
    process.env.NOURISH_DEV_LOGIN = original.flag;
    process.env.HOST = original.host;
  }
}
