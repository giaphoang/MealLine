// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Administrator authority, the sign-in gate, and the lockout guards.
 *
 * These are the paths where a mistake is expensive: one direction locks every
 * user out of production, the other quietly grants authority. They are tested
 * against a small in-memory stand-in for the client rather than mocked call by
 * call, so the guard branching is exercised for real.
 */

const { mockDb } = vi.hoisted(() => {
  type Row = Record<string, any>;
  const state: { users: Row[]; policy: Row; audit: Row[] } = {
    users: [],
    policy: {},
    audit: [],
  };

  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === 'object' && 'not' in value) {
        return row[key] !== (value as any).not;
      }
      return row[key] === value;
    });

  const client: any = {
    user: {
      findUnique: async ({ where }: any) =>
        state.users.find(u =>
          where.id !== undefined ? u.id === where.id : u.email === where.email
        ) ?? null,
      findMany: async () => [...state.users],
      count: async ({ where }: any = {}) =>
        state.users.filter(u => matches(u, where)).length,
      create: async ({ data }: any) => {
        const row = { id: `u${state.users.length + 1}`, ...data };
        state.users.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = state.users.find(u => u.id === where.id);
        // Throw rather than assert non-null: a mock quietly assigning onto
        // `undefined` would fail somewhere far from the cause.
        if (!row) throw new Error(`mock update: no user ${where.id}`);
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: any) => {
        const index = state.users.findIndex(u => u.id === where.id);
        return state.users.splice(index, 1)[0];
      },
    },
    accessPolicy: {
      findUnique: async () => state.policy ?? null,
      create: async ({ data }: any) => {
        state.policy = { ...data };
        return state.policy;
      },
      update: async ({ data }: any) => {
        Object.assign(state.policy, data);
        return state.policy;
      },
    },
    adminAuditLog: {
      create: async ({ data }: any) => {
        state.audit.push(data);
        return data;
      },
      findMany: async () => [...state.audit],
      count: async () => state.audit.length,
    },
    // The services wrap mutation + audit in one transaction so a grant cannot
    // land without its record. The stand-in runs the callback against itself.
    $transaction: async (fn: any) => fn(client),
  };

  const reset = (users: Row[], mode = 'DOMAIN') => {
    state.users = users.map(u => ({ ...u }));
    state.policy = {
      id: 1,
      mode,
      deniedMessage: 'FEED access is limited to authorized staff.',
      contactEmail: 'technology@williamtemple.org',
    };
    state.audit = [];
  };

  return { mockDb: { client, state, reset } };
});

vi.mock('../../../src/db', () => ({ default: mockDb.client }));

const { sendInvitation } = vi.hoisted(() => ({ sendInvitation: vi.fn() }));

vi.mock('../../../src/services/email/resend-service', () => ({
  ResendService: { sendInvitation },
}));

import { requireAdmin } from '../../../src/middleware/auth/require-admin';
import { AccessPolicyService } from '../../../src/services/auth/access-policy-service';
import { RosterService } from '../../../src/services/auth/roster-service';
import {
  administratorMinimumFor,
  assertAdministratorMinimum,
} from '../../../src/services/auth/administrator-guards';
import { ACCESS_MODES, type AccessMode } from '../../../src/services/auth/authorization';

const ADMIN = {
  id: 'u1',
  email: 'admin@williamtemple.org',
  role: 'ADMINISTRATOR',
  accessState: 'ALLOWED',
};
const SECOND_ADMIN = {
  id: 'u2',
  email: 'second@williamtemple.org',
  role: 'ADMINISTRATOR',
  accessState: 'ALLOWED',
};
const STAFF = {
  id: 'u3',
  email: 'staff@williamtemple.org',
  role: 'STAFF',
  accessState: 'ALLOWED',
};

const ACTOR = { userId: ADMIN.id, label: ADMIN.email };

beforeEach(() => {
  mockDb.reset([ADMIN, SECOND_ADMIN, STAFF]);
  sendInvitation.mockReset();
  sendInvitation.mockResolvedValue(undefined);
});

describe('requireAdmin', () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const header = req.headers['x-test-auth'];
      if (typeof header === 'string') {
        req.auth = JSON.parse(header);
      }
      next();
    });
    app.use(requireAdmin);
    app.get('/', (_req, res) => res.json({ ok: true }));
    return app;
  };

  it('allows an administrator through', async () => {
    const response = await request(buildApp())
      .get('/')
      .set('x-test-auth', JSON.stringify({ userId: 'u1', email: ADMIN.email, role: 'ADMINISTRATOR', accessState: 'ALLOWED' }));

    expect(response.status).toBe(200);
  });

  it('refuses staff with 403', async () => {
    const response = await request(buildApp())
      .get('/')
      .set('x-test-auth', JSON.stringify({ userId: 'u3', email: STAFF.email, role: 'STAFF', accessState: 'ALLOWED' }));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ADMIN_REQUIRED');
  });

  it('refuses a request with no authenticated identity at all', async () => {
    // The legacy Basic Auth middleware calls next() without setting req.auth
    // under the development bypass. Treating that as permissive would be a
    // production-shaped hole opened by a development convenience.
    const response = await request(buildApp()).get('/');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });
});

describe('administrator minimum', () => {
  it('requires one administrator in Domain mode and two in Allowlist mode', () => {
    expect(administratorMinimumFor('DOMAIN')).toBe(1);
    expect(administratorMinimumFor('ALLOWLIST')).toBe(2);
  });

  it('permits the last-but-one demotion in Domain mode', () => {
    expect(() => assertAdministratorMinimum(1, 'DOMAIN')).not.toThrow();
  });

  it('refuses to leave Domain mode with no administrator', () => {
    expect(() => assertAdministratorMinimum(0, 'DOMAIN')).toThrow(
      /no administrator/i
    );
  });

  it('refuses to leave Allowlist mode with a single administrator', () => {
    expect(() => assertAdministratorMinimum(1, 'ALLOWLIST')).toThrow(
      /needs two|requires two/i
    );
  });
});

describe('sign-in gate', () => {
  it('admits an organization address in Domain mode', async () => {
    await expect(
      AccessPolicyService.assertMayAuthenticate('anyone@williamtemple.org')
    ).resolves.toBeUndefined();
  });

  it('refuses an outside address in Domain mode', async () => {
    await expect(
      AccessPolicyService.assertMayAuthenticate('stranger@example.com')
    ).rejects.toThrow(/limited to authorized staff/i);
  });

  it('refuses a revoked account in Domain mode', async () => {
    mockDb.reset([{ ...STAFF, accessState: 'REVOKED' }, ADMIN, SECOND_ADMIN]);

    // Revocation must bite even in Domain mode, otherwise removing a departed
    // staff member does nothing: findOrCreateUser would recreate the row.
    await expect(
      AccessPolicyService.assertMayAuthenticate(STAFF.email)
    ).rejects.toThrow(/limited to authorized staff/i);
  });

  it('admits a roster member in Allowlist mode', async () => {
    mockDb.reset([ADMIN, SECOND_ADMIN, STAFF], 'ALLOWLIST');

    await expect(
      AccessPolicyService.assertMayAuthenticate(STAFF.email)
    ).resolves.toBeUndefined();
  });

  it('refuses an organization address that is not on the roster in Allowlist mode', async () => {
    mockDb.reset([ADMIN, SECOND_ADMIN], 'ALLOWLIST');

    await expect(
      AccessPolicyService.assertMayAuthenticate('unlisted@williamtemple.org')
    ).rejects.toThrow(/limited to authorized staff/i);
  });

  it('includes the configured contact address in the refusal', async () => {
    await expect(
      AccessPolicyService.assertMayAuthenticate('stranger@example.com')
    ).rejects.toThrow(/technology@williamtemple\.org/);
  });

  it('only permits user creation on verify in Domain mode', async () => {
    await expect(AccessPolicyService.mayCreateUserOnVerify()).resolves.toBe(true);

    mockDb.reset([ADMIN, SECOND_ADMIN], 'ALLOWLIST');
    await expect(AccessPolicyService.mayCreateUserOnVerify()).resolves.toBe(false);
  });
});

describe('enabling Allowlist mode', () => {
  it('is refused when only one administrator could sign in', async () => {
    mockDb.reset([ADMIN, STAFF]);

    await expect(
      AccessPolicyService.update({ mode: 'ALLOWLIST' }, ACTOR)
    ).rejects.toThrow(/needs two|requires two/i);

    expect(mockDb.state.policy.mode).toBe('DOMAIN');
  });

  it('is refused when the acting administrator is not on the roster', async () => {
    mockDb.reset([ADMIN, SECOND_ADMIN]);

    await expect(
      AccessPolicyService.update(
        { mode: 'ALLOWLIST' },
        { userId: 'ghost', label: 'ghost@williamtemple.org' }
      )
    ).rejects.toThrow(/would lock you out/i);
  });

  it('succeeds with two eligible administrators, and is audited', async () => {
    await AccessPolicyService.update({ mode: 'ALLOWLIST' }, ACTOR);

    expect(mockDb.state.policy.mode).toBe('ALLOWLIST');
    expect(mockDb.state.audit).toHaveLength(1);
    expect(mockDb.state.audit[0]).toMatchObject({
      action: 'ACCESS_POLICY_UPDATED',
      actorLabel: ADMIN.email,
    });
  });

  it('rejects an over-long denial message before touching the policy', async () => {
    await expect(
      AccessPolicyService.update({ deniedMessage: 'x'.repeat(241) }, ACTOR)
    ).rejects.toThrow(/240 characters or fewer/);
  });

  it('rejects a malformed contact address', async () => {
    await expect(
      AccessPolicyService.update({ contactEmail: 'not-an-address' }, ACTOR)
    ).rejects.toThrow(/valid contact email/i);
  });
});

describe('roster guards', () => {
  it('demotes an administrator while another remains', async () => {
    const updated = await RosterService.setRole(SECOND_ADMIN.id, 'STAFF', ACTOR);

    expect(updated.role).toBe('STAFF');
    expect(mockDb.state.audit[0]).toMatchObject({
      action: 'ROLE_REVOKED',
      targetLabel: SECOND_ADMIN.email,
    });
  });

  it('refuses to demote the last administrator', async () => {
    mockDb.reset([ADMIN, STAFF]);

    await expect(
      RosterService.setRole(ADMIN.id, 'STAFF', ACTOR)
    ).rejects.toThrow(/no administrator/i);

    expect(mockDb.state.users.find(u => u.id === ADMIN.id)?.role).toBe(
      'ADMINISTRATOR'
    );
  });

  it('refuses to revoke access for the last administrator', async () => {
    mockDb.reset([ADMIN, STAFF]);

    await expect(
      RosterService.setAccess(ADMIN.id, 'REVOKED', ACTOR)
    ).rejects.toThrow(/no administrator/i);
  });

  it('refuses to delete the last administrator', async () => {
    mockDb.reset([ADMIN, STAFF]);

    await expect(RosterService.remove(ADMIN.id, ACTOR)).rejects.toThrow(
      /no administrator/i
    );
    expect(mockDb.state.users).toHaveLength(2);
  });

  it('applies the stricter Allowlist minimum to demotion', async () => {
    mockDb.reset([ADMIN, SECOND_ADMIN, STAFF], 'ALLOWLIST');

    await expect(
      RosterService.setRole(SECOND_ADMIN.id, 'STAFF', ACTOR)
    ).rejects.toThrow(/needs two|requires two/i);
  });

  it('does not count a revoked administrator toward the minimum', async () => {
    mockDb.reset([ADMIN, { ...SECOND_ADMIN, accessState: 'REVOKED' }, STAFF]);

    // SECOND_ADMIN holds the role but cannot sign in, so demoting ADMIN would
    // leave nobody able to administer FEED.
    await expect(
      RosterService.setRole(ADMIN.id, 'STAFF', ACTOR)
    ).rejects.toThrow(/no administrator/i);
  });

  it('records an audit entry for a revocation', async () => {
    await RosterService.setAccess(STAFF.id, 'REVOKED', ACTOR);

    expect(mockDb.state.audit[0]).toMatchObject({
      action: 'ACCESS_REVOKED',
      targetLabel: STAFF.email,
      actorLabel: ADMIN.email,
    });
  });
});

describe('invitations', () => {
  it('adds a Staff row and sends a tokenless invitation', async () => {
    const result = await RosterService.invite('newhire@williamtemple.org', ACTOR);

    expect(result.user.role).toBe('STAFF');
    expect(result.user.invitedBy).toBe(ADMIN.email);
    expect(result.invitationEmailSent).toBe(true);
    expect(sendInvitation).toHaveBeenCalledWith('newhire@williamtemple.org');
    expect(mockDb.state.audit[0]).toMatchObject({ action: 'USER_INVITED' });
  });

  it('never invites at Administrator level', async () => {
    const result = await RosterService.invite('newhire@williamtemple.org', ACTOR);

    // New joiners always require an explicit promotion.
    expect(result.user.role).toBe('STAFF');
  });

  it('refuses an address outside the organization domain', async () => {
    await expect(
      RosterService.invite('someone@example.com', ACTOR)
    ).rejects.toThrow(/organization email address/i);
  });

  it('refuses to invite someone already on the roster', async () => {
    await expect(RosterService.invite(STAFF.email, ACTOR)).rejects.toThrow(
      /already on the roster/i
    );
  });

  it('points at restore rather than re-invite for a revoked account', async () => {
    mockDb.reset([ADMIN, SECOND_ADMIN, { ...STAFF, accessState: 'REVOKED' }]);

    await expect(RosterService.invite(STAFF.email, ACTOR)).rejects.toThrow(
      /Restore their access/i
    );
  });

  it('keeps the roster row when the invitation email fails', async () => {
    sendInvitation.mockRejectedValue(new Error('Resend unavailable'));

    const result = await RosterService.invite('newhire@williamtemple.org', ACTOR);

    // The invite succeeded; only the notification failed. Discarding the row
    // would make the administrator redo work for a transient mail problem.
    expect(result.invitationEmailSent).toBe(false);
    expect(mockDb.state.users.some(u => u.email === 'newhire@williamtemple.org')).toBe(
      true
    );
  });
});

describe('the two-administrator refusal explains itself (ISSUES.md #60)', () => {
  const messageFor = (remaining: number, mode: AccessMode): string => {
    try {
      assertAdministratorMinimum(remaining, mode);
      return '';
    } catch (error) {
      return (error as Error).message;
    }
  };

  it('names the rule, the reason, and a way forward', () => {
    // ASK: actionable, specific, kind. A refusal that only says "no" leaves an
    // administrator guessing whether FEED is broken or protecting them.
    const message = messageFor(1, ACCESS_MODES.ALLOWLIST);

    expect(message).toMatch(/administrator/i);
    expect(message).toMatch(/requires two/i);
    // Both ways out, so the administrator is never left with only "no".
    expect(message).toMatch(/Promote another administrator/i);
    expect(message).toMatch(/switch to Domain mode/i);
  });

  it('stays short enough to survive the toast layer', () => {
    // It did not: at 251 characters the frontend's developer-artifact guard
    // treated it as a dump and replaced the whole thing with "An unexpected
    // error occurred. Please try again." The cap now exempts coded errors, and
    // this keeps the message inside it regardless.
    // Comfortably inside the toast guard now, not merely under it.
    expect(messageFor(1, ACCESS_MODES.ALLOWLIST).length).toBeLessThanOrEqual(160);
    expect(messageFor(0, ACCESS_MODES.DOMAIN).length).toBeLessThanOrEqual(160);
  });

  it('carries a code, which is what marks it as curated prose', () => {
    try {
      assertAdministratorMinimum(1, ACCESS_MODES.ALLOWLIST);
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as { code?: string }).code).toBe('ALLOWLIST_ADMINISTRATOR_MINIMUM');
      expect((error as { statusCode?: number }).statusCode).toBe(409);
    }
  });

  it('still refuses the last administrator in Domain mode', () => {
    const message = messageFor(0, ACCESS_MODES.DOMAIN);
    expect(message).toMatch(/no administrator/i);
    expect(message).toMatch(/Promote another user/i);
  });
});
