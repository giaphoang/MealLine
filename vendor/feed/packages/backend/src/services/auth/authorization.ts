// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Shared authorization vocabulary.
 *
 * Roles authorize *actions*. They never partition feature data — every
 * authenticated user continues to see the same shared organization dataset
 * (AGENTS.md, "Shared Whole-Organization Environment"). `req.auth.userId` gates
 * access and attributes audit entries; it is never a query filter.
 *
 * The schema stores these as plain strings (this project uses no Prisma enums),
 * so these constants are the single source of truth for the accepted values.
 */

export const ROLES = {
  STAFF: 'STAFF',
  ADMINISTRATOR: 'ADMINISTRATOR',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ACCESS_STATES = {
  ALLOWED: 'ALLOWED',
  REVOKED: 'REVOKED',
} as const;

export type AccessState = (typeof ACCESS_STATES)[keyof typeof ACCESS_STATES];

export const ACCESS_MODES = {
  /** Any address on the allowed domain may sign in. Current behavior. */
  DOMAIN: 'DOMAIN',
  /** Only an existing, non-revoked roster row may sign in. */
  ALLOWLIST: 'ALLOWLIST',
} as const;

export type AccessMode = (typeof ACCESS_MODES)[keyof typeof ACCESS_MODES];

export const AUDIT_ACTIONS = {
  DEVELOPMENT_SIGN_IN: 'DEVELOPMENT_SIGN_IN',
  ROLE_GRANTED: 'ROLE_GRANTED',
  ROLE_REVOKED: 'ROLE_REVOKED',
  ACCESS_REVOKED: 'ACCESS_REVOKED',
  ACCESS_RESTORED: 'ACCESS_RESTORED',
  USER_INVITED: 'USER_INVITED',
  USER_DELETED: 'USER_DELETED',
  ACCESS_POLICY_UPDATED: 'ACCESS_POLICY_UPDATED',
  BACKUP_DOWNLOADED: 'BACKUP_DOWNLOADED',
  // Recorded before the swap, so the entry survives in the pre-restore
  // snapshot. The restored database will not contain it — the audit log is
  // carried across from the live file, so it does.
  BACKUP_RESTORED: 'BACKUP_RESTORED',
  // The counterpart, and the reason the entry above cannot simply be moved
  // after the swap. A restore that fails leaves the live database untouched,
  // so an unqualified BACKUP_RESTORED would stand as a record of something
  // that did not happen. This is appended in that case; the pair reads as
  // "attempted, then failed" rather than as a silent lie. See ISSUES.md #81.
  BACKUP_RESTORE_FAILED: 'BACKUP_RESTORE_FAILED',
  // Reset discards data on purpose; restore recovers it. Separate actions so
  // the history never blurs the two.
  CLEAN_SLATE_APPLIED: 'CLEAN_SLATE_APPLIED',
  BRAND_ASSETS_CLEANED: 'BRAND_ASSETS_CLEANED',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_TARGET_TYPES = {
  USER: 'USER',
  ACCESS_POLICY: 'ACCESS_POLICY',
  BACKUP: 'BACKUP',
  DATABASE: 'DATABASE',
} as const;

export type AuditTargetType =
  (typeof AUDIT_TARGET_TYPES)[keyof typeof AUDIT_TARGET_TYPES];

/** Non-interactive actors. Recorded in `actorLabel` with a null `actorUserId`. */
export const SYSTEM_ACTORS = {
  MIGRATION: 'system:beta.4-migration',
  CLI: 'operator:cli',
} as const;

/** Upper bound on the configurable denial message. */
export const DENIED_MESSAGE_MAX_LENGTH = 240;

export const isRole = (value: unknown): value is Role =>
  value === ROLES.STAFF || value === ROLES.ADMINISTRATOR;

export const isAccessState = (value: unknown): value is AccessState =>
  value === ACCESS_STATES.ALLOWED || value === ACCESS_STATES.REVOKED;

export const isAccessMode = (value: unknown): value is AccessMode =>
  value === ACCESS_MODES.DOMAIN || value === ACCESS_MODES.ALLOWLIST;

/**
 * An error whose message was deliberately written for a user.
 *
 * The global error handler only forwards a message to the browser when
 * `statusCode` is 4xx; anything else is treated as an internal failure and
 * replaced. Guard refusals and access denials are exactly the cases that need
 * their own wording to reach staff, so they carry an explicit 4xx.
 */
export class AuthorizationError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 403, code = 'FORBIDDEN') {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const normalizeEmail = (email: string): string =>
  email.toLowerCase().trim();
