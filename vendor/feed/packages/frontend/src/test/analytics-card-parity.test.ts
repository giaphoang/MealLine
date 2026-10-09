// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * The screen and the printed report must say the same words.
 *
 * Reports are an export of Analytics, so a label that differs between them is a
 * defect by definition. The two live in separate packages with no shared
 * module, so the vocabulary is duplicated — and duplication without a check is
 * how this project has drifted every previous time (dates, table widths, audit
 * labels).
 *
 * Both sides are read from source and compared. Same technique as
 * `audit-action-labels.test.ts`, for the same reason: the frontend's path
 * aliases do not reach into the backend package.
 */

const readSource = (...parts: string[]) => readFileSync(join(__dirname, '..', ...parts), 'utf8');

const backend = () =>
  readFileSync(
    join(__dirname, '..', '..', '..', 'backend', 'src', 'services', 'reports', 'analytics-cards.ts'),
    'utf8'
  );

/** Pulls `KEY: 'Value'` pairs out of a named `Record` literal. */
const parseLabelMap = (source: string, declaration: RegExp): Record<string, string> => {
  const match = declaration.exec(source);
  if (!match) throw new Error(`label map not found — has it been renamed?\n${declaration}`);
  const out: Record<string, string> = {};
  for (const entry of match[1].matchAll(/^\s*'?([A-Za-z_][\w-]*)'?:\s*'([^']*)'/gm)) {
    out[entry[1]] = entry[2];
  }
  return out;
};

const screenSource = () => readSource('components', 'analytics', 'index.tsx');

describe('analytics card parity: screen vs printed report', () => {
  it('reads a non-empty map from both sides', () => {
    // Guards the guard. A regex that quietly matched nothing would make every
    // comparison below vacuously true.
    const screen = parseLabelMap(screenSource(), /const acquisitionLabels[^{]*\{([\s\S]*?)\n\};/);
    const report = parseLabelMap(backend(), /export const ACQUISITION_LABELS[^{]*\{([\s\S]*?)\n\};/);

    expect(Object.keys(screen).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(report).length).toBeGreaterThanOrEqual(4);
  });

  it('acquisition class labels match', () => {
    const screen = parseLabelMap(screenSource(), /const acquisitionLabels[^{]*\{([\s\S]*?)\n\};/);
    const report = parseLabelMap(backend(), /export const ACQUISITION_LABELS[^{]*\{([\s\S]*?)\n\};/);

    expect(
      report,
      'Analytics and the printed report disagree on acquisition class wording. ' +
        'Update ACQUISITION_LABELS in backend analytics-cards.ts to match ' +
        'acquisitionLabels in analytics/index.tsx.'
    ).toEqual(screen);
  });

  it('procurement channel labels match', () => {
    const screen = parseLabelMap(screenSource(), /const channelLabels[^{]*\{([\s\S]*?)\n\};/);
    const report = parseLabelMap(backend(), /export const CHANNEL_LABELS[^{]*\{([\s\S]*?)\n\};/);

    expect(
      report,
      'Analytics and the printed report disagree on channel wording. ' +
        'Update CHANNEL_LABELS in backend analytics-cards.ts to match ' +
        'channelLabels in analytics/index.tsx.'
    ).toEqual(screen);
  });

  it('both sides convert weight the same way', () => {
    // Hundredths of a pound on the wire. A report in the wrong unit is off by
    // 100x and looks plausible, which is the dangerous kind of wrong.
    expect(screenSource()).toContain('const toPounds = (hundredths: number) => hundredths / 100;');
    expect(backend()).toContain('toPounds = (hundredths: number): number => hundredths / 100;');
  });
});
