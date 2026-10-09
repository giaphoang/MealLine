// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exportWthTrackingWorkbook } from '../src/services/service/wth-tracking-exporter';

const run = async () => {
  const [, , sourceArgument, destinationArgument] = process.argv;
  if (!sourceArgument) {
    throw new Error('Usage: npm run export:wth-tracking -- <Tracking.xlsx> [tracking.csv]');
  }
  const sourcePath = resolve(sourceArgument);
  const destinationPath = resolve(destinationArgument ?? 'wth-service-tracking-v1.csv');
  const result = await exportWthTrackingWorkbook(await readFile(sourcePath));
  await writeFile(destinationPath, result.csv, { encoding: 'utf8', mode: 0o600 });
  console.log(JSON.stringify({ output: destinationPath, ...result.summary }, null, 2));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'WTH Tracking export failed.');
  process.exitCode = 1;
});
