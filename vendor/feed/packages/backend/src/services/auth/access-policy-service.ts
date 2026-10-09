// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import prisma from '../../db';
import { AdminAuditService, AuditActor } from './admin-audit-service';
import {
  assertAdministratorMinimum,
  countEligibleAdministrators,
} from './administrator-guards';
import {
  ACCESS_MODES,
  ACCESS_STATES,
  AccessMode,
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  AuthorizationError,
  DENIED_MESSAGE_MAX_LENGTH,
  isAccessMode,
  normalizeEmail,
  ROLES,
} from './authorization';

/**
 * The organization's sign-in policy, and the gate every authentication entry
 * point consults.
 *
 * MealLine supplies allowed domains from STAFF_EMAIL_DOMAINS at startup.
 * An empty domain list defaults to allowlist-only sign-in, never open access.
 */
const ALLOWED_EMAIL_DOMAINS = (process.env.AUTH_ALLOWED_DOMAINS ?? '')
  .split(',').map(domain => domain.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);

/** The singleton policy row, mirroring the `ExportSettings` convention. */
const POLICY_ID = 1;

const POLICY_DEFAULTS = {
  mode: ALLOWED_EMAIL_DOMAINS.length ? ACCESS_MODES.DOMAIN : ACCESS_MODES.ALLOWLIST,
  deniedMessage: 'MealLine access is limited to authorized staff.',
  contactEmail: process.env.NOURISH_ADMIN_EMAIL ?? '',
};

export interface AccessPolicyUpdate {
  mode?: string;
  deniedMessage?: string;
  contactEmail?: string;
}

export const isAllowedDomain = (email: string): boolean =>
  ALLOWED_EMAIL_DOMAINS.some(domain => normalizeEmail(email).endsWith(`@${domain}`));

export class AccessPolicyService {
  /**
   * Read the policy, creating the singleton if a database predates it.
   */
  static async get() {
    const existing = await prisma.accessPolicy.findUnique({
      where: { id: POLICY_ID },
    });

    if (existing) {
      return existing;
    }

    return prisma.accessPolicy.create({
      data: { id: POLICY_ID, ...POLICY_DEFAULTS },
    });
  }

  /**
   * The message shown to someone who may not sign in.
   *
   * One message covers both rejection cases. Distinguishing "wrong domain" from
   * "not on the roster" is an accepted disclosure: the threat model is a
   * compromised mailbox, and that attacker already knows their own address, so
   * the distinction tells them nothing they could use. Being intelligible to a
   * confused colleague is worth more.
   */
  private static denialMessage(policy: {
    deniedMessage: string;
    contactEmail: string;
  }): string {
    const contact = policy.contactEmail.trim();
    return contact
      ? `${policy.deniedMessage} Contact ${contact} for access.`
      : policy.deniedMessage;
  }

  /**
   * Gate for every authentication entry point — magic-link request, magic-link
   * callback, OTP request, and OTP verify.
   *
   * Checked at verify as well as request so a revocation that lands between the
   * two takes effect, rather than an in-flight token still resolving.
   */
  static async assertMayAuthenticate(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const policy = await this.get();

    const user = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, accessState: true },
    });

    // Revocation blocks under BOTH modes. This is what makes removing a
    // departed staff member durable: findOrCreateUser would otherwise recreate
    // the row on their next successful verification.
    if (user?.accessState === ACCESS_STATES.REVOKED) {
      throw new AuthorizationError(
        this.denialMessage(policy),
        403,
        'ACCESS_DENIED'
      );
    }

    if (policy.mode === ACCESS_MODES.ALLOWLIST) {
      if (!user) {
        throw new AuthorizationError(
          this.denialMessage(policy),
          403,
          'ACCESS_DENIED'
        );
      }
      return;
    }

    if (!isAllowedDomain(normalized)) {
      throw new AuthorizationError(
        this.denialMessage(policy),
        403,
        'ACCESS_DENIED'
      );
    }
  }

  /**
   * Whether a successful verification may create a roster row.
   *
   * Only in Domain mode. In Allowlist mode the gate above has already
   * established that a row exists.
   */
  static async mayCreateUserOnVerify(): Promise<boolean> {
    const policy = await this.get();
    return policy.mode === ACCESS_MODES.DOMAIN;
  }

  /**
   * Update mode, message, or contact address.
   *
   * Enabling Allowlist mode is the single most dangerous action in FEED: it can
   * lock every human out of production, recoverable only through a shell on the
   * host. Two guards apply, both enforced here rather than in the UI.
   */
  static async update(update: AccessPolicyUpdate, actor: AuditActor) {
    const current = await this.get();

    const nextMode: AccessMode = update.mode
      ? (() => {
          if (!isAccessMode(update.mode)) {
            throw new AuthorizationError(
              `Unknown access mode "${update.mode}". Choose Domain or Allowlist.`,
              400,
              'INVALID_ACCESS_MODE'
            );
          }
          return update.mode;
        })()
      : (current.mode as AccessMode);

    if (update.deniedMessage !== undefined) {
      const trimmed = update.deniedMessage.trim();
      if (!trimmed) {
        throw new AuthorizationError(
          'The access message cannot be empty. It is what a staff member sees when they are turned away.',
          400,
          'INVALID_DENIED_MESSAGE'
        );
      }
      if (trimmed.length > DENIED_MESSAGE_MAX_LENGTH) {
        throw new AuthorizationError(
          `The access message must be ${DENIED_MESSAGE_MAX_LENGTH} characters or fewer. Shorten it before saving.`,
          400,
          'INVALID_DENIED_MESSAGE'
        );
      }
    }

    if (update.contactEmail !== undefined && update.contactEmail.trim()) {
      const contact = normalizeEmail(update.contactEmail);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) {
        throw new AuthorizationError(
          'Enter a valid contact email address, or leave it blank to show no contact.',
          400,
          'INVALID_CONTACT_EMAIL'
        );
      }
    }

    const switchingToAllowlist =
      nextMode === ACCESS_MODES.ALLOWLIST &&
      current.mode !== ACCESS_MODES.ALLOWLIST;

    if (switchingToAllowlist) {
      await this.assertSafeToEnableAllowlist(actor);
    }

    const saved = await prisma.$transaction(async tx => {
      const policy = await tx.accessPolicy.update({
        where: { id: POLICY_ID },
        data: {
          mode: nextMode,
          ...(update.deniedMessage !== undefined
            ? { deniedMessage: update.deniedMessage.trim() }
            : {}),
          ...(update.contactEmail !== undefined
            ? { contactEmail: normalizeEmail(update.contactEmail) }
            : {}),
        },
      });

      await AdminAuditService.record(
        {
          actor,
          action: AUDIT_ACTIONS.ACCESS_POLICY_UPDATED,
          targetType: AUDIT_TARGET_TYPES.ACCESS_POLICY,
          targetId: String(POLICY_ID),
          targetLabel: 'Access policy',
          detail: {
            from: {
              mode: current.mode,
              deniedMessage: current.deniedMessage,
              contactEmail: current.contactEmail,
            },
            to: {
              mode: policy.mode,
              deniedMessage: policy.deniedMessage,
              contactEmail: policy.contactEmail,
            },
          },
        },
        tx
      );

      return policy;
    });

    return saved;
  }

  /**
   * Refuse to enable Allowlist mode unless the instance would survive it.
   *
   * The acting administrator must be on the roster and allowed — otherwise the
   * person making the change is locked out by their own change — and two
   * administrators must already be able to sign in.
   */
  private static async assertSafeToEnableAllowlist(
    actor: AuditActor
  ): Promise<void> {
    if (actor.userId) {
      const acting = await prisma.user.findUnique({
        where: { id: actor.userId },
        select: { accessState: true, role: true },
      });

      if (!acting || acting.accessState === ACCESS_STATES.REVOKED) {
        throw new AuthorizationError(
          'Your own account is not on the roster or has been revoked, so switching to Allowlist mode would lock you out. ' +
            'Restore your access first.',
          409,
          'ALLOWLIST_WOULD_LOCK_OUT_ACTOR'
        );
      }

      if (acting.role !== ROLES.ADMINISTRATOR) {
        throw new AuthorizationError(
          'Only an Administrator can change the access mode.',
          403,
          'FORBIDDEN'
        );
      }
    }

    const eligible = await countEligibleAdministrators();
    assertAdministratorMinimum(eligible, ACCESS_MODES.ALLOWLIST);
  }
}
