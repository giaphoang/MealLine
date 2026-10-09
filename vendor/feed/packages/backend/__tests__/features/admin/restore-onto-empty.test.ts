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
 * Restore onto an empty database — the case the feature exists for, and the
 * one nothing had ever run.
 *
 * Every other restore test, and every restore anyone had performed, ran
 * against a database that already held the rows being replaced. That hides
 * the entire class of fault this file exists to catch: a restored row whose
 * parent is absent resolves fine when the destination happens to be the
 * instance the backup came from, and aborts the whole operation anywhere
 * else. "Anywhere else" is what disaster recovery means.
 *
 * The fixture is modelled on a real production snapshot, where 112 of 2,319
 * translations carried a `documentId` against 2 documents the artifact does
 * not carry. No production values are used — only that shape, which is the
 * part that mattered and the part a development database could never have
 * shown, because every such column there is null.
 */

const BACKUP_TAKEN_AT = '2026-09-02T19:22:00.000Z';

/** A dangling parent id: a document that existed on the source instance. */
const ABSENT_DOCUMENT_ID = 9001;

const artifact = () => ({
  Language: [
    { id: 1, name: 'English', isEnabled: true, sortOrder: 0, updatedAt: BACKUP_TAKEN_AT },
    { id: 2, name: 'Spanish', isEnabled: true, sortOrder: 1, updatedAt: BACKUP_TAKEN_AT },
  ],
  SystemPrompt: [
    { id: 7, name: 'Classification', promptType: 'CUSTOM_TRANSLATION', updatedAt: BACKUP_TAKEN_AT },
  ],
  Translation: [
    // Ordinary cached translation: no outbound references at all.
    {
      id: 1, originalText: 'Canned Goods', translatedText: 'Conservas',
      status: 'completed', language: 'Spanish', type: 'Category',
      updatedAt: BACKUP_TAKEN_AT,
    },
    // Made from an uploaded document. The document is storage, not database,
    // so it is not in the artifact and cannot be on a fresh instance.
    {
      id: 2, originalText: 'Please turn paper over', translatedText: 'Por favor, dé vuelta la hoja',
      status: 'completed', language: 'Spanish', type: 'Generated',
      documentId: ABSENT_DOCUMENT_ID, updatedAt: BACKUP_TAKEN_AT,
    },
    // References a system prompt, which the configuration unit does carry.
    {
      id: 3, originalText: 'Produce', translatedText: 'Productos frescos',
      status: 'completed', language: 'Spanish', type: 'Category',
      classificationPromptId: 7, updatedAt: BACKUP_TAKEN_AT,
    },
  ],
});

let workdir: string;
let databasePath: string;
let sqlite: (sql: string) => string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), 'feed-restore-empty-'));
  databasePath = join(workdir, 'fresh.db');

  // A fresh instance is migrations and nothing else — exactly what a new Pi
  // holds after `docker compose up` and before anyone signs in.
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

describe('restoring onto a fresh instance', () => {
  test('the destination really is empty before the restore', () => {
    expect(sqlite('SELECT COUNT(*) FROM Translation;')).toBe('0');
    expect(sqlite('SELECT COUNT(*) FROM Document;')).toBe('0');
  });

  test('a backup carrying document-bound translations restores cleanly', async () => {
    // Imported after DATABASE_URL points at the fresh file: the module builds
    // its Prisma client at import time.
    const { RestoreService } = await import('../../../src/services/restore/restore-service');

    const outcome = await RestoreService.run({
      data: artifact() as unknown as Record<string, unknown[]>,
      units: ['languages'],
      actor: 'restore-onto-empty.test',
      reason: 'Restoring a backup',
      // The real path exits so the supervisor restarts against the new file.
      exit: () => undefined,
    });

    expect(outcome.swapped).toBe(true);
    expect(outcome.rowsWritten.Translation).toBe(3);
    expect(outcome.rowsWritten.Language).toBe(2);
  }, 60_000);

  test('the rebuilt database has no broken references', () => {
    expect(sqlite('PRAGMA foreign_key_check;')).toBe('');
  });

  test('every translation survives, including the document-bound one', () => {
    expect(sqlite('SELECT COUNT(*) FROM Translation;')).toBe('3');
    expect(sqlite('SELECT translatedText FROM Translation WHERE id = 2;'))
      .toBe('Por favor, dé vuelta la hoja');
  });

  test('the unresolvable document reference is blanked, not the row dropped', () => {
    // The association is already meaningless — the file was never in the
    // artifact — so the reference goes and the translation stays.
    expect(sqlite('SELECT COUNT(*) FROM Translation WHERE documentId IS NOT NULL;')).toBe('0');
  });

  test('a reference the artifact CAN satisfy is preserved', () => {
    // `languages` requires `configuration`, so SystemPrompt comes too and
    // this reference resolves rather than being blanked with the other one.
    expect(sqlite('SELECT classificationPromptId FROM Translation WHERE id = 3;')).toBe('7');
    expect(sqlite('SELECT COUNT(*) FROM SystemPrompt;')).toBe('1');
  });
});
