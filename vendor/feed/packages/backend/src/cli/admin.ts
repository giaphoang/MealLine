// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Operator CLI for administrator authority.
 *
 * This is the recovery path the authorization design requires: bootstrapping a
 * populated instance that has no administrator, and getting back in after an
 * Allowlist-mode lockout. It is deliberately shell-only — an in-app control
 * that could restore administrator authority would not be a boundary.
 *
 * It lives under `src/` rather than `scripts/` because the production image is
 * built with `npm ci --omit=dev` and copies only `dist`, `assets`, the Prisma
 * client and `prisma/`. A `.ts` file in `scripts/` has neither a home nor a
 * `ts-node` to run it there, so the established script pattern cannot reach
 * production. Compiled into `dist`, this runs on the Pi with nothing extra:
 *
 *   docker compose exec backend node dist/cli/admin.js list
 *   docker compose exec backend node dist/cli/admin.js grant --email=… --confirm
 *   docker compose exec backend node dist/cli/admin.js revoke --email=… --confirm
 *   docker compose exec backend node dist/cli/admin.js reset-access-mode --confirm
 */

import prisma from '../db';
import { AdminAuditService } from '../services/auth/admin-audit-service';
import {
  administratorMinimumFor,
  assertAdministratorMinimum,
  countEligibleAdministrators,
} from '../services/auth/administrator-guards';
import { AccessPolicyService } from '../services/auth/access-policy-service';
import { DEVELOPER_USER_ID } from '../services/auth/development-login';
import {
  ACCESS_MODES,
  ACCESS_STATES,
  AccessMode,
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  normalizeEmail,
  ROLES,
  SYSTEM_ACTORS,
} from '../services/auth/authorization';

const CLI_ACTOR = { userId: null, label: SYSTEM_ACTORS.CLI };

const USAGE = `
FEED administrator CLI

  list                                    Show the roster
  grant --email=<address> --confirm       Promote an existing user to Administrator
  revoke --email=<address> --confirm      Return an Administrator to Staff
  reset-access-mode --confirm             Return the sign-in policy to Domain mode

--confirm is required for every command that changes something.
`.trim();

interface Args {
  command: string;
  email?: string;
  confirm: boolean;
}

const parseArgs = (argv: string[]): Args => {
  const [command = '', ...rest] = argv;
  const args: Args = { command, confirm: false };

  for (const token of rest) {
    if (token === '--confirm') {
      args.confirm = true;
    } else if (token.startsWith('--email=')) {
      args.email = token.slice('--email='.length);
    }
  }

  return args;
};

const fail = (message: string): never => {
  console.error(`\n✗ ${message}\n`);
  process.exitCode = 1;
  throw new Error(message);
};

const requireConfirm = (args: Args, command: string) => {
  if (!args.confirm) {
    fail(`Refusing to run "${command}" without --confirm.`);
  }
};

const requireEmail = (args: Args): string => {
  if (!args.email?.trim()) {
    fail('Pass the account with --email=<address>.');
  }
  return normalizeEmail(args.email as string);
};

const printRoster = async () => {
  const users = await prisma.user.findMany({
    select: {
      email: true,
      role: true,
      accessState: true,
      lastLoginAt: true,
      emailVerified: true,
    },
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
  });

  const policy = await AccessPolicyService.get();
  const eligible = await countEligibleAdministrators();
  const required = administratorMinimumFor(policy.mode as AccessMode);

  console.log(`\nAccess mode: ${policy.mode}`);
  console.log(
    `Administrators who can sign in: ${eligible} (this mode requires ${required})\n`
  );

  if (users.length === 0) {
    console.log('  (no users yet — this is a fresh instance)\n');
    return;
  }

  for (const user of users) {
    const signedIn = user.lastLoginAt
      ? user.lastLoginAt.toISOString().slice(0, 10)
      : user.emailVerified
        ? 'never since upgrade'
        : 'invited, not yet signed in';

    console.log(
      `  ${user.email.padEnd(38)} ${user.role.padEnd(14)} ${user.accessState.padEnd(9)} last sign-in: ${signedIn}`
    );
  }

  console.log('');
};

const grant = async (args: Args) => {
  requireConfirm(args, 'grant');
  const email = requireEmail(args);

  const user = await prisma.user.findUnique({ where: { email } });

  // Deliberately refuses to create. A typo would otherwise mint a roster row
  // for an address nobody controls, and in Allowlist mode that row is access.
  if (!user) {
    fail(
      `No FEED account exists for ${email}. This command promotes an existing user; ` +
        'it will not create one. Have them sign in once, or invite them from the Admin page.'
    );
    return;
  }

  if (user.id === DEVELOPER_USER_ID) {
    fail('Developer authority is session-only. Choose a real staff account for a permanent administrator role.');
  }

  if (user.role === ROLES.ADMINISTRATOR && user.accessState === ACCESS_STATES.ALLOWED) {
    console.log(`\n✓ ${email} is already an Administrator with access. No change.`);
    await printRoster();
    return;
  }

  await prisma.$transaction(async tx => {
    await tx.user.update({
      where: { id: user.id },
      data: { role: ROLES.ADMINISTRATOR, accessState: ACCESS_STATES.ALLOWED },
    });

    await AdminAuditService.record(
      {
        actor: CLI_ACTOR,
        action: AUDIT_ACTIONS.ROLE_GRANTED,
        targetType: AUDIT_TARGET_TYPES.USER,
        targetId: user.id,
        targetLabel: user.email,
        detail: {
          from: { role: user.role, accessState: user.accessState },
          to: { role: ROLES.ADMINISTRATOR, accessState: ACCESS_STATES.ALLOWED },
          via: 'operator CLI',
        },
      },
      tx
    );
  });

  console.log(`\n✓ ${email} is now an Administrator.`);
  await printRoster();
};

const revoke = async (args: Args) => {
  requireConfirm(args, 'revoke');
  const email = requireEmail(args);

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    fail(`No FEED account exists for ${email}.`);
    return;
  }

  if (user.role !== ROLES.ADMINISTRATOR) {
    console.log(`\n✓ ${email} is already Staff. No change.`);
    await printRoster();
    return;
  }

  const policy = await AccessPolicyService.get();
  const remaining = await countEligibleAdministrators(prisma, user.id);

  // The CLI is subject to the same lockout guard as the Admin page. Bypassing
  // it here would make the guard advisory.
  assertAdministratorMinimum(remaining, policy.mode as AccessMode);

  await prisma.$transaction(async tx => {
    await tx.user.update({
      where: { id: user.id },
      data: { role: ROLES.STAFF },
    });

    await AdminAuditService.record(
      {
        actor: CLI_ACTOR,
        action: AUDIT_ACTIONS.ROLE_REVOKED,
        targetType: AUDIT_TARGET_TYPES.USER,
        targetId: user.id,
        targetLabel: user.email,
        detail: { from: ROLES.ADMINISTRATOR, to: ROLES.STAFF, via: 'operator CLI' },
      },
      tx
    );
  });

  console.log(`\n✓ ${email} is now Staff.`);
  await printRoster();
};

const resetAccessMode = async (args: Args) => {
  requireConfirm(args, 'reset-access-mode');

  const policy = await AccessPolicyService.get();

  if (policy.mode === ACCESS_MODES.DOMAIN) {
    console.log('\n✓ Access mode is already Domain. No change.');
    await printRoster();
    return;
  }

  await prisma.$transaction(async tx => {
    await tx.accessPolicy.update({
      where: { id: policy.id },
      data: { mode: ACCESS_MODES.DOMAIN },
    });

    await AdminAuditService.record(
      {
        actor: CLI_ACTOR,
        action: AUDIT_ACTIONS.ACCESS_POLICY_UPDATED,
        targetType: AUDIT_TARGET_TYPES.ACCESS_POLICY,
        targetId: String(policy.id),
        targetLabel: 'Access policy',
        detail: {
          from: { mode: policy.mode },
          to: { mode: ACCESS_MODES.DOMAIN },
          via: 'operator CLI',
        },
      },
      tx
    );
  });

  console.log(
    '\n✓ Access mode reset to Domain. Anyone on the organization domain whose ' +
      'access is not revoked can sign in again.'
  );
  await printRoster();
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case 'list':
      await printRoster();
      break;
    case 'grant':
      await grant(args);
      break;
    case 'revoke':
      await revoke(args);
      break;
    case 'reset-access-mode':
      await resetAccessMode(args);
      break;
    default:
      console.log(`\n${USAGE}\n`);
      process.exitCode = args.command ? 1 : 0;
  }
};

main()
  .catch(error => {
    // fail() has already reported its own message and set the exit code.
    if (process.exitCode !== 1) {
      console.error(`\n✗ ${error instanceof Error ? error.message : error}\n`);
      process.exitCode = 1;
    }
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
