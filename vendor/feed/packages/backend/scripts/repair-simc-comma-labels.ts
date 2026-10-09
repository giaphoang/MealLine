// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

/**
 * Rejoins SIMC answer labels that an earlier import split on their own commas.
 *
 * SIMC joins multiple answers with a comma and has four category names that
 * contain one. Until `SIMC_LABELS_CONTAINING_COMMAS` was added to the adapter,
 * a naive split shredded them: "Hispanic, Latino, or Spanish" was stored as
 * three answers, and a race breakdown built on it reported "or Spanish" as a
 * race.
 *
 * The repair is deterministic rather than a guess. The fragments are adjacent
 * and in order inside one JSON array, because that is how the split produced
 * them, so rejoining is an exact inverse — there is no ambiguity about which
 * pieces belonged together.
 *
 * Re-importing the same export fixes this too, and supersedes these rows with
 * correctly parsed ones. This script exists for the case where re-importing is
 * not convenient: it touches only the affected arrays and leaves every other
 * value alone.
 *
 *   npx tsx scripts/repair-simc-comma-labels.ts --confirm
 *
 * Without --confirm it reports what it would change and writes nothing.
 */

import prisma from '../src/db';

/** Must stay in step with the adapter's list. */
const LABELS = [
  'I have a place to live today, but I am worried about losing it in the future',
  'No, never on active duty except for initial/basic training',
  'No, never served in the U.S. Armed Forces',
  'Hispanic, Latino, or Spanish',
];

/** The fragment sequence a naive comma split would have produced. */
const SPLITS = LABELS.map((label) => ({
  label,
  parts: label.split(',').map((part) => part.trim()),
}));

/** Rejoins any run of fragments that exactly matches a known label. */
const rejoin = (values: string[]): string[] | null => {
  let out = [...values];
  let changed = false;

  for (const { label, parts } of SPLITS) {
    for (;;) {
      const at = out.findIndex((_, index) =>
        parts.every((part, offset) => out[index + offset] === part));
      if (at === -1) break;
      out = [...out.slice(0, at), label, ...out.slice(at + parts.length)];
      changed = true;
    }
  }
  return changed ? out : null;
};

async function main() {
  const confirm = process.argv.includes('--confirm');
  let inspected = 0;
  let repaired = 0;

  for (const [table, model] of [
    ['ServiceClientProfileResponse', prisma.serviceClientProfileResponse],
    ['ServicePersonProfileResponse', prisma.servicePersonProfileResponse],
  ] as const) {
    const rows = await (model as { findMany: (args: unknown) => Promise<Array<{ id: number; dimension: string; values: unknown }>> })
      .findMany({ where: { responseStatus: 'provided' } });

    for (const row of rows) {
      inspected += 1;
      const values = Array.isArray(row.values) ? (row.values as string[]) : null;
      if (!values) continue;
      const fixed = rejoin(values);
      if (!fixed) continue;

      repaired += 1;
      console.log(`  ${table}#${row.id} ${row.dimension}`);
      console.log(`    ${JSON.stringify(values)}`);
      console.log(` -> ${JSON.stringify(fixed)}`);
      if (confirm) {
        await (model as { update: (args: unknown) => Promise<unknown> })
          .update({ where: { id: row.id }, data: { values: fixed } });
      }
    }
  }

  console.log(`\ninspected ${inspected.toLocaleString()} responses, ${repaired} need rejoining`);
  console.log(confirm ? 'written.' : 'dry run — pass --confirm to write.');
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
