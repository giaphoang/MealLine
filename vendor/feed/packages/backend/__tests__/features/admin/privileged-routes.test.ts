// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { requireAdmin } from '../../../src/middleware/auth/require-admin';

/**
 * The authority boundary on pre-existing privileged routes (ISSUES.md #50a).
 *
 * beta.4 built the machinery but deliberately left these routes open, because
 * gating them before the roster was verified could have removed capability the
 * pantry depends on with no in-app way to restore it. beta.5 closes them.
 *
 * These assert the guard's contract directly rather than booting the whole
 * app: the router wiring is a one-line `requireAdmin` in the route definition,
 * while the decisions worth pinning are *who* gets through and what a refusal
 * looks like.
 */

type Auth = { userId: string; email: string; role: string; accessState: string };

const ADMIN: Auth = {
  userId: 'a1',
  email: 'admin@williamtemple.org',
  role: 'ADMINISTRATOR',
  accessState: 'ALLOWED',
};

const STAFF: Auth = {
  userId: 's1',
  email: 'staff@williamtemple.org',
  role: 'STAFF',
  accessState: 'ALLOWED',
};

const buildApp = (auth?: Auth) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (auth) req.auth = auth;
    next();
  });
  app.post('/privileged', requireAdmin, (_req, res) => res.json({ ok: true }));
  app.get('/open', (_req, res) => res.json({ ok: true }));
  return app;
};

describe('privileged route authority', () => {
  it('admits an administrator', async () => {
    const response = await request(buildApp(ADMIN)).post('/privileged').send({});
    expect(response.status).toBe(200);
  });

  it('refuses staff with an explanation rather than a bare 403', async () => {
    const response = await request(buildApp(STAFF)).post('/privileged').send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ADMIN_REQUIRED');
    // ASK: the message has to tell a staff member what to do next.
    expect(response.body.error.message).toMatch(/administrator/i);
  });

  it('refuses a request carrying no identity at all', async () => {
    // The legacy Basic Auth middleware calls next() without setting req.auth
    // when NODE_ENV=development and FORCE_AUTH is not 'true'. A guard that read
    // missing auth as permissive would turn a development convenience into a
    // production-shaped hole.
    const response = await request(buildApp()).post('/privileged').send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('refuses an administrator whose access has been revoked', async () => {
    // jwtAuthMiddleware ends a revoked session before routing, so this is
    // defence in depth rather than the primary control — but a role check that
    // ignored access state would be wrong on its own terms.
    const revoked = { ...ADMIN, accessState: 'REVOKED' };
    const response = await request(buildApp(revoked)).post('/privileged').send({});

    expect(response.status).toBe(403);
  });

  it('leaves unguarded routes alone', async () => {
    const response = await request(buildApp(STAFF)).get('/open');
    expect(response.status).toBe(200);
  });
});
