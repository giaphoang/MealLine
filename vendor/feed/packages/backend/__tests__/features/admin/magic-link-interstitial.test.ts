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

/**
 * Magic-link consumption moved from GET to POST (ISSUES.md #57).
 *
 * Microsoft Defender and similar inbound scanners prefetch every link in a
 * message. While `/api/auth/callback` verified on GET, that prefetch spent the
 * single-use token before the recipient could — which is why magic links are
 * unusable at William Temple House and OTP became the working path.
 *
 * The property under test is narrow and load bearing: **a GET must consume
 * nothing.** Everything else follows from that.
 */

const { verifyMagicLink, assertMayAuthenticate } = vi.hoisted(() => ({
  verifyMagicLink: vi.fn(),
  assertMayAuthenticate: vi.fn(),
}));

vi.mock('@/services/auth/verification-service', () => ({
  VerificationService: { verifyMagicLink },
}));

vi.mock('@/services/auth/access-policy-service', () => ({
  AccessPolicyService: { assertMayAuthenticate },
}));

const ORIGINAL_ENV = { ...process.env };

const buildApp = async () => {
  const [{ default: authRouter }, { errorHandler }] = await Promise.all([
    import('@/routes/auth'),
    import('@/middleware/error-handler'),
  ]);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  app.use(errorHandler);
  return app;
};

describe('magic-link interstitial', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key-test-secret-key-test-secret-key-test-secret-key';
    process.env.APP_URL = 'https://feed.williamtemple.app';
    process.env.NODE_ENV = 'test';
    verifyMagicLink.mockReset();
    assertMayAuthenticate.mockReset();
    verifyMagicLink.mockResolvedValue('user-1');
    assertMayAuthenticate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('does not consume the token on GET — the whole point', async () => {
    const app = await buildApp();

    const response = await request(app)
      .get('/api/auth/callback')
      .query({ email: 'staff@williamtemple.org', token: 'tok-123' });

    expect(response.status).toBe(302);
    // A scanner following the link must not have spent anything.
    expect(verifyMagicLink).not.toHaveBeenCalled();
    // And it must not hand out a session.
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('forwards to the confirmation page carrying the token', async () => {
    const app = await buildApp();

    const response = await request(app)
      .get('/api/auth/callback')
      .query({ email: 'staff@williamtemple.org', token: 'tok-123' });

    expect(response.headers.location).toContain('/sign-in/confirm');
    expect(response.headers.location).toContain('token=tok-123');
    expect(response.headers.location).toContain(encodeURIComponent('staff@williamtemple.org'));
  });

  it('consumes the token and starts the session on POST', async () => {
    const app = await buildApp();

    const response = await request(app)
      .post('/api/auth/magic-link/verify')
      .send({ email: 'staff@williamtemple.org', token: 'tok-123' });

    expect(response.status).toBe(200);
    expect(verifyMagicLink).toHaveBeenCalledWith('staff@williamtemple.org', 'tok-123');
    expect(response.headers['set-cookie']?.[0]).toContain('auth_token=');
  });

  it('refuses a spent or expired token with an actionable message', async () => {
    verifyMagicLink.mockResolvedValue(null);
    const app = await buildApp();

    const response = await request(app)
      .post('/api/auth/magic-link/verify')
      .send({ email: 'staff@williamtemple.org', token: 'stale' });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toMatch(/request a new one/i);
  });

  it('applies the access gate at verify, not only when the link was sent', async () => {
    // An administrator may have revoked this account in the ten minutes the
    // link was valid.
    const denial = Object.assign(new Error('FEED access is limited to authorized staff.'), {
      statusCode: 403,
      code: 'ACCESS_DENIED',
    });
    assertMayAuthenticate.mockRejectedValue(denial);
    const app = await buildApp();

    const response = await request(app)
      .post('/api/auth/magic-link/verify')
      .send({ email: 'revoked@williamtemple.org', token: 'tok-123' });

    expect(response.status).toBe(403);
    expect(verifyMagicLink).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('sends a malformed link back to sign-in rather than the confirm page', async () => {
    const app = await buildApp();

    const response = await request(app).get('/api/auth/callback').query({ email: 'nope' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/login?error=invalid_link');
  });
});
