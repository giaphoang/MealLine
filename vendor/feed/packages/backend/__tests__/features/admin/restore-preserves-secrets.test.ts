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
 * The recovery runbook's ordering claim, checked rather than asserted.
 *
 * `docs/data-management/backup-and-restore.md` tells an administrator to
 * initialize encryption **before** restoring, and explains why it survives:
 * `EncryptionKey` is excluded from the artifact, so it is not among the tables
 * the restore replaces, and the scratch database is a copy of the live one.
 * That reasoning is correct on inspection and was worth nothing until
 * something ran it — a runbook step justified only by reading the code is the
 * same kind of claim that produced ISSUES.md #81.
 *
 * It also pins the other half of the recovery state: a restored AI model
 * configuration arrives without its secret, so it must not arrive switched on.
 */

const AT = '2026-09-02T19:22:00.000Z';
/** Base64 of 32 bytes — the shape KeyManager.validateKeyValue requires. */
const KEY = Buffer.alloc(32, 7).toString('base64');

let workdir: string;
let databasePath: string;
let sqlite: (sql: string) => string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), 'feed-restore-secrets-'));
  databasePath = join(workdir, 'fresh.db');

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: join(__dirname, '../../..'),
    env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
    stdio: 'pipe',
  });

  sqlite = (sql: string) =>
    execFileSync('sqlite3', [databasePath, sql], { encoding: 'utf8' }).trim();

  process.env.DATABASE_URL = `file:${databasePath}`;
}, 60_000);

afterAll(() => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
});

describe('recovery ordering: encryption first, then restore', () => {
  test('the runbook sequence completes', async () => {
    // Step 3 of the runbook: the administrator establishes a key on the fresh
    // instance, before any data exists.
    const { KeyManager } = await import('../../../src/services/encryption/key-manager');
    await KeyManager.initializeKey(KEY, 'primary', 'api_encryption');
    expect(sqlite("SELECT COUNT(*) FROM EncryptionKey WHERE isActive = 1;")).toBe('1');

    // Step 4: restore. The artifact carries an administrator's model settings
    // and, by design, not the secret that makes them usable.
    const { RestoreService } = await import('../../../src/services/restore/restore-service');
    const outcome = await RestoreService.run({
      data: {
        AIConfiguration: [
          {
            id: 1, name: 'Google Gemini', type: 'apikey', value: '',
            serviceType: 'Google', model: 'gemini-2.5-flash',
            isActive: true, updatedAt: AT,
          },
        ],
        SystemPrompt: [
          { id: 1, name: 'Batch', promptType: 'BATCH_TRANSLATION', isActive: true, updatedAt: AT },
        ],
      } as unknown as Record<string, unknown[]>,
      units: ['configuration'],
      actor: 'restore-preserves-secrets.test',
      reason: 'Restoring a backup',
      exit: () => undefined,
    });

    expect(outcome.swapped).toBe(true);
  }, 60_000);

  test('the encryption key established before the restore survives it', () => {
    // If this ever fails, the runbook's step order is wrong and a recovering
    // administrator loses the key they just made, along with every API key
    // they encrypted with it afterwards.
    expect(sqlite('SELECT COUNT(*) FROM EncryptionKey;')).toBe('1');
    expect(sqlite("SELECT keyValue FROM EncryptionKey WHERE keyId = 'primary';")).toBe(KEY);
  });

  test('a restored model configuration arrives switched off', () => {
    // It has no key, so an active row would be a claim FEED cannot honour.
    // Step 7 of the runbook is what turns it on, after a key is entered.
    expect(sqlite("SELECT isActive FROM AIConfiguration WHERE type = 'apikey';")).toBe('0');
    expect(sqlite("SELECT encryptedApiKey IS NULL FROM AIConfiguration WHERE type = 'apikey';"))
      .toBe('1');
  });

  test('a restored prompt keeps the state it was backed up in', () => {
    // Prompts hold no credential, so their active state means something and
    // is restored as it was.
    expect(sqlite('SELECT isActive FROM SystemPrompt;')).toBe('1');
  });

  test('the rebuilt database has no broken references', () => {
    expect(sqlite('PRAGMA foreign_key_check;')).toBe('');
  });
});
