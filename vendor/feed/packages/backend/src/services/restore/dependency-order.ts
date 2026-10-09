// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Prisma } from '@prisma/client';

/**
 * The order tables must be written in, derived from the foreign-key graph.
 *
 * Restore used to insert in `INCLUDED_TABLES` order and delete in the reverse
 * of it. That is a hand-maintained list whose purpose is to describe *what*
 * the artifact carries, and it was silently doing a second job it was never
 * checked against: describing what depends on what. Within a unit the two
 * happened to agree — `Category` is listed before `FoodItem`. Across units
 * they did not: `Translation` sits in the languages block and `SystemPrompt`
 * in the configuration block far below it, so a restore of both wrote every
 * translation before the prompt it referenced existed, and the whole
 * operation aborted on a foreign key.
 *
 * Deriving the order removes the coupling. `Prisma.dmmf` is the same
 * datamodel the client is generated from, so this cannot drift from the
 * schema the way a list in a file can, and adding a table to the contract no
 * longer requires anyone to work out where in the sequence it belongs.
 */

/** Each model mapped to the models it holds a foreign key into. */
const parentsByModel = (): Map<string, Set<string>> => {
  const parents = new Map<string, Set<string>>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const set = new Set<string>();
    for (const field of model.fields) {
      // `relationFromFields` is non-empty only on the side that owns the
      // foreign key columns, which is exactly the child side.
      if (field.relationFromFields?.length && field.type !== model.name) {
        set.add(field.type);
      }
    }
    parents.set(model.name, set);
  }
  return parents;
};

/**
 * Sort `tables` so every table follows the tables it references.
 *
 * Only references *within the given set* constrain the result: a parent that
 * is not being restored is not a dependency, it is either already present or
 * deliberately blanked (see RESTORE_NULLED_REFERENCES). Ties keep the input
 * order, so the sequence stays stable and reviewable rather than shifting
 * with the shape of the graph.
 */
export const dependencyOrder = (tables: readonly string[]): string[] => {
  const parents = parentsByModel();
  const pending = new Set(tables);
  const ordered: string[] = [];

  while (pending.size > 0) {
    let progressed = false;

    for (const table of tables) {
      if (!pending.has(table)) continue;
      const blocked = [...(parents.get(table) ?? [])].some(
        parent => parent !== table && pending.has(parent)
      );
      if (blocked) continue;

      ordered.push(table);
      pending.delete(table);
      progressed = true;
    }

    if (!progressed) {
      // A reference cycle among the selected tables. Nothing here can break
      // it, and refusing the restore over an ordering detail would be worse
      // than attempting it: the post-rebuild `foreign_key_check` is the
      // backstop, and it rejects the file rather than swapping it in.
      ordered.push(...tables.filter(table => pending.has(table)));
      break;
    }
  }

  return ordered;
};
