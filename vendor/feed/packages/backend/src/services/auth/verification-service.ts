// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import prisma from '../../db';
import { TokenService } from './token-service';
import { ResendService } from '../email/resend-service';
import { AccessPolicyService } from './access-policy-service';
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  AuthorizationError,
  ROLES,
} from './authorization';
import { AdminAuditService } from './admin-audit-service';

const MAGIC_LINK_EXPIRY = 10 * 60 * 1000; // 10 minutes
const OTP_EXPIRY = 3 * 60 * 1000; // 3 minutes
const MAX_OTP_ATTEMPTS = 10; // Generous for small team
const LOCKOUT_DURATION = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_HOUR = 10;

export class VerificationService {
  /**
   * Create and send magic link
   * @throws Error with user-friendly message
   */
  static async sendMagicLink(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check rate limit
    await this.checkRateLimit(normalizedEmail, 'magic_link');

    // Generate token
    const token = TokenService.generateVerificationToken();
    const hashedToken = TokenService.hashToken(token);
    const expires = new Date(Date.now() + MAGIC_LINK_EXPIRY);

    // Delete any existing magic links for this email
    await prisma.verificationToken.deleteMany({
      where: {
        identifier: normalizedEmail,
        type: 'magic_link'
      }
    });

    // Store hashed token
    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        token: hashedToken,
        type: 'magic_link',
        expires
      }
    });

    // Send email with plain token
    await ResendService.sendMagicLink(normalizedEmail, token);
  }

  /**
   * Verify magic link token
   * @returns userId if valid, null if invalid/expired
   */
  static async verifyMagicLink(email: string, token: string): Promise<string | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const hashedToken = TokenService.hashToken(token);

    // Find valid token
    const verification = await prisma.verificationToken.findFirst({
      where: {
        identifier: normalizedEmail,
        token: hashedToken,
        type: 'magic_link',
        expires: { gt: new Date() }
      }
    });

    if (!verification) {
      return null;
    }

    // Delete token (one-time use)
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: normalizedEmail,
          token: hashedToken
        }
      }
    });

    // Get or create user
    const user = await this.findOrCreateUser(normalizedEmail);
    return user.id;
  }

  /**
   * Create and send OTP code
   * @throws Error with user-friendly message
   */
  static async sendOTP(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check lockout and rate limit
    await this.checkOTPLockout(normalizedEmail);
    await this.checkRateLimit(normalizedEmail, 'otp');

    // Generate code
    const code = TokenService.generateOTP();
    const hashedCode = TokenService.hashToken(code);
    const expires = new Date(Date.now() + OTP_EXPIRY);

    // Delete any existing OTP for this email
    await prisma.verificationToken.deleteMany({
      where: {
        identifier: normalizedEmail,
        type: 'otp'
      }
    });

    // Store hashed code
    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        token: hashedCode,
        type: 'otp',
        expires
      }
    });

    // Update OtpFailure record
    await prisma.otpFailure.upsert({
      where: { email: normalizedEmail },
      create: { 
        email: normalizedEmail, 
        attempts: 0, 
        lastRequest: new Date() 
      },
      update: { lastRequest: new Date() }
    });

    // Send email with plain code
    await ResendService.sendOTP(normalizedEmail, code);
  }

  /**
   * Verify OTP code
   * @returns userId if valid, null if invalid/expired
   * @throws Error with user-friendly message on lockout
   */
  static async verifyOTP(email: string, code: string): Promise<string | null> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check lockout
    await this.checkOTPLockout(normalizedEmail);

    const hashedCode = TokenService.hashToken(code);

    // Find valid code
    const verification = await prisma.verificationToken.findFirst({
      where: {
        identifier: normalizedEmail,
        token: hashedCode,
        type: 'otp',
        expires: { gt: new Date() }
      }
    });

    if (!verification) {
      // Increment failure count
      await this.recordOTPFailure(normalizedEmail);
      return null;
    }

    // Delete code (one-time use)
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: normalizedEmail,
          token: hashedCode
        }
      }
    });

    // Reset failure count
    await prisma.otpFailure.upsert({
      where: { email: normalizedEmail },
      create: { 
        email: normalizedEmail, 
        attempts: 0 
      },
      update: { 
        attempts: 0, 
        lockedUntil: null 
      }
    });

    // Get or create user
    const user = await this.findOrCreateUser(normalizedEmail);
    return user.id;
  }

  /**
   * Check if account is locked due to failed OTP attempts
   * @throws Error if locked
   */
  private static async checkOTPLockout(email: string): Promise<void> {
    const failure = await prisma.otpFailure.findUnique({
      where: { email }
    });

    if (failure?.lockedUntil && failure.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((failure.lockedUntil.getTime() - Date.now()) / 60000);
      throw new Error(`Too many failed attempts. Please try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`);
    }
  }

  /**
   * Record failed OTP attempt and lock if threshold reached
   */
  private static async recordOTPFailure(email: string): Promise<void> {
    const failure = await prisma.otpFailure.findUnique({
      where: { email }
    });

    const attempts = (failure?.attempts || 0) + 1;
    const lockedUntil = attempts >= MAX_OTP_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_DURATION)
      : null;

    await prisma.otpFailure.upsert({
      where: { email },
      create: { 
        email, 
        attempts, 
        lockedUntil 
      },
      update: { 
        attempts, 
        lockedUntil 
      }
    });
  }

  /**
   * Check rate limit for verification requests
   * @throws Error if rate limit exceeded
   */
  private static async checkRateLimit(email: string, type: 'magic_link' | 'otp'): Promise<void> {
    const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW);

    const recentCount = await prisma.verificationToken.count({
      where: {
        identifier: email,
        type,
        createdAt: { gt: oneHourAgo }
      }
    });

    if (recentCount >= MAX_REQUESTS_PER_HOUR) {
      throw new Error('Too many requests. Please wait before requesting another code.');
    }
  }

  /**
   * Find the roster row for a verified sign-in, creating it only when the
   * access policy allows.
   *
   * In Domain mode any address on the organization domain may sign in, and a
   * first sign-in creates the row — the behavior FEED has always had. In
   * Allowlist mode the row must already exist; the access gate has established
   * that before a code was ever sent, so reaching this branch without one means
   * the policy changed mid-flight, and creating the row would quietly undo the
   * restriction.
   *
   * Records `lastLoginAt` on every successful verification. That timestamp is
   * the evidence an administrator prunes by; `emailVerified` marks account
   * creation and cannot answer "who has stopped using FEED?". An invited user
   * arrives here with a null `emailVerified`, which is set on their first
   * successful sign-in.
   */
  private static async findOrCreateUser(email: string) {
    const now = new Date();

    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      return await prisma.user.update({
        where: { id: existing.id },
        data: {
          lastLoginAt: now,
          emailVerified: existing.emailVerified ?? now
        }
      });
    }

    const mayCreate = await AccessPolicyService.mayCreateUserOnVerify();

    if (!mayCreate) {
      throw new AuthorizationError(
        'FEED access is limited to authorized staff. Contact your administrator for access.',
        403,
        'ACCESS_DENIED'
      );
    }

    // Fresh-instance bootstrap. Documented in two places
    // (docs/auth/administrator-authorization.md and the admin-page
    // implementation plan) as "empty User table -> first verified user becomes
    // Administrator", designed, and never built: `create` set no role, so the
    // schema default made every first user Staff. Nothing surfaced it, because
    // a genuinely empty instance is only ever met once — and the one time it
    // matters is disaster recovery, where the operator finds a Staff account
    // and no way into Data Management. Found by rehearsing that recovery on a
    // fresh container (ISSUES.md #82).
    //
    // The trigger is deliberately narrower than the design's: an empty roster
    // AND no encryption key, so it can only fire on an install nobody has
    // begun to set up. Granting authority to whoever signs in first is the
    // most dangerous thing this codebase can do, and the same design document
    // rejects it for a populated instance in as many words -- "a
    // privilege-escalation race during pantry hours". Two independent signals
    // of untouched-ness cost nothing and remove the single-signal failure.
    //
    // Counted and created in one transaction so two simultaneous first
    // sign-ins cannot both win the grant.
    const created = await prisma.$transaction(async (tx) => {
      const [existingUsers, encryptionKeys] = await Promise.all([
        tx.user.count(),
        tx.encryptionKey.count(),
      ]);
      const untouched = existingUsers === 0 && encryptionKeys === 0;

      const user = await tx.user.create({
        data: {
          email,
          emailVerified: now,
          lastLoginAt: now,
          ...(untouched ? { role: ROLES.ADMINISTRATOR } : {}),
        },
      });

      if (untouched) {
        // An escalation with no trail is how a privilege becomes a mystery.
        // The actor is the account being created, because there is nobody
        // else on the instance to attribute it to.
        await AdminAuditService.record({
          actor: { userId: user.id, label: user.email },
          action: AUDIT_ACTIONS.ROLE_GRANTED,
          targetType: AUDIT_TARGET_TYPES.USER,
          targetId: user.id,
          targetLabel: user.email,
          detail: { to: ROLES.ADMINISTRATOR, via: 'fresh-instance bootstrap' },
        }, tx);
      }

      return { user, untouched };
    });

    if (created.untouched) {
      console.warn(
        `[auth] Fresh-instance bootstrap: ${email} is the first verified sign-in on an `
        + 'empty instance with no encryption key, and has been granted Administrator.'
      );
    }

    return created.user;
  }
}
