// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// Rewrites the built-in appearance's colour literals in
// packages/frontend/src/index.css as Tailwind v4 palette references, using the
// exact values the A/B sheet was reviewed with.
//
// Only the :root and .dark blocks are touched. The print blocks are left alone
// on purpose: printed output must not follow the app theme, so its colours are
// not part of the brand vocabulary. Tokens the generator reports as skipped --
// protected operational semiotics and third-party brand colours -- keep their
// authored values.
//
//   npx ts-node --transpile-only scripts/apply-tailwind-tokens.ts [--dry-run]

import { readFileSync, writeFileSync } from 'node:fs';

const CSS = '../frontend/src/index.css';
const CANDIDATES = '../frontend/src/styles/tailwind-ab-candidates.json';
const PICKS = 'scripts/palette-picks.json';
const dryRun = process.argv.includes('--dry-run');

/**
 * The chosen palette entry per token, from the generated candidate data.
 *
 * Read from the candidates rather than from a generated stylesheet: that sheet
 * existed only to A/B the migration against the authored appearance, and went
 * away once index.css held the references. The candidates are the durable
 * record — each row carries the entry the generator settled on, overrides
 * included.
 *
 * Rows keyed with a `#n` suffix address one literal inside a multi-value
 * declaration (a gradient stop, a shadow's second colour). Rewriting those
 * safely needs the whole declaration rebuilt, so they are left to the generator
 * and skipped here.
 */
const converted = (): Record<'light' | 'dark', Map<string, string>> => {
  const data = JSON.parse(readFileSync(CANDIDATES, 'utf8')) as {
    declarations: Record<'light' | 'dark', Record<string, string>>;
  };
  return {
    light: new Map(Object.entries(data.declarations.light)),
    dark: new Map(Object.entries(data.declarations.dark)),
  };
};

const table = converted();
const lines = readFileSync(CSS, 'utf8').split('\n');
let scope: 'light' | 'dark' | null = null;
let applied = 0;
const changes: string[] = [];

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  const open = line.match(/^  (:root|\.dark)[^{]*\{/);
  if (open) { scope = open[1] === ':root' ? 'light' : 'dark'; continue; }
  if (scope && /^  \}/.test(line)) { scope = null; continue; }
  if (!scope) continue;

  const d = line.match(/^(\s*)--([A-Za-z0-9-]+):\s*(.+?);(\s*)$/);
  if (!d) continue;
  const replacement = table[scope].get(d[2]);
  if (!replacement || replacement === d[3]) continue;

  lines[i] = `${d[1]}--${d[2]}: ${replacement};${d[4]}`;
  applied += 1;
  if (changes.length < 6) changes.push(`  ${scope} --${d[2]}\n      ${d[3]}\n   -> ${replacement}`);
}

console.log(`${dryRun ? 'Would rewrite' : 'Rewrote'} ${applied} declarations.`);
for (const c of changes) console.log(c);
if (applied > 0 && changes.length === 6) console.log('  …');

if (!dryRun) {
  writeFileSync(CSS, lines.join('\n'), 'utf8');
  // Consume the picks. Once written they are simply what index.css says, and
  // leaving them behind is what produced a calibration panel reporting a
  // permanent unresettable change: the generator reads index.css, so an applied
  // pick and the automatic match become the same value.
  const pending = JSON.parse(readFileSync(PICKS, 'utf8')) as Record<string, string>;
  if (Object.keys(pending).length > 0) {
    writeFileSync(PICKS, '{}\n', 'utf8');
    console.log(`Consumed ${Object.keys(pending).length} pick(s); regenerate candidates next.`);
  }
}
