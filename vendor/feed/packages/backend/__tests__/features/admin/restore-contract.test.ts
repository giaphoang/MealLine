// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

import {
  EXCLUDED_TABLES,
  INCLUDED_TABLES,
  RESTORE_CLEARED_TABLES,
  RESTORE_NULLED_REFERENCES,
} from '../../../src/services/backup/table-contract';
import { RESTORE_UNITS, closeSelection } from '../../../src/services/restore/restore-units';

/**
 * The restore contract, checked against the schema rather than against itself.
 *
 * `restore-units.ts` claims each unit is "closed under foreign keys". That
 * claim was written by hand, in TypeScript, about a graph that lives in
 * Prisma — and nothing compared the two. It drifted in both directions at
 * once: an `inventory -> languages` edge with no foreign key behind it, and
 * two real foreign keys (`Translation.documentId`,
 * `FormattingChoice.documentId`) with no edge in front of them. The second
 * kind is not theoretical. Restoring a production artifact onto a fresh
 * instance fails on it, which is the one thing a backup exists to do.
 *
 * These tests are the comparison nobody was doing. They read the same
 * schema Prisma generates migrations from, so a foreign key added tomorrow
 * either satisfies the contract or fails the build.
 */

interface ForeignKey {
  child: string;
  parent: string;
  column: string;
}

/**
 * Every relation field in schema.prisma that owns a foreign key.
 *
 * Verified against `PRAGMA foreign_key_list` over the live development
 * database: both produce the same 53 edges.
 */
const foreignKeys = (): ForeignKey[] => {
  const schema = readFileSync(
    join(__dirname, '../../../prisma/schema.prisma'),
    'utf8'
  );
  const edges: ForeignKey[] = [];
  let model: string | null = null;

  for (const line of schema.split('\n')) {
    const modelMatch = /^model\s+(\w+)/.exec(line);
    if (modelMatch) model = modelMatch[1];
    if (!model || !line.includes('references:')) continue;

    const relation = /^\s*(\w+)\s+(\w+)(\[\])?\??\s+@relation\((.*)\)/.exec(line);
    if (!relation) continue;
    const fields = /fields:\s*\[([^\]]*)\]/.exec(relation[4]);
    if (!fields) continue;

    for (const column of fields[1].split(',').map(f => f.trim()).filter(Boolean)) {
      edges.push({ child: model, parent: relation[2], column });
    }
  }
  return edges;
};

const FKS = foreignKeys();

const tablesOf = (unitIds: readonly string[]): Set<string> => {
  const set = new Set<string>();
  for (const id of unitIds) {
    RESTORE_UNITS.find(u => u.id === id)!.tables.forEach(t => set.add(t));
  }
  return set;
};

/** True when restore deliberately blanks this reference instead of resolving it. */
const isNulled = (fk: ForeignKey): boolean =>
  RESTORE_NULLED_REFERENCES[fk.child]?.columns.includes(fk.column) ?? false;

describe('the foreign-key graph is readable', () => {
  test('the schema parser finds the edges the database enforces', () => {
    // A silent parse failure would make every assertion below vacuously pass.
    expect(FKS.length).toBeGreaterThan(40);
    expect(FKS).toContainEqual({ child: 'FoodItem', parent: 'Category', column: 'categoryId' });
    expect(FKS).toContainEqual({ child: 'Translation', parent: 'Document', column: 'documentId' });
  });
});

describe('every unit can satisfy its own outbound references', () => {
  test.each(RESTORE_UNITS.map(u => u.id))(
    "'%s' has no reference it cannot resolve",
    unitId => {
      const unit = RESTORE_UNITS.find(u => u.id === unitId)!;
      const reachable = tablesOf(closeSelection([unit.id]).units);

      const unresolved = FKS.filter(fk =>
        unit.tables.includes(fk.child)
        && !reachable.has(fk.parent)
        && !isNulled(fk)
      ).map(fk => {
        const where = EXCLUDED_TABLES[fk.parent]
          ? `'${fk.parent}' is excluded from every artifact — register the column in RESTORE_NULLED_REFERENCES`
          : `add the unit owning '${fk.parent}' to '${unitId}'.requires`;
        return `${fk.child}.${fk.column} -> ${fk.parent}: ${where}`;
      });

      expect(unresolved).toEqual([]);
    }
  );
});

describe('replacing a unit cannot be blocked by rows it does not own', () => {
  test.each(RESTORE_UNITS.map(u => u.id))(
    "deleting '%s' is not restricted by an unreplaced child",
    unitId => {
      const unit = RESTORE_UNITS.find(u => u.id === unitId)!;
      const replaced = tablesOf(closeSelection([unit.id]).units);
      const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');

      const blocking = FKS.filter(fk => {
        if (!unit.tables.includes(fk.parent)) return false;
        if (replaced.has(fk.child)) return false;
        if (fk.child in RESTORE_CLEARED_TABLES) return false;
        // Only a RESTRICT/NO ACTION edge can abort the delete. Prisma's
        // default is SetNull for an optional relation and Restrict for a
        // required one, so the required-ness is what matters when no
        // onDelete is written.
        const declaration = new RegExp(
          `^\\s*\\w+\\s+${fk.parent}(\\?)?\\s+@relation\\([^)]*${fk.column}[^)]*\\)`,
          'm'
        ).exec(schema);
        const optional = declaration?.[1] === '?';
        const explicit = /onDelete:\s*(\w+)/.exec(declaration?.[0] ?? '')?.[1];
        const action = explicit ?? (optional ? 'SetNull' : 'Restrict');
        return action === 'Restrict' || action === 'NoAction';
      }).map(fk => `${fk.child}.${fk.column} -> ${fk.parent} would abort the delete`);

      expect(blocking).toEqual([]);
    }
  );
});

describe('every declared dependency is a real one', () => {
  test('no `requires` edge exists without a foreign key behind it', () => {
    const spurious: string[] = [];
    for (const unit of RESTORE_UNITS) {
      for (const required of unit.requires) {
        const target = RESTORE_UNITS.find(u => u.id === required)!;
        const backed = FKS.some(fk =>
          unit.tables.includes(fk.child) && target.tables.includes(fk.parent)
        );
        if (!backed) {
          spurious.push(
            `'${unit.id}' requires '${required}', but no foreign key runs between them. `
            + 'A semantic association belongs in the dialog copy, not in the dependency graph: '
            + 'it drags one unit\'s failures onto another.'
          );
        }
      }
    }
    expect(spurious).toEqual([]);
  });
});

describe('the units and the backup contract agree', () => {
  test('every table a unit restores is carried by the artifact', () => {
    // `new Set(INCLUDED_TABLES)` infers the literal union, so `.has()` refuses
    // the plain strings the units carry. The check is membership, not identity.
    const included = new Set<string>(INCLUDED_TABLES);
    const missing = RESTORE_UNITS.flatMap(u =>
      u.tables.filter(t => !included.has(t)).map(t => `${u.id} restores '${t}', which the backup does not carry`)
    );
    expect(missing).toEqual([]);
  });

  test('every nulled reference names a column that exists and a parent that is excluded', () => {
    for (const [child, rule] of Object.entries(RESTORE_NULLED_REFERENCES)) {
      for (const column of rule.columns) {
        expect(
          FKS.some(fk => fk.child === child && fk.column === column && fk.parent === rule.parent),
          `${child}.${column} -> ${rule.parent} is registered but is not a foreign key`
        ).toBe(true);
      }
      expect(
        EXCLUDED_TABLES[rule.parent],
        `'${rule.parent}' is carried by the artifact, so ${child} should resolve it rather than null it`
      ).toBeDefined();
    }
  });
});
