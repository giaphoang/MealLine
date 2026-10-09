import { Router } from 'express';
import prisma from '../../db';
import { createRouteError } from '../../lib/route-error';
import { AdminAuditService } from '../../services/auth/admin-audit-service';
import { ACCESS_STATES, AUDIT_ACTIONS, ROLES } from '../../services/auth/authorization';
import {
  DEVELOPER_EMAIL, DEVELOPER_SESSION_MS, DEVELOPER_USER_ID,
  developmentLoginEnabled, isLocalDevelopmentRequest,
} from '../../services/auth/development-login';
import { TokenService } from '../../services/auth/token-service';

const router = Router();

router.get('/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ enabled: isLocalDevelopmentRequest(req) });
});

router.post('/', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    if (!developmentLoginEnabled()) {
      throw createRouteError('Developer sign-in is disabled.', 404, 'DEV_LOGIN_DISABLED');
    }
    if (!isLocalDevelopmentRequest(req, true) || !req.is('application/json')) {
      throw createRouteError('Developer sign-in is only available directly on localhost from this app.', 403, 'DEV_LOGIN_LOCAL_ONLY');
    }

    const { user, token } = await prisma.$transaction(async tx => {
      const existing = await tx.user.findUnique({ where: { id: DEVELOPER_USER_ID } });
      if (existing && (existing.email !== DEVELOPER_EMAIL || existing.role !== ROLES.STAFF)) {
        throw createRouteError('The development identity conflicts with an existing account. Review it before signing in.', 409, 'DEV_LOGIN_ACCOUNT_CONFLICT');
      }
      if (existing?.accessState === ACCESS_STATES.REVOKED) {
        throw createRouteError('The development identity has been revoked. Restore its access explicitly before using it.', 403, 'ACCESS_REVOKED');
      }
      // Persist only a neutral Staff identity for audit/FK attribution. Its
      // administrator authority exists only in a scoped development session;
      // it never counts as a real administrator in production lockout guards.
      const identity = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } })
        : await tx.user.create({ data: { id: DEVELOPER_USER_ID, email: DEVELOPER_EMAIL, role: ROLES.STAFF, accessState: ACCESS_STATES.ALLOWED, lastLoginAt: new Date() } });
      const token = TokenService.generateDevelopmentJWT(identity.id, identity.email);
      await AdminAuditService.record({
        actor: { userId: identity.id, label: identity.email },
        action: AUDIT_ACTIONS.DEVELOPMENT_SIGN_IN,
        targetId: identity.id,
        detail: { developmentOnly: true, sessionMinutes: DEVELOPER_SESSION_MS / 60000 },
      }, tx);
      return { user: identity, token };
    });

    res.cookie('auth_token', token, {
      httpOnly: true, secure: req.secure, sameSite: 'strict', path: '/', maxAge: DEVELOPER_SESSION_MS,
    });
    res.json({ success: true, user: { id: user.id, email: user.email, role: ROLES.ADMINISTRATOR }, developmentOnly: true });
  } catch (error) {
    next(error);
  }
});

export default router;
