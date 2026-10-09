// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import prisma from '../../db';
import { ResendService } from '../email/resend-service';
import { AccessPolicyService, isAllowedDomain } from './access-policy-service';
import { AdminAuditService, AuditActor } from './admin-audit-service';
import { DEVELOPER_USER_ID } from './development-login';
import {
  administratorMinimumFor,
  assertAdministratorMinimum,
  countEligibleAdministrators,
} from './administrator-guards';
import {
  ACCESS_STATES,
  AccessMode,
  AccessState,
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  AuthorizationError,
  isAccessState,
  isRole,
  normalizeEmail,
  Role,
  ROLES,
} from './authorization';

/**
 * The user roster — one list that is both the access list and the role list.
 *
 * Keeping them unified avoids two lists that drift. In Allowlist mode,
 * membership *is* access; in Domain mode, membership records who has signed in
 * and carries the revocation flag.
 */

const ROSTER_SELECT = {
  id: true,
  email: true,
  role: true,
  accessState: true,
  emailVerified: true,
  lastLoginAt: true,
  invitedAt: true,
  invitedBy: true,
  createdAt: true,
} as const;

export interface InviteResult {
  user: Awaited<ReturnType<typeof RosterService.list>>[number];
  invitationEmailSent: boolean;
}

export class RosterService {
  static async list() {
    return prisma.user.findMany({
      select: ROSTER_SELECT,
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
    });
  }

  private static async requireUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: ROSTER_SELECT,
    });

    if (!user) {
      throw new AuthorizationError(
        'That user is no longer on the roster. Refresh the page to see the current list.',
        404,
        'USER_NOT_FOUND'
      );
    }

    return user;
  }

  private static async currentMode(): Promise<AccessMode> {
    const policy = await AccessPolicyService.get();
    return policy.mode as AccessMode;
  }

  /**
   * Add someone to the roster before their first sign-in.
   *
   * The invitation email carries no token — it links to the login page, where
   * the recipient enters their address and receives a code. A mail scanner that
   * prefetches the link therefore cannot consume anything, which is the same
   * failure that makes magic links unusable at William Temple House.
   */
  static async invite(email: string, actor: AuditActor): Promise<InviteResult> {
    const normalized = normalizeEmail(email);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      throw new AuthorizationError(
        'Enter a valid email address to invite.',
        400,
        'INVALID_EMAIL'
      );
    }

    // Both modes require the organization domain — Allowlist mode is a strict
    // narrowing of Domain mode, never a widening. An invite for an address that
    // could never authenticate would be a roster row that does nothing.
    if (!isAllowedDomain(normalized)) {
      throw new AuthorizationError(
        'FEED accounts must use an organization email address. Invite their work address instead.',
        400,
        'INVALID_EMAIL_DOMAIN'
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, accessState: true },
    });

    if (existing) {
      throw new AuthorizationError(
        existing.accessState === ACCESS_STATES.REVOKED
          ? `${normalized} is already on the roster with access revoked. Restore their access instead of inviting them again.`
          : `${normalized} is already on the roster.`,
        409,
        'USER_ALREADY_EXISTS'
      );
    }

    const user = await prisma.$transaction(async tx => {
      const created = await tx.user.create({
        data: {
          email: normalized,
          role: ROLES.STAFF,
          accessState: ACCESS_STATES.ALLOWED,
          invitedAt: new Date(),
          invitedBy: actor.label,
        },
        select: ROSTER_SELECT,
      });

      await AdminAuditService.record(
        {
          actor,
          action: AUDIT_ACTIONS.USER_INVITED,
          targetType: AUDIT_TARGET_TYPES.USER,
          targetId: created.id,
          targetLabel: created.email,
          detail: { role: ROLES.STAFF },
        },
        tx
      );

      return created;
    });

    // Sent outside the transaction: a mail failure should not discard a roster
    // row the administrator can simply re-notify about.
    let invitationEmailSent = true;
    try {
      await ResendService.sendInvitation(normalized);
    } catch (error) {
      invitationEmailSent = false;
      console.error('[RosterService] Invitation email failed:', error);
    }

    return { user, invitationEmailSent };
  }

  static async setRole(userId: string, role: string, actor: AuditActor) {
    if (!isRole(role)) {
      throw new AuthorizationError(
        `Unknown role "${role}". Choose Staff or Administrator.`,
        400,
        'INVALID_ROLE'
      );
    }

    if (userId === DEVELOPER_USER_ID && role !== ROLES.STAFF) {
      throw new AuthorizationError('Developer authority is session-only. Choose a real staff account for a permanent administrator role.', 409, 'DEV_LOGIN_ACCOUNT_CONFLICT');
    }

    const user = await this.requireUser(userId);

    if (user.role === role) {
      return user;
    }

    // Demoting an administrator who can currently sign in reduces the pool the
    // lockout guard protects.
    if (
      user.role === ROLES.ADMINISTRATOR &&
      user.accessState === ACCESS_STATES.ALLOWED
    ) {
      const mode = await this.currentMode();
      const remaining = await countEligibleAdministrators(prisma, user.id);
      assertAdministratorMinimum(remaining, mode);
    }

    return prisma.$transaction(async tx => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { role },
        select: ROSTER_SELECT,
      });

      await AdminAuditService.record(
        {
          actor,
          action:
            role === ROLES.ADMINISTRATOR
              ? AUDIT_ACTIONS.ROLE_GRANTED
              : AUDIT_ACTIONS.ROLE_REVOKED,
          targetType: AUDIT_TARGET_TYPES.USER,
          targetId: updated.id,
          targetLabel: updated.email,
          detail: { from: user.role, to: role },
        },
        tx
      );

      return updated;
    });
  }

  static async setAccess(
    userId: string,
    accessState: string,
    actor: AuditActor
  ) {
    if (!isAccessState(accessState)) {
      throw new AuthorizationError(
        `Unknown access state "${accessState}".`,
        400,
        'INVALID_ACCESS_STATE'
      );
    }

    const user = await this.requireUser(userId);

    if (user.accessState === accessState) {
      return user;
    }

    if (
      accessState === ACCESS_STATES.REVOKED &&
      user.role === ROLES.ADMINISTRATOR &&
      user.accessState === ACCESS_STATES.ALLOWED
    ) {
      const mode = await this.currentMode();
      const remaining = await countEligibleAdministrators(prisma, user.id);
      assertAdministratorMinimum(remaining, mode);
    }

    return prisma.$transaction(async tx => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { accessState: accessState as AccessState },
        select: ROSTER_SELECT,
      });

      await AdminAuditService.record(
        {
          actor,
          action:
            accessState === ACCESS_STATES.REVOKED
              ? AUDIT_ACTIONS.ACCESS_REVOKED
              : AUDIT_ACTIONS.ACCESS_RESTORED,
          targetType: AUDIT_TARGET_TYPES.USER,
          targetId: updated.id,
          targetLabel: updated.email,
          detail: { from: user.accessState, to: accessState },
        },
        tx
      );

      return updated;
    });
  }

  /**
   * Remove a roster row entirely.
   *
   * Note that deletion alone is not a durable block in Domain mode: a
   * `@williamtemple.org` address that can still receive mail would be recreated
   * on their next successful verification. Revoking is the durable action;
   * deletion is for rows that were created in error.
   */
  static async remove(userId: string, actor: AuditActor) {
    const user = await this.requireUser(userId);

    if (
      user.role === ROLES.ADMINISTRATOR &&
      user.accessState === ACCESS_STATES.ALLOWED
    ) {
      const mode = await this.currentMode();
      const remaining = await countEligibleAdministrators(prisma, user.id);
      assertAdministratorMinimum(remaining, mode);
    }

    await prisma.$transaction(async tx => {
      await tx.user.delete({ where: { id: user.id } });

      await AdminAuditService.record(
        {
          actor,
          action: AUDIT_ACTIONS.USER_DELETED,
          targetType: AUDIT_TARGET_TYPES.USER,
          targetId: user.id,
          targetLabel: user.email,
          detail: { role: user.role, accessState: user.accessState },
        },
        tx
      );
    });

    return user;
  }

  /**
   * Roster health for the Admin page banner: how many administrators can
   * actually sign in, and how many this mode requires.
   */
  static async administratorSummary() {
    const mode = await this.currentMode();
    const eligible = await countEligibleAdministrators();

    return { mode, eligible, required: administratorMinimumFor(mode) };
  }
}

export type { Role, AccessState };
