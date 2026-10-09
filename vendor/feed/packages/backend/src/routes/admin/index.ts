// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { z } from 'zod';
import { rateLimiter } from '../../middleware/rate-limiter';
import { auditActorFrom, requireAdmin } from '../../middleware/auth/require-admin';
import { AccessPolicyService } from '../../services/auth/access-policy-service';
import { AdminAuditService } from '../../services/auth/admin-audit-service';
import { RosterService } from '../../services/auth/roster-service';
import { SanitizedBackupService } from '../../services/backup/sanitized-backup';
import { DatabaseSummaryService } from '../../services/backup/database-summary';
import deploymentSettingsRouter from './deployment-settings';
import restoreRouter from './restore';
import brandRouter from './brand';
import {
  ACCESS_MODES,
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  DENIED_MESSAGE_MAX_LENGTH,
  ROLES,
} from '../../services/auth/authorization';

/**
 * Administrator-only surfaces: the user roster, the sign-in policy, and the
 * privileged-action history.
 *
 * `requireAdmin` is applied to the whole router rather than per route, so a
 * handler added later cannot be left unguarded by omission. Omitting the Admin
 * page from Staff navigation is presentation; this is the boundary.
 */
const router = Router();

router.use(requireAdmin);

// Restore lives in its own file: it carries multipart handling and a mechanism
// heavy enough that mixing it into the roster and policy routes would obscure
// both. `requireAdmin` above already applies to it.
router.use('/restore', restoreRouter);
router.use('/brand', brandRouter);
router.use('/deployment-settings', deploymentSettingsRouter);

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address to invite.'),
});

const roleSchema = z.object({
  role: z.enum([ROLES.STAFF, ROLES.ADMINISTRATOR]),
});

const accessSchema = z.object({
  accessState: z.enum(['ALLOWED', 'REVOKED']),
});

const policySchema = z
  .object({
    mode: z.enum([ACCESS_MODES.DOMAIN, ACCESS_MODES.ALLOWLIST]).optional(),
    deniedMessage: z.string().max(DENIED_MESSAGE_MAX_LENGTH).optional(),
    contactEmail: z.string().optional(),
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'Nothing to update.',
  });

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  action: z.string().optional(),
  actorUserId: z.string().optional(),
});

const badRequest = (message: string, code: string) => {
  const error = new Error(message) as Error & {
    statusCode?: number;
    code?: string;
  };
  error.statusCode = 400;
  error.code = code;
  return error;
};

/** GET /api/admin/users — the roster, plus the administrator-count banner. */
router.get('/users', rateLimiter, async (_req, res, next) => {
  try {
    const [users, administrators] = await Promise.all([
      RosterService.list(),
      RosterService.administratorSummary(),
    ]);

    res.json({ users, administrators });
  } catch (error) {
    next(error);
  }
});

/** POST /api/admin/users/invite — add someone before their first sign-in. */
router.post('/users/invite', rateLimiter, async (req, res, next) => {
  try {
    const parsed = inviteSchema.safeParse(req.body);

    if (!parsed.success) {
      throw badRequest(
        parsed.error.issues[0]?.message ?? 'Enter a valid email address to invite.',
        'INVALID_EMAIL'
      );
    }

    const result = await RosterService.invite(
      parsed.data.email,
      auditActorFrom(req)
    );

    res.status(201).json({
      user: result.user,
      invitationEmailSent: result.invitationEmailSent,
    });
  } catch (error) {
    next(error);
  }
});

/** PUT /api/admin/users/:id/role — promote or demote. */
router.put('/users/:id/role', rateLimiter, async (req, res, next) => {
  try {
    const parsed = roleSchema.safeParse(req.body);

    if (!parsed.success) {
      throw badRequest(
        'Choose either Staff or Administrator.',
        'INVALID_ROLE'
      );
    }

    const user = await RosterService.setRole(
      req.params.id,
      parsed.data.role,
      auditActorFrom(req)
    );

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

/** PUT /api/admin/users/:id/access — revoke or restore. */
router.put('/users/:id/access', rateLimiter, async (req, res, next) => {
  try {
    const parsed = accessSchema.safeParse(req.body);

    if (!parsed.success) {
      throw badRequest(
        'Choose either Allowed or Revoked.',
        'INVALID_ACCESS_STATE'
      );
    }

    const user = await RosterService.setAccess(
      req.params.id,
      parsed.data.accessState,
      auditActorFrom(req)
    );

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

/** DELETE /api/admin/users/:id — remove a roster row. */
router.delete('/users/:id', rateLimiter, async (req, res, next) => {
  try {
    const user = await RosterService.remove(req.params.id, auditActorFrom(req));
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

/** GET /api/admin/access-policy — current mode, message, and contact. */
router.get('/access-policy', rateLimiter, async (_req, res, next) => {
  try {
    const [policy, administrators] = await Promise.all([
      AccessPolicyService.get(),
      RosterService.administratorSummary(),
    ]);

    res.json({ policy, administrators });
  } catch (error) {
    next(error);
  }
});

/** PUT /api/admin/access-policy — change mode, message, or contact. */
router.put('/access-policy', rateLimiter, async (req, res, next) => {
  try {
    const parsed = policySchema.safeParse(req.body);

    if (!parsed.success) {
      throw badRequest(
        parsed.error.issues[0]?.message ??
          'Check the access settings and try again.',
        'INVALID_ACCESS_POLICY'
      );
    }

    const policy = await AccessPolicyService.update(
      parsed.data,
      auditActorFrom(req)
    );

    res.json({ policy });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/database-summary — what the database currently holds.
 *
 * Counted over the same table contract the backup exports, so the figures
 * describe exactly what a backup would contain.
 */
router.get('/database-summary', rateLimiter, async (_req, res, next) => {
  try {
    res.json({ summary: await DatabaseSummaryService.get() });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/backup — download a sanitized logical backup.
 *
 * Not a database snapshot. It deliberately omits key material, authentication
 * records, and authority (see services/backup/table-contract.ts, and
 * docs/data-management/backup-and-restore.md for why the distinction matters).
 * The artifact names its own exclusions so the file is self-describing.
 */
router.get('/backup', rateLimiter, async (req, res, next) => {
  try {
    const actor = auditActorFrom(req);
    const backup = await SanitizedBackupService.create(actor.label);

    await AdminAuditService.record({
      actor,
      action: AUDIT_ACTIONS.BACKUP_DOWNLOADED,
      targetType: AUDIT_TARGET_TYPES.BACKUP,
      targetLabel: SanitizedBackupService.filename(backup.manifest.generatedAt),
      detail: {
        tableContractVersion: backup.manifest.tableContractVersion,
        schemaVersion: backup.manifest.schemaVersion,
        checksum: backup.manifest.checksum,
        rowCounts: backup.manifest.rowCounts,
      },
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${SanitizedBackupService.filename(backup.manifest.generatedAt)}"`
    );
    res.send(JSON.stringify(backup, null, 2));
  } catch (error) {
    next(error);
  }
});

/** GET /api/admin/audit — privileged-action history, newest first. */
router.get('/audit', rateLimiter, async (req, res, next) => {
  try {
    const parsed = auditQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      throw badRequest(
        'Check the audit filters and try again.',
        'INVALID_AUDIT_QUERY'
      );
    }

    const result = await AdminAuditService.list(parsed.data);

    res.json({
      auditEntries: result.entries,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
