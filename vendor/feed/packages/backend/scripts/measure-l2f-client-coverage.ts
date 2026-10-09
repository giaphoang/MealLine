// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Measures whether per-year Link2Feed client exports cover more clients than
 * the single all-time export did.
 *
 * The all-time file was reviewed in August 2026 and not activated: 6,460 rows
 * against 9,596 stored Link2Feed clients, with 3,344 of ours below its lowest
 * id and therefore unreachable by it. If that was an artefact of how the export
 * was produced rather than a limit of the data, a set of per-year files should
 * reach back past that floor. This answers that, with numbers.
 *
 * Usage — the directory holds the exports and lives OUTSIDE this repository:
 *
 *   cd packages/backend
 *   npx tsx scripts/measure-l2f-client-coverage.ts <directory> [--baseline 4324]
 *
 * The repo root is not the runtime package — run it from `packages/backend`.
 *
 * `--baseline` is how many stored clients the all-time export matched (4,324),
 * so the report can state plainly whether the per-year set is an improvement.
 *
 * Reads only the `Client ID` column and never writes anything. No name, email,
 * phone, or address is read into memory, and nothing is copied into the repo.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

import prisma from '../src/db';
import { LINK2FEED_SOURCE } from '../src/services/service/adapters/link2feed-visits';
import { measureClientCoverage } from '../src/services/data-import/l2f-client-coverage';

const CLIENT_ID_HEADER = 'Client ID';

const readClientIds = (path: string): string[] => {
  const rows = parse(readFileSync(path), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as Array<Record<string, string>>;

  if (rows.length > 0 && !(CLIENT_ID_HEADER in rows[0])) {
    throw new Error(
      `${path} has no "${CLIENT_ID_HEADER}" column. Headers found: ` +
      `${Object.keys(rows[0]).slice(0, 8).join(', ')}…`,
    );
  }
  return rows.map((row) => String(row[CLIENT_ID_HEADER] ?? ''));
};

async function main() {
  const [directory, ...rest] = process.argv.slice(2);
  if (!directory) {
    console.error('Usage: npx tsx scripts/measure-l2f-client-coverage.ts <directory> [--baseline N]');
    process.exit(1);
  }

  const baselineFlag = rest.indexOf('--baseline');
  const baseline = baselineFlag >= 0 ? Number(rest[baselineFlag + 1]) : null;
  if (baseline !== null && !Number.isFinite(baseline)) {
    console.error('--baseline needs a number: how many stored clients the all-time export matched.');
    process.exit(1);
  }

  const csvNames = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .sort();
  if (csvNames.length === 0) {
    console.error(`No .csv files in ${directory}.`);
    process.exit(1);
  }

  const clients = await prisma.serviceClient.findMany({
    where: { source: LINK2FEED_SOURCE },
    select: { sourceClientId: true },
  });

  const report = measureClientCoverage(
    {
      storedClientIds: clients.map((client) => client.sourceClientId),
      files: csvNames.map((name) => ({
        label: name,
        clientIds: readClientIds(join(directory, name)),
      })),
    },
    baseline,
  );

  const pad = (value: string | number, width: number) => String(value).padStart(width);
  console.log(`\nLink2Feed clients stored in FEED: ${report.storedCount.toLocaleString()}\n`);
  console.log('  file                                    rows   matched  unmatched');
  for (const file of report.files) {
    console.log(
      `  ${file.label.padEnd(38).slice(0, 38)}${pad(file.rows, 6)}` +
      `${pad(file.matched, 10)}${pad(file.unmatched, 11)}`,
    );
  }
  console.log(
    `\n  combined (distinct)                   ${pad(report.combined.rows, 6)}` +
    `${pad(report.combined.matched, 10)}${pad(report.combined.unmatched, 11)}`,
  );
  console.log(`\n  Coverage of stored clients: ${report.combined.coveragePercent}%`);
  console.log(
    `  Stored clients no file mentions: ${report.missing.count.toLocaleString()} ` +
    `(${report.missing.belowLowestExportedId.toLocaleString()} below the lowest exported id)`,
  );
  if (report.improvesOnBaseline !== null) {
    console.log(
      `\n  Against the all-time export's ${baseline?.toLocaleString()} matched: ` +
      `${report.improvesOnBaseline ? 'BETTER' : 'no improvement'} ` +
      `(${report.combined.matched.toLocaleString()} matched).`,
    );
  }
  console.log(
    '\n  Unmatched rows are clients with a Link2Feed profile that FEED has no\n' +
    '  visit for. A client export offers a date range back to 2017, but William\n' +
    '  Temple House adopted Link2Feed in October 2020, so an early start date\n' +
    '  does NOT mean the file reaches further back than the visits do — both\n' +
    '  records begin at adoption. Registration without a recorded visit is the\n' +
    '  likelier explanation; confirm before reading it either way.\n\n' +
    '  Clients below the lowest exported id cannot appear in these files at\n' +
    '  all, however complete they are.\n',
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
