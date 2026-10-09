// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  BACKUP_QUERY_ARGS,
  EXCLUDED_TABLES,
  INCLUDED_TABLES,
  REDACTED_COLUMNS,
  RESTORE_CLEARED_TABLES,
  TABLE_CONTRACT_VERSION,
} from '../../../src/services/backup/table-contract';
import { checksumOf } from '../../../src/services/backup/sanitized-backup';

/**
 * The exclusion contract, enforced mechanically.
 *
 * docs/data-management/backup-and-restore.md says the artifact "will exclude at
 * minimum" key material, provider secrets, and authentication records. A prose
 * list cannot enforce itself: the realistic failure is not somebody deciding to
 * export `EncryptionKey`, it is somebody adding a table months from now and a
 * blanket export quietly picking it up — or an intended table quietly never
 * appearing.
 *
 * So every model in the schema must be named in exactly one of the two lists.
 * Adding a model without classifying it fails here.
 */

const schema = readFileSync(
  join(__dirname, '../../../prisma/schema.prisma'),
  'utf8'
);

const modelsInSchema = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(
  match => match[1]
);

describe('sanitized backup table contract', () => {
  it('classifies every model in the schema', () => {
    const classified = new Set<string>([
      ...INCLUDED_TABLES,
      ...Object.keys(EXCLUDED_TABLES),
    ]);

    const unclassified = modelsInSchema.filter(model => !classified.has(model));

    expect(
      unclassified,
      `Unclassified models: ${unclassified.join(', ')}. Add each to INCLUDED_TABLES ` +
        'or to EXCLUDED_TABLES with the reason it is left out — a new table must ' +
        'not drift into or out of backups by default.'
    ).toEqual([]);
  });

  it('names nothing that the schema does not define', () => {
    const known = new Set(modelsInSchema);
    const stale = [...INCLUDED_TABLES, ...Object.keys(EXCLUDED_TABLES)].filter(
      table => !known.has(table)
    );

    expect(stale, `Contract names tables that no longer exist: ${stale.join(', ')}`).toEqual([]);
  });

  /**
   * Every foreign key declared in the schema, as (child model, parent model).
   *
   * Prisma writes the reference on the relation field, so the parent is that
   * field's type: `translation Translation? @relation(fields: [...], ...)`.
   */
  const foreignKeys = (): Array<{ child: string; parent: string }> => {
    const edges: Array<{ child: string; parent: string }> = [];
    for (const block of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
      const child = block[1];
      for (const line of block[2].split('\n')) {
        if (!line.includes('@relation(') || !line.includes('fields:')) continue;
        const field = line.trim().split(/\s+/);
        const parent = field[1]?.replace(/[?[\]]/g, '');
        if (parent) edges.push({ child, parent });
      }
    }
    return edges;
  };

  /**
   * ISSUES.md #73. Restore copies the live database and then deletes the
   * selected units, so an EXCLUDED table holding a foreign key into an INCLUDED
   * one survives the copy still pointing at rows about to be deleted. Foreign
   * keys are enforced on the scratch database, so that aborts the entire
   * restore — eight `UsageRecord` rows were enough, and the failure surfaced as
   * a generic "cannot delete this item" message during disaster recovery.
   *
   * A prose warning cannot enforce itself. Any new model that references
   * organization data must be classified here deliberately.
   */
  it('declares every excluded table that references an included one', () => {
    const included = new Set<string>(INCLUDED_TABLES);
    const undeclared = foreignKeys()
      .filter(edge => edge.child in EXCLUDED_TABLES && included.has(edge.parent))
      .filter(edge => !(edge.child in RESTORE_CLEARED_TABLES))
      .map(edge => `${edge.child} -> ${edge.parent}`);

    expect(
      [...new Set(undeclared)],
      'These excluded tables reference tables that restore replaces, and would abort a '
        + 'restore with a foreign key error. Add each to RESTORE_CLEARED_TABLES — but only '
        + 'if clearing its rows is genuinely safe; otherwise carry the table in the artifact '
        + 'or null the reference instead.'
    ).toEqual([]);
  });

  it('names the real parents of every table cleared on restore', () => {
    // A stale `references` list silently stops the clear from firing, which
    // brings the original failure straight back.
    const edges = foreignKeys();
    for (const [child, rule] of Object.entries(RESTORE_CLEARED_TABLES)) {
      expect(EXCLUDED_TABLES, `${child} is cleared on restore but is not excluded`)
        .toHaveProperty(child);
      const actual = new Set(
        edges.filter(edge => edge.child === child).map(edge => edge.parent)
      );
      for (const parent of rule.references) {
        expect(actual, `${child} does not actually reference ${parent}`).toContain(parent);
      }
    }
  });

  it('never includes a table in both lists', () => {
    const both = INCLUDED_TABLES.filter(table => table in EXCLUDED_TABLES);
    expect(both).toEqual([]);
  });

  it('redacts secrets from tables it exports rather than dropping the table', () => {
    // Excluding AIConfiguration entirely (as beta.6 did) protected two columns
    // by discarding an administrator's model, cost, and rate configuration.
    expect(INCLUDED_TABLES).toContain('AIConfiguration');
    expect(EXCLUDED_TABLES).not.toHaveProperty('AIConfiguration');
    expect(REDACTED_COLUMNS.AIConfiguration).toEqual(['encryptedApiKey', 'salt']);
  });

  it('names redactions only for tables it actually exports', () => {
    // A redaction on an excluded or non-existent table is dead configuration
    // that reads as protection.
    for (const table of Object.keys(REDACTED_COLUMNS)) {
      expect(INCLUDED_TABLES, `${table} is redacted but not exported`).toContain(table);
    }
  });

  it('has bumped the contract version for MealLine fulfilment', () => {
    // Readers key on this, so a shape change that does not bump it is a silent
    // incompatibility.
    expect(TABLE_CONTRACT_VERSION).toBe(14);
    for (const table of ['NourishIntake', 'NourishBasket', 'NourishVolunteer', 'NourishDelivery']) {
      expect(INCLUDED_TABLES).toContain(table);
    }
    expect(REDACTED_COLUMNS.NourishVolunteer).toEqual(['passwordHash']);
    expect(REDACTED_COLUMNS.NourishClient).toEqual(['phoneVerifiedAt']);
    expect(EXCLUDED_TABLES).toHaveProperty('NourishAgentReceipt');
  });

  it('keeps prepared Service imports outside the portable organization snapshot', () => {
    for (const table of [
      'ServiceImport',
      'ServiceClient',
      'ServicePerson',
      'ServiceEncounterRevision',
      'ServiceEncounterPerson',
      'ServiceClientProfileRevision',
      'ServiceClientProfileResponse',
      'ServicePersonProfileRevision',
      'ServicePersonProfileResponse',
      'ServiceQualityIssue',
      'ServiceQualityIssueDecision',
      'ServiceSourceResolution',
      'LottoQueueSessionRevision',
      'LottoQueueTicketObservation',
      'LottoQueueQualityIssue',
    ]) {
      expect(BACKUP_QUERY_ARGS).toHaveProperty(table);
    }
  });

  it('excludes secrets and authority while carrying a neutralized roster', () => {
    // Spelled out individually rather than as a loop: each of these is a
    // deliberate promise in backup-and-restore.md, and a failure should name
    // exactly which promise broke.
    expect(EXCLUDED_TABLES).toHaveProperty('EncryptionKey');
    expect(EXCLUDED_TABLES).toHaveProperty('VerificationToken');
    expect(EXCLUDED_TABLES).toHaveProperty('OtpFailure');
    expect(INCLUDED_TABLES).toContain('User');
    expect(REDACTED_COLUMNS.User).toEqual(['role']);
    // Authority configuration and security history remain destination-owned.
    expect(EXCLUDED_TABLES).toHaveProperty('AccessPolicy');
    expect(EXCLUDED_TABLES).toHaveProperty('AdminAuditLog');
    expect(EXCLUDED_TABLES).toHaveProperty('LottoQueueIntegrationConfig');
    expect(INCLUDED_TABLES).toContain('LottoQueueSyncRun');
  });

  it('gives a reason for every exclusion', () => {
    for (const [table, reason] of Object.entries(EXCLUDED_TABLES)) {
      expect(reason.length, `${table} has no reason recorded`).toBeGreaterThan(20);
    }
  });

  it('carries the organization data a pantry would need back', () => {
    for (const table of [
      'Category',
      'FoodItem',
      'Translation',
      'ShoppingListBuilderTemplate',
      'ProcurementImport',
      'ServiceEncounterRevision',
      'OperatingHoursRevision',
      'BrandConfiguration',
      'BrandAsset',
      'User',
      'LottoQueueSyncRun',
      'LottoQueueSessionRevision',
      'LottoQueueTicketObservation',
      'LottoQueueSessionResolution',
    ]) {
      expect(INCLUDED_TABLES).toContain(table);
    }
  });
});

describe('backup checksum', () => {
  it('is stable regardless of key order', () => {
    // Prisma does not guarantee column order across versions. If the checksum
    // depended on it, an unchanged database would produce a different digest
    // after an upgrade and the integrity check would be worthless.
    const a = { Category: [{ id: 1, name: 'Produce', sortOrder: 2 }] };
    const b = { Category: [{ sortOrder: 2, name: 'Produce', id: 1 }] };

    expect(checksumOf(a)).toBe(checksumOf(b));
  });

  it('changes when the data changes', () => {
    const before = { Category: [{ id: 1, name: 'Produce' }] };
    const after = { Category: [{ id: 1, name: 'Produce ' }] };

    expect(checksumOf(before)).not.toBe(checksumOf(after));
  });
});
