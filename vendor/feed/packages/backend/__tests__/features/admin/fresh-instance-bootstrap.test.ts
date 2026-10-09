// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

/**
 * Who becomes Administrator on an instance nobody has set up yet.
 *
 * `docs/auth/administrator-authorization.md` and the admin-page implementation
 * plan both carry the same table — empty `User` table, first verified user
 * becomes Administrator — and the code did not implement it. Every first
 * sign-in landed as Staff, which is invisible on any instance that already has
 * a roster and total on the one kind that does not: a new Pi during disaster
 * recovery, where the operator finds a Staff account and no route into Data
 * Management. Found by rehearsing that recovery in a container, not by
 * reasoning about it.
 *
 * The trigger implemented here is narrower than the design's, by choice: an
 * empty roster AND no encryption key. Granting authority to whoever arrives
 * first is the most dangerous act available in this codebase, and one signal
 * of "untouched" is one failure away from being wrong.
 */

let workdir: string;
let databasePath: string;
let sqlite: (sql: string) => string;

const freshDatabase = () => {
  const path = join(workdir, `db-${Math.random().toString(36).slice(2)}.db`);
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: join(__dirname, '../../..'),
    env: { ...process.env, DATABASE_URL: `file:${path}` },
    stdio: 'pipe',
  });
  return path;
};

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), 'feed-bootstrap-'));
  databasePath = freshDatabase();
  sqlite = (sql: string) =>
    execFileSync('sqlite3', [databasePath, sql], { encoding: 'utf8' }).trim();
  process.env.DATABASE_URL = `file:${databasePath}`;
}, 120_000);

afterAll(() => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
});

/** Reaches the private creator the verification flow uses. */
const signInFor = async (email: string) => {
  const { VerificationService } = await import('../../../src/services/auth/verification-service');
  return (VerificationService as unknown as {
    findOrCreateUser: (email: string) => Promise<{ id: string; role: string }>;
  }).findOrCreateUser(email);
};

describe('the first sign-in on an untouched instance', () => {
  test('becomes Administrator', async () => {
    expect(sqlite('SELECT COUNT(*) FROM User;')).toBe('0');
    expect(sqlite('SELECT COUNT(*) FROM EncryptionKey;')).toBe('0');

    const user = await signInFor('first@williamtemple.org');

    expect(user.role).toBe('ADMINISTRATOR');
  }, 30_000);

  test('the grant is recorded, because an escalation without a trail is a mystery', () => {
    expect(sqlite("SELECT COUNT(*) FROM AdminAuditLog WHERE action = 'ROLE_GRANTED';")).toBe('1');
    expect(sqlite('SELECT detail FROM AdminAuditLog LIMIT 1;')).toContain('fresh-instance bootstrap');
  });

  test('the second person to arrive is Staff', async () => {
    const user = await signInFor('second@williamtemple.org');
    expect(user.role).toBe('STAFF');
    // And exactly one administrator exists, not two.
    expect(sqlite("SELECT COUNT(*) FROM User WHERE role = 'ADMINISTRATOR';")).toBe('1');
  }, 30_000);
});

describe('the narrow trigger', () => {
  test('an instance with an encryption key does not hand out Administrator', async () => {
    // The roster is empty, so the design's single signal would fire here.
    // Somebody has already begun setting this instance up, which is enough
    // reason not to give the next arrival authority over it.
    const second = freshDatabase();
    execFileSync('sqlite3', [second,
      "INSERT INTO EncryptionKey (id, keyId, algorithm, keyValue, purpose, isActive, updatedAt) "
      + "VALUES ('k1', 'primary', 'aes-256-gcm', 'x', 'api_encryption', 1, datetime('now'));",
    ]);

    process.env.DATABASE_URL = `file:${second}`;
    // A fresh module registry, so the client binds to the second database.
    // The `?bootstrap-key-present` suffix is vitest's cache-buster: it makes
    // the loader treat this as a distinct specifier and re-evaluate the
    // module. No file of that name exists or should, so tsc can never resolve
    // it -- this is not drift and there is nothing to repair. The suppression
    // is self-policing: it fails if the import ever becomes resolvable.
    const { VerificationService } = await import(
      // @ts-expect-error -- vitest query-suffix import, unresolvable by design
      `../../../src/services/auth/verification-service?bootstrap-key-present`
    );
    const user = await (VerificationService as unknown as {
      findOrCreateUser: (email: string) => Promise<{ role: string }>;
    }).findOrCreateUser('arrives-later@williamtemple.org');

    expect(user.role).toBe('STAFF');
    process.env.DATABASE_URL = `file:${databasePath}`;
  }, 60_000);
});
