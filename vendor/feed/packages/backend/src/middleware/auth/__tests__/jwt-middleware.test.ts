// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

// The middleware now reads the caller's current role and access state on every
// authenticated request, so the database is the dependency under test here.
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock('@/db', () => ({
  default: { user: { findUnique } },
}));

const ALLOWED_USER = {
  id: 'user-1',
  email: 'user@williamtemple.org',
  role: 'STAFF',
  accessState: 'ALLOWED',
};

const buildApp = async () => {
  const [{ jwtAuthMiddleware }, { authMiddleware }] = await Promise.all([
    import('@/middleware/auth/jwt-middleware'),
    import('@/middleware/auth/auth-middleware'),
  ]);

  const app = express();
  app.use(cookieParser());
  app.use(jwtAuthMiddleware);
  app.use(authMiddleware);
  app.get('/api/protected', (req, res) => {
    res.json({ ok: true, user: req.auth ?? null });
  });
  return app;
};

describe('jwtAuthMiddleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key-test-secret-key-test-secret-key-test-secret-key';
    process.env.JWT_EXPIRES_IN = '7d';
    process.env.AUTH_USERNAME = 'admin';
    process.env.AUTH_PASSWORD = 'pass';
    process.env.NODE_ENV = 'production';
    process.env.FORCE_AUTH = 'true';
    findUnique.mockReset();
    findUnique.mockResolvedValue(ALLOWED_USER);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('accepts a valid JWT cookie and bypasses Basic Auth', async () => {
    const { TokenService } = await import('@/services/auth/token-service');
    const app = await buildApp();
    const token = TokenService.generateJWT('user-1', 'user@williamtemple.org');

    const response = await request(app)
      .get('/api/protected')
      .set('Cookie', `auth_token=${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      userId: 'user-1',
      email: 'user@williamtemple.org',
      role: 'STAFF',
      accessState: 'ALLOWED',
    });
  });

  it('takes role and access state from the database, not the token claims', async () => {
    const { TokenService } = await import('@/services/auth/token-service');
    const app = await buildApp();
    // A token minted while this account was an administrator.
    const token = TokenService.generateJWT('user-1', 'user@williamtemple.org');

    findUnique.mockResolvedValue({ ...ALLOWED_USER, role: 'STAFF' });

    const response = await request(app)
      .get('/api/protected')
      .set('Cookie', `auth_token=${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('STAFF');
  });

  it('ends the session when access has been revoked', async () => {
    const { TokenService } = await import('@/services/auth/token-service');
    const app = await buildApp();
    const token = TokenService.generateJWT('user-1', 'user@williamtemple.org');

    findUnique.mockResolvedValue({ ...ALLOWED_USER, accessState: 'REVOKED' });

    const response = await request(app)
      .get('/api/protected')
      .set('Cookie', `auth_token=${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('ACCESS_REVOKED');
  });

  it('ends the session when the account no longer exists', async () => {
    const { TokenService } = await import('@/services/auth/token-service');
    const app = await buildApp();
    const token = TokenService.generateJWT('deleted-user', 'gone@williamtemple.org');

    findUnique.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/protected')
      .set('Cookie', `auth_token=${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('ACCESS_REVOKED');
  });

  it('fails closed with 503, not 401, when the revalidation read fails', async () => {
    const { TokenService } = await import('@/services/auth/token-service');
    const app = await buildApp();
    const token = TokenService.generateJWT('user-1', 'user@williamtemple.org');

    findUnique.mockRejectedValue(new Error('database is locked'));

    const response = await request(app)
      .get('/api/protected')
      .set('Cookie', `auth_token=${token}`);

    // A 401 would clear the cookie and bounce every signed-in user to a login
    // that fails identically — an outage would read as a mass revocation.
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SESSION_REVALIDATION_UNAVAILABLE');
  });

  it('does not trust a caller-supplied PDF header as authentication', async () => {
    const app = await buildApp();

    const response = await request(app)
      .get('/api/protected')
      .set('x-internal-pdf-request', 'true');

    expect(response.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('falls back to Basic Auth when JWT is missing', async () => {
    const app = await buildApp();
    const basic = Buffer.from('admin:pass').toString('base64');

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Basic ${basic}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it('rejects when JWT is invalid and no Basic Auth is provided', async () => {
    const app = await buildApp();

    const response = await request(app)
      .get('/api/protected')
      .set('Cookie', 'auth_token=badtoken');

    expect(response.status).toBe(401);
  });
});
