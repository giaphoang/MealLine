// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Type-check ratchet.
 *
 * The frontend carries a documented backlog of pre-existing TypeScript errors
 * (docs/TSC-DEBT.md). Fixing them all is a domain exercise, not a mechanical
 * one, so the realistic goal is that the number never grows: Option D in that
 * document. This script enforces exactly that and nothing more.
 *
 * It also removes the trap that made the count untrustworthy in the first
 * place. A bare `tsc --noEmit` from this package checks ZERO files and exits 0
 * regardless of real errors, because the root tsconfig.json is solution-style
 * (`"files": []` plus `references`). Anything measuring the debt must name
 * tsconfig.app.json explicitly, so this script does, and it is the only
 * invocation anyone should need to remember.
 *
 *   npm run typecheck          → report the current count
 *   npm run typecheck:ratchet  → fail if the count grew past the baseline
 *
 * Lowering the baseline is the point. When you fix errors, run with
 * --update to record the new, lower number.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const baselinePath = join(here, 'typecheck-baseline.json');

const run = () => {
  try {
    execFileSync(
      'npx',
      ['tsc', '--noEmit', '--project', 'tsconfig.app.json'],
      { cwd: join(here, '..'), encoding: 'utf8', stdio: 'pipe' }
    );
    return '';
  } catch (error) {
    // tsc exits non-zero when it reports errors; the output is what we want.
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
};

const output = run();
const errors = output.split('\n').filter(line => / error TS\d+: /.test(line));
const count = errors.length;

const shouldUpdate = process.argv.includes('--update');
const reportOnly = process.argv.includes('--report');

if (shouldUpdate) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ count, updated: new Date().toISOString().slice(0, 10) }, null, 2)}\n`
  );
  console.log(`Baseline updated to ${count}.`);
  process.exit(0);
}

if (reportOnly) {
  const byCode = {};
  for (const line of errors) {
    const code = / error (TS\d+): /.exec(line)?.[1] ?? 'unknown';
    byCode[code] = (byCode[code] ?? 0) + 1;
  }
  console.log(`${count} TypeScript errors\n`);
  for (const [code, n] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${code}`);
  }
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).count;

if (count > baseline) {
  console.error(
    `\n✗ TypeScript errors went up: ${baseline} → ${count} (+${count - baseline}).\n\n` +
      'This does not mean you must clear the whole backlog — only that this\n' +
      'change should not add to it. Fix the new errors, or if they are the\n' +
      'documented EnhancedDataTable ColumnDef / icon-variance classes, see\n' +
      'docs/TSC-DEBT.md before assuming they are unavoidable.\n'
  );
  process.exit(1);
}

if (count < baseline) {
  console.log(
    `✓ TypeScript errors went down: ${baseline} → ${count}.\n` +
      '  Record it:  npm run typecheck:ratchet -- --update'
  );
  process.exit(0);
}

console.log(`✓ TypeScript errors unchanged at ${count}.`);
