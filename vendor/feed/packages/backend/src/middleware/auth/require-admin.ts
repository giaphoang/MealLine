// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Request, Response, NextFunction } from 'express';
import { AuditActor } from '../../services/auth/admin-audit-service';
import { ACCESS_STATES, ROLES } from '../../services/auth/authorization';

/**
 * Require Administrator authority.
 *
 * Reads the authority `jwtAuthMiddleware` already loaded from the database, so
 * this adds no second query.
 *
 * `req.auth` must be *present*, not merely non-administrative. The legacy Basic
 * Auth middleware calls `next()` without setting it when
 * `NODE_ENV === 'development' && FORCE_AUTH !== 'true'`, and a guard that read a
 * missing `auth` as permissive would be a production-shaped hole opened by a
 * development convenience. The cost is that local administrator work needs a
 * real session — see AGENTS.md, "Auth in dev is subtle".
 *
 * Hiding the Admin page from Staff navigation is presentation. This is the
 * boundary.
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.auth?.userId) {
    return res.status(401).json({
      error: {
        message: 'Please sign in to continue.',
        code: 'AUTH_REQUIRED',
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Self-sufficient rather than trusting the order of middleware.
  // `jwtAuthMiddleware` already ends a revoked session before routing, so in
  // the mounted app this never fires — but a guard whose correctness depends on
  // something upstream silently opens if that ordering ever changes, or if this
  // is mounted somewhere the session middleware does not cover.
  if (req.auth.accessState === ACCESS_STATES.REVOKED) {
    return res.status(403).json({
      error: {
        message:
          'Your FEED access has ended. Contact your administrator if you think this is a mistake.',
        code: 'ACCESS_REVOKED',
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (req.auth.role !== ROLES.ADMINISTRATOR) {
    return res.status(403).json({
      error: {
        message:
          'This area is limited to administrators. Ask an administrator if you need access.',
        code: 'ADMIN_REQUIRED',
        timestamp: new Date().toISOString(),
      },
    });
  }

  return next();
};

/**
 * The acting administrator, for audit attribution. Only valid downstream of
 * `requireAdmin`.
 */
export const auditActorFrom = (req: Request): AuditActor => ({
  userId: req.auth?.userId ?? null,
  label: req.auth?.email ?? 'unknown',
});
