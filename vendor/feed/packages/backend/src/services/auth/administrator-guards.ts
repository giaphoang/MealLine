// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Prisma } from '@prisma/client';
import prisma from '../../db';
import {
  ACCESS_MODES,
  ACCESS_STATES,
  AccessMode,
  AuthorizationError,
  ROLES,
} from './authorization';

/**
 * Lockout guards.
 *
 * These live in their own module so both the access-policy service and the
 * roster service can use them without importing each other.
 *
 * The minimum scales with the access mode, because the risk does. In Domain
 * mode, locking everyone out requires losing the entire mail domain — the
 * organization has larger problems than FEED. In Allowlist mode the roster is
 * the only door, so it needs a second key: a primary and an alternate, so a
 * changed or compromised mailbox cannot strand the instance.
 *
 * Scaling this way also keeps FEED viable for a single-administrator pantry
 * that never leaves Domain mode.
 */

/** Domain mode: someone must still hold authority. */
export const ADMIN_MINIMUM_DOMAIN = 1;

/** Allowlist mode: a primary and an alternate must both be able to sign in. */
export const ADMIN_MINIMUM_ALLOWLIST = 2;

type PrismaLike = Prisma.TransactionClient | typeof prisma;

export const administratorMinimumFor = (mode: AccessMode): number =>
  mode === ACCESS_MODES.ALLOWLIST
    ? ADMIN_MINIMUM_ALLOWLIST
    : ADMIN_MINIMUM_DOMAIN;

/**
 * Administrators who could actually sign in right now — the only ones that
 * count toward a lockout guard. A revoked administrator holds a role they
 * cannot use.
 */
export const countEligibleAdministrators = async (
  client: PrismaLike = prisma,
  excludeUserId?: string
): Promise<number> =>
  client.user.count({
    where: {
      role: ROLES.ADMINISTRATOR,
      accessState: ACCESS_STATES.ALLOWED,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });

/**
 * Refuse a change that would drop eligible administrators below the minimum
 * for the given mode.
 *
 * `remaining` is the count that *would* exist after the change. Enforced at the
 * route as well as the UI — a hidden button is not a boundary.
 */
export const assertAdministratorMinimum = (
  remaining: number,
  mode: AccessMode
): void => {
  const minimum = administratorMinimumFor(mode);

  if (remaining >= minimum) {
    return;
  }

  if (minimum === ADMIN_MINIMUM_DOMAIN) {
    throw new AuthorizationError(
      'This change would leave FEED with no administrator. Promote another user to Administrator first.',
      409,
      'LAST_ADMINISTRATOR'
    );
  }

  // Three short sentences: what happens, the rule, the way out. This lands in
  // a toast, and an administrator hitting a failsafe wants to know what to do
  // next — not to read a paragraph about mailboxes. The action that triggered
  // it is deliberately not named: "This change" covers a demotion, a revoke,
  // and a switch to Allowlist mode without a sentence per caller.
  // "only 0 administrators" is what a template produces, not what a person
  // writes. Both counts are spelled out.
  const left =
    remaining === 0
      ? 'no administrators'
      : remaining === 1
        ? 'only one administrator'
        : `only ${remaining} administrators`;

  throw new AuthorizationError(
    `This change would leave ${left}. ` +
      'Allowlist mode requires two. ' +
      'Promote another administrator or switch to Domain mode.',
    409,
    'ALLOWLIST_ADMINISTRATOR_MINIMUM'
  );
};
