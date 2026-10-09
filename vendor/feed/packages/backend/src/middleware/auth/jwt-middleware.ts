// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Request, Response, NextFunction } from 'express';
import prisma from '../../db';
import { TokenService } from '../../services/auth/token-service';
import { ACCESS_STATES, ROLES } from '../../services/auth/authorization';
import { DEVELOPER_USER_ID, DEVELOPER_EMAIL, isLocalDevelopmentRequest } from '../../services/auth/development-login';

const cookieDomain = process.env.COOKIE_DOMAIN?.trim();
const cookieDomainOption = cookieDomain ? cookieDomain : undefined;

const clearAuthCookie = (res: Response) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    domain: cookieDomainOption,
  });
};

/**
 * Verify the session cookie and load the caller's current authority.
 *
 * The JWT proves *identity* only. Role and access state come from a database
 * read on every authenticated request, because the token lives seven days and a
 * revocation that took a week to bite would make the access policy advisory
 * rather than enforced. One indexed point lookup on a table holding a handful
 * of rows, which SQLite serves from page cache; WAL mode (1.5.0-beta.2) means
 * it does not queue behind a running import.
 *
 * The read is skipped entirely when there is no cookie — anonymous requests
 * reach the public routes and the login endpoints unchanged.
 */
export const jwtAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.cookies?.auth_token;

  if (!token) {
    return next();
  }

  let payload: ReturnType<typeof TokenService.verifyJWT>;

  try {
    payload = TokenService.verifyJWT(token);
  } catch (error) {
    console.warn('[Auth] JWT verification failed:', error);
    payload = null;
  }

  if (!payload) {
    clearAuthCookie(res);
    return next();
  }

  if ((payload.developmentLogin || payload.userId === DEVELOPER_USER_ID)
    && (payload.developmentLogin !== true || payload.userId !== DEVELOPER_USER_ID
      || payload.email !== DEVELOPER_EMAIL || !isLocalDevelopmentRequest(req))) {
    clearAuthCookie(res);
    return res.status(401).json({ error: { message: 'This developer session is no longer available. Sign in normally or enable local development login.', code: 'DEV_SESSION_UNAVAILABLE' } });
  }

  let user;

  try {
    user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, accessState: true },
    });
  } catch (error) {
    // Fail closed, but not as though the session were invalid. A 401 would
    // clear the cookie and bounce every signed-in user to a login screen that
    // fails identically — a database blip would read as a mass revocation.
    console.error('[Auth] Session revalidation failed:', error);
    return res.status(503).json({
      error: {
        message:
          'FEED cannot confirm your sign-in right now. Wait a moment and try again.',
        code: 'SESSION_REVALIDATION_UNAVAILABLE',
        timestamp: new Date().toISOString(),
      },
    });
  }

  // The account was deleted, or access was revoked, after this token was
  // issued. Both end the session on the next request.
  if (!user || user.accessState === ACCESS_STATES.REVOKED) {
    clearAuthCookie(res);
    return res.status(401).json({
      error: {
        message:
          'Your FEED access has ended. Contact your administrator if you think this is a mistake.',
        code: 'ACCESS_REVOKED',
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (payload.developmentLogin && (user.email !== DEVELOPER_EMAIL || user.role !== ROLES.STAFF)) {
    clearAuthCookie(res);
    return res.status(401).json({ error: { message: 'The development identity has changed. Review it before signing in again.', code: 'DEV_LOGIN_ACCOUNT_CONFLICT' } });
  }

  req.auth = {
    userId: user.id,
    email: user.email,
    // Real accounts always use current database authority. Only the explicitly
    // marked, loopback-only developer session has temporary admin authority.
    role: payload.developmentLogin ? ROLES.ADMINISTRATOR : user.role,
    accessState: user.accessState,
  };

  return next();
};
